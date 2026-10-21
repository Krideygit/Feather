package feather;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Catalog {
    public record Version(String id, String channel, String url, String sha256, String referer) {}

    static final HttpClient HTTP = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.ALWAYS)
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    static final String USER_AGENT = "Mozilla/5.0 (Feather)";

    private static final String[] MARIADB_MAJORS = {"12.3", "11.8", "11.4", "10.11"};
    private static final long TTL_MS = 60 * 60 * 1000L;

    private record Cached(long at, List<Version> versions) {}

    private static final Map<String, Cached> CACHE = new ConcurrentHashMap<>();

    private Catalog() {}

    public static List<Version> versions(String type) throws IOException, InterruptedException {
        Cached c = CACHE.get(type);
        if (c != null && System.currentTimeMillis() - c.at < TTL_MS) return c.versions;
        List<Version> list = switch (type) {
            case "mariadb" -> mariadb();
            case "nginx" -> nginx();
            case "apache" -> apache();
            default -> throw new IllegalArgumentException("Unbekannter Typ: " + type);
        };
        if (!list.isEmpty()) CACHE.put(type, new Cached(System.currentTimeMillis(), list));
        return list;
    }

    public static Version find(String type, String id) throws IOException, InterruptedException {
        for (Version v : versions(type)) if (v.id.equals(id)) return v;
        throw new IllegalArgumentException("Version " + id + " von " + type + " ist nicht (mehr) verfügbar.");
    }

    @SuppressWarnings("unchecked")
    private static List<Version> mariadb() throws InterruptedException {
        List<Version> out = new ArrayList<>();
        for (String major : MARIADB_MAJORS) {
            try {
                String body = get("https://downloads.mariadb.org/rest-api/mariadb/" + major + "/latest/", null);
                Map<String, Object> releases = (Map<String, Object>) Json.parseObject(body).get("releases");
                for (Map.Entry<String, Object> rel : releases.entrySet()) {
                    Map<String, Object> r = (Map<String, Object>) rel.getValue();
                    for (Object f : (List<Object>) r.get("files")) {
                        Map<String, Object> file = (Map<String, Object>) f;
                        String name = String.valueOf(file.get("file_name"));
                        if (!name.endsWith("-winx64.zip")) continue;
                        Map<String, Object> sum = (Map<String, Object>) file.get("checksum");
                        String url = String.valueOf(file.get("file_download_url")).replace("http://", "https://");
                        out.add(new Version(rel.getKey(), "LTS", url, (String) sum.get("sha256sum"), null));
                    }
                }
            } catch (IOException | RuntimeException e) {
                System.err.println("MariaDB " + major + " konnte nicht aufgelöst werden: " + e.getMessage());
            }
        }
        return out;
    }

    private static List<Version> nginx() throws IOException, InterruptedException {
        String html = get("https://nginx.org/en/download.html", null);
        int mainline = html.indexOf("Mainline version");
        int stable = html.indexOf("Stable version");
        int legacy = html.indexOf("Legacy versions");
        Pattern p = Pattern.compile("nginx-(\\d+\\.\\d+\\.\\d+)\\.zip");
        Matcher m = p.matcher(html);
        Set<String> seen = new LinkedHashSet<>();
        List<Version> out = new ArrayList<>();
        while (m.find() && out.size() < 6) {
            if (!seen.add(m.group(1))) continue;
            int pos = m.start();
            String channel = "";
            if (legacy >= 0 && pos > legacy) channel = "Legacy";
            else if (stable >= 0 && pos > stable) channel = "Stable";
            else if (mainline >= 0 && pos > mainline) channel = "Mainline";
            out.add(new Version(m.group(1), channel, "https://nginx.org/download/nginx-" + m.group(1) + ".zip", null, null));
        }
        return out;
    }

    private static List<Version> apache() throws IOException, InterruptedException {
        String page = "https://www.apachelounge.com/download/";
        String html = get(page, null);
        Matcher m = Pattern.compile("href=\"([^\"]*httpd-(\\d+\\.\\d+\\.\\d+)-[^\"]*\\.zip)\"", Pattern.CASE_INSENSITIVE)
                .matcher(html);
        Map<String, Version> byVersion = new LinkedHashMap<>();
        while (m.find()) {
            String href = m.group(1);
            if (!href.toLowerCase().contains("win64")) continue;
            String url = href.startsWith("http") ? href : "https://www.apachelounge.com" + href;
            byVersion.putIfAbsent(m.group(2), new Version(m.group(2), "Apache Lounge", url, null, page));
        }
        return new ArrayList<>(byVersion.values());
    }

    private static String get(String url, String referer) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("User-Agent", USER_AGENT);
        if (referer != null) b.header("Referer", referer);
        HttpResponse<String> res = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new IOException("HTTP " + res.statusCode() + " für " + url);
        return res.body();
    }
}
