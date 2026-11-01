import SwiftUI
import UIKit
import AVFoundation
import ActivityKit

// MARK: - Colores y temas

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255, opacity: alpha)
    }
}

enum Paleta {
    static let oro = Color(hex: 0xffcf3a)
    static let ambar = Color(hex: 0xff9a1a)
    static let fresa = Color(hex: 0xff3d81)
    static let noche = Color(hex: 0x16050c)
    static let texto = Color(hex: 0xfffaf2)
    static let texto2 = Color(hex: 0xfffaf2, alpha: 0.72)
    static let texto3 = Color(hex: 0xfffaf2, alpha: 0.5)
    static let mal = Color(hex: 0xff5a5f)

    /// Colores de cada consumición (los mismos de la web, validados para daltonismo)
    static func tipo(_ t: String) -> Color {
        switch t {
        case "cerveza": return Color(hex: 0xbb820e)
        case "cubata": return Color(hex: 0xc2462e)
        case "chupito": return Color(hex: 0x9a5ce0)
        case "cigarro": return Color(hex: 0x2a9fb8)
        default: return Color(hex: 0x5f9b2e)
        }
    }
    static let ordenVisual = ["cerveza", "chupito", "porro", "cigarro", "cubata"]

    /// Color de cada jugador (degradado del avatar y color de su barra)
    static func jugador(_ u: String) -> (Color, Color) {
        switch u {
        case "jorlo": return (Color(hex: 0xffcf4a), Color(hex: 0xff7a00))
        case "alvaro": return (Color(hex: 0xff6ba8), Color(hex: 0xc21d6a))
        case "david": return (Color(hex: 0x8f6bff), Color(hex: 0x3c1ec2))
        case "bianca": return (Color(hex: 0x5ff5d2), Color(hex: 0x0d9e86))
        case "noelia": return (Color(hex: 0xff9a7a), Color(hex: 0xe0362c))
        case "eider": return (Color(hex: 0xb6f06a), Color(hex: 0x3f9d1c))
        case "aitor": return (Color(hex: 0x6fc8ff), Color(hex: 0x1665d8))
        default:
            let nuevos: [(UInt32, UInt32)] = [(0xffd84a, 0xd98a00), (0x7af0c8, 0x0f8f6c), (0xff8fd2, 0xb0247a), (0x9fd0ff, 0x2a6fd6), (0xffb38a, 0xc94a1c), (0xc8a6ff, 0x6a3fd1)]
            var h: UInt32 = 0
            for ch in u.unicodeScalars { h = h &* 31 &+ ch.value }
            let c = nuevos[Int(h % UInt32(nuevos.count))]
            return (Color(hex: c.0), Color(hex: c.1))
        }
    }
}

enum Tema: String, CaseIterable, Identifiable {
    case birra, neon, oceano, toxico, fresa, noche
    var id: String { rawValue }
    var nombre: String {
        switch self {
        case .birra: return "Birra"
        case .neon: return "Neón"
        case .oceano: return "Océano"
        case .toxico: return "Tóxico"
        case .fresa: return "Fresa"
        case .noche: return "Noche"
        }
    }
    /// 9 colores de la malla de fondo (3x3) y el color de base
    var malla: [Color] {
        let c: [UInt32]
        switch self {
        case .birra: c = [0x5a0f2a, 0xff3d81, 0x7b3dff, 0xc2410c, 0xff8a00, 0x5a0f2a, 0xffb21a, 0x5a0f2a, 0x16050c]
        case .neon: c = [0x14002e, 0xff00d4, 0x3a0080, 0x7b00ff, 0x00e5ff, 0x14002e, 0xff2e63, 0x3a0080, 0x0a0018]
        case .oceano: c = [0x001a3a, 0x00c2ff, 0x3a5bff, 0x0050a0, 0x00ffa3, 0x001a3a, 0x8a5cff, 0x0050a0, 0x000c1c]
        case .toxico: c = [0x062a0c, 0xb6ff00, 0x00b3ff, 0x1e7a00, 0x00ff9d, 0x062a0c, 0xffe600, 0x1e7a00, 0x020f04]
        case .fresa: c = [0x3d0018, 0xff4f7b, 0xff7a00, 0xc2185b, 0xffb3c7, 0x3d0018, 0xff2e2e, 0xc2185b, 0x1c000b]
        case .noche: c = [0x08080f, 0x4b3bff, 0x202040, 0x15152b, 0x00ffd0, 0x08080f, 0x6a6a90, 0x15152b, 0x050508]
        }
        return c.map { Color(hex: $0) }
    }
    var muestra: LinearGradient { LinearGradient(colors: [malla[1], malla[4]], startPoint: .topLeading, endPoint: .bottomTrailing) }
}

