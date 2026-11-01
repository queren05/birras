import Foundation
import AppIntents
import ActivityKit

/// Lo que comparten la app y los widgets (sin App Group: KSign no lo conserva, así que
/// los widgets leen del servidor de casa y el botón publica directamente en el canal).
enum Birras {
    static let topic = "birras-de6849b089e68e5f"
    static let ntfy = "https://ntfy.sh"
    static let api = "https://servidor.tail9fb7ef.ts.net"
    static var urlTopic: URL { URL(string: "\(ntfy)/\(topic)")! }

    static let fijos: [(String, String)] = [("jorlo", "Jorlo"), ("alvaro", "Álvaro"), ("david", "David"), ("bianca", "Bianca"), ("noelia", "Noelia"), ("aitor", "Aitor")]

    static func eid() -> String { String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8)).lowercased() }

    /// Publica un mensaje en el canal de la mesa.
    @discardableResult
    static func publicar(_ d: [String: Any]) async -> Bool {
        guard let cuerpo = try? JSONSerialization.data(withJSONObject: d) else { return false }
        var r = URLRequest(url: urlTopic)
        r.httpMethod = "POST"; r.httpBody = cuerpo; r.timeoutInterval = 15
        guard let (_, resp) = try? await URLSession.shared.data(for: r), let h = resp as? HTTPURLResponse else { return false }
        return (200..<300).contains(h.statusCode)
    }
}

/// /api/estado: lo escribe el guardián del servidor cada 5 minutos.
struct Resumen: Codable {
    struct Jugador: Codable, Identifiable {
        var id: String
        var nombre: String
        var pts: Double
        var fichas: Int
        var ultima: Double
        var principal: String
        var activo: Bool?
    }
    var t: Double
    var t0: Double
    var cervezas: Int
    var puntos: Double
    var tot: [String: Int]
    var jugadores: [Jugador]

    static func cargar() async throws -> Resumen {
        var r = URLRequest(url: URL(string: "\(Birras.api)/api/estado")!)
        r.cachePolicy = .reloadIgnoringLocalCacheData; r.timeoutInterval = 12
        let (d, _) = try await URLSession.shared.data(for: r)
        return try JSONDecoder().decode(Resumen.self, from: d)
    }
}

func formatoPuntos(_ n: Double) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "es_ES"); f.maximumFractionDigits = 1; f.minimumFractionDigits = 0
    return f.string(from: NSNumber(value: n)) ?? "\(n)"
}

// MARK: - Intenciones (Siri, Atajos y botón del Centro de Control)

enum TipoBebida: String, AppEnum, CaseIterable {
    case cerveza, cubata, chupito, cigarro, porro

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Consumición"
    static var caseDisplayRepresentations: [TipoBebida: DisplayRepresentation] = [
        .cerveza: "Cerveza", .cubata: "Cubata", .chupito: "Chupito", .cigarro: "Cigarro", .porro: "Porro",
    ]
    var un: String {
        switch self {
        case .cerveza: return "una cerveza"
        case .cubata: return "un cubata"
        case .chupito: return "un chupito"
        case .cigarro: return "un cigarro"
        case .porro: return "un porro"
        }
    }
    var ico: String {
        switch self {
        case .cerveza: return "🍺"
        case .cubata: return "🥃"
        case .chupito: return "🥂"
        case .cigarro: return "🚬"
        case .porro: return "🌿"
        }
    }
    var simbolo: String {
        switch self {
        case .cerveza: return "mug.fill"
        case .cubata: return "wineglass.fill"
        case .chupito: return "drop.fill"
        case .cigarro: return "flame.fill"
        case .porro: return "leaf.fill"
        }
    }
}

struct JugadorEntity: AppEntity {
    var id: String
    var nombre: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Jugador"
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(nombre)") }
    static var defaultQuery = JugadorQuery()
}

struct JugadorQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [JugadorEntity] {
        try await suggestedEntities().filter { identifiers.contains($0.id) }
    }
    func suggestedEntities() async throws -> [JugadorEntity] {
        if let r = try? await Resumen.cargar(), !r.jugadores.isEmpty {
            return r.jugadores.map { JugadorEntity(id: $0.id, nombre: $0.nombre) }
        }
        return Birras.fijos.map { JugadorEntity(id: $0.0, nombre: $0.1) }
    }
}

struct ApuntarIntent: AppIntent {
    static var title: LocalizedStringResource = "Apuntar en Birras"
    static var description = IntentDescription("Suma una consumición al bote de la mesa.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Qué", default: .cerveza)
    var tipo: TipoBebida

    @Parameter(title: "Quién")
    var jugador: JugadorEntity?

    init() {}
    init(tipo: TipoBebida, jugador: JugadorEntity?) {
        self.tipo = tipo
        self.jugador = jugador
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let u = jugador?.id ?? UserDefaults.standard.string(forKey: "birras-yo")
        guard let u, !u.isEmpty else {
            return .result(dialog: "Abre Birras y elige quién eres primero.")
        }
        let ok = await Birras.publicar(["k": "ev", "u": u, "t": tipo.rawValue, "n": 1, "por": u, "eid": Birras.eid()])
        let nombre = jugador?.nombre ?? Birras.fijos.first(where: { $0.0 == u })?.1 ?? u
        return .result(dialog: ok ? "\(tipo.ico) Apuntado: \(tipo.un) para \(nombre)." : "No hay conexión. Prueba otra vez en un momento.")
    }
}

@available(iOS 18.0, *)
struct ConfigControl: ControlConfigurationIntent {
    static var title: LocalizedStringResource = "Botón de Birras"
    @Parameter(title: "Quién") var jugador: JugadorEntity?
    @Parameter(title: "Qué", default: .cerveza) var tipo: TipoBebida
    init() {}
}

// MARK: - Isla Dinámica

struct BirrasAtributos: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var cervezas: Int
        var puntos: String
        var misPuntos: String
        var puesto: Int
        var ultima: Date
        var lider: String
        var seco: Bool
        var bebida: String
    }
    var jugador: String
}
