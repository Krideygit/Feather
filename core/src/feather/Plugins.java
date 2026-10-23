package feather;

import feather.api.FeatherPlugin;
import feather.api.PluginInfo;
import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.regex.Pattern;
import java.util.stream.Stream;

final class Plugins {
    static final int API_VERSION = 1;
    private static final String MANIFEST = "feather-plugin.json";
    private static final Pattern MAIN = Pattern.compile("^[A-Za-z_$][A-Za-z0-9_$]*(\\.[A-Za-z_$][A-Za-z0-9_$]*)*$");

    record Manifest(String id, String name, String author, String version, String main, String description) {
        PluginInfo info() {
            return new PluginInfo(id, name, author, version, main, description);
        }
    }

    private static final class Loaded {
        final Manifest manifest;
        final Path file;
        boolean enabled;
        String error;
        URLClassLoader loader;
        FeatherPlugin instance;
        PluginRuntime runtime;

        Loaded(Manifest manifest, Path file, boolean enabled) {
            this.manifest = manifest;
            this.file = file;
            this.enabled = enabled;
        }
    }

    private final Map<String, Loaded> plugins = new LinkedHashMap<>();

    static Path dir() {
        return Home.root().resolve("plugins");
    }

    private static Path stateFile() {
        return dir().resolve("plugins.json");
    }

    static String slug(String text) {
        String s = text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (s.length() > 40) s = s.substring(0, 40);
        return s.isEmpty() ? "plugin" : s;
    }

    private static String required(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (!(v instanceof String s) || s.isBlank()) throw new IllegalArgumentException("In der feather-plugin.json fehlt das Pflichtfeld \"" + key + "\".");
        return s.trim();
    }

    static Manifest readManifest(Path jar) throws IOException {
        try (JarFile jf = new JarFile(jar.toFile())) {
            JarEntry entry = jf.getJarEntry(MANIFEST);
            if (entry == null) throw new IllegalArgumentException("Die Plugin-Datei enthält keine " + MANIFEST + ".");
            Map<String, Object> m;
            try {
                m = Json.parseObject(new String(jf.getInputStream(entry).readAllBytes(), StandardCharsets.UTF_8));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Die " + MANIFEST + " ist kein gültiges JSON.");
            }
            String author = required(m, "author");
            String main = required(m, "main");
            String version = required(m, "version");
            if (!MAIN.matcher(main).matches()) throw new IllegalArgumentException("Der Hauptpfad \"" + main + "\" ist kein gültiger Klassenname.");
            if (m.get("apiVersion") instanceof Number n && n.intValue() > API_VERSION) {
                throw new IllegalArgumentException("Das Plugin benötigt eine neuere Feather-Version (API " + n.intValue() + ").");
            }
            String simple = main.substring(main.lastIndexOf('.') + 1);
            String name = m.get("name") instanceof String s && !s.isBlank() ? s.trim() : simple;
            String description = m.get("description") instanceof String s ? s.trim() : "";
            return new Manifest(slug(name), name, author, version, main, description);
        } catch (java.util.zip.ZipException e) {
            throw new IllegalArgumentException("Das ist keine gültige .jar-Datei.");
        }
    }

    private Map<String, Object> readState() {
        try {
            if (Files.exists(stateFile())) return Json.parseObject(Files.readString(stateFile(), StandardCharsets.UTF_8));
        } catch (IOException | RuntimeException e) {
            System.err.println("plugins.json unlesbar: " + e.getMessage());
        }
        return new LinkedHashMap<>();
    }

