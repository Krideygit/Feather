package feather;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class Api {
    interface Handler {
        Object handle(Map<String, Object> p) throws Exception;
    }

    private static final Pattern DB_NAME = Pattern.compile("^[A-Za-z0-9_$-]{1,64}$");
    private static final Set<String> SYSTEM_DBS = Set.of("information_schema", "mysql", "performance_schema", "sys");

    private final ServiceManager manager;
    private final Map<String, Handler> handlers = new HashMap<>();

    Api(ServiceManager manager, Profiles profiles) {
        this.manager = manager;

        on("app.info", p -> Json.obj(
                "home", Home.root().toString(),
                "os", System.getProperty("os.name"),
                "java", System.getProperty("java.version"),
                "windows", Home.isWindows()));

        on("catalog.versions", p -> {
            String type = str(p, "type");
            List<Object> out = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            boolean online = true;
            try {
                for (Catalog.Version v : Catalog.versions(type)) {
                    seen.add(v.id());
                    out.add(Json.obj("id", v.id(), "channel", v.channel(), "installed", Runtimes.isInstalled(type, v.id())));
                }
            } catch (Exception e) {
                online = false;
            }
            for (Map<String, Object> r : Runtimes.installed()) {
                if (r.get("type").equals(type) && seen.add((String) r.get("version"))) {
                    out.add(Json.obj("id", r.get("version"), "channel", "", "installed", true));
                }
            }
            return Json.obj("versions", out, "online", online);
        });

        on("runtime.list", p -> Runtimes.installed());
        on("runtime.install", p -> {
            Runtimes.install(str(p, "type"), str(p, "version"));
            return Json.obj("ok", true);
        });
        on("runtime.remove", p -> {
            String type = str(p, "type"), version = str(p, "version");
            for (Map<String, Object> s : manager.list()) {
                if (s.get("type").equals(type) && s.get("version").equals(version)) {
                    throw new IllegalStateException("Die Version wird noch von \"" + s.get("name") + "\" verwendet.");
                }
            }
            Runtimes.remove(type, version);
            return Json.obj("ok", true);
        });

        on("port.suggest", p -> Json.obj("port", (long) manager.suggestPort(ServiceManager.validPort(p.get("preferred")))));

        on("service.list", p -> manager.list());
        on("service.create", p -> manager.create(p));
        on("service.update", p -> manager.update(p));
        on("service.delete", p -> {
            manager.delete(str(p, "id"));
            return Json.obj("ok", true);
        });
        on("service.start", p -> manager.startAsync(str(p, "id")));
        on("service.stop", p -> manager.stop(str(p, "id")));
        on("service.restart", p -> manager.restart(str(p, "id")));
        on("service.logs", p -> manager.logs(str(p, "id"), p.get("lines") instanceof Number n ? n.intValue() : 500));
        on("service.command", p -> {
            manager.sendCommand(str(p, "id"), str(p, "line"));
            return Json.obj("ok", true);
        });
        on("service.clearLogs", p -> {
            manager.clearLogs(str(p, "id"));
            return Json.obj("ok", true);
        });

        on("db.list", p -> {
            Service s = runningDatabase(str(p, "id"));
            List<String[]> rows = Drivers.sql(s, Runtimes.base(s.type, s.version),
                    "SELECT s.schema_name, COALESCE(ROUND(SUM(t.data_length + t.index_length) / 1024, 0), 0), COUNT(t.table_name) "
                            + "FROM information_schema.schemata s LEFT JOIN information_schema.tables t ON t.table_schema = s.schema_name "
                            + "GROUP BY s.schema_name ORDER BY s.schema_name");
            List<Object> out = new ArrayList<>();
            for (String[] r : rows) {
                out.add(Json.obj("name", r[0], "sizeKb", Long.parseLong(r[1]), "tables", Long.parseLong(r[2]),
                        "system", SYSTEM_DBS.contains(r[0])));
            }
            return out;
        });
        on("db.create", p -> {
            Service s = runningDatabase(str(p, "id"));
            String name = dbName(str(p, "name"));
            Drivers.sql(s, Runtimes.base(s.type, s.version), "CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4");
            return Json.obj("ok", true);
        });
        on("db.drop", p -> {
            Service s = runningDatabase(str(p, "id"));
            String name = dbName(str(p, "name"));
            if (SYSTEM_DBS.contains(name)) throw new IllegalArgumentException("Systemdatenbanken können nicht gelöscht werden.");
            Drivers.sql(s, Runtimes.base(s.type, s.version), "DROP DATABASE `" + name + "`");
            return Json.obj("ok", true);
        });

        on("db.query", p -> Sql.run(runningDatabase(str(p, "id")), p.get("database") == null ? null : String.valueOf(p.get("database")), str(p, "sql")));
        on("db.schema", p -> Sql.schema(runningDatabase(str(p, "id")), str(p, "database")));
        on("db.users", p -> Sql.users(runningDatabase(str(p, "id"))));
        on("db.userGrants", p -> Sql.grants(runningDatabase(str(p, "id")), str(p, "user"), str(p, "host")));
        on("db.userCreate", p -> {
            Sql.createUser(runningDatabase(str(p, "id")), str(p, "user"), String.valueOf(p.getOrDefault("host", "localhost")),
                    p.get("password") == null ? "" : String.valueOf(p.get("password")),
                    p.get("database") == null ? null : String.valueOf(p.get("database")));
            return Json.obj("ok", true);
        });
        on("db.userPassword", p -> {
            Sql.setPassword(manager, runningDatabase(str(p, "id")), str(p, "user"), str(p, "host"),
                    p.get("password") == null ? "" : String.valueOf(p.get("password")));
            return manager.view(str(p, "id"));
        });
        on("db.userRename", p -> {
            Sql.renameUser(runningDatabase(str(p, "id")), str(p, "user"), str(p, "host"), str(p, "newName"));
            return Json.obj("ok", true);
        });
        on("db.userDrop", p -> {
            Sql.dropUser(runningDatabase(str(p, "id")), str(p, "user"), str(p, "host"));
            return Json.obj("ok", true);
        });
        on("db.export", p -> {
            Service s = runningDatabase(str(p, "id"));
            List<String> dbs = new ArrayList<>();
            if (p.get("databases") instanceof List<?> l) for (Object o : l) dbs.add(String.valueOf(o));
            return Sql.export(s, Runtimes.base(s.type, s.version), dbs, Boolean.TRUE.equals(p.get("perTable")), java.nio.file.Path.of(str(p, "file")));
        });

        on("profile.list", p -> Json.obj("profiles", profiles.views(), "active", profiles.active()));
        on("profile.create", p -> profiles.create(str(p, "name"), p.get("avatar") == null ? null : String.valueOf(p.get("avatar"))));
        on("profile.update", p -> profiles.update(str(p, "id"),
                p.containsKey("name") ? str(p, "name") : null,
                p.get("avatar") == null ? null : String.valueOf(p.get("avatar"))));
        on("profile.delete", p -> {
            profiles.delete(str(p, "id"));
            return Json.obj("ok", true);
        });
        on("profile.switch", p -> {
            String id = str(p, "id");
            if (!id.equals(profiles.active())) {
                manager.stopAll();
                profiles.switchTo(id);
                manager.switchProfile();
                Events.emit("profile.changed", Json.obj("active", id));
                manager.autoStart();
            }
            return Json.obj("active", profiles.active());
        });
        on("profile.export", p -> {
            String id = str(p, "id");
            boolean data = !Boolean.FALSE.equals(p.get("includeData"));
            List<String> wasRunning = id.equals(profiles.active()) && data ? manager.stopRunning() : List.of();
            try {
                return profiles.export(id, java.nio.file.Path.of(str(p, "file")), data);
            } finally {
                manager.startAll(wasRunning);
            }
        });
        on("profile.import", p -> profiles.importFile(java.nio.file.Path.of(str(p, "file"))));
    }

    Object call(String method, Map<String, Object> params) throws Exception {
        Handler h = handlers.get(method);
        if (h == null) throw new IllegalArgumentException("Unbekannte Methode: " + method);
        return h.handle(params);
    }

    private void on(String name, Handler h) {
        handlers.put(name, h);
    }

    private Service runningDatabase(String id) {
        Service s = manager.get(id);
        if (!s.type.equals("mariadb")) throw new IllegalArgumentException("Kein Datenbank-Service.");
        if (!s.status.equals("running")) throw new IllegalStateException("Starte die Datenbank, um sie zu verwalten.");
        return s;
    }

    private static String dbName(String n) {
        if (!DB_NAME.matcher(n).matches()) {
            throw new IllegalArgumentException("Erlaubt sind Buchstaben, Zahlen, _ , $ und - (max. 64 Zeichen).");
        }
        return n;
    }

    private static String str(Map<String, Object> p, String key) {
        Object v = p.get(key);
        if (v == null || String.valueOf(v).isBlank()) throw new IllegalArgumentException("Pflichtfeld fehlt: " + key);
        return String.valueOf(v).trim();
    }
}
