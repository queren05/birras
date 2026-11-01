import SwiftUI
import PhotosUI
import UserNotifications

struct VistaPerfil: View {
    @EnvironmentObject var mesa: Mesa
    @Environment(\.dismiss) private var cerrar
    @AppStorage("tema") private var tema = Tema.birra.rawValue
    @AppStorage("letra") private var letra = Letra.redonda.rawValue
    @AppStorage("burbujas") private var burbujas = true
    @State private var personalizar = false
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
                        if let y = mesa.yo { MisNoches(u: y) }
                        ajustes
                        apariencia
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
            fila("Pantalla principal", "Ordena y oculta los bloques del Bote", valor: "Personalizar") { personalizar = true }
        }
        .cristal(26)
    }

    private var apariencia: some View {
        VStack(alignment: .leading, spacing: 14) {
            Etiqueta(texto: "Apariencia · solo en tu móvil")
            Text("Tema · \((Tema(rawValue: tema) ?? .birra).nombre)").font(.system(size: 16, weight: .bold))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 8), spacing: 10) {
                ForEach(Tema.allCases) { t in
                    Button { withAnimation(.easeInOut(duration: 0.6)) { tema = t.rawValue }; Haptica.suave(); Sonido.shared.tocar(.compra) } label: {
                        Circle().fill(t.muestra).aspectRatio(1, contentMode: .fit)
                            .overlay(Circle().strokeBorder(.white, lineWidth: tema == t.rawValue ? 3 : 0))
                            .scaleEffect(tema == t.rawValue ? 1.1 : 1)
                    }
                    .accessibilityLabel("Tema \(t.nombre)")
                }
            }
            Text("Letra").font(.system(size: 16, weight: .bold))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(Letra.allCases) { l in
                    Button { letra = l.rawValue; Haptica.suave() } label: {
                        VStack(spacing: 2) {
                            Text("Aa").font(.system(size: 22, weight: .bold, design: l.diseno).width(l.anchura))
                            Text(l.nombre).font(.system(size: 11.5, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(Color.white.opacity(letra == l.rawValue ? 0.25 : 0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Paleta.oro, lineWidth: letra == l.rawValue ? 2 : 0))
                    }
                    .buttonStyle(Pulsable())
                }
            }
            Toggle(isOn: $burbujas) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Burbujas de fondo").font(.system(size: 16, weight: .bold))
                    Text("Como el gas de una caña").font(.system(size: 13)).foregroundStyle(Paleta.texto2)
                }
            }
            .tint(Paleta.oro)
        }
        .foregroundStyle(Paleta.texto)
        .padding(16)
        .cristal(26)
        .sheet(isPresented: $personalizar) { PersonalizarBote() }
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


