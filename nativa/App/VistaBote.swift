import SwiftUI

struct VistaBote: View {
    @EnvironmentObject var mesa: Mesa
    @AppStorage("modulos") private var orden = Modulo.porDefecto
    @AppStorage("ocultos") private var ocultos = ""
    var body: some View {
        Pantalla {
            Retos()
            Castigos()
            ForEach(Modulo.lista(orden).filter { !Modulo.ocultos(ocultos).contains($0) }) { m in m.vista }
        }
    }
}

/// Bloques de la pantalla principal: cada uno los ordena y oculta a su gusto (Perfil → Personalizar).
enum Modulo: String, CaseIterable, Identifiable {
    case bote, muro, botones, marcador, mificha, ultimo
    var id: String { rawValue }
    static let porDefecto = "bote,muro,botones,marcador,mificha,ultimo"
    static func lista(_ s: String) -> [Modulo] {
        var l: [Modulo] = []
        for x in s.split(separator: ",") { if let m = Modulo(rawValue: String(x)), !l.contains(m) { l.append(m) } }
        for m in allCases where !l.contains(m) { l.append(m) }
        return l
    }
    static func ocultos(_ s: String) -> Set<Modulo> { Set(s.split(separator: ",").compactMap { Modulo(rawValue: String($0)) }) }
    var nombre: String {
        switch self {
        case .bote: return "El bote"
        case .muro: return "Muro de la vergüenza"
        case .botones: return "Botones para apuntar"
        case .marcador: return "Marcador"
        case .mificha: return "Mis fichas y mi reloj"
        case .ultimo: return "Lo último"
        }
    }
    var icono: String {
        switch self {
        case .bote: return "trophy.fill"
        case .muro: return "exclamationmark.bubble.fill"
        case .botones: return "plus.circle.fill"
        case .marcador: return "list.number"
        case .mificha: return "timer"
        case .ultimo: return "clock.arrow.circlepath"
        }
    }
    @ViewBuilder var vista: some View {
        switch self {
        case .bote: TarjetaBote()
        case .muro: MuroSiHay()
        case .botones: Botonera()
        case .marcador: Marcador()
        case .mificha: MiFicha()
        case .ultimo: UltimasJugadas(cuantas: 4, titulo: "Lo último")
        }
    }
}

struct MuroSiHay: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View { if let muro = mesa.vista?.muro { Muro(texto: muro) } }
}

/// Castigos: cada uno es un chupito que se debe. Al apuntarse un chupito se paga uno.
struct Castigos: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let deben = mesa.jugadores.filter { $0.castigos > 0 }.sorted { $0.castigos > $1.castigos }
        let mios = mesa.yo.flatMap { mesa.jugador($0)?.castigos } ?? 0
        if !deben.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Text("💀").font(.system(size: 34))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(mios > 0 ? "Debes \(mios) \(mios == 1 ? "chupito" : "chupitos") de castigo" : "Castigos pendientes").font(.system(size: 18, weight: .heavy))
                        Text("Cada castigo es un chupito. Al apuntarte un chupito se paga uno.").font(.system(size: 13)).foregroundStyle(Paleta.texto2)
                    }
                }
                FlowLayout(espacio: 8) {
                    ForEach(deben) { j in
                        HStack(spacing: 6) {
                            Avatar(u: j.id, lado: 26)
                            Text("\(j.nombre) · \(j.castigos)").font(.system(size: 14, weight: .heavy))
                        }
                        .padding(.leading, 4).padding(.trailing, 12).padding(.vertical, 4)
                        .background(j.id == mesa.yo ? Paleta.mal : Color.black.opacity(0.28), in: Capsule())
                    }
                }
                if mios > 0, let y = mesa.yo {
                    Button { mesa.apuntar(y, "chupito", 1) } label: {
                        Text("🥂  Me bebo el chupito").font(.system(size: 17, weight: .black)).frame(maxWidth: .infinity).padding(.vertical, 13)
                            .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).foregroundStyle(Color(hex: 0x7a0a1c))
                    }
                    .buttonStyle(Pulsable())
                }
            }
            .foregroundStyle(Paleta.texto)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [Paleta.mal.opacity(0.45), Color(hex: 0x78001e, alpha: 0.4)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .cristal(26, tinte: Paleta.mal.opacity(0.2))
        }
    }
}

