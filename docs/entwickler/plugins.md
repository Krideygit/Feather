# Plugins entwickeln

Plugins erweitern Feather um Schaltflächen, eigene Ansichten im Terminal-Bereich, Stylesheets und Reaktionen auf Ereignisse. Ein Plugin ist eine `.jar`-Datei, die gegen das Paket `feather.api` kompiliert wird. Die Schnittstelle liegt im Java-Kern von Feather und wird mit ihm ausgeliefert.

| Dokument | Inhalt |
| --- | --- |
| Diese Seite | Aufbau, Manifest, Lebenszyklus, Installation |
| [Oberfläche erweitern](oberflaeche.md) | Buttons, Ansichten, Stile, Hinweise |
| [API-Referenz](api-referenz.md) | Alle Typen und Methoden |
| [Beispiel](beispiel.md) | Ein vollständiges Plugin, Schritt für Schritt |

## Voraussetzungen

- JDK 17 oder neuer. Kompiliere mit `--release 17`, damit das Plugin auf der mitgelieferten Laufzeit läuft.
- Die Klassen des Plugin-API zum Kompilieren. Du erhältst sie aus dem Quellcode von Feather mit `npm run build:core`. Der Ordner `core/out` enthält danach `feather/api/*.class`. Alternativ liegen dieselben Klassen in `core/feather-core.jar` und in der installierten Anwendung unter `resources/core/feather-core.jar`.

Das Plugin-API hat die Version 1. Die Hauptklasse und alle Typen in `feather.api` sind stabil innerhalb einer Hauptversion.

## Aufbau

Eine Plugin-Datei enthält zwei Dinge im Wurzelverzeichnis oder darunter:

1. die Manifest-Datei `feather-plugin.json` im Wurzelverzeichnis der `.jar`
2. die kompilierten Klassen, darunter die Hauptklasse

```
mein-plugin.jar
├── feather-plugin.json
└── dev/beispiel/MeinPlugin.class
```

## Manifest

```json
{
  "name": "Mein Plugin",
  "author": "Max Mustermann",
  "version": "1.0.0",
  "main": "dev.beispiel.MeinPlugin",
  "description": "Kurze Beschreibung für die Plugin-Liste.",
  "apiVersion": 1
}
```

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `author` | ja | Name des Autors, wird in der Plugin-Liste und vor der Installation angezeigt |
| `main` | ja | Vollständiger Klassenname der Hauptklasse, zum Beispiel `dev.beispiel.MeinPlugin` |
| `version` | ja | Freier Versionstext, Feather vergleicht ihn nicht |
| `name` | nein | Anzeigename. Fehlt er, nutzt Feather den einfachen Klassennamen |
| `description` | nein | Beschreibung für die Liste |
| `apiVersion` | nein | Benötigte Version des Plugin-API. Verlangt ein Plugin eine neuere Version, als Feather bietet, lehnt Feather es mit einer klaren Meldung ab |

Aus dem Namen leitet Feather die **ID** des Plugins ab: Kleinbuchstaben, alle Zeichen außer Buchstaben und Ziffern werden zu Bindestrichen, höchstens 40 Zeichen. Aus „Mein Plugin“ wird `mein-plugin`. Die ID bestimmt den Dateinamen, die Speicherdatei und die Identität: Ein Plugin mit derselben ID ersetzt das vorhandene.

Das Manifest wird beim Installieren geprüft. Fehlende Pflichtfelder, ungültiges JSON, ein ungültiger Klassenname und eine Datei, die keine `.jar` ist, führen zu einer Fehlermeldung, ohne dass etwas installiert wird.

## Hauptklasse

Die Hauptklasse implementiert `feather.api.FeatherPlugin` und braucht einen öffentlichen Konstruktor ohne Parameter.

```java
package dev.beispiel;

import feather.api.FeatherPlugin;
import feather.api.PluginAPIManager;

public final class MeinPlugin implements FeatherPlugin {
    @Override
    public void onEnable(PluginAPIManager api) {
        api.logger().info("Plugin gestartet");
    }

    @Override
    public void onDisable() {
        // Aufräumen, falls nötig
    }
}
```

