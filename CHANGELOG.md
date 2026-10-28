# Änderungen

Alle nennenswerten Änderungen an Feather stehen in dieser Datei. Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Neu

- Terminal: Shortcuts als Buttons rechts am Terminal, die einen hinterlegten Befehl ausführen, mit Vorlagen, Symbolen und optionaler Rückfrage
- Editor: Syntaxfarben für Code und Konfigurationsdateien, Suche mit Strg + F
- Themen: Hintergrund, Textfarbe, Symbolfarbe und Größe einzeln einstellbar
- Themen: animierte Farbverläufe mit frei wählbaren Farben
- Ruhemodus: Nach einiger Zeit ohne Eingabe zeigt Feather einen schlafenden Roboter und pausiert Animationen
- Package Mailpit: lokaler Mail-Server mit Postfach im Browser
- Package Discord-Server: Discord-Bots aus Knoten bauen, im Simulator testen und per SSH auf einem Server bereitstellen

### Behoben

- Feather SQL im Server-Modul „Datenbanken“: Breite Tabellen lassen sich waagerecht scrollen
- Terminal: Eingaben erscheinen ohne spürbare Verzögerung, auch bei Servern mit höherer Latenz
- Minecraft-Installation: Der Schalter für die EULA ist klickbar, der Link „EULA lesen“ fängt den Klick nicht mehr ab

## [1.0.1] - 2026-10-25

### Behoben

- Terminal: Einfügen mit Strg + V funktioniert ohne zusätzlichen Klick, das Terminal behält den Fokus
- Terminal: Bildlaufleiste dauerhaft sichtbar, Schaltfläche „Nach unten“ nach dem Scrollen
- Feather SQL: Breite Tabellen lassen sich waagerecht scrollen, auch in schmalen Fenstern
- Feather SQL: Aktualisieren lädt Datenbanken, Tabellen, Struktur, Daten und Verlauf neu
- Dateiansicht: Aktualisieren und erneutes Aufklappen zeigen den aktuellen Stand

### Neu

- Dateiansicht: Dateien und Ordner fixieren, ausblenden und nur Fixierte anzeigen
- Dateiansicht: eigene Symbole und Bilder für Ordner, nur in Feather sichtbar
- Feather SQL: Zeilen in der Tabellenansicht farbig markieren

## [1.0.0] - 2026-10-23

Erste öffentliche Version.

### Lokale Services

- MariaDB, Nginx und Apache als lokale Dienste mit automatischem Download der Programme
- Packages für Minecraft (Vanilla und Paper) und FiveM
- Profile mit getrennten Services, Export und Import
- Blueprint-Editor zum grafischen Zusammenstellen von SQL-Abfragen

### Server

- Terminal über SSH mit Host-Schlüssel-Prüfung
- Dateiverwaltung über SFTP und FTP mit Upload, Download, Editor und Rechteverwaltung
- Server-Module für MariaDB, Nginx und Apache auf Linux-Servern mit Installation, Dienststeuerung und Protokollen
- Gespeicherte Zugangsdaten, verschlüsselt über das Windows-Benutzerkonto

### Feather SQL

- SQL-Client für lokale Datenbanken, Datenbanken über SSH-Tunnel und Direktverbindungen
- Tabellenansicht mit Sortieren, Filtern, Bearbeiten, Einfügen und Löschen
- Tabellen-Designer und Strukturansicht zum Hinzufügen, Ändern und Löschen von Spalten
- Änderungsverlauf mit früheren Werten und Wiederherstellung gelöschter Zeilen
- Vorschläge beim Schreiben von Abfragen

### Terminal

- Befehlsvorschläge aus Befehlskatalog und Verlauf pro Server
- Hinweise bei häufigen Fehlern mit passendem Befehl

### Einstellungen und Oberfläche

- Einrichtungsassistent beim ersten Start
- Themen mit eigenen Farben
- Deutsch und Englisch, weitere Sprachen über Sprachpakete
- Sicherung und Wiederherstellung aller Daten in einer Datei
- Saveeye schützt bei Bildschirmübertragungen und Screenshots
- Fehleranzeige und Protokoll bei Abstürzen der Oberfläche

### Plugins

- Plugins als `.jar` mit Manifest, Buttons, Ansichten im Terminal-Bereich, Stylesheets, Ereignissen und Speicher
- Beispiel-Plugin „Rainbow Icons“

### Installer

- Installer für Windows 10 und 11 mit mitgelieferter Java-Laufzeit

### Lizenz

- Feather Source-Available License 1.0: kostenlos nutzbar, Erweiterungen und Plugins erlaubt, keine öffentliche Weitergabe von Feather oder veränderten Versionen
