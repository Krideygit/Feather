import type { ColumnHint, Needs, SchemaView } from '../../shared/sqlcomplete';
import { literal, onSchemaChange, rowsOf, runSql } from './sqlsource';

interface Entry {
  databases?: string[];
  tables: Map<string, string[]>;
  columns: Map<string, ColumnHint[]>;
  stamp: number;
}

const TTL = 90_000;
const entries = new Map<string, Entry>();
const flights = new Map<string, Promise<void>>();

function entryOf(source: string): Entry {
  const found = entries.get(source);
  if (found && Date.now() - found.stamp < TTL) return found;
  const fresh: Entry = { tables: new Map(), columns: new Map(), stamp: Date.now() };
  entries.set(source, fresh);
  return fresh;
}

export const invalidateSchema = (source?: string): void => void (source ? entries.delete(source) : entries.clear());

onSchemaChange((source) => invalidateSchema(source));

export function schemaView(source: string): SchemaView {
  const e = entryOf(source);
  return {
    databases: e.databases ?? [],
    tables: (db) => e.tables.get(db),
    columns: (db, table) => e.columns.get(`${db}\u0001${table}`),
  };
}

function once(key: string, work: () => Promise<void>): Promise<void> {
  const running = flights.get(key);
  if (running) return running;
  const promise = work().catch(() => undefined).finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}

export async function ensureSchema(source: string, needs: Needs): Promise<void> {
  const e = entryOf(source);
  const jobs: Promise<void>[] = [];
  if (needs.databases && !e.databases) {
    jobs.push(
      once(`${source}|dbs`, async () => {
        e.databases = rowsOf(await runSql(source, 'SHOW DATABASES')).map((r) => r[0] ?? '').filter(Boolean);
      }),
    );
  }
  for (const db of needs.tables) {
    if (e.tables.has(db)) continue;
    jobs.push(
      once(`${source}|t|${db}`, async () => {
        const rows = rowsOf(await runSql(source, `SELECT table_name FROM information_schema.tables WHERE table_schema = ${literal(db)} ORDER BY table_name`));
        e.tables.set(db, rows.map((r) => r[0] ?? '').filter(Boolean));
      }),
    );
  }
  for (const { db, table } of needs.columns) {
    const key = `${db}\u0001${table}`;
    if (e.columns.has(key)) continue;
    jobs.push(
      once(`${source}|c|${key}`, async () => {
        const rows = rowsOf(await runSql(source, `SELECT column_name, column_type, column_key FROM information_schema.columns WHERE table_schema = ${literal(db)} AND table_name = ${literal(table)} ORDER BY ordinal_position`));
        e.columns.set(key, rows.map((r) => ({ name: r[0] ?? '', type: r[1] ?? '', key: r[2] ?? '' })));
      }),
    );
  }
  await Promise.all(jobs);
}

const USAGE_KEY = 'feather.sql.usage';

export function loadUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function bumpUsage(kind: string, label: string): void {
  try {
    const usage = loadUsage();
    usage[`${kind}:${label}`] = (usage[`${kind}:${label}`] ?? 0) + 1;
    const keys = Object.keys(usage);
    if (keys.length > 600) for (const k of keys.sort((a, b) => (usage[a] ?? 0) - (usage[b] ?? 0)).slice(0, keys.length - 500)) delete usage[k];
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    return;
  }
}
