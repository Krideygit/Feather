package feather.api;

import java.util.function.Consumer;

public final class ViewSpec {
    private final String id;
    private String title = "";
    private String icon = "";
    private Consumer<Event> onAction = e -> {};

    private ViewSpec(String id) {
        this.id = id;
    }

    public static ViewSpec of(String id) {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("Eine View-ID wird benötigt.");
        return new ViewSpec(id);
    }

    public ViewSpec title(String title) {
        this.title = title == null ? "" : title;
        return this;
    }

    public ViewSpec icon(String icon) {
        this.icon = icon == null ? "" : icon;
        return this;
    }

    public ViewSpec onAction(Consumer<Event> handler) {
        this.onAction = handler == null ? e -> {} : handler;
        return this;
    }

    public String id() {
        return id;
    }

    public String title() {
        return title;
    }

    public String icon() {
        return icon;
    }

    public Consumer<Event> onAction() {
        return onAction;
    }
}
