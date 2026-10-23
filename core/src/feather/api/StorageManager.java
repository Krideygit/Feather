package feather.api;

public interface StorageManager {
    String get(String key, String fallback);

    void put(String key, String value);

    void remove(String key);
}
