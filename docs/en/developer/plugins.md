# Developing plugins

Plugins extend Feather with buttons, custom views in the terminal area, stylesheets and reactions to events. A plugin is a `.jar` file compiled against the `feather.api` package. The interface is part of Feather's Java core and ships with it.

| Document | Contents |
| --- | --- |
| This page | Structure, manifest, lifecycle, installation |
| [Extending the interface](interface.md) | Buttons, views, styles, notifications |
| [API reference](api-reference.md) | All types and methods |
| [Example](example.md) | A complete plugin, step by step |

## Requirements

- JDK 17 or newer. Compile with `--release 17` so the plugin runs on the bundled runtime.
- The classes of the plugin API for compilation. You get them from the Feather source with `npm run build:core`. Afterwards the folder `core/out` contains `feather/api/*.class`. The same classes are also in `core/feather-core.jar` and, in an installed copy, under `resources/core/feather-core.jar`.

The plugin API is at version 1. The main class and all types in `feather.api` are stable within a major version.

## Structure

A plugin file contains two things:

1. the manifest `feather-plugin.json` in the root of the `.jar`
2. the compiled classes, including the main class

```
my-plugin.jar
├── feather-plugin.json
└── dev/example/MyPlugin.class
```

## Manifest

```json
{
  "name": "My Plugin",
  "author": "Jane Doe",
  "version": "1.0.0",
  "main": "dev.example.MyPlugin",
  "description": "Short description for the plugin list.",
  "apiVersion": 1
}
```

| Field | Required | Description |
| --- | --- | --- |
| `author` | yes | Name of the author, shown in the plugin list and before installation |
| `main` | yes | Fully qualified name of the main class, for example `dev.example.MyPlugin` |
| `version` | yes | Free-form version text, Feather does not compare it |
| `name` | no | Display name. If missing, Feather uses the simple class name |
| `description` | no | Description for the list |
| `apiVersion` | no | Required version of the plugin API. If a plugin requires a newer version than Feather provides, Feather rejects it with a clear message |

Feather derives the plugin **ID** from the name: lowercase, every character other than letters and digits becomes a hyphen, at most 40 characters. "My Plugin" becomes `my-plugin`. The ID determines the file name, the storage file and the identity: a plugin with the same ID replaces the existing one.

The manifest is validated on installation. Missing required fields, invalid JSON, an invalid class name and a file that is not a `.jar` all produce an error message and nothing is installed.

## Main class

The main class implements `feather.api.FeatherPlugin` and needs a public constructor without parameters.

```java
package dev.example;

import feather.api.FeatherPlugin;
import feather.api.PluginAPIManager;

public final class MyPlugin implements FeatherPlugin {
    @Override
    public void onEnable(PluginAPIManager api) {
        api.logger().info("Plugin started");
    }

    @Override
    public void onDisable() {
        // Clean up if necessary
    }
}
```

`onEnable` receives the `PluginAPIManager`, the entry point to all features. Everything a plugin creates through the API (buttons, views, styles, handlers) is removed automatically by Feather when the plugin is disabled. `onDisable` is only for cleaning up your own resources such as threads or files.

## Lifecycle

| Event | Behavior |
| --- | --- |
| Feather starts | All enabled plugins are loaded and `onEnable` is called |
| Install | Validate the manifest, copy the file to the plugin folder, load it. If `onEnable` fails, Feather rolls the installation back and restores a previous version |
| Disable | Call `onDisable`, remove contributions, close the class loader |
| Enable | Reload the plugin and call `onEnable` |
| Remove | Like disable, then delete the file and the stored data |
| Feather exits | `onDisable` for all plugins |

Each plugin runs in its own class loader. The class loader of the Java core is its parent, so a plugin sees the Java standard library and Feather's classes. Only the package `feather.api` is an interface contract. Everything else may change without notice. Package further dependencies into the `.jar` (fat jar).

If `onEnable` throws an exception, Feather marks the plugin as faulty in the list and shows the message. Feather catches exceptions in handlers, writes them to the plugin log and shows a notification. The plugin stays active.

## Threads

Handlers for clicks and events call plugin code on a thread of the Java core. Do not block it with long operations. For work that involves waiting, start your own thread and stop it in `onDisable`.

## Storage locations

| Path | Contents |
| --- | --- |
| `%USERPROFILE%\.feather\plugins\<id>.jar` | Installed plugin file |
| `%USERPROFILE%\.feather\plugins\data\<id>.json` | Plugin data, see `StorageManager` |
| `%USERPROFILE%\.feather\plugins\plugins.json` | Which plugins are enabled |

**Open plugin folder** in the settings shows the folder.

## Install and test

1. Build the `.jar`, see the [example](example.md).
2. Open **Settings › Plugins** and choose **Upload plugin (.jar)**.
3. Confirm the security prompt. Feather shows name, author and version.
4. The plugin appears in the list. Feather shows errors right there.

During development it is enough to upload the new `.jar` again. Feather replaces the existing plugin and restores the previous version if startup fails.

## Plugin licensing

The [Feather license](../../../LICENSE) allows you to publish, distribute and sell plugins under any license you choose. The condition is that the plugin interacts with Feather only through `feather.api` and contains no Feather code. You must not distribute Feather itself together with the plugin.

## Security

A plugin runs with the full rights of the user who started Feather. There is no sandbox. Publish plugins with their source code and describe what they do. Users should only install plugins from sources they trust.

## Example in the source

The repository contains a complete plugin in `plugins-src/rainbow-icons`. `npm run build:plugins` builds all plugins under `plugins-src` into `plugins-dist`.
