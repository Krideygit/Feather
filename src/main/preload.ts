import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { FeatherBridge } from '../shared/types';

interface CoreReply {
  ok: boolean;
  result?: unknown;
  error?: string;
}

const bridge: FeatherBridge = {
  call: async (method, params) => {
    const res = (await ipcRenderer.invoke('core:call', method, params ?? {})) as CoreReply;
    if (!res.ok) throw new Error(res.error);
    return res.result;
  },
  onEvent: (callback) => {
    const handler = (_event: unknown, payload: { name: string; data: unknown }): void => callback(payload.name, payload.data);
    ipcRenderer.on('core:event', handler);
    return () => {
      ipcRenderer.removeListener('core:event', handler);
    };
  },
  onFatal: (callback) => {
    ipcRenderer.on('core:fatal', (_event, message: string) => callback(message));
  },

  getVersion: () => ipcRenderer.invoke('app:version'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  bootProgress: (percent, label) => ipcRenderer.send('boot:progress', percent, label),
  bootReady: () => ipcRenderer.send('boot:ready'),

  pickFolder: (defaultPath) => ipcRenderer.invoke('dialog:pickFolder', defaultPath),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
  showItem: (target) => ipcRenderer.invoke('shell:showItem', target),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  platform: process.platform,

  remote: (method, params) => ipcRenderer.invoke('remote:call', method, params ?? {}),
  remoteSend: (method, params) => ipcRenderer.send('remote:send', method, params),
  onRemoteEvent: (callback) => {
    const handler = (_event: unknown, payload: { name: string; data: unknown }): void => callback(payload.name, payload.data);
    ipcRenderer.on('remote:event', handler);
    return () => {
      ipcRenderer.removeListener('remote:event', handler);
    };
  },
  pathForFile: (file) => webUtils.getPathForFile(file),

  onSaveeyeCapture: (callback) => {
    const handler = (_event: unknown, payload: { active: boolean; sources: string[]; transient: boolean }): void => callback(payload);
    ipcRenderer.on('saveeye:capture', handler);
    return () => {
      ipcRenderer.removeListener('saveeye:capture', handler);
    };
  },
  onWindowFocus: (callback) => {
    const handler = (_event: unknown, focused: boolean): void => callback(focused);
    ipcRenderer.on('saveeye:focus', handler);
    return () => {
      ipcRenderer.removeListener('saveeye:focus', handler);
    };
  },
  saveeyeAnswer: (allow) => ipcRenderer.send('saveeye:answer', allow),
  setTitleBar: (color, symbol, zoom) => ipcRenderer.send('window:titleBar', color, symbol, zoom),
  backupCreate: (options) => ipcRenderer.invoke('backup:create', options),
  backupPick: () => ipcRenderer.invoke('backup:pick'),
  backupRestore: (options) => ipcRenderer.invoke('backup:restore', options),
  pluginSample: () => ipcRenderer.invoke('plugins:sample'),
  languagesList: () => ipcRenderer.invoke('languages:list'),
  languagePack: (code) => ipcRenderer.invoke('languages:pack', code),
  languageImport: () => ipcRenderer.invoke('languages:import'),
  languageRemove: (code) => ipcRenderer.invoke('languages:remove', code),
  languageTemplate: (meta) => ipcRenderer.invoke('languages:template', meta),
  languagesFolder: () => ipcRenderer.invoke('languages:folder'),
  logRenderer: (text) => ipcRenderer.send('log:renderer', text),
};

contextBridge.exposeInMainWorld('feather', bridge);
