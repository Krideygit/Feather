package feather.api;

import java.util.Map;

public record Event(String name, Map<String, Object> data) {
    public String string(String key) {
        Object v = data.get(key);
        return v == null ? "" : String.valueOf(v);
    }
}
