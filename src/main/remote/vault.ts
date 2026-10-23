import { app, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PORTS, type RemoteHost, type RemoteHostInput, type RemoteProtocol } from '../../shared/remote';

interface Stored extends Omit<RemoteHost, 'hasPassword' | 'hasPassphrase'> {
  password?: string;
  passphrase?: string;
}

export interface Secrets {
  password: string;
  passphrase: string;
}

export type ResolvedHost = Omit<RemoteHost, 'hasPassword' | 'hasPassphrase'> & Secrets;

const hostsFile = (): string => path.join(app.getPath('userData'), 'remote-hosts.json');
const knownFile = (): string => path.join(app.getPath('userData'), 'known-hosts.json');
const PROTOCOLS: RemoteProtocol[] = ['ssh', 'sftp', 'ftp'];

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export const canStoreSecrets = (): Promise<boolean> => safeStorage.isAsyncEncryptionAvailable();

export async function seal(value: string): Promise<string> {
  if (!(await canStoreSecrets())) throw new Error('Auf diesem System ist keine sichere Passwort-Speicherung verfügbar. Lass das Feld leer, dann fragt Feather bei jeder Verbindung danach.');
  return (await safeStorage.encryptStringAsync(value)).toString('base64');
}

export async function unseal(value: string | undefined): Promise<string> {
  if (!value) return '';
  try {
    return (await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))).result;
  } catch {
    return '';
  }
}

const load = (): Stored[] => readJson<Stored[]>(hostsFile(), []).filter((h) => h && typeof h.id === 'string');

function view(s: Stored): RemoteHost {
  const { password, passphrase, ...rest } = s;
  return { ...rest, hasPassword: Boolean(password), hasPassphrase: Boolean(passphrase) };
}

export const list = (): RemoteHost[] => load().map(view).sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));

export async function resolve(id: string): Promise<ResolvedHost> {
  const s = load().find((h) => h.id === id);
  if (!s) throw new Error('Diese Verbindung existiert nicht mehr.');
  const { password, passphrase, ...rest } = s;
  return { ...rest, password: await unseal(password), passphrase: await unseal(passphrase) };
}

export function normalize(input: RemoteHostInput): Omit<RemoteHost, 'id' | 'hasPassword' | 'hasPassphrase' | 'lastUsed' | 'createdAt'> {
  const protocol = PROTOCOLS.includes(input.protocol) ? input.protocol : 'ssh';
  const host = String(input.host ?? '').trim();
  if (!host || /\s/.test(host)) throw new Error('Bitte gib einen gültigen Host oder eine IP-Adresse an.');
  const port = Number(input.port) || DEFAULT_PORTS[protocol];
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Der Port muss zwischen 1 und 65535 liegen.');
  const username = String(input.username ?? '').trim();
  if (!username && protocol !== 'ftp') throw new Error('Bitte gib einen Benutzernamen an.');
  const auth = input.auth === 'key' || input.auth === 'agent' ? input.auth : 'password';
  const keyPath = String(input.keyPath ?? '').trim();
  if (protocol !== 'ftp' && auth === 'key' && !keyPath) throw new Error('Bitte wähle eine Schlüsseldatei aus.');
  return {
    name: String(input.name ?? '').trim() || host,
    protocol,
    host,
    port,
    username: protocol === 'ftp' ? username || 'anonymous' : username,
    auth: protocol === 'ftp' ? 'password' : auth,
    keyPath,
    secure: input.secure === 'explicit' || input.secure === 'implicit' ? input.secure : 'none',
    ignoreCertErrors: input.ignoreCertErrors === true,
    startPath: String(input.startPath ?? '').trim(),
    color: /^#[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color : '#0ea5e9',
  };
}

