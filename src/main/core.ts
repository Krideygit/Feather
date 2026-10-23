import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export class CoreError extends Error {}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface CoreMessage {
  id?: number | null;
  result?: unknown;
  error?: string;
  event?: string;
  data?: unknown;
}

function findJava(): string {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates: string[] = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'jre', 'bin', exe));
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', exe));
  return candidates.find((c) => fs.existsSync(c)) ?? 'java';
}

function findJar(): string | undefined {
  const candidates = [
    process.env.FEATHER_CORE_JAR,
    process.resourcesPath && path.join(process.resourcesPath, 'core', 'feather-core.jar'),
    path.join(__dirname, '..', '..', 'core', 'feather-core.jar'),
  ].filter((c): c is string => Boolean(c));
  return candidates.find((c) => fs.existsSync(c));
}

interface CoreEmitter {
  on(event: 'event', listener: (name: string, data: unknown) => void): this;
  on(event: 'fatal', listener: (message: string) => void): this;
  on(event: 'exit', listener: (code: number | null) => void): this;
}

export class Core extends EventEmitter implements CoreEmitter {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private proc: ChildProcessWithoutNullStreams | null = null;
  private exited: Promise<void> = Promise.resolve();
  private markReady!: () => void;

  readonly ready = new Promise<void>((resolve) => {
    this.markReady = resolve;
  });

  start(): void {
    const jar = findJar();
    if (!jar) throw new CoreError('core/feather-core.jar fehlt. Bitte "npm run build:core" ausführen.');

    const proc = spawn(findJava(), ['-Dfile.encoding=UTF-8', '-jar', jar], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc = proc;
    this.exited = new Promise((resolve) => proc.once('exit', () => resolve()));

    proc.on('error', (err: NodeJS.ErrnoException) => {
      const message =
        err.code === 'ENOENT'
          ? 'Java wurde nicht gefunden. Installiere ein JDK/JRE (Version 17 oder neuer) und starte Feather neu.'
          : `Java-Core konnte nicht gestartet werden: ${err.message}`;
      this.failAll(new CoreError(message));
      this.emit('fatal', message);
    });
    proc.on('exit', (code) => {
      this.failAll(new CoreError('Der Java-Core wurde beendet.'));
      this.emit('exit', code);
    });

    readline.createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    readline.createInterface({ input: proc.stderr }).on('line', (line) => console.error('[core]', line));
  }

  private onLine(line: string): void {
    let msg: CoreMessage;
    try {
      msg = JSON.parse(line) as CoreMessage;
    } catch {
      console.error('[core] unlesbare Zeile:', line);
      return;
    }
    if (msg.event) {
      if (msg.event === 'core.ready') this.markReady();
      this.emit('event', msg.event, msg.data);
      return;
    }
    const waiting = msg.id == null ? undefined : this.pending.get(msg.id);
    if (!waiting || msg.id == null) return;
    this.pending.delete(msg.id);
    if (msg.error) waiting.reject(new CoreError(msg.error));
    else waiting.resolve(msg.result);
  }

  call<T = unknown>(method: string, params: object = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const proc = this.proc;
      if (!proc || !proc.stdin.writable) {
        reject(new CoreError('Der Java-Core läuft nicht.'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private failAll(err: Error): void {
    for (const { reject } of this.pending.values()) reject(err);
    this.pending.clear();
  }

  async shutdown(timeoutMs = 30000): Promise<void> {
    const proc = this.proc;
    if (!proc || proc.exitCode !== null) return;
    proc.stdin.end();
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    await this.exited;
    clearTimeout(timer);
  }
}
