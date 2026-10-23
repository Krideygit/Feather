package feather;

import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.net.URLClassLoader;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.Driver;
import java.time.Duration;
import java.util.Properties;

final class Jdbc {
    static final String VERSION = "3.5.11";
    private static final String BASE = "https://repo1.maven.org/maven2/org/mariadb/jdbc/mariadb-java-client/" + VERSION + "/";
    private static final String JAR = "mariadb-java-client-" + VERSION + ".jar";

    private static Driver driver;

    private Jdbc() {}

    private static synchronized Driver driver() throws Exception {
        if (driver != null) return driver;
        Path jar = Home.lib().resolve(JAR);
        if (!Files.exists(jar)) download(jar);
        URLClassLoader loader = new URLClassLoader(new URL[] {jar.toUri().toURL()}, Jdbc.class.getClassLoader());
        driver = (Driver) loader.loadClass("org.mariadb.jdbc.Driver").getDeclaredConstructor().newInstance();
        return driver;
    }

    private static void download(Path target) throws Exception {
        try {
            Files.createDirectories(target.getParent());
            byte[] jar = fetch(BASE + JAR);
            String expected = new String(fetch(BASE + JAR + ".sha1")).trim().split("\\s+")[0];
            StringBuilder hex = new StringBuilder();
            for (byte b : MessageDigest.getInstance("SHA-1").digest(jar)) hex.append(String.format("%02x", b));
            if (!hex.toString().equalsIgnoreCase(expected)) throw new IOException("Prüfsumme des Datenbanktreibers stimmt nicht.");
            Path tmp = target.resolveSibling(JAR + ".part");
            Files.write(tmp, jar);
            Files.move(tmp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IOException("Der Datenbanktreiber konnte nicht geladen werden (offline?): " + e.getMessage(), e);
        }
    }

    private static byte[] fetch(String url) throws IOException, InterruptedException {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(60)).build();
        HttpResponse<byte[]> res = Catalog.HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
        if (res.statusCode() != 200) throw new IOException("HTTP " + res.statusCode() + " für " + url);
        return res.body();
    }

    record Conn(String host, int port, String user, String password) {}

    static Conn conn(Service s) {
        return new Conn("127.0.0.1", s.port, "root", s.password == null ? "" : s.password);
    }

    static Connection connect(Service s, String database) throws Exception {
        return connect(conn(s), database);
    }

    static Connection connect(Conn conn, String database) throws Exception {
        Properties props = new Properties();
        props.setProperty("user", conn.user());
        props.setProperty("password", conn.password() == null ? "" : conn.password());
        String host = conn.host().contains(":") ? "[" + conn.host() + "]" : conn.host();
        Connection c = driver().connect("jdbc:mariadb://" + host + ":" + conn.port() + "/?connectTimeout=5000", props);
        if (c == null) throw new IOException("Verbindung zur Datenbank nicht möglich.");
        if (database != null && !database.isEmpty()) c.setCatalog(database);
        return c;
    }

    static String lit(String v) {
        return "'" + v.replace("\\", "\\\\").replace("'", "\\'").replace("\0", "") + "'";
    }

    static String ident(String v) {
        return "`" + v.replace("`", "``") + "`";
    }
}
