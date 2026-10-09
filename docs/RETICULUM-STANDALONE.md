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

## Automatische LAN-Einrichtung ab dieser Version
Bei einer frischen Netfreak2k-Installation legt Docker Compose automatisch den Dienst `netfreak2k-reticulum-lan` mit eigenem persistentem Volume an. Er läuft im Host-Netzwerk, nutzt Reticuluм AutoInterface zur lokalen Multicast-Erkennung und bietet ausschließlich den nativen Reticulum-TCP-Transport auf Port 4243 an. Er stellt **keine HTTP-API** bereit und verwendet weder LXMF-Nachrichten noch die Messenger-Identität.

Der reguläre `netfreak2k-messenger` bleibt auf dem privaten Docker-Netzwerk. Er verbindet sich über `host.docker.internal:4243` mit dem lokalen Reticulum-LAN-Dienst. Dafür sind keine festen LAN-Adressen oder Macvlan-DHCP-Reservierungen erforderlich. Die bisherige Benutzeridentität bleibt im Volume `netfreak2k-messenger-data` erhalten.

Voraussetzungen: Docker Compose mit `host-gateway`-Unterstützung, IPv6 Link-Local Multicast auf einem unterstützten LAN-Interface sowie eine durch Host-Firewall/Netzwerkregeln erlaubte Verbindung vom Docker-Bridge-Netz zum TCP-Transport. AutoInterface kann nur Knoten sehen, die im Multicast-Bereich erreichbar sind und sich ankündigen. Der TCP-Port 4243 ist auf Host-Netzwerkinterfaces erreichbar; Betreiber müssen die Zugriffspolitik des lokalen Netzes beachten. Kein automatisches Router-Portforwarding wird eingerichtet.

Abnahme nach dem Update: `docker compose ps netfreak2k-reticulum-lan netfreak2k-messenger`, Messenger-`/status`, Reticulum-`/peers`, keine Veröffentlichung des Messenger-HTTP-Ports 8091, LAN-Kommunikation mit einem unabhängigen Testpeer. Der Live-Test ist noch ausstehend.
