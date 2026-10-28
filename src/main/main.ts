import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, shell, type OpenDialogOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { FileFilter, Service, Settings } from '../shared/types';
import { createBackup, inspectBackup, restoreBackup } from './backup';
import * as languages from './languages';
import * as cmdhistory from './cmdhistory';
import * as sqlhistory from './sqlhistory';
import { cleanMeta } from '../shared/langpack';
import { Core } from './core';
import { registerRemote } from './remote/ipc';
import * as settings from './settings';
import { t } from './i18n';
import { Saveeye } from './saveeye';
import { createSplash, type Splash } from './splash';
import { createTray, type FeatherTray } from './tray';

const BG = '#171717';
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');
const MIN_SPLASH_MS = process.env.FEATHER_SPLASH_SHOT ? 3500 : 1400;
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const isWeb = (url: string): boolean => /^https?:\/\//.test(url);

const core = new Core();
const saveeye = new Saveeye(
  () => win,
  (notice) => send('saveeye:capture', notice),
);
let remote: { shutdown: () => void } | null = null;
const statuses = new Map<string, string>();
let win: BrowserWindow | null = null;
let splash: Splash | null = null;
let tray: FeatherTray | null = null;
let quitting = false;
let announcedBackground = false;
let resolveBoot: () => void = () => {};
const uiReady = new Promise<void>((resolve) => {
  resolveBoot = resolve;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => showWindow());

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: BG,
    title: 'Feather',
    ...(fs.existsSync(ICON) ? { icon: ICON } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BG, symbolColor: '#a3a3a3', height: 40 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win = window;
  window.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`[renderer] Prozess beendet: ${details.reason} (Code ${details.exitCode})`);
    if (details.reason !== 'clean-exit' && !window.isDestroyed()) window.webContents.reload();
  });
  window.webContents.on('unresponsive', () => writeLog('[renderer] reagiert nicht'));
  window.webContents.on('responsive', () => writeLog('[renderer] reagiert wieder'));
  window.webContents.on('did-fail-load', (_event, code, description, url) => writeLog(`[renderer] Laden fehlgeschlagen: ${description} (${code}) ${url}`));
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') writeLog(`[renderer] ${event.message}`);
  });

  void window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F12') window.webContents.toggleDevTools();
      if (input.control && input.key.toLowerCase() === 'r') window.webContents.reload();
    });
  }

  window.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'PrintScreen') saveeye.trigger('Screenshot-Taste');
    else if (input.meta && input.shift) saveeye.trigger('Windows-Screenshot');
  });
  window.on('blur', () => send('saveeye:focus', false));
  window.on('focus', () => send('saveeye:focus', true));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWeb(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (isWeb(url)) void shell.openExternal(url);
    }
  });

  window.on('close', (event) => {
    if (quitting || !tray || !settings.get().runInBackground) return;
    event.preventDefault();
    window.hide();
    if (!announcedBackground) {
      announcedBackground = true;
      tray.balloon(t('Feather läuft im Hintergrund'), t('Deine Services laufen weiter. Über das Symbol im Infobereich öffnest oder beendest du Feather.'));
    }
  });
  window.on('closed', () => {
    win = null;
  });
  return window;
}

