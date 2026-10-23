import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { RemoteError } from '../shared/remote';
import type { Core } from './core';
import * as creds from './remote/creds';
import * as vault from './remote/vault';
import * as settings from './settings';

const FORMAT = 'feather-backup';
const VERSION = 1;

export interface BackupResult {
  file: string;
  bytes: number;
  profiles: number;
  hosts: number;
  connections: number;
  plugins: number;
  encrypted: boolean;
}

export interface BackupInfo {
  createdAt: number;
  appVersion: string;
  profiles: string[];
  hosts: number;
  connections: number;
  plugins: number;
  encrypted: boolean;
  includesData: boolean;
}

export interface RestoreReport {
  settings: boolean;
  hosts: number;
  connections: number;
  plugins: number;
  profiles: number;
  skippedSecrets: boolean;
  warnings: string[];
}

interface Manifest extends BackupInfo {
  format: string;
  version: number;
}

interface Sealed {
  v: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function encrypt(plain: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const sealed: Sealed = { v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  return Buffer.from(JSON.stringify(sealed), 'utf8');
}

function decrypt(blob: Buffer, password: string): Buffer {
  try {
    const sealed = JSON.parse(blob.toString('utf8')) as Sealed;
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, Buffer.from(sealed.salt, 'base64')), Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]);
  } catch {
    throw new RemoteError('Das Passwort der Sicherung ist falsch.');
  }
}

async function homeOf(core: Core): Promise<string> {
  return ((await core.call('app.info')) as { home: string }).home;
}

function listFiles(dir: string, ext: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function createBackup(core: Core, options: { file: string; password: string; includeData: boolean }): Promise<BackupResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-backup-'));
  const part = `${options.file}.part`;
  try {
    const zip = new yazl.ZipFile();
    const out = fs.createWriteStream(part);
    const finished = new Promise<void>((resolve, reject) => {
      out.on('close', resolve);
      out.on('error', reject);
      zip.outputStream.on('error', reject);
    });
    zip.outputStream.pipe(out);

    const add = (name: string, data: Buffer | string): void => zip.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), name);

    add('settings.json', JSON.stringify(settings.get(), null, 2));

    const hostData = await vault.exportAll();
    const credData = await creds.exportAll();
    add('server/hosts.json', JSON.stringify(hostData.hosts, null, 2));
    add('server/known-hosts.json', JSON.stringify(vault.knownHostsAll(), null, 2));
    add('server/sql-connections.json', JSON.stringify(credData.connections, null, 2));
    const encrypted = options.password.length > 0;
    if (encrypted) add('secrets.enc', encrypt(Buffer.from(JSON.stringify({ hosts: hostData.secrets, connections: credData.secrets }), 'utf8'), options.password));

    const home = await homeOf(core);
    const pluginDir = path.join(home, 'plugins');
    const jars = listFiles(pluginDir, '.jar');
    for (const jar of jars) zip.addFile(jar, `plugins/${path.basename(jar)}`);
    for (const data of listFiles(path.join(pluginDir, 'data'), '.json')) zip.addFile(data, `plugins/data/${path.basename(data)}`);
    if (fs.existsSync(path.join(pluginDir, 'plugins.json'))) zip.addFile(path.join(pluginDir, 'plugins.json'), 'plugins/plugins.json');

    const profileList = ((await core.call('profile.list')) as { profiles: { id: string; name: string }[] }).profiles;
    for (const profile of profileList) {
      const file = path.join(tmp, `${profile.id}.feather`);
      await core.call('profile.export', { id: profile.id, file, includeData: options.includeData });
      zip.addFile(file, `profiles/${profile.id}.feather`, { compress: false });
    }

    const manifest: Manifest = {
      format: FORMAT,
      version: VERSION,
      createdAt: Date.now(),
      appVersion: app.getVersion(),
      profiles: profileList.map((p) => p.name),
      hosts: hostData.hosts.length,
      connections: credData.connections.length,
      plugins: jars.length,
      encrypted,
      includesData: options.includeData,
    };
    add('manifest.json', JSON.stringify(manifest, null, 2));
    zip.end();
    await finished;
    fs.renameSync(part, options.file);
    return { file: options.file, bytes: fs.statSync(options.file).size, profiles: profileList.length, hosts: manifest.hosts, connections: manifest.connections, plugins: jars.length, encrypted };
  } catch (err) {
    fs.rmSync(part, { force: true });
    throw err;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function open(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => (err || !zip ? reject(err ?? new Error('leer')) : resolve(zip)));
  });
}

