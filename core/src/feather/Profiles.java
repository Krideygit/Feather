package feather;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

public final class Profiles {
    static final String FORMAT = "feather-profile";
    private static final int MAX_AVATAR_BYTES = 2 * 1024 * 1024;

    public record Profile(String id, String name, long createdAt) {}

    private final List<Profile> list = new ArrayList<>();
    private String active = "default";

    public synchronized void load() throws IOException {
        Files.createDirectories(Home.profiles());
        Path file = Home.profilesFile();
        if (Files.exists(file)) {
            Map<String, Object> root = Json.parseObject(Files.readString(file, StandardCharsets.UTF_8));
            list.clear();
            for (Object o : (List<?>) root.get("profiles")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> m = (Map<String, Object>) o;
                list.add(new Profile((String) m.get("id"), (String) m.get("name"), ((Number) m.get("createdAt")).longValue()));
            }
            active = (String) root.get("active");
        }
        if (list.isEmpty()) {
            list.add(new Profile("default", "Standard", System.currentTimeMillis()));
            active = "default";
        }
        if (list.stream().noneMatch(p -> p.id().equals(active))) active = list.get(0).id();
        Home.setProfile(active);
        migrateLegacyLayout();
        Files.createDirectories(Home.profile());
        save();
    }

    private void migrateLegacyLayout() throws IOException {
        Path legacyFile = Home.root().resolve("services.json");
        Path legacyDir = Home.root().resolve("services");
        Path target = Home.profiles().resolve("default");
        if (!Files.exists(legacyFile) && !Files.isDirectory(legacyDir)) return;
        Files.createDirectories(target);
        if (Files.exists(legacyFile) && !Files.exists(target.resolve("services.json"))) {
            Files.move(legacyFile, target.resolve("services.json"));
        }
        if (Files.isDirectory(legacyDir) && !Files.exists(target.resolve("services"))) {
            Files.move(legacyDir, target.resolve("services"));
        }
    }

    private synchronized void save() throws IOException {
        List<Object> profiles = new ArrayList<>();
        for (Profile p : list) profiles.add(Json.obj("id", p.id(), "name", p.name(), "createdAt", p.createdAt()));
        Path tmp = Home.root().resolve("profiles.json.tmp");
        Files.writeString(tmp, Json.stringify(Json.obj("active", active, "profiles", profiles)), StandardCharsets.UTF_8);
        Files.move(tmp, Home.profilesFile(), StandardCopyOption.REPLACE_EXISTING);
    }

    public synchronized String active() {
        return active;
    }

