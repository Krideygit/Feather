# API-Referenz

Alle Typen liegen im Paket `feather.api`. Die Schnittstelle hat die Version 1.

| Typ | Art | Aufgabe |
| --- | --- | --- |
| [`FeatherPlugin`](#featherplugin) | Interface | Einstiegspunkt eines Plugins |
| [`PluginAPIManager`](#pluginapimanager) | Interface | Zugang zu allen Funktionen |
| [`PluginInfo`](#plugininfo) | Record | Angaben aus dem Manifest |
| [`UiManager`](#uimanager) | Interface | Buttons, Stylesheets, Hinweise |
| [`TerminalManager`](#terminalmanager) | Interface | Ansichten und Verbindungen |
| [`EventManager`](#eventmanager) | Interface | Ereignisse empfangen |
| [`StorageManager`](#storagemanager) | Interface | Daten ablegen |
| [`ButtonSpec`](#buttonspec) | Klasse | Beschreibung eines Buttons |
| [`ViewSpec`](#viewspec) | Klasse | Beschreibung einer Ansicht |
| [`Block`](#block) | Klasse | Inhaltselement einer Ansicht |
| [`Event`](#event) | Record | Ereignis mit Daten |
| [`Locations`](#locations) | Klasse | Konstanten für Button-Positionen |

## FeatherPlugin

```java
public interface FeatherPlugin {
    void onEnable(PluginAPIManager api) throws Exception;
    default void onDisable() throws Exception {}
}
```

| Methode | Beschreibung |
| --- | --- |
| `onEnable(api)` | Wird aufgerufen, wenn das Plugin geladen wird. Hier legst du Buttons, Ansichten und Handler an. Eine Ausnahme markiert das Plugin als fehlerhaft |
| `onDisable()` | Wird beim Deaktivieren, Entfernen und Beenden aufgerufen. Optional. Beiträge über die API entfernt Feather selbst |

Die Hauptklasse braucht einen öffentlichen Konstruktor ohne Parameter.

## PluginAPIManager

```java
public interface PluginAPIManager {
    PluginInfo info();
    Logger logger();
    UiManager ui();
    TerminalManager terminal();
    EventManager events();
    StorageManager storage();
}
```

| Methode | Rückgabe |
| --- | --- |
| `info()` | Angaben aus dem Manifest |
| `logger()` | `java.util.logging.Logger` mit dem Namen `feather.plugin.<id>` |
| `ui()` | Verwaltung von Buttons, Stylesheets und Hinweisen |
| `terminal()` | Verwaltung von Ansichten und Zugriff auf Verbindungen |
| `events()` | Registrierung von Ereignis-Handlern |
| `storage()` | Persistenter Speicher des Plugins |

## PluginInfo

```java
public record PluginInfo(String id, String name, String author, String version, String main, String description) {}
```

`id` ist die aus dem Namen abgeleitete Kennung, siehe [Manifest](plugins.md#manifest). `description` ist ein leerer Text, wenn das Manifest keine enthält.

## UiManager

```java
public interface UiManager {
    void addButton(ButtonSpec button);
    void removeButton(String id);
    void injectCss(String id, String css);
    void removeCss(String id);
    void toast(String message, String kind);
}
```

| Methode | Beschreibung |
| --- | --- |
| `addButton(button)` | Fügt einen Button hinzu. Ein Button mit gleicher ID wird ersetzt. Wirft `IllegalArgumentException`, wenn die ID fehlt |
| `removeButton(id)` | Entfernt den Button. Eine unbekannte ID wird ignoriert |
| `injectCss(id, css)` | Fügt ein Stylesheet hinzu oder ersetzt das mit gleicher ID. Höchstens 200 000 Zeichen, sonst `IllegalArgumentException` |
| `removeCss(id)` | Entfernt das Stylesheet |
| `toast(message, kind)` | Zeigt kurz eine Meldung. `kind` ist `"info"`, `"success"` oder `"error"`, andere Werte gelten als `"info"` |

## TerminalManager

```java
public interface TerminalManager {
    void addView(ViewSpec view);
    void setViewContent(String viewId, List<Block> blocks);
    void removeView(String viewId);
    void print(String sessionId, String text);
    void send(String sessionId, String text);
    List<Map<String, Object>> sessions();
}
```

| Methode | Beschreibung |
| --- | --- |
| `addView(view)` | Legt eine Ansicht als Reiter in jeder Server-Verbindung an. Eine neue Ansicht ist zunächst leer. Gleiche ID ersetzt Titel, Icon und Handler und behält den Inhalt |
| `setViewContent(viewId, blocks)` | Ersetzt den Inhalt der Ansicht. Wirft `IllegalArgumentException` bei unbekannter ID, lege die Ansicht also zuerst mit `addView` an |
| `removeView(viewId)` | Entfernt die Ansicht |
| `print(sessionId, text)` | Schreibt Text in die Terminalausgabe der Sitzung, ohne ihn an den Server zu senden |
| `send(sessionId, text)` | Sendet Text an die Shell des Servers wie eine Tastatureingabe |
| `sessions()` | Bekannte Sitzungen als Maps mit `sid`, `name`, `host`, `port`, `username`, `protocol` |

Eine leere oder unbekannte `sessionId` bezeichnet die aktive Sitzung. Ist keine offen, passiert nichts. Die Liste aus `sessions()` enthält die Sitzungen, die das Plugin seit seinem Start über `session.opened` kennengelernt hat.

## EventManager

```java
public interface EventManager {
    void on(String name, Consumer<Event> handler);
}
```

`on` registriert einen Handler für ein Ereignis. Mehrere Handler pro Ereignis sind erlaubt. Der Handler läuft auf einem Thread des Java-Kerns.

| Ereignis | Wann | Schlüssel in `event.data()` |
| --- | --- | --- |
| `session.opened` | Eine Verbindung wurde geöffnet | `sid`, `name`, `host`, `port`, `username`, `protocol` |
| `session.closed` | Eine Verbindung wurde geschlossen | wie oben |
| `button.click` | Ein Button dieses Plugins wurde geklickt | `plugin`, `id` |
| `view.action` | Ein Button in einer Ansicht dieses Plugins wurde geklickt | `plugin`, `view`, `id` |

`button.click` und `view.action` lassen sich einfacher über `ButtonSpec.onClick` und `ViewSpec.onAction` behandeln. `protocol` ist `ssh`, `sftp` oder `ftp`.

## StorageManager

```java
public interface StorageManager {
    String get(String key, String fallback);
    void put(String key, String value);
    void remove(String key);
}
```

| Methode | Beschreibung |
| --- | --- |
| `get(key, fallback)` | Liefert den gespeicherten Wert oder `fallback`, wenn der Schlüssel fehlt |
| `put(key, value)` | Speichert den Wert sofort |
| `remove(key)` | Löscht den Schlüssel |

Der Speicher gehört dem Plugin und liegt in `%USERPROFILE%\.feather\plugins\data\<id>.json`. Feather löscht ihn beim Entfernen des Plugins.

## ButtonSpec

Erzeugt über `ButtonSpec.of(id)`. Alle Setter geben das Objekt zurück und lassen sich verketten.

| Methode | Standard | Beschreibung |
| --- | --- | --- |
| `of(String id)` | | Wirft `IllegalArgumentException` bei leerer ID |
| `label(String)` | leer | Beschriftung |
| `icon(String)` | leer | Icon-Name oder Zeichen, siehe [Icons](oberflaeche.md#icons) |
| `tooltip(String)` | leer | Hilfetext |
| `location(String)` | `Locations.SERVER_TABBAR` | Position |
| `onClick(Consumer<Event>)` | tut nichts | Handler für Klicks |

Zu jedem Setter gibt es einen gleichnamigen Getter ohne Parameter, sowie `id()`.

## ViewSpec

Erzeugt über `ViewSpec.of(id)`.

| Methode | Standard | Beschreibung |
| --- | --- | --- |
| `of(String id)` | | Wirft `IllegalArgumentException` bei leerer ID |
| `title(String)` | leer | Titel des Reiters |
| `icon(String)` | leer | Icon des Reiters |
| `onAction(Consumer<Event>)` | tut nichts | Handler für Klicks auf Buttons der Ansicht |

## Block

Inhaltselemente einer Ansicht. Alle Fabrikmethoden sind statisch.

| Methode | Darstellung |
| --- | --- |
| `heading(String text)` | Überschrift |
| `text(String text)` | Absatz |
| `code(String text)` | Vorformatierter, auswählbarer Text |
| `button(String id, String label)` | Schaltfläche, ruft `ViewSpec.onAction` auf |
| `divider()` | Trennlinie |

## Event

```java
public record Event(String name, Map<String, Object> data) {
    public String string(String key) { ... }
}
```

| Member | Beschreibung |
| --- | --- |
| `name()` | Name des Ereignisses |
| `data()` | Nutzdaten als Map |
| `string(key)` | Wert als Text, ein leerer Text bei fehlendem Schlüssel |

## Locations

| Konstante | Wert |
| --- | --- |
| `SERVER_TABBAR` | `server.tabbar` |
| `TERMINAL_TOOLBAR` | `terminal.toolbar` |
| `FILES_TOOLBAR` | `files.toolbar` |
| `SIDEBAR` | `sidebar` |

Die Orte beschreibt [Oberfläche erweitern](oberflaeche.md#positionen).

## Fehlerverhalten

- Ungültige Argumente führen zu einer `IllegalArgumentException` mit deutscher Meldung. Sie bricht `onEnable` ab, wenn du sie dort nicht fängst.
- Ausnahmen in Handlern werden abgefangen, im Plugin-Log festgehalten und als Hinweis angezeigt. Das Plugin bleibt aktiv.
- Methoden des API sind thread-sicher und dürfen aus eigenen Threads aufgerufen werden.