function readEntry(file: string, name: string): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    open(file).then((zip) => {
      let found = false;
      zip.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName !== name) return zip.readEntry();
        found = true;
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error('Lesefehler'));
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', reject);
        });
      });
      zip.on('end', () => !found && resolve(null));
      zip.on('error', reject);
      zip.readEntry();
    }, reject);
  });
}

export async function inspectBackup(file: string): Promise<BackupInfo> {
  let raw: Buffer | null;
  try {
    raw = await readEntry(file, 'manifest.json');
  } catch {
    throw new RemoteError('Das ist keine gültige Feather-Sicherung.');
  }
  if (!raw) throw new RemoteError('Das ist keine gültige Feather-Sicherung.');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(raw.toString('utf8')) as Manifest;
  } catch {
    throw new RemoteError('Das ist keine gültige Feather-Sicherung.');
  }
  if (manifest.format !== FORMAT) throw new RemoteError('Das ist keine Feather-Sicherung.');
  if (manifest.version > VERSION) throw new RemoteError('Die Sicherung stammt von einer neueren Feather-Version.');
  const { format: _format, version: _version, ...info } = manifest;
  return info;
}

async function extractAll(file: string, target: string): Promise<void> {
  const root = path.resolve(target);
  const zip = await open(file);
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const destination = path.resolve(root, entry.fileName);
      if (destination !== root && !destination.startsWith(root + path.sep)) return reject(new RemoteError('Die Sicherung enthält ungültige Pfade.'));
      if (entry.fileName.endsWith('/')) {
        fs.mkdirSync(destination, { recursive: true });
        return zip.readEntry();
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err ?? new Error('Lesefehler'));
        const sink = fs.createWriteStream(destination);
        stream.pipe(sink);
        sink.on('close', () => zip.readEntry());
        sink.on('error', reject);
        stream.on('error', reject);
      });
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });
}

const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

export async function restoreBackup(core: Core, options: { file: string; password: string }): Promise<RestoreReport> {
  const info = await inspectBackup(options.file);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-restore-'));
  const report: RestoreReport = { settings: false, hosts: 0, connections: 0, plugins: 0, profiles: 0, skippedSecrets: false, warnings: [] };
  try {
    let secrets: { hosts: Record<string, vault.Secrets>; connections: Record<string, string> } = { hosts: {}, connections: {} };
    const sealed = await readEntry(options.file, 'secrets.enc');
    if (sealed) {
      if (!options.password) throw new RemoteError('Diese Sicherung ist mit einem Passwort geschützt. Bitte gib es ein.');
      secrets = JSON.parse(decrypt(sealed, options.password).toString('utf8')) as typeof secrets;
    } else if (info.hosts > 0 || info.connections > 0) {
      report.skippedSecrets = true;
    }

    await extractAll(options.file, tmp);

    const savedSettings = readJson<Record<string, unknown> | null>(path.join(tmp, 'settings.json'), null);
    if (savedSettings) {
      settings.set(savedSettings);
      report.settings = true;
    }

    report.hosts = await vault.importAll(readJson<unknown[]>(path.join(tmp, 'server', 'hosts.json'), []), secrets.hosts ?? {});
    vault.mergeKnownHosts(readJson<Record<string, string>>(path.join(tmp, 'server', 'known-hosts.json'), {}));
    report.connections = await creds.importAll(readJson<unknown[]>(path.join(tmp, 'server', 'sql-connections.json'), []), secrets.connections ?? {});

    const home = await homeOf(core);
    const dataDir = path.join(tmp, 'plugins', 'data');
    if (fs.existsSync(dataDir)) {
      fs.mkdirSync(path.join(home, 'plugins', 'data'), { recursive: true });
      for (const file of listFiles(dataDir, '.json')) fs.copyFileSync(file, path.join(home, 'plugins', 'data', path.basename(file)));
    }
    for (const jar of listFiles(path.join(tmp, 'plugins'), '.jar')) {
      try {
        await core.call('plugin.install', { file: jar });
        report.plugins++;
      } catch (err) {
        report.warnings.push(`Plugin ${path.basename(jar)}: ${(err as Error).message}`);
      }
    }

    for (const file of listFiles(path.join(tmp, 'profiles'), '.feather')) {
      try {
        await core.call('profile.import', { file });
        report.profiles++;
      } catch (err) {
        report.warnings.push(`Profil ${path.basename(file)}: ${(err as Error).message}`);
      }
    }
    return report;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