/// Fila que salta de línea cuando no cabe
struct FlowLayout: Layout {
    var espacio: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ancho = proposal.width ?? 300
        var x: CGFloat = 0, y: CGFloat = 0, fila: CGFloat = 0
        for v in subviews {
            let t = v.sizeThatFits(.unspecified)
            if x + t.width > ancho && x > 0 { x = 0; y += fila + espacio; fila = 0 }
            x += t.width + espacio; fila = max(fila, t.height)
        }
        return CGSize(width: ancho, height: y + fila)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, fila: CGFloat = 0
        for v in subviews {
            let t = v.sizeThatFits(.unspecified)
            if x + t.width > bounds.maxX && x > bounds.minX { x = bounds.minX; y += fila + espacio; fila = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(t))
            x += t.width + espacio; fila = max(fila, t.height)
        }
    }
}

// MARK: - Retos

struct Retos: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let retos = (mesa.vista?.retos ?? []).filter { !$0.hasta.isZero || $0.a == mesa.yo || $0.de == mesa.yo }
        if !retos.isEmpty {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                VStack(spacing: 10) { ForEach(retos) { TarjetaReto(r: $0) } }
            }
        }
    }
}

struct TarjetaReto: View {
    @EnvironmentObject var mesa: Mesa
    let r: Vista.Reto
    var body: some View {
        let ahora = mesa.ahora
        let bebida = r.copa ? "otra copa" : "otra"
        VStack(alignment: .leading, spacing: 10) {
            if r.hasta.isZero {
                let queda = mmss(mesa.C.retoEspera - (ahora - r.t))
                if r.a == mesa.yo {
                    HStack(spacing: 10) { Avatar(u: r.de, lado: 36); Text("\(r.deN) te reta: bébete \(bebida) en 10 min").font(.system(size: 16, weight: .bold)) }
                    Text("Os jugáis \(r.cant) fichas cada uno · caduca en \(queda)").font(.system(size: 13.5)).foregroundStyle(Paleta.texto2)
                    HStack(spacing: 8) {
                        botonReto("Acepto", principal: true) { mesa.reto("aceptar", r.rid) }
                        botonReto("Me rajo") { mesa.reto("rechazar", r.rid) }
                    }
                } else {
                    HStack(spacing: 10) { Avatar(u: r.a, lado: 36); Text("Esperando a \(r.aN)…").font(.system(size: 16, weight: .bold)) }
                    Text("Reto por \(r.cant) fichas · caduca en \(queda)").font(.system(size: 13.5)).foregroundStyle(Paleta.texto2)
                    botonReto("Retirar el reto") { mesa.reto("cancelar", r.rid) }
                }
            } else {
                HStack(spacing: 10) {
                    Avatar(u: r.a == mesa.yo ? r.de : r.a, lado: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.a == mesa.yo ? "Bebe \(bebida) ya" : "\(r.deN) vs \(r.aN)").font(.system(size: 16, weight: .bold))
                        Text(r.a == mesa.yo ? "o \(r.deN) se lleva \(r.cant * 2) fichas" : "\(r.de == mesa.yo ? "\(r.aN) tiene que beber" : "reto en juego") · \(r.cant * 2) fichas")
                            .font(.system(size: 13)).foregroundStyle(Paleta.texto2)
                    }
                    Spacer()
                    Text(mmss(r.hasta - ahora)).font(.system(size: 28, weight: .black, design: .rounded)).monospacedDigit()
                        .foregroundStyle(r.a == mesa.yo ? Paleta.oro : Paleta.texto)
                }
            }
        }
        .foregroundStyle(Paleta.texto)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cristal(24, tinte: r.a == mesa.yo ? Paleta.oro.opacity(0.18) : nil)
    }

    private func botonReto(_ t: String, principal: Bool = false, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Text(t).font(.system(size: 15, weight: .heavy)).frame(maxWidth: .infinity).padding(.vertical, 11)
                .background(principal ? AnyShapeStyle(LinearGradient(colors: [Paleta.oro, Paleta.ambar], startPoint: .leading, endPoint: .trailing)) : AnyShapeStyle(Color.white.opacity(0.14)), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .foregroundStyle(principal ? Color(hex: 0x2a1100) : Paleta.texto)
        }
        .buttonStyle(Pulsable())
    }
}

