# Beispiel: Server-Werkzeuge

Dieses Beispiel baut ein Plugin, das

- in der Werkzeugleiste jeder Server-Verbindung einen Button **Uptime** anlegt, der den Befehl `uptime` im Terminal ausführt,
- eine Ansicht **Werkzeuge** mit einer Übersicht und zwei Schaltflächen ergänzt,
- mitzählt, wie oft du dich verbunden hast, und den Zähler dauerhaft speichert.

## Projektstruktur

```
server-werkzeuge/
├── feather-plugin.json
└── src/dev/beispiel/ServerWerkzeuge.java
```

## Manifest

`feather-plugin.json`:

```json
{
  "name": "Server-Werkzeuge",
  "author": "Max Mustermann",
  "version": "1.0.0",
  "main": "dev.beispiel.ServerWerkzeuge",
  "description": "Uptime-Button und eine Werkzeug-Ansicht für Server-Verbindungen.",
  "apiVersion": 1
}
```

## Hauptklasse

`src/dev/beispiel/ServerWerkzeuge.java`:

```java
package dev.beispiel;

import feather.api.Block;
import feather.api.ButtonSpec;
import feather.api.FeatherPlugin;
import feather.api.Locations;
import feather.api.PluginAPIManager;
import feather.api.ViewSpec;
import java.util.List;

public final class ServerWerkzeuge implements FeatherPlugin {
    private PluginAPIManager api;

    @Override
    public void onEnable(PluginAPIManager api) {
        this.api = api;

        api.ui().addButton(
                ButtonSpec.of("uptime")
                        .label("Uptime")
                        .icon("server")
                        .tooltip("Führt uptime auf dem Server aus")
                        .location(Locations.TERMINAL_TOOLBAR)
                        .onClick(event -> api.terminal().send("", "uptime\r")));

        api.terminal().addView(ViewSpec.of("werkzeuge").title("Werkzeuge").icon("wrench").onAction(event -> {
            switch (event.string("id")) {
                case "speicher" -> api.terminal().send("", "free -h\r");
                case "platz" -> api.terminal().send("", "df -h\r");
                default -> api.logger().warning("Unbekannte Aktion: " + event.string("id"));
            }
        }));

        api.events().on("session.opened", event -> {
            int count = Integer.parseInt(api.storage().get("verbindungen", "0")) + 1;
            api.storage().put("verbindungen", String.valueOf(count));
            api.ui().toast("Verbunden mit " + event.string("name"), "success");
            zeigeAnsicht();
        });

        zeigeAnsicht();
    }

    private void zeigeAnsicht() {
        String count = api.storage().get("verbindungen", "0");
        api.terminal().setViewContent("werkzeuge", List.of(
                Block.heading("Server-Werkzeuge"),
                Block.text("Verbindungen seit der Installation: " + count),
                Block.divider(),
                Block.button("speicher", "Arbeitsspeicher anzeigen"),
                Block.button("platz", "Speicherplatz anzeigen")));
    }
}
```

Der Button schickt mit `send("", "uptime\r")` den Befehl an die gerade aktive Verbindung. Das abschließende `\r` entspricht der Eingabetaste. Die Ansicht aktualisiert sich, wenn eine neue Verbindung hinzukommt, weil `zeigeAnsicht()` den Inhalt ersetzt.

## Bauen

Zuerst brauchst du die Klassen des Plugin-API. Im Quellcode von Feather erzeugt `npm run build:core` den Ordner `core/out`. Danach kompilierst du und packst die `.jar`.

```bash
mkdir -p build/classes
javac --release 17 -encoding UTF-8 \
  -cp /pfad/zu/feather/core/out \
  -d build/classes \
  src/dev/beispiel/ServerWerkzeuge.java
cp feather-plugin.json build/classes/
jar --create --file server-werkzeuge.jar -C build/classes .
```

Unter Windows nutzt du dieselben Befehle in der Eingabeaufforderung mit `\` als Pfadtrenner und `copy` statt `cp`. Statt `core/out` funktioniert auch `-cp feather-core.jar`, wenn du die Datei aus einer Installation oder einem Release kopierst.

## Installieren

1. Öffne **Einstellungen › Plugins**.
2. Wähle **Plugin hochladen (.jar)** und die Datei `server-werkzeuge.jar`.
3. Bestätige die Sicherheitsabfrage.
4. Öffne eine Server-Verbindung. In der Kopfzeile erscheint der Button **Uptime**, und neben **Terminal** und **Module** der Reiter **Werkzeuge**.

Änderst du den Code, baust du die `.jar` neu und lädst sie erneut hoch. Feather ersetzt das vorhandene Plugin.

## Fehler finden

- Schlägt `onEnable` fehl, steht die Meldung in der Plugin-Liste.
- Handler-Ausnahmen erscheinen als Hinweis in Feather. Das Plugin bleibt aktiv.
- Mit `api.logger()` schreibst du Meldungen in das Protokoll des Java-Kerns.
- Prüfe bei einem Button, der nicht erscheint, zuerst die Position. Eine unbekannte Position blendet den Button aus.

## Nächste Schritte

- [Oberfläche erweitern](oberflaeche.md): alle Positionen, Icons und Blöcke
- [API-Referenz](api-referenz.md): vollständige Beschreibung
