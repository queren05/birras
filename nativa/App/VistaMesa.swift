import SwiftUI
import PhotosUI

struct VistaMesa: View {
    @EnvironmentObject var mesa: Mesa
    @State private var corregir: Vista.Jugador?
    @State private var cambiar = false
    var body: some View {
        Pantalla(titulo: "La mesa") {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Etiqueta(texto: "Clasificación")
                    Spacer()
                    Text("puntos · fichas").font(.system(size: 12.5)).foregroundStyle(Paleta.texto3)
                }
                .padding(.horizontal, 8).padding(.bottom, 6)
                TimelineView(.periodic(from: .now, by: 30)) { _ in
                    VStack(spacing: 0) {
                        ForEach(Array(mesa.jugadores.enumerated()), id: \.element.id) { i, j in
                            Button { corregir = j; Haptica.suave() } label: { FilaClasificacion(i: i, j: j) }
                                .buttonStyle(Pulsable())
                        }
                    }
                }
                Text("Toca a alguien para corregir lo que lleva, cambiar su foto o retarle.").font(.system(size: 13)).foregroundStyle(Paleta.texto3)
                    .frame(maxWidth: .infinity).padding(.top, 8)
            }
            .padding(12).cristal(28)
            .animation(.spring(response: 0.45, dampingFraction: 0.8), value: mesa.jugadores.map(\.id))

            UltimasJugadas(cuantas: 15, titulo: "Todas las jugadas")

            Button { cambiar = true } label: {
                Label(mesa.yo.map { "Ahora eres \(mesa.nombre($0)) · cambiar de jugador" } ?? "Elegir jugador", systemImage: "arrow.left.arrow.right")
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(Paleta.texto).frame(maxWidth: .infinity).padding(.vertical, 14).cristal(20, interactivo: true)
            }
            .buttonStyle(Pulsable())
        }
        .sheet(item: $corregir) { j in HojaCorregir(u: j.id).environmentObject(mesa) }
        .alert("¿Cambiar de jugador?", isPresented: $cambiar) {
            Button("Cambiar", role: .destructive) { mesa.cambiandoSilla = true }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text(mesa.yo.map { "Ahora eres \(mesa.nombre($0)). Si cambias, todo lo que apuntes desde este móvil contará para otra persona." } ?? "")
        }
    }
}

struct FilaClasificacion: View {
    @EnvironmentObject var mesa: Mesa
    let i: Int
    let j: Vista.Jugador
    var body: some View {
        let seg = max(0, mesa.ahora - j.ultima)
        let cub = j.principal == "cubata"
        HStack(spacing: 10) {
            Text("\(i + 1)").font(.system(size: 15, weight: .heavy)).foregroundStyle(Paleta.texto3).frame(width: 18)
            Avatar(u: j.id, lado: 42)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(j.nombre).font(.system(size: 17, weight: .bold))
                    if i < 3 && j.pts > 0 { Text(["🥇", "🥈", "🥉"][i]).font(.system(size: 14)) }
                    if j.castigos > 0 { InsigniaCastigo(n: j.castigos) }
                }
                Text(iconos(j, mesa.C)).font(.system(size: 13)).foregroundStyle(Paleta.texto2).lineLimit(1)
                Text(j.seco ? "Seco hace \(horas(seg))" : "\(cub ? "Último cubata" : "Última cerveza") hace \(horas(seg))")
                    .font(.system(size: 12.5, weight: j.seco ? .bold : .regular)).foregroundStyle(j.seco ? Paleta.mal : Paleta.texto3)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 0) {
                Text(j.ptsTxt).font(.system(size: 22, weight: .heavy, design: .rounded))
                Text("\(j.fichas) fichas").font(.system(size: 12, weight: .semibold)).foregroundStyle(Paleta.oro.opacity(0.9))
            }
            .monospacedDigit()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(Paleta.texto3)
        }
        .foregroundStyle(Paleta.texto)
        .padding(.horizontal, 8).padding(.vertical, 9)
        .background(j.id == mesa.yo ? Color.white.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(Rectangle())
    }
}

/// Corregir lo que lleva alguien, cambiarle la foto y retarle.
struct HojaCorregir: View {
    @EnvironmentObject var mesa: Mesa
    @Environment(\.dismiss) private var cerrar
    let u: String
    @State private var foto: PhotosPickerItem?
    @State private var cantReto = 25

