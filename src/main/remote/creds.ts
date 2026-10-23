import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RemoteError } from '../../shared/remote';
import type { SqlConnection, SqlConnectionInput } from '../../shared/sql';
import { seal, unseal } from './vault';

interface Stored extends Omit<SqlConnection, 'hasPassword'> {
  password?: string;
}

const file = (): string => path.join(app.getPath('userData'), 'sql-connections.json');
const HOST = /^[A-Za-z0-9_.:-]{1,253}$/;

function load(): Stored[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8')) as Stored[];
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === 'string') : [];
  } catch {
    return [];
  }
}

function persist(all: Stored[]): void {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file());
}

function view(s: Stored): SqlConnection {
  const { password, ...rest } = s;
  return { ...rest, hasPassword: Boolean(password) };
}

export const list = (hostKey?: string): SqlConnection[] =>
  load()
    .filter((c) => !hostKey || c.hostKey === hostKey)
    .map(view)
    .sort((a, b) => b.createdAt - a.createdAt);

function clean(input: SqlConnectionInput): Omit<Stored, 'id' | 'createdAt' | 'password'> {
  const user = String(input.user ?? '').trim();
  if (!user) throw new RemoteError('Bitte gib einen Benutzernamen an.');
  const dbHost = String(input.dbHost ?? '127.0.0.1').trim() || '127.0.0.1';
  if (!HOST.test(dbHost)) throw new RemoteError('Der Host ist ungültig.');
  const port = Number(input.port) || 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RemoteError('Der Port muss zwischen 1 und 65535 liegen.');
  const kind = input.kind === 'direct' ? 'direct' : 'ssh';
  const hostKey = String(input.hostKey ?? '');
  if (kind === 'ssh' && !hostKey) throw new RemoteError('Für Zugangsdaten über SSH wird ein Server benötigt.');
  const source = input.source === 'install' ? 'install' : input.source === 'manual' ? 'manual' : 'user';
  return {
    label: String(input.label ?? '').trim().slice(0, 80) || `${user}@${dbHost}`,
    kind,
    hostKey: kind === 'direct' ? '' : hostKey,
    dbHost,
    port,
    user,
    database: String(input.database ?? '').trim().slice(0, 64),
    source,
  };
}

export async function save(input: SqlConnectionInput): Promise<SqlConnection> {
  const base = clean(input);
  const all = load();
  const existing = input.id ? all.find((c) => c.id === input.id) : all.find((c) => c.kind === base.kind && c.hostKey === base.hostKey && c.dbHost === base.dbHost && c.port === base.port && c.user === base.user);
  const next: Stored = { ...base, id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? Date.now(), password: existing?.password };
  if (input.password === null) next.password = undefined;
  else if (typeof input.password === 'string' && input.password) next.password = await seal(input.password);
  persist(existing ? all.map((c) => (c.id === next.id ? next : c)) : [...all, next]);
  return view(next);
}

export function remove(id: string): void {
  persist(load().filter((c) => c.id !== id));
}

export async function reveal(id: string): Promise<string> {
  const found = load().find((c) => c.id === id);
  if (!found) throw new RemoteError('Diese Zugangsdaten existieren nicht mehr.');
  return unseal(found.password);
}

export interface CredsExport {
  connections: Omit<Stored, 'password'>[];
  secrets: Record<string, string>;
}

export async function exportAll(): Promise<CredsExport> {
  const connections: CredsExport['connections'] = [];
  const secrets: CredsExport['secrets'] = {};
  for (const s of load()) {
    const { password, ...rest } = s;
    connections.push(rest);
    const pw = await unseal(password);
    if (pw) secrets[s.id] = pw;
  }
  return { connections, secrets };
}

export async function importAll(connections: unknown[], secrets: Record<string, string>): Promise<number> {
  const all = load();
  let count = 0;
  for (const raw of connections) {
    const c = raw as Partial<Stored>;
    if (!c || typeof c.id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(c.id)) continue;
    let base;
    try {
      base = clean(c as SqlConnectionInput);
    } catch {
      continue;
    }
    const existing = all.find((x) => x.id === c.id);
    const next: Stored = { ...base, id: c.id, createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(), password: secrets[c.id] ? await seal(secrets[c.id] as string) : existing?.password };
    if (existing) all.splice(all.indexOf(existing), 1, next);
    else all.push(next);
    count++;
  }
  persist(all);
  return count;
}