    private void saveState() {
        Map<String, Object> state = new LinkedHashMap<>();
        for (Loaded l : plugins.values()) state.put(l.manifest.id(), Json.obj("enabled", l.enabled));
        try {
            Files.createDirectories(dir());
            Files.writeString(stateFile(), Json.stringify(state), StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.err.println("plugins.json nicht speicherbar: " + e.getMessage());
        }
    }

    synchronized void loadAll() {
        try {
            Files.createDirectories(dir());
        } catch (IOException e) {
            return;
        }
        Map<String, Object> state = readState();
        try (Stream<Path> files = Files.list(dir())) {
            for (Path file : (Iterable<Path>) files.filter(f -> f.toString().endsWith(".jar")).sorted()::iterator) {
                try {
                    Manifest m = readManifest(file);
                    boolean enabled = !(state.get(m.id()) instanceof Map<?, ?> s) || !Boolean.FALSE.equals(s.get("enabled"));
                    Loaded l = new Loaded(m, file, enabled);
                    plugins.put(m.id(), l);
                    if (enabled) activate(l);
                } catch (IOException | RuntimeException e) {
                    System.err.println("Plugin " + file.getFileName() + " übersprungen: " + e.getMessage());
                }
            }
        } catch (IOException e) {
            System.err.println("Plugin-Ordner nicht lesbar: " + e.getMessage());
        }
    }

    private void activate(Loaded l) {
        l.error = null;
        try {
            l.loader = new URLClassLoader(new URL[] {l.file.toUri().toURL()}, FeatherPlugin.class.getClassLoader());
            Class<?> cls = l.loader.loadClass(l.manifest.main());
            if (!FeatherPlugin.class.isAssignableFrom(cls)) throw new IllegalArgumentException("Die Hauptklasse implementiert nicht feather.api.FeatherPlugin.");
            l.instance = (FeatherPlugin) cls.getDeclaredConstructor().newInstance();
            l.runtime = new PluginRuntime(l.manifest.info(), dir().resolve("data").resolve(l.manifest.id() + ".json"));
            l.instance.onEnable(l.runtime);
        } catch (ClassNotFoundException e) {
            fail(l, "Die Hauptklasse \"" + l.manifest.main() + "\" wurde in der .jar nicht gefunden.");
        } catch (NoSuchMethodException e) {
            fail(l, "Die Hauptklasse braucht einen öffentlichen Konstruktor ohne Parameter.");
        } catch (Throwable t) {
            Throwable cause = t instanceof java.lang.reflect.InvocationTargetException ite && ite.getCause() != null ? ite.getCause() : t;
            fail(l, cause.getMessage() == null ? cause.toString() : cause.getMessage());
        }
        Events.emit("plugin.changed", Json.obj("plugin", l.manifest.id()));
    }

    private void fail(Loaded l, String message) {
        l.error = message;
        deactivate(l);
    }

    private void deactivate(Loaded l) {
        try {
            if (l.instance != null) l.instance.onDisable();
        } catch (Throwable t) {
            System.err.println("Plugin " + l.manifest.id() + " onDisable: " + t);
        }
        if (l.runtime != null) l.runtime.clear();
        try {
            if (l.loader != null) l.loader.close();
        } catch (IOException ignored) {
        }
        l.instance = null;
        l.runtime = null;
        l.loader = null;
        Events.emit("plugin.changed", Json.obj("plugin", l.manifest.id()));
    }

    synchronized Map<String, Object> install(Path source) throws IOException {
        if (!Files.isRegularFile(source)) throw new IllegalArgumentException("Die Datei wurde nicht gefunden.");
        Manifest m = readManifest(source);
        Files.createDirectories(dir());
        Loaded existing = plugins.get(m.id());
        if (existing != null) deactivate(existing);
        Path target = dir().resolve(m.id() + ".jar");
        Path backup = null;
        if (Files.exists(target)) {
            backup = target.resolveSibling(m.id() + ".jar.bak");
            Files.move(target, backup, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
        Loaded l = new Loaded(m, target, true);
        plugins.put(m.id(), l);
        activate(l);
        if (l.error != null) {
            String error = l.error;
            deactivate(l);
            Files.deleteIfExists(target);
            if (backup != null) Files.move(backup, target, StandardCopyOption.REPLACE_EXISTING);
            if (existing != null) {
                plugins.put(m.id(), existing);
                if (existing.enabled) activate(existing);
            } else {
                plugins.remove(m.id());
            }
            throw new IllegalArgumentException("Das Plugin konnte nicht gestartet werden: " + error);
        }
        if (backup != null) Files.deleteIfExists(backup);
        saveState();
        return view(l);
    }

    synchronized Map<String, Object> setEnabled(String id, boolean enabled) {
        Loaded l = get(id);
        if (l.enabled == enabled) return view(l);
        l.enabled = enabled;
        if (enabled) activate(l);
        else {
            deactivate(l);
            l.error = null;
        }
        saveState();
        return view(l);
    }

    synchronized void remove(String id) throws IOException {
        Loaded l = get(id);
        deactivate(l);
        plugins.remove(id);
        Files.deleteIfExists(l.file);
        Files.deleteIfExists(dir().resolve("data").resolve(id + ".json"));
        saveState();
    }

    private Loaded get(String id) {
        Loaded l = plugins.get(id);
        if (l == null) throw new IllegalArgumentException("Plugin nicht gefunden.");
        return l;
    }

    private Map<String, Object> view(Loaded l) {
        Manifest m = l.manifest;
        return Json.obj("id", m.id(), "name", m.name(), "author", m.author(), "version", m.version(), "main", m.main(),
                "description", m.description(), "enabled", l.enabled, "running", l.instance != null, "error", l.error,
                "file", l.file.toString());
    }

    synchronized List<Object> list() {
        List<Object> out = new ArrayList<>();
        for (Loaded l : plugins.values()) out.add(view(l));
        return out;
    }

    synchronized List<Object> contributions() {
        List<Object> out = new ArrayList<>();
        for (Loaded l : plugins.values()) if (l.runtime != null) out.add(l.runtime.contributions());
        return out;
    }

    void dispatch(String name, Map<String, Object> data) {
        List<PluginRuntime> targets = new ArrayList<>();
        String only = data.get("plugin") instanceof String s ? s : null;
        synchronized (this) {
            for (Loaded l : plugins.values()) {
                if (l.runtime == null) continue;
                if (only != null && (name.equals("button.click") || name.equals("view.action")) && !only.equals(l.manifest.id())) continue;
                targets.add(l.runtime);
            }
        }
        for (PluginRuntime r : targets) r.dispatch(name, data);
    }

    synchronized void shutdown() {
        for (Loaded l : plugins.values()) deactivate(l);
    }
}
