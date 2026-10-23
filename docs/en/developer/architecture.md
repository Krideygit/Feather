# Architecture and build

## Overview

Feather consists of three parts.

| Part | Technology | Purpose |
| --- | --- | --- |
| Interface | React and TypeScript in an Electron renderer, Tailwind CSS | Display, input |
| Main process | TypeScript in Electron | Windows, dialogs, server connections (SSH, SFTP, FTP), credential storage, backup, Saveeye, languages |
| Java core | Java 17, no external dependencies apart from the MariaDB driver | Local services, profiles, database access, plugins |

The main process starts the Java core as a child process and talks to it over standard input and output. Every line is a JSON object. Requests carry an `id`, `method` and `params`. Responses carry the same `id` with `result` or `error`. A message without an `id` is an event (`event`, `data`) that the core sends on its own.

The interface reaches both sides through a narrow bridge (`window.feather`) provided by the preload script in the main process. The renderer runs with `contextIsolation` and `sandbox`, it has no direct access to Node.js.

```
Renderer  ──  window.feather  ──  Main process  ──  stdio (JSON)  ──  Java core
   │                                  │
   │                                  └── SSH / SFTP / FTP, credentials, backup
   └── React, state, suggestions, translation
```

## Directories

| Path | Contents |
| --- | --- |
| `src/main` | Main process: windows, IPC, settings, backup, Saveeye, languages, histories |
| `src/main/remote` | Server connections, file transfer, credentials, server modules |
| `src/renderer` | Interface: pages, dialogs, components, state |
| `src/shared` | Types and pure logic used by both sides (SQL generator, suggestions, language packs) |
| `core/src/feather` | Java core |
| `core/src/feather/api` | Plugin API |
| `plugins-src` | Example plugins |
| `scripts` | Build, test and helper scripts |
| `docs` | Documentation |
| `build` | Icons, and the generated runtime if needed |

Code that needs no Electron or browser features lives in `src/shared`. This lets it run directly in tests, see below.

## Development environment

Requirements: Node.js (tested with version 24), npm and a JDK 17 or newer.

```bash
npm install
npm run dev
```

`npm run dev` builds the Java core and the interface, starts a watch build and opens Electron. F12 opens the developer tools, Ctrl + R reloads the interface.

For Java, Feather searches in this order: `resources/jre` (release build), `JAVA_HOME`, `java` on the path.

### Environment variables

| Variable | Effect |
| --- | --- |
| `FEATHER_HOME` | Folder for profiles, services and plugins instead of `%USERPROFILE%\.feather` |
| `FEATHER_CORE_JAR` | Path to a different `feather-core.jar` |
| `FEATHER_CORE_OUT` | Output file of `npm run build:core`, useful when the running application locks the jar |

With `--user-data-dir=<folder>`, Electron starts with separate settings. This lets a development instance run next to an installed one.

## Scripts

| Command | Effect |
| --- | --- |
| `npm run build:core` | Build the Java core into `core/feather-core.jar` |
| `npm run build:app` | Build main process and interface into `dist` |
| `npm run build` | Both |
| `npm run build:plugins` | Build the example plugins from `plugins-src` into `plugins-dist` |
| `npm run build:jre` | Create a slim Java runtime with `jlink` in `build/jre` |
| `npm run typecheck` | Check TypeScript |
| `npm test` | All tests |
| `npm run dist` | Build the installer, see below |

## Tests

`npm test` runs the suites one after another. Each is a standalone Node script.

| Script | Tests |
| --- | --- |
| `test-blueprint.js` | Blueprint editor: graphs and SQL generation |
| `test-remote.js` | SSH, SFTP and FTP against a test server |
| `test-modules.js` | Server modules against a simulated Linux |
| `test-backup.js` | Backup and restore |
| `test-saveeye.js` | Detection of screen captures |
| `test-i18n.js` | Translation and language packs |
| `test-plugins.js` | Plugin loading, API and lifecycle |
| `test-sql.js` | SQL generator, suggestions, change history |
| `test-terminal.js` | Command suggestions and error hints |

The tests bundle the TypeScript code under test with esbuild and replace `electron` with a small stub. For the server tests, `test-ssh-server.js` starts an SSH server on the local machine, and `fake-linux.js` adds a simulated system with `apt`, `systemctl` and `mariadb`.

## Building a release

```bash
npm run dist
```

The command runs in order: type check, build, plugins, runtime and `electron-builder`. The result is in `release`:

| File | Contents |
| --- | --- |
| `Feather-Setup-<version>.exe` | Installer for Windows (NSIS) |
| `Feather-Setup-<version>.exe.blockmap` | Verification data for differential updates |

The installer contains the application, the Java core, a Java runtime created with `jlink` and the example plugin. Users do not need Java.

The version comes from `package.json`. Increase it before building.

The installer is not signed. To sign it, add a certificate to the `build` configuration in `package.json`, see the `electron-builder` documentation.

If a running Feather instance locks the Java core jar, `build:core` fails. Close the instance or set `FEATHER_CORE_OUT`.
