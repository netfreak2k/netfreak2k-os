# Eigenständiges Reticulum in Netfreak2k Server OS

## Verbindliche Architektur
MeshLink und der native LXMF-Messenger gehören zum Netfreak2k Server OS. Sie verwenden ausschließlich die OS-eigene Reticulum-Konfiguration unter `/state/rns`, die OS-eigene LXMF-Datenbank, eine persistente Identität und das Docker-Volume `netfreak2k-messenger-data`.

Home Assistant, Raspberry Pis und andere Projekte dürfen als Referenz für Fehlersuche oder Protokollverständnis dienen. **Sie sind keine technische Betriebsabhängigkeit, kein automatisches Gateway, kein Standard-Uplink und dürfen bei OS-Updates nicht geändert werden.**

## Betrieb
- Der Reticulum-Stack startet eigenständig im Container `netfreak2k-messenger`.
- Das eigene AutoInterface bleibt für innerhalb der Docker-Netzwerkdomäne sichtbare Ankündigungen verfügbar; Docker-Bridge-Multicast erreicht andere LAN-Segmente **nicht** automatisch.
- Der **separat einstellbare Transportmodus** fügt ein lokales `TCPServerInterface` (Port 4242) hinzu. Standardmäßig bleibt der Transportmodus deaktiviert.
- Docker veröffentlicht den Port vorsichtig nur an `127.0.0.1:4242`. Dies macht den Knoten **nicht öffentlich** erreichbar. Öffentliche Freigabe, Firewall und Routing müssen später separat geplant, geprüft und ausdrücklich freigegeben werden.
- Das optionale `TCPClientInterface` kann einen bewusst eingetragenen externen Reticulum-Transportknoten verwenden. Das ist optional und weder ein Home-Assistant- noch ein Raspberry-Pi-Zwang.
- `LXMF`-Announcements beweisen **keine** aktive TCP-Verbindung. Bekannte Pfade, Hops und bestätigte Transportverbindungen sind getrennt zu melden.
- Eine funktionierende Internet-Knotensuche setzt die Erreichbarkeit einer geeigneten Reticulum-Transportschicht voraus. Es gibt kein allgemeines zentrales, verbindliches LXMF-Peerverzeichnis.

## Abnahme vor produktivem Update
1. Vor dem Update das Messenger-Volume und die persistenten Identitäten sichern.
2. `docker compose config` prüfen; sicherstellen, dass Host-Port 4242 nicht anderweitig belegt ist.
3. Messenger-Container neu bauen, starten und die lokale API-/LXM-Runtime-Gesundheit prüfen.
4. Mit **einem eigenständig gestarteten Test-Reticulum-Peer** kontrollieren, dass die Route korrekt angekündigt und erreicht wird – ohne Home Assistant zu verwenden.
5. Knotenname, Transportmodus, Boot-Persistenz und Neustart untersuchen.
6. Tor-Relay und Home Assistant dürfen in diesem Test nicht verändert werden.

Hinweis: Die Implementierung ist im Repository vorbereitet, aber der Live-Test der Transportinterfaces wurde noch nicht durchgeführt.
