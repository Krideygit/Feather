# Example: Server Tools

This example builds a plugin that

- adds an **Uptime** button to the toolbar of every server connection, which runs the command `uptime` in the terminal,
- adds a **Tools** view with an overview and two buttons,
- counts how often you have connected and stores the counter permanently.

## Project layout

```
server-tools/
├── feather-plugin.json
└── src/dev/example/ServerTools.java
```

## Manifest

`feather-plugin.json`:

```json
{
  "name": "Server Tools",
  "author": "Jane Doe",
  "version": "1.0.0",
  "main": "dev.example.ServerTools",
  "description": "Uptime button and a tools view for server connections.",
  "apiVersion": 1
}
```

## Main class

`src/dev/example/ServerTools.java`:

```java
package dev.example;

import feather.api.Block;
import feather.api.ButtonSpec;
import feather.api.FeatherPlugin;
import feather.api.Locations;
import feather.api.PluginAPIManager;
import feather.api.ViewSpec;
import java.util.List;

public final class ServerTools implements FeatherPlugin {
    private PluginAPIManager api;

    @Override
    public void onEnable(PluginAPIManager api) {
        this.api = api;

        api.ui().addButton(
                ButtonSpec.of("uptime")
                        .label("Uptime")
                        .icon("server")
                        .tooltip("Runs uptime on the server")
                        .location(Locations.TERMINAL_TOOLBAR)
                        .onClick(event -> api.terminal().send("", "uptime\r")));

        api.terminal().addView(ViewSpec.of("tools").title("Tools").icon("wrench").onAction(event -> {
            switch (event.string("id")) {
                case "memory" -> api.terminal().send("", "free -h\r");
                case "disk" -> api.terminal().send("", "df -h\r");
                default -> api.logger().warning("Unknown action: " + event.string("id"));
            }
        }));

        api.events().on("session.opened", event -> {
            int count = Integer.parseInt(api.storage().get("connections", "0")) + 1;
            api.storage().put("connections", String.valueOf(count));
            api.ui().toast("Connected to " + event.string("name"), "success");
            showView();
        });

        showView();
    }

    private void showView() {
        String count = api.storage().get("connections", "0");
        api.terminal().setViewContent("tools", List.of(
                Block.heading("Server Tools"),
                Block.text("Connections since installation: " + count),
                Block.divider(),
                Block.button("memory", "Show memory"),
                Block.button("disk", "Show disk space")));
    }
}
```

The button uses `send("", "uptime\r")` to send the command to the currently active connection. The trailing `\r` corresponds to the Enter key. The view updates when a new connection is added because `showView()` replaces the content.

## Build

First you need the classes of the plugin API. In the Feather source, `npm run build:core` creates the folder `core/out`. Then compile and package the `.jar`.

```bash
mkdir -p build/classes
javac --release 17 -encoding UTF-8 \
  -cp /path/to/feather/core/out \
  -d build/classes \
  src/dev/example/ServerTools.java
cp feather-plugin.json build/classes/
jar --create --file server-tools.jar -C build/classes .
```

On Windows, use the same commands in a command prompt with `\` as path separator and `copy` instead of `cp`. Instead of `core/out` you can also use `-cp feather-core.jar` if you copy that file from an installation or a release.

## Install

1. Open **Settings › Plugins**.
2. Choose **Upload plugin (.jar)** and the file `server-tools.jar`.
3. Confirm the security prompt.
4. Open a server connection. The **Uptime** button appears in the header, and the **Tools** tab appears next to **Terminal** and **Modules**.

If you change the code, rebuild the `.jar` and upload it again. Feather replaces the existing plugin.

## Troubleshooting

- If `onEnable` fails, the message appears in the plugin list.
- Handler exceptions appear as a notification in Feather. The plugin stays active.
- With `api.logger()` you write messages to the log of the Java core.
- If a button does not appear, check the location first. An unknown location hides the button.

## Next steps

- [Extending the interface](interface.md): all locations, icons and blocks
- [API reference](api-reference.md): full description
