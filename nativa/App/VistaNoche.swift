import SwiftUI
import Charts

struct VistaNoche: View {
    @EnvironmentObject var mesa: Mesa
    @State private var imagen: ImagenCompartir?
    var body: some View {
        Pantalla(titulo: "La noche") {
            Subtitulo()
            Grafico()
            Records()
            Button { compartir() } label: {
                Label("Compartir el resumen de la noche", systemImage: "square.and.arrow.up")
                    .font(.system(size: 17, weight: .heavy)).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(LinearGradient(colors: [Color(hex: 0xffd84a), Paleta.ambar], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .foregroundStyle(Color(hex: 0x2a1100))
            }
            .buttonStyle(Pulsable())
            Historico()
            NochesAnteriores()
        }
        .sheet(item: $imagen) { i in
            HojaCompartir(imagen: i.imagen)
        }
    }

    @MainActor private func compartir() {
        guard let v = mesa.vista, (v.puntos ?? 0) > 0 else { mesa.avisar("Todavía no hay nada que presumir."); return }
        Haptica.medio()
        let r = ImageRenderer(content: ResumenImagen().environmentObject(mesa).frame(width: 360, height: 450))
        r.scale = 3
        if let ui = r.uiImage { imagen = ImagenCompartir(imagen: ui) }
    }
}

struct ImagenCompartir: Identifiable { let id = UUID(); let imagen: UIImage }

struct HojaCompartir: View {
    let imagen: UIImage
    var body: some View {
        VStack(spacing: 18) {
            Image(uiImage: imagen).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous)).shadow(radius: 20)
            ShareLink(item: Image(uiImage: imagen), preview: SharePreview("La noche en Casino Birras", image: Image(uiImage: imagen))) {
                Label("Compartir", systemImage: "square.and.arrow.up").font(.system(size: 18, weight: .heavy)).frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(Paleta.oro, in: RoundedRectangle(cornerRadius: 18, style: .continuous)).foregroundStyle(Color(hex: 0x2a1100))
            }
        }
        .padding(24)
        .presentationDetents([.large])
        .presentationBackground(.ultraThinMaterial)
    }
}

struct Subtitulo: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let v = mesa.vista
        let jugaron = mesa.jugadores.filter { $0.c.contains { $0 > 0 } }.count
        Text((v?.t0 ?? 0) > 0
             ? "Empezó a las \(Date(timeIntervalSince1970: v?.t0 ?? 0).formatted(.dateTime.hour().minute())) · lleva \(horas(mesa.ahora - (v?.t0 ?? 0))) · \(jugaron) en la mesa"
             : "Todavía no ha empezado. La primera la paga la casa (mentira).")
            .font(.system(size: 15)).foregroundStyle(Paleta.texto2).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
    }
}

struct Grafico: View {
    @EnvironmentObject var mesa: Mesa
    struct Punto: Identifiable { let id = UUID(); let t: Date; let tipo: String; let n: Int }
    var body: some View {
        let hist = mesa.vista?.hist ?? []
        let puntos: [Punto] = hist.suffix(32).flatMap { q in
            Paleta.ordenVisual.compactMap { t in
                let n = q.f[safe: mesa.indice(t)] ?? 0
                return n > 0 ? Punto(t: Date(timeIntervalSince1970: q.t), tipo: mesa.C.tipo(t).plural, n: n) : nil
            }
        }
        VStack(alignment: .leading, spacing: 10) {
            Etiqueta(texto: "Consumiciones cada 15 min")
            if puntos.isEmpty {
                Text("El gráfico aparece con la primera consumición.").font(.system(size: 15)).foregroundStyle(Paleta.texto2).frame(maxWidth: .infinity, minHeight: 120)
            } else {
                Chart(puntos) { p in
                    BarMark(x: .value("Hora", p.t, unit: .minute), y: .value("Cuántas", p.n), width: .ratio(0.7))
                        .foregroundStyle(by: .value("Tipo", p.tipo))
                        .cornerRadius(3)
                }
                .chartForegroundStyleScale(domain: Paleta.ordenVisual.map { mesa.C.tipo($0).plural }, range: Paleta.ordenVisual.map { Paleta.tipo($0) })
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) { _ in AxisGridLine().foregroundStyle(.white.opacity(0.06)); AxisValueLabel(format: .dateTime.hour().minute()).foregroundStyle(Paleta.texto3) } }
                .chartYAxis { AxisMarks(position: .leading) { _ in AxisGridLine().foregroundStyle(.white.opacity(0.08)); AxisValueLabel().foregroundStyle(Paleta.texto3) } }
                .chartLegend(position: .top, alignment: .leading)
                .frame(height: 200)
            }
        }
        .padding(16).cristal(28)
    }
}

