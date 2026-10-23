package feather.api;

import java.util.LinkedHashMap;
import java.util.Map;

public final class Block {
    private final Map<String, Object> data = new LinkedHashMap<>();

    private Block(String type) {
        data.put("type", type);
    }

    public static Block heading(String text) {
        return new Block("heading").put("text", text);
    }

    public static Block text(String text) {
        return new Block("text").put("text", text);
    }

    public static Block code(String text) {
        return new Block("code").put("text", text);
    }

    public static Block button(String id, String label) {
        return new Block("button").put("id", id).put("label", label);
    }

    public static Block divider() {
        return new Block("divider");
    }

    private Block put(String key, Object value) {
        data.put(key, value);
        return this;
    }

    public Map<String, Object> toMap() {
        return data;
    }
}
