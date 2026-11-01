import SwiftUI
import UIKit
import UserNotifications

struct Apunte: Codable, Equatable { let u: String; let t: String; let n: Int }

struct Aviso: Identifiable, Equatable {
    let id = UUID()
    let texto: String
    var deshacer = false
}

struct Fiesta: Equatable {
    let id = UUID()
    let titulo: String
    let sub: String
    let emojis: [String]
    let n: Int
}

/// El estado de la mesa: conexión en directo con ntfy, cola sin conexión, deshacer y acciones.
@MainActor
final class Mesa: ObservableObject {
    let motor = Motor()
    let C: Constantes

    @Published private(set) var vista: Vista?
    @Published private(set) var conectado = false
    @Published var yo: String? {
        didSet { UserDefaults.standard.set(yo ?? "", forKey: "birras-yo"); refrescar() }
    }
    @Published private(set) var fotos: [String: UIImage] = [:]
    @Published private(set) var avisos: [Aviso] = []
    @Published var fiesta: Fiesta?
    @Published private(set) var pendientes = 0
    @Published private(set) var pila: [Apunte] = []
    @Published var verPerfil = false
    @Published var cambiandoSilla = false
    @Published var sonido: Bool { didSet { UserDefaults.standard.set(sonido, forKey: "birras-sonido"); Sonido.shared.activo = sonido } }
    @Published var islaActiva = false
    /// Hasta cuándo no molestar con la pantalla de «BEBE» (botón «Luego»)
    @Published var broncaHasta: Double = 0
    @Published var dianaVista: Double

    private var fotosTxt: [String: String] = [:]
    private var ultimoId: String?
    private var desfase: Double = 0
    private var ultSnap: Double = 0
    private var misEids = Set<String>()
    private var cola: [String] = []
    private var enviando = false
    private var tarea: Task<Void, Never>?
    private var reloj: Timer?
    private let arranque = Date().timeIntervalSince1970
    private var ultimaProgramada: Double = 0
    private var ultimoEstadoIsla: BirrasAtributos.ContentState?

    var ahora: Double { Date().timeIntervalSince1970 + desfase }