func mmss(_ s: Double) -> String {
    let n = max(0, Int(s.rounded(.up)))
    return "\(n / 60):\(String(format: "%02d", n % 60))"
}

// MARK: - El bote

struct TarjetaBote: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let v = mesa.vista
        let cerv = v?.cervezas ?? 0
        VStack(spacing: 6) {
            Etiqueta(texto: "El bote de la mesa")
            Text("\(cerv)")
                .font(.system(size: 112, weight: .black, design: .rounded))
                .foregroundStyle(LinearGradient(colors: [Color(hex: 0xfff1b0), Paleta.oro, Paleta.ambar], startPoint: .top, endPoint: .bottom))
                .contentTransition(.numericText(value: Double(cerv)))
                .shadow(color: Paleta.ambar.opacity(0.45), radius: 18, y: 6)
                .animation(.spring(response: 0.5, dampingFraction: 0.6), value: cerv)
            Text(cerv == 1 ? "cerveza" : "cervezas").font(.system(size: 21, weight: .bold)).foregroundStyle(Paleta.texto)
            Text("🏆 \(v?.ptsTxt ?? "0") puntos en el bote").font(.system(size: 15, weight: .bold)).foregroundStyle(Paleta.texto)
                .padding(.horizontal, 14).padding(.vertical, 7).background(.white.opacity(0.12), in: Capsule())
            HStack(spacing: 8) {
                ForEach(Array(mesa.C.orden.enumerated()).filter { $0.element != "cerveza" }, id: \.element) { i, t in
                    VStack(spacing: 2) {
                        Text("\(v?.tot?[safe: i] ?? 0)").font(.system(size: 24, weight: .heavy, design: .rounded)).contentTransition(.numericText())
                        Text("\(mesa.C.tipo(t).ico) \(mesa.C.tipo(t).plural.lowercased())").font(.system(size: 11.5, weight: .semibold)).foregroundStyle(Paleta.texto2).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
            .padding(.top, 8)
            Reparto().padding(.top, 6)
        }
        .foregroundStyle(Paleta.texto)
        .padding(18)
        .frame(maxWidth: .infinity)
        .cristal(30)
    }
}

/// Barra con lo que aporta cada uno al bote
struct Reparto: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let js = mesa.jugadores.filter { $0.pts > 0 }
        let total = js.reduce(0) { $0 + $1.pts }
        GeometryReader { g in
            HStack(spacing: 2) {
                ForEach(js) { j in
                    Capsule().fill(Paleta.jugador(j.id).1)
                        .frame(width: max(4, (g.size.width - CGFloat(js.count) * 2) * CGFloat(j.pts / max(total, 0.1))))
                }
            }
        }
        .frame(height: 8)
        .background(.white.opacity(0.08), in: Capsule())
        .clipShape(Capsule())
        .animation(.spring, value: total)
        .accessibilityLabel("Reparto del bote")
    }
}

struct Muro: View {
    let texto: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Etiqueta(texto: "Muro de la vergüenza")
            Text(texto).font(.system(size: 17, weight: .bold)).foregroundStyle(Paleta.texto).fixedSize(horizontal: false, vertical: true)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .cristal(24, tinte: Paleta.mal.opacity(0.28))
    }
}

// MARK: - Botones para apuntar

