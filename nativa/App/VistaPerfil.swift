import SwiftUI
import PhotosUI
import UserNotifications

struct VistaPerfil: View {
    @EnvironmentObject var mesa: Mesa
    @Environment(\.dismiss) private var cerrar
    @AppStorage("tema") private var tema = Tema.birra.rawValue
    @State private var foto: PhotosPickerItem?
    @State private var nuevo = ""
    @State private var quitar: String?
    @State private var avisos = "…"
    private let cols = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        NavigationStack {
            ZStack {
                Fondo()
                ScrollView {
                    VStack(spacing: 16) {
                        if let y = mesa.yo, let j = mesa.jugador(y) {
                            cabecera(y, j)
                            estadisticas(j)
                        }
                        ajustes
                        if mesa.esAdmin { jugadores }
                        Text("Casino Birras · app nativa \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")")
                            .font(.system(size: 12)).foregroundStyle(Paleta.texto3).padding(.top, 6)
                    }
                    .foregroundStyle(Paleta.texto)
                    .padding(16)
                }
            }
            .navigationTitle("Tu perfil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Cerrar") { cerrar() } } }
        }
        .onChange(of: foto) { _, item in
            guard let item, let y = mesa.yo else { return }
            Task {
                if let d = try? await item.loadTransferable(type: Data.self), let im = UIImage(data: d) { mesa.ponerFoto(im, para: y) }
                foto = nil
            }
        }
        .task { await leerAvisos() }
        .alert("¿Quitar a \(quitar.map { mesa.nombre($0) } ?? "")?", isPresented: Binding(get: { quitar != nil }, set: { if !$0 { quitar = nil } })) {
            Button("Quitar", role: .destructive) { if let q = quitar { mesa.bajaJugador(q) }; quitar = nil }
            Button("Cancelar", role: .cancel) { quitar = nil }
        } message: { Text("Desaparece de la mesa, del bote y de la clasificación. Sus datos se guardan: si lo vuelves a añadir con el mismo nombre, recupera lo suyo.") }
    }

    private func cabecera(_ y: String, _ j: Vista.Jugador) -> some View {
        VStack(spacing: 10) {
            PhotosPicker(selection: $foto, matching: .images) {
                Avatar(u: y, lado: 110)
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "camera.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 34, height: 34).background(Paleta.fresa, in: Circle()).overlay(Circle().strokeBorder(.white, lineWidth: 2))
                    }
            }
            Text(j.nombre).font(.system(size: 30, weight: .heavy))
            Text("\(mesa.vista?.mio?.pos ?? 0)º de \(mesa.jugadores.count) esta noche · \(j.fichas) fichas").font(.system(size: 15)).foregroundStyle(Paleta.texto2)
        }
        .padding(.top, 8)
    }

    private func estadisticas(_ j: Vista.Jugador) -> some View {
        let datos: [(String, String)] = [
            (j.ptsTxt, "puntos"), ("\(j.c[0])", "cervezas"), ("\(j.c[1])", "cubatas"), ("\(j.c[2])", "chupitos"), ("\(j.c[3])", "cigarros"), ("\(j.c[4])", "porros"),
            (j.maxCombo > 1 ? "x\(min(j.maxCombo, mesa.C.comboMax))" : "—", "mejor combo"), ("\(j.castigos)", "castigos 💀"), (horas(mesa.ahora - j.ultima), "desde la última"),
        ]
        return LazyVGrid(columns: cols, spacing: 10) {
            ForEach(Array(datos.enumerated()), id: \.offset) { _, d in
                VStack(spacing: 2) {
                    Text(d.0).font(.system(size: 22, weight: .heavy, design: .rounded)).lineLimit(1).minimumScaleFactor(0.6)
                    Text(d.1).font(.system(size: 12)).foregroundStyle(Paleta.texto2)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 12).cristal(18)
            }
        }
    }

    private var ajustes: some View {
        VStack(spacing: 0) {
            if let y = mesa.yo {
                fila("No bebo cerveza", "Te cuentan los cubatas como bebida principal", valor: mesa.jugador(y)?.principal == "cubata" ? "Sí" : "No") {
                    mesa.cambiarSinCerveza(y, mesa.jugador(y)?.principal != "cubata")
                }
            }
            fila("Sonido", "Monedas, jackpots y broncas", valor: mesa.sonido ? "Sí" : "No") { mesa.sonido.toggle() }
            fila("Isla Dinámica", "El bote y tu reloj siempre a la vista", valor: mesa.islaActiva ? "Sí" : "No") { mesa.alternarIsla() }
            fila("Avisos", "Te avisa a la hora sin beber, aunque tengas la app cerrada", valor: avisos) {
                mesa.pedirPermisoAvisos()
                Task { try? await Task.sleep(nanoseconds: 800_000_000); await leerAvisos() }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("Tema").font(.system(size: 16, weight: .bold))
                HStack(spacing: 10) {
                    ForEach(Tema.allCases) { t in
                        Button { withAnimation { tema = t.rawValue }; Haptica.suave() } label: {
                            Circle().fill(t.muestra).frame(width: 40, height: 40)
                                .overlay(Circle().strokeBorder(.white, lineWidth: tema == t.rawValue ? 3 : 0))
                        }
                        .accessibilityLabel("Tema \(t.nombre)")
                    }
                }
                Text("\((Tema(rawValue: tema) ?? .birra).nombre) · solo cambia en tu móvil").font(.system(size: 13)).foregroundStyle(Paleta.texto2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
        .cristal(26)
    }

    private func fila(_ t: String, _ sub: String, valor: String, _ f: @escaping () -> Void) -> some View {
        Button { f(); Haptica.suave() } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t).font(.system(size: 16, weight: .bold))
                    Text(sub).font(.system(size: 13)).foregroundStyle(Paleta.texto2).multilineTextAlignment(.leading)
                }
                Spacer()
                Text(valor).font(.system(size: 15, weight: .semibold)).foregroundStyle(Paleta.oro)
            }
            .foregroundStyle(Paleta.texto)
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(Pulsable())
        .overlay(alignment: .bottom) { Divider().overlay(.white.opacity(0.08)).padding(.horizontal, 16) }
    }

    private var jugadores: some View {
        VStack(alignment: .leading, spacing: 10) {
            Etiqueta(texto: "Jugadores (solo tú)")
            ForEach(mesa.jugadores) { j in
                HStack(spacing: 10) {
                    Avatar(u: j.id, lado: 34)
                    Text(j.nombre).font(.system(size: 16, weight: .bold))
                    Spacer()
                    Button(j.principal == "cubata" ? "🥃 Cubatas" : "🍺 Cerveza") { mesa.cambiarSinCerveza(j.id, j.principal != "cubata") }
                        .font(.system(size: 13, weight: .bold)).padding(.horizontal, 10).padding(.vertical, 6).background(.white.opacity(0.12), in: Capsule())
                    if j.id != mesa.C.admin {
                        Button("Quitar") { quitar = j.id }
                            .font(.system(size: 13, weight: .bold)).padding(.horizontal, 10).padding(.vertical, 6).background(Paleta.mal.opacity(0.6), in: Capsule())
                    }
                }
            }
            HStack(spacing: 8) {
                TextField("Nombre del nuevo", text: $nuevo).textInputAutocapitalization(.words).autocorrectionDisabled()
                    .padding(.horizontal, 14).padding(.vertical, 11).background(.white.opacity(0.1), in: Capsule())
                Button("Añadir") {
                    if let e = mesa.altaJugador(nuevo) { mesa.avisar(e) } else { nuevo = "" }
                }
                .font(.system(size: 15, weight: .heavy)).padding(.horizontal, 16).padding(.vertical, 11).background(Paleta.oro, in: Capsule()).foregroundStyle(Color(hex: 0x2a1100))
            }
        }
        .foregroundStyle(Paleta.texto)
        .padding(16)
        .cristal(26)
    }

    private func leerAvisos() async {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        switch s.authorizationStatus {
        case .authorized, .provisional, .ephemeral: avisos = "Activados"
        case .denied: avisos = "En Ajustes"
        default: avisos = "Activar"
        }
    }
}
