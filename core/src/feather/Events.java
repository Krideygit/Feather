package feather;

import java.util.function.BiConsumer;

public final class Events {
    private static volatile BiConsumer<String, Object> sink = (name, data) -> {};

    private Events() {}

    public static void setSink(BiConsumer<String, Object> s) {
        sink = s;
    }

    public static void emit(String name, Object data) {
        sink.accept(name, data);
    }
}