/// Fondo vivo: malla de color que respira despacio (MeshGradient de iOS 18).
struct Fondo: View {
    @AppStorage("tema") private var tema = Tema.birra.rawValue
    @State private var fase = false
    var body: some View {
        let t = Tema(rawValue: tema) ?? .birra
        let a: Float = fase ? 1 : 0
        let puntos: [SIMD2<Float>] = [
            SIMD2(0, 0), SIMD2(0.38 + 0.24 * a, 0), SIMD2(1, 0),
            SIMD2(0, 0.6 - 0.18 * a), SIMD2(0.68 - 0.33 * a, 0.42 + 0.13 * a), SIMD2(1, 0.38 + 0.24 * a),
            SIMD2(0, 1), SIMD2(0.64 - 0.24 * a, 1), SIMD2(1, 1),
        ]
        MeshGradient(width: 3, height: 3, points: puntos, colors: t.malla)
        .overlay(Color.black.opacity(0.32))
        .ignoresSafeArea()
        .onAppear { withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) { fase.toggle() } }
    }
}

// MARK: - Cristal (Liquid Glass de verdad en iOS 26; material en versiones anteriores)

extension View {
    func cristalClasico(_ r: CGFloat) -> some View {
        self.background(.ultraThinMaterial.opacity(0.9), in: RoundedRectangle(cornerRadius: r, style: .continuous))
            .background(Color.black.opacity(0.18), in: RoundedRectangle(cornerRadius: r, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).strokeBorder(LinearGradient(colors: [.white.opacity(0.45), .white.opacity(0.06), .white.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1))
    }
}

#if compiler(>=6.2)
extension View {
    @ViewBuilder func cristal(_ r: CGFloat = 26, tinte: Color? = nil, interactivo: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(interactivo ? Glass.regular.tint(tinte ?? Color.black.opacity(0.12)).interactive() : Glass.regular.tint(tinte ?? Color.black.opacity(0.12)),
                             in: RoundedRectangle(cornerRadius: r, style: .continuous))
        } else {
            self.cristalClasico(r)
        }
    }
}
#else
extension View {
    func cristal(_ r: CGFloat = 26, tinte: Color? = nil, interactivo: Bool = false) -> some View { cristalClasico(r) }
}
#endif

/// Botón que se hunde al pulsar
struct Pulsable: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

struct Etiqueta: View {
    let texto: String
    var body: some View {
        Text(texto.uppercased()).font(.system(size: 12, weight: .bold)).tracking(1.4).foregroundStyle(Paleta.texto2)
    }
}

// MARK: - Avatar

struct Avatar: View {
    @EnvironmentObject var mesa: Mesa
    let u: String
    var lado: CGFloat = 40
    var body: some View {
        let col = Paleta.jugador(u)
        ZStack {
            if let f = mesa.fotos[u] {
                Image(uiImage: f).resizable().scaledToFill()
            } else {
                LinearGradient(colors: [col.0, col.1], startPoint: .topLeading, endPoint: .bottomTrailing)
                Text(String(mesa.nombre(u).prefix(1))).font(.system(size: lado * 0.45, weight: .heavy, design: .rounded)).foregroundStyle(.white)
            }
        }
        .frame(width: lado, height: lado)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(.white.opacity(0.35), lineWidth: 1))
        .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
    }
}

// MARK: - Vibración y sonido

enum Haptica {
    static func suave() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func medio() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func fuerte() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func exito() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

/// Sonidos sintetizados (los mismos de la web), sin archivos de audio.
final class Sonido {
    static let shared = Sonido()
    enum Efecto { case moneda, combo, jackpot, compra, palanca, pierde, bronca }
    var activo = true