function writeLog(line: string): void {
  try {
    const file = path.join(app.getPath('userData'), 'feather.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.rmSync(file, { force: true });
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}
`);
  } catch {
    return;
  }
}

function showWindow(): void {
  const window = win ?? createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const openDialog = (options: OpenDialogOptions) => (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options));

function registerIpc(): void {
  ipcMain.handle('core:call', async (_event, method: string, params: object) => {
    try {
      return { ok: true, result: await core.call(method, params) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => {
    const next = settings.set(patch ?? {});
    languages.clearCache();
    saveeye.configure(next.saveeye);
    tray?.refresh();
    return next;
  });
  ipcMain.on('saveeye:answer', (_event, allow: unknown) => saveeye.answer(allow === true));
  ipcMain.on('window:titleBar', (_event, color: unknown, symbol: unknown, zoom: unknown) => {
    if (win && !win.isDestroyed() && typeof color === 'string' && typeof symbol === 'string' && /^#[0-9a-f]{6}$/i.test(color) && /^#[0-9a-f]{6}$/i.test(symbol)) {
      const factor = typeof zoom === 'number' && Number.isFinite(zoom) ? Math.max(0.8, Math.min(1.3, zoom)) : 1;
      win.webContents.setZoomFactor(factor);
      win.setTitleBarOverlay({ color, symbolColor: symbol, height: Math.round(40 * factor) });
      win.setBackgroundColor(color);
    }
  });

  ipcMain.handle('backup:create', async (_event, opts: { password?: string; includeData?: boolean }) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const options = {
      title: 'Sicherung speichern',
      defaultPath: path.join(app.getPath('documents'), `feather-sicherung-${stamp}.featherbackup`),
      filters: [{ name: 'Feather-Sicherung', extensions: ['featherbackup'] }],
    };
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (res.canceled || !res.filePath) return { ok: true, result: null };
    try {
      return { ok: true, result: await createBackup(core, { file: res.filePath, password: String(opts?.password ?? ''), includeData: opts?.includeData !== false }) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  ipcMain.handle('backup:pick', async () => {
    const res = await openDialog({ title: 'Sicherung auswählen', filters: [{ name: 'Feather-Sicherung', extensions: ['featherbackup'] }], properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) return { ok: true, result: null };
    try {
      return { ok: true, result: { file: res.filePaths[0], info: await inspectBackup(res.filePaths[0]) } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  ipcMain.handle('backup:restore', async (_event, opts: { file?: string; password?: string }) => {
    try {
      return { ok: true, result: await restoreBackup(core, { file: String(opts?.file ?? ''), password: String(opts?.password ?? '') }) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  const reply = async <T>(work: () => T | Promise<T>): Promise<{ ok: boolean; result?: T; error?: string }> => {
    try {
      return { ok: true, result: await work() };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };
  ipcMain.on('log:renderer', (_event, text: unknown) => writeLog(`[renderer] ${String(text).slice(0, 4000)}`));
  ipcMain.handle('languages:list', () => reply(() => languages.list()));
  ipcMain.handle('languages:pack', (_event, code: unknown) => reply(() => languages.pack(String(code ?? ''))));
  ipcMain.handle('languages:folder', () => {
    fs.mkdirSync(languages.dir(), { recursive: true });
    return languages.dir();
  });
  ipcMain.handle('languages:import', async () => {
    const res = await openDialog({ title: 'Sprachdatei auswählen', filters: [{ name: 'Feather-Sprachdatei', extensions: ['featherlang', 'json'] }], properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) return { ok: true, result: null };
    const source = res.filePaths[0];
    return reply(() => {
      const out = languages.importFile(source);
      tray?.refresh();
      return out;
    });
  });
  ipcMain.handle('languages:remove', (_event, code: unknown) =>
    reply(() => {
      languages.remove(String(code ?? ''));
      if (settings.get().language === code) settings.set({ language: 'en' });
      tray?.refresh();
      return null;
    }),
  );
  ipcMain.handle('languages:template', async (_event, meta: { code?: unknown; name?: unknown; author?: unknown }) => {
    try {
      cleanMeta(meta ?? {});
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    const code = String(meta.code).trim().toLowerCase();
    const options = {
      title: 'Übersetzungsvorlage speichern',
      defaultPath: path.join(app.getPath('documents'), `feather-${code || 'sprache'}.featherlang`),
      filters: [{ name: 'Feather-Sprachdatei', extensions: ['featherlang'] }],
    };
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (res.canceled || !res.filePath) return { ok: true, result: null };
    const file = res.filePath;
    return reply(() => ({ file, total: languages.writeTemplate(file, meta) }));
  });
  ipcMain.handle('plugins:sample', () => {
    const candidates = [path.join(process.resourcesPath, 'plugins', 'rainbow-icons.jar'), path.join(__dirname, '..', '..', 'plugins-dist', 'rainbow-icons.jar')];
    return candidates.find((c) => fs.existsSync(c)) ?? null;
  });

  ipcMain.on('boot:progress', (_event, percent: number, label: string) => {
    splash?.progress(Math.max(0, Math.min(99, Number(percent) || 0)), String(label || ''));
  });
  ipcMain.on('boot:ready', () => resolveBoot());

  ipcMain.handle('dialog:pickFolder', async (_event, defaultPath?: string) => {
    const res = await openDialog({
      title: 'Ordner auswählen',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_event, opts: { title: string; defaultName: string; filters: FileFilter[] }) => {
    const options = {
      title: opts.title,
      defaultPath: path.join(app.getPath('documents'), opts.defaultName || 'Feather'),
      filters: opts.filters,
    };
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    return res.canceled ? null : res.filePath;
  });

  ipcMain.handle('dialog:openFile', async (_event, opts: { title: string; filters: FileFilter[] }) => {
    const res = await openDialog({ title: opts.title, filters: opts.filters, properties: ['openFile'] });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:pickImage', async () => {
    const res = await openDialog({
      title: 'Profilbild auswählen',
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      properties: ['openFile'],
    });
    if (res.canceled) return null;
    const image = nativeImage.createFromPath(res.filePaths[0]);
    if (image.isEmpty()) return { error: 'Das Bild konnte nicht gelesen werden.' };
    const { width, height } = image.getSize();
    const side = Math.min(width, height);
    const square = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
    return { dataUrl: square.resize({ width: 256, height: 256, quality: 'best' }).toDataURL() };
  });

  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    if (typeof url === 'string' && isWeb(url)) await shell.openExternal(url);
  });

  ipcMain.handle('shell:openPath', async (_event, target: unknown) => {
    if (typeof target !== 'string' || !fs.existsSync(target)) return 'Pfad existiert nicht.';
    return shell.openPath(target);
  });

  ipcMain.handle('shell:showItem', (_event, target: unknown) => {
    if (typeof target === 'string' && fs.existsSync(target)) shell.showItemInFolder(target);
  });

  ipcMain.handle('clipboard:write', (_event, text: unknown) => clipboard.writeText(String(text)));
  ipcMain.handle('clipboard:read', () => clipboard.readText());

  remote = registerRemote({
    send,
    pickLocal: async (kind) => {
      const res = await openDialog({
        title: kind === 'folder' ? 'Ordner zum Hochladen auswählen' : 'Dateien zum Hochladen auswählen',
        properties: kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
      });
      return res.canceled ? [] : res.filePaths;
    },
  });
}

function trackStatus(name: string, data: unknown): void {
  if (name === 'service.status') statuses.set((data as Service).id, (data as Service).status);
  else if (name === 'service.removed') statuses.delete((data as { id: string }).id);
  else if (name === 'profile.changed') statuses.clear();
  else return;
  const running = [...statuses.values()].filter((s) => s === 'running' || s === 'starting').length;
  tray?.setRunning(running);
}

function startCore(): void {
  core.on('event', (name, data) => {
    trackStatus(name, data);
    send('core:event', { name, data });
  });
  core.on('fatal', (message) => {
    send('core:fatal', message);
    dialog.showErrorBox('Feather', message);
  });
  core.on('exit', (code) => {
    if (!quitting) send('core:fatal', `Der Java-Core wurde unerwartet beendet (Code ${code}).`);
  });
  try {
    core.start();
  } catch (err) {
    dialog.showErrorBox('Feather', (err as Error).message);
  }
}

async function stopAllServices(): Promise<void> {
  const services = await core.call<Service[]>('service.list');
  const running = services.filter((s) => s.status === 'running' || s.status === 'starting');
  await Promise.all(running.map((s) => core.call('service.stop', { id: s.id })));
}

async function boot(): Promise<void> {
  const started = Date.now();
  Menu.setApplicationMenu(null);
  registerIpc();

  const loading = createSplash(app.getVersion());
  splash = loading;
  loading.progress(8, 'Starte Feather …');
  const splashShot = process.env.FEATHER_SPLASH_SHOT;
  if (splashShot) {
    setTimeout(() => {
      loading.window.webContents
        .capturePage()
        .then((img) => fs.writeFileSync(splashShot, img.toPNG()))
        .catch((err: Error) => console.error('splash screenshot failed:', err.message));
    }, 2200);
  }

  startCore();
  loading.progress(25, 'Starte Java-Core …');
  await Promise.race([core.ready, wait(20000)]);
  loading.progress(50, 'Core verbunden');

  const window = createWindow();
  saveeye.configure(settings.get().saveeye);
  if (process.env.FEATHER_SCREENSHOT) captureAndExit(window, process.env.FEATHER_SCREENSHOT);
  loading.progress(62, 'Oberfläche wird geladen …');

  await Promise.race([uiReady, wait(25000)]);
  const remaining = MIN_SPLASH_MS - (Date.now() - started);
  if (remaining > 0) await wait(remaining);
  loading.progress(100, 'Bereit');
  await wait(450);

  tray = createTray({
    onOpen: showWindow,
    onStopAll: () => {
      stopAllServices().catch((err: Error) => console.error(err.message));
    },
    onQuit: () => app.quit(),
  });
  if (win && !win.isDestroyed()) win.show();
  loading.close();
  splash = null;
}

void app.whenReady().then(boot);

app.on('window-all-closed', () => {
  if (!tray || !settings.get().runInBackground) app.quit();
});

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  saveeye.stop();
  remote?.shutdown();
  void Promise.all([sqlhistory.flush(), cmdhistory.flush()]).then(() => core.shutdown()).finally(() => {
    tray?.destroy();
    app.quit();
  });
});

interface CaptureStep {
  js?: string;
  wait?: number;
  shot?: string;
  log?: boolean;
  close?: boolean;
  connect?: [string, string];
  wheel?: [number, number, number];
}

function captureAndExit(window: BrowserWindow, file: string): void {
  window.webContents.once('did-finish-load', async () => {
    await wait(Number(process.env.FEATHER_WAIT || 1500));
    try {
      window.show();
      await runCapture(window, file);
    } catch (err) {
      console.error('screenshot run failed:', (err as Error).message);
    }
    app.quit();
  });
}

async function dragBetween(window: BrowserWindow, from: string, to: string): Promise<void> {
  const center = (selector: string): Promise<[number, number]> =>
    window.webContents.executeJavaScript(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`,
    ) as Promise<[number, number]>;
  const [x1, y1] = await center(from);
  const [x2, y2] = await center(to);
  const wc = window.webContents;
  wc.sendInputEvent({ type: 'mouseMove', x: x1, y: y1 });
  wc.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 12; i++) {
    wc.sendInputEvent({ type: 'mouseMove', x: Math.round(x1 + ((x2 - x1) * i) / 12), y: Math.round(y1 + ((y2 - y1) * i) / 12) });
    await wait(15);
  }
  wc.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 });
}

