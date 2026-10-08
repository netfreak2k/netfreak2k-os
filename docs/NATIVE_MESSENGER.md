# N2K Messenger: native Reticulum / LXMF

## Produktstandard
- Home Assistant OS bleibt im vollständigen N2K Server-OS ein verwaltetes KVM/QEMU-Standardmodul.
- N2K Messenger ist der eigenständige, im Dashboard integrierte Standard-Messenger.
- Der Messenger ist **kein** Home-Assistant-Add-on und hängt nicht von der HAOS-VM ab.
- Das externe Projekt `netfreak2k/home-assistant-reticulum-dev` und bestehende Pi-5-Installationen werden nicht geändert, migriert oder überschrieben.

## Isolierung und Daten
- Container: `netfreak2k-messenger`, separater Docker-Netzwerkdienst.
- Persistentes Volume: `netfreak2k-messenger-data` unter `/state`.
- Eigene Reticulum-Identität, eigene Kontakte und Nachrichten; keine gemeinsamen Schreibzugriffe auf ein HA-Add-on-Volume.
- Kein veröffentlichter Messenger-HTTP-Port am Host; externe Nutzer sprechen die authentifizierte N2K-API an.
- Kontakte und Sendeaktionen der initialen Beta sind auf N2K-Administratoren begrenzt.
- **Die native Identität ist neu**: sie ersetzt nicht automatisch die Identität des Home-Assistant-Add-ons.

## Vor stabilem Release zwingend
1. Docker-Image und Python-Modulimporte auf Zielplattform validieren; Start ohne Schreibrechtefehler.
2. Persistente Identität vor und nach Neustart vergleichen.
3. LXMF End-to-End-Test zwischen zwei unabhängigen Identitäten: Announce, Pfadermittlung, Versand, Empfang.
4. Zustellstatus/Fehler und Recovery korrekt ausweisen; "queued" nie als "zugestellt" bezeichnen.
5. Backup und Restore des Volumes prüfen, einschließlich Schutz vertraulicher Nachrichten und Identität.
6. Benutzer-/Admin-Isolation, CSRF und Netzwerkgrenzen testen.
7. HAOS-VM, Update-, Restore- und Add-on-Funktionen auf Regression prüfen.
8. Smartphone-UI und Fehlermeldungen testen.

**Status:** Entwicklungsimplementierung; kein Nachweis eines erfolgreichen Ende-zu-Ende-Nachrichtenaustauschs auf dem Nutzerhost.
