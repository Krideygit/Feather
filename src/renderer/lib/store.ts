import { useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  AppInfo,
  CoreEvents,
  InstalledRuntime,
  Profile,
  RuntimeProgress,
  Service,
  Settings,
} from '../../shared/types';

export type Route = 'dashboard' | 'database' | 'webserver' | 'packages' | 'server' | 'sql' | 'settings';

export interface AppState {
  route: Route;
  services: Service[];
  installed: InstalledRuntime[];
  progress: Record<string, RuntimeProgress>;
  profiles: Profile[];
  info: AppInfo | null;
  version: string;
  settings: Settings;
  coreError: string | null;
  ready: boolean;
}

let state: AppState = {
  route: 'dashboard',
  services: [],
  installed: [],
  progress: {},
  profiles: [],
  info: null,
  version: '',
  settings: { runInBackground: true, theme: 'feather-dark', themes: [], language: 'de', saveeye: { enabled: false, mode: 'ask', blurOnBlur: false }, database: { history: true, keepDeleted: true, autocomplete: true }, terminal: { suggestions: true, hints: true } },
  coreError: null,
  ready: false,
};

const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getState = (): AppState => state;

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((listener) => listener());
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function upsertService(service: Service): void {
  setState((s) => {
    const i = s.services.findIndex((x) => x.id === service.id);
    const services = [...s.services];
    if (i >= 0) services[i] = service;
    else services.push(service);
    return { services };
  });
}

export const useService = (id: string): Service | undefined => useAppState((s) => s.services.find((x) => x.id === id));
export const useActiveProfile = (): Profile | undefined => useAppState((s) => s.profiles.find((p) => p.active));

type BusEvents = {
  log: { id: string; line: string };
  progress: RuntimeProgress;
  exportProgress: CoreEvents['db.export.progress'];
};

const handlers = new Map<keyof BusEvents, Set<(data: never) => void>>();

export function emit<K extends keyof BusEvents>(name: K, data: BusEvents[K]): void {
  handlers.get(name)?.forEach((fn) => (fn as (d: BusEvents[K]) => void)(data));
}

export function useBus<K extends keyof BusEvents>(name: K, handler: (data: BusEvents[K]) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const fn = (data: BusEvents[K]): void => latest.current(data);
    let set = handlers.get(name);
    if (!set) handlers.set(name, (set = new Set()));
    set.add(fn as (data: never) => void);
    return () => {
      set.delete(fn as (data: never) => void);
    };
  }, [name]);
}
