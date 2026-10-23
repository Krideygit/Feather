package dev.feather.rainbow;

import feather.api.Block;
import feather.api.ButtonSpec;
import feather.api.FeatherPlugin;
import feather.api.Locations;
import feather.api.PluginAPIManager;
import feather.api.ViewSpec;
import java.util.List;

public final class RainbowIcons implements FeatherPlugin {
    private static final String STYLE_ID = "rainbow-icons";
    private static final String CSS = """
            @keyframes feather-rainbow {
              0% { color: hsl(0 95% 62%); }
              17% { color: hsl(45 100% 58%); }
              33% { color: hsl(110 80% 52%); }
              50% { color: hsl(175 85% 52%); }
              67% { color: hsl(225 95% 66%); }
              83% { color: hsl(290 90% 64%); }
              100% { color: hsl(360 95% 62%); }
            }
            [data-feather-area="server"] svg.lucide,
            [data-feather-area="server"] [data-feather-icon] {
              animation: feather-rainbow 3.2s linear infinite;
            }
            [data-feather-area="server"] svg.lucide:nth-of-type(2n) { animation-delay: -0.7s; }
            [data-feather-area="server"] svg.lucide:nth-of-type(3n) { animation-delay: -1.4s; }
            [data-feather-area="server"] svg.lucide:nth-of-type(5n) { animation-delay: -2.1s; }
            """;

    private PluginAPIManager api;
    private boolean enabled;

    @Override
    public void onEnable(PluginAPIManager api) {
        this.api = api;
        this.enabled = !"off".equals(api.storage().get("state", "on"));
        api.terminal().addView(ViewSpec.of("rainbow").title("Regenbogen").icon("🌈").onAction(event -> toggle()));
        refresh();
    }

    @Override
    public void onDisable() {
        api.ui().removeCss(STYLE_ID);
    }

    private void toggle() {
        enabled = !enabled;
        api.storage().put("state", enabled ? "on" : "off");
        refresh();
        api.ui().toast(enabled ? "Regenbogen-Icons sind an." : "Regenbogen-Icons sind aus.", "success");
    }

    private void refresh() {
        if (enabled) api.ui().injectCss(STYLE_ID, CSS);
        else api.ui().removeCss(STYLE_ID);

        api.ui().addButton(ButtonSpec.of("toggle")
                .label(enabled ? "Regenbogen an" : "Regenbogen aus")
                .icon("🌈")
                .tooltip("Regenbogen-Icons im Terminal-Bereich ein- oder ausschalten")
                .location(Locations.SERVER_TABBAR)
                .onClick(event -> toggle()));

        api.terminal().setViewContent("rainbow", List.of(
                Block.heading("Rainbow Icons"),
                Block.text("Alle Icons im Terminal-Bereich leuchten in Regenbogenfarben, auch die Ordner im Dateibaum."),
                Block.divider(),
                Block.text(enabled ? "Status: eingeschaltet" : "Status: ausgeschaltet"),
                Block.button("toggle", enabled ? "Ausschalten" : "Einschalten")));
    }
}
