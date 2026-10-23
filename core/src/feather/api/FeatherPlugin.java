package feather.api;

public interface FeatherPlugin {
    void onEnable(PluginAPIManager api) throws Exception;

    default void onDisable() throws Exception {}
}