    var body: some View {
        let j = mesa.jugador(u)
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Avatar(u: u, lado: 84).padding(.top, 6)
                    Text("Cada toque se apunta al momento. Se puede deshacer.").font(.system(size: 14)).foregroundStyle(Paleta.texto2)
                    VStack(spacing: 8) {
                        ForEach(mesa.C.tipos) { T in
                            let n = j?.c[mesa.indice(T.id)] ?? 0
                            HStack(spacing: 12) {
                                Text(T.ico).font(.system(size: 26))
                                Text(T.plural).font(.system(size: 17, weight: .bold))
                                Spacer()
                                botonRedondo("minus", rojo: true) { if n > 0 { mesa.apuntar(u, T.id, -1, fix: true) } }.disabled(n == 0)
                                Text("\(n)").font(.system(size: 22, weight: .heavy, design: .rounded)).monospacedDigit().frame(minWidth: 34).contentTransition(.numericText())
                                botonRedondo("plus") { mesa.apuntar(u, T.id, 1, fix: true) }
                            }
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                    }
                    HStack(spacing: 10) {
                        PhotosPicker(selection: $foto, matching: .images) {
                            Label(mesa.fotos[u] == nil ? "Poner foto" : "Cambiar foto", systemImage: "camera.fill").font(.system(size: 15, weight: .bold))
                                .padding(.horizontal, 16).padding(.vertical, 11).background(.white.opacity(0.14), in: Capsule())
                        }
                        if mesa.fotos[u] != nil {
                            Button("Quitar foto") { mesa.quitarFoto(u) }.font(.system(size: 15, weight: .bold))
                                .padding(.horizontal, 16).padding(.vertical, 11).background(.white.opacity(0.08), in: Capsule())
                        }
                    }
                    if !mesa.pila.isEmpty {
                        Button { mesa.deshacer() } label: {
                            Label("Deshacer lo último", systemImage: "arrow.uturn.backward").font(.system(size: 15, weight: .bold))
                        }
                    }
                    if let y = mesa.yo, y != u { Retar(u: u, cant: $cantReto) }
                }
                .foregroundStyle(Paleta.texto)
                .padding(18)
            }
            .navigationTitle("Corregir a \(mesa.nombre(u))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { cerrar() } } }
        }
        .presentationDetents([.large])
        .presentationBackground(.ultraThinMaterial)
        .onChange(of: foto) { _, item in
            guard let item else { return }
            Task {
                if let d = try? await item.loadTransferable(type: Data.self), let im = UIImage(data: d) { mesa.ponerFoto(im, para: u) }
                else { mesa.avisar("No se ha podido leer esa imagen. Prueba con otra.") }
                foto = nil
            }
        }
    }

    private func botonRedondo(_ s: String, rojo: Bool = false, _ f: @escaping () -> Void) -> some View {
        Button(action: f) {
            Image(systemName: s).font(.system(size: 18, weight: .heavy)).frame(width: 42, height: 42)
                .background(rojo ? Paleta.mal.opacity(0.75) : Color.white.opacity(0.18), in: Circle())
        }
        .buttonStyle(Pulsable())
    }
}

struct Retar: View {
    @EnvironmentObject var mesa: Mesa
    @Environment(\.dismiss) private var cerrar
    let u: String
    @Binding var cant: Int
    var body: some View {
        let mias = mesa.vista?.mio?.fichas ?? 0
        let suyas = mesa.jugador(u)?.fichas ?? 0
        let ops = [10, 25, 50, 100, 250, 500, 1000].filter { $0 <= min(mias, suyas) }
        let ya = (mesa.vista?.retos ?? []).contains { $0.de == mesa.yo && $0.a == u }
        VStack(spacing: 10) {
            Divider().overlay(.white.opacity(0.12))
            Text("🤺 Retar a \(mesa.nombre(u))").font(.system(size: 18, weight: .heavy))
            Text("Si se bebe otra en 10 minutos se lleva las fichas de los dos. Si no, te las llevas tú.").font(.system(size: 14)).foregroundStyle(Paleta.texto2).multilineTextAlignment(.center)
            if ya {
                Text("Ya tienes un reto pendiente con \(mesa.nombre(u)).").font(.system(size: 14)).foregroundStyle(Paleta.texto2)
            } else if ops.isEmpty {
                Text("Hacen falta 10 fichas cada uno (tú \(mias), \(mesa.nombre(u)) \(suyas)).").font(.system(size: 14)).foregroundStyle(Paleta.texto2)
            } else {
                HStack(spacing: 8) {
                    ForEach(ops, id: \.self) { x in
                        Button("\(x)") { cant = x; Haptica.suave() }
                            .font(.system(size: 15, weight: .heavy)).padding(.horizontal, 14).padding(.vertical, 8)
                            .background(cant == x ? Paleta.oro : Color.white.opacity(0.14), in: Capsule())
                            .foregroundStyle(cant == x ? Color(hex: 0x2a1100) : Paleta.texto)
                    }
                }
                Button {
                    mesa.retar(u, cant: ops.contains(cant) ? cant : ops[0]); cerrar()
                } label: {
                    Text("Retar por \(ops.contains(cant) ? cant : ops[0]) fichas").font(.system(size: 17, weight: .heavy)).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(LinearGradient(colors: [Paleta.fresa, Paleta.ambar], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .foregroundStyle(.white)
                }
                .buttonStyle(Pulsable())
            }
        }
    }
}
