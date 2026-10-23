import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
import {
  MAX_EDIT_BYTES,
  RemoteError,
  type FileContent,
  type RemoteEntry,
  type RemoteEvents,
  type RemoteHost,
  type RemoteHostInput,
  type SessionInfo,
  type SessionOpen,
} from '../../shared/remote';
import type { SqlConnectionInput } from '../../shared/sql';
import { join, type RemoteFs } from './backends';
import { friendly } from './errors';
import * as creds from './creds';
import * as cmdhistory from '../cmdhistory';
import * as sqlhistory from '../sqlhistory';
import { createModuleMethods } from './modules/manager';
import { Session } from './session';
import { Transfers } from './transfers';
import * as vault from './vault';

interface Deps {
  send: (channel: string, payload: unknown) => void;
  pickLocal: (kind: 'files' | 'folder') => Promise<string[]>;
}

interface Live {
  session: Session;
  transfers: Transfers;
}

type Params = Record<string, unknown>;

const sessions = new Map<string, Live>();

const text = (p: Params, key: string): string => {
  const value = p[key];
  if (typeof value !== 'string') throw new RemoteError(`Ungültige Angabe: ${key}`);
  return value;
};

const strings = (p: Params, key: string): string[] => {
  const value = p[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new RemoteError(`Ungültige Angabe: ${key}`);
  return value as string[];
};

function live(p: Params): Live {
  const found = sessions.get(text(p, 'sid'));
  if (!found) throw new RemoteError('Diese Sitzung existiert nicht mehr.');
  return found;
}

function remoteFs(l: Live): RemoteFs {
  if (!l.session.fs) throw new RemoteError(l.session.open ? (l.session.filesError ?? 'Der Dateizugriff ist nicht verfügbar.') : 'Die Verbindung wurde getrennt.');
  return l.session.fs;
}

async function removeTree(fsx: RemoteFs, target: string, type: string): Promise<void> {
  if (type !== 'dir') return fsx.removeFile(target);
  for (const child of await fsx.list(target)) await removeTree(fsx, child.path, child.type);
  await fsx.removeDir(target);
}

async function describe(l: Live): Promise<SessionInfo> {
  const { session } = l;
  const { spec } = session;
  let home = '/';
  if (session.fs) {
    try {
      home = await session.fs.home();
    } catch {
      home = '/';
    }
    if (spec.startPath) {
      const wanted = spec.startPath.startsWith('/') ? spec.startPath : join(home, spec.startPath);
      if ((await session.fs.stat(wanted))?.type === 'dir') home = wanted;
    }
  }
  return {
    sid: session.sid,
    hostId: spec.id || null,
    name: spec.name,
    protocol: spec.protocol,
    host: spec.host,
    port: spec.port,
    username: spec.username,
    color: spec.color,
    terminal: session.hasTerminal,
    home,
    fingerprint: session.fingerprint,
    filesError: session.filesError,
  };
}

export function registerRemote({ send, pickLocal }: Deps): { shutdown: () => void } {
  const emit = <K extends keyof RemoteEvents>(name: K, data: RemoteEvents[K]): void => send('remote:event', { name, data });

  const build = (sid: string, spec: vault.ResolvedHost): Live => {
    const session = new Session(sid, spec, emit);
    const transfers = new Transfers(sid, emit, () => remoteFs({ session, transfers } as Live));
    return { session, transfers };
  };

  const methods: Record<string, (p: Params) => Promise<unknown> | unknown> = {
    'hosts.list': () => vault.list(),
    'hosts.save': async (p): Promise<RemoteHost> => vault.save(p.input as RemoteHostInput),
    'hosts.remove': (p) => vault.remove(text(p, 'id')),
    'hosts.canStore': () => vault.canStoreSecrets(),

    'creds.list': (p) => creds.list(typeof p.hostKey === 'string' ? p.hostKey : undefined),
    'creds.save': (p) => creds.save(p.input as SqlConnectionInput),
    'creds.remove': (p) => creds.remove(text(p, 'id')),
    'creds.reveal': async (p) => ({ password: await creds.reveal(text(p, 'id')) }),

    'sqlhistory.add': async (p) => ({ added: await sqlhistory.add(Array.isArray(p.entries) ? p.entries : []) }),
    'sqlhistory.table': (p) => sqlhistory.forTable({ server: text(p, 'server'), db: text(p, 'db'), table: text(p, 'table') }),
    'sqlhistory.undone': async (p) => {
      await sqlhistory.markUndone(strings(p, 'ids'));
      return {};
    },
    'sqlhistory.remove': async (p) => {
      await sqlhistory.remove(strings(p, 'ids'));
      return {};
    },
    'sqlhistory.clear': async (p) => ({ removed: await sqlhistory.clear(typeof p.server === 'string' && typeof p.db === 'string' && typeof p.table === 'string' ? { server: p.server, db: p.db, table: p.table } : undefined) }),
    'sqlhistory.stats': () => sqlhistory.stats(),

    'cmdhistory.list': (p) => cmdhistory.list(text(p, 'host')),
    'cmdhistory.add': async (p) => ({ added: await cmdhistory.add(text(p, 'host'), text(p, 'cmd')) }),
    'cmdhistory.clear': async () => ({ removed: await cmdhistory.clear() }),
    'cmdhistory.stats': () => cmdhistory.stats(),

    'tunnel.open': async (p) => {
      const l = live(p);
      if (!l.session.open || !l.session.hasTerminal) throw new RemoteError('Für Tunnel wird eine SSH-Verbindung benötigt.');
      const port = Number(p.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RemoteError('Ungültiger Port.');
      const host = typeof p.host === 'string' && /^[A-Za-z0-9_.:-]{1,253}$/.test(p.host) ? p.host : '127.0.0.1';
      return { port: await l.session.tunnel(host, port) };
    },

    'session.open': async (p) => {
      const req = p as unknown as SessionOpen;
      let spec: vault.ResolvedHost;
      if (req.hostId) {
        spec = await vault.resolve(req.hostId);
      } else if (req.draft) {
        spec = { ...vault.normalize(req.draft), id: '', createdAt: Date.now(), lastUsed: null, password: req.draft.password ?? '', passphrase: req.draft.passphrase ?? '' };
      } else {
        throw new RemoteError('Es wurde keine Verbindung angegeben.');
      }
      if (req.password) spec.password = req.password;
      if (req.passphrase) spec.passphrase = req.passphrase;
      const entry = build(crypto.randomUUID(), spec);
      await entry.session.connect(req.trust);
      sessions.set(entry.session.sid, entry);
      if (spec.id) {
        vault.touch(spec.id);
        if (req.remember) await vault.remember(spec.id, { password: req.password, passphrase: req.passphrase });
      }
      return describe(entry);
    },
    'session.reconnect': async (p) => {
      const l = live(p);
      if (l.session.open) return describe(l);
      const trust = typeof p.trust === 'string' ? p.trust : undefined;
      if (typeof p.password === 'string' && p.password) l.session.spec.password = p.password;
      if (typeof p.passphrase === 'string' && p.passphrase) l.session.spec.passphrase = p.passphrase;
      await l.session.connect(trust);
      if (p.remember === true && l.session.spec.id) await vault.remember(l.session.spec.id, { password: l.session.spec.password, passphrase: l.session.spec.passphrase });
      return describe(l);
    },
    'session.close': (p) => {
      const l = sessions.get(text(p, 'sid'));
      if (!l) return;
      l.transfers.cancelAll();
      l.session.close();
      sessions.delete(l.session.sid);
    },

    'term.start': async (p) => {
      const cols = Math.max(10, Math.min(500, Number(p.cols) || 80));
      const rows = Math.max(2, Math.min(200, Number(p.rows) || 24));
      await live(p).session.startShell(cols, rows);
    },

    'fs.list': async (p) => {
      const dir = text(p, 'path');
      const entries: RemoteEntry[] = await remoteFs(live(p)).list(dir);
      return { path: dir, entries };
    },
    'fs.mkdir': (p) => remoteFs(live(p)).mkdir(text(p, 'path')),
    'fs.touch': (p) => remoteFs(live(p)).touch(text(p, 'path')),
    'fs.rename': (p) => remoteFs(live(p)).rename(text(p, 'from'), text(p, 'to')),
    'fs.chmod': (p) => {
      const mode = Number(p.mode);
      if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw new RemoteError('Ungültige Rechte.');
      return remoteFs(live(p)).chmod(text(p, 'path'), mode);
    },
    'fs.remove': async (p) => {
      const fsx = remoteFs(live(p));
      const items = p.items as { path: string; type: string }[];
      if (!Array.isArray(items)) throw new RemoteError('Ungültige Angabe: items');
      for (const item of items) {
        if (typeof item.path !== 'string' || item.path === '/' || item.path === '') throw new RemoteError('Dieser Pfad darf nicht gelöscht werden.');
        await removeTree(fsx, item.path, item.type);
      }
    },
    'fs.exists': async (p) => {
      const fsx = remoteFs(live(p));
      const dir = text(p, 'dir');
      const names = new Set(strings(p, 'names'));
      return (await fsx.list(dir)).filter((e) => names.has(e.name)).map((e) => e.name);
    },
    'fs.read': async (p): Promise<FileContent> => {
      const fsx = remoteFs(live(p));
      const target = text(p, 'path');
      const buffer = await fsx.read(target, MAX_EDIT_BYTES);
      if (buffer.subarray(0, 8192).includes(0)) throw new RemoteError('Diese Datei ist keine Textdatei und kann nicht bearbeitet werden.');
      const parent = path.posix.dirname(target);
      const entry = (await fsx.list(parent).catch(() => [])).find((e) => e.path === target);
      return { text: buffer.toString('utf8'), size: buffer.length, mtime: entry?.mtime ?? 0 };
    },
    'fs.write': async (p) => {
      await remoteFs(live(p)).write(text(p, 'path'), Buffer.from(text(p, 'text'), 'utf8'));
    },

    'transfer.upload': (p) => live(p).transfers.upload(text(p, 'remoteDir'), strings(p, 'local')),
    'transfer.download': (p) => {
      const items = p.items as { path: string; name: string; type: string; size: number }[];
      if (!Array.isArray(items)) throw new RemoteError('Ungültige Angabe: items');
      const localDir = text(p, 'localDir');
      if (!fs.existsSync(localDir)) throw new RemoteError('Der Zielordner existiert nicht.');
      return live(p).transfers.download(items, localDir);
    },
    'transfer.cancel': (p) => live(p).transfers.cancel(text(p, 'tid')),

    'local.pick': async (p) => pickLocal(p.kind === 'folder' ? 'folder' : 'files'),
    'local.exists': (p) => {
      const dir = text(p, 'dir');
      return strings(p, 'names').filter((n) => fs.existsSync(path.join(dir, n)));
    },
  };

  Object.assign(
    methods,
    createModuleMethods((p) => {
      const l = live(p);
      if (!l.session.open) throw new RemoteError('Die Verbindung wurde getrennt.');
      if (!l.session.hasTerminal) throw new RemoteError('Module sind nur bei SSH-Verbindungen verfügbar.');
      return l.session;
    }, emit),
  );

  ipcMain.handle('remote:call', async (_event, method: string, params: Params) => {
    try {
      const handler = methods[method];
      if (!handler) throw new RemoteError(`Unbekannte Methode: ${method}`);
      return { ok: true, result: await handler(params ?? {}) };
    } catch (err) {
      const e = friendly(err);
      return { ok: false, error: e.message, code: e.code, data: e.data };
    }
  });

  ipcMain.on('remote:send', (_event, method: string, params: Params) => {
    const l = sessions.get(String(params?.sid));
    if (!l) return;
    if (method === 'term.write' && typeof params.data === 'string') l.session.write(params.data);
    else if (method === 'term.resize') l.session.resize(Math.max(10, Number(params.cols) || 80), Math.max(2, Number(params.rows) || 24));
  });

  return {
    shutdown: () => {
      sessions.forEach((l) => {
        l.transfers.cancelAll();
        l.session.close();
      });
      sessions.clear();
    },
  };
}
