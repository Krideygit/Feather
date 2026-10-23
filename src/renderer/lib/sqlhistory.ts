import type { HistoryEntry, HistoryScope, HistoryStats } from '../../shared/sql';
import { callRemote } from './remote';

type Key = Record<string, string | null>;

export const rowSig = (key: Key): string => JSON.stringify(Object.keys(key).sort().map((k) => [k, key[k]]));
export const noteKey = (key: Key, column: string): string => `${rowSig(key)}\u0001${column}`;

export const loadHistory = (scope: HistoryScope): Promise<HistoryEntry[]> => callRemote<HistoryEntry[]>('sqlhistory.table', { ...scope });
export const addHistory = async (entries: Omit<HistoryEntry, 'id' | 'ts'>[]): Promise<void> => void (await callRemote('sqlhistory.add', { entries }));
export const markUndone = async (ids: string[]): Promise<void> => void (await callRemote('sqlhistory.undone', { ids }));
export const removeHistory = async (ids: string[]): Promise<void> => void (await callRemote('sqlhistory.remove', { ids }));
export const clearHistory = async (scope?: HistoryScope): Promise<number> => (await callRemote<{ removed: number }>('sqlhistory.clear', scope ? { ...scope } : {})).removed;
export const historyStats = (): Promise<HistoryStats> => callRemote<HistoryStats>('sqlhistory.stats');

export function notesByCell(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    if (e.kind !== 'update' || e.undone) continue;
    const k = noteKey(e.key, e.column);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  for (const list of map.values()) list.sort((a, b) => b.ts - a.ts);
  return map;
}

export const formatTime = (ts: number): string => new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