struct Botonera: View {
    @EnvironmentObject var mesa: Mesa
    @State private var quitar = false
    var body: some View {
        let m = mesa.vista?.mio
        let pr = m?.principal ?? "cerveza"
        let P = mesa.C.tipo(pr)
        VStack(spacing: 10) {
            Picker("Modo", selection: $quitar) {
                Text("＋ Sumar").tag(false)
                Text("－ Quitar").tag(true)
            }
            .pickerStyle(.segmented)
            .onChange(of: quitar) { _, _ in Haptica.suave() }

            Button { pulsar(pr) } label: {
                HStack(spacing: 14) {
                    Text(P.ico).font(.system(size: 50))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(P.un.prefix(1).uppercased() + P.un.dropFirst()).font(.system(size: 26, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
                        Text(quitar ? "Quitar \(P.un)" : (m?.sigTxt ?? "+1 punto")).font(.system(size: 14, weight: .semibold)).foregroundStyle(Paleta.texto2)
                    }
                    Spacer()
                    Image(systemName: quitar ? "minus" : "plus").font(.system(size: 24, weight: .heavy))
                        .frame(width: 54, height: 54).background(.white.opacity(0.22), in: Circle())
                }
                .foregroundStyle(Paleta.texto)
                .padding(16)
                .frame(maxWidth: .infinity)
                .cristal(28, tinte: quitar ? Paleta.mal.opacity(0.3) : Paleta.fresa.opacity(0.22), interactivo: true)
            }
            .buttonStyle(Pulsable())

            HStack(spacing: 8) {
                ForEach(mesa.C.orden.filter { $0 != pr }, id: \.self) { t in
                    let T = mesa.C.tipo(t)
                    Button { pulsar(t) } label: {
                        VStack(spacing: 3) {
                            Text(T.ico).font(.system(size: 30))
                            Text(T.nombre).font(.system(size: 14, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.8)
                            Text("\(quitar ? "−" : "+")\(formatoPuntos(T.pts)) pts").font(.system(size: 11.5, weight: .semibold)).foregroundStyle(Paleta.texto2)
                        }
                        .foregroundStyle(Paleta.texto)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .cristal(22, tinte: quitar ? Paleta.mal.opacity(0.25) : nil, interactivo: true)
                    }
                    .buttonStyle(Pulsable())
                }
            }
        }
    }

    private func pulsar(_ t: String) {
        guard let y = mesa.yo else { mesa.cambiandoSilla = true; return }
        if quitar {
            guard let j = mesa.jugador(y), j.c[mesa.indice(t)] > 0 else { mesa.avisar("No tienes \(mesa.C.tipo(t).plural.lowercased()) que quitar."); return }
            mesa.apuntar(y, t, -1)
        } else {
            mesa.apuntar(y, t, 1)
        }
    }
}

// MARK: - Marcador

struct Marcador: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let js = mesa.jugadores
        let lider = max(1, js.map(\.pts).max() ?? 1)
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Etiqueta(texto: "Marcador")
                Spacer()
                Text("🍺 1 · 🥃 2 · 🥂 0,5 · 🚬 0,2 · 🌿 2,5").font(.system(size: 11.5, weight: .semibold)).foregroundStyle(Paleta.texto3)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            .padding(.horizontal, 6).padding(.bottom, 4)
            ForEach(Array(js.enumerated()), id: \.element.id) { i, j in
                FilaMarcador(j: j, lider: lider, corona: i == 0 && j.pts > 0)
            }
        }
        .padding(12)
        .cristal(28)
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: js.map(\.id))
    }
}

