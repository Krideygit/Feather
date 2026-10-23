import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEntry, HistoryScope, HistoryStats } from '../shared/sql';
import { seal, unseal } from './remote/vault';

const MAX_ENTRIES = 20000;
const MAX_PER_TABLE = 3000;
const MAX_VALUE = 4000;
const SAVE_DELAY = 400;

interface FileShape {
  version: 1;
  sealed: boolean;
  data: string;
}

const file = (): string => path.join(app.getPath('userData'), 'sql-history.json');

let cache: HistoryEntry[] | null = null;
let timer: NodeJS.Timeout | null = null;
let writing: Promise<void> = Promise.resolve();

const cut = (value: string | null): string | null => (value === null ? null : value.length > MAX_VALUE ? value.slice(0, MAX_VALUE) : value);

function cleanRecord(row: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!row || typeof row !== 'object') return out;
  for (const [k, v] of Object.entries(row as Record<string, unknown>).slice(0, 200)) out[k.slice(0, 64)] = v === null ? null : cut(String(v));
  return out;
}

function clean(raw: Partial<HistoryEntry> | null | undefined): HistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.server !== 'string' || typeof raw.db !== 'string' || typeof raw.table !== 'string' || !raw.server || !raw.db || !raw.table) return null;
  const kind = raw.kind === 'delete' ? 'delete' : raw.kind === 'update' ? 'update' : null;
  if (!kind) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    ts: typeof raw.ts === 'number' ? raw.ts : Date.now(),
    server: raw.server.slice(0, 300),
    db: raw.db.slice(0, 64),
    table: raw.table.slice(0, 64),
    kind,
    key: cleanRecord(raw.key),
    column: typeof raw.column === 'string' ? raw.column.slice(0, 64) : '',
    old: raw.old === null || raw.old === undefined ? null : cut(String(raw.old)),
    value: raw.value === null || raw.value === undefined ? null : cut(String(raw.value)),
    row: kind === 'delete' ? cleanRecord(raw.row) : null,
    undone: typeof raw.undone === 'number' ? raw.undone : undefined,
  };
}

async function load(): Promise<HistoryEntry[]> {
  if (cache) return cache;
  let entries: HistoryEntry[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as FileShape;
    const text = raw.sealed ? await unseal(raw.data) : raw.data;
    const parsed = JSON.parse(text || '[]') as Partial<HistoryEntry>[];
    entries = Array.isArray(parsed) ? parsed.map(clean).filter((e): e is HistoryEntry => e !== null) : [];
  } catch {
    entries = [];
  }
  cache = entries;
  return entries;
}

async function write(entries: HistoryEntry[]): Promise<void> {
  const text = JSON.stringify(entries);
  let shape: FileShape;
  try {
    shape = { version: 1, sealed: true, data: await seal(text) };
  } catch {
    shape = { version: 1, sealed: false, data: text };
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(shape), { mode: 0o600 });
  fs.renameSync(tmp, file());
}

function persist(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const snapshot = cache ? [...cache] : [];
    writing = writing.then(() => write(snapshot)).catch(() => undefined);
  }, SAVE_DELAY);
}

export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    const snapshot = cache ? [...cache] : [];
    writing = writing.then(() => write(snapshot)).catch(() => undefined);
  }
  await writing;
}

const same = (a: HistoryScope, e: HistoryEntry): boolean => e.server === a.server && e.db === a.db && e.table === a.table;

function trim(entries: HistoryEntry[], scope: HistoryScope): HistoryEntry[] {
  let out = entries;
  const mine = out.filter((e) => same(scope, e));
  if (mine.length > MAX_PER_TABLE) {
    const drop = new Set(mine.slice(0, mine.length - MAX_PER_TABLE).map((e) => e.id));
    out = out.filter((e) => !drop.has(e.id));
  }
  return out.length > MAX_ENTRIES ? out.slice(out.length - MAX_ENTRIES) : out;
}

export async function add(raw: unknown[]): Promise<number> {
  const entries = await load();
  const fresh = (Array.isArray(raw) ? raw : []).map((r) => clean(r as Partial<HistoryEntry>)).filter((e): e is HistoryEntry => e !== null);
  if (fresh.length === 0) return 0;
  let next = [...entries, ...fresh];
  for (const scope of new Map(fresh.map((e) => [`${e.server}|${e.db}|${e.table}`, { server: e.server, db: e.db, table: e.table }])).values()) next = trim(next, scope);
  cache = next;
  persist();
  return fresh.length;
}

export async function forTable(scope: HistoryScope): Promise<HistoryEntry[]> {
  return (await load()).filter((e) => same(scope, e)).sort((a, b) => b.ts - a.ts);
}

export async function markUndone(ids: string[]): Promise<void> {
  const entries = await load();
  const set = new Set(ids);
  const now = Date.now();
  cache = entries.map((e) => (set.has(e.id) ? { ...e, undone: now } : e));
  persist();
}

export async function remove(ids: string[]): Promise<void> {
  const set = new Set(ids);
  cache = (await load()).filter((e) => !set.has(e.id));
  persist();
}

export async function clear(scope?: HistoryScope): Promise<number> {
  const entries = await load();
  const next = scope ? entries.filter((e) => !same(scope, e)) : [];
  const removed = entries.length - next.length;
  cache = next;
  persist();
  return removed;
}

export async function stats(): Promise<HistoryStats> {
  const entries = await load();
  return { entries: entries.length, bytes: Buffer.byteLength(JSON.stringify(entries)) };
}
