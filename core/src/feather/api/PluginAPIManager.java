package feather.api;

import java.util.logging.Logger;

public interface PluginAPIManager {
    PluginInfo info();

    Logger logger();

    UiManager ui();

    TerminalManager terminal();

    EventManager events();

    StorageManager storage();
}
