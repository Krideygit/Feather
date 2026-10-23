package feather.api;

import java.util.function.Consumer;

public final class ButtonSpec {
    private final String id;
    private String label = "";
    private String icon = "";
    private String tooltip = "";
    private String location = Locations.SERVER_TABBAR;
    private Consumer<Event> onClick = e -> {};

    private ButtonSpec(String id) {
        this.id = id;
    }

    public static ButtonSpec of(String id) {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("Eine Button-ID wird benötigt.");
        return new ButtonSpec(id);
    }

    public ButtonSpec label(String label) {
        this.label = label == null ? "" : label;
        return this;
    }

    public ButtonSpec icon(String icon) {
        this.icon = icon == null ? "" : icon;
        return this;
    }

    public ButtonSpec tooltip(String tooltip) {
        this.tooltip = tooltip == null ? "" : tooltip;
        return this;
    }

    public ButtonSpec location(String location) {
        this.location = location;
        return this;
    }

    public ButtonSpec onClick(Consumer<Event> handler) {
        this.onClick = handler == null ? e -> {} : handler;
        return this;
    }

    public String id() {
        return id;
    }

    public String label() {
        return label;
    }

    public String icon() {
        return icon;
    }

    public String tooltip() {
        return tooltip;
    }

    public String location() {
        return location;
    }

    public Consumer<Event> onClick() {
        return onClick;
    }
}
