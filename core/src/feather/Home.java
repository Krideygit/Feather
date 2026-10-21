package feather;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;

public final class Home {
    private static final Path ROOT = resolveRoot();

    private Home() {}

    private static Path resolveRoot() {
        String env = System.getenv("FEATHER_HOME");
        Path p = (env != null && !env.isBlank())
                ? Path.of(env)
                : Path.of(System.getProperty("user.home"), ".feather");
        return p.toAbsolutePath().normalize();
    }

    public static Path root() {
        return ROOT;
    }

    public static Path runtimes() {
        return ROOT.resolve("runtimes");
    }

    private static volatile String profileId = "default";

    public static void setProfile(String id) {
        profileId = id;
    }

    public static Path profiles() {
        return ROOT.resolve("profiles");
    }

    public static Path profilesFile() {
        return ROOT.resolve("profiles.json");
    }

    public static Path profile() {
        return profiles().resolve(profileId);
    }

    public static Path services() {
        return profile().resolve("services");
    }

    public static Path servicesFile() {
        return profile().resolve("services.json");
    }

    public static Path downloads() {
        return ROOT.resolve("downloads");
    }

    public static Path lib() {
        return ROOT.resolve("lib");
    }

    public static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    public static String conf(Path p) {
        return p.toAbsolutePath().toString().replace('\\', '/');
    }

    public static void deleteRecursively(Path dir) throws IOException {
        if (!Files.exists(dir)) return;
        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                try {
                    Files.delete(file);
                } catch (IOException e) {
                    file.toFile().setWritable(true);
                    Files.delete(file);
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                Files.delete(d);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    public static long sizeOf(Path dir) {
        if (!Files.exists(dir)) return 0;
        long[] total = {0};
        try {
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    total[0] += attrs.size();
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return total[0];
    }
}
