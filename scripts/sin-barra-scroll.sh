#!/bin/sh
# Oculta los indicadores de scroll nativos del WebView en las apps de Capacitor.
# Uso (en la carpeta del proyecto Capacitor, tras «npx cap add ios»): sh scripts/sin-barra-scroll.sh
# Añade una subclase de CAPBridgeViewController al final de AppDelegate.swift (ya está en el proyecto de Xcode,
# así no hay que tocar el .pbxproj) y hace que el storyboard principal la use.
set -e
AD=ios/App/App/AppDelegate.swift
SB=ios/App/App/Base.lproj/Main.storyboard
grep -q "class MainViewController" "$AD" || cat >> "$AD" <<'EOF'

// Añadido por scripts/sin-barra-scroll.sh: sin barras de scroll ni rebote lateral.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        webView?.scrollView.showsVerticalScrollIndicator = false
        webView?.scrollView.showsHorizontalScrollIndicator = false
        webView?.scrollView.alwaysBounceHorizontal = false
        webView?.scrollView.bounces = false
    }
}
EOF
sed -i '' 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="MainViewController" customModule="App" customModuleProvider="target"/' "$SB"
grep -q 'customClass="MainViewController"' "$SB" && echo "Barra de scroll desactivada"
