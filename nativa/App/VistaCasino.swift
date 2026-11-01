import SwiftUI

struct VistaCasino: View {
    @EnvironmentObject var mesa: Mesa
    @AppStorage("juego") private var juego = "slot"
    var body: some View {
        Pantalla(titulo: "Casino") {
            HStack {
                Text("Tus fichas").font(.system(size: 15, weight: .semibold)).foregroundStyle(Paleta.texto2)
                Spacer()
                Text("\(mesa.vista?.mio?.fichas ?? 0)").font(.system(size: 26, weight: .black, design: .rounded)).foregroundStyle(Paleta.oro)
                    .contentTransition(.numericText())
                Text("🪙")
            }
            .padding(.horizontal, 6)
            Picker("Juego", selection: $juego) {
                Text("🎰").tag("slot"); Text("🎡 Ruleta").tag("ruleta"); Text("🎲 Dados").tag("dados"); Text("🎟️ Rasca").tag("rasca")
            }
            .pickerStyle(.segmented)
            .onChange(of: juego) { _, _ in Haptica.suave() }
            Group {
                switch juego {
                case "ruleta": JuegoRuleta()
                case "dados": JuegoDados()
                case "rasca": JuegoRasca()
                default: JuegoSlot()
                }
            }
            .transition(.opacity)
            DobleONada()
            Tienda()
        }
    }
}

/// Fichas para apostar (ruleta y dados)
struct SelectorApuesta: View {
    @EnvironmentObject var mesa: Mesa
    @Binding var cant: Int
    var body: some View {
        let f = mesa.vista?.mio?.fichas ?? 0
        let ops = [5, 10, 25, 50, 100, 250].filter { $0 <= max(f, 5) }
        let colores: [Color] = [Color(hex: 0x2a6fd6), Paleta.fresa, Color(hex: 0x0f8a4f), Color(hex: 0x222222), Color(hex: 0x7b3dff), Paleta.ambar]
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(Array(ops.enumerated()), id: \.element) { i, x in
                    Button { cant = x; Haptica.suave(); Sonido.shared.tocar(.moneda) } label: {
                        Text("\(x)").font(.system(size: 15, weight: .black, design: .rounded)).foregroundStyle(.white)
                            .frame(width: 50, height: 50)
                            .background(Circle().fill(colores[i % colores.count]))
                            .overlay(Circle().strokeBorder(.white.opacity(0.85), style: StrokeStyle(lineWidth: 4, dash: [6, 5])).padding(3))
                            .overlay(Circle().strokeBorder(Paleta.oro, lineWidth: cant == x ? 3 : 0))
                            .scaleEffect(cant == x ? 1.1 : 1)
                    }
                    .buttonStyle(Pulsable())
                }
                if f >= mesa.C.apuestaMin {
                    Button { cant = f; Haptica.medio() } label: {
                        Text("Todo \(f)").font(.system(size: 14, weight: .heavy)).padding(.horizontal, 14).frame(height: 50)
                            .background(cant == f ? Paleta.oro : Color.white.opacity(0.14), in: Capsule())
                            .foregroundStyle(cant == f ? Color(hex: 0x2a1100) : Paleta.texto)
                    }
                    .buttonStyle(Pulsable())
                }
            }
            .padding(.vertical, 6).padding(.horizontal, 4)
        }
        .scrollIndicators(.hidden)
        .onAppear { if cant > f && f >= mesa.C.apuestaMin { cant = ops.last ?? 5 } }
    }
}

extension Mesa {
    func puedeApostar(_ cant: Int) -> Bool {
        guard yo != nil, let f = vista?.mio?.fichas else { cambiandoSilla = true; return false }
        if f < C.apuestaMin { avisar("Sin fichas no hay juego. Bebe algo para ganar más."); return false }
        if cant > f { avisar("Solo tienes \(f) fichas."); return false }
        return true
    }
}

