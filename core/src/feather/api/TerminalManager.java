package feather.api;

import java.util.List;
import java.util.Map;

public interface TerminalManager {
    void addView(ViewSpec view);

    void setViewContent(String viewId, List<Block> blocks);

    void removeView(String viewId);

    void print(String sessionId, String text);

    void send(String sessionId, String text);

    List<Map<String, Object>> sessions();
}
