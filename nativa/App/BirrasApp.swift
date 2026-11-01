import SwiftUI

@main
struct BirrasProApp: App {
    @StateObject private var mesa = Mesa()
    @AppStorage("letra") private var letra = Letra.redonda.rawValue
    var body: some Scene {
        WindowGroup {
            let l = Letra(rawValue: letra) ?? .redonda
            Raiz()
                .environmentObject(mesa)
                .preferredColorScheme(.dark)
                .fontDesign(l.diseno)
                .fontWidth(l.anchura)
                .tint(Paleta.oro)
        }
    }
}

struct Raiz: View {
    @EnvironmentObject var mesa: Mesa
    @Environment(\.scenePhase) private var fase
    @State private var pestana = 0

    var body: some View {
        // Las capas van encima con overlay: así nunca pueden ensanchar la pantalla
        TabView(selection: $pestana) {
            Tab("Bote", systemImage: "mug.fill", value: 0) { VistaBote() }
            Tab("Casino", systemImage: "suit.club.fill", value: 1) { VistaCasino() }
            Tab("Noche", systemImage: "chart.bar.xaxis", value: 2) { VistaNoche() }
            Tab("Mesa", systemImage: "person.3.fill", value: 3) { VistaMesa() }
        }
        .onChange(of: pestana) { _, _ in Haptica.suave() }
        .overlay { CapaFiesta() }
        .overlay { ListaAvisos() }
        .overlay { CapaBronca() }
        .overlay {
            if mesa.vista == nil {
                ZStack {
                    Fondo()
                    VStack(spacing: 14) {
                        Text("🍺").font(.system(size: 72))
                        ProgressView().tint(.white)
                        Text("Conectando con la mesa…").font(.system(size: 15, weight: .semibold)).foregroundStyle(Paleta.texto2)
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.35), value: mesa.vista == nil)
        .sheet(isPresented: $mesa.verPerfil) { VistaPerfil().environmentObject(mesa) }
        .fullScreenCover(isPresented: Binding(get: { mesa.necesitaSilla }, set: { if !$0 { mesa.cambiandoSilla = false } })) {
            ElegirSilla().environmentObject(mesa)
        }
        .onChange(of: fase) { _, f in if f == .active { mesa.alVolver() } }
    }
}

/// Pantalla con el fondo, la cabecera y el contenido desplazable.
struct Pantalla<Contenido: View>: View {
    @EnvironmentObject var mesa: Mesa
    var titulo: String? = nil
    @ViewBuilder let contenido: () -> Contenido
    var body: some View {
        GeometryReader { g in
            ScrollView(.vertical) {
                VStack(spacing: 14) {
                    Cabecera()
                    if let titulo {
                        Text(titulo).font(.system(size: 34, weight: .heavy)).foregroundStyle(Paleta.texto)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
                    }
                    contenido()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
                // Ancho fijo = el de la pantalla: nada puede hacer que se deslice de lado
                .frame(width: g.size.width)
                .clipped()
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .refreshable { await mesa.recargar() }
        }
        .background { Fondo() }
    }
}

struct Cabecera: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        HStack(spacing: 10) {
            Button { mesa.verPerfil = true; Haptica.suave() } label: {
                HStack(spacing: 8) {
                    if let y = mesa.yo { Avatar(u: y, lado: 30) }
                    Text(mesa.yo.map { mesa.nombre($0) } ?? "Entrar").font(.system(size: 16, weight: .semibold)).foregroundStyle(Paleta.texto)
                }
                .padding(.leading, 5).padding(.trailing, 12).padding(.vertical, 5)
                .cristal(20, interactivo: true)
            }
            .buttonStyle(Pulsable())
            .accessibilityLabel("Tu perfil")
            Spacer()
            HStack(spacing: 6) {
                Text("Casino ").foregroundStyle(Paleta.texto) + Text("Birras").foregroundStyle(Paleta.oro)
                Circle().fill(mesa.conectado ? Color.green : Paleta.mal).frame(width: 8, height: 8)
                    .shadow(color: mesa.conectado ? .green : .red, radius: 4)
            }
            .font(.system(size: 17, weight: .heavy, design: .rounded))
            Spacer()
            Button { mesa.sonido.toggle(); Haptica.suave() } label: {
                Image(systemName: mesa.sonido ? "speaker.wave.2.fill" : "speaker.slash.fill")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Paleta.texto)
                    .frame(width: 40, height: 40).cristal(20, interactivo: true)
            }
            .buttonStyle(Pulsable())
            .accessibilityLabel(mesa.sonido ? "Quitar el sonido" : "Poner el sonido")
        }
        .padding(.top, 6)
        .overlay(alignment: .bottom) {
            if mesa.pendientes > 0 {
                Text("⏳ \(mesa.pendientes) sin enviar").font(.system(size: 12, weight: .bold)).padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Paleta.ambar.opacity(0.9), in: Capsule()).foregroundStyle(.black).offset(y: 22)
            }
        }
    }
}

