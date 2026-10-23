package feather.api;

public interface UiManager {
    void addButton(ButtonSpec button);

    void removeButton(String id);

    void injectCss(String id, String css);

    void removeCss(String id);

    void toast(String message, String kind);
}
