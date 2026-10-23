package feather.api;

import java.util.function.Consumer;

public interface EventManager {
    void on(String name, Consumer<Event> handler);
}
