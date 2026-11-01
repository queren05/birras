import AppIntents

/// Frases de Siri y acciones de la app Atajos.
struct AtajosBirras: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ApuntarIntent(),
            phrases: [
                "Apunta una birra en \(.applicationName)",
                "Apunta una cerveza en \(.applicationName)",
                "Apunta \(\.$tipo) en \(.applicationName)",
                "Suma \(\.$tipo) en \(.applicationName)",
            ],
            shortTitle: "Apuntar",
            systemImageName: "mug.fill"
        )
    }
    static var shortcutTileColor: ShortcutTileColor = .orange
}