    init() {
        guard let c = motor.constantes() else { fatalError("No se ha podido cargar logica.js") }
        C = c
        let d = UserDefaults.standard
        let y = d.string(forKey: "birras-yo") ?? ""
        yo = y.isEmpty ? nil : y
        sonido = d.object(forKey: "birras-sonido") as? Bool ?? true
        dianaVista = d.double(forKey: "birras-diana")
        fotosTxt = d.dictionary(forKey: "birras-fotos") as? [String: String] ?? [:]
        cola = d.stringArray(forKey: "birras-cola") ?? []
        if let p = d.data(forKey: "birras-pila"), let l = try? JSONDecoder().decode([Apunte].self, from: p) { pila = l }
        Sonido.shared.activo = sonido
        decodificarFotos()
        islaActiva = Isla.shared.recuperar()
        reloj = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refrescar() }
        }
        arrancar()
        if !cola.isEmpty { vaciarCola() }
    }

    // MARK: - Consultas

    var jugadores: [Vista.Jugador] { vista?.jugadores ?? [] }
    func jugador(_ u: String) -> Vista.Jugador? { jugadores.first { $0.id == u } }
    func nombre(_ u: String) -> String { jugador(u)?.nombre ?? Birras.fijos.first(where: { $0.0 == u })?.1 ?? u }
    func indice(_ t: String) -> Int { C.orden.firstIndex(of: t) ?? 0 }
    var esAdmin: Bool { yo == C.admin }
    var necesitaSilla: Bool {
        guard let v = vista, v.listo else { return false }
        return cambiandoSilla || yo == nil || !(v.jugadores ?? []).contains { $0.id == yo }
    }

    // MARK: - Red

    func arrancar() {
        tarea?.cancel()
        tarea = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if await self.cargarInicial() { await self.escuchar() }
                self.conectado = false
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    /// Al volver a la app: si la conexión se cayó en segundo plano, se recarga todo.
    func alVolver() {
        refrescar()
        if !conectado { arrancar() }
        if !cola.isEmpty { vaciarCola() }
    }

    private func cargarInicial() async -> Bool {
        guard let url = URL(string: "\(Birras.ntfy)/\(Birras.topic)/json?poll=1&since=all") else { return false }
        var r = URLRequest(url: url)
        r.cachePolicy = .reloadIgnoringLocalCacheData; r.timeoutInterval = 20
        guard let (d, _) = try? await URLSession.shared.data(for: r), let txt = String(data: d, encoding: .utf8) else { return false }
        var objs: [[String: Any]] = []
        for linea in txt.split(separator: "\n") {
            if let o = try? JSONSerialization.jsonObject(with: Data(linea.utf8)) as? [String: Any] { objs.append(o) }
        }
        for m in objs where (m["event"] as? String) == "message" {
            ultimoId = m["id"] as? String
            guard let s = m["message"] as? String,
                  let dd = try? JSONSerialization.jsonObject(with: Data(s.utf8)) as? [String: Any] else { continue }
            if dd["k"] as? String == "foto" { _ = recibirFoto(dd) }
            if dd["k"] as? String == "snap", let t = m["time"] as? Double { ultSnap = max(ultSnap, t) }
        }
        guard let todo = try? JSONSerialization.data(withJSONObject: objs),
              let todoTxt = String(data: todo, encoding: .utf8),
              motor.cargar(mensajesJSON: todoTxt) else { return false }
        refrescar()
        return true
    }

    private func escuchar() async {
        guard let url = URL(string: "\(Birras.ntfy)/\(Birras.topic)/json?since=\(ultimoId ?? "all")") else { return }
        var r = URLRequest(url: url)
        r.timeoutInterval = 100   // ntfy manda un «keepalive» cada 45 s
        do {
            let (bytes, resp) = try await URLSession.shared.bytes(for: r)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return }
            conectado = true
            for try await linea in bytes.lines {
                if Task.isCancelled { return }
                procesar(linea)
            }
        } catch { }
    }

    private func procesar(_ linea: String) {
        guard let m = try? JSONSerialization.jsonObject(with: Data(linea.utf8)) as? [String: Any],
              let ev = m["event"] as? String else { return }
        if ev == "open" {
            conectado = true
            if let t = m["time"] as? Double { desfase = t - Date().timeIntervalSince1970 }
            return
        }
        guard ev == "message" else { return }
        ultimoId = m["id"] as? String
        guard let s = m["message"] as? String,
              let d = try? JSONSerialization.jsonObject(with: Data(s.utf8)) as? [String: Any],
              let k = d["k"] as? String else { return }
        let t = m["time"] as? Double ?? ahora
        let mio = misEids.contains(d["eid"] as? String ?? "-")
        if k == "foto" {
            if recibirFoto(d), let u = d["u"] as? String, d["img"] is String,
               (d["por"] as? String) != "servidor", !mio, t > arranque + desfase - 5 {
                avisar("📷  \(nombre(u)) estrena foto")
            }
            return
        }
        if k == "snap" { ultSnap = max(ultSnap, t) }
        let efectos = motor.aplicar(mensajeJSON: linea)
        refrescar()
        animar(efectos, mio: mio)
        if mio && k != "snap" && ahora - ultSnap > 7200 {
            let sn = motor.snap()
            if !sn.isEmpty { ultSnap = ahora; Task { _ = await enviar(sn) } }
        }
    }

    func refrescar() {
        vista = motor.vista(yo: yo, ahora: ahora)
        programarAviso()
        actualizarIsla()
    }

    // MARK: - Publicar (con cola si no hay cobertura)

    func publicar(_ d0: [String: Any]) {
        var d = d0
        let e = (d["eid"] as? String) ?? Birras.eid()
        d["eid"] = e; misEids.insert(e)
        guard let data = try? JSONSerialization.data(withJSONObject: d), let s = String(data: data, encoding: .utf8) else { return }
        cola.append(s); guardarCola()
        vaciarCola()
    }

    private func enviar(_ cuerpo: String) async -> Int {
        var r = URLRequest(url: Birras.urlTopic)
        r.httpMethod = "POST"; r.httpBody = Data(cuerpo.utf8); r.timeoutInterval = 15
        guard let (_, resp) = try? await URLSession.shared.data(for: r) else { return 0 }
        return (resp as? HTTPURLResponse)?.statusCode ?? 0
    }

    private func vaciarCola() {
        guard !enviando else { return }
        enviando = true
        Task {
            while let primero = cola.first {
                let r = await enviar(primero)
                if (200..<300).contains(r) || ((400..<500).contains(r) && r != 429) {
                    cola.removeFirst(); guardarCola(); continue
                }
                pendientes = cola.count
                if r == 429 { avisar("Vais muy rápido: se manda en unos segundos.") }
                try? await Task.sleep(nanoseconds: r == 429 ? 6_000_000_000 : 4_000_000_000)
            }
            pendientes = 0
            enviando = false
        }
    }

    private func guardarCola() { UserDefaults.standard.set(cola, forKey: "birras-cola"); pendientes = cola.count }
    private func guardarPila() {
        pila = Array(pila.suffix(30))
        if let d = try? JSONEncoder().encode(pila) { UserDefaults.standard.set(d, forKey: "birras-pila") }
    }

    // MARK: - Acciones

    func apuntar(_ u: String, _ t: String, _ n: Int, fix: Bool = false) {
        var d: [String: Any] = ["k": "ev", "u": u, "t": t, "n": n, "por": yo ?? u]
        if fix && n > 0 { d["fix"] = true }
        pila.append(Apunte(u: u, t: t, n: n)); guardarPila()
        publicar(d)
        Haptica.medio(); Sonido.shared.tocar(n > 0 ? .moneda : .pierde)
        if !fix && u == yo {
            avisar("\(C.tipo(t).ico)  \(n > 0 ? "Apuntado" : "Quitado"): \(C.tipo(t).un)", deshacer: true)
        }
    }

    func deshacer() {
        guard let ult = pila.popLast() else { return }
        guardarPila()
        if ult.n > 0, let j = jugador(ult.u), j.c[indice(ult.t)] == 0 { avisar("Eso ya estaba quitado."); return }
        publicar(["k": "ev", "u": ult.u, "t": ult.t, "n": -ult.n, "por": yo ?? ult.u, "fix": true, "deshacer": true])
        Haptica.medio(); Sonido.shared.tocar(.compra)
    }

    func tragaperras() -> [Int]? {
        guard let y = yo, let m = vista?.mio, m.fichas >= C.slotCoste else { return nil }
        let r = motor.tirarSlot()
        publicar(["k": "slot", "u": y, "r": r])
        return r
    }

    func ruleta(tipo: String, n: Int?, cant: Int) -> Int? {
        guard let y = yo else { return nil }
        let r = Int.random(in: 0...36)
        var ap: [String: Any] = ["tipo": tipo]
        if let n { ap["n"] = n }
        publicar(["k": "ruleta", "u": y, "r": r, "ap": ap, "cant": cant])
        return r
    }

    func dados(ap: String, cant: Int) -> [Int]? {
        guard let y = yo else { return nil }
        let r = [Int.random(in: 1...6), Int.random(in: 1...6)]
        publicar(["k": "dados", "u": y, "r": r, "ap": ap, "cant": cant])
        return r
    }

    func rasca() -> [Int]? {
        guard let y = yo, let m = vista?.mio, m.fichas >= C.rascaCoste else { return nil }
        let r = motor.tirarRasca()
        publicar(["k": "rasca", "u": y, "r": r])
        return r
    }

    func blackjack(cant: Int, j: [Int], c: [Int], doble: Bool) {
        guard let y = yo else { return }
        publicar(["k": "bj", "u": y, "cant": cant, "j": j, "c": c, "doble": doble])
    }

    func crash(cant: Int, x: Double, r: Double) {
        guard let y = yo else { return }
        publicar(["k": "crash", "u": y, "cant": cant, "x": x, "r": r])
    }

    func carrera(cant: Int, ap: Int) -> Int? {
        guard let y = yo else { return nil }
        let r = Int.random(in: 0..<C.caballos.count)
        publicar(["k": "carrera", "u": y, "cant": cant, "ap": ap, "r": r])
        return r
    }

    func porra(_ a: String, cant: Int) {
        guard let y = yo else { return }
        publicar(["k": "porra", "u": y, "a": a, "cant": cant])
        avisar("🔮  \(cant) fichas a que \(nombre(a)) bebe la siguiente")
        Sonido.shared.tocar(.compra); Haptica.medio()
    }

    func dobleONada() {
        guard let y = yo else { return }
        publicar(["k": "doble", "u": y, "gana": Double.random(in: 0..<1) < 0.47])
    }

    func powerUp(_ p: String, obj: String? = nil) {
        guard let y = yo else { return }
        var d: [String: Any] = ["k": "pw", "u": y, "p": p]
        if let obj { d["obj"] = obj }
        publicar(d); Sonido.shared.tocar(.compra); Haptica.medio()
    }

    func retar(_ a: String, cant: Int) {
        guard let y = yo else { return }
        publicar(["k": "reto", "op": "lanzar", "u": y, "a": a, "cant": cant, "rid": Birras.eid()])
        avisar("🤺  Reto lanzado a \(nombre(a)). Tiene 10 min para aceptar.")
        Sonido.shared.tocar(.compra); Haptica.medio()
    }

    func reto(_ op: String, _ rid: String) {
        guard let y = yo else { return }
        publicar(["k": "reto", "op": op, "u": y, "rid": rid])
        Haptica.medio(); Sonido.shared.tocar(op == "aceptar" ? .combo : .pierde)
    }

    func cambiarSinCerveza(_ u: String, _ v: Bool) {
        guard let y = yo else { return }
        publicar(["k": "pref", "u": u, "sinCerveza": v, "por": y])
        Haptica.medio()
    }

    func altaJugador(_ nombre: String) -> String? {
        let limpio = nombre.split(separator: " ").joined(separator: " ")
        let id = motor.idDe(limpio)
        if limpio.isEmpty || id.count < 2 { return "Escribe un nombre de al menos 2 letras." }
        if jugadores.contains(where: { $0.id == id }) { return "\(self.nombre(id)) ya está en la mesa." }
        publicar(["k": "jugador", "op": "alta", "nombre": limpio, "u": C.admin, "por": C.admin])
        Haptica.medio(); Sonido.shared.tocar(.compra)
        return nil
    }

    func bajaJugador(_ u: String) {
        publicar(["k": "jugador", "op": "baja", "id": u, "u": C.admin, "por": C.admin])
    }

    func sentarse(_ u: String) {
        yo = u; cambiandoSilla = false
        lanzarFiesta("Hola, \(nombre(u))", "hagan juego", ["🍺", "🪙"], 30)
        Sonido.shared.tocar(.compra); Haptica.medio()
        pedirPermisoAvisos()
    }

    // MARK: - Fotos de perfil (miniatura en el canal, grande en el servidor de casa)

    @discardableResult
    private func recibirFoto(_ d: [String: Any]) -> Bool {
        guard let u = d["u"] as? String else { return false }
        let antes = fotosTxt[u]
        if d["img"] is NSNull { fotosTxt[u] = nil }
        else if let s = d["img"] as? String, s.hasPrefix("data:image/jpeg;base64,"), s.count < 3900 { fotosTxt[u] = s }
        else { return false }
        if fotosTxt[u] == antes { return false }
        UserDefaults.standard.set(fotosTxt, forKey: "birras-fotos")
        decodificarFotos()
        return true
    }

    private func decodificarFotos() {
        var r: [String: UIImage] = [:]
        for (u, s) in fotosTxt {
            if let i = s.range(of: ","), let d = Data(base64Encoded: String(s[i.upperBound...])), let im = UIImage(data: d) { r[u] = im }
        }
        fotos = r
    }

    func ponerFoto(_ imagen: UIImage, para u: String) {
        for (px, q) in [(96, 0.72), (88, 0.6), (80, 0.5), (64, 0.45)] {
            guard let jpg = imagen.cuadrada(CGFloat(px)).jpegData(compressionQuality: q) else { continue }
            let s = "data:image/jpeg;base64," + jpg.base64EncodedString()
            if s.count < 3900 {
                recibirFoto(["u": u, "img": s])
                publicar(["k": "foto", "u": u, "img": s, "por": yo ?? u])
                break
            }
        }
        let grande = imagen.escalada(maxLado: 1080).jpegData(compressionQuality: 0.82)
        Task.detached {
            guard let grande, let url = URL(string: "\(Birras.api)/api/perfil/\(u)") else { return }
            var r = URLRequest(url: url)
            r.httpMethod = "PUT"; r.setValue("image/jpeg", forHTTPHeaderField: "Content-Type"); r.httpBody = grande
            _ = try? await URLSession.shared.data(for: r)
        }
        lanzarFiesta("📷", "nueva foto de \(nombre(u))", ["📷"], 12)
        Sonido.shared.tocar(.compra); Haptica.medio()
    }

    func quitarFoto(_ u: String) {
        recibirFoto(["u": u, "img": NSNull()])
        publicar(["k": "foto", "u": u, "img": NSNull(), "por": yo ?? u])
    }

    // MARK: - Avisos y animaciones

    func avisar(_ t: String, deshacer: Bool = false) {
        let a = Aviso(texto: t, deshacer: deshacer)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { avisos.append(a); if avisos.count > 3 { avisos.removeFirst() } }
        despues(3.7) { [weak self] in
            withAnimation(.easeOut(duration: 0.3)) { self?.avisos.removeAll { $0.id == a.id } }
        }
    }
    func despues(_ seg: Double, _ f: @escaping @MainActor () -> Void) {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seg * 1_000_000_000))
            f()
        }
    }
    func quitarAviso(_ a: Aviso) { withAnimation { avisos.removeAll { $0.id == a.id } } }

    func lanzarFiesta(_ titulo: String, _ sub: String, _ emojis: [String], _ n: Int) {
        fiesta = Fiesta(titulo: titulo, sub: sub, emojis: emojis, n: n)
    }

    private func animar(_ efectos: [Efecto], mio: Bool) {
        for e in efectos {
            let quien = nombre(e.u ?? "")
            switch e.k {
            case "bebida":
                let T = C.tipo(e.t ?? "cerveza")
                if mio { lanzarFiesta("+\(e.fichas ?? 0)", "\(T.ico) al bote", [T.ico, "🪙"], e.t == "cigarro" ? 10 : 26) }
                else { avisar("\(T.ico)  \(quien) ha sumado \(T.un) al bote"); Sonido.shared.tocar(.moneda); Haptica.suave() }
            case "quita", "corrige":
                if !mio { avisar("✏️  \(e.k == "quita" ? "−1" : "+1") \(C.tipo(e.t ?? "cerveza").nombre.lowercased()) a \(quien)") }
            case "combo":
                let n = min(e.n ?? 2, C.comboMax)
                if mio { despues(0.6) { self.lanzarFiesta("Combo x\(n)", n >= 5 ? "¡imparable!" : "sigue, sigue", ["🔥", "🍺"], 40); Sonido.shared.tocar(.combo); Haptica.medio() } }
                else if n >= 3 { avisar("🔥  \(quien) va en combo x\(n)") }
            case "clasico":
                if mio { avisar("🍺🚬  Combo clásico · +15") } else { avisar("🍺🚬  \(quien) hace el combo clásico") }
            case "ronda":
                lanzarFiesta("¡Ronda!", "\(e.n ?? 3) a la vez · +50 fichas", ["🍻", "🍺", "🪙"], 160); Sonido.shared.tocar(.jackpot); Haptica.fuerte()
            case "logro":
                despues(0.7) { self.lanzarFiesta("🏆 \((e.txt ?? "").lowercased())", quien, ["🏆", "🍺"], 100); Sonido.shared.tocar(.jackpot) }
            case "logroGrupo":
                despues(1) { self.lanzarFiesta("\(e.n ?? 0) birras", "el bote está on fire", ["🍺", "🔥", "🪙"], 200); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
            case "cero":
                if !mio { lanzarFiesta("¡CERO!", "\(quien) lo ha sacado: toda la mesa bebe", ["🟢", "🍺"], 60); Sonido.shared.tocar(.bronca); Haptica.fuerte() }
            case "ruleta", "dados", "rasca":
                let neto = e.k == "rasca" ? (e.fichas ?? 0) - C.rascaCoste : (e.neto ?? 0)
                if !mio && neto >= 100 { avisar("\(e.k == "ruleta" ? "🎡" : e.k == "dados" ? "🎲" : "🎟️")  \(quien) gana \(neto) fichas") }
            case "slot":
                break
            case "bj", "crash", "carrera":
                if !mio && (e.neto ?? 0) >= 100 { avisar("\(["bj": "🃏", "crash": "🚀", "carrera": "🏁"][e.k] ?? "🎰")  \(quien) gana \(e.neto ?? 0) fichas") }
                if !mio && e.k == "bj" && e.res == "blackjack" { avisar("🃏  ¡\(quien) saca BLACKJACK!") }
            case "porra":
                if e.op == "apuesta" && !mio { avisar("🔮  \(quien) apuesta \(e.cant ?? 0) a que \(nombre(e.a ?? "")) bebe la siguiente") }
                if e.op == "resuelve" {
                    if let g = e.ganan?.first(where: { $0.u == yo }) { lanzarFiesta("+\(g.fichas)", "porra acertada", ["🔮", "🪙"], 100); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
                    else if let p = e.pierden?.first(where: { $0.u == yo }) { avisar("🔮  Porra perdida: ha bebido \(quien). −\(p.fichas)") }
                    else if let g = e.ganan, !g.isEmpty { avisar("🔮  \(g.map { nombre($0.u) }.joined(separator: ", ")) acierta la porra") }
                }
            case "doble":
                let antes = e.antes ?? 0
                if mio {
                    if e.gana == true { lanzarFiesta("¡Doblado!", "\(antes) → \(antes * 2)", ["💰", "🪙"], 180); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
                    else { lanzarFiesta("💸 Arruinado", "adiós \(antes) fichas", ["💸"], 20); Sonido.shared.tocar(.pierde); Haptica.fuerte() }
                } else { avisar(e.gana == true ? "💰  \(quien) ha doblado \(antes) fichas" : "💸  \(quien) lo ha perdido todo") }
            case "pw":
                if e.p == "happy" { lanzarFiesta("Happy Hour", "fichas x2 · 15 min", ["⏰", "🍺"], 100); Sonido.shared.tocar(.jackpot) }
                else if e.p == "diana" { avisar("🎯  \(quien) apunta a \(nombre(e.obj ?? ""))") }
                else if let P = C.tienda.first(where: { $0.id == e.p }) { if mio { lanzarFiesta(P.ico, P.nombre, [P.ico], 20) } else { avisar("\(P.ico)  \(quien) activa \(P.nombre)") } }
            case "pref":
                if let u = e.u { avisar(jugador(u)?.principal == "cubata" ? "🥃  A \(nombre(u)) le cuentan los cubatas" : "🍺  \(nombre(u)) vuelve a la cerveza") }
            case "jugador":
                avisar(e.op == "alta" ? "🪑  \(nombre(e.id ?? "")) se sienta en la mesa" : "👋  Un jugador se ha levantado de la mesa")
            case "noche":
                lanzarFiesta("🌅 Noche cerrada", "bote a cero", ["🌅", "🍺"], 80); Sonido.shared.tocar(.jackpot)
                pila = []; guardarPila()
            case "reto":
                let de = nombre(e.de ?? ""), a = nombre(e.a ?? "")
                if e.op == "lanzar" && e.a == yo {
                    lanzarFiesta("🤺 Te retan", "\(de): otra en 10 min por \(e.cant ?? 0)", ["🤺"], 20); Sonido.shared.tocar(.bronca); Haptica.fuerte()
                } else if e.op == "lanzar" && !mio { avisar("🤺  \(de) reta a \(a) por \(e.cant ?? 0) fichas") }
                else if e.op == "aceptar" && e.de == yo { avisar("🤺  \(a) acepta tu reto. Corre el reloj."); Haptica.medio() }
                else if e.op == "gana" {
                    if e.u == yo { lanzarFiesta("+\((e.cant ?? 0) * 2)", "reto ganado", ["🤺", "🪙", "🏆"], 120); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
                    else { avisar("🤺  \(nombre(e.u ?? "")) gana el reto · +\((e.cant ?? 0) * 2)") }
                } else if (e.op == "rechazar" || e.op == "caduca") && e.de == yo {
                    avisar(e.op == "rechazar" ? "🏳️  \(a) se raja. Te devuelven las fichas." : "⌛  \(a) no ha contestado. Te devuelven las fichas.")
                }
            default: break
            }
        }
    }

    // MARK: - Avisos con la app cerrada (notificación local, sin servidor de push)

    func pedirPermisoAvisos() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    private func programarAviso() {
        guard let m = vista?.mio, let y = yo, (vista?.t0 ?? 0) > 0 else { return }
        let cuando = m.ultima + C.horaSeca
        guard cuando != ultimaProgramada else { return }
        ultimaProgramada = cuando
        let centro = UNUserNotificationCenter.current()
        centro.removePendingNotificationRequests(withIdentifiers: ["seco"])
        let falta = cuando - ahora
        guard falta > 5 else { return }
        let c = UNMutableNotificationContent()
        c.title = m.principal == "cubata" ? "🥃 Una hora sin cubata" : "🍺 Una hora sin cerveza"
        c.body = motor.insulto(y, seg: C.horaSeca + 1, semilla: Int(cuando))
        c.sound = .default
        c.interruptionLevel = .timeSensitive
        centro.add(UNNotificationRequest(identifier: "seco", content: c, trigger: UNTimeIntervalNotificationTrigger(timeInterval: falta, repeats: false)))
    }

    // MARK: - Isla Dinámica

    private func estadoIsla() -> BirrasAtributos.ContentState? {
        guard let v = vista, v.listo, let m = v.mio else { return nil }
        let lider = v.jugadores?.first
        return .init(cervezas: v.cervezas ?? 0, puntos: v.ptsTxt ?? "0", misPuntos: jugador(m.id)?.ptsTxt ?? "0", puesto: m.pos,
                     ultima: Date(timeIntervalSince1970: m.ultima - desfase), lider: (lider?.pts ?? 0) > 0 ? lider?.nombre ?? "—" : "—",
                     seco: m.seco, bebida: m.principal)
    }

    func alternarIsla() {
        if islaActiva { Isla.shared.terminar(); islaActiva = false; return }
        guard let e = estadoIsla(), let y = yo else { avisar("Elige primero quién eres."); return }
        if Isla.shared.empezar(e, jugador: nombre(y)) {
            islaActiva = true; ultimoEstadoIsla = e
            avisar("🏝️  El bote ya está en la Isla Dinámica")
        } else { avisar("Activa las Actividades en directo para Birras en Ajustes.") }
    }

    private func actualizarIsla() {
        guard islaActiva, let e = estadoIsla(), e != ultimoEstadoIsla else { return }
        ultimoEstadoIsla = e
        Isla.shared.actualizar(e)
    }
}

// MARK: - Imágenes

extension UIImage {
    func cuadrada(_ lado: CGFloat) -> UIImage {
        let m = min(size.width, size.height)
        let f = UIGraphicsImageRendererFormat(); f.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: lado, height: lado), format: f).image { _ in
            let k = lado / m
            draw(in: CGRect(x: -(size.width - m) / 2 * k, y: -(size.height - m) / 2 * k, width: size.width * k, height: size.height * k))
        }
    }
    func escalada(maxLado: CGFloat) -> UIImage {
        let k = min(1, maxLado / max(size.width, size.height))
        let f = UIGraphicsImageRendererFormat(); f.scale = 1
        let s = CGSize(width: (size.width * k).rounded(), height: (size.height * k).rounded())
        return UIGraphicsImageRenderer(size: s, format: f).image { _ in draw(in: CGRect(origin: .zero, size: s)) }
    }
}
