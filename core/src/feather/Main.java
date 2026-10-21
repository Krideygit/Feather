package feather;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class Main {
    private static PrintStream out;

    public static void main(String[] args) throws Exception {
        out = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), false, StandardCharsets.UTF_8);
        System.setOut(System.err);

        Runtimes.cleanupPartials();
        Profiles profiles = new Profiles();
        profiles.load();
        ServiceManager manager = new ServiceManager();
        manager.load();
        Api api = new Api(manager, profiles);
        Events.setSink((name, data) -> send(Json.obj("event", name, "data", data)));

        ExecutorService pool = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "feather-rpc");
            t.setDaemon(true);
            return t;
        });

        send(Json.obj("event", "core.ready", "data", Json.obj("home", Home.root().toString())));
        manager.autoStart();

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) continue;
            final String raw = line;
            pool.submit(() -> handle(api, raw));
        }

        manager.stopAll();
        out.flush();
        System.exit(0);
    }

    private static void handle(Api api, String raw) {
        Object id = null;
        try {
            Map<String, Object> req = Json.parseObject(raw);
            id = req.get("id");
            @SuppressWarnings("unchecked")
            Map<String, Object> params = req.get("params") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
            Object result = api.call((String) req.get("method"), params);
            send(Json.obj("id", id, "result", result));
        } catch (Throwable t) {
            String msg = t.getMessage() == null ? t.toString() : Sql.clean(t.getMessage());
            boolean expected = t instanceof IllegalArgumentException || t instanceof IllegalStateException
                    || t instanceof java.sql.SQLException || t instanceof java.io.IOException;
            if (!expected) t.printStackTrace();
            send(Json.obj("id", id, "error", msg));
        }
    }

    private static synchronized void send(Map<String, Object> message) {
        out.println(Json.stringify(message));
        out.flush();
    }
}
