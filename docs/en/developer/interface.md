# Extending the interface

A plugin extends Feather's interface in three ways: buttons at fixed positions, custom views in the terminal area, and stylesheets. In addition there are notifications (toasts) and the option to write to the terminal of a connection.

All contributions belong to the plugin that created them. Feather removes them as soon as the plugin is disabled or removed.

## Buttons

You create buttons with `ui().addButton(...)`. A `ButtonSpec` describes label, icon, tooltip, location and handler.

```java
api.ui().addButton(
    ButtonSpec.of("backup")
        .label("Back up")
        .icon("download")
        .tooltip("Starts the backup")
        .location(Locations.FILES_TOOLBAR)
        .onClick(event -> api.ui().toast("Backup started", "success")));
```

| Method | Description |
| --- | --- |
| `ButtonSpec.of(id)` | Creates the button. The ID must be unique within the plugin and must not be empty |
| `label(text)` | Label. Without a label the button shows only the icon |
| `icon(name)` | Icon, see below |
| `tooltip(text)` | Help text on hover |
| `location(place)` | Position, `Locations.SERVER_TABBAR` by default |
| `onClick(handler)` | Called on click with an `Event` |

Calling `addButton` with an ID that already exists replaces the old button. This is how you update label and handler, for example for a toggle. `removeButton(id)` removes the button.

### Locations

| Constant | Value | Place |
| --- | --- | --- |
| `Locations.SERVER_TABBAR` | `server.tabbar` | Right side of the tab bar in the terminal area |
| `Locations.TERMINAL_TOOLBAR` | `terminal.toolbar` | Header of a server tab, next to Terminal and Modules |
| `Locations.FILES_TOOLBAR` | `files.toolbar` | Toolbar of the file view |
| `Locations.SIDEBAR` | `sidebar` | Bottom of the sidebar |

An unknown location means the button does not appear anywhere.

### Icons

As an icon you can pass a name from the following list. Case does not matter.

`bell`, `bug`, `cloud`, `code`, `cpu`, `database`, `download`, `eye`, `flame`, `folder`, `gift`, `globe`, `heart`, `lock`, `package`, `palette`, `pencil`, `play`, `plug`, `puzzle`, `rainbow`, `refresh`, `rocket`, `search`, `server`, `settings`, `shield`, `sparkles`, `star`, `terminal`, `upload`, `wand`, `wrench`, `zap`

Any other text, such as an emoji, is rendered as characters (at most four).

### The event

The handler receives an `Event`. For buttons, `data` contains the keys `plugin` (ID of the plugin) and `id` (ID of the button).

```java
.onClick(event -> {
    String button = event.string("id");
    api.logger().info("Clicked: " + button);
})
```

`event.string(key)` returns the value as text, or an empty string if the key is missing.

## Views in the terminal area

A view is its own tab next to **Terminal** and **Modules** in every server connection. Its content is a list of blocks that the plugin can replace at any time.

```java
api.terminal().addView(
    ViewSpec.of("status").title("Status").icon("server").onAction(event -> {
        if (event.string("id").equals("reload")) reload();
    }));

api.terminal().setViewContent("status", List.of(
    Block.heading("Server status"),
    Block.text("All services are running."),
    Block.code("uptime: 12 days"),
    Block.divider(),
    Block.button("reload", "Refresh")));
```

| Block | Rendering |
| --- | --- |
| `Block.heading(text)` | Heading |
| `Block.text(text)` | Paragraph, line breaks are preserved |
| `Block.code(text)` | Preformatted monospaced text, selectable |
| `Block.divider()` | Divider line |
| `Block.button(id, label)` | Button. A click calls the view's `onAction`, `event.string("id")` returns the ID |

`ViewSpec.onAction` receives an `Event` with the keys `plugin`, `view` and `id` for every click on a button in the view. `setViewContent` replaces the entire content, so calling it again updates the display. `removeView(id)` removes the view.

The content consists of text and buttons. Freely designed interfaces with HTML are not supported.

## Stylesheets

`ui().injectCss(id, css)` adds a stylesheet to the interface, `removeCss(id)` takes it back. The same ID replaces the existing stylesheet. The size is limited to 200,000 characters.

```java
api.ui().injectCss("compact", "[data-feather-area=\"server\"] .btn { height: 28px; }");
```

These anchors are available for targeted adjustments:

| Selector | Element |
| --- | --- |
| `[data-feather-area="server"]` | The whole terminal area |
| `[data-feather-icon="folder"]` | Folder icons in the file view |
| `[data-feather-icon="file"]` | File icons in the file view |
| `svg.lucide` | All icons |

The interface colors are available as CSS variables: `--color-primary` (accent color), `--color-bg` (background) and `--color-neutral-50` to `--color-neutral-950`. Use them so your plugin adapts to themes.

## Notifications

`ui().toast(text, kind)` briefly shows a message. `kind` is `"info"`, `"success"` or `"error"`. Other values count as `"info"`.

## Working with the terminal

`terminal()` accesses the open connections.

| Method | Effect |
| --- | --- |
| `sessions()` | List of open sessions as maps with `sid`, `name`, `host`, `port`, `username`, `protocol` |
| `print(sessionId, text)` | Writes text to the terminal output. The server does not see it, it is for display only |
| `send(sessionId, text)` | Sends text to the server as if you had typed it. A trailing `\r` corresponds to the Enter key |

An empty or unknown session ID selects the active connection. If no connection is open, Feather does nothing.

```java
api.terminal().send("", "uptime\r");
```

`sessions()` returns the state the plugin has learned through `session.opened` and `session.closed`, see [events](api-reference.md#eventmanager).

## Storing data

`storage()` keeps key-value pairs per plugin. They survive restarts and are deleted when the plugin is removed.

```java
String state = api.storage().get("state", "on");
api.storage().put("state", "off");
```

Values are strings. Serialize structured data yourself, for example as JSON.