/// Ordenar y ocultar los bloques del Bote
struct PersonalizarBote: View {
    @Environment(\.dismiss) private var cerrar
    @AppStorage("modulos") private var orden = Modulo.porDefecto
    @AppStorage("ocultos") private var ocultos = ""
    var body: some View {
        let lista = Modulo.lista(orden)
        let ocu = Modulo.ocultos(ocultos)
        NavigationStack {
            List {
                Section {
                    ForEach(lista) { m in
                        HStack(spacing: 12) {
                            Image(systemName: m.icono).foregroundStyle(Paleta.oro).frame(width: 26)
                            Text(m.nombre).foregroundStyle(ocu.contains(m) ? Paleta.texto3 : Paleta.texto)
                            Spacer()
                            Button {
                                var o = ocu
                                if o.contains(m) { o.remove(m) } else { o.insert(m) }
                                ocultos = o.map(\.rawValue).joined(separator: ",")
                                Haptica.suave()
                            } label: {
                                Image(systemName: ocu.contains(m) ? "eye.slash" : "eye").foregroundStyle(ocu.contains(m) ? Paleta.texto3 : Paleta.oro)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .onMove { desde, hasta in
                        var l = lista
                        l.move(fromOffsets: desde, toOffset: hasta)
                        orden = l.map(\.rawValue).joined(separator: ",")
                        Haptica.suave()
                    }
                } footer: {
                    Text("Arrastra desde ≡ para mover un bloque. El ojo lo oculta. Solo cambia en tu móvil.")
                }
                Section {
                    Button("Volver al orden original") { orden = Modulo.porDefecto; ocultos = ""; Haptica.medio() }
                }
            }
            .environment(\.editMode, .constant(.active))
            .scrollContentBackground(.hidden)
            .navigationTitle("Pantalla principal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { cerrar() } } }
        }
        .presentationBackground(.ultraThinMaterial)
    }
}

/// Mis noches: lo tuyo de todas las noches cerradas (lo guarda el servidor de casa)
struct MisNoches: View {
    @EnvironmentObject var mesa: Mesa
    let u: String
    @State private var noches: [NocheArchivada]?

    struct Mia: Identifiable { let id: Double; let fecha: Date; let pts: Double; let puesto: Int; let de: Int; let c: [Int] }

    var body: some View {
        let mias: [Mia] = (noches ?? []).compactMap { n in
            let filas = (n.j ?? n.top).sorted { ($0[safe: 1]?.numero ?? 0) > ($1[safe: 1]?.numero ?? 0) }
            guard let i = filas.firstIndex(where: { $0[safe: 0]?.texto == u }) else { return nil }
            let f = filas[i]
            let c = f.count > 3 ? (0..<5).map { Int(f[safe: 3 + $0]?.numero ?? 0) } : []
            return Mia(id: n.b, fecha: Date(timeIntervalSince1970: n.a), pts: f[safe: 1]?.numero ?? 0, puesto: i + 1, de: filas.count, c: c)
        }
        let total = mias.reduce(0) { $0 + $1.pts }
        let ganadas = mias.filter { $0.puesto == 1 }.count
        let cervezas = mias.reduce(0) { $0 + ($1.c.first ?? 0) }
        VStack(alignment: .leading, spacing: 12) {
            Etiqueta(texto: "Mis noches")
            if noches == nil {
                Text("Cargando…").font(.system(size: 14)).foregroundStyle(Paleta.texto2)
            } else if mias.isEmpty {
                Text("Cuando se cierre una noche en la que hayas jugado, saldrá aquí tu historial.").font(.system(size: 14)).foregroundStyle(Paleta.texto2)
            } else {
                HStack(spacing: 8) {
                    dato("\(mias.count)", mias.count == 1 ? "noche" : "noches")
                    dato(formatoPuntos(total), "puntos")
                    dato("\(ganadas) 👑", "ganadas")
                    dato("\(cervezas)", "cervezas")
                }
                ForEach(mias.prefix(8)) { m in
                    HStack {
                        Text(m.fecha.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))).font(.system(size: 15, weight: .semibold))
                        Spacer()
                        Text(m.puesto <= 3 ? ["🥇", "🥈", "🥉"][m.puesto - 1] : "\(m.puesto)º de \(m.de)").font(.system(size: 14))
                        Text(formatoPuntos(m.pts)).font(.system(size: 16, weight: .heavy)).foregroundStyle(Paleta.oro).frame(minWidth: 44, alignment: .trailing)
                    }
                }
            }
        }
        .foregroundStyle(Paleta.texto)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cristal(26)
        .task {
            guard let url = URL(string: "\(Birras.api)/api/historial") else { return }
            if let (d, _) = try? await URLSession.shared.data(from: url) { noches = (try? JSONDecoder().decode([NocheArchivada].self, from: d)) ?? [] } else { noches = [] }
        }
    }

    private func dato(_ v: String, _ l: String) -> some View {
        VStack(spacing: 1) {
            Text(v).font(.system(size: 19, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.6)
            Text(l).font(.system(size: 11)).foregroundStyle(Paleta.texto2)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
