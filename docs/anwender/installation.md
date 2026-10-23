# Installation

## Voraussetzungen

| | |
| --- | --- |
| Betriebssystem | Windows 10 oder Windows 11, 64 Bit |
| Speicherplatz | etwa 400 MB für Feather, dazu der Platz für die Dienste, die du anlegst |
| Netzwerk | für das Herunterladen von Dienst-Binaries beim ersten Anlegen eines Services und für Verbindungen zu Servern |
| Java | nicht erforderlich, eine Laufzeitumgebung ist im Installer enthalten |

## Installer ausführen

1. Lade `Feather-Setup-<Version>.exe` von der [Release-Seite](https://github.com/Krideygit/feather-software/releases) herunter.
2. Starte die Datei und wähle das Zielverzeichnis.
3. Nach der Installation öffnet sich Feather und zeigt beim ersten Start den [Einrichtungsassistenten](erste-schritte.md#einrichtungsassistent).

Der Installer ist nicht mit einem Zertifikat signiert. Windows SmartScreen zeigt deshalb beim ersten Start unter Umständen die Meldung „Der Computer wurde durch Windows geschützt“ an. Wähle **Weitere Informationen** und anschließend **Trotzdem ausführen**.

Die Installation erfolgt für den aktuellen Benutzer und benötigt keine Administratorrechte.

## Speicherorte

Feather trennt Programmdaten von persönlichen Einstellungen.

| Pfad | Inhalt |
| --- | --- |
| `%USERPROFILE%\.feather` | Profile, Services und deren Daten, heruntergeladene Binaries (`runtimes`), Plugins (`plugins`), Datenbanktreiber (`lib`) |
| `%APPDATA%\Feather®` | Einstellungen, gespeicherte Server und Zugangsdaten, Verläufe, Sprachpakete (`languages`), Protokoll (`feather.log`) |

Passwörter und Schlüssel in `%APPDATA%\Feather®` sind mit dem Windows-Benutzerkonto verschlüsselt. Die Dateien lassen sich daher nicht auf einen anderen Rechner kopieren. Für den Umzug dient die [Sicherung](einstellungen.md#sicherung).

## Lizenz

Feather ist kostenlos nutzbar, privat und beruflich. Die [Lizenz](../../LICENSE.de.md) erlaubt, Feather zu erweitern und zu verändern. Plugins darfst du frei veröffentlichen und verkaufen. Nicht erlaubt ist die öffentliche Weitergabe von Feather oder veränderten Versionen sowie das Ausgeben als Original. Verbindlich ist die englische Fassung in der Datei `LICENSE`. Der Installer zeigt sie vor der Installation an.

## Aktualisieren

Starte den neuen Installer. Er ersetzt das Programm und lässt alle Daten unverändert.

## Deinstallieren

Entferne Feather über **Einstellungen › Apps** in Windows. Die Ordner `.feather` und `Feather®` bleiben dabei bestehen, damit eine spätere Neuinstallation deine Daten wiederfindet. Lösche beide Ordner, wenn du alles entfernen möchtest. Beende vorher laufende Services.
