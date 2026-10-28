package feather;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public final class Drivers {
    private Drivers() {}

    public abstract static class Driver {
        abstract void prepare(Service s, Path base, Consumer<String> log) throws Exception;

        abstract List<String> command(Service s, Path base);

        void stop(Service s, Path base, Process p) throws Exception {}

        List<Path> logFiles(Service s) {
            return List.of();
        }

        abstract Map<String, Object> connection(Service s);

        long startTimeoutMs() {
            return 30_000;
        }

        Path workDir(Service s, Path base) {
            return base;
        }

        java.util.regex.Pattern readyLine() {
            return null;
        }

        boolean supportsCommands() {
            return false;
        }

        Map<String, Object> options(Map<String, Object> input, Map<String, Object> current, boolean creating) {
            return new LinkedHashMap<>();
        }
    }

    public static Driver of(Service s) {
        return switch (s.type) {
            case "mariadb" -> MARIADB;
            case "nginx" -> NGINX;
            case "apache" -> APACHE;
            case "minecraft", "paper" -> PackageDrivers.MINECRAFT;
            case "fivem" -> PackageDrivers.FIVEM;
            case "mailpit" -> PackageDrivers.MAILPIT;
            default -> throw new IllegalArgumentException("Unbekannter Typ: " + s.type);
        };
    }

    static void kill(Process p) {
        p.descendants().forEach(ProcessHandle::destroyForcibly);
        p.destroyForcibly();
    }

    static final Driver MARIADB = new Driver() {
        @Override
        void prepare(Service s, Path base, Consumer<String> log) throws Exception {
            Path data = s.dir().resolve("data");
            Files.createDirectories(s.dir());
            if (Files.isDirectory(data.resolve("mysql"))) return;

            log.accept("Initialisiere Datenverzeichnis (einmalig) ...");
            List<String> cmd = new ArrayList<>(List.of(
                    base.resolve("bin/mariadb-install-db.exe").toString(),
                    "--datadir=" + data,
                    "--port=" + s.port));
            if (s.password != null && !s.password.isEmpty()) cmd.add("--password=" + s.password);
            ProcessBuilder pb = new ProcessBuilder(cmd).directory(base.resolve("bin").toFile()).redirectErrorStream(true);
            Process p = pb.start();
            try (var r = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) log.accept(line);
            }
            if (!p.waitFor(120, TimeUnit.SECONDS) || p.exitValue() != 0) {
                Home.deleteRecursively(data);
                throw new IOException("Datenverzeichnis konnte nicht initialisiert werden.");
            }
            Files.deleteIfExists(data.resolve("my.ini"));
        }

        @Override
        List<String> command(Service s, Path base) {
            return List.of(
                    base.resolve("bin/mariadbd.exe").toString(),
                    "--no-defaults",
                    "--console",
                    "--basedir=" + base,
                    "--datadir=" + s.dir().resolve("data"),
                    "--port=" + s.port,
                    "--bind-address=127.0.0.1",
                    "--skip-name-resolve",
                    "--character-set-server=utf8mb4",
                    "--innodb-buffer-pool-size=128M",
                    "--max-connections=100");
        }

        @Override
        void stop(Service s, Path base, Process p) throws Exception {
            ProcessBuilder pb = new ProcessBuilder(
                    base.resolve("bin/mariadb-admin.exe").toString(),
                    "-h", "127.0.0.1", "-P", String.valueOf(s.port), "-u", "root", "shutdown")
                    .redirectErrorStream(true);
            pb.environment().put("MYSQL_PWD", s.password == null ? "" : s.password);
            Process admin = pb.start();
            admin.getInputStream().readAllBytes();
            admin.waitFor(10, TimeUnit.SECONDS);
            p.waitFor(30, TimeUnit.SECONDS);
        }

        @Override
        Map<String, Object> connection(Service s) {
            String pw = s.password == null || s.password.isEmpty() ? "" : ":" + s.password;
            return Json.obj(
                    "host", "127.0.0.1", "port", (long) s.port, "user", "root",
                    "password", s.password == null ? "" : s.password,
                    "url", "mysql://root" + pw + "@127.0.0.1:" + s.port);
        }

        @Override
        long startTimeoutMs() {
            return 90_000;
        }
    };

    public static List<String[]> sql(Service s, Path base, String statement) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(
                base.resolve("bin/mariadb.exe").toString(),
                "-h", "127.0.0.1", "-P", String.valueOf(s.port), "-u", "root",
                "--batch", "--skip-column-names", "-e", statement);
        pb.environment().put("MYSQL_PWD", s.password == null ? "" : s.password);
        Process p = pb.start();
        byte[] out = p.getInputStream().readAllBytes();
        byte[] err = p.getErrorStream().readAllBytes();
        if (!p.waitFor(30, TimeUnit.SECONDS)) {
            p.destroyForcibly();
            throw new IOException("Zeitüberschreitung bei der SQL-Abfrage.");
        }
        if (p.exitValue() != 0) {
            throw new IOException(new String(err, StandardCharsets.UTF_8).trim());
        }
        List<String[]> rows = new ArrayList<>();
        for (String line : new String(out, StandardCharsets.UTF_8).split("\\R")) {
            if (!line.isEmpty()) rows.add(line.split("\t", -1));
        }
        return rows;
    }

    static final Driver NGINX = new Driver() {
        @Override
        void prepare(Service s, Path base, Consumer<String> log) throws IOException {
            Path dir = s.dir();
            Files.createDirectories(dir.resolve("logs"));
            Files.createDirectories(dir.resolve("temp"));
            String root = Home.conf(Path.of(s.folder));
            String tryFiles = s.spa ? "$uri $uri/ /index.html" : "$uri $uri/ =404";
            String conf = """
                    worker_processes 1;
                    error_log "%1$s/logs/error.log" notice;
                    pid "%1$s/logs/nginx.pid";

                    events {
                        worker_connections 1024;
                    }

                    http {
                        include "%2$s/conf/mime.types";
                        default_type application/octet-stream;
                        access_log "%1$s/logs/access.log";
                        sendfile off;
                        keepalive_timeout 30;
                        add_header Cache-Control "no-store" always;

                        server {
                            listen 127.0.0.1:%3$d;
                            server_name localhost;
                            root "%4$s";
                            index index.html index.htm;
                            autoindex %5$s;

                            location / {
                                try_files %6$s;
                            }
                        }
                    }
                    """.formatted(Home.conf(dir), Home.conf(base), s.port, root, s.autoindex ? "on" : "off", tryFiles);
            Files.writeString(dir.resolve("nginx.conf"), conf, StandardCharsets.UTF_8);
        }

        private List<String> args(Service s, Path base) {
            return List.of(
                    base.resolve("nginx.exe").toString(),
                    "-p", Home.conf(s.dir()) + "/",
                    "-c", Home.conf(s.dir().resolve("nginx.conf")));
        }

        @Override
        List<String> command(Service s, Path base) {
            return args(s, base);
        }

        @Override
        void stop(Service s, Path base, Process p) throws Exception {
            List<String> cmd = new ArrayList<>(args(s, base));
            cmd.addAll(List.of("-s", "quit"));
            Process quit = new ProcessBuilder(cmd).directory(base.toFile()).redirectErrorStream(true).start();
            quit.getInputStream().readAllBytes();
            quit.waitFor(5, TimeUnit.SECONDS);
            p.waitFor(8, TimeUnit.SECONDS);
        }

        @Override
        List<Path> logFiles(Service s) {
            return List.of(s.dir().resolve("logs/error.log"), s.dir().resolve("logs/access.log"));
        }

        @Override
        Map<String, Object> connection(Service s) {
            return Json.obj("host", "localhost", "port", (long) s.port, "url", "http://localhost:" + s.port);
        }
    };

    static final Driver APACHE = new Driver() {
        @Override
        void prepare(Service s, Path base, Consumer<String> log) throws IOException {
            Path dir = s.dir();
            Files.createDirectories(dir.resolve("logs"));
            String root = Home.conf(Path.of(s.folder));
            StringBuilder dirOptions = new StringBuilder("FollowSymLinks");
            if (s.autoindex) dirOptions.append(" Indexes");
            String conf = """
                    Define SRVROOT "%1$s"
                    ServerRoot "${SRVROOT}"
                    ServerName localhost:%2$d
                    Listen 127.0.0.1:%2$d
                    PidFile "%3$s/logs/httpd.pid"

                    LoadModule alias_module modules/mod_alias.so
                    LoadModule authz_core_module modules/mod_authz_core.so
                    LoadModule autoindex_module modules/mod_autoindex.so
                    LoadModule dir_module modules/mod_dir.so
                    LoadModule headers_module modules/mod_headers.so
                    LoadModule log_config_module modules/mod_log_config.so
                    LoadModule mime_module modules/mod_mime.so
                    LoadModule rewrite_module modules/mod_rewrite.so

                    ErrorLog "%3$s/logs/error.log"
                    LogLevel warn
                    LogFormat "%%h %%l %%u %%t \\"%%r\\" %%>s %%b" common
                    CustomLog "%3$s/logs/access.log" common
                    TypesConfig "${SRVROOT}/conf/mime.types"

                    Header always set Cache-Control "no-store"

                    DocumentRoot "%4$s"
                    DirectoryIndex index.html index.htm
                    <Directory "%4$s">
                        Options %5$s
                        AllowOverride All
                        Require all granted
                    %6$s
                    </Directory>
                    """.formatted(
                    Home.conf(base), s.port, Home.conf(dir), root, dirOptions,
                    s.spa ? "    FallbackResource /index.html" : "");
            Files.writeString(dir.resolve("httpd.conf"), conf, StandardCharsets.UTF_8);
        }

        @Override
        List<String> command(Service s, Path base) {
            return List.of(
                    base.resolve("bin/httpd.exe").toString(),
                    "-d", Home.conf(base),
                    "-f", Home.conf(s.dir().resolve("httpd.conf")));
        }

        @Override
        List<Path> logFiles(Service s) {
            return List.of(s.dir().resolve("logs/error.log"), s.dir().resolve("logs/access.log"));
        }

        @Override
        Map<String, Object> connection(Service s) {
            return Json.obj("host", "localhost", "port", (long) s.port, "url", "http://localhost:" + s.port);
        }
    };
}