/// Elegir quién eres (solo al principio o desde la Mesa con confirmación).
struct ElegirSilla: View {
    @EnvironmentObject var mesa: Mesa
    @State private var confirmar: String?
    private let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    var body: some View {
        ZStack {
            Fondo()
            ScrollView {
                VStack(spacing: 18) {
                    Text("🍺").font(.system(size: 64)).padding(.top, 40)
                    Text("¿Quién eres?").font(.system(size: 34, weight: .heavy)).foregroundStyle(Paleta.texto)
                    Text("Lo que apuntes desde este móvil contará para esa persona.").font(.system(size: 15)).foregroundStyle(Paleta.texto2).multilineTextAlignment(.center)
                    LazyVGrid(columns: cols, spacing: 12) {
                        ForEach(mesa.jugadores) { j in
                            Button {
                                if let y = mesa.yo, y != j.id, mesa.jugadores.contains(where: { $0.id == y }) { confirmar = j.id } else { mesa.sentarse(j.id) }
                            } label: {
                                VStack(spacing: 8) {
                                    Avatar(u: j.id, lado: 64)
                                    Text(j.nombre).font(.system(size: 17, weight: .bold)).foregroundStyle(Paleta.texto)
                                    Text("\(j.ptsTxt) puntos").font(.system(size: 13)).foregroundStyle(Paleta.texto2)
                                }
                                .frame(maxWidth: .infinity).padding(.vertical, 18)
                                .cristal(24, interactivo: true)
                            }
                            .buttonStyle(Pulsable())
                        }
                    }
                    if mesa.cambiandoSilla {
                        Button("Cancelar") { mesa.cambiandoSilla = false }.font(.system(size: 16, weight: .semibold)).foregroundStyle(Paleta.texto2).padding()
                    }
                }
                .padding(.horizontal, 20)
            }
        }
        .alert("¿Seguro que eres \(confirmar.map { mesa.nombre($0) } ?? "")?", isPresented: Binding(get: { confirmar != nil }, set: { if !$0 { confirmar = nil } })) {
            Button("Sí, soy yo", role: .destructive) { if let c = confirmar { mesa.sentarse(c) }; confirmar = nil }
            Button("Cancelar", role: .cancel) { confirmar = nil }
        } message: { Text("Lo que apuntes desde este móvil contará para esa persona.") }
    }
}

/// Pantalla de «BEBE» cuando llevas una hora seco, y la diana.
struct CapaBronca: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let m = mesa.vista?.mio
        let ahora = mesa.ahora
        let diana = m?.diana.flatMap { $0.t > mesa.dianaVista ? $0 : nil }
        let bebe = (m?.seco ?? false) && ahora > mesa.broncaHasta
        if let m, diana != nil || bebe {
            ZStack {
                Color.black.opacity(0.55).ignoresSafeArea()
                LinearGradient(colors: [Paleta.mal.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
                VStack(spacing: 18) {
                    Text(diana != nil ? "🎯" : "BEBE").font(.system(size: diana != nil ? 90 : 96, weight: .black, design: .rounded))
                        .foregroundStyle(LinearGradient(colors: [Paleta.oro, Paleta.mal], startPoint: .top, endPoint: .bottom))
                    Text(diana.map { "\($0.por) te ha puesto en la diana. Bebe YA, \(mesa.nombre(m.id))." } ?? (m.bronca ?? ""))
                        .font(.system(size: 21, weight: .bold)).foregroundStyle(.white).multilineTextAlignment(.center)
                    Button {
                        mesa.apuntar(m.id, m.principal, 1)
                        cerrar(diana)
                    } label: {
                        Text(m.principal == "cubata" ? "🥃  Me pido un cubata" : "🍺  Me pido una ya").font(.system(size: 19, weight: .heavy))
                            .frame(maxWidth: .infinity).padding(.vertical, 18)
                            .background(LinearGradient(colors: [Paleta.oro, Paleta.ambar], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                            .foregroundStyle(Color(hex: 0x2a1100))
                    }
                    .buttonStyle(Pulsable())
                    Button(diana != nil ? "Vale, vale" : "Luego (5 min)") { cerrar(diana) }
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
                }
                .padding(28)
                .frame(maxWidth: 420)
                .cristal(34, tinte: Color.black.opacity(0.35))
                .padding(20)
            }
            .transition(.opacity.combined(with: .scale(scale: 1.08)))
            .onAppear { Sonido.shared.tocar(.bronca); Haptica.fuerte() }
        }
    }
    private func cerrar(_ diana: Vista.Diana?) {
        withAnimation {
            if let d = diana { mesa.dianaVista = d.t; UserDefaults.standard.set(d.t, forKey: "birras-diana") }
            else { mesa.broncaHasta = mesa.ahora + 300 }
        }
    }
}