struct BotonGrande: View {
    let texto: String
    var desactivado = false
    let accion: () -> Void
    var body: some View {
        Button(action: accion) {
            Text(texto).font(.system(size: 19, weight: .black)).frame(maxWidth: .infinity).padding(.vertical, 16)
                .background(LinearGradient(colors: [Color(hex: 0xffe27a), Paleta.oro, Paleta.ambar], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .foregroundStyle(Color(hex: 0x2a1100))
                .shadow(color: Paleta.ambar.opacity(0.4), radius: 12, y: 6)
                .opacity(desactivado ? 0.45 : 1)
        }
        .buttonStyle(Pulsable())
        .disabled(desactivado)
    }
}

// MARK: - Tragaperras

struct JuegoSlot: View {
    @EnvironmentObject var mesa: Mesa
    @State private var rodillos = [0, 2, 4]
    @State private var girando = false
    @State private var resultado = "Hoy es tu noche. Seguro."
    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 10) {
                ForEach(0..<3, id: \.self) { i in
                    Text(mesa.C.simbolos[safe: rodillos[i]] ?? "🍺").font(.system(size: 54))
                        .frame(maxWidth: .infinity).frame(height: 96)
                        .background(LinearGradient(colors: [Color(hex: 0xfff6e3), Color(hex: 0xe8d9bd)], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(LinearGradient(colors: [.black.opacity(0.3), .clear, .clear, .black.opacity(0.3)], startPoint: .top, endPoint: .bottom).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous)))
                        .contentTransition(.identity)
                }
            }
            .padding(12)
            .background(Color(hex: 0x3a0a1e), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Paleta.oro.opacity(0.7), lineWidth: 2))
            Text(resultado).font(.system(size: 17, weight: .bold)).foregroundStyle(Paleta.texto).multilineTextAlignment(.center)
            BotonGrande(texto: girando ? "Rodando…" : "Tirar de la palanca · \(mesa.C.slotCoste) fichas",
                        desactivado: girando || (mesa.vista?.mio?.fichas ?? 0) < mesa.C.slotCoste) { tirar() }
            Text("3 iguales +120 · 3 🍺 +200 y racha · 3 7️⃣ JACKPOT +500 · pareja +40 · 2 💀 chupito de castigo")
                .font(.system(size: 12)).foregroundStyle(Paleta.texto3).multilineTextAlignment(.center)
        }
        .padding(16).cristal(28)
    }

    private func tirar() {
        guard !girando, let r = mesa.tragaperras() else { return }
        girando = true; resultado = "Rodando…"
        Sonido.shared.tocar(.palanca); Haptica.suave()
        let n = mesa.C.simbolos.count
        Task { @MainActor in
            let inicio = Date()
            var parados = [false, false, false]
            while parados.contains(false) {
                let t = Date().timeIntervalSince(inicio)
                for i in 0..<3 where !parados[i] {
                    if t >= 1.2 + Double(i) * 0.45 { rodillos[i] = r[i]; parados[i] = true; Haptica.suave() }
                    else { rodillos[i] = Int.random(in: 0..<n) }
                }
                try? await Task.sleep(nanoseconds: 70_000_000)
            }
            girando = false
            guard let p = mesa.motor.premioSlot(r) else { return }
            resultado = p.txt
            if p.gordo == true && !p.castigo { mesa.lanzarFiesta(p.txt.components(separatedBy: " ").first ?? "", p.txt.components(separatedBy: " ").dropFirst().joined(separator: " "), ["🍺", "🪙", "7️⃣", "💰"], 160); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
            else if p.castigo { mesa.lanzarFiesta("💀", p.txt, ["💀"], 12); Sonido.shared.tocar(.bronca); Haptica.fuerte() }
            else if p.fichas > 0 { mesa.lanzarFiesta("+\(p.fichas)", "pareja", ["🪙"], 30); Sonido.shared.tocar(.combo) }
            else { Sonido.shared.tocar(.pierde) }
        }
    }
}

// MARK: - Ruleta europea

let ordenRuleta = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
let rojos: Set<Int> = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
func colorNumero(_ n: Int) -> Color { n == 0 ? Color(hex: 0x0f8a4f) : rojos.contains(n) ? Color(hex: 0xc8102e) : Color(hex: 0x141414) }

