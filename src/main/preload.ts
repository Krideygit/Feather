import { contextBridge, ipcRenderer } from 'electron';
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
  platform: process.platform,
};

contextBridge.exposeInMainWorld('feather', bridge);