`onEnable` erhält den `PluginAPIManager`, den Zugang zu allen Funktionen. Alles, was ein Plugin über die API anlegt (Buttons, Ansichten, Stile, Handler), entfernt Feather beim Deaktivieren automatisch. `onDisable` dient nur zum Aufräumen eigener Ressourcen wie Threads oder Dateien.

## Lebenszyklus

| Ereignis | Ablauf |
| --- | --- |
| Feather startet | Alle aktivierten Plugins werden geladen und `onEnable` aufgerufen |
| Installieren | Manifest prüfen, Datei in den Plugin-Ordner kopieren, laden. Schlägt `onEnable` fehl, nimmt Feather die Installation zurück und stellt eine vorherige Version wieder her |
| Ausschalten | `onDisable` aufrufen, Beiträge entfernen, Klassenlader schließen |
| Einschalten | Plugin neu laden, `onEnable` aufrufen |
| Entfernen | Wie Ausschalten, dann Datei und gespeicherte Daten löschen |
| Feather beendet sich | `onDisable` für alle Plugins |

Jedes Plugin läuft in einem eigenen Klassenlader. Der Klassenlader des Java-Kerns ist sein Elternlader, das Plugin sieht also die Java-Standardbibliothek und die Klassen von Feather. Als Schnittstelle gilt ausschließlich das Paket `feather.api`, alles andere kann sich ohne Ankündigung ändern. Weitere Abhängigkeiten packst du in die `.jar` (Fat-Jar).

Wirft `onEnable` eine Ausnahme, markiert Feather das Plugin in der Liste als fehlerhaft und zeigt die Meldung an. Ausnahmen in Handlern fängt Feather ab, schreibt sie ins Plugin-Log und zeigt einen Hinweis an. Das Plugin bleibt aktiv.

## Threads

Handler für Klicks und Ereignisse rufen den Plugin-Code auf einem Thread des Java-Kerns auf. Blockiere ihn nicht mit langen Operationen. Starte für Arbeit mit Wartezeiten einen eigenen Thread und beende ihn in `onDisable`.

## Speicherorte

| Pfad | Inhalt |
| --- | --- |
| `%USERPROFILE%\.feather\plugins\<id>.jar` | Installierte Plugin-Datei |
| `%USERPROFILE%\.feather\plugins\data\<id>.json` | Daten des Plugins, siehe `StorageManager` |
| `%USERPROFILE%\.feather\plugins\plugins.json` | Welche Plugins aktiviert sind |

**Plugin-Ordner öffnen** in den Einstellungen zeigt den Ordner.

## Installieren und testen

1. Baue die `.jar`, siehe [Beispiel](beispiel.md).
2. Öffne **Einstellungen › Plugins** und wähle **Plugin hochladen (.jar)**.
3. Bestätige die Sicherheitsabfrage. Feather zeigt Name, Autor und Version.
4. Das Plugin erscheint in der Liste. Fehler zeigt Feather direkt dort an.

Für den Entwicklungszyklus genügt es, die neue `.jar` erneut hochzuladen. Feather ersetzt das vorhandene Plugin und stellt bei einem Fehler beim Start die vorherige Version wieder her.

## Lizenz von Plugins

Die [Feather-Lizenz](../../LICENSE.de.md) erlaubt, Plugins unter jeder beliebigen Lizenz zu veröffentlichen, zu verbreiten und zu verkaufen. Voraussetzung ist, dass das Plugin nur über `feather.api` mit Feather zusammenarbeitet und keinen Code von Feather enthält. Feather selbst darf nicht mit dem Plugin zusammen verbreitet werden.

## Sicherheit

Ein Plugin läuft mit den vollen Rechten des Benutzers, der Feather gestartet hat. Es gibt keine Sandbox. Veröffentliche Plugins deshalb mit Quellcode, und beschreibe, was sie tun. Anwender sollten nur Plugins aus Quellen installieren, denen sie vertrauen.

## Beispiel im Quellcode

Das Repository enthält mit `plugins-src/rainbow-icons` ein vollständiges Plugin. `npm run build:plugins` baut alle Plugins unter `plugins-src` nach `plugins-dist`.
