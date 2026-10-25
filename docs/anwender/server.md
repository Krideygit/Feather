# Server

Der Bereich **Terminal** verbindet Feather mit entfernten Servern. Jede Verbindung öffnet einen eigenen Reiter mit Terminal, Dateiverwaltung und Server-Modulen.

## Verbindungen

Der Reiter **Verbindungen** listet gespeicherte Server. Mit **Verbindung hinzufügen** legst du einen Eintrag an.

| Feld | Bedeutung |
| --- | --- |
| Protokoll | SSH (Terminal und Dateien), SFTP (nur Dateien) oder FTP (nur Dateien, optional mit TLS) |
| Host und Port | Adresse des Servers, SSH nutzt standardmäßig Port 22 |
| Benutzername | Konto auf dem Server |
| Anmeldung | Passwort oder Schlüsseldatei, optional mit Passphrase |
| Startordner | Ordner, in dem die Dateiansicht beginnt |
| Farbe | Kennzeichnet den Reiter |

Beim ersten Verbindungsaufbau zeigt Feather den Fingerabdruck des Server-Schlüssels. Prüfe ihn und bestätige mit **Vertrauen**. Ändert sich der Fingerabdruck später, warnt Feather und zeigt den bekannten und den neuen Fingerabdruck. Die Verbindung kommt erst zustande, wenn du dem neuen Schlüssel bewusst vertraust.

Passwörter und Passphrasen speichert Feather nur, wenn du das erlaubst. Sie liegen verschlüsselt auf deinem Rechner. Ohne gespeichertes Passwort fragt Feather bei jeder Verbindung.

## Terminal

Das Terminal ist ein vollwertiges Terminal mit Farben und Mauswahl. Es unterstützt Programme wie `nano`, `htop` oder `tmux`.

| Aktion | Tastenkürzel |
| --- | --- |
| Kopieren | Strg + Umschalt + C |
| Einfügen | Strg + Umschalt + V |
| Schrift größer oder kleiner | Strg + Mausrad |

Ein Rechtsklick öffnet das Kontextmenü mit Kopieren, Einfügen, Alles auswählen, Ausgabe leeren und Schriftgröße. Bei Verbindungsabbruch bietet Feather **Neu verbinden** an.

Strg + V fügt den Inhalt der Zwischenablage ein. Das Terminal behält dabei den Fokus, danach genügt Enter. Ein Pfeil unten in der Ansicht („Nach unten“) erscheint, sobald du nach oben gescrollt hast, und springt zurück zur aktuellen Zeile. Die Bildlaufleiste am rechten Rand bleibt sichtbar.

Das Terminal schlägt beim Tippen Befehle vor und weist auf Fehler hin, siehe [Vorschläge](vorschlaege.md).

## Dateiverwaltung

Links neben dem Terminal liegt die Dateiansicht des Servers.

- Ordner durchsuchen, Dateien umbenennen, verschieben, löschen und neue Dateien oder Ordner anlegen
- Hochladen und Herunterladen per Schaltfläche oder Drag and Drop, auch ganze Ordner
- Dateien direkt im Editor öffnen und speichern
- Dateien und Ordner **fixieren**: Rechtsklick › **Fixieren**. Fixierte Einträge stehen als Schnellzugriff über der Liste, in ihrem Ordner zuerst und mit Pin-Symbol. Ein Klick auf einen fixierten Ordner zeigt ihn als Wurzel. **Nur Fixierte zeigen** (Rechtsklick in die freie Fläche) blendet alles andere aus.
- Einträge **ausblenden**: Rechtsklick › **Ausblenden**. Unten in der Statusleiste zeigt „n ausgeblendet“ sie wieder an, **Einblenden** macht es dauerhaft rückgängig.
- **Symbol ändern …** (Rechtsklick auf einen Ordner): eines der mitgelieferten Symbole in einer Farbe oder ein eigenes Bild, zum Beispiel das Logo eines Programms. Symbole, Fixierungen und ausgeblendete Einträge gelten nur in Feather und pro Server. Auf dem Server ändert sich nichts
- Rechte (`chmod`) über einen Dialog setzen
- Übertragungsliste mit Fortschritt und der Möglichkeit, einzelne Übertragungen abzubrechen

## Module

Der Reiter **Module** richtet häufig benötigte Dienste auf einem Linux-Server ein, ohne dass du die Befehle kennen musst. Voraussetzung ist eine SSH-Verbindung und ein Konto mit `root`- oder `sudo`-Rechten. Unterstützt werden die Paketverwalter `apt`, `dnf`, `yum`, `zypper`, `pacman` und `apk` mit `systemd` oder OpenRC.

Feather erkennt zuerst das System und zeigt, was möglich ist. Eine Installation läuft als Auftrag mit Protokoll, das du live verfolgen kannst.

### MariaDB

| Reiter | Inhalt |
| --- | --- |
| Übersicht | Dienststatus, Version, Port, ob die Datenbank von außen erreichbar ist |
| Datenbanken | Feather SQL direkt im Modul, dazu eine einfache Liste zum Anlegen und Löschen |
| Benutzer | Datenbankbenutzer anlegen, Passwort ändern, löschen |
| Zugangsdaten | Gespeicherte Zugänge ansehen und in Feather SQL öffnen |
| Einstellungen | Port ändern, Fernzugriff erlauben, Firewall anpassen |
| Logs | Protokoll des Dienstes |

Bei der Installation legst du Port, Fernzugriff, eine erste Datenbank sowie Benutzer und Passwort fest. Die Zugangsdaten speichert Feather verschlüsselt. Der Fernzugriff ist standardmäßig aus, die Datenbank lauscht dann nur auf `127.0.0.1` des Servers.

Feather verbindet sich mit der Datenbank über einen SSH-Tunnel. Der Datenbankport muss deshalb nicht im Internet erreichbar sein.

### Nginx und Apache

| Reiter | Inhalt |
| --- | --- |
| Übersicht | Dienststatus, Version, Konfigurationsprüfung |
| Websites | Websites mit Domain und Ordner anlegen, aktivieren und entfernen |
| Logs | Zugriffs- und Fehlerprotokoll |

Feather schreibt pro Website eine eigene Konfigurationsdatei (`feather-<Name>.conf`) und prüft sie mit dem Konfigurationstest des Servers. Besteht sie den Test nicht, entfernt Feather die Datei wieder und meldet den Fehler. Auf Wunsch öffnet Feather den Port in der Firewall.

### Dienste steuern

Im Kopf jedes Moduls starten, stoppen und starten Schaltflächen den Dienst neu. **Autostart** legt fest, ob er beim Hochfahren des Servers läuft. Über das Menü **Weitere Aktionen** deinstallierst du ein Modul, wahlweise mit seinen Daten.
