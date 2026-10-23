import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isSensitive, type HistoryItem } from '../shared/termcomplete';
import { seal, unseal } from './remote/vault';

const MAX_PER_HOST = 500;
const MAX_TOTAL = 3000;
const MAX_LENGTH = 400;
const SAVE_DELAY = 600;

interface Row extends HistoryItem {
  host: string;
}

interface FileShape {
  version: 1;
  sealed: boolean;
  data: string;
}

const file = (): string => path.join(app.getPath('userData'), 'terminal-history.json');

let cache: Row[] | null = null;
let timer: NodeJS.Timeout | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<Row[]> {
  if (cache) return cache;
  let rows: Row[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as FileShape;
    const text = raw.sealed ? await unseal(raw.data) : raw.data;
    const parsed = JSON.parse(text || '[]') as Partial<Row>[];
    rows = Array.isArray(parsed)
      ? parsed.filter((r): r is Row => Boolean(r) && typeof r.host === 'string' && typeof r.cmd === 'string' && typeof r.count === 'number' && typeof r.last === 'number' && !isSensitive(r.cmd))
      : [];
  } catch {
    rows = [];
  }
  cache = rows;
  return rows;
}

async function write(rows: Row[]): Promise<void> {
  const text = JSON.stringify(rows);
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

function schedule(): void {
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

export async function list(host: string): Promise<HistoryItem[]> {
  return (await load()).filter((r) => r.host === host).map(({ cmd, count, last }) => ({ cmd, count, last }));
}

export async function add(host: string, raw: string): Promise<boolean> {
  const cmd = raw.replace(/\s+$/, '');
  if (!host || !cmd.trim() || cmd.length > MAX_LENGTH || /[\x00-\x08\x0e-\x1f]/.test(cmd) || isSensitive(cmd)) return false;
  const rows = await load();
  const now = Date.now();
  const found = rows.find((r) => r.host === host && r.cmd === cmd);
  if (found) {
    found.count++;
    found.last = now;
  } else {
    rows.push({ host, cmd, count: 1, last: now });
    const mine = rows.filter((r) => r.host === host);
    if (mine.length > MAX_PER_HOST) {
      const drop = mine.sort((a, b) => a.count - b.count || a.last - b.last)[0];
      if (drop) rows.splice(rows.indexOf(drop), 1);
    }
    if (rows.length > MAX_TOTAL) rows.sort((a, b) => b.last - a.last).length = MAX_TOTAL;
  }
  schedule();
  return true;
}

export async function clear(host?: string): Promise<number> {
  const rows = await load();
  const next = host ? rows.filter((r) => r.host !== host) : [];
  const removed = rows.length - next.length;
  cache = next;
  schedule();
  return removed;
}

export async function stats(): Promise<{ entries: number; bytes: number }> {
  const rows = await load();
  return { entries: rows.length, bytes: Buffer.byteLength(JSON.stringify(rows)) };
}