struct Rueda: View {
    var body: some View {
        Canvas { ctx, size in
            let R = min(size.width, size.height) / 2
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let n = ordenRuleta.count
            let a = 2 * Double.pi / Double(n)
            for (i, num) in ordenRuleta.enumerated() {
                let a0 = -Double.pi / 2 + Double(i) * a - a / 2
                var p = Path()
                p.move(to: c)
                p.addArc(center: c, radius: R - 4, startAngle: .radians(a0), endAngle: .radians(a0 + a), clockwise: false)
                p.closeSubpath()
                ctx.fill(p, with: .color(colorNumero(num)))
                ctx.stroke(p, with: .color(Color(hex: 0xffd778, alpha: 0.55)), lineWidth: 1)
                var t = ctx
                t.translateBy(x: c.x, y: c.y)
                t.rotate(by: .radians(a0 + a / 2))
                t.translateBy(x: R - R * 0.14, y: 0)
                t.rotate(by: .radians(Double.pi / 2))
                t.draw(Text("\(num)").font(.system(size: R * 0.085, weight: .bold)).foregroundColor(.white), at: .zero)
            }
            let centro = Path(ellipseIn: CGRect(x: c.x - R * 0.6, y: c.y - R * 0.6, width: R * 1.2, height: R * 1.2))
            ctx.fill(centro, with: .color(Color(hex: 0x5a3412)))
            let dorado = Path(ellipseIn: CGRect(x: c.x - R * 0.5, y: c.y - R * 0.5, width: R, height: R))
            ctx.fill(dorado, with: .radialGradient(Gradient(colors: [Color(hex: 0xe2b45a), Color(hex: 0x6b3d12)]), center: CGPoint(x: c.x - R * 0.15, y: c.y - R * 0.15), startRadius: 4, endRadius: R * 0.55))
            ctx.stroke(Path(ellipseIn: CGRect(x: c.x - R + 2, y: c.y - R + 2, width: 2 * R - 4, height: 2 * R - 4)), with: .color(Color(hex: 0xd9a23a)), lineWidth: 5)
        }
        .drawingGroup()
    }
}

struct JuegoRuleta: View {
    @EnvironmentObject var mesa: Mesa
    @AppStorage("apuesta") private var cant = 10
    @State private var tipo: String?
    @State private var numero: Int?
    @State private var giro = 0.0
    @State private var girando = false
    @State private var resultado = "Hagan juego."
    private let cols = Array(repeating: GridItem(.flexible(), spacing: 4), count: 6)

    var body: some View {
        VStack(spacing: 14) {
            ZStack(alignment: .top) {
                Rueda().frame(width: 260, height: 260).rotationEffect(.degrees(giro))
                Image(systemName: "arrowtriangle.down.fill").font(.system(size: 26)).foregroundStyle(Paleta.oro).shadow(radius: 4).offset(y: -12)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
            Text(resultado).font(.system(size: 17, weight: .bold)).foregroundStyle(Paleta.texto).multilineTextAlignment(.center)
            SelectorApuesta(cant: $cant)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                apuesta("rojo", "Rojo", Color(hex: 0xc8102e)); apuesta("negro", "Negro", Color(hex: 0x141414))
                apuesta("par", "Par", nil); apuesta("impar", "Impar", nil)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                apuesta("d1", "1–12", nil); apuesta("d2", "13–24", nil); apuesta("d3", "25–36", nil)
            }
            LazyVGrid(columns: cols, spacing: 4) {
                ForEach(0...36, id: \.self) { n in
                    Button { tipo = "n"; numero = n; Haptica.suave(); explicar() } label: {
                        Text("\(n)").font(.system(size: 14, weight: .heavy)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 34)
                            .background(colorNumero(n), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Paleta.oro, lineWidth: tipo == "n" && numero == n ? 3 : 0))
                    }
                    .buttonStyle(Pulsable())
                }
            }
            BotonGrande(texto: girando ? "No va más…" : "Girar", desactivado: girando) { girar() }
            Text("Color, par o impar pagan 1 a 1 · docena 2 a 1 · pleno 35 a 1 · si sale el 0, toda la mesa bebe")
                .font(.system(size: 12)).foregroundStyle(Paleta.texto3).multilineTextAlignment(.center)
        }
        .padding(16).cristal(28)
    }

    private func apuesta(_ t: String, _ txt: String, _ color: Color?) -> some View {
        Button { tipo = t; numero = nil; Haptica.suave(); explicar() } label: {
            Text(txt).font(.system(size: 15, weight: .heavy)).foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 11)
                .background(color ?? Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Paleta.oro, lineWidth: tipo == t ? 3 : 0))
        }
        .buttonStyle(Pulsable())
    }

    private func explicar() {
        guard let tipo, let r = mesa.motor.ruleta(0, tipo: tipo, n: numero) else { return }
        resultado = "Apuestas \(cant) a \(r.nombre)"
    }

    private func girar() {
        guard !girando else { return }
        guard let tipo else { mesa.avisar("Elige primero a qué apuestas."); return }
        guard mesa.puedeApostar(cant), let r = mesa.ruleta(tipo: tipo, n: numero, cant: cant) else { return }
        let apostado = cant, num = numero
        girando = true; resultado = "No va más…"
        Sonido.shared.tocar(.palanca); Haptica.medio()
        let i = Double(ordenRuleta.firstIndex(of: r) ?? 0), paso = 360.0 / 37
        let destino = giro + 360 * 5 + ((360 - i * paso) - giro.truncatingRemainder(dividingBy: 360) + 720).truncatingRemainder(dividingBy: 360)
        withAnimation(.timingCurve(0.12, 0.6, 0.1, 1, duration: 4.2)) { giro = destino }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_300_000_000)
            girando = false
            guard let res = mesa.motor.ruleta(r, tipo: tipo, n: num) else { return }
            let col = res.color == "rojo" ? "🔴" : res.color == "negro" ? "⚫" : "🟢"
            resultado = "\(col) \(r) · " + (res.gana ? "¡Ganas \(apostado * res.paga)!" : "Pierdes \(apostado)")
            if res.gana { mesa.lanzarFiesta("+\(apostado * res.paga)", "\(r) \(res.color ?? "")", ["🪙", "💰", "🎡"], tipo == "n" ? 220 : 60); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
            else { Sonido.shared.tocar(.pierde); Haptica.medio() }
            if r == 0 { mesa.despues(0.9) { mesa.lanzarFiesta("¡CERO!", "toda la mesa bebe", ["🟢", "🍺"], 60) } }
        }
    }
}