    public synchronized List<Map<String, Object>> views() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Profile p : list) {
            out.add(Json.obj(
                    "id", p.id(), "name", p.name(), "createdAt", p.createdAt(),
                    "active", p.id().equals(active), "avatar", avatar(p.id())));
        }
        return out;
    }

    private synchronized Profile get(String id) {
        for (Profile p : list) if (p.id().equals(id)) return p;
        throw new IllegalArgumentException("Profil nicht gefunden.");
    }

    private static Path avatarFile(String id) {
        return Home.profiles().resolve(id).resolve("avatar.png");
    }

    private static String avatar(String id) {
        Path f = avatarFile(id);
        try {
            if (!Files.exists(f)) return null;
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(Files.readAllBytes(f));
        } catch (IOException e) {
            return null;
        }
    }

    private static void applyAvatar(String id, String dataUrl) throws IOException {
        if (dataUrl == null) return;
        Path f = avatarFile(id);
        if (dataUrl.isEmpty()) {
            Files.deleteIfExists(f);
            return;
        }
        int comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith("data:image/") || comma < 0) throw new IllegalArgumentException("Ungültiges Profilbild.");
        byte[] bytes = Base64.getDecoder().decode(dataUrl.substring(comma + 1));
        if (bytes.length > MAX_AVATAR_BYTES) throw new IllegalArgumentException("Das Profilbild ist zu groß.");
        Files.createDirectories(f.getParent());
        Files.write(f, bytes);
    }

    private static String validName(String name) {
        String n = name == null ? "" : name.trim();
        if (n.isEmpty() || n.length() > 40 || n.matches(".*\\p{Cntrl}.*")) {
            throw new IllegalArgumentException("Bitte gib einen Namen (max. 40 Zeichen) an.");
        }
        return n;
    }

    private String uniqueName(String base) {
        String name = base;
        for (int n = 2; nameTaken(name); n++) name = base + " (" + n + ")";
        return name;
    }

    private boolean nameTaken(String name) {
        return list.stream().anyMatch(p -> p.name().equalsIgnoreCase(name));
    }

    public synchronized Map<String, Object> create(String name, String avatar) throws IOException {
        String n = validName(name);
        if (list.stream().anyMatch(p -> p.name().equalsIgnoreCase(n))) {
            throw new IllegalArgumentException("Ein Profil mit diesem Namen existiert bereits.");
        }
        Profile p = new Profile(newId(), n, System.currentTimeMillis());
        Files.createDirectories(Home.profiles().resolve(p.id()));
        applyAvatar(p.id(), avatar);
        list.add(p);
        save();
        return view(p.id());
    }

    public synchronized Map<String, Object> update(String id, String name, String avatar) throws IOException {
        Profile old = get(id);
        String n = name == null ? old.name() : validName(name);
        if (list.stream().anyMatch(p -> !p.id().equals(id) && p.name().equalsIgnoreCase(n))) {
            throw new IllegalArgumentException("Ein Profil mit diesem Namen existiert bereits.");
        }
        applyAvatar(id, avatar);
        list.set(list.indexOf(old), new Profile(id, n, old.createdAt()));
        save();
        return view(id);
    }

    public synchronized void delete(String id) throws IOException {
        Profile p = get(id);
        if (id.equals(active)) throw new IllegalStateException("Das aktive Profil kann nicht gelöscht werden. Wechsle zuerst das Profil.");
        if (list.size() <= 1) throw new IllegalStateException("Das letzte Profil kann nicht gelöscht werden.");
        list.remove(p);
        save();
        Path dir = Home.profiles().resolve(id).normalize();
        if (dir.startsWith(Home.profiles())) Home.deleteRecursively(dir);
    }

    public synchronized void switchTo(String id) throws IOException {
        get(id);
        active = id;
        Home.setProfile(id);
        Files.createDirectories(Home.profile());
        save();
    }

    private Map<String, Object> view(String id) {
        for (Map<String, Object> v : views()) if (v.get("id").equals(id)) return v;
        throw new IllegalArgumentException("Profil nicht gefunden.");
    }

    private String newId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    public synchronized Map<String, Object> export(String id, Path file, boolean includeData) throws IOException {
        Profile p = get(id);
        Path dir = Home.profiles().resolve(id);
        Path parent = file.toAbsolutePath().getParent();
        if (parent != null) Files.createDirectories(parent);
        Path tmp = file.resolveSibling(file.getFileName() + ".part");
        int files = 0;
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(tmp))) {
            zip.setLevel(6);
            put(zip, "profile.json", Json.stringify(Json.obj(
                    "format", FORMAT, "version", 1L, "name", p.name(),
                    "exportedAt", System.currentTimeMillis(), "includesData", includeData)).getBytes(StandardCharsets.UTF_8));
            if (Files.exists(dir.resolve("services.json"))) {
                put(zip, "services.json", Files.readAllBytes(dir.resolve("services.json")));
                files++;
            }
            if (Files.exists(avatarFile(id))) {
                put(zip, "avatar.png", Files.readAllBytes(avatarFile(id)));
                files++;
            }
            if (includeData && Files.isDirectory(dir.resolve("services"))) {
                Path base = dir.resolve("services");
                try (Stream<Path> walk = Files.walk(base)) {
                    for (Path f : (Iterable<Path>) walk::iterator) {
                        if (!Files.isRegularFile(f) || skipInBackup(base.relativize(f))) continue;
                        zip.putNextEntry(new ZipEntry("services/" + base.relativize(f).toString().replace('\\', '/')));
                        Files.copy(f, zip);
                        zip.closeEntry();
                        files++;
                    }
                }
            }
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            throw e;
        }
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        return Json.obj("file", file.toString(), "files", (long) files, "bytes", Files.size(file));
    }

    private static boolean skipInBackup(Path rel) {
        String s = rel.toString().replace('\\', '/');
        return s.contains("/logs/") || s.contains("/temp/") || s.endsWith(".pid") || s.endsWith(".sock");
    }

    private static void put(ZipOutputStream zip, String name, byte[] data) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(data);
        zip.closeEntry();
    }

    public synchronized Map<String, Object> importFile(Path file) throws IOException {
        Path partial = null;
        try (ZipFile zip = new ZipFile(file.toFile())) {
            ZipEntry meta = zip.getEntry("profile.json");
            if (meta == null) throw new IllegalArgumentException("Das ist keine gültige .feather-Datei.");
            Map<String, Object> info;
            try (InputStream in = zip.getInputStream(meta)) {
                info = Json.parseObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Das ist keine gültige .feather-Datei.");
            }
            if (!FORMAT.equals(info.get("format"))) throw new IllegalArgumentException("Das ist keine Feather-Profildatei.");
            if (!(info.get("version") instanceof Number v) || v.intValue() > 1) {
                throw new IllegalArgumentException("Die Profildatei stammt von einer neueren Feather-Version.");
            }

            String id = newId();
            Path target = Home.profiles().resolve(id);
            partial = Home.profiles().resolve(id + ".partial");
            Files.createDirectories(partial);
            Path root = partial.toAbsolutePath().normalize();
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry e = entries.nextElement();
                String name = e.getName();
                if (e.isDirectory() || name.equals("profile.json")) continue;
                if (!(name.equals("services.json") || name.equals("avatar.png") || name.startsWith("services/"))) continue;
                Path out = root.resolve(name).normalize();
                if (!out.startsWith(root)) throw new IOException("Ungültiger Pfad in der Datei: " + name);
                Files.createDirectories(out.getParent());
                try (InputStream in = zip.getInputStream(e); OutputStream os = Files.newOutputStream(out)) {
                    in.transferTo(os);
                }
            }
            Files.move(partial, target, StandardCopyOption.ATOMIC_MOVE);
            partial = null;

            String name = uniqueName(validName(String.valueOf(info.get("name"))));
            list.add(new Profile(id, name, System.currentTimeMillis()));
            save();
            return Json.obj("profile", view(id), "report", report(id));
        } catch (java.util.zip.ZipException e) {
            throw new IllegalArgumentException("Das ist keine gültige .feather-Datei.");
        } finally {
            if (partial != null) Home.deleteRecursively(partial);
        }
    }

    private Map<String, Object> report(String id) throws IOException {
        List<Object> missingRuntimes = new ArrayList<>();
        List<Object> missingFolders = new ArrayList<>();
        long services = 0;
        Path file = Home.profiles().resolve(id).resolve("services.json");
        if (Files.exists(file) && Json.parse(Files.readString(file, StandardCharsets.UTF_8)) instanceof List<?> l) {
            for (Object o : l) {
                @SuppressWarnings("unchecked")
                Map<String, Object> m = (Map<String, Object>) o;
                Service s;
                try {
                    s = Service.fromStored(m);
                } catch (RuntimeException e) {
                    continue;
                }
                services++;
                if (!Runtimes.isInstalled(s.type, s.version)) {
                    boolean seen = false;
                    for (Object r : missingRuntimes) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> rm = (Map<String, Object>) r;
                        if (rm.get("type").equals(s.type) && rm.get("version").equals(s.version)) seen = true;
                    }
                    if (!seen) missingRuntimes.add(Json.obj("type", s.type, "version", s.version));
                }
                if (s.category().equals("webserver") && (s.folder.isEmpty() || !Files.isDirectory(Path.of(s.folder)))) {
                    missingFolders.add(Json.obj("name", s.name, "folder", s.folder));
                }
            }
        }
        return Json.obj("services", services, "missingRuntimes", missingRuntimes, "missingFolders", missingFolders);
    }
}
