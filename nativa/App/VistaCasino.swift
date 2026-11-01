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
            SelectorJuego(juego: $juego)
            Group {
                switch juego {
                case "ruleta": JuegoRuleta()
                case "dados": JuegoDados()
                case "rasca": JuegoRasca()
                case "bj": JuegoBlackjack()
                case "crash": JuegoCrash()
                case "carrera": JuegoCarrera()
                case "porra": JuegoPorra()
                default: JuegoSlot()
                }
            }
            .transition(.opacity)
            DobleONada()
            Tienda()
        }
    }
}

struct SelectorJuego: View {
    @Binding var juego: String
    private let juegos: [(String, String, String)] = [("slot", "🎰", "Tragaperras"), ("ruleta", "🎡", "Ruleta"), ("dados", "🎲", "Dados"), ("rasca", "🎟️", "Rasca"),
                                                      ("bj", "🃏", "Blackjack"), ("crash", "🚀", "Crash"), ("carrera", "🏁", "Carrera"), ("porra", "🔮", "Porra")]
    private let cols = Array(repeating: GridItem(.flexible(), spacing: 4), count: 4)
    var body: some View {
        LazyVGrid(columns: cols, spacing: 4) {
            ForEach(juegos, id: \.0) { j in
                Button { withAnimation(.snappy) { juego = j.0 }; Haptica.suave() } label: {
                    VStack(spacing: 2) {
                        Text(j.1).font(.system(size: 22))
                        Text(j.2).font(.system(size: 11, weight: .bold)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(juego == j.0 ? Paleta.texto : Paleta.texto2)
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                    .background(juego == j.0 ? Color.white.opacity(0.22) : .clear, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(Pulsable())
            }
        }
        .padding(5)
        .cristal(24)
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


// MARK: - Blackjack

func totalBJ(_ cs: [Int]) -> Int {
    var t = 0, ases = 0
    for c in cs { let r = c % 13; t += r == 0 ? 11 : r >= 9 ? 10 : r + 1; if r == 0 { ases += 1 } }
    while t > 21 && ases > 0 { t -= 10; ases -= 1 }
    return t
}

struct Carta: View {
    let c: Int
    var oculta = false
    private let valores = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
    private let palos = ["♠", "♥", "♦", "♣"]
    var body: some View {
        let roja = c >= 13 && c < 39
        ZStack {
            if oculta {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: 0xa3104a), Color(hex: 0x5a0f2a)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(.white, lineWidth: 3))
                Text("🍺").font(.system(size: 26))
            } else {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(LinearGradient(colors: [.white, Color(hex: 0xefe9df)], startPoint: .top, endPoint: .bottom))
                VStack(alignment: .leading, spacing: 0) {
                    Text(valores[c % 13]).font(.system(size: 19, weight: .black))
                    Spacer()
                    Text(palos[c / 13]).font(.system(size: 30)).frame(maxWidth: .infinity)
                    Spacer()
                }
                .padding(6)
                .foregroundStyle(roja ? Color(hex: 0xc8102e) : Color(hex: 0x1a0610))
            }
        }
        .frame(width: 60, height: 88)
        .shadow(color: .black.opacity(0.4), radius: 6, y: 4)
        .transition(.asymmetric(insertion: .offset(y: -40).combined(with: .opacity), removal: .opacity))
    }
}

struct JuegoBlackjack: View {
    @EnvironmentObject var mesa: Mesa
    @AppStorage("apuesta") private var cant = 10
    @State private var mazo: [Int] = []
    @State private var j: [Int] = []
    @State private var c: [Int] = []
    @State private var apostado = 0
    @State private var doble = false
    @State private var fin = true
    @State private var resultado = "Blackjack paga 3 a 2. La casa se planta en 17."

    var body: some View {
        VStack(spacing: 14) {
            mano("La casa", c, total: fin ? totalBJ(c) : (c.first.map { totalBJ([$0]) } ?? 0), ocultar: !fin)
            mano("Tú", j, total: totalBJ(j), ocultar: false)
            Text(resultado).font(.system(size: 17, weight: .bold)).foregroundStyle(Paleta.texto).multilineTextAlignment(.center)
            SelectorApuesta(cant: $cant)
            if fin {
                BotonGrande(texto: "Repartir · \(cant) fichas") { repartir() }
            } else {
                HStack(spacing: 8) {
                    accion("Pedir", "otra carta") { pedir() }
                    accion("Plantarse", "juega la casa", dorado: true) { terminar() }
                    accion("Doblar", "×2 y una carta") { doblar() }
                        .disabled(j.count != 2 || (mesa.vista?.mio?.fichas ?? 0) < apostado * 2)
                }
            }
        }
        .padding(16)
        .background(RadialGradient(colors: [Color(hex: 0x147846, alpha: 0.55), Color(hex: 0x05321e, alpha: 0.55)], center: .top, startRadius: 10, endRadius: 400), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .cristal(28)
    }

    private func mano(_ titulo: String, _ cs: [Int], total: Int, ocultar: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Etiqueta(texto: titulo)
                if !cs.isEmpty { Text("\(total)").font(.system(size: 14, weight: .heavy)).foregroundStyle(Paleta.oro) }
            }
            HStack(spacing: -14) {
                ForEach(Array(cs.enumerated()), id: \.element) { i, x in Carta(c: x, oculta: ocultar && i == 1) }
            }
            .frame(minHeight: 88, alignment: .leading)
            .animation(.spring(response: 0.35, dampingFraction: 0.7), value: cs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func accion(_ t: String, _ sub: String, dorado: Bool = false, _ f: @escaping () -> Void) -> some View {
        Button(action: f) {
            VStack(spacing: 2) {
                Text(t).font(.system(size: 16, weight: .heavy))
                Text(sub).font(.system(size: 11)).foregroundStyle(dorado ? Color(hex: 0x2a1100).opacity(0.7) : Paleta.texto2)
            }
            .foregroundStyle(dorado ? Color(hex: 0x2a1100) : Paleta.texto)
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(dorado ? AnyShapeStyle(LinearGradient(colors: [Paleta.oro, Paleta.ambar], startPoint: .top, endPoint: .bottom)) : AnyShapeStyle(Color.white.opacity(0.14)), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(Pulsable())
    }

    private func repartir() {
        guard mesa.puedeApostar(cant) else { return }
        var m = Array(0..<52); m.shuffle()
        mazo = m; apostado = cant; doble = false
        j = [mazo.removeLast(), mazo.removeLast()]
        c = [mazo.removeLast(), mazo.removeLast()]
        fin = false
        resultado = "Apuestas \(cant). ¿Pides o te plantas?"
        Sonido.shared.tocar(.compra); Haptica.suave()
        if totalBJ(j) == 21 || totalBJ(c) == 21 { mesa.despues(0.6) { terminar() } }
    }
    private func pedir() {
        guard !fin, let x = mazo.popLast() else { return }
        j.append(x); Haptica.suave(); Sonido.shared.tocar(.moneda)
        if totalBJ(j) >= 21 { mesa.despues(0.45) { terminar() } }
    }
    private func doblar() {
        guard !fin, j.count == 2, let x = mazo.popLast() else { return }
        doble = true; j.append(x); Haptica.medio(); Sonido.shared.tocar(.moneda)
        mesa.despues(0.5) { terminar() }
    }
    private func terminar() {
        guard !fin else { return }
        let tj = totalBJ(j), natural = j.count == 2 && tj == 21 && !doble
        if tj <= 21 && !natural { while totalBJ(c) < 17, let x = mazo.popLast() { c.append(x) } }
        fin = true
        mesa.blackjack(cant: apostado, j: j, c: c, doble: doble)
        guard let r = mesa.motor.blackjack(j, c, doble: doble) else { return }
        let m = doble ? 2 : 1
        let txt: String
        switch r.res {
        case "blackjack": txt = "¡BLACKJACK! +\(apostado * 3 / 2)"
        case "gana": txt = "¡Ganas \(apostado * m)!"
        case "empate": txt = "Empate: recuperas lo tuyo"
        case "pasa": txt = "Te pasas. −\(apostado * m)"
        default: txt = "La casa gana. −\(apostado * m)"
        }
        resultado = "\(r.tj) contra \(r.tc) · \(txt)"
        switch r.res {
        case "blackjack": mesa.lanzarFiesta("🃏 BLACKJACK", "+\(apostado * 3 / 2)", ["🃏", "🪙", "💰"], 160); Sonido.shared.tocar(.jackpot); Haptica.fuerte()
        case "gana": mesa.lanzarFiesta("+\(apostado * m)", "gana la mano", ["🪙", "🃏"], 60); Sonido.shared.tocar(.combo); Haptica.medio()
        case "empate": Sonido.shared.tocar(.compra)
        default: Sonido.shared.tocar(.pierde); Haptica.medio()
        }
    }
}

// MARK: - Crash

struct JuegoCrash: View {
    @EnvironmentObject var mesa: Mesa
    @Environment(\.scenePhase) private var fase
    @AppStorage("apuesta") private var cant = 10
    @State private var m = 1.0
    @State private var x = 0.0
    @State private var apostado = 0
    @State private var volando = false
    @State private var estado = 0   // 0 nada, 1 cobrado, 2 explotado
    @State private var resultado = "El multiplicador sube hasta que explota. Retírate antes."
    @State private var tarea: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Canvas { ctx, size in
                    let W = size.width, H = size.height
                    for i in 1..<5 { var p = Path(); p.move(to: CGPoint(x: 0, y: H * CGFloat(i) / 5)); p.addLine(to: CGPoint(x: W, y: H * CGFloat(i) / 5)); ctx.stroke(p, with: .color(.white.opacity(0.07))) }
                    let seg = log(max(1, m)) / 0.14, maxSeg = max(6, seg * 1.15), maxM = max(2, m * 1.2)
                    func px(_ s: Double) -> CGFloat { 14 + (W - 28) * CGFloat(s / maxSeg) }
                    func py(_ v: Double) -> CGFloat { H - 14 - (H - 28) * CGFloat((v - 1) / (maxM - 1)) }
                    var p = Path(); p.move(to: CGPoint(x: px(0), y: py(1)))
                    let pasos = 60
                    for k in 0...pasos { let s = seg * Double(k) / Double(pasos); p.addLine(to: CGPoint(x: px(s), y: py(exp(s * 0.14)))) }
                    ctx.stroke(p, with: .linearGradient(Gradient(colors: [Paleta.ambar, estado == 2 ? Paleta.mal : Paleta.fresa]), startPoint: CGPoint(x: 0, y: H), endPoint: CGPoint(x: W, y: 0)), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    ctx.draw(Text(estado == 2 ? "💥" : "🚀").font(.system(size: 30)), at: CGPoint(x: px(seg), y: py(m) - 4))
                }
                Text(estado == 2 ? "💥 x\(String(format: "%.2f", m))" : "x\(String(format: "%.2f", m))")
                    .font(.system(size: 52, weight: .black, design: .rounded)).monospacedDigit()
                    .foregroundStyle(estado == 2 ? Paleta.mal : estado == 1 ? Color(hex: 0x5ff5a0) : .white)
                    .shadow(color: .black.opacity(0.6), radius: 12)
            }
            .frame(height: 200)
            .background(LinearGradient(colors: [Color(hex: 0x14051f), Color(hex: 0x2a0b2e)], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            Text(resultado).font(.system(size: 16, weight: .bold)).foregroundStyle(Paleta.texto).multilineTextAlignment(.center)
            if !volando { SelectorApuesta(cant: $cant) }
            if volando {
                Button { terminar(retiro: m) } label: {
                    Text("💰 Retirarse · \(Int(Double(apostado) * m))").font(.system(size: 19, weight: .black)).frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(LinearGradient(colors: [Color(hex: 0x5ff5a0), Color(hex: 0x0f8a4f)], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .foregroundStyle(Color(hex: 0x032412))
                }
                .buttonStyle(Pulsable())
            } else {
                BotonGrande(texto: "🚀 Despegar · \(cant) fichas") { despegar() }
            }
        }
        .padding(16).cristal(28)
        .onChange(of: fase) { _, f in if f != .active && volando { terminar(retiro: 0) } }
        .onDisappear { if volando { terminar(retiro: 0) } }
    }

    private func despegar() {
        guard !volando, mesa.puedeApostar(cant) else { return }
        let u = Double.random(in: 0..<1)
        x = min(1000, max(1, (97 / (1 - u)).rounded(.down) / 100))   // 3 % para la casa
        apostado = cant; m = 1; estado = 0; volando = true
        resultado = "Apuestas \(cant). Retírate antes de que explote."
        Sonido.shared.tocar(.palanca); Haptica.medio()
        let inicio = Date()
        tarea = Task { @MainActor in
            while volando {
                let v = (exp(Date().timeIntervalSince(inicio) * 0.14) * 100).rounded(.down) / 100
                if v >= x { terminar(retiro: 0); break }
                m = v
                try? await Task.sleep(nanoseconds: 33_000_000)
            }
        }
    }

    private func terminar(retiro: Double) {
        guard volando else { return }
        volando = false; tarea?.cancel()
        let r = retiro > 1 ? retiro : 0
        mesa.crash(cant: apostado, x: x, r: r)
        if r > 0 {
            let g = Int((Double(apostado) * (r * 100 - 100) / 100).rounded(.down))
            estado = 1; m = r
            resultado = "Te retiras en x\(String(format: "%.2f", r)) · +\(g). Iba a explotar en x\(String(format: "%.2f", x))."
            mesa.lanzarFiesta("+\(g)", "x\(String(format: "%.2f", r))", ["🚀", "🪙"], r >= 3 ? 140 : 50); Sonido.shared.tocar(r >= 3 ? .jackpot : .combo); Haptica.fuerte()
        } else {
            estado = 2; m = x
            resultado = "Explota en x\(String(format: "%.2f", x)). Pierdes \(apostado)."
            Sonido.shared.tocar(.pierde); Haptica.fuerte()
        }
    }
}

// MARK: - Carrera de bebidas

struct JuegoCarrera: View {
    @EnvironmentObject var mesa: Mesa
    @AppStorage("apuesta") private var cant = 10
    @State private var ap: Int?
    @State private var pos: [Double] = Array(repeating: 0, count: 5)
    @State private var corriendo = false
    @State private var resultado = "Elige tu bebida. Si gana, cobras 5 veces lo apostado."

    var body: some View {
        let cab = mesa.C.caballos
        VStack(spacing: 14) {
            GeometryReader { g in
                let ancho = g.size.width - 60
                VStack(spacing: 4) {
                    ForEach(cab.indices, id: \.self) { i in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 10).fill(ap == i ? Paleta.oro.opacity(0.14) : .clear)
                            Text(cab[i]).font(.system(size: 30)).offset(x: CGFloat(pos[safe: i] ?? 0) * ancho)
                        }
                        .frame(height: 38)
                    }
                }
                .overlay(alignment: .trailing) {
                    Rectangle().fill(.white.opacity(0.8)).frame(width: 4).padding(.trailing, 22)
                }
            }
            .frame(height: CGFloat(cab.count) * 42)
            .padding(8)
            .background(Color.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text(resultado).font(.system(size: 16, weight: .bold)).foregroundStyle(Paleta.texto).multilineTextAlignment(.center)
            SelectorApuesta(cant: $cant)
            HStack(spacing: 6) {
                ForEach(cab.indices, id: \.self) { i in
                    Button { ap = i; Haptica.suave(); resultado = "Vas con \(cab[i]) por \(cant) fichas. Si gana, \(cant * (mesa.C.carreraPaga + 1))." } label: {
                        Text(cab[i]).font(.system(size: 28)).frame(maxWidth: .infinity).padding(.vertical, 8)
                            .background(Color.white.opacity(ap == i ? 0.25 : 0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Paleta.oro, lineWidth: ap == i ? 3 : 0))
                    }
                    .buttonStyle(Pulsable())
                    .disabled(corriendo)
                }
            }
            BotonGrande(texto: corriendo ? "Corriendo…" : "🏁 ¡Salida!", desactivado: corriendo) { salir() }
        }
        .padding(16).cristal(28)
    }

    private func salir() {
        guard let ap else { mesa.avisar("Elige primero tu bebida."); return }
        guard mesa.puedeApostar(cant), let r = mesa.carrera(cant: cant, ap: ap) else { return }
        let apostado = cant, n = mesa.C.caballos.count
        corriendo = true; resultado = "¡Y salen!"
        Sonido.shared.tocar(.palanca); Haptica.medio()
        let tiempos = (0..<n).map { $0 == r ? 3.6 : 3.9 + Double.random(in: 0...1.4) }
        let fases = (0..<n).map { _ in (Double.random(in: 0...6), Double.random(in: 0.5...1.5)) }
        let inicio = Date()
        Task { @MainActor in
            while true {
                let t = Date().timeIntervalSince(inicio)
                pos = (0..<n).map { i in
                    let base = min(1, t / tiempos[i])
                    return max(0, min(1, base + sin(t * 3 * fases[i].1 + fases[i].0) * 0.035 * (1 - base)))
                }
                if t > tiempos[r] + 0.25 { break }
                try? await Task.sleep(nanoseconds: 16_000_000)
            }
            corriendo = false
            let gana = ap == r
            let C = mesa.C
            resultado = "¡Gana \(C.caballos[r])! " + (gana ? "Cobras \(apostado * (C.carreraPaga + 1)) (+\(apostado * C.carreraPaga))." : "Pierdes \(apostado).")
            if gana { mesa.lanzarFiesta("+\(apostado * C.carreraPaga)", "\(C.caballos[r]) gana", [C.caballos[r], "🏁", "🪙"], 120); Sonido.shared.tocar(.jackpot); Haptica.fuerte() }
            else { Sonido.shared.tocar(.pierde); Haptica.medio() }
        }
    }
}

// MARK: - Porra: ¿quién bebe la siguiente?

struct JuegoPorra: View {
    @EnvironmentObject var mesa: Mesa
    @AppStorage("apuesta") private var cant = 10
    private let cols = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)
    var body: some View {
        let porras = mesa.vista?.porras ?? []
        VStack(spacing: 14) {
            Text("¿Quién se bebe la siguiente?").font(.system(size: 19, weight: .heavy))
            Text("Apuesta por alguien. Si su próxima bebida es la siguiente de la mesa, cobras \(mesa.C.porraPaga + 1) veces lo apostado. Si bebe otro, lo pierdes.")
                .font(.system(size: 14)).foregroundStyle(Paleta.texto2).multilineTextAlignment(.center)
            SelectorApuesta(cant: $cant)
            LazyVGrid(columns: cols, spacing: 10) {
                ForEach(mesa.jugadores.filter { $0.id != mesa.yo }) { j in
                    Button { if mesa.puedeApostar(cant) { mesa.porra(j.id, cant: cant) } } label: {
                        VStack(spacing: 4) {
                            Avatar(u: j.id, lado: 46)
                            Text(j.nombre).font(.system(size: 14, weight: .heavy)).lineLimit(1)
                            Text(j.c.prefix(3).reduce(0, +) > 0 ? "lleva \(j.c.prefix(3).reduce(0, +))" : "sin estrenar").font(.system(size: 11.5)).foregroundStyle(Paleta.texto2)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(Pulsable())
                }
            }
            if porras.isEmpty {
                Text("Nadie ha apostado todavía.").font(.system(size: 13.5)).foregroundStyle(Paleta.texto2)
            } else {
                VStack(spacing: 6) {
                    ForEach(porras) { p in
                        HStack(spacing: 8) {
                            Avatar(u: p.u, lado: 28)
                            Text("\(p.uN) → \(p.aN)").font(.system(size: 14))
                            Spacer()
                            Text("\(p.cant)").font(.system(size: 15, weight: .heavy)).foregroundStyle(Paleta.oro)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
        }
        .foregroundStyle(Paleta.texto)
        .padding(16).cristal(28)
    }
}
