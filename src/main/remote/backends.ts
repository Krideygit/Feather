import { Client as FtpClient, type FileInfo } from 'basic-ftp';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { SFTPWrapper, Stats } from 'ssh2';
import { RemoteError, type EntryType, type FtpSecurity, type RemoteEntry } from '../../shared/remote';

export interface RemoteFs {
  home(): Promise<string>;
  list(dir: string): Promise<RemoteEntry[]>;
  stat(target: string): Promise<{ type: EntryType; size: number } | null>;
  mkdir(target: string): Promise<void>;
  ensureDir(target: string): Promise<void>;
  touch(target: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  removeFile(target: string): Promise<void>;
  removeDir(target: string): Promise<void>;
  chmod(target: string, mode: number): Promise<void>;
  read(target: string, max: number): Promise<Buffer>;
  write(target: string, data: Buffer): Promise<void>;
  upload(local: string, remote: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<void>;
  download(remote: string, local: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<void>;
  close(): void;
}

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;

export const join = (dir: string, name: string): string => path.posix.join(dir, name);

const typeOfMode = (mode: number): EntryType => {
  const kind = mode & S_IFMT;
  return kind === S_IFDIR ? 'dir' : kind === S_IFREG ? 'file' : kind === S_IFLNK ? 'link' : 'other';
};

const sortEntries = (entries: RemoteEntry[]): RemoteEntry[] =>
  entries.sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

export const isFolder = (e: Pick<RemoteEntry, 'type' | 'linkTo'>): boolean => e.type === 'dir' || (e.type === 'link' && e.linkTo === 'dir');

function sftpCall<T>(run: (done: (err: Error | null | undefined, value?: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      run((err, value) => (err ? reject(err) : resolve(value as T)));
    } catch (err) {
      reject(err);
    }
  });
}

async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

const ownerOf = (longname: string | undefined, uid: number | undefined): string => {
  const cols = (longname ?? '').split(/\s+/);
  return cols[2] ?? (uid === undefined ? '' : String(uid));
};

export class SftpFs implements RemoteFs {
  constructor(private readonly sftp: SFTPWrapper) {}

  home(): Promise<string> {
    return sftpCall<string>((done) => this.sftp.realpath('.', done));
  }

  async list(dir: string): Promise<RemoteEntry[]> {
    const raw = await sftpCall<{ filename: string; longname: string; attrs: Stats }[]>((done) => this.sftp.readdir(dir, done as never));
    const entries = raw
      .filter((r) => r.filename !== '.' && r.filename !== '..')
      .map((r): RemoteEntry => ({
        name: r.filename,
        path: join(dir, r.filename),
        type: typeOfMode(r.attrs.mode),
        size: r.attrs.size,
        mtime: r.attrs.mtime * 1000,
        mode: r.attrs.mode & 0o7777,
        owner: ownerOf(r.longname, r.attrs.uid),
        linkTo: null,
      }));
    await pool(
      entries.filter((e) => e.type === 'link'),
      8,
      async (e) => {
        try {
          const target = await sftpCall<Stats>((done) => this.sftp.stat(e.path, done as never));
          e.linkTo = typeOfMode(target.mode) === 'dir' ? 'dir' : 'file';
          e.size = target.size;
        } catch {
          e.linkTo = null;
        }
      },
    );
    return sortEntries(entries);
  }

  async stat(target: string): Promise<{ type: EntryType; size: number } | null> {
    try {
      const s = await sftpCall<Stats>((done) => this.sftp.stat(target, done as never));
      return { type: typeOfMode(s.mode), size: s.size };
    } catch {
      return null;
    }
  }

  mkdir(target: string): Promise<void> {
    return sftpCall<void>((done) => this.sftp.mkdir(target, done as never));
  }

  async ensureDir(target: string): Promise<void> {
    const found = await this.stat(target);
    if (found?.type === 'dir') return;
    const parent = path.posix.dirname(target);
    if (parent !== target) await this.ensureDir(parent);
    await this.mkdir(target);
  }

  async touch(target: string): Promise<void> {
    const handle = await sftpCall<Buffer>((done) => this.sftp.open(target, 'wx', done as never));
    await sftpCall<void>((done) => this.sftp.close(handle, done as never));
  }

  rename(from: string, to: string): Promise<void> {
    return sftpCall<void>((done) => this.sftp.rename(from, to, done as never));
  }

  removeFile(target: string): Promise<void> {
    return sftpCall<void>((done) => this.sftp.unlink(target, done as never));
  }

  removeDir(target: string): Promise<void> {
    return sftpCall<void>((done) => this.sftp.rmdir(target, done as never));
  }

  chmod(target: string, mode: number): Promise<void> {
    return sftpCall<void>((done) => this.sftp.chmod(target, mode, done as never));
  }

  async read(target: string, max: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (size > max) return cb(new RemoteError('Die Datei ist zu groß zum Bearbeiten.'));
        chunks.push(chunk);
        cb();
      },
    });
    await pipeline(this.sftp.createReadStream(target), sink);
    return Buffer.concat(chunks);
  }

  async write(target: string, data: Buffer): Promise<void> {
    await pipeline(Readable.from([data]), this.sftp.createWriteStream(target, { flags: 'w' }));
  }

  async upload(local: string, remote: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<void> {
    const source = fs.createReadStream(local);
    source.on('data', (chunk) => onBytes(chunk.length));
    await pipeline(source, this.sftp.createWriteStream(remote, { flags: 'w' }), { signal });
  }

  async download(remote: string, local: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<void> {
    const source = this.sftp.createReadStream(remote);
    source.on('data', (chunk: Buffer) => onBytes(chunk.length));
    try {
      await pipeline(source, fs.createWriteStream(local), { signal });
    } catch (err) {
      fs.rmSync(local, { force: true });
      throw err;
    }
  }

  close(): void {
    this.sftp.end();
  }
}

export interface FtpOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: FtpSecurity;
  ignoreCertErrors: boolean;
}