struct Records: View {
    @EnvironmentObject var mesa: Mesa
    private let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    var body: some View {
        LazyVGrid(columns: cols, spacing: 12) {
            ForEach(mesa.vista?.records ?? []) { r in
                VStack(alignment: .leading, spacing: 3) {
                    Etiqueta(texto: r.etq)
                    Text(r.valor).font(.system(size: 24, weight: .black, design: .rounded)).lineLimit(1).minimumScaleFactor(0.6)
                    Text(r.sub).font(.system(size: 13.5)).foregroundStyle(Paleta.texto2)
                }
                .foregroundStyle(Paleta.texto)
                .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                .padding(14).cristal(22)
            }
        }
    }
}

struct NochesAnteriores: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let ns = mesa.vista?.noches ?? []
        VStack(alignment: .leading, spacing: 0) {
            Etiqueta(texto: "Noches anteriores").padding(.horizontal, 6).padding(.bottom, 8)
            if ns.isEmpty { Text("Cuando cerréis una noche, su resumen quedará aquí.").font(.system(size: 15)).foregroundStyle(Paleta.texto2).padding(6) }
            ForEach(ns) { n in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(Date(timeIntervalSince1970: n.a).formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))).font(.system(size: 16, weight: .bold))
                        Spacer()
                        Text("\(Date(timeIntervalSince1970: n.a).formatted(.dateTime.hour().minute()))–\(Date(timeIntervalSince1970: n.b).formatted(.dateTime.hour().minute())) · \(horas(n.b - n.a))")
                            .font(.system(size: 13)).foregroundStyle(Paleta.texto2)
                    }
                    Text(mesa.C.orden.enumerated().compactMap { i, t in (n.c[safe: i] ?? 0) > 0 || i < 4 ? "\(mesa.C.tipo(t).ico) \(n.c[safe: i] ?? 0)" : nil }.joined(separator: " · ") + " · \(n.pTxt) puntos")
                        .font(.system(size: 14)).foregroundStyle(Paleta.texto2)
                    Text(n.top.enumerated().map { i, x in "\(["🥇", "🥈", "🥉"][safe: i] ?? "") \(x.nombre) \(x.ptsTxt)" }.joined(separator: "   ")).font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(Paleta.texto)
                .padding(.vertical, 10).padding(.horizontal, 6)
            }
        }
        .padding(12).cristal(26)
    }
}

// MARK: - Histórico por meses (lo guarda el servidor de casa)

struct Historico: View {
    @EnvironmentObject var mesa: Mesa
    @State private var noches: [NocheArchivada]?
    @State private var error = false
    @State private var mes: String?

