package feather;

import feather.api.Block;
import feather.api.ButtonSpec;
import feather.api.Event;
import feather.api.EventManager;
import feather.api.PluginAPIManager;
import feather.api.PluginInfo;
import feather.api.StorageManager;
import feather.api.TerminalManager;
import feather.api.UiManager;
import feather.api.ViewSpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.logging.Logger;

final class PluginRuntime implements PluginAPIManager {
    private static final int MAX_CSS = 200_000;

    private record ViewState(ViewSpec spec, List<Map<String, Object>> blocks) {}

    private final PluginInfo info;
    private final Logger logger;
    private final Path dataFile;
    private final Map<String, ButtonSpec> buttons = new LinkedHashMap<>();
    private final Map<String, String> styles = new LinkedHashMap<>();
    private final Map<String, ViewState> views = new LinkedHashMap<>();
    private final Map<String, List<Consumer<Event>>> handlers = new HashMap<>();
    private final Map<String, Map<String, Object>> sessions = new ConcurrentHashMap<>();
    private Map<String, Object> data;

    PluginRuntime(PluginInfo info, Path dataFile) {
        this.info = info;
        this.logger = Logger.getLogger("feather.plugin." + info.id());
        this.dataFile = dataFile;
    }

    @Override
    public PluginInfo info() {
        return info;
    }

    @Override
    public Logger logger() {
        return logger;
    }

    private void changed() {
        Events.emit("plugin.changed", Json.obj("plugin", info.id()));
    }

    private void action(String name, Map<String, Object> payload) {
        Map<String, Object> message = new LinkedHashMap<>(payload);
        message.put("plugin", info.id());
        message.put("action", name);
        Events.emit("plugin.action", message);
    }