export async function save(input: RemoteHostInput): Promise<RemoteHost> {
  const base = normalize(input);
  const all = load();
  const existing = input.id ? all.find((h) => h.id === input.id) : undefined;
  const next: Stored = {
    ...base,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? Date.now(),
    lastUsed: existing?.lastUsed ?? null,
    password: existing?.password,
    passphrase: existing?.passphrase,
  };
  if (input.password === null || base.auth !== 'password') next.password = undefined;
  else if (typeof input.password === 'string' && input.password) next.password = await seal(input.password);
  if (input.passphrase === null || base.auth !== 'key') next.passphrase = undefined;
  else if (typeof input.passphrase === 'string' && input.passphrase) next.passphrase = await seal(input.passphrase);
  writeJson(hostsFile(), existing ? all.map((h) => (h.id === next.id ? next : h)) : [...all, next]);
  return view(next);
}

export function remove(id: string): void {
  writeJson(hostsFile(), load().filter((h) => h.id !== id));
}

export async function remember(id: string, secrets: Partial<Secrets>): Promise<void> {
  const all = load();
  const target = all.find((h) => h.id === id);
  if (!target) return;
  if (secrets.password) target.password = await seal(secrets.password);
  if (secrets.passphrase) target.passphrase = await seal(secrets.passphrase);
  writeJson(hostsFile(), all);
}

export function touch(id: string): void {
  const all = load();
  const target = all.find((h) => h.id === id);
  if (!target) return;
  target.lastUsed = Date.now();
  writeJson(hostsFile(), all);
}

const knownKey = (host: string, port: number): string => `${host.toLowerCase()}:${port}`;

export const knownFingerprint = (host: string, port: number): string | undefined => readJson<Record<string, string>>(knownFile(), {})[knownKey(host, port)];

export function trustFingerprint(host: string, port: number, fingerprint: string): void {
  const known = readJson<Record<string, string>>(knownFile(), {});
  known[knownKey(host, port)] = fingerprint;
  writeJson(knownFile(), known);
}

export interface HostExport {
  hosts: Omit<Stored, 'password' | 'passphrase'>[];
  secrets: Record<string, Secrets>;
}

export async function exportAll(): Promise<HostExport> {
  const hosts: HostExport['hosts'] = [];
  const secrets: HostExport['secrets'] = {};
  for (const s of load()) {
    const { password, passphrase, ...rest } = s;
    hosts.push(rest);
    const pw = await unseal(password);
    const pp = await unseal(passphrase);
    if (pw || pp) secrets[s.id] = { password: pw, passphrase: pp };
  }
  return { hosts, secrets };
}

export async function importAll(hosts: unknown[], secrets: Record<string, Partial<Secrets>>): Promise<number> {
  const all = load();
  let count = 0;
  for (const raw of hosts) {
    const h = raw as Partial<Stored>;
    if (!h || typeof h.id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(h.id)) continue;
    let base;
    try {
      base = normalize(h as RemoteHostInput);
    } catch {
      continue;
    }
    const existing = all.find((x) => x.id === h.id);
    const secret = secrets[h.id] ?? {};
    const next: Stored = {
      ...base,
      id: h.id,
      createdAt: typeof h.createdAt === 'number' ? h.createdAt : Date.now(),
      lastUsed: typeof h.lastUsed === 'number' ? h.lastUsed : null,
      password: secret.password ? await seal(secret.password) : existing?.password,
      passphrase: secret.passphrase ? await seal(secret.passphrase) : existing?.passphrase,
    };
    if (existing) all.splice(all.indexOf(existing), 1, next);
    else all.push(next);
    count++;
  }
  writeJson(hostsFile(), all);
  return count;
}

export const knownHostsAll = (): Record<string, string> => readJson<Record<string, string>>(knownFile(), {});

export function mergeKnownHosts(incoming: Record<string, string>): void {
  const known = knownHostsAll();
  for (const [key, value] of Object.entries(incoming)) if (typeof value === 'string' && !(key in known)) known[key] = value;
  writeJson(knownFile(), known);
}
