import Foundation

/// Lo que devuelve P.vista() de puente.js.
struct Vista: Decodable {
    struct Jugador: Decodable, Identifiable, Equatable {
        let id: String
        let nombre: String
        let pts: Double
        let ptsTxt: String
        let fichas: Int
        let c: [Int]
        let ultima: Double
        let principal: String
        let seco: Bool
        let castigos: Int
        let combo: Int
        let maxCombo: Int
        let racha: Int
        let escudo: Double
        let ultBebida: Double
        let primera: Double
    }
    struct Mio: Decodable {
        let id: String
        let fichas: Int
        let principal: String
        let sigTxt: String
        let pills: [String]
        let ultima: Double
        let seco: Bool
        let bronca: String?
        let pos: Int
        let diana: Diana?
    }
    struct Diana: Decodable { let por: String; let t: Double }
    struct Jugada: Decodable, Identifiable {
        let t: Double
        let ico: String
        let txt: String
        var id: String { "\(t)\(txt)" }
    }
    struct Record: Decodable, Identifiable {
        let etq: String
        let valor: String
        let sub: String
        var id: String { etq }
    }
    struct Cuarto: Decodable, Identifiable {
        let t: Double
        let f: [Int]
        var id: Double { t }
    }
    struct Noche: Decodable, Identifiable {
        struct Top: Decodable { let id: String; let nombre: String; let ptsTxt: String }
        let a: Double
        let b: Double
        let c: [Int]
        let p: Double
        let pTxt: String
        let top: [Top]
        var id: Double { b }
    }
    struct Reto: Decodable, Identifiable {
        let rid: String
        let de: String
        let a: String
        let deN: String
        let aN: String
        let cant: Int
        let t: Double
        let hasta: Double
        let copa: Bool
        var id: String { rid }
    }

    struct Porra: Decodable, Identifiable {
        let u: String
        let a: String
        let uN: String
        let aN: String
        let cant: Int
        let t: Double
        var id: String { "\(u)-\(a)-\(t)" }
    }

    let listo: Bool
    let now: Double?
    let jugadores: [Jugador]?
    let cervezas: Int?
    let tot: [Int]?
    let puntos: Double?
    let ptsTxt: String?
    let feed: [Jugada]?
    let muro: String?
    let mio: Mio?
    let records: [Record]?
    let hist: [Cuarto]?
    let noches: [Noche]?
    let retos: [Reto]?
    let porras: [Porra]?
    let t0: Double?
    let rondas: Int?
    let happy: Double?
}

struct Constantes: Decodable {
    struct Tipo: Decodable, Identifiable {
        let id: String
        let pts: Double
        let un: String
        let nombre: String
        let plural: String
        let ico: String
        let fichas: Int
        let bebida: Bool
    }
    struct PowerUp: Decodable, Identifiable {
        let id: String
        let nombre: String
        let ico: String
        let coste: Int
        let desc: String
    }
    let orden: [String]
    let tipos: [Tipo]
    let tienda: [PowerUp]
    let simbolos: [String]
    let slotCoste: Int
    let rascaSimbolos: [String]
    let rascaCoste: Int
    let apuestaMin: Int
    let comboMax: Int
    let comboVentana: Double
    let horaSeca: Double
    let retoEspera: Double
    let admin: String
    let caballos: [String]
    let carreraPaga: Int
    let porraPaga: Int

    func tipo(_ id: String) -> Tipo { tipos.first { $0.id == id } ?? tipos[0] }
}

struct Premio: Decodable {
    let fichas: Int
    let castigo: Bool
    let txt: String
    let gordo: Bool?
    let simbolo: String?
}

struct ResultadoBJ: Decodable {
    let res: String
    let tj: Int
    let tc: Int
}

struct ResultadoApuesta: Decodable {
    let gana: Bool
    let paga: Int
    let nombre: String
    let color: String?
}

/// Efecto de aplicar un mensaje (para animar). Decodificación tolerante: «p» es texto en
/// los power-ups y un objeto en la tragaperras, así que cada campo se lee por separado.
struct Efecto: Decodable {
    let k: String
    let u: String?
    let t: String?
    let n: Int?
    let fichas: Int?
    let txt: String?
    let op: String?
    let de: String?
    let a: String?
    let cant: Int?
    let neto: Int?
    let gana: Bool?
    let antes: Int?
    let p: String?
    let obj: String?
    let id: String?
    let res: String?
    let ganan: [PorraRes]?
    let pierden: [PorraRes]?
    struct PorraRes: Decodable { let u: String; let fichas: Int }

    enum CodingKeys: String, CodingKey { case k, u, t, n, fichas, txt, op, de, a, cant, neto, gana, antes, p, obj, id, res, ganan, pierden }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        k = (try? c.decode(String.self, forKey: .k)) ?? ""
        u = try? c.decode(String.self, forKey: .u)
        t = try? c.decode(String.self, forKey: .t)
        n = try? c.decode(Int.self, forKey: .n)
        fichas = try? c.decode(Int.self, forKey: .fichas)
        txt = try? c.decode(String.self, forKey: .txt)
        op = try? c.decode(String.self, forKey: .op)
        de = try? c.decode(String.self, forKey: .de)
        a = try? c.decode(String.self, forKey: .a)
        cant = try? c.decode(Int.self, forKey: .cant)
        neto = try? c.decode(Int.self, forKey: .neto)
        gana = try? c.decode(Bool.self, forKey: .gana)
        antes = try? c.decode(Int.self, forKey: .antes)
        p = try? c.decode(String.self, forKey: .p)
        obj = try? c.decode(String.self, forKey: .obj)
        id = try? c.decode(String.self, forKey: .id)
        res = try? c.decode(String.self, forKey: .res)
        ganan = try? c.decode([PorraRes].self, forKey: .ganan)
        pierden = try? c.decode([PorraRes].self, forKey: .pierden)
    }
}

/// Noche archivada por el servidor (/api/historial).
struct NocheArchivada: Decodable, Identifiable {
    let a: Double
    let b: Double
    let c: [Int]
    let p: Double
    let top: [[Valor]]
    let j: [[Valor]]?
    var id: Double { b }

    enum Valor: Decodable {
        case texto(String), numero(Double)
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let s = try? c.decode(String.self) { self = .texto(s) } else { self = .numero(try c.decode(Double.self)) }
        }
        var texto: String { if case .texto(let s) = self { return s }; return "" }
        var numero: Double { if case .numero(let n) = self { return n }; return 0 }
    }
}
