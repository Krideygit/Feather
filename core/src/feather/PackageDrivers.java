package feather;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.regex.Pattern;

final class PackageDrivers {
    private static final List<String> MEMORY = List.of("512M", "1G", "2G", "3G", "4G", "6G", "8G", "12G", "16G");
    private static final Pattern LICENSE_KEY = Pattern.compile("^[A-Za-z0-9_-]{8,80}$");
    private static final Pattern DONE = Pattern.compile("Done \\(.*\\)! For help");
    private static final String SERVER_DATA_URL = "https://github.com/citizenfx/cfx-server-data/archive/refs/heads/master.zip";

    private PackageDrivers() {}

    private static String text(Object value, String fallback, int max) {
        String s = value == null ? fallback : String.valueOf(value);
        s = s.replaceAll("[\\p{Cntrl}\"\\\\]", " ").trim();
        if (s.length() > max) s = s.substring(0, max);
        return s.isEmpty() ? fallback : s;
    }

    private static long number(Object value, long fallback, long min, long max) {
        try {
            long n = value instanceof Number x ? x.longValue() : Long.parseLong(String.valueOf(value).trim());
            return Math.max(min, Math.min(max, n));
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    private static boolean flag(Object value, boolean fallback) {
        if (value == null) return fallback;
        return value instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(value));
    }

    private static String javaExe() {
        return Path.of(System.getProperty("java.home"), "bin", Home.isWindows() ? "java.exe" : "java").toString();
    }

    private static Map<String, Object> merge(Map<String, Object> current, Map<String, Object> input) {
        Map<String, Object> merged = new LinkedHashMap<>(current);
        merged.putAll(input);
        return merged;
    }

    private static void sendLine(Process p, String line) throws IOException {
        OutputStream os = p.getOutputStream();
        os.write((line + "\n").getBytes(StandardCharsets.UTF_8));
        os.flush();
    }

    private static void updateProperties(Path file, Map<String, String> wanted) throws IOException {
        List<String> lines = Files.exists(file) ? new ArrayList<>(Files.readAllLines(file, StandardCharsets.UTF_8)) : new ArrayList<>();
        Map<String, String> pending = new LinkedHashMap<>(wanted);
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            int eq = line.indexOf('=');
            if (eq <= 0 || line.startsWith("#")) continue;
            String key = line.substring(0, eq).trim();
            if (pending.containsKey(key)) {
                lines.set(i, key + "=" + pending.remove(key));
            }
        }
        for (Map.Entry<String, String> e : pending.entrySet()) lines.add(e.getKey() + "=" + e.getValue());
        Files.write(file, lines, StandardCharsets.UTF_8);
    }

    static final Drivers.Driver MINECRAFT = new Drivers.Driver() {
        @Override
        Map<String, Object> options(Map<String, Object> input, Map<String, Object> current, boolean creating) {
            Map<String, Object> m = merge(current, input);
            String memory = String.valueOf(m.getOrDefault("memory", "2G"));
            if (!MEMORY.contains(memory)) throw new IllegalArgumentException("Ungültige Speichergröße.");
            if (!flag(m.get("eula"), false)) {
                throw new IllegalArgumentException("Bitte akzeptiere die Minecraft-EULA, um den Server zu erstellen.");
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("memory", memory);
            out.put("motd", text(m.get("motd"), "Feather Server", 80));
            out.put("maxPlayers", number(m.get("maxPlayers"), 20, 1, 500));
            out.put("onlineMode", flag(m.get("onlineMode"), true));
            out.put("lan", flag(m.get("lan"), false));
            out.put("eula", true);
            return out;
        }

        @Override
        void prepare(Service s, Path base, Consumer<String> log) throws Exception {
            int needed = Runtimes.javaRequirement(s.type, s.version);
            int have = Runtime.version().feature();
            if (needed > have) {
                throw new IllegalStateException("Minecraft " + s.version + " benötigt Java " + needed
                        + ", Feather läuft mit Java " + have + ". Installiere ein neueres JDK.");
            }
            if (!flag(s.options.get("eula"), false)) throw new IllegalStateException("Die Minecraft-EULA wurde nicht akzeptiert.");
            Path dir = s.dir();
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("eula.txt"), "eula=true\n", StandardCharsets.UTF_8);
            Map<String, String> wanted = new LinkedHashMap<>();
            wanted.put("server-port", String.valueOf(s.port));
            wanted.put("server-ip", flag(s.options.get("lan"), false) ? "" : "127.0.0.1");
            wanted.put("motd", text(s.options.get("motd"), "Feather Server", 80));
            wanted.put("max-players", String.valueOf(number(s.options.get("maxPlayers"), 20, 1, 500)));
            wanted.put("online-mode", String.valueOf(flag(s.options.get("onlineMode"), true)));
            updateProperties(dir.resolve("server.properties"), wanted);
        }

        @Override
        List<String> command(Service s, Path base) {
            String memory = String.valueOf(s.options.getOrDefault("memory", "2G"));
            return List.of(javaExe(), "-Xms256M", "-Xmx" + memory, "-jar", base.resolve("server.jar").toString(), "nogui");
        }

        @Override
        Path workDir(Service s, Path base) {
            return s.dir();
        }

        @Override
        void stop(Service s, Path base, Process p) throws Exception {
            sendLine(p, "stop");
            p.waitFor(60, TimeUnit.SECONDS);
        }

        @Override
        Pattern readyLine() {
            return DONE;
        }

        @Override
        boolean supportsCommands() {
            return true;
        }

        @Override
        Map<String, Object> connection(Service s) {
            return Json.obj("host", "localhost", "port", (long) s.port, "url", "localhost:" + s.port);
        }

        @Override
        long startTimeoutMs() {
            return 240_000;
        }
    };

