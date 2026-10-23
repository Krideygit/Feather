# Erste Schritte

## Einrichtungsassistent

Beim ersten Start führt ein Assistent durch die wichtigsten Einstellungen. Jeder Schritt wird sofort übernommen, du kannst vor- und zurückgehen oder den Assistenten über **Überspringen** verlassen.

| Schritt | Inhalt |
| --- | --- |
| Willkommen | Sprache der Oberfläche |
| Profil | Name und optionales Bild deines Profils |
| Darstellung | Farbschema |
| Datenschutz | [Saveeye](einstellungen.md#saveeye) aktivieren und Verhalten wählen |
| Hilfen | Befehlsvorschläge, Fehlerhinweise, SQL-Vorschläge, Änderungsverlauf |
| Fertig | Zusammenfassung |

Der Assistent lässt sich jederzeit über **Einstellungen › Allgemein › Einrichtungsassistent** erneut öffnen. Bereits angelegte Services und Server bleiben davon unberührt.

## Aufbau der Oberfläche

Die Seitenleiste enthält die Hauptbereiche.

| Bereich | Zweck |
| --- | --- |
| Übersicht | Alle Services des aktiven Profils auf einen Blick |
| Datenbanken | Lokale MariaDB-Server |
| Webserver | Lokale Nginx- und Apache-Instanzen |
| Packages | Fertige Server, derzeit Minecraft (Vanilla und Paper) und FiveM |
| Terminal | Verbindungen zu Servern per SSH, SFTP und FTP |
| Feather SQL | SQL-Client für lokale und entfernte Datenbanken |
| Einstellungen | Themen, Sprache, Sicherung, Saveeye, Plugins, Hilfen |

Unten links befindet sich das Profilmenü. Die Versionsnummer steht am unteren Fensterrand.

## Profile

Ein Profil fasst Services und deren Daten zusammen. Es eignet sich, um Projekte oder Arbeit und Privates zu trennen.

- Das Profilmenü listet alle Profile. Ein Klick wechselt das Profil.
- Beim Wechsel werden die Services des bisherigen Profils gestoppt. Feather fragt vorher nach, wenn Services laufen.
- Unter **Profile verwalten** legst du Profile an, benennst sie um, wählst ein Bild, exportierst und importierst sie.
- Server, Zugangsdaten, Einstellungen und Verläufe gehören nicht zum Profil, sondern zur Installation.

## Wie es weitergeht

- Lokale Dienste starten: [Lokale Services](services.md)
- Einen Server verwalten: [Server](server.md)
- Mit einer Datenbank arbeiten: [Feather SQL](feather-sql.md)