    private struct Nota { let f: Double; let ini: Double; let dur: Double; let forma: Int; let vol: Double }
    private let motor = AVAudioEngine()
    private var notas: [Nota] = []
    private var t: Double = 0
    private let cerrojo = NSLock()
    private var preparado = false
    private var parada: DispatchWorkItem?

    private func preparar() {
        guard !preparado else { return }
        preparado = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        let sr = 44_100.0
        let formato = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 1)!
        let fuente = AVAudioSourceNode(format: formato) { [unowned self] _, _, frames, lista -> OSStatus in
            self.cerrojo.lock(); let ns = self.notas; let t0 = self.t; self.t += Double(frames) / sr; self.cerrojo.unlock()
            let bufs = UnsafeMutableAudioBufferListPointer(lista)
            for i in 0..<Int(frames) {
                let tt = t0 + Double(i) / sr
                var v = 0.0
                for n in ns where tt >= n.ini && tt < n.ini + n.dur {
                    let lt = tt - n.ini
                    let env = min(1, lt / 0.01) * pow(0.0001, lt / n.dur)
                    let ph = (lt * n.f).truncatingRemainder(dividingBy: 1)
                    let onda: Double
                    switch n.forma {
                    case 1: onda = 1 - 4 * abs(ph - 0.5)          // triángulo
                    case 2: onda = ph < 0.5 ? 1 : -1               // cuadrada
                    case 3: onda = 2 * ph - 1                      // sierra
                    default: onda = sin(2 * .pi * ph)
                    }
                    v += onda * env * n.vol
                }
                for b in bufs { b.mData?.assumingMemoryBound(to: Float.self)[i] = Float(max(-1, min(1, v))) }
            }
            return noErr
        }
        motor.attach(fuente)
        motor.connect(fuente, to: motor.mainMixerNode, format: formato)
    }

    func tocar(_ e: Efecto) {
        guard activo else { return }
        preparar()
        cerrojo.lock()
        let b = t + 0.03
        notas.removeAll { $0.ini + $0.dur < t }
        func n(_ f: Double, _ i: Double, _ d: Double, _ forma: Int = 0, _ v: Double = 0.1) { notas.append(Nota(f: f, ini: b + i, dur: d, forma: forma, vol: v)) }
        switch e {
        case .moneda: n(1175, 0, 0.09, 1, 0.12); n(1568, 0.07, 0.3, 1, 0.12)
        case .combo: for (i, f) in [659.0, 784, 988, 1319].enumerated() { n(f, Double(i) * 0.07, 0.22, 1) }
        case .jackpot: for (i, f) in [523.0, 659, 784, 1047, 784, 1047, 1319, 1568].enumerated() { n(f, Double(i) * 0.09, 0.35, 1, 0.14) }
        case .compra: n(784, 0, 0.12, 0, 0.14); n(1175, 0.1, 0.25, 0, 0.14)
        case .palanca: for i in 0..<14 { n(420 + Double(i % 2) * 90, Double(i) * 0.1, 0.05, 2, 0.035) }
        case .pierde: for (i, f) in [392.0, 370, 349, 262].enumerated() { n(f, Double(i) * 0.18, 0.28, 3, 0.06) }
        case .bronca: for i in 0..<4 { n(i % 2 == 1 ? 220 : 175, Double(i) * 0.22, 0.2, 3, 0.12) }
        }
        let fin = (notas.map { $0.ini + $0.dur }.max() ?? b) - t
        cerrojo.unlock()
        if !motor.isRunning { try? motor.start() }
        parada?.cancel()
        let w = DispatchWorkItem { [weak self] in self?.motor.pause() }
        parada = w
        DispatchQueue.main.asyncAfter(deadline: .now() + fin + 1.5, execute: w)
    }
}

// MARK: - Isla Dinámica

@MainActor
final class Isla {
    static let shared = Isla()
    private var actividad: Activity<BirrasAtributos>?

