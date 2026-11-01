import Foundation
import JavaScriptCore

/// Ejecuta la MISMA lógica que la web (logica.js) dentro de JavaScriptCore,
/// así el bote sale idéntico en la app nativa, en la web y en el servidor.
final class Motor {
    private let ctx: JSContext
    private let p: JSValue

    init() {
        ctx = JSContext()!
        ctx.exceptionHandler = { _, e in print("JS:", e?.toString() ?? "?") }
        for nombre in ["logica", "puente"] {
            if let url = Bundle.main.url(forResource: nombre, withExtension: "js"),
               let codigo = try? String(contentsOf: url, encoding: .utf8) {
                ctx.evaluateScript(codigo, withSourceURL: url)
            }
        }
        p = ctx.objectForKeyedSubscript("P")
    }

    private func texto(_ f: String, _ args: [Any] = []) -> String {
        p.objectForKeyedSubscript(f)?.call(withArguments: args)?.toString() ?? ""
    }
    private func decodificar<T: Decodable>(_ t: T.Type, _ s: String) -> T? {
        guard let d = s.data(using: .utf8) else { return nil }
        do { return try JSONDecoder().decode(T.self, from: d) } catch { print("decode \(T.self):", error); return nil }
    }

    func cargar(mensajesJSON: String) -> Bool { p.objectForKeyedSubscript("cargar")?.call(withArguments: [mensajesJSON])?.toBool() ?? false }
    func aplicar(mensajeJSON: String) -> [Efecto] { decodificar([Efecto].self, texto("aplicar", [mensajeJSON])) ?? [] }
    func vista(yo: String?, ahora: Double) -> Vista? { decodificar(Vista.self, texto("vista", [yo ?? NSNull(), ahora])) }
    func snap() -> String { texto("snap") }
    func constantes() -> Constantes? { decodificar(Constantes.self, texto("constantes")) }
    func premioSlot(_ r: [Int]) -> Premio? { decodificar(Premio.self, texto("premioSlot", [json(r)])) }
    func premioRasca(_ r: [Int]) -> Premio? { decodificar(Premio.self, texto("premioRasca", [json(r)])) }
    func tirarSlot() -> [Int] { decodificar([Int].self, texto("tirarSlot")) ?? [0, 1, 2] }
    func tirarRasca() -> [Int] { decodificar([Int].self, texto("tirarRasca")) ?? [0, 1, 2, 3, 4, 5] }
    func ruleta(_ r: Int, tipo: String, n: Int?) -> ResultadoApuesta? { decodificar(ResultadoApuesta.self, texto("ruleta", [r, tipo, n ?? NSNull()])) }
    func dados(_ a: Int, _ b: Int, ap: String) -> ResultadoApuesta? { decodificar(ResultadoApuesta.self, texto("dados", [a, b, ap])) }
    func blackjack(_ j: [Int], _ c: [Int], doble: Bool) -> ResultadoBJ? { decodificar(ResultadoBJ.self, texto("bj", [json(j), json(c), doble])) }
    func idDe(_ nombre: String) -> String { texto("idDe", [nombre]) }
    func insulto(_ u: String, seg: Double, semilla: Int) -> String { texto("insulto", [u, seg, semilla]) }

    private func json(_ x: Any) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: x) else { return "[]" }
        return String(data: d, encoding: .utf8) ?? "[]"
    }
}
