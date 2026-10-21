import { BrowserWindow } from 'electron';
import path from 'node:path';

export interface Splash {
  window: BrowserWindow;
  progress(percent: number, label: string): void;
  close(): void;
}

export function createSplash(version: string): Splash {
  const win = new BrowserWindow({
    width: 460,
    height: 320,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#171717',
    title: 'Feather',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const loaded = win.loadFile(path.join(__dirname, 'splash.html')).then(() => {
    void win.webContents.executeJavaScript(`document.getElementById('version').textContent = ${JSON.stringify(`v${version}`)}`);
    win.show();
  });

  return {
    window: win,
    progress(percent, label) {
      if (win.isDestroyed()) return;
      void loaded.then(() => {
        if (win.isDestroyed()) return;
        void win.webContents.executeJavaScript(
          `document.getElementById('fill').style.width = ${Number(percent)} + '%';` +
            `document.getElementById('label').textContent = ${JSON.stringify(label)};`,
        );
      });
    },
    close() {
      if (!win.isDestroyed()) win.close();
    },
  };
}
