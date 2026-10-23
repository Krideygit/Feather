# Architektur und Build

## Überblick

Feather besteht aus drei Teilen.

| Teil | Technik | Aufgabe |
| --- | --- | --- |
| Oberfläche | React und TypeScript in einem Electron-Renderer, Tailwind CSS | Darstellung, Eingaben |
| Hauptprozess | TypeScript in Electron | Fenster, Dialoge, Server-Verbindungen (SSH, SFTP, FTP), Speicher für Zugangsdaten, Sicherung, Saveeye, Sprachen |
| Java-Kern | Java 17, ohne externe Abhängigkeiten außer dem MariaDB-Treiber | Lokale Services, Profile, Datenbankzugriff, Plugins |

Der Hauptprozess startet den Java-Kern als Kindprozess und spricht mit ihm über Standardein- und -ausgabe. Jede Zeile ist ein JSON-Objekt. Anfragen tragen eine `id`, `method` und `params`. Antworten tragen dieselbe `id` mit `result` oder `error`. Ohne `id` ist die Nachricht ein Ereignis (`event`, `data`), das der Kern von sich aus sendet.

Die Oberfläche erreicht beide Seiten über eine schmale Brücke (`window.feather`), die der Preload-Skript im Hauptprozess bereitstellt. Der Renderer läuft mit `contextIsolation` und `sandbox`, er hat keinen direkten Zugriff auf Node.js.

```
Renderer  ──  window.feather  ──  Hauptprozess  ──  stdio (JSON)  ──  Java-Kern
   │                                  │
   │                                  └── SSH / SFTP / FTP, Zugangsdaten, Sicherung
   └── React, Zustand, Vorschläge, Übersetzung
```

## Verzeichnisse

| Pfad | Inhalt |
| --- | --- |
| `src/main` | Hauptprozess: Fenster, IPC, Einstellungen, Sicherung, Saveeye, Sprachen, Verläufe |
| `src/main/remote` | Server-Verbindungen, Dateiübertragung, Zugangsdaten, Server-Module |
| `src/renderer` | Oberfläche: Seiten, Dialoge, Komponenten, Zustand |
| `src/shared` | Typen und reine Logik, die beide Seiten nutzen (SQL-Generator, Vorschläge, Sprachpakete) |
| `core/src/feather` | Java-Kern |
| `core/src/feather/api` | Plugin-API |
| `plugins-src` | Beispiel-Plugins |
| `scripts` | Build-, Test- und Hilfsskripte |
| `docs` | Dokumentation |
| `build` | Icons, bei Bedarf die erzeugte Laufzeitumgebung |

Code, der keine Electron- oder Browser-Funktionen benötigt, liegt in `src/shared`. Dadurch lässt er sich in Tests direkt ausführen, siehe unten.

## Entwicklungsumgebung

Voraussetzungen: Node.js (getestet mit Version 24), npm und ein JDK ab Version 17.

```bash
npm install
npm run dev
```

`npm run dev` baut den Java-Kern und die Oberfläche, startet einen Watch-Build und öffnet Electron. Mit F12 öffnest du die Entwicklerwerkzeuge, mit Strg + R lädst du die Oberfläche neu.

Für Java sucht Feather in dieser Reihenfolge: `resources/jre` (Release-Build), `JAVA_HOME`, `java` im Pfad.

### Umgebungsvariablen

| Variable | Wirkung |
| --- | --- |
| `FEATHER_HOME` | Ordner für Profile, Services und Plugins statt `%USERPROFILE%\.feather` |
| `FEATHER_CORE_JAR` | Pfad zu einer anderen `feather-core.jar` |
| `FEATHER_CORE_OUT` | Ausgabedatei von `npm run build:core`, nützlich, wenn die laufende Anwendung die Jar sperrt |

Mit `--user-data-dir=<Ordner>` startet Electron mit getrennten Einstellungen. So läuft eine Entwicklungsinstanz neben einer installierten.

## Skripte

| Befehl | Wirkung |
| --- | --- |
| `npm run build:core` | Java-Kern nach `core/feather-core.jar` bauen |
| `npm run build:app` | Hauptprozess und Oberfläche nach `dist` bauen |
| `npm run build` | Beides |
| `npm run build:plugins` | Beispiel-Plugins aus `plugins-src` nach `plugins-dist` bauen |
| `npm run build:jre` | Schlanke Java-Laufzeit mit `jlink` nach `build/jre` erzeugen |
| `npm run typecheck` | TypeScript prüfen |
| `npm test` | Alle Tests |
| `npm run dist` | Installer bauen, siehe unten |

## Tests

`npm test` führt die Suiten nacheinander aus. Jede ist ein eigenständiges Node-Skript.

| Skript | Prüft |
| --- | --- |
| `test-blueprint.js` | Blueprint-Editor: Graphen und SQL-Erzeugung |
| `test-remote.js` | SSH, SFTP und FTP gegen einen Testserver |
| `test-modules.js` | Server-Module gegen ein simuliertes Linux |
| `test-backup.js` | Sicherung und Wiederherstellung |
| `test-saveeye.js` | Erkennung von Bildschirmaufnahmen |
| `test-i18n.js` | Übersetzung und Sprachpakete |
| `test-plugins.js` | Plugin-Laden, API und Lebenszyklus |
| `test-sql.js` | SQL-Generator, Vorschläge, Änderungsverlauf |
| `test-terminal.js` | Befehlsvorschläge und Fehlerhinweise |

Die Tests bündeln den zu prüfenden TypeScript-Code mit esbuild und ersetzen `electron` durch eine kleine Attrappe. Für die Server-Tests startet `test-ssh-server.js` einen SSH-Server auf dem lokalen Rechner, `fake-linux.js` ergänzt ein simuliertes System mit `apt`, `systemctl` und `mariadb`.

## Release bauen

```bash
npm run dist
```

Der Befehl führt nacheinander aus: Typprüfung, Build, Plugins, Laufzeitumgebung und `electron-builder`. Das Ergebnis liegt in `release`:

| Datei | Inhalt |
| --- | --- |
| `Feather-Setup-<Version>.exe` | Installer für Windows (NSIS) |
| `Feather-Setup-<Version>.exe.blockmap` | Prüfdaten für Differenz-Updates |

Der Installer enthält die Anwendung, den Java-Kern, eine mit `jlink` erzeugte Java-Laufzeit und das Beispiel-Plugin. Der Anwender braucht kein Java.

Die Version stammt aus `package.json`. Erhöhe sie vor dem Bau.

Der Installer ist nicht signiert. Für eine Signatur trägst du in der `build`-Konfiguration von `package.json` ein Zertifikat ein, siehe die Dokumentation von `electron-builder`.

Wird die Jar des Java-Kerns von einer laufenden Feather-Instanz gesperrt, schlägt `build:core` fehl. Beende die Instanz oder setze `FEATHER_CORE_OUT`.