    static final Drivers.Driver MAILPIT = new Drivers.Driver() {
        @Override
        Map<String, Object> options(Map<String, Object> input, Map<String, Object> current, boolean creating) {
            Map<String, Object> m = merge(current, input);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("smtpPort", number(m.get("smtpPort"), 1025, 1, 65535));
            out.put("persist", flag(m.get("persist"), true));
            out.put("maxMessages", number(m.get("maxMessages"), 500, 10, 100000));
            out.put("lan", flag(m.get("lan"), false));
            return out;
        }

        @Override
        void prepare(Service s, Path base, Consumer<String> log) throws Exception {
            Files.createDirectories(s.dir());
            if (number(s.options.get("smtpPort"), 1025, 1, 65535) == s.port) {
                throw new IllegalStateException("Der SMTP-Port muss sich vom Port der Weboberfläche unterscheiden.");
            }
        }

        @Override
        List<String> command(Service s, Path base) {
            String bind = flag(s.options.get("lan"), false) ? "0.0.0.0" : "127.0.0.1";
            List<String> cmd = new ArrayList<>(List.of(
                    base.resolve("mailpit.exe").toString(),
                    "--listen", bind + ":" + s.port,
                    "--smtp", bind + ":" + number(s.options.get("smtpPort"), 1025, 1, 65535),
                    "--max", String.valueOf(number(s.options.get("maxMessages"), 500, 10, 100000))));
            if (flag(s.options.get("persist"), true)) {
                cmd.add("--database");
                cmd.add(s.dir().resolve("mailpit.db").toString());
            }
            return cmd;
        }

        @Override
        Path workDir(Service s, Path base) {
            return s.dir();
        }

        @Override
        Map<String, Object> connection(Service s) {
            long smtp = number(s.options.get("smtpPort"), 1025, 1, 65535);
            return Json.obj("host", "localhost", "port", (long) s.port, "smtp", smtp, "url", "http://localhost:" + s.port);
        }

        @Override
        long startTimeoutMs() {
            return 30_000;
        }
    };

    static final Drivers.Driver FIVEM = new Drivers.Driver() {
        @Override
        Map<String, Object> options(Map<String, Object> input, Map<String, Object> current, boolean creating) {
            Map<String, Object> m = merge(current, input);
            String key = String.valueOf(m.getOrDefault("licenseKey", "")).trim();
            if (!LICENSE_KEY.matcher(key).matches()) {
                throw new IllegalArgumentException("Bitte gib einen gültigen Lizenzschlüssel an (kostenlos auf keymaster.fivem.net).");
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("licenseKey", key);
            out.put("hostname", text(m.get("hostname"), "Feather FiveM Server", 80));
            out.put("maxClients", number(m.get("maxClients"), 32, 1, 2048));
            out.put("lan", flag(m.get("lan"), false));
            return out;
        }

        @Override
        void prepare(Service s, Path base, Consumer<String> log) throws Exception {
            Path data = s.dir().resolve("server-data");
            if (!Files.isDirectory(data.resolve("resources"))) {
                log.accept("Lade Standard-Ressourcen (einmalig) ...");
                Files.createDirectories(s.dir());
                Runtimes.fetchArchive(SERVER_DATA_URL, data, true);
            }
            String bind = flag(s.options.get("lan"), false) ? "0.0.0.0" : "127.0.0.1";
            String hostname = text(s.options.get("hostname"), "Feather FiveM Server", 80);
            String key = String.valueOf(s.options.getOrDefault("licenseKey", ""));
            if (!LICENSE_KEY.matcher(key).matches()) throw new IllegalStateException("Es ist kein gültiger Lizenzschlüssel hinterlegt.");
            String cfg = """
                    endpoint_add_tcp "%1$s:%2$d"
                    endpoint_add_udp "%1$s:%2$d"
                    sv_maxclients %3$d
                    sv_hostname "%4$s"
                    sets sv_projectName "%4$s"
                    sv_licenseKey "%5$s"
                    set onesync on
                    ensure mapmanager
                    ensure chat
                    ensure spawnmanager
                    ensure sessionmanager
                    ensure basic-gamemode
                    ensure hardcap
                    ensure rconlog
                    """.formatted(bind, s.port, number(s.options.get("maxClients"), 32, 1, 2048), hostname, key);
            Files.writeString(data.resolve("server.cfg"), cfg, StandardCharsets.UTF_8);
        }

        @Override
        List<String> command(Service s, Path base) {
            return List.of(base.resolve("FXServer.exe").toString(), "+exec", "server.cfg");
        }

        @Override
        Path workDir(Service s, Path base) {
            return s.dir().resolve("server-data");
        }

        @Override
        void stop(Service s, Path base, Process p) throws Exception {
            sendLine(p, "quit");
            p.waitFor(20, TimeUnit.SECONDS);
        }

        @Override
        boolean supportsCommands() {
            return true;
        }

        @Override
        Map<String, Object> connection(Service s) {
            return Json.obj("host", "localhost", "port", (long) s.port, "url", "localhost:" + s.port);
        }

        @Override
        long startTimeoutMs() {
            return 120_000;
        }
    };
}
