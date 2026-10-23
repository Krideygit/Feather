import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { t } from './i18n';

export interface FeatherTray {
  setRunning(count: number): void;
  refresh(): void;
  balloon(title: string, content: string): void;
  destroy(): void;
}

interface TrayHandlers {
  onOpen: () => void;
  onStopAll: () => void;
  onQuit: () => void;
}

export function createTray({ onOpen, onStopAll, onQuit }: TrayHandlers): FeatherTray {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'build', 'icon.png')).resize({ width: 32, height: 32 });
  const tray = new Tray(icon);
  let running = 0;

  const refresh = (): void => {
    const label = `${running} ${t(running === 1 ? 'Service läuft' : 'Services laufen')}`;
    tray.setToolTip(running ? `Feather – ${label}` : 'Feather');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('Feather öffnen'), click: onOpen },
        { type: 'separator' },
        { label: running ? label : t('Keine Services aktiv'), enabled: false },
        { label: t('Alle Services stoppen'), enabled: running > 0, click: onStopAll },
        { type: 'separator' },
        { label: t('Feather beenden'), click: onQuit },
      ]),
    );
  };

  tray.on('click', onOpen);
  tray.on('double-click', onOpen);
  refresh();

  return {
    refresh,
    setRunning(count) {
      if (count === running) return;
      running = count;
      refresh();
    },
    balloon(title, content) {
      if (process.platform === 'win32') tray.displayBalloon({ title, content, iconType: 'info', noSound: true });
    },
    destroy: () => tray.destroy(),
  };
}
