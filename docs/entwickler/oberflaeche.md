# Oberfläche erweitern

Ein Plugin ergänzt die Oberfläche von Feather über drei Wege: Buttons an festen Positionen, eigene Ansichten im Terminal-Bereich und Stylesheets. Dazu kommen Hinweise (Toasts) und die Möglichkeit, in das Terminal einer Verbindung zu schreiben.

Alle Beiträge gehören zu dem Plugin, das sie angelegt hat. Feather entfernt sie, sobald das Plugin deaktiviert oder entfernt wird.

## Buttons

Buttons legst du mit `ui().addButton(...)` an. Ein `ButtonSpec` beschreibt Beschriftung, Icon, Tooltip, Position und Handler.

```java
api.ui().addButton(
    ButtonSpec.of("sichern")
        .label("Sichern")
        .icon("download")
        .tooltip("Startet die Sicherung")
        .location(Locations.FILES_TOOLBAR)
        .onClick(event -> api.ui().toast("Sicherung gestartet", "success")));
```

| Methode | Beschreibung |
| --- | --- |
| `ButtonSpec.of(id)` | Erzeugt den Button. Die ID muss innerhalb des Plugins eindeutig sein und darf nicht leer sein |
| `label(text)` | Beschriftung. Ohne Label zeigt der Button nur das Icon |
| `icon(name)` | Icon, siehe unten |
| `tooltip(text)` | Hilfetext beim Überfahren |
| `location(ort)` | Position, standardmäßig `Locations.SERVER_TABBAR` |
| `onClick(handler)` | Wird beim Klick mit einem `Event` aufgerufen |

Ruft man `addButton` mit einer ID auf, die es schon gibt, ersetzt der neue Button den alten. So aktualisierst du Beschriftung und Handler, etwa für einen Schalter. `removeButton(id)` entfernt den Button.

### Positionen

| Konstante | Wert | Ort |
| --- | --- | --- |
| `Locations.SERVER_TABBAR` | `server.tabbar` | Rechts in der Reiterleiste des Terminal-Bereichs |
| `Locations.TERMINAL_TOOLBAR` | `terminal.toolbar` | Kopfzeile eines Server-Reiters neben Terminal und Modulen |
| `Locations.FILES_TOOLBAR` | `files.toolbar` | Werkzeugleiste der Dateiansicht |
| `Locations.SIDEBAR` | `sidebar` | Unten in der Seitenleiste |

Eine unbekannte Position führt dazu, dass der Button nirgends erscheint.

### Icons

Als Icon kannst du einen Namen aus der folgenden Liste angeben. Die Schreibweise ist unerheblich.

`bell`, `bug`, `cloud`, `code`, `cpu`, `database`, `download`, `eye`, `flame`, `folder`, `gift`, `globe`, `heart`, `lock`, `package`, `palette`, `pencil`, `play`, `plug`, `puzzle`, `rainbow`, `refresh`, `rocket`, `search`, `server`, `settings`, `shield`, `sparkles`, `star`, `terminal`, `upload`, `wand`, `wrench`, `zap`

Jeder andere Text, etwa ein Emoji, wird als Zeichen dargestellt (höchstens vier Zeichen).

### Das Event

Der Handler erhält ein `Event`. Für Buttons enthält `data` die Schlüssel `plugin` (ID des Plugins) und `id` (ID des Buttons).

```java
.onClick(event -> {
    String button = event.string("id");
    api.logger().info("Geklickt: " + button);
})
```

`event.string(key)` liefert den Wert als Text oder einen leeren Text, wenn der Schlüssel fehlt.

## Ansichten im Terminal-Bereich

Eine Ansicht ist ein eigener Reiter neben **Terminal** und **Module** in jeder Server-Verbindung. Ihr Inhalt besteht aus einer Liste von Blöcken, die das Plugin jederzeit ersetzen kann.

