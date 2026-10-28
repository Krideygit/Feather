# Lokale Services

Feather startet und verwaltet Dienste direkt auf deinem Rechner, ohne Container oder Installation ins System. Die benötigten Programme lädt Feather beim ersten Anlegen herunter und legt sie im Ordner `%USERPROFILE%\.feather\runtimes` ab. Jede Instanz hat ein eigenes Datenverzeichnis im aktiven Profil.

## Dienste und Kategorien

| Kategorie | Dienste | Standardport |
| --- | --- | --- |
| Datenbanken | MariaDB | 3306 |
| Webserver | Nginx | 8080 |
| Webserver | Apache | 8081 |
| Packages | Minecraft (Vanilla), Minecraft (Paper) | 25565 |
| Packages | FiveM | 30120 |
| Packages | Mailpit | 8025 (Weboberfläche), 1025 (SMTP) |

## Service anlegen

1. Öffne den passenden Bereich in der Seitenleiste und wähle **erstellen**.
2. Vergib einen Namen und wähle die Version. Nicht installierte Versionen werden beim Anlegen heruntergeladen.
3. Prüfe den Port. Feather schlägt einen freien Port vor.
4. Je nach Dienst folgen weitere Angaben:
   - MariaDB: Passwort des Benutzers `root`
   - Nginx und Apache: Ordner, der als Document-Root ausgeliefert wird, sowie die Optionen **Single-Page-App-Modus** (unbekannte Pfade liefern `index.html`) und **Verzeichnislisting**
   - Packages: Arbeitsspeicher (512 MB bis 16 GB) und bei Minecraft die Zustimmung zur EULA von Mojang
   - Mailpit: SMTP-Port, ob Mails gespeichert werden und wie viele Nachrichten das Postfach höchstens hält
5. Mit **Direkt nach dem Erstellen starten** läuft der Dienst sofort.

## Service steuern

Jeder Service erscheint als Karte mit Status. Die Schaltflächen der Karte starten, stoppen und starten neu, öffnen den Dienst im Browser (Webserver), öffnen den Datenordner und zeigen die Details.

Die Detailansicht enthält folgende Reiter:

| Reiter | Inhalt |
| --- | --- |
| Übersicht | Status, Adresse, Version, Ressourcen |
| Datenbanken | Datenbanken des Servers anlegen, löschen und sichern (nur MariaDB) |
| Benutzer | Datenbankbenutzer verwalten (nur MariaDB) |
| SQL | Abfragen ausführen und der visuelle Blueprint-Editor (nur MariaDB) |
| Logs | Ausgabe des Dienstes |
| Einstellungen | Name, Port, Version, Autostart und dienstspezifische Optionen |

Mit **Beim Start von Feather automatisch starten** läuft ein Service nach jedem Programmstart.

## Versionen verwalten

Die Schaltfläche **Einstellungen** im Kopf jeder Kategorie öffnet die Liste der installierten Versionen. Ungenutzte Versionen lassen sich dort löschen, um Platz freizugeben. Versionen, die ein Service verwendet, sind gesperrt.

## Blueprint-Editor

Der Blueprint-Editor baut SQL-Abfragen grafisch zusammen. Du ziehst Knoten auf die Fläche und verbindest sie.

| Knoten | Wirkung |
| --- | --- |
| Tabelle, Join | Datenquellen und Verknüpfungen |
| Spalten, Filter, Vergleich, Logik, Nicht | Auswahl und Bedingungen |
| Aggregat, Sortierung, Limit, Distinct | Auswertung und Begrenzung |
| Ergebnis | Führt die Abfrage aus und zeigt die Zeilen |
| Einfügen, Ändern, Löschen | Schreibende Abfragen |
| Notiz | Freitext auf der Fläche |

Ein Rechtsklick öffnet das Kontextmenü eines Knotens, dort lassen sich Farbe, Sperre und Kommentar festlegen. Der erzeugte SQL-Befehl ist im Editor sichtbar.

## Discord-Bots

Das Package Discord-Server ist kein Dienst auf deinem Rechner. Es baut Bots aus Knoten und stellt sie auf einem Server bereit, siehe [Discord-Bots](discord-bots.md).

## Mailpit

Mailpit ist ein lokaler Mail-Server für Entwicklung und Tests. Deine Anwendung schickt Mails an den SMTP-Port von Mailpit, und sie landen in einem Postfach im Browser, statt wirklich zugestellt zu werden.

- Als Mail-Server trägst du in deiner Anwendung `localhost` mit dem SMTP-Port ein, ohne Anmeldung und ohne Verschlüsselung.
- In den Details öffnet ein Klick auf die Adresse das Postfach im Browser.
- Mit **Mails speichern** bleibt das Postfach nach einem Neustart erhalten.
- Standardmäßig lauscht Mailpit nur auf `127.0.0.1`. **Im Netzwerk erreichbar** öffnet es für andere Rechner im LAN.