    private func clave(_ t: Double) -> String {
        let c = Calendar.current.dateComponents([.year, .month], from: Date(timeIntervalSince1970: t))
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }
    private func nombreMes(_ k: String) -> String {
        let p = k.split(separator: "-").compactMap { Int($0) }
        guard p.count == 2, let d = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: 1)) else { return k }
        return d.formatted(.dateTime.month(.wide).year()).capitalized
    }

    struct Fila: Identifiable { let id: String; var pts = 0.0; var noches = 0; var c = [0, 0, 0, 0, 0]; var mejor = 0.0; var ganadas = 0 }

    var body: some View {
        let todas = noches ?? []
        let meses = Array(Set(todas.map { clave($0.b) })).sorted(by: >)
        let sel = mes.flatMap { meses.contains($0) ? $0 : nil } ?? meses.first
        let delMes = todas.filter { clave($0.b) == sel }
        let filas = calcular(delMes)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Etiqueta(texto: sel == clave(Date().timeIntervalSince1970) ? "Este mes" : sel.map(nombreMes) ?? "Histórico")
                Spacer()
                if !delMes.isEmpty { Text("\(delMes.count) \(delMes.count == 1 ? "noche" : "noches") · puntos sumados").font(.system(size: 12.5)).foregroundStyle(Paleta.texto2) }
            }
            .padding(.horizontal, 6)
            if meses.count > 1 {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(meses, id: \.self) { k in
                            Button(nombreMes(k)) { mes = k; Haptica.suave() }
                                .font(.system(size: 13.5, weight: .bold)).padding(.horizontal, 12).padding(.vertical, 6)
                                .background(k == sel ? Color.white.opacity(0.9) : Color.white.opacity(0.1), in: Capsule())
                                .foregroundStyle(k == sel ? Color(hex: 0x2a0f1f) : Paleta.texto)
                        }
                    }
                    .padding(.horizontal, 6)
                }
                .scrollIndicators(.hidden)
            }
            if noches == nil {
                Text(error ? "No se puede conectar con el servidor de casa ahora mismo." : "Cargando el histórico…").font(.system(size: 15)).foregroundStyle(Paleta.texto2).padding(6)
            } else if todas.isEmpty {
                Text("Cuando se cierre la primera noche, aquí saldrá quién manda en el mes.").font(.system(size: 15)).foregroundStyle(Paleta.texto2).padding(6)
            }
            ForEach(Array(filas.enumerated()), id: \.element.id) { i, f in
                HStack(spacing: 10) {
                    Text(i < 3 ? ["🥇", "🥈", "🥉"][i] : "\(i + 1)").font(.system(size: 15, weight: .heavy)).frame(width: 24).foregroundStyle(Paleta.texto2)
                    Avatar(u: f.id, lado: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(mesa.nombre(f.id)).font(.system(size: 16, weight: .bold))
                        Text(detalle(f)).font(.system(size: 12.5)).foregroundStyle(Paleta.texto2).lineLimit(1)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(formatoPuntos(f.pts)).font(.system(size: 19, weight: .black, design: .rounded))
                        Text("mejor \(formatoPuntos(f.mejor))").font(.system(size: 12)).foregroundStyle(Paleta.texto2)
                    }
                    .monospacedDigit()
                }
                .foregroundStyle(Paleta.texto)
                .padding(.vertical, 6).padding(.horizontal, 6)
            }
        }
        .padding(12).cristal(26)
        .task { await cargar() }
    }

    private func detalle(_ f: Fila) -> String {
        var s = "\(f.noches) \(f.noches == 1 ? "noche" : "noches")"
        if f.ganadas > 0 { s += " · \(f.ganadas) 👑" }
        let ic = mesa.C.orden.enumerated().compactMap { i, t in f.c[i] > 0 ? "\(mesa.C.tipo(t).ico)\(f.c[i])" : nil }.joined(separator: " ")
        if !ic.isEmpty { s += " · " + ic }
        return s
    }

    private func calcular(_ ns: [NocheArchivada]) -> [Fila] {
        var acu: [String: Fila] = [:]
        for n in ns {
            let filas = n.j ?? n.top
            var mejorNoche: (String, Double)?
            for f in filas {
                let u = f[safe: 0]?.texto ?? ""
                guard !u.isEmpty else { continue }
                let p = f[safe: 1]?.numero ?? 0
                var A = acu[u] ?? Fila(id: u)
                A.pts += p; A.noches += 1; A.mejor = max(A.mejor, p)
                if f.count > 3 { for i in 0..<5 { A.c[i] += Int(f[safe: 3 + i]?.numero ?? 0) } }
                acu[u] = A
                if p > (mejorNoche?.1 ?? -1) { mejorNoche = (u, p) }
            }
            if let g = mejorNoche { acu[g.0]?.ganadas += 1 }
        }
        return acu.values.sorted { $0.pts > $1.pts }
    }

    private func cargar() async {
        guard let url = URL(string: "\(Birras.api)/api/historial") else { return }
        var r = URLRequest(url: url); r.cachePolicy = .reloadIgnoringLocalCacheData; r.timeoutInterval = 12
        do {
            let (d, _) = try await URLSession.shared.data(for: r)
            noches = try JSONDecoder().decode([NocheArchivada].self, from: d)
            error = false
        } catch { self.error = true }
    }
}

