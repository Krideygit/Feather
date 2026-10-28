import { useSyncExternalStore } from 'react';

export interface Shortcut {
  id: string;
  label: string;
  command: string;
  icon: string;
  confirm: boolean;
  scope: 'all' | 'host';
  host: string;
}

export interface ShortcutTemplate {
  label: string;
  command: string;
  icon: string;
  confirm: boolean;
}

export const SHORTCUT_TEMPLATES: ShortcutTemplate[] = [
  { label: 'Minecraft starten', command: 'screen -dmS minecraft ./start.sh', icon: 'pickaxe|#34d399', confirm: false },
  { label: 'Minecraft stoppen', command: 'screen -S minecraft -p 0 -X stuff "stop$(printf \\\\r)"', icon: 'pickaxe|#f87171', confirm: true },
  { label: 'Minecraft Konsole', command: 'screen -r minecraft', icon: 'terminal|#38bdf8', confirm: false },
  { label: 'Dienst neu starten', command: 'sudo systemctl restart DIENST', icon: 'zap|#fbbf24', confirm: true },
  { label: 'Dienst Status', command: 'systemctl status DIENST --no-pager', icon: 'gauge|#38bdf8', confirm: false },
  { label: 'Protokoll live', command: 'journalctl -f', icon: 'book|#a78bfa', confirm: false },
  { label: 'Speicherplatz', command: 'df -h', icon: 'drive|#a3a3a3', confirm: false },
  { label: 'Auslastung', command: 'htop', icon: 'cpu|#fb923c', confirm: false },
];

const KEY = 'feather.shortcuts';
const listeners = new Set<() => void>();
let cache: Shortcut[] | null = null;

function parse(): Shortcut[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is Partial<Shortcut> => !!s && typeof s === 'object')
      .map((s) => ({
        id: typeof s.id === 'string' ? s.id : '',
        label: typeof s.label === 'string' ? s.label : '',
        command: typeof s.command === 'string' ? s.command : '',
        icon: typeof s.icon === 'string' ? s.icon : 'terminal|#38bdf8',
        confirm: s.confirm === true,
        scope: s.scope === 'host' ? ('host' as const) : ('all' as const),
        host: typeof s.host === 'string' ? s.host : '',
      }))
      .filter((s) => s.id && s.command);
  } catch {
    return [];
  }
}

function all(): Shortcut[] {
  if (!cache) cache = parse();
  return cache;
}

function commit(next: Shortcut[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  cache = next;
  listeners.forEach((l) => l());
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useShortcuts(host: string): Shortcut[] {
  const list = useSyncExternalStore(subscribe, all);
  return list.filter((s) => s.scope === 'all' || s.host === host);
}

export function saveShortcut(item: Omit<Shortcut, 'id'> & { id?: string }): boolean {
  const list = all();
  if (item.id && list.some((s) => s.id === item.id)) return commit(list.map((s) => (s.id === item.id ? { ...item, id: s.id } : s)));
  return commit([...list, { ...item, id: `sc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }]);
}

export function deleteShortcut(id: string): void {
  commit(all().filter((s) => s.id !== id));
}

export function moveShortcut(id: string, direction: -1 | 1): void {
  const list = [...all()];
  const index = list.findIndex((s) => s.id === id);
  if (index === -1) return;
  const visible = list[index];
  if (!visible) return;
  let target = index + direction;
  while (target >= 0 && target < list.length) {
    const other = list[target];
    if (other && (other.scope === 'all' || other.host === visible.host || visible.scope === 'all')) break;
    target += direction;
  }
  if (target < 0 || target >= list.length) return;
  const swap = list[target];
  if (!swap) return;
  list[index] = swap;
  list[target] = visible;
  commit(list);
}

export function commandPayload(command: string): string {
  const lines = command.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.length > 0);
  return `\u0015${lines.join('\r')}\r`;
}
