import { useEffect, useSyncExternalStore } from 'react';
import { toast } from '../components/Toast';
import { call } from './api';
import { getRemote, onSessionEvent, sendToTerminal, terminalFor } from './remote';

export interface PluginInfoView {
  id: string;
  name: string;
  author: string;
  version: string;
  main: string;
  description: string;
  enabled: boolean;
  running: boolean;
  error: string | null;
  file: string;
}

export interface PluginButton {
  id: string;
  label: string;
  icon: string;
  tooltip: string;
  location: string;
}

export interface PluginBlock {
  type: 'heading' | 'text' | 'code' | 'button' | 'divider';
  text?: string;
  id?: string;
  label?: string;
}

export interface PluginViewSpec {
  id: string;
  title: string;
  icon: string;
  blocks: PluginBlock[];
}

export interface Contribution {
  plugin: string;
  name: string;
  buttons: PluginButton[];
  css: { id: string; css: string }[];
  views: PluginViewSpec[];
}

interface PluginState {
  plugins: PluginInfoView[];
  contributions: Contribution[];
}

let state: PluginState = { plugins: [], contributions: [] };
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function set(patch: Partial<PluginState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const usePlugins = <T>(selector: (s: PluginState) => T): T => useSyncExternalStore(subscribe, () => selector(state));

export async function refreshPlugins(): Promise<void> {
  const [plugins, contributions] = await Promise.all([call<PluginInfoView[]>('plugin.list'), call<Contribution[]>('plugin.contributions')]);
  set({ plugins, contributions });
}

export const installPlugin = (file: string): Promise<PluginInfoView> => call<PluginInfoView>('plugin.install', { file });
export const setPluginEnabled = (id: string, enabled: boolean): Promise<PluginInfoView> => call<PluginInfoView>('plugin.setEnabled', { id, enabled });
export const removePlugin = (id: string): Promise<unknown> => call('plugin.remove', { id });

export function pluginEvent(name: string, data: Record<string, unknown>): void {
  void call('plugin.event', { name, data }).catch(() => undefined);
}

function activeSession(requested: string): string | null {
  const remote = getRemote();
  if (requested && remote.sessions.some((s) => s.sid === requested)) return requested;
  if (remote.sessions.some((s) => s.sid === remote.active)) return remote.active;
  return null;
}

interface PluginAction {
  plugin: string;
  action: string;
  message?: string;
  kind?: 'info' | 'success' | 'error';
  session?: string;
  text?: string;
}

function runAction(a: PluginAction): void {
  if (a.action === 'toast') {
    toast(a.message ?? '', a.kind === 'error' || a.kind === 'success' ? a.kind : 'info');
    return;
  }
  const sid = activeSession(a.session ?? '');
  if (!sid) return;
  if (a.action === 'terminal.print') terminalFor(sid).term.write(String(a.text ?? '').replace(/\r?\n/g, '\r\n'));
  else if (a.action === 'terminal.send') sendToTerminal(sid, String(a.text ?? ''));
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function listenToPlugins(): () => void {
  void refreshPlugins().catch(() => undefined);
  const stopSessions = onSessionEvent((name, data) => pluginEvent(name, data));
  const stop = window.feather.onEvent((name, data) => {
    if (name === 'plugin.changed') {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshPlugins().catch(() => undefined), 60);
    } else if (name === 'plugin.action') {
      runAction(data as PluginAction);
    }
  });
  return () => {
    stop();
    stopSessions();
    if (timer) clearTimeout(timer);
  };
}

export function usePluginStyles(): void {
  const contributions = usePlugins((s) => s.contributions);
  useEffect(() => {
    const wanted = new Map<string, string>();
    for (const c of contributions) for (const css of c.css) wanted.set(`${c.plugin}:${css.id}`, css.css);
    const existing = new Map<string, HTMLStyleElement>();
    document.querySelectorAll<HTMLStyleElement>('style[data-plugin-style]').forEach((el) => existing.set(el.dataset.pluginStyle ?? '', el));
    for (const [key, el] of existing) if (!wanted.has(key)) el.remove();
    for (const [key, css] of wanted) {
      let el = existing.get(key);
      if (!el) {
        el = document.createElement('style');
        el.dataset.pluginStyle = key;
        document.head.appendChild(el);
      }
      if (el.textContent !== css) el.textContent = css;
    }
  }, [contributions]);
}