// MARK: - Dados

struct Dado: View {
    let n: Int
    var body: some View {
        let pips: [[Int]] = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]]
        let activos = pips[max(0, min(6, n))]
        Grid(horizontalSpacing: 8, verticalSpacing: 8) {
            ForEach(0..<3, id: \.self) { f in
                GridRow {
                    ForEach(0..<3, id: \.self) { c in
                        Circle().fill(activos.contains(f * 3 + c) ? Color(hex: 0x1a0610) : .clear).frame(width: 14, height: 14)
                    }
                }
            }
        }
        .frame(width: 84, height: 84)
        .background(LinearGradient(colors: [.white, Color(hex: 0xeadfcf)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.35), radius: 8, y: 5)
        .accessibilityLabel("Dado: \(n)")
    }
}

struct JuegoDados: View {
    @EnvironmentObject var mesa: Mesa
    @AppStorage("apuesta") private var cant = 10
    @State private var caras = [6, 1]
    @State private var rodando = false
    @State private var resultado = "¿Mayor o menor que 7?"
    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 24) {
                Dado(n: caras[0]).rotationEffect(.degrees(rodando ? Double.random(in: -25...25) : 0))
                Dado(n: caras[1]).rotationEffect(.degrees(rodando ? Double.random(in: -25...25) : 0))
            }
            .padding(.vertical, 10)
            Text(resultado).font(.system(size: 17, weight: .bold)).foregroundStyle(Paleta.texto).multilineTextAlignment(.center)
            SelectorApuesta(cant: $cant)
            HStack(spacing: 8) {
                boton("menor", "Menor que 7", "paga 1 a 1")
                boton("siete", "Siete", "paga 4 a 1")
                boton("mayor", "Mayor que 7", "paga 1 a 1")
            }
            Text("Si sacas dos unos (ojos de serpiente): chupito de castigo").font(.system(size: 12)).foregroundStyle(Paleta.texto3)
        }
        .padding(16).cristal(28)
    }

    private func boton(_ ap: String, _ t: String, _ sub: String) -> some View {
        Button { tirar(ap) } label: {
            VStack(spacing: 2) {
                Text(t).font(.system(size: 15, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.8)
                Text(sub).font(.system(size: 11.5)).foregroundStyle(Paleta.texto2)
            }
            .foregroundStyle(Paleta.texto).frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(ap == "siete" ? AnyShapeStyle(LinearGradient(colors: [Paleta.fresa, Paleta.ambar], startPoint: .topLeading, endPoint: .bottomTrailing)) : AnyShapeStyle(Color.white.opacity(0.14)), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(Pulsable())
        .disabled(rodando)
    }

    private func tirar(_ ap: String) {
        guard !rodando, mesa.puedeApostar(cant), let r = mesa.dados(ap: ap, cant: cant) else { return }
        let apostado = cant
        rodando = true; resultado = "Rodando…"
        Haptica.medio(); Sonido.shared.tocar(.palanca)
        Task { @MainActor in
            for _ in 0..<15 {
                withAnimation(.easeInOut(duration: 0.08)) { caras = [Int.random(in: 1...6), Int.random(in: 1...6)] }
                try? await Task.sleep(nanoseconds: 90_000_000)
            }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { caras = r; rodando = false }
            guard let res = mesa.motor.dados(r[0], r[1], ap: ap) else { return }
            let suma = r[0] + r[1]
            resultado = "\(r[0]) + \(r[1]) = \(suma) · " + (res.gana ? "¡ganas \(apostado * res.paga)!" : "pierdes \(apostado)")
            if res.gana { mesa.lanzarFiesta("+\(apostado * res.paga)", "suma \(suma)", ["🎲", "🪙"], ap == "siete" ? 160 : 50); Sonido.shared.tocar(ap == "siete" ? .jackpot : .combo); Haptica.fuerte() }
            else { Sonido.shared.tocar(.pierde) }
            if r == [1, 1] { mesa.despues(0.7) { mesa.lanzarFiesta("🐍", "ojos de serpiente: chupito", ["🐍"], 10) } }
        }
    }
}

// MARK: - Rasca y gana

struct JuegoRasca: View {
    @EnvironmentObject var mesa: Mesa
    @State private var carton: [Int]?
    @State private var abiertas: Set<Int> = []
    @State private var resultado = "Tres iguales y te llevas el premio."
    @State private var premiadas: Set<Int> = []
    private let cols = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)
    var body: some View {
        VStack(spacing: 14) {
            LazyVGrid(columns: cols, spacing: 10) {
                ForEach(0..<6, id: \.self) { k in
                    let abierta = abiertas.contains(k)
                    Button { rascar(k) } label: {
                        ZStack {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(abierta ? AnyShapeStyle(Color(hex: 0xfff6e3)) : AnyShapeStyle(LinearGradient(colors: [Color(hex: 0xd8d8d8), Color(hex: 0x9a9a9a), Color(hex: 0xe8e8e8)], startPoint: .topLeading, endPoint: .bottomTrailing)))
                            if abierta, let c = carton { Text(mesa.C.rascaSimbolos[safe: c[k]] ?? "?").font(.system(size: 42)) }
                            else { Text("?").font(.system(size: 30, weight: .black)).foregroundStyle(.white.opacity(0.7)) }
                        }
                        .frame(height: 86)
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Paleta.oro, lineWidth: premiadas.contains(k) ? 4 : 0))
                        .scaleEffect(abierta ? 1 : 0.96)
                        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: abierta)
                    }
                    .buttonStyle(Pulsable())
                    .disabled(carton == nil || abierta)
                }
            }
            Text(resultado).font(.system(size: 17, weight: .bold)).foregroundStyle(Paleta.texto).multilineTextAlignment(.center)
            HStack(spacing: 8) {
                BotonGrande(texto: "Comprar rasca · \(mesa.C.rascaCoste) fichas", desactivado: carton != nil && abiertas.count < 6) { comprar() }
                if carton != nil && abiertas.count < 6 {
                    Button("Rascar todo") {
                        for k in 0..<6 { mesa.despues(Double(k) * 0.14) { rascar(k) } }
                    }
                    .font(.system(size: 15, weight: .heavy)).padding(.horizontal, 14).padding(.vertical, 16)
                    .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous)).foregroundStyle(Paleta.texto)
                }
            }
            Text("💎 300 · 🌿 100 · 🥃 80 · 🍺 60 · 🍋 30 · tres 💀: chupito de castigo").font(.system(size: 12)).foregroundStyle(Paleta.texto3)
        }
        .padding(16).cristal(28)
    }

    private func comprar() {
        guard mesa.yo != nil else { mesa.cambiandoSilla = true; return }
        guard (mesa.vista?.mio?.fichas ?? 0) >= mesa.C.rascaCoste, let r = mesa.rasca() else { mesa.avisar("Te faltan fichas para un rasca."); return }
        carton = r; abiertas = []; premiadas = []
        resultado = "Rasca las seis casillas."
        Sonido.shared.tocar(.compra); Haptica.medio()
    }

    private func rascar(_ k: Int) {
        guard let c = carton, !abiertas.contains(k) else { return }
        abiertas.insert(k)
        Haptica.suave(); Sonido.shared.tocar(.moneda)
        guard abiertas.count == 6, let p = mesa.motor.premioRasca(c) else { return }
        resultado = p.txt
        if let s = p.simbolo { premiadas = Set((0..<6).filter { mesa.C.rascaSimbolos[safe: c[$0]] == s }) }
        if p.fichas > 0 { mesa.lanzarFiesta("+\(p.fichas)", "rasca y gana", ["🎟️", "🪙", p.simbolo ?? "💰"], p.fichas >= 100 ? 180 : 60); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
        else if p.castigo { mesa.lanzarFiesta("💀", "chupito de castigo", ["💀"], 12); Sonido.shared.tocar(.bronca) }
        else { Sonido.shared.tocar(.pierde) }
    }
}

