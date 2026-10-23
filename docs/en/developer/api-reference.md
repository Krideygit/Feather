# API reference

All types are in the package `feather.api`. The interface is at version 1.

| Type | Kind | Purpose |
| --- | --- | --- |
| [`FeatherPlugin`](#featherplugin) | Interface | Entry point of a plugin |
| [`PluginAPIManager`](#pluginapimanager) | Interface | Access to all features |
| [`PluginInfo`](#plugininfo) | Record | Information from the manifest |
| [`UiManager`](#uimanager) | Interface | Buttons, stylesheets, notifications |
| [`TerminalManager`](#terminalmanager) | Interface | Views and connections |
| [`EventManager`](#eventmanager) | Interface | Receiving events |
| [`StorageManager`](#storagemanager) | Interface | Storing data |
| [`ButtonSpec`](#buttonspec) | Class | Description of a button |
| [`ViewSpec`](#viewspec) | Class | Description of a view |
| [`Block`](#block) | Class | Content element of a view |
| [`Event`](#event) | Record | Event with data |
| [`Locations`](#locations) | Class | Constants for button positions |

## FeatherPlugin

```java
public interface FeatherPlugin {
    void onEnable(PluginAPIManager api) throws Exception;
    default void onDisable() throws Exception {}
}
```

| Method | Description |
| --- | --- |
| `onEnable(api)` | Called when the plugin is loaded. Create buttons, views and handlers here. An exception marks the plugin as faulty |
| `onDisable()` | Called on disable, removal and shutdown. Optional. Feather removes contributions made through the API itself |

The main class needs a public constructor without parameters.

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

| Method | Returns |
| --- | --- |
| `info()` | Information from the manifest |
| `logger()` | `java.util.logging.Logger` named `feather.plugin.<id>` |
| `ui()` | Management of buttons, stylesheets and notifications |
| `terminal()` | Management of views and access to connections |
| `events()` | Registration of event handlers |
| `storage()` | Persistent storage of the plugin |

## PluginInfo

```java
public record PluginInfo(String id, String name, String author, String version, String main, String description) {}
```

`id` is the identifier derived from the name, see [manifest](plugins.md#manifest). `description` is an empty string if the manifest has none.

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

| Method | Description |
| --- | --- |
| `addButton(button)` | Adds a button. A button with the same ID is replaced. Throws `IllegalArgumentException` if the ID is missing |
| `removeButton(id)` | Removes the button. An unknown ID is ignored |
| `injectCss(id, css)` | Adds a stylesheet or replaces the one with the same ID. At most 200,000 characters, otherwise `IllegalArgumentException` |
| `removeCss(id)` | Removes the stylesheet |
| `toast(message, kind)` | Briefly shows a message. `kind` is `"info"`, `"success"` or `"error"`, other values count as `"info"` |

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

| Method | Description |
| --- | --- |
| `addView(view)` | Creates a view as a tab in every server connection. A new view is empty at first. The same ID replaces title, icon and handler and keeps the content |
| `setViewContent(viewId, blocks)` | Replaces the content of the view. Throws `IllegalArgumentException` for an unknown ID, so create the view with `addView` first |
| `removeView(viewId)` | Removes the view |
| `print(sessionId, text)` | Writes text to the terminal output of the session without sending it to the server |
| `send(sessionId, text)` | Sends text to the server's shell like keyboard input |
| `sessions()` | Known sessions as maps with `sid`, `name`, `host`, `port`, `username`, `protocol` |

An empty or unknown `sessionId` refers to the active session. If none is open, nothing happens. The list from `sessions()` contains the sessions the plugin has learned about through `session.opened` since it started.

## EventManager

```java
public interface EventManager {
    void on(String name, Consumer<Event> handler);
}
```

`on` registers a handler for an event. Several handlers per event are allowed. The handler runs on a thread of the Java core.

| Event | When | Keys in `event.data()` |
| --- | --- | --- |
| `session.opened` | A connection was opened | `sid`, `name`, `host`, `port`, `username`, `protocol` |
| `session.closed` | A connection was closed | as above |
| `button.click` | A button of this plugin was clicked | `plugin`, `id` |
| `view.action` | A button in a view of this plugin was clicked | `plugin`, `view`, `id` |

`button.click` and `view.action` are easier to handle through `ButtonSpec.onClick` and `ViewSpec.onAction`. `protocol` is `ssh`, `sftp` or `ftp`.

## StorageManager

```java
public interface StorageManager {
    String get(String key, String fallback);
    void put(String key, String value);
    void remove(String key);
}
```

| Method | Description |
| --- | --- |
| `get(key, fallback)` | Returns the stored value or `fallback` if the key is missing |
| `put(key, value)` | Stores the value immediately |
| `remove(key)` | Deletes the key |

The storage belongs to the plugin and lives in `%USERPROFILE%\.feather\plugins\data\<id>.json`. Feather deletes it when the plugin is removed.

## ButtonSpec

Created with `ButtonSpec.of(id)`. All setters return the object and can be chained.

| Method | Default | Description |
| --- | --- | --- |
| `of(String id)` | | Throws `IllegalArgumentException` for an empty ID |
| `label(String)` | empty | Label |
| `icon(String)` | empty | Icon name or character, see [icons](interface.md#icons) |
| `tooltip(String)` | empty | Help text |
| `location(String)` | `Locations.SERVER_TABBAR` | Position |
| `onClick(Consumer<Event>)` | does nothing | Handler for clicks |

Every setter has a getter of the same name without parameters, plus `id()`.

## ViewSpec

Created with `ViewSpec.of(id)`.

| Method | Default | Description |
| --- | --- | --- |
| `of(String id)` | | Throws `IllegalArgumentException` for an empty ID |
| `title(String)` | empty | Title of the tab |
| `icon(String)` | empty | Icon of the tab |
| `onAction(Consumer<Event>)` | does nothing | Handler for clicks on buttons in the view |

## Block

Content elements of a view. All factory methods are static.

| Method | Rendering |
| --- | --- |
| `heading(String text)` | Heading |
| `text(String text)` | Paragraph |
| `code(String text)` | Preformatted, selectable text |
| `button(String id, String label)` | Button, calls `ViewSpec.onAction` |
| `divider()` | Divider line |

## Event

```java
public record Event(String name, Map<String, Object> data) {
    public String string(String key) { ... }
}
```

| Member | Description |
| --- | --- |
| `name()` | Name of the event |
| `data()` | Payload as a map |
| `string(key)` | Value as text, an empty string for a missing key |

## Locations

| Constant | Value |
| --- | --- |
| `SERVER_TABBAR` | `server.tabbar` |
| `TERMINAL_TOOLBAR` | `terminal.toolbar` |
| `FILES_TOOLBAR` | `files.toolbar` |
| `SIDEBAR` | `sidebar` |

The places are described in [Extending the interface](interface.md#locations).

## Error behavior

- Invalid arguments cause an `IllegalArgumentException` with a German message. It aborts `onEnable` unless you catch it there.
- Exceptions in handlers are caught, logged in the plugin log and shown as a notification. The plugin stays active.
- The API methods are thread-safe and may be called from your own threads.
