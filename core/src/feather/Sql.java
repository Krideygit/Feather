package feather;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class Sql {
    static final Set<String> SYSTEM_DBS = Set.of("information_schema", "mysql", "performance_schema", "sys");
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "::1");
    private static final int MAX_ROWS = 1000;
    private static final int MAX_CELL = 2000;
    private static final Pattern USER_NAME = Pattern.compile("^[A-Za-z0-9_.@$-]{1,32}$");
    private static final Pattern HOST = Pattern.compile("^[A-Za-z0-9_.%:-]{1,60}$");

    private Sql() {}

    static Map<String, Object> run(Service s, String database, String script) throws Exception {
        return run(Jdbc.conn(s), database, script);
    }

    static Map<String, Object> run(Jdbc.Conn conn, String database, String script) throws Exception {
        List<String> statements = SqlSplitter.split(script);
        if (statements.isEmpty()) throw new IllegalArgumentException("Es gibt nichts auszuführen.");
        List<Object> results = new ArrayList<>();
        Object error = null;
        try (Connection c = Jdbc.connect(conn, database)) {
            for (int i = 0; i < statements.size() && error == null; i++) {
                String sql = statements.get(i);
                long start = System.nanoTime();
                try (Statement st = c.createStatement()) {
                    st.setQueryTimeout(120);
                    st.setMaxRows(MAX_ROWS + 1);
                    boolean isResultSet = st.execute(sql);
                    boolean produced = false;
                    while (true) {
                        long ms = (System.nanoTime() - start) / 1_000_000;
                        if (isResultSet) {
                            try (ResultSet rs = st.getResultSet()) {
                                results.add(rows(sql, rs, ms));
                            }
                            produced = true;
                        } else {
                            long updates = st.getLargeUpdateCount();
                            if (updates == -1) break;
                            results.add(Json.obj("type", "ok", "sql", sql, "affected", updates, "ms", ms));
                            produced = true;
                        }
                        isResultSet = st.getMoreResults();
                    }
                    if (!produced) {
                        results.add(Json.obj("type", "ok", "sql", sql, "affected", 0L, "ms", (System.nanoTime() - start) / 1_000_000));
                    }
                } catch (SQLException e) {
                    error = Json.obj("sql", sql, "message", clean(e.getMessage()), "code", (long) e.getErrorCode());
                }
            }
        }
        return Json.obj("results", results, "error", error);
    }

    private static Map<String, Object> rows(String sql, ResultSet rs, long ms) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int cols = md.getColumnCount();
        List<Object> names = new ArrayList<>();
        boolean[] binary = new boolean[cols];
        for (int i = 1; i <= cols; i++) {
            names.add(md.getColumnLabel(i));
            int t = md.getColumnType(i);
            binary[i - 1] = t == Types.BINARY || t == Types.VARBINARY || t == Types.LONGVARBINARY || t == Types.BLOB;
        }
        List<Object> rows = new ArrayList<>();
        boolean truncated = false;
        while (rs.next()) {
            if (rows.size() >= MAX_ROWS) {
                truncated = true;
                break;
            }
            List<Object> row = new ArrayList<>(cols);
            for (int i = 1; i <= cols; i++) {
                if (binary[i - 1]) {
                    byte[] b = rs.getBytes(i);
                    row.add(b == null ? null : "<BINARY " + b.length + " B>");
                } else {
                    String v = rs.getString(i);
                    row.add(v != null && v.length() > MAX_CELL ? v.substring(0, MAX_CELL) + "…" : v);
                }
            }
            rows.add(row);
        }
        return Json.obj("type", "rows", "sql", sql, "columns", names, "rows", rows, "truncated", truncated, "ms", ms);
    }

    static List<Object> schema(Service s, String database) throws Exception {
        return schema(Jdbc.conn(s), database);
    }

    static List<Object> schema(Jdbc.Conn conn, String database) throws Exception {
        String query = "SELECT t.table_name, t.table_type, c.column_name, c.column_type, c.column_key "
                + "FROM information_schema.tables t LEFT JOIN information_schema.columns c "
                + "ON c.table_schema = t.table_schema AND c.table_name = t.table_name "
                + "WHERE t.table_schema = ? ORDER BY t.table_name, c.ordinal_position";
        Map<String, Map<String, Object>> tables = new java.util.LinkedHashMap<>();
        try (Connection c = Jdbc.connect(conn, null); java.sql.PreparedStatement ps = c.prepareStatement(query)) {
            ps.setString(1, database);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> table = tables.computeIfAbsent(rs.getString(1), name -> Json.obj(
                            "name", name, "view", false, "columns", new ArrayList<Object>()));
                    table.put("view", "VIEW".equals(rs.getString(2)) || "SYSTEM VIEW".equals(rs.getString(2)));
                    if (rs.getString(3) != null) {
                        @SuppressWarnings("unchecked")
                        List<Object> columns = (List<Object>) table.get("columns");
                        columns.add(Json.obj("name", rs.getString(3), "type", rs.getString(4), "key", rs.getString(5)));
                    }
                }
            }
        }
        return new ArrayList<>(tables.values());
    }

    static List<Object> users(Service s) throws Exception {
        List<Object> out = new ArrayList<>();
        try (Connection c = Jdbc.connect(s, null); Statement st = c.createStatement();
                ResultSet rs = st.executeQuery("SELECT User, Host FROM mysql.user WHERE Host <> '' ORDER BY User = '', User, Host")) {
            while (rs.next()) {
                out.add(Json.obj("user", rs.getString(1), "host", rs.getString(2), "root", rs.getString(1).equals("root"),
                        "system", isProtected(rs.getString(1))));
            }
        }
        return out;
    }

    static List<Object> grants(Service s, String user, String host) throws Exception {
        List<Object> out = new ArrayList<>();
        try (Connection c = Jdbc.connect(s, null); Statement st = c.createStatement();
                ResultSet rs = st.executeQuery("SHOW GRANTS FOR " + account(user, host))) {
            while (rs.next()) out.add(rs.getString(1).replaceAll(" IDENTIFIED BY PASSWORD '[^']*'", ""));
        }
        return out;
    }

    static String clean(String message) {
        return message == null ? "" : message.replaceFirst("^\\(conn=\\d+\\) ", "");
    }

    static void createUser(Service s, String user, String host, String password, String database) throws Exception {
        String h = host == null || host.isBlank() ? "localhost" : host.trim();
        validate(user, h);
        if (user.isEmpty()) throw new IllegalArgumentException("Bitte gib einen Benutzernamen an.");
        try (Connection c = Jdbc.connect(s, null); Statement st = c.createStatement()) {
            st.execute("CREATE USER " + account(user, h) + " IDENTIFIED BY " + Jdbc.lit(password == null ? "" : password));
            if (database != null && !database.isBlank()) {
                String target = database.equals("*") ? "*.*" : Jdbc.ident(database) + ".*";
                st.execute("GRANT ALL PRIVILEGES ON " + target + " TO " + account(user, h));
            }
        }
    }

    static void setPassword(ServiceManager manager, Service s, String user, String host, String password) throws Exception {
        validate(user, host);
        String pw = password == null ? "" : password;
        try (Connection c = Jdbc.connect(s, null); Statement st = c.createStatement()) {
            if (user.equals("root")) {
                List<String> hosts = new ArrayList<>();
                try (ResultSet rs = st.executeQuery("SELECT Host FROM mysql.user WHERE User = 'root'")) {
                    while (rs.next()) hosts.add(rs.getString(1));
                }
                for (String h : hosts) {
                    try {
                        st.execute("ALTER USER " + account("root", h) + " IDENTIFIED BY " + Jdbc.lit(pw));
                    } catch (SQLException e) {
                        if (LOOPBACK.contains(h)) throw e;
                    }
                }
            } else {
                st.execute("ALTER USER " + account(user, host) + " IDENTIFIED BY " + Jdbc.lit(pw));
            }
        }
        if (user.equals("root")) manager.setPassword(s, pw);
    }

    static void renameUser(Service s, String user, String host, String newName) throws Exception {
        validate(user, host);
        if (isProtected(user)) throw new IllegalArgumentException("Dieser Systembenutzer kann nicht umbenannt werden (root wird von Feather zur Verwaltung genutzt).");
        if (!USER_NAME.matcher(newName).matches()) throw new IllegalArgumentException("Ungültiger Benutzername.");
        try (Connection c = Jdbc.connect(s, null); Statement st = c.createStatement()) {
            st.execute("RENAME USER " + account(user, host) + " TO " + account(newName, host));
        }
    }

    static void dropUser(Service s, String user, String host) throws Exception {
        validate(user, host);
        if (isProtected(user)) throw new IllegalArgumentException("Dieser Systembenutzer kann nicht gelöscht werden.");
        try (Connection c = Jdbc.connect(s, null); Statement st = c.createStatement()) {
            st.execute("DROP USER " + account(user, host));
        }
    }

    private static boolean isProtected(String user) {
        return user.equals("root") || user.equals("mariadb.sys");
    }

    private static void validate(String user, String host) {
        if (user == null || (!user.isEmpty() && !USER_NAME.matcher(user).matches())) {
            throw new IllegalArgumentException("Erlaubt sind Buchstaben, Zahlen und . _ @ $ - (max. 32 Zeichen).");
        }
        if (host == null || !HOST.matcher(host).matches()) throw new IllegalArgumentException("Ungültiger Host.");
    }

    private static String account(String user, String host) {
        return Jdbc.lit(user) + "@" + Jdbc.lit(host);
    }

    static Map<String, Object> export(Service s, Path base, List<String> databases, boolean perTable, Path file) throws Exception {
        List<String> dbs = new ArrayList<>(databases);
        if (dbs.isEmpty()) {
            try (Connection c = Jdbc.connect(s, null); Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SHOW DATABASES")) {
                while (rs.next()) if (!SYSTEM_DBS.contains(rs.getString(1))) dbs.add(rs.getString(1));
            }
        }
        if (dbs.isEmpty()) throw new IllegalArgumentException("Es gibt keine Datenbank zum Exportieren.");
        for (String d : dbs) if (SYSTEM_DBS.contains(d)) throw new IllegalArgumentException("Systemdatenbanken können nicht exportiert werden.");

        Path parent = file.toAbsolutePath().getParent();
        if (parent != null) Files.createDirectories(parent);
        Path tmp = file.resolveSibling(file.getFileName() + ".part");
        int files = 0;
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(tmp))) {
            for (int i = 0; i < dbs.size(); i++) {
                String db = dbs.get(i);
                Events.emit("db.export.progress", Json.obj("id", s.id, "done", (long) i, "total", (long) dbs.size(), "label", db));
                if (!perTable) {
                    dump(s, base, zip, safe(db) + ".sql", List.of("--databases", db));
                    files++;
                    continue;
                }
                List<String> tables = new ArrayList<>();
                try (Connection c = Jdbc.connect(s, db); Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SHOW TABLES")) {
                    while (rs.next()) tables.add(rs.getString(1));
                }
                for (String t : tables) {
                    dump(s, base, zip, safe(db) + "/" + safe(t) + ".sql", List.of(db, t));
                    files++;
                }
                files += routines(s, base, zip, db) ? 1 : 0;
            }
        } catch (Exception e) {
            Files.deleteIfExists(tmp);
            throw e;
        }
        Files.move(tmp, file, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        Events.emit("db.export.progress", Json.obj("id", s.id, "done", (long) dbs.size(), "total", (long) dbs.size(), "label", ""));
        return Json.obj("file", file.toString(), "databases", (long) dbs.size(), "files", (long) files, "bytes", Files.size(file));
    }

    private static boolean routines(Service s, Path base, ZipOutputStream zip, String db) throws Exception {
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        runDump(s, base, List.of("--no-create-info", "--no-data", "--skip-triggers", "--routines", "--events", db), buf);
        if (!new String(buf.toByteArray(), StandardCharsets.UTF_8).contains("CREATE")) return false;
        zip.putNextEntry(new ZipEntry(safe(db) + "/_routines_events.sql"));
        zip.write(buf.toByteArray());
        zip.closeEntry();
        return true;
    }

    private static void dump(Service s, Path base, ZipOutputStream zip, String entry, List<String> target) throws Exception {
        zip.putNextEntry(new ZipEntry(entry));
        List<String> args = new ArrayList<>();
        if (target.get(0).equals("--databases")) args.addAll(List.of("--routines", "--events"));
        args.addAll(target);
        runDump(s, base, args, zip);
        zip.closeEntry();
    }

    private static void runDump(Service s, Path base, List<String> args, java.io.OutputStream out) throws Exception {
        List<String> cmd = new ArrayList<>(List.of(
                base.resolve("bin/mariadb-dump.exe").toString(),
                "-h", "127.0.0.1", "-P", String.valueOf(s.port), "-u", "root",
                "--single-transaction", "--default-character-set=utf8mb4"));
        cmd.addAll(args);
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.environment().put("MYSQL_PWD", s.password == null ? "" : s.password);
        Process p = pb.start();
        StringBuilder err = new StringBuilder();
        Thread errReader = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) err.append(line).append('\n');
            } catch (IOException ignored) {
            }
        });
        errReader.setDaemon(true);
        errReader.start();
        p.getInputStream().transferTo(out);
        if (!p.waitFor(10, TimeUnit.MINUTES)) {
            p.destroyForcibly();
            throw new IOException("Zeitüberschreitung beim Export.");
        }
        errReader.join(2000);
        if (p.exitValue() != 0) throw new IOException("Export fehlgeschlagen: " + err.toString().trim());
    }

    private static String safe(String name) {
        return name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
    }
}