// MARK: - Imagen para compartir (sin cristal: ImageRenderer no pinta materiales)

struct ResumenImagen: View {
    @EnvironmentObject var mesa: Mesa
    var body: some View {
        let v = mesa.vista
        let orden = mesa.jugadores.filter { $0.pts > 0 }
        let ahora = mesa.ahora
        let fecha = Date(timeIntervalSince1970: (v?.t0 ?? 0) > 0 ? v!.t0! : ahora).formatted(.dateTime.weekday(.wide).day().month(.wide))
        ZStack {
            LinearGradient(colors: [Color(hex: 0x3a0a1e), Color(hex: 0x1a0610), Color(hex: 0x0d0308)], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [Paleta.ambar.opacity(0.35), .clear], center: UnitPoint(x: 0.85, y: 0.08), startRadius: 4, endRadius: 220)
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("CASINO BIRRAS").font(.system(size: 12, weight: .heavy)).tracking(1.5).foregroundStyle(Paleta.oro)
                        Text(fecha.prefix(1).uppercased() + fecha.dropFirst()).font(.system(size: 17, weight: .bold))
                    }
                    Spacer()
                    if let t0 = v?.t0, t0 > 0 {
                        Text("\(Date(timeIntervalSince1970: t0).formatted(.dateTime.hour().minute()))–\(Date(timeIntervalSince1970: ahora).formatted(.dateTime.hour().minute()))")
                            .font(.system(size: 11, weight: .semibold)).foregroundStyle(Paleta.texto2)
                    }
                }
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text("\(v?.cervezas ?? 0)").font(.system(size: 76, weight: .black, design: .rounded)).foregroundStyle(Paleta.oro)
                    VStack(alignment: .leading, spacing: 0) {
                        Text((v?.cervezas ?? 0) == 1 ? "cerveza" : "cervezas").font(.system(size: 18, weight: .bold))
                        Text("\(v?.ptsTxt ?? "0") puntos en el bote").font(.system(size: 13, weight: .semibold)).foregroundStyle(Paleta.texto2)
                    }
                    .padding(.bottom, 12)
                }
                Text(mesa.C.orden.enumerated().map { i, t in "\(mesa.C.tipo(t).ico) \(v?.tot?[safe: i] ?? 0)" }.joined(separator: "   ")).font(.system(size: 15, weight: .bold))
                VStack(spacing: 6) {
                    ForEach(Array(orden.prefix(5).enumerated()), id: \.element.id) { i, j in
                        HStack(spacing: 10) {
                            Avatar(u: j.id, lado: 28)
                            VStack(alignment: .leading, spacing: 0) {
                                Text("\(["🥇", "🥈", "🥉"][safe: i] ?? "\(i + 1).") \(j.nombre)").font(.system(size: 15, weight: .bold))
                                Text(iconos(j, mesa.C)).font(.system(size: 11)).foregroundStyle(Paleta.texto2)
                            }
                            Spacer()
                            Text(j.ptsTxt).font(.system(size: 19, weight: .black, design: .rounded)).foregroundStyle(Paleta.oro)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(i == 0 ? Paleta.oro.opacity(0.16) : Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
                Spacer(minLength: 0)
                let rec = v?.records ?? []
                HStack(spacing: 8) {
                    ForEach(rec.filter { ["Más rápido", "Más seco", "Mejor combo"].contains($0.etq) }) { r in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(r.etq).font(.system(size: 10, weight: .bold)).foregroundStyle(Paleta.texto2)
                            Text(r.valor).font(.system(size: 14, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8).background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }
            .foregroundStyle(Paleta.texto)
            .padding(20)
        }
        .fontDesign(.rounded)
    }
}