    private static String need(String value, String what) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(what + " fehlt.");
        return value;
    }

    private final UiManager ui = new UiManager() {
        @Override
        public void addButton(ButtonSpec button) {
            synchronized (PluginRuntime.this) {
                buttons.put(need(button.id(), "Die Button-ID"), button);
            }
            changed();
        }

        @Override
        public void removeButton(String id) {
            synchronized (PluginRuntime.this) {
                buttons.remove(id);
            }
            changed();
        }

        @Override
        public void injectCss(String id, String css) {
            if (css != null && css.length() > MAX_CSS) throw new IllegalArgumentException("Das Stylesheet ist zu groß.");
            synchronized (PluginRuntime.this) {
                styles.put(need(id, "Die CSS-ID"), css == null ? "" : css);
            }
            changed();
        }

        @Override
        public void removeCss(String id) {
            synchronized (PluginRuntime.this) {
                styles.remove(id);
            }
            changed();
        }

        @Override
        public void toast(String message, String kind) {
            action("toast", Json.obj("message", message == null ? "" : message, "kind", kind == null ? "info" : kind));
        }
    };

    private final TerminalManager terminal = new TerminalManager() {
        @Override
        public void addView(ViewSpec view) {
            synchronized (PluginRuntime.this) {
                ViewState previous = views.get(view.id());
                views.put(need(view.id(), "Die View-ID"), new ViewState(view, previous == null ? new ArrayList<>() : previous.blocks()));
            }
            changed();
        }

        @Override
        public void setViewContent(String viewId, List<Block> blocks) {
            synchronized (PluginRuntime.this) {
                ViewState state = views.get(viewId);
                if (state == null) throw new IllegalArgumentException("Unbekannte View: " + viewId);
                List<Map<String, Object>> out = new ArrayList<>();
                for (Block b : blocks) out.add(b.toMap());
                views.put(viewId, new ViewState(state.spec(), out));
            }
            changed();
        }

        @Override
        public void removeView(String viewId) {
            synchronized (PluginRuntime.this) {
                views.remove(viewId);
            }
            changed();
        }

        @Override
        public void print(String sessionId, String text) {
            action("terminal.print", Json.obj("session", sessionId == null ? "" : sessionId, "text", text == null ? "" : text));
        }

        @Override
        public void send(String sessionId, String text) {
            action("terminal.send", Json.obj("session", sessionId == null ? "" : sessionId, "text", text == null ? "" : text));
        }

        @Override
        public List<Map<String, Object>> sessions() {
            return new ArrayList<>(sessions.values());
        }
    };

    private final EventManager events = (name, handler) -> {
        synchronized (PluginRuntime.this) {
            handlers.computeIfAbsent(name, k -> new CopyOnWriteArrayList<>()).add(handler);
        }
    };

    private final StorageManager storage = new StorageManager() {
        @Override
        public synchronized String get(String key, String fallback) {
            Object v = load().get(key);
            return v == null ? fallback : String.valueOf(v);
        }

        @Override
        public synchronized void put(String key, String value) {
            load().put(key, value);
            save();
        }

        @Override
        public synchronized void remove(String key) {
            load().remove(key);
            save();
        }
    };

    @Override
    public UiManager ui() {
        return ui;
    }

    @Override
    public TerminalManager terminal() {
        return terminal;
    }

    @Override
    public EventManager events() {
        return events;
    }

    @Override
    public StorageManager storage() {
        return storage;
    }

    private Map<String, Object> load() {
        if (data != null) return data;
        data = new LinkedHashMap<>();
        try {
            if (Files.exists(dataFile)) data.putAll(Json.parseObject(Files.readString(dataFile, StandardCharsets.UTF_8)));
        } catch (IOException | RuntimeException e) {
            logger.warning("Plugin-Daten konnten nicht gelesen werden: " + e.getMessage());
        }
        return data;
    }

    private void save() {
        try {
            Files.createDirectories(dataFile.getParent());
            Files.writeString(dataFile, Json.stringify(data), StandardCharsets.UTF_8);
        } catch (IOException e) {
            logger.warning("Plugin-Daten konnten nicht gespeichert werden: " + e.getMessage());
        }
    }

    synchronized Map<String, Object> contributions() {
        List<Object> buttonList = new ArrayList<>();
        for (ButtonSpec b : buttons.values()) {
            buttonList.add(Json.obj("id", b.id(), "label", b.label(), "icon", b.icon(), "tooltip", b.tooltip(), "location", b.location()));
        }
        List<Object> cssList = new ArrayList<>();
        for (Map.Entry<String, String> e : styles.entrySet()) cssList.add(Json.obj("id", e.getKey(), "css", e.getValue()));
        List<Object> viewList = new ArrayList<>();
        for (ViewState v : views.values()) {
            viewList.add(Json.obj("id", v.spec().id(), "title", v.spec().title(), "icon", v.spec().icon(), "blocks", new ArrayList<Object>(v.blocks())));
        }
        return Json.obj("plugin", info.id(), "name", info.name(), "buttons", buttonList, "css", cssList, "views", viewList);
    }

    void dispatch(String name, Map<String, Object> payload) {
        Event event = new Event(name, payload);
        if (name.startsWith("session.")) {
            String sid = String.valueOf(payload.getOrDefault("sid", ""));
            if (name.equals("session.closed")) sessions.remove(sid);
            else sessions.put(sid, new LinkedHashMap<>(payload));
        }
        List<Consumer<Event>> targets = new ArrayList<>();
        synchronized (this) {
            if (name.equals("button.click")) {
                ButtonSpec button = buttons.get(String.valueOf(payload.get("id")));
                if (button != null) targets.add(button.onClick());
            } else if (name.equals("view.action")) {
                ViewState view = views.get(String.valueOf(payload.get("view")));
                if (view != null) targets.add(view.spec().onAction());
            }
            List<Consumer<Event>> generic = handlers.get(name);
            if (generic != null) targets.addAll(generic);
        }
        for (Consumer<Event> target : targets) {
            try {
                target.accept(event);
            } catch (Throwable t) {
                logger.warning("Fehler im Plugin-Handler für " + name + ": " + t);
                action("toast", Json.obj("message", "Plugin „" + info.name() + "“: " + (t.getMessage() == null ? t.toString() : t.getMessage()), "kind", "error"));
            }
        }
    }

    synchronized void clear() {
        buttons.clear();
        styles.clear();
        views.clear();
        handlers.clear();
        sessions.clear();
    }
}
