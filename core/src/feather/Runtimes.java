package feather;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public final class Runtimes {
    private static final Map<String, String> MARKER_EXE = Map.of(
            "mariadb", "bin/mariadbd.exe",
            "nginx", "nginx.exe",
            "apache", "bin/httpd.exe",
            "minecraft", "server.jar",
            "paper", "server.jar",
            "fivem", "FXServer.exe",
            "mailpit", "mailpit.exe");

    private static final String JAVA_MARKER = "java-version.txt";

    private static final Set<String> INSTALLING = ConcurrentHashMap.newKeySet();

    private Runtimes() {}

    public static boolean knownType(String type) {
        return MARKER_EXE.containsKey(type);
    }

    public static Path dir(String type, String version) {
        return Home.runtimes().resolve(type).resolve(version);
    }

    public static boolean isInstalled(String type, String version) {
        return base(type, version) != null;
    }

    public static Path base(String type, String version) {
        Path root = dir(type, version);
        if (!Files.isDirectory(root)) return null;
        String marker = MARKER_EXE.get(type);
        if (marker == null) return null;
        if (Files.exists(root.resolve(marker))) return root;
        try (Stream<Path> children = Files.list(root)) {
            for (Path child : (Iterable<Path>) children::iterator) {
                if (Files.isDirectory(child) && Files.exists(child.resolve(marker))) return child;
            }
        } catch (IOException ignored) {
        }
        return null;
    }

    public static List<Map<String, Object>> installed() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String type : MARKER_EXE.keySet()) {
            Path typeDir = Home.runtimes().resolve(type);
            if (!Files.isDirectory(typeDir)) continue;
            try (Stream<Path> versions = Files.list(typeDir)) {
                for (Path v : (Iterable<Path>) versions::iterator) {
                    String name = v.getFileName().toString();
                    if (name.endsWith(".partial") || !isInstalled(type, name)) continue;
                    out.add(Json.obj("type", type, "version", name, "size", Home.sizeOf(v)));
                }
            } catch (IOException ignored) {
            }
        }
        return out;
    }

    public static int javaRequirement(String type, String version) {
        Path base = base(type, version);
        if (base == null) return 0;
        try {
            return Integer.parseInt(Files.readString(base.resolve(JAVA_MARKER)).trim());
        } catch (IOException | NumberFormatException e) {
            return 0;
        }
    }

    public static void fetchArchive(String url, Path dest, boolean stripTop) throws Exception {
        Path file = Home.downloads().resolve("archive-" + Integer.toHexString(url.hashCode()) + ".download");
        Files.createDirectories(file.getParent());
        Path partial = dest.resolveSibling(dest.getFileName() + ".partial");
        try {
            Catalog.Version v = new Catalog.Version("archive", "", url, null, null, null, "zip");
            download(null, null, v, file);
            Home.deleteRecursively(partial);
            Files.createDirectories(partial);
            unzip(null, null, file, partial, stripTop);
            Home.deleteRecursively(dest);
            Files.move(partial, dest, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Home.deleteRecursively(partial);
            Files.deleteIfExists(file);
        }
    }

    public static void remove(String type, String version) throws IOException {
        Home.deleteRecursively(dir(type, version));
    }

    public static void cleanupPartials() {
        for (String type : MARKER_EXE.keySet()) {
            Path typeDir = Home.runtimes().resolve(type);
            if (!Files.isDirectory(typeDir)) continue;
            try (Stream<Path> list = Files.list(typeDir)) {
                for (Path p : (Iterable<Path>) list::iterator) {
                    if (p.getFileName().toString().endsWith(".partial")) Home.deleteRecursively(p);
                }
            } catch (IOException ignored) {
            }
        }
    }

    public static void install(String type, String version) throws Exception {
        if (!Home.isWindows()) {
            throw new IllegalStateException("Runtime-Downloads sind aktuell nur unter Windows verfügbar.");
        }
        if (!knownType(type)) throw new IllegalArgumentException("Unbekannter Typ: " + type);
        if (isInstalled(type, version)) return;
        String key = type + "@" + version;
        if (!INSTALLING.add(key)) throw new IllegalStateException(type + " " + version + " wird bereits installiert.");

        Path file = Home.downloads().resolve(type + "-" + version + ".download");
        Path partial = Home.runtimes().resolve(type).resolve(version + ".partial");
        try {
            Catalog.Resolved resolved = Catalog.resolve(Catalog.find(type, version));
            Catalog.Version v = resolved.version();
            Files.createDirectories(file.getParent());
            download(type, version, v, file);
            if (v.checksum() != null) {
                progress(type, version, "verify", 100, 0, 0);
                verify(file, v.checksum(), v.algo());
            }
            Home.deleteRecursively(partial);
            Files.createDirectories(partial);
            if (v.kind().equals("jar")) {
                Files.copy(file, partial.resolve("server.jar"));
                Files.writeString(partial.resolve(JAVA_MARKER), String.valueOf(resolved.java()));
            } else {
                unzip(type, version, file, partial, false);
            }
            Path target = dir(type, version);
            Home.deleteRecursively(target);
            Files.move(partial, target, StandardCopyOption.ATOMIC_MOVE);
            if (base(type, version) == null) {
                Home.deleteRecursively(target);
                throw new IOException("Das heruntergeladene Archiv hat nicht die erwartete Struktur.");
            }
            progress(type, version, "done", 100, 0, 0);
        } catch (Exception e) {
            Home.deleteRecursively(partial);
            progress(type, version, "error", 0, 0, 0);
            throw e;
        } finally {
            Files.deleteIfExists(file);
            INSTALLING.remove(key);
        }
    }

    private static void download(String type, String version, Catalog.Version v, Path target) throws Exception {
        HttpRequest.Builder rb = HttpRequest.newBuilder(URI.create(v.url()))
                .timeout(Duration.ofMinutes(30))
                .header("User-Agent", Catalog.USER_AGENT);
        if (v.referer() != null) rb.header("Referer", v.referer());
        HttpResponse<InputStream> res = Catalog.HTTP.send(rb.build(), HttpResponse.BodyHandlers.ofInputStream());
        if (res.statusCode() != 200) throw new IOException("Download fehlgeschlagen (HTTP " + res.statusCode() + ")");
        String contentType = res.headers().firstValue("Content-Type").orElse("");
        if (contentType.startsWith("text/")) throw new IOException("Die Quelle hat keine Datei geliefert.");
        long total = res.headers().firstValueAsLong("Content-Length").orElse(-1);
        long read = 0;
        long lastEmit = 0;
        try (InputStream in = res.body(); OutputStream out = Files.newOutputStream(target)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                read += n;
                long now = System.currentTimeMillis();
                if (type != null && now - lastEmit > 150) {
                    lastEmit = now;
                    progress(type, version, "download", total > 0 ? (int) (read * 100 / total) : -1, read, total);
                }
            }
        }
        if (type != null) progress(type, version, "download", 100, read, total);
    }

    private static void verify(Path file, String expectedHex, String algorithm) throws Exception {
        MessageDigest md = MessageDigest.getInstance(algorithm);
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format("%02x", b));
        if (!hex.toString().equalsIgnoreCase(expectedHex)) {
            throw new IOException("Prüfsumme stimmt nicht überein - Download ist beschädigt.");
        }
    }

    private static void unzip(String type, String version, Path zip, Path dest, boolean stripTop) throws IOException {
        Path root = dest.toAbsolutePath().normalize();
        long totalBytes = Files.size(zip);
        long lastEmit = 0;
        long entries = 0;
        try (ZipInputStream zin = new ZipInputStream(Files.newInputStream(zip))) {
            ZipEntry e;
            byte[] buf = new byte[64 * 1024];
            while ((e = zin.getNextEntry()) != null) {
                String name = e.getName();
                if (stripTop) {
                    int slash = name.indexOf('/');
                    if (slash < 0) continue;
                    name = name.substring(slash + 1);
                    if (name.isEmpty()) continue;
                }
                Path out = root.resolve(name).normalize();
                if (!out.startsWith(root)) throw new IOException("Ungültiger Pfad im Archiv: " + e.getName());
                if (e.isDirectory()) {
                    Files.createDirectories(out);
                    continue;
                }
                Files.createDirectories(out.getParent());
                try (OutputStream os = Files.newOutputStream(out)) {
                    int n;
                    while ((n = zin.read(buf)) > 0) os.write(buf, 0, n);
                }
                entries++;
                long now = System.currentTimeMillis();
                if (type != null && now - lastEmit > 150) {
                    lastEmit = now;
                    progress(type, version, "extract", -1, entries, totalBytes);
                }
            }
        }
    }

    private static void progress(String type, String version, String phase, int percent, long bytes, long total) {
        Events.emit("runtime.progress", Json.obj(
                "type", type, "version", version, "phase", phase,
                "percent", percent, "bytes", bytes, "total", total));
    }
}
