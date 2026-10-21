package feather;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public final class ServiceManager {
    private static final Pattern NAME_OK = Pattern.compile("^[^\\p{Cntrl}]{1,60}$");
    private static final int LOG_LINES = 1000;

    private final List<Service> services = new CopyOnWriteArrayList<>();
    private final Map<String, Deque<String>> logs = new ConcurrentHashMap<>();
    private final ExecutorService pool = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "feather-service");
        t.setDaemon(true);
        return t;
    });

    public synchronized void load() throws IOException {
        services.clear();
        Path file = Home.servicesFile();
        if (!Files.exists(file)) return;
        Object parsed = Json.parse(Files.readString(file, StandardCharsets.UTF_8));
        if (parsed instanceof List<?> list) {
            for (Object o : list) {
                @SuppressWarnings("unchecked")
                Map<String, Object> m = (Map<String, Object>) o;
                try {
                    services.add(Service.fromStored(m));
                } catch (RuntimeException e) {
                    System.err.println("Ungültiger Service-Eintrag übersprungen: " + e.getMessage());
                }
            }
        }
    }

    public synchronized void switchProfile() throws IOException {
        stopAll();
        logs.clear();
        load();
    }

    public List<String> stopRunning() {
        List<String> ids = new ArrayList<>();
        for (Service s : services) {
            if (s.status.equals("running") || s.status.equals("starting")) ids.add(s.id);
        }
        for (String id : ids) stop(get(id));
        return ids;
    }

    public void startAll(List<String> ids) {
        for (String id : ids) startAsync(id);
    }

    public synchronized void setPassword(Service s, String password) throws IOException {
        s.password = password;
        save();
    }

    private synchronized void save() throws IOException {
        Files.createDirectories(Home.profile());
        List<Object> list = new ArrayList<>();
        for (Service s : services) list.add(s.toStored());
        Path tmp = Home.profile().resolve("services.json.tmp");
        Files.writeString(tmp, Json.stringify(list), StandardCharsets.UTF_8);
        Files.move(tmp, Home.servicesFile(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Service s : services) out.add(s.toView());
        return out;
    }

    public Service get(String id) {
        for (Service s : services) if (s.id.equals(id)) return s;
        throw new IllegalArgumentException("Service nicht gefunden.");
    }

    public Map<String, Object> view(String id) {
        return get(id).toView();
    }

    public Map<String, Object> create(Map<String, Object> p) throws IOException {
        Service s = new Service();
        s.type = str(p, "type");
        if (!Runtimes.knownType(s.type)) throw new IllegalArgumentException("Unbekannter Typ: " + s.type);
        s.name = validName(str(p, "name"));
        s.version = str(p, "version");
        if (!Runtimes.isInstalled(s.type, s.version)) {
            throw new IllegalStateException("Version " + s.version + " ist noch nicht installiert.");
        }
        s.port = validPort(p.get("port"));
        assertPortUnused(s.port, null);
        s.autoStart = Boolean.TRUE.equals(p.get("autoStart"));
        if (s.category().equals("webserver")) {
            s.folder = validFolder(str(p, "folder"));
            s.spa = Boolean.TRUE.equals(p.get("spa"));
            s.autoindex = Boolean.TRUE.equals(p.get("autoindex"));
            s.password = "";
        } else if (s.category().equals("package")) {
            s.password = "";
            s.folder = "";
            s.options = Drivers.of(s).options(asMap(p.get("options")), Map.of(), true);
        } else {
            s.password = p.get("password") == null ? "" : String.valueOf(p.get("password"));
            s.folder = "";
        }
        s.id = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        s.createdAt = System.currentTimeMillis();
        Files.createDirectories(s.dir());
        services.add(s);
        save();
        emitStatus(s);
        return s.toView();
    }

    public Map<String, Object> update(Map<String, Object> p) throws IOException {
        Service s = get(str(p, "id"));
        boolean live = !s.status.equals("stopped") && !s.status.equals("error");
        if (p.containsKey("name")) s.name = validName(str(p, "name"));
        if (p.containsKey("autoStart")) s.autoStart = Boolean.TRUE.equals(p.get("autoStart"));

        boolean needsStopped = p.containsKey("port") || p.containsKey("folder") || p.containsKey("spa")
                || p.containsKey("autoindex") || p.containsKey("version") || p.containsKey("options");
        if (needsStopped && live) throw new IllegalStateException("Stoppe den Service, um diese Einstellungen zu ändern.");

        if (p.containsKey("port")) {
            int port = validPort(p.get("port"));
            assertPortUnused(port, s.id);
            s.port = port;
        }
        if (p.containsKey("folder") && s.category().equals("webserver")) s.folder = validFolder(str(p, "folder"));
        if (p.containsKey("options") && s.category().equals("package")) s.options = Drivers.of(s).options(asMap(p.get("options")), s.options, false);
        if (p.containsKey("spa")) s.spa = Boolean.TRUE.equals(p.get("spa"));
        if (p.containsKey("autoindex")) s.autoindex = Boolean.TRUE.equals(p.get("autoindex"));
        if (p.containsKey("version") && s.category().equals("webserver")) {
            String v = str(p, "version");
            if (!Runtimes.isInstalled(s.type, v)) throw new IllegalStateException("Version " + v + " ist nicht installiert.");
            s.version = v;
        }
        save();
        emitStatus(s);
        return s.toView();
    }

    public void delete(String id) throws Exception {
        Service s = get(id);
        stop(s);
        services.remove(s);
        logs.remove(id);
        save();
        Path dir = s.dir().normalize();
        if (dir.startsWith(Home.services())) Home.deleteRecursively(dir);
        Events.emit("service.removed", Json.obj("id", id));
    }

    public Map<String, Object> startAsync(String id) {
        Service s = get(id);
        synchronized (s) {
            if (s.status.equals("running") || s.status.equals("starting") || s.status.equals("stopping")) {
                return s.toView();
            }
            s.status = "starting";
            s.error = null;
            s.stopRequested = false;
            s.readyLogged = false;
        }
        emitStatus(s);
        pool.submit(() -> runStart(s));
        return s.toView();
    }

    private void runStart(Service s) {
        Drivers.Driver driver = Drivers.of(s);
        try {
            Path base = Runtimes.base(s.type, s.version);
            if (base == null) throw new IllegalStateException("Version " + s.version + " ist nicht installiert.");
            if (s.category().equals("webserver") && !Files.isDirectory(Path.of(s.folder))) {
                throw new IllegalStateException("Der Ordner existiert nicht mehr: " + s.folder);
            }
            for (int attempt = 0; !Net.isPortFree(s.port); attempt++) {
                if (attempt >= 8) {
                    throw new IllegalStateException("Port " + s.port + " wird bereits von einem anderen Programm verwendet.");
                }
                Thread.sleep(400);
            }
            log(s, "[feather] Starte " + s.name + " ...");
            driver.prepare(s, base, line -> log(s, line));

            if (s.stopRequested) {
                s.status = "stopped";
                emitStatus(s);
                return;
            }
            Files.createDirectories(s.dir());
            ProcessBuilder pb = new ProcessBuilder(driver.command(s, base))
                    .directory(driver.workDir(s, base).toFile())
                    .redirectErrorStream(true);
            List<Path> logFiles = driver.logFiles(s);
            long[] startPos = new long[logFiles.size()];
            for (int i = 0; i < startPos.length; i++) {
                startPos[i] = Files.exists(logFiles.get(i)) ? Files.size(logFiles.get(i)) : 0;
            }
            Process proc = pb.start();
            s.process = proc;
            s.pid = proc.pid();
            pool.submit(() -> pump(s, proc));
            for (int i = 0; i < startPos.length; i++) {
                Path f = logFiles.get(i);
                long from = startPos[i];
                pool.submit(() -> tail(s, proc, f, from));
            }
            proc.onExit().thenAccept(p -> onExit(s, p));

            boolean up = waitUntilReady(s, driver, proc);
            if (!up) {
                if (proc.isAlive()) {
                    Drivers.kill(proc);
                    throw new IllegalStateException("Zeitüberschreitung: " + s.name + " antwortet nicht auf Port " + s.port + ".");
                }
                throw new IllegalStateException(lastLines(s));
            }
            s.startedAt = System.currentTimeMillis();
            s.status = "running";
            log(s, "[feather] " + s.name + " läuft auf Port " + s.port + ".");
            emitStatus(s);
        } catch (Exception e) {
            s.error = e.getMessage() == null ? e.toString() : e.getMessage();
            s.status = "error";
            s.pid = 0;
            log(s, "[feather] Fehler: " + s.error);
            emitStatus(s);
        }
    }

    private boolean waitUntilReady(Service s, Drivers.Driver driver, Process proc) throws InterruptedException {
        long deadline = System.currentTimeMillis() + driver.startTimeoutMs();
        while (System.currentTimeMillis() < deadline) {
            if (Net.isOpen(s.port) && (driver.readyLine() == null || s.readyLogged)) return true;
            if (!proc.isAlive()) return false;
            Thread.sleep(250);
        }
        return false;
    }

    private String lastLines(Service s) {
        Deque<String> d = logs.get(s.id);
        if (d == null || d.isEmpty()) return "Der Prozess wurde unerwartet beendet.";
        List<String> tail = new ArrayList<>();
        synchronized (d) {
            for (String l : d) tail.add(l);
        }
        int from = Math.max(0, tail.size() - 4);
        return "Der Prozess wurde unerwartet beendet:\n" + String.join("\n", tail.subList(from, tail.size()));
    }

    private void onExit(Service s, Process p) {
        if (s.process != p) return;
        int code = p.exitValue();
        s.pid = 0;
        s.process = null;
        if (s.stopRequested) {
            s.status = "stopped";
            s.error = null;
        } else if (s.status.equals("running")) {
            s.status = "error";
            s.error = "Der Prozess wurde unerwartet beendet (Exit-Code " + code + ").";
            log(s, "[feather] " + s.error);
        }
        if (!s.status.equals("starting")) emitStatus(s);
    }

    public Map<String, Object> stop(String id) {
        Service s = get(id);
        stop(s);
        return s.toView();
    }

    public void stop(Service s) {
        Process p;
        synchronized (s) {
            p = s.process;
            if (p == null && s.status.equals("starting")) {
                s.stopRequested = true;
                return;
            }
            if (p == null || !p.isAlive()) {
                if (!s.status.equals("stopped")) {
                    s.status = "stopped";
                    s.error = null;
                    s.pid = 0;
                    emitStatus(s);
                }
                return;
            }
            s.stopRequested = true;
            s.status = "stopping";
        }
        emitStatus(s);
        log(s, "[feather] Stoppe " + s.name + " ...");
        Path base = Runtimes.base(s.type, s.version);
        try {
            if (base != null) Drivers.of(s).stop(s, base, p);
        } catch (Exception e) {
            log(s, "[feather] Sanftes Beenden fehlgeschlagen: " + e.getMessage());
        }
        if (p.isAlive()) Drivers.kill(p);
        try {
            p.waitFor(10, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        s.status = "stopped";
        s.error = null;
        s.pid = 0;
        s.process = null;
        emitStatus(s);
    }

    public Map<String, Object> restart(String id) throws InterruptedException {
        Service s = get(id);
        stop(s);
        return startAsync(id);
    }

    public void stopAll() {
        List<java.util.concurrent.Future<?>> futures = new ArrayList<>();
        for (Service s : services) futures.add(pool.submit(() -> stop(s)));
        for (var f : futures) {
            try {
                f.get();
            } catch (Exception ignored) {
            }
        }
    }

    public void autoStart() {
        for (Service s : services) if (s.autoStart) startAsync(s.id);
    }

    public List<String> logs(String id, int max) {
        Service s = get(id);
        Deque<String> d = logs.get(s.id);
        if (d == null) return List.of();
        synchronized (d) {
            List<String> all = new ArrayList<>(d);
            return all.subList(Math.max(0, all.size() - max), all.size());
        }
    }

    public void clearLogs(String id) {
        Deque<String> d = logs.get(get(id).id);
        if (d != null) synchronized (d) {
            d.clear();
        }
    }

    private static final java.util.regex.Pattern ANSI = java.util.regex.Pattern.compile("\u001B\\[[0-9;?]*[A-Za-z]");

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    public void sendCommand(String id, String line) throws IOException {
        Service s = get(id);
        Process p = s.process;
        if (p == null || !p.isAlive() || !s.status.equals("running")) throw new IllegalStateException("Der Service läuft nicht.");
        if (!Drivers.of(s).supportsCommands()) throw new IllegalStateException("Dieser Service nimmt keine Befehle entgegen.");
        String cmd = line.replaceAll("[\r\n]+", " ").trim();
        if (cmd.isEmpty()) return;
        log(s, "> " + cmd);
        p.getOutputStream().write((cmd + "\n").getBytes(StandardCharsets.UTF_8));
        p.getOutputStream().flush();
    }

    void log(Service s, String rawLine) {
        String line = ANSI.matcher(rawLine).replaceAll("");
        if (!s.readyLogged) {
            java.util.regex.Pattern ready = Drivers.of(s).readyLine();
            if (ready != null && ready.matcher(line).find()) s.readyLogged = true;
        }
        Deque<String> d = logs.computeIfAbsent(s.id, k -> new ArrayDeque<>());
        synchronized (d) {
            d.addLast(line);
            while (d.size() > LOG_LINES) d.removeFirst();
        }
        Events.emit("service.log", Json.obj("id", s.id, "line", line));
    }

    private void pump(Service s, Process proc) {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) log(s, line);
        } catch (IOException ignored) {
        }
    }

    private void tail(Service s, Process proc, Path file, long from) {
        long pos = from;
        try {
            while (proc.isAlive() || Files.exists(file)) {
                if (Files.exists(file)) {
                    try (RandomAccessFile raf = new RandomAccessFile(file.toFile(), "r")) {
                        if (raf.length() < pos) pos = 0;
                        raf.seek(pos);
                        String line;
                        while ((line = raf.readLine()) != null) {
                            log(s, new String(line.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8));
                        }
                        pos = raf.getFilePointer();
                    }
                }
                if (!proc.isAlive()) break;
                Thread.sleep(400);
            }
        } catch (IOException | InterruptedException ignored) {
        }
    }

    private void emitStatus(Service s) {
        Events.emit("service.status", s.toView());
    }

    private static String str(Map<String, Object> p, String key) {
        Object v = p.get(key);
        if (v == null || String.valueOf(v).isBlank()) throw new IllegalArgumentException("Pflichtfeld fehlt: " + key);
        return String.valueOf(v).trim();
    }

    private static String validName(String n) {
        if (!NAME_OK.matcher(n).matches()) throw new IllegalArgumentException("Ungültiger Name.");
        return n;
    }

    static int validPort(Object o) {
        int port;
        try {
            port = o instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Ungültiger Port.");
        }
        if (port < 1024 || port > 65535) throw new IllegalArgumentException("Der Port muss zwischen 1024 und 65535 liegen.");
        return port;
    }

    private void assertPortUnused(int port, String exceptId) {
        for (Service o : services) {
            if (o.port == port && !o.id.equals(exceptId)) {
                throw new IllegalArgumentException("Port " + port + " ist bereits für \"" + o.name + "\" vergeben.");
            }
        }
    }

    private static String validFolder(String f) {
        Path p = Path.of(f);
        if (!Files.isDirectory(p)) throw new IllegalArgumentException("Der Ordner existiert nicht: " + f);
        return p.toAbsolutePath().toString();
    }

    public int suggestPort(int preferred) {
        for (int port = preferred; port < 65535; port++) {
            boolean taken = false;
            for (Service o : services) if (o.port == port) taken = true;
            if (!taken && Net.isPortFree(port)) return port;
        }
        return preferred;
    }
}
