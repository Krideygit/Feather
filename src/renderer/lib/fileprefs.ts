import { useCallback, useEffect, useRef, useState } from 'react';

export interface FilePrefs {
  pins: string[];
  hidden: string[];
  icons: Record<string, string>;
  kinds: Record<string, 'dir' | 'file'>;
  onlyPinned: boolean;
}

const EMPTY: FilePrefs = { pins: [], hidden: [], icons: {}, kinds: {}, onlyPinned: false };
const key = (host: string): string => `feather.files.${host}`;

function read(host: string): FilePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(key(host)) ?? 'null') as Partial<FilePrefs> | null;
    if (!raw) return EMPTY;
    return {
      pins: Array.isArray(raw.pins) ? raw.pins.filter((p): p is string => typeof p === 'string') : [],
      hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((p): p is string => typeof p === 'string') : [],
      icons: raw.icons && typeof raw.icons === 'object' ? Object.fromEntries(Object.entries(raw.icons).filter(([, v]) => typeof v === 'string')) : {},
      kinds: raw.kinds && typeof raw.kinds === 'object' ? Object.fromEntries(Object.entries(raw.kinds).filter(([, v]) => v === 'dir' || v === 'file')) as Record<string, 'dir' | 'file'> : {},
      onlyPinned: raw.onlyPinned === true,
    };
  } catch {
    return EMPTY;
  }
}

function write(host: string, prefs: FilePrefs): boolean {
  try {
    localStorage.setItem(key(host), JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

const inside = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder === '/' ? '' : folder}/`);

export interface FilePrefsApi {
  prefs: FilePrefs;
  isPinned: (path: string) => boolean;
  isHidden: (path: string) => boolean;
  hasPinBelow: (path: string) => boolean;
  togglePins: (items: { path: string; dir: boolean }[]) => void;
  setHidden: (paths: string[], hidden: boolean) => void;
  clearHidden: () => void;
  setIcon: (path: string, icon: string | null) => boolean;
  setOnlyPinned: (value: boolean) => void;
  remap: (from: string, to: string) => void;
  forget: (paths: string[]) => void;
}

export function useFilePrefs(host: string): FilePrefsApi {
  const [prefs, setPrefs] = useState<FilePrefs>(() => read(host));
  const latest = useRef(prefs);
  latest.current = prefs;

  useEffect(() => {
    const loaded = read(host);
    latest.current = loaded;
    setPrefs(loaded);
  }, [host]);

  const update = useCallback(
    (change: (current: FilePrefs) => FilePrefs): boolean => {
      const next = change(latest.current);
      if (!write(host, next)) return false;
      latest.current = next;
      setPrefs(next);
      return true;
    },
    [host],
  );

  return {
    prefs,
    isPinned: (path) => prefs.pins.includes(path),
    isHidden: (path) => prefs.hidden.includes(path),
    hasPinBelow: (path) => prefs.pins.some((p) => p !== path && inside(p, path)),
    togglePins: (items) =>
      void update((c) => {
        const paths = items.map((i) => i.path);
        const allPinned = paths.every((p) => c.pins.includes(p));
        const kinds = { ...c.kinds };
        if (allPinned) for (const p of paths) delete kinds[p];
        else for (const i of items) kinds[i.path] = i.dir ? 'dir' : 'file';
        return { ...c, kinds, pins: allPinned ? c.pins.filter((p) => !paths.includes(p)) : [...c.pins, ...paths.filter((p) => !c.pins.includes(p))] };
      }),
    setHidden: (paths, hidden) => void update((c) => ({ ...c, hidden: hidden ? [...c.hidden, ...paths.filter((p) => !c.hidden.includes(p))] : c.hidden.filter((p) => !paths.includes(p)) })),
    clearHidden: () => void update((c) => ({ ...c, hidden: [] })),
    setIcon: (path, icon) =>
      update((c) => {
        const icons = { ...c.icons };
        if (icon) icons[path] = icon;
        else delete icons[path];
        return { ...c, icons };
      }),
    setOnlyPinned: (value) => void update((c) => ({ ...c, onlyPinned: value })),
    remap: (from, to) => {
      const move = (p: string): string => (inside(p, from) ? to + p.slice(from.length) : p);
      void update((c) => ({ ...c, pins: c.pins.map(move), hidden: c.hidden.map(move), icons: Object.fromEntries(Object.entries(c.icons).map(([p, v]) => [move(p), v])), kinds: Object.fromEntries(Object.entries(c.kinds).map(([p, v]) => [move(p), v])) }));
    },
    forget: (paths) =>
      void update((c) => {
        const gone = (p: string): boolean => paths.some((x) => inside(p, x));
        return { ...c, pins: c.pins.filter((p) => !gone(p)), hidden: c.hidden.filter((p) => !gone(p)), icons: Object.fromEntries(Object.entries(c.icons).filter(([p]) => !gone(p))), kinds: Object.fromEntries(Object.entries(c.kinds).filter(([p]) => !gone(p))) };
      }),
  };
}