// MARK: - Doble o nada y tienda

struct DobleONada: View {
    @EnvironmentObject var mesa: Mesa
    @State private var preguntar = false
    var body: some View {
        let f = mesa.vista?.mio?.fichas ?? 0
        VStack(alignment: .leading, spacing: 10) {
            Etiqueta(texto: "Doble o nada")
            Text(f >= 20 ? "Te juegas tus \(f) fichas. La casa gana el 53 % de las veces." : "Necesitas al menos 20 fichas para arruinarte.")
                .font(.system(size: 15)).foregroundStyle(Paleta.texto2)
            Button { preguntar = true; Haptica.medio() } label: {
                Text("💰  Doble o nada").font(.system(size: 17, weight: .heavy)).frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(LinearGradient(colors: [Paleta.fresa, Color(hex: 0x7b3dff)], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(.white).opacity(f >= 20 ? 1 : 0.45)
            }
            .buttonStyle(Pulsable())
            .disabled(f < 20)
        }
        .padding(16).cristal(26)
        .confirmationDialog("Doble o nada", isPresented: $preguntar, titleVisibility: .visible) {
            Button("Me la juego", role: .destructive) { mesa.dobleONada() }
            Button("Mejor no", role: .cancel) {}
        } message: { Text("Te juegas tus \(f) fichas. Si ganas, \(f * 2). Si pierdes, cero.") }
    }
}

struct Tienda: View {
    @EnvironmentObject var mesa: Mesa
    private let cols = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
    var body: some View {
        let f = mesa.vista?.mio?.fichas ?? 0
        VStack(alignment: .leading, spacing: 10) {
            Etiqueta(texto: "Power-ups").padding(.horizontal, 4)
            LazyVGrid(columns: cols, spacing: 10) {
                ForEach(mesa.C.tienda) { P in
                    if P.id == "diana" {
                        Menu {
                            ForEach(mesa.jugadores.filter { $0.id != mesa.yo }) { j in
                                Button(j.nombre) { mesa.powerUp("diana", obj: j.id) }
                            }
                        } label: { tarjeta(P, f) }
                        .disabled(f < P.coste)
                    } else {
                        Button { mesa.powerUp(P.id) } label: { tarjeta(P, f) }
                            .buttonStyle(Pulsable())
                            .disabled(f < P.coste)
                    }
                }
            }
        }
    }

    private func tarjeta(_ P: Constantes.PowerUp, _ f: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(P.ico).font(.system(size: 30))
            Text(P.nombre).font(.system(size: 16, weight: .heavy))
            Text(P.desc).font(.system(size: 12.5)).foregroundStyle(Paleta.texto2).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 2)
            Text("\(P.coste) fichas").font(.system(size: 13, weight: .heavy)).foregroundStyle(Paleta.oro)
        }
        .foregroundStyle(Paleta.texto)
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .padding(14)
        .cristal(22, interactivo: true)
        .opacity(f >= P.coste ? 1 : 0.5)
    }
}
