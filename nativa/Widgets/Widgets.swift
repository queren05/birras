import WidgetKit
import SwiftUI
import AppIntents
import ActivityKit

@main
struct BirrasWidgets: WidgetBundle {
    var body: some Widget {
        WidgetBote()
        ActividadBirras()
        ControlBirra()
    }
}

private let oro = Color(red: 1, green: 0.81, blue: 0.23)
private let ambar = Color(red: 1, green: 0.6, blue: 0.1)
private let fondo = LinearGradient(colors: [Color(red: 0.36, green: 0.06, blue: 0.17), Color(red: 0.09, green: 0.02, blue: 0.05)], startPoint: .topLeading, endPoint: .bottomTrailing)

// MARK: - Widget del bote (pantalla de inicio y de bloqueo)

struct ConfigWidget: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Tu jugador"
    static var description = IntentDescription("Elige quién eres para ver tus puntos y cuánto llevas seco.")
    @Parameter(title: "Quién") var jugador: JugadorEntity?
    init() {}
}

struct Entrada: TimelineEntry {
    let date: Date
    let resumen: Resumen?
    let jugador: String?
}

struct Proveedor: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> Entrada { Entrada(date: .now, resumen: nil, jugador: nil) }
    func snapshot(for configuration: ConfigWidget, in context: Context) async -> Entrada {
        Entrada(date: .now, resumen: try? await Resumen.cargar(), jugador: configuration.jugador?.id)
    }
    func timeline(for configuration: ConfigWidget, in context: Context) async -> Timeline<Entrada> {
        let r = try? await Resumen.cargar()
        return Timeline(entries: [Entrada(date: .now, resumen: r, jugador: configuration.jugador?.id)], policy: .after(.now.addingTimeInterval(15 * 60)))
    }
}

struct WidgetBote: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "es.david.birras.pro.bote", intent: ConfigWidget.self, provider: Proveedor()) { e in
            VistaWidget(e: e).containerBackground(for: .widget) { fondo }
        }
        .configurationDisplayName("El bote")
        .description("Las cervezas de la mesa, la clasificación y tu reloj sin beber.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct VistaWidget: View {
    @Environment(\.widgetFamily) private var familia
    let e: Entrada
    var body: some View {
        let r = e.resumen
        let yo = r?.jugadores.first { $0.id == e.jugador }
        let pos = (r?.jugadores.firstIndex { $0.id == e.jugador }).map { $0 + 1 }
        switch familia {
        case .accessoryInline:
            Text("🍺 \(r?.cervezas ?? 0) en el bote" + (yo.map { " · tú \(formatoPuntos($0.pts))" } ?? ""))
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: -2) {
                    Text("🍺").font(.system(size: 14))
                    Text("\(r?.cervezas ?? 0)").font(.system(size: 22, weight: .black, design: .rounded))
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("🍺 \(r?.cervezas ?? 0) · \(formatoPuntos(r?.puntos ?? 0)) pts").font(.system(size: 15, weight: .heavy, design: .rounded))
                if let yo {
                    Text("Tú: \(pos ?? 0)º · \(formatoPuntos(yo.pts)) pts").font(.system(size: 13, weight: .semibold))
                    (Text("seco hace ") + Text(Date(timeIntervalSince1970: yo.ultima), style: .relative)).font(.system(size: 12)).foregroundStyle(.secondary)
                } else if let l = r?.jugadores.first, l.pts > 0 {
                    Text("👑 \(l.nombre) \(formatoPuntos(l.pts))").font(.system(size: 13, weight: .semibold))
                }
            }
        case .systemMedium:
            HStack(spacing: 14) {
                bote(r).frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(Array((r?.jugadores ?? []).prefix(4).enumerated()), id: \.element.id) { i, j in
                        HStack(spacing: 6) {
                            Text(["🥇", "🥈", "🥉", "4."][i]).font(.system(size: 12))
                            Text(j.nombre).font(.system(size: 14, weight: j.id == e.jugador ? .heavy : .semibold)).lineLimit(1)
                            Spacer(minLength: 2)
                            Text(formatoPuntos(j.pts)).font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundStyle(oro)
                        }
                    }
                    if r == nil { Text("Sin conexión con el servidor de casa").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)) }
                }
                .frame(maxWidth: .infinity)
            }
            .foregroundStyle(.white)
        default:
            VStack(alignment: .leading, spacing: 4) {
                bote(r)
                Spacer(minLength: 0)
                if let yo {
                    Text("Tú \(formatoPuntos(yo.pts)) pts · \(pos ?? 0)º").font(.system(size: 13, weight: .bold))
                    (Text("seco ") + Text(Date(timeIntervalSince1970: yo.ultima), style: .relative)).font(.system(size: 12)).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
                }
            }
            .foregroundStyle(.white)
        }
    }

    private func bote(_ r: Resumen?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("EL BOTE").font(.system(size: 10, weight: .heavy)).tracking(1.4).foregroundStyle(.white.opacity(0.7))
            Text("\(r?.cervezas ?? 0)").font(.system(size: 48, weight: .black, design: .rounded))
                .foregroundStyle(LinearGradient(colors: [oro, ambar], startPoint: .top, endPoint: .bottom))
                .minimumScaleFactor(0.6)
            Text("\(formatoPuntos(r?.puntos ?? 0)) puntos").font(.system(size: 13, weight: .bold))
        }
        .foregroundStyle(.white)
    }
}