struct FilaMarcador: View {
    @EnvironmentObject var mesa: Mesa
    let j: Vista.Jugador
    let lider: Double
    let corona: Bool
    var body: some View {
        HStack(spacing: 12) {
            Avatar(u: j.id, lado: 40)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(j.nombre).font(.system(size: 17, weight: .bold))
                    if corona { Text("👑").font(.system(size: 14)) }
                    if j.castigos > 0 { InsigniaCastigo(n: j.castigos) }
                }
                Text(iconos(j, mesa.C)).font(.system(size: 13)).foregroundStyle(Paleta.texto2).lineLimit(1)
                GeometryReader { g in
                    HStack(spacing: 2) {
                        ForEach(Paleta.ordenVisual, id: \.self) { t in
                            let n = j.c[mesa.indice(t)]
                            if n > 0 {
                                Rectangle().fill(Paleta.tipo(t))
                                    .frame(width: max(3, g.size.width * CGFloat(Double(n) * mesa.C.tipo(t).pts / lider)))
                            }
                        }
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 5)
                .background(.white.opacity(0.07), in: Capsule())
            }
            VStack(alignment: .trailing, spacing: 0) {
                Text(j.ptsTxt).font(.system(size: 24, weight: .heavy, design: .rounded)).contentTransition(.numericText())
                Text("\(j.fichas) fichas").font(.system(size: 12, weight: .semibold)).foregroundStyle(Paleta.oro.opacity(0.9))
            }
            .monospacedDigit()
        }
        .foregroundStyle(Paleta.texto)
        .opacity(j.pts > 0 ? 1 : 0.55)
        .padding(.horizontal, 8).padding(.vertical, 8)
        .background(j.id == mesa.yo ? Color.white.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

func iconos(_ j: Vista.Jugador, _ C: Constantes) -> String {
    let s = C.orden.enumerated().compactMap { i, t in j.c[i] > 0 ? "\(C.tipo(t).ico)\(j.c[i])" : nil }.joined(separator: " ")
    return s.isEmpty ? "sin estrenar" : s
}

// MARK: - Mi ficha

struct MiFicha: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        if let m = mesa.vista?.mio {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(m.fichas)").font(.system(size: 34, weight: .black, design: .rounded)).contentTransition(.numericText())
                    Text("fichas").font(.system(size: 15, weight: .semibold)).foregroundStyle(Paleta.texto2)
                    Spacer()
                    if !m.pills.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(m.pills, id: \.self) { p in
                                Text(p).font(.system(size: 12, weight: .heavy)).padding(.horizontal, 9).padding(.vertical, 5)
                                    .background(Paleta.oro.opacity(0.25), in: Capsule())
                            }
                        }
                    }
                }
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    let seg = max(0, mesa.ahora - m.ultima)
                    let mal = seg > mesa.C.horaSeca
                    let cub = m.principal == "cubata"
                    VStack(alignment: .leading, spacing: 8) {
                        Text(mal ? "Llevas \(horas(seg)) sin \(cub ? "un cubata" : "cerveza"). Inaceptable."
                                 : "\(cub ? "Tu último cubata" : "Tu última cerveza"): hace \(horas(seg)) · insultos en \(horas(mesa.C.horaSeca - seg))")
                            .font(.system(size: 14.5, weight: .medium)).foregroundStyle(mal ? Paleta.mal : Paleta.texto2)
                        GeometryReader { g in
                            Capsule().fill(LinearGradient(colors: mal ? [Paleta.mal, Paleta.mal] : [Paleta.oro, Paleta.ambar, Paleta.mal], startPoint: .leading, endPoint: .trailing))
                                .frame(width: g.size.width * CGFloat(min(1, seg / mesa.C.horaSeca)))
                        }
                        .frame(height: 6).background(.white.opacity(0.08), in: Capsule())
                    }
                }
                Button { mesa.alternarIsla() } label: {
                    Label(mesa.islaActiva ? "Quitar el bote de la Isla Dinámica" : "Llevar el bote en la Isla Dinámica", systemImage: mesa.islaActiva ? "pin.slash.fill" : "pin.fill")
                        .font(.system(size: 14, weight: .bold)).frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(Pulsable())
            }
            .foregroundStyle(Paleta.texto)
            .padding(16)
            .cristal(26)
        }
    }
}

func horas(_ seg: Double) -> String {
    let s = max(0, Int(seg))
    let h = s / 3600, m = (s % 3600) / 60
    return h > 0 ? "\(h) h \(m) min" : "\(m) min"
}

// MARK: - Jugadas

struct UltimasJugadas: View {
    @EnvironmentObject var mesa: Mesa
    let cuantas: Int
    let titulo: String
    var body: some View {
        let feed = Array((mesa.vista?.feed ?? []).prefix(cuantas))
        VStack(alignment: .leading, spacing: 0) {
            Etiqueta(texto: titulo).padding(.horizontal, 6).padding(.bottom, 8)
            if feed.isEmpty {
                Text("El bote está a cero. Alguien tendrá que estrenarlo.").font(.system(size: 15)).foregroundStyle(Paleta.texto2).padding(6)
            }
            ForEach(Array(feed.enumerated()), id: \.offset) { i, f in
                HStack(alignment: .top, spacing: 10) {
                    Text(f.ico).font(.system(size: 20)).frame(width: 28)
                    Text(f.txt).font(.system(size: 15)).foregroundStyle(Paleta.texto).frame(maxWidth: .infinity, alignment: .leading)
                    Text(Date(timeIntervalSince1970: f.t), format: .dateTime.hour().minute()).font(.system(size: 12.5)).foregroundStyle(Paleta.texto3).monospacedDigit()
                }
                .padding(.vertical, 9).padding(.horizontal, 6)
                if i < feed.count - 1 { Divider().overlay(.white.opacity(0.08)) }
            }
        }
        .padding(12)
        .cristal(26)
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}


struct InsigniaCastigo: View {
    let n: Int
    var body: some View {
        Text("💀 \(n)").font(.system(size: 12, weight: .heavy)).foregroundStyle(.white)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Paleta.mal.opacity(0.9), in: Capsule())
            .accessibilityLabel("\(n) \(n == 1 ? "castigo" : "castigos"): chupitos pendientes")
    }
}