    func recuperar() -> Bool {
        actividad = Activity<BirrasAtributos>.activities.first
        return actividad != nil
    }
    func empezar(_ e: BirrasAtributos.ContentState, jugador: String) -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        for a in Activity<BirrasAtributos>.activities { Task { await a.end(nil, dismissalPolicy: .immediate) } }
        actividad = try? Activity.request(attributes: BirrasAtributos(jugador: jugador), content: .init(state: e, staleDate: nil), pushType: nil)
        return actividad != nil
    }
    func actualizar(_ e: BirrasAtributos.ContentState) {
        guard let a = actividad else { return }
        Task { await a.update(.init(state: e, staleDate: nil)) }
    }
    func terminar() {
        guard let a = actividad else { return }
        actividad = nil
        Task { await a.end(nil, dismissalPolicy: .immediate) }
    }
}

// MARK: - Confeti, cartel flotante y avisos

struct CapaFiesta: View {
    @EnvironmentObject var mesa: Mesa
    @State private var parts: [Particula] = []
    @State private var titulo: Fiesta?
    @State private var inicio = Date()

    struct Particula { var x, y, vx, vy, r, vr, s: Double; let e: String }

    var body: some View {
        ZStack {
            if !parts.isEmpty {
                TimelineView(.animation) { tl in
                    Canvas { ctx, size in
                        let dt = tl.date.timeIntervalSince(inicio) * 60
                        for p in parts {
                            let x = p.x * size.width + p.vx * dt * 0.99
                            let y = size.height * 0.42 + p.vy * dt + 0.225 * dt * dt
                            guard y < size.height + 60 else { continue }
                            var c = ctx
                            c.translateBy(x: x, y: y)
                            c.rotate(by: .radians(p.r + p.vr * dt))
                            c.draw(Text(p.e).font(.system(size: p.s)), at: .zero)
                        }
                    }
                }
                .allowsHitTesting(false)
                .ignoresSafeArea()
            }
            if let f = titulo {
                VStack(spacing: 4) {
                    Text(f.titulo).font(.system(size: 54, weight: .black, design: .rounded))
                        .foregroundStyle(LinearGradient(colors: [Paleta.oro, Paleta.ambar], startPoint: .top, endPoint: .bottom))
                        .shadow(color: .black.opacity(0.5), radius: 12, y: 6)
                    if !f.sub.isEmpty { Text(f.sub).font(.system(size: 18, weight: .bold, design: .rounded)).foregroundStyle(.white).shadow(radius: 6) }
                }
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .transition(.scale(scale: 0.4).combined(with: .opacity))
                .allowsHitTesting(false)
                .id(f.id)
            }
        }
        .onChange(of: mesa.fiesta) { _, f in
            guard let f else { return }
            let reducido = UIAccessibility.isReduceMotionEnabled
            inicio = Date()
            parts = (0..<(reducido ? min(f.n, 12) : f.n)).map { i in
                Particula(x: 0.5 + Double.random(in: -0.15...0.15), y: 0, vx: Double.random(in: -7...7), vy: -Double.random(in: 4...16),
                          r: Double.random(in: 0...6), vr: Double.random(in: -0.15...0.15), s: Double.random(in: 18...40), e: f.emojis[i % max(1, f.emojis.count)])
            }
            withAnimation(.spring(response: 0.45, dampingFraction: 0.6)) { titulo = f }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 1_600_000_000)
                if titulo?.id == f.id { withAnimation(.easeOut(duration: 0.3)) { titulo = nil } }
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if titulo == nil || titulo?.id != f.id { if mesa.fiesta?.id == f.id { parts = [] } }
            }
        }
    }
}

struct ListaAvisos: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        VStack(spacing: 8) {
            ForEach(mesa.avisos) { a in
                HStack(spacing: 10) {
                    Text(a.texto).font(.system(size: 15, weight: .semibold)).foregroundStyle(Paleta.texto).lineLimit(2)
                    if a.deshacer {
                        Spacer(minLength: 4)
                        Button("Deshacer") { mesa.quitarAviso(a); mesa.deshacer() }
                            .font(.system(size: 14, weight: .heavy)).padding(.horizontal, 12).padding(.vertical, 6)
                            .background(.white.opacity(0.22), in: Capsule()).foregroundStyle(.white)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .frame(maxWidth: 440)
                .cristal(22, tinte: Color.black.opacity(0.3))
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            Spacer()
        }
        .padding(.top, 54)
        .padding(.horizontal, 16)
    }
}
