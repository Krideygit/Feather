package feather;

import java.nio.file.Path;
import java.util.Map;

public final class Service {
    public String id;
    public String name;
    public String type;
    public String version;
    public int port;
    public String folder;
    public String password;
    public boolean autoStart;
    public boolean spa;
    public boolean autoindex;
    public long createdAt;

    volatile String status = "stopped";
    volatile String error;
    volatile long pid;
    volatile long startedAt;
    transient volatile Process process;
    transient volatile boolean stopRequested;

    public String category() {
        return type.equals("mariadb") ? "database" : "webserver";
    }

    public Path dir() {
        return Home.services().resolve(id);
    }

    public Map<String, Object> toStored() {
        return Json.obj(
                "id", id, "name", name, "type", type, "version", version, "port", (long) port,
                "folder", folder, "password", password, "autoStart", autoStart,
                "spa", spa, "autoindex", autoindex, "createdAt", createdAt);
    }

    public Map<String, Object> toView() {
        Map<String, Object> m = toStored();
        m.put("category", category());
        m.put("dir", dir().toString());
        m.put("status", status);
        m.put("error", error);
        m.put("pid", pid == 0 ? null : pid);
        m.put("startedAt", status.equals("running") ? startedAt : null);
        m.put("connection", Drivers.of(this).connection(this));
        return m;
    }

    @SuppressWarnings("unchecked")
    public static Service fromStored(Map<String, Object> m) {
        Service s = new Service();
        s.id = (String) m.get("id");
        s.name = (String) m.get("name");
        s.type = (String) m.get("type");
        s.version = (String) m.get("version");
        s.port = ((Number) m.get("port")).intValue();
        s.folder = m.get("folder") == null ? "" : (String) m.get("folder");
        if (s.id == null || !s.id.matches("[0-9a-f]{8}")) throw new IllegalArgumentException("Ungültige Service-ID");
        if (s.type == null || !Runtimes.knownType(s.type)) throw new IllegalArgumentException("Unbekannter Typ");
        if (s.version == null || !s.version.matches("[0-9A-Za-z._-]{1,32}")) throw new IllegalArgumentException("Ungültige Version");
        if (s.name == null || s.port < 1 || s.port > 65535) throw new IllegalArgumentException("Ungültige Service-Daten");
        s.password = m.get("password") == null ? "" : (String) m.get("password");
        s.autoStart = Boolean.TRUE.equals(m.get("autoStart"));
        s.spa = Boolean.TRUE.equals(m.get("spa"));
        s.autoindex = Boolean.TRUE.equals(m.get("autoindex"));
        s.createdAt = m.get("createdAt") == null ? System.currentTimeMillis() : ((Number) m.get("createdAt")).longValue();
        return s;
    }
}
