# Netfreak2k Server-OS auf Windows und macOS

## Architektur

Die unterstützte Server-Laufzeit ist weiterhin **Ubuntu/Linux Mint amd64**. Windows und macOS können die Weboberfläche im Browser bedienen; die Serverdienste werden in einer Ubuntu-VM betrieben. Diese Installationsmethode ersetzt keine Windows- oder macOS-Systemdienste und bindet die jeweiligen Host-APIs nicht automatisch ein.

## Voraussetzungen

- Windows 11 oder aktuelles macOS, Multipass (Canonical), funktionierende Hardwarevirtualisierung
- Empfohlen: mindestens 16 GB Host-RAM, ausreichend CPU und 60 GB freier SSD-Speicher für die VM
- Verbindung zu GitHub und Ubuntu-Paketquellen bei der Ersteinrichtung
- **Voller Funktionsumfang nur, wenn die virtuelle Ubuntu-Maschine x86_64 sowie Nested VT-x/AMD-V tatsächlich bereitstellt.** Nicht jede VM-/Host-Kombination erlaubt dies.
- **Apple Silicon:** Ubuntu läuft als ARM64-Gast; der aktuelle amd64-Linux-Installer verweigert die Installation. Auch KVM/HAOS-Parität wird hier nicht angeboten.

## Windows

1. Multipass von https://canonical.com/multipass/install installieren.
2. PowerShell öffnen und im heruntergeladenen Repository ausführen: `powershell -ExecutionPolicy Bypass -File .\install-windows.ps1`
3. Fehlt Nested Virtualization, wird die Installation vorzeitig und mit einer verständlichen Meldung gestoppt.
4. Nach dem Start die ausgegebene VM-Adresse im Browser öffnen. Die VM muss für den Browser erreichbar sein; lokale Firewall-/Hypervisor-Regeln können Zugriffe verhindern.

## macOS (Intel)

1. Multipass von https://canonical.com/multipass/install installieren.
2. Im Terminal aus dem Repo: `bash install-macos.sh`
3. Fehlt Nested Virtualization, bricht das Skript sicher ab; es wird kein nicht funktionsfähiges System installiert.
4. Die im Installer ausgegebene Adresse im Browser öffnen.

## Einschränkungen

| Funktion | Linux nativ | Windows/macOS mit Ubuntu-VM |
| --- | --- | --- |
| Dashboard, Auth, API, Kalender, Galerie | Ja | Ja, nach erfolgreicher VM-Installation |
| Docker und lokale KI | Ja | Im Linux-Gast, abhängig von Ressourcen |
| Netzwerk-/Storage-/CPU-Monitoring | Linux-Host | Ubuntu-Gast, **nicht** Windows/macOS-Host |
| USB, Bluetooth, Medienhardware | Linux-Host | Nur bei unterstütztem und konfiguriertem Passthrough |
| KVM und Home Assistant OS-VM | Mit VT-x/AMD-V | Nur mit funktionierendem Nested VT-x/AMD-V |
| Hostupdates und Backup | Linux-Host | Ubuntu-Gast; Windows/macOS separat sichern und aktualisieren |

## Betrieb und Verwaltung

`multipass list` zeigt virtuelle Maschinen. `multipass shell netfreak2k-os` öffnet die Linux-Gastkonsole. `multipass stop netfreak2k-os` schaltet den Server ab, `multipass start netfreak2k-os` startet ihn. Die Serveradresse kann sich verändern.

**Keine Garantie für vollständige Funktionsgleichheit.** Für ein vollständiges Netfreak2k Server-OS mit KVM/HAOS und direktem Zugriff auf Hardware wird weiterhin ein unterstützter, direkt installierter Linux-Host benötigt.

## Automatische Kompatibilitätsprüfung (GitHub Actions)

Der Workflow [Platform compatibility checks](../.github/workflows/platform-compatibility.yml) läuft bei Pull Requests, Pushes auf `main` und kann manuell über **Actions → Platform compatibility checks → Run workflow** gestartet werden.

Die Matrix prüft Ubuntu, Windows und macOS: Python-/JavaScript-/PowerShell-/Shell-Syntax, Dashboard-Dateiverweise und zentrale Installationsvoraussetzungen. Zusätzlich wird ein Linux-API-Syntax-Smoke-Test durchgeführt.

**Grün bedeutet nur, dass diese begrenzten Prüfungen bestanden wurden.** Die Tests installieren keinen vollständigen Server, prüfen keine Windows-/macOS-Host-Integration und können KVM/HAOS, Nested Virtualization oder Geräte-Passthrough nicht nachweisen. Solange diese Bereiche nicht praktisch getestet wurden, bleiben die zusätzlichen Plattformen experimentell.

Bei einem roten Lauf: In GitHub **Actions** den fehlgeschlagenen Workflow öffnen, den betroffenen Job wählen und die erste fehlgeschlagene Prüfung ansehen.