// MARK: - Botón del Centro de Control (y de la pantalla de bloqueo / botón de acción)

struct ControlBirra: ControlWidget {
    var body: some ControlWidgetConfiguration {
        AppIntentControlConfiguration(kind: "es.david.birras.pro.control", intent: ConfigControl.self) { c in
            ControlWidgetButton(action: ApuntarIntent(tipo: c.tipo, jugador: c.jugador)) {
                Label("\(c.tipo.ico) +1 \(c.jugador?.nombre ?? "")", systemImage: c.tipo.simbolo)
            }
        }
        .displayName("Apuntar en Birras")
        .description("Suma una consumición al bote sin abrir la app.")
    }
}

// MARK: - Isla Dinámica y pantalla de bloqueo

struct ActividadBirras: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BirrasAtributos.self) { ctx in
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("EL BOTE").font(.system(size: 10, weight: .heavy)).tracking(1.4).foregroundStyle(.white.opacity(0.7))
                    Text("🍺 \(ctx.state.cervezas)").font(.system(size: 34, weight: .black, design: .rounded)).foregroundStyle(oro)
                    Text("\(ctx.state.puntos) puntos · 👑 \(ctx.state.lider)").font(.system(size: 13, weight: .semibold))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(ctx.attributes.jugador) · \(ctx.state.puesto)º").font(.system(size: 13, weight: .bold))
                    Text("\(ctx.state.misPuntos) pts").font(.system(size: 20, weight: .heavy, design: .rounded))
                    HStack(spacing: 4) {
                        Text(ctx.state.bebida == "cubata" ? "🥃" : "🍺")
                        Text(ctx.state.ultima, style: .timer).monospacedDigit()
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(ctx.state.seco ? Color.red : .white)
                }
            }
            .foregroundStyle(.white)
            .padding(16)
            .activityBackgroundTint(Color(red: 0.16, green: 0.03, blue: 0.08))
            .activitySystemActionForegroundColor(oro)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("🍺 \(ctx.state.cervezas)").font(.system(size: 26, weight: .black, design: .rounded)).foregroundStyle(oro)
                        Text("\(ctx.state.puntos) pts").font(.system(size: 12, weight: .semibold))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(ctx.state.misPuntos) pts").font(.system(size: 20, weight: .heavy, design: .rounded))
                        Text("\(ctx.state.puesto)º de la mesa").font(.system(size: 12))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text("👑 \(ctx.state.lider)").font(.system(size: 13, weight: .semibold))
                        Spacer()
                        Text(ctx.state.bebida == "cubata" ? "Último cubata hace" : "Última birra hace").font(.system(size: 13))
                        Text(ctx.state.ultima, style: .timer).monospacedDigit().font(.system(size: 13, weight: .bold))
                            .foregroundStyle(ctx.state.seco ? Color.red : oro)
                            .frame(maxWidth: 70)
                    }
                }
            } compactLeading: {
                Text("🍺\(ctx.state.cervezas)").font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundStyle(oro)
            } compactTrailing: {
                Text(ctx.state.ultima, style: .timer).monospacedDigit().font(.system(size: 13, weight: .bold))
                    .foregroundStyle(ctx.state.seco ? Color.red : .white)
                    .frame(maxWidth: 52)
            } minimal: {
                Text("\(ctx.state.cervezas)").font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundStyle(oro)
            }
            .keylineTint(oro)
        }
    }
}