```java
api.terminal().addView(
    ViewSpec.of("status").title("Status").icon("server").onAction(event -> {
        if (event.string("id").equals("neu-laden")) laden();
    }));

api.terminal().setViewContent("status", List.of(
    Block.heading("Serverstatus"),
    Block.text("Alle Dienste laufen."),
    Block.code("uptime: 12 Tage"),
    Block.divider(),
    Block.button("neu-laden", "Aktualisieren")));
```

| Block | Darstellung |
| --- | --- |
| `Block.heading(text)` | Überschrift |
| `Block.text(text)` | Fließtext, Zeilenumbrüche bleiben erhalten |
| `Block.code(text)` | Vorformatierter Text in Festbreitenschrift, auswählbar |
| `Block.divider()` | Trennlinie |
| `Block.button(id, label)` | Schaltfläche. Ein Klick ruft `onAction` der Ansicht auf, `event.string("id")` liefert die ID |

`ViewSpec.onAction` erhält für jeden Klick auf einen Button der Ansicht ein `Event` mit den Schlüsseln `plugin`, `view` und `id`. `setViewContent` ersetzt den gesamten Inhalt, ein erneuter Aufruf aktualisiert die Anzeige. `removeView(id)` entfernt die Ansicht.

Der Inhalt besteht aus Text und Schaltflächen. Frei gestaltete Oberflächen mit HTML sind nicht vorgesehen.

## Stylesheets

`ui().injectCss(id, css)` fügt der Oberfläche ein Stylesheet hinzu, `removeCss(id)` nimmt es zurück. Dieselbe ID ersetzt das vorhandene Stylesheet. Die Größe ist auf 200 000 Zeichen begrenzt.

```java
api.ui().injectCss("kompakt", "[data-feather-area=\"server\"] .btn { height: 28px; }");
```

Für gezielte Anpassungen stehen diese Anker bereit:

| Selektor | Element |
| --- | --- |
| `[data-feather-area="server"]` | Gesamter Terminal-Bereich |
| `[data-feather-icon="folder"]` | Ordner-Icons in der Dateiansicht |
| `[data-feather-icon="file"]` | Datei-Icons in der Dateiansicht |
| `svg.lucide` | Alle Icons |

Farben der Oberfläche liegen als CSS-Variablen vor: `--color-primary` (Akzentfarbe), `--color-bg` (Hintergrund) sowie `--color-neutral-50` bis `--color-neutral-950`. Verwende sie, damit sich dein Plugin an Themen anpasst.

## Hinweise

`ui().toast(text, art)` blendet kurz eine Meldung ein. `art` ist `"info"`, `"success"` oder `"error"`. Andere Werte gelten als `"info"`.

## Mit dem Terminal arbeiten

`terminal()` greift auf die offenen Verbindungen zu.

| Methode | Wirkung |
| --- | --- |
| `sessions()` | Liste der offenen Sitzungen als Maps mit `sid`, `name`, `host`, `port`, `username`, `protocol` |
| `print(sessionId, text)` | Schreibt Text in die Ausgabe des Terminals. Der Server sieht ihn nicht, er dient der Anzeige |
| `send(sessionId, text)` | Sendet Text an den Server, als hättest du ihn getippt. Ein abschließendes `\r` entspricht der Eingabetaste |

Eine leere Sitzungs-ID wählt die gerade aktive Verbindung. Ist keine Verbindung offen, tut Feather nichts.

```java
api.terminal().send("", "uptime\r");
```

Die Methode `sessions()` liefert den Stand, den das Plugin über `session.opened` und `session.closed` erfahren hat, siehe [Ereignisse](api-referenz.md#eventmanager).

## Daten speichern

`storage()` legt Schlüssel-Wert-Paare pro Plugin ab. Sie bleiben über Neustarts erhalten und werden beim Entfernen des Plugins gelöscht.

```java
String stand = api.storage().get("stand", "an");
api.storage().put("stand", "aus");
```

Werte sind Texte. Serialisiere strukturierte Daten selbst, zum Beispiel als JSON.