async function runCapture(window: BrowserWindow, target: string): Promise<void> {
  const actions = process.env.FEATHER_ACTIONS;
  if (actions) {
    const steps = JSON.parse(fs.readFileSync(actions, 'utf8').replace(/^﻿/, '')) as CaptureStep[];
    let shots = 0;
    for (const step of steps) {
      if (step.js) {
        const out: unknown = await window.webContents.executeJavaScript(step.js);
        if (step.log) console.log('[step]', typeof out === 'string' ? out : JSON.stringify(out));
      }
      if (step.connect) await dragBetween(window, step.connect[0], step.connect[1]);
      if (step.wheel) {
        const [x, y, deltaY] = step.wheel;
        window.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY, canScroll: true });
      }
      if (step.close) {
        window.close();
        await wait(300);
        console.log('[step] after close: visible =', window.isVisible(), '| destroyed =', window.isDestroyed());
        showWindow();
        console.log('[step] after reopen: visible =', win?.isVisible());
      }
      await wait(step.wait ?? 400);
      if (step.shot) {
        fs.writeFileSync(step.shot, (await window.webContents.capturePage()).toPNG());
        shots++;
      }
    }
    if (shots) return;
  }
  fs.writeFileSync(target, (await window.webContents.capturePage()).toPNG());
}