const modeFromFtp = (f: FileInfo): number | null => {
  const p = f.permissions;
  return p ? (p.user << 6) | (p.group << 3) | p.world : null;
};

export class FtpFs implements RemoteFs {
  private client = new FtpClient(30_000);
  private queue: Promise<unknown> = Promise.resolve();
  private idle: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly options: FtpOptions) {}

  async connect(): Promise<void> {
    this.client = new FtpClient(30_000);
    const { host, port, user, password, secure, ignoreCertErrors } = this.options;
    await this.client.access({
      host,
      port,
      user,
      password,
      secure: secure === 'none' ? false : secure === 'implicit' ? 'implicit' : true,
      secureOptions: { rejectUnauthorized: !ignoreCertErrors, servername: /^[\d.:]+$/.test(host) ? undefined : host },
    });
    this.idle ??= setInterval(() => {
      if (!this.closed) void this.run((c) => c.pwd().then(() => undefined)).catch(() => undefined);
    }, 30_000);
    this.idle.unref();
  }

  private run<T>(task: (client: FtpClient) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      if (this.closed) throw new RemoteError('Die Verbindung wurde getrennt.');
      if (this.client.closed) await this.connect();
      return task(this.client);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  home(): Promise<string> {
    return this.run((c) => c.pwd().then((p) => (p.includes('/') ? p : p.split(String.fromCharCode(92)).join('/') || '/')));
  }

  list(dir: string): Promise<RemoteEntry[]> {
    return this.run(async (c) => {
      const raw = await c.list(dir);
      return sortEntries(
        raw
          .filter((f) => f.name !== '.' && f.name !== '..')
          .map((f): RemoteEntry => ({
            name: f.name,
            path: join(dir, f.name),
            type: f.isDirectory ? 'dir' : f.isSymbolicLink ? 'link' : f.isFile ? 'file' : 'other',
            size: f.size,
            mtime: f.modifiedAt?.getTime() ?? 0,
            mode: modeFromFtp(f),
            owner: f.user ?? '',
            linkTo: null,
          })),
      );
    });
  }

  async stat(target: string): Promise<{ type: EntryType; size: number } | null> {
    const parent = path.posix.dirname(target);
    const name = path.posix.basename(target);
    if (parent === target) return { type: 'dir', size: 0 };
    try {
      const found = (await this.list(parent)).find((e) => e.name === name);
      return found ? { type: found.type, size: found.size } : null;
    } catch {
      return null;
    }
  }

  mkdir(target: string): Promise<void> {
    return this.run((c) => c.ftp.request(`MKD ${target}`).then(() => undefined));
  }

  ensureDir(target: string): Promise<void> {
    return this.run(async (c) => {
      const cwd = await c.pwd();
      try {
        await c.ensureDir(target);
      } finally {
        await c.cd(cwd);
      }
    });
  }

  async touch(target: string): Promise<void> {
    if (await this.stat(target)) throw new RemoteError('Es gibt bereits eine Datei mit diesem Namen.');
    await this.run((c) => c.uploadFrom(Readable.from([]), target).then(() => undefined));
  }

  rename(from: string, to: string): Promise<void> {
    return this.run((c) => c.rename(from, to).then(() => undefined));
  }

  removeFile(target: string): Promise<void> {
    return this.run((c) => c.remove(target).then(() => undefined));
  }

  removeDir(target: string): Promise<void> {
    return this.run(async (c) => {
      const cwd = await c.pwd();
      try {
        await c.removeEmptyDir(target);
      } finally {
        await c.cd(cwd).catch(() => undefined);
      }
    });
  }

  chmod(target: string, mode: number): Promise<void> {
    return this.run((c) => c.sendIgnoringError(`SITE CHMOD ${mode.toString(8)} ${target}`).then((res) => {
      if (res.code >= 400) throw new RemoteError('Der Server unterstützt das Ändern von Rechten nicht.');
    }));
  }

  read(target: string, max: number): Promise<Buffer> {
    return this.run(async (c) => {
      const size = await c.size(target).catch(() => 0);
      if (size > max) throw new RemoteError('Die Datei ist zu groß zum Bearbeiten.');
      const chunks: Buffer[] = [];
      await c.downloadTo(new Writable({ write: (chunk: Buffer, _e, cb) => (chunks.push(chunk), cb()) }), target);
      return Buffer.concat(chunks);
    });
  }

  write(target: string, data: Buffer): Promise<void> {
    return this.run((c) => c.uploadFrom(Readable.from([data]), target).then(() => undefined));
  }

  upload(local: string, remote: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<void> {
    return this.transfer(signal, onBytes, (c) => c.uploadFrom(local, remote), () => undefined);
  }

  download(remote: string, local: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<void> {
    return this.transfer(signal, onBytes, (c) => c.downloadTo(local, remote), () => fs.rmSync(local, { force: true }));
  }

  private transfer(signal: AbortSignal, onBytes: (n: number) => void, task: (c: FtpClient) => Promise<unknown>, cleanup: () => void): Promise<void> {
    return this.run(async (c) => {
      let last = 0;
      c.trackProgress((info) => {
        onBytes(info.bytesOverall - last);
        last = info.bytesOverall;
      });
      const abort = (): void => c.close();
      signal.addEventListener('abort', abort, { once: true });
      try {
        await task(c);
      } catch (err) {
        cleanup();
        if (signal.aborted) throw new RemoteError('Abgebrochen.');
        throw err;
      } finally {
        signal.removeEventListener('abort', abort);
        if (!c.closed) c.trackProgress();
      }
    });
  }

  close(): void {
    this.closed = true;
    if (this.idle) clearInterval(this.idle);
    this.client.close();
  }
}
