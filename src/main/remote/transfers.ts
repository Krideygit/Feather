import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RemoteError, type RemoteEvents, type Transfer } from '../../shared/remote';
import { isFolder, join, type RemoteFs } from './backends';
import { friendly } from './errors';

type Emit = <K extends keyof RemoteEvents>(name: K, data: RemoteEvents[K]) => void;

interface Active {
  state: Transfer;
  controller: AbortController;
}

export class Transfers {
  private readonly active = new Map<string, Active>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sid: string,
    private readonly emit: Emit,
    private readonly fsOf: () => RemoteFs,
  ) {}

  private create(name: string, direction: Transfer['direction']): Active {
    const state: Transfer = { tid: crypto.randomUUID(), sid: this.sid, name, direction, state: 'queued', done: 0, total: 0, current: '', files: 0, error: null };
    const entry = { state, controller: new AbortController() };
    this.active.set(state.tid, entry);
    this.publish(state);
    return entry;
  }

  private publish(state: Transfer): void {
    this.emit('transfer', { ...state });
  }

  private enqueue(entry: Active, job: () => Promise<void>): void {
    this.queue = this.queue.then(async () => {
      const { state, controller } = entry;
      if (controller.signal.aborted) return this.finish(entry, 'cancelled');
      state.state = 'running';
      this.publish(state);
      try {
        await job();
        this.finish(entry, 'done');
      } catch (err) {
        if (controller.signal.aborted) this.finish(entry, 'cancelled');
        else this.finish(entry, 'error', friendly(err).message);
      }
    });
  }

  private finish(entry: Active, state: Transfer['state'], error: string | null = null): void {
    entry.state.state = state;
    entry.state.error = error;
    if (state === 'done') entry.state.done = entry.state.total;
    this.active.delete(entry.state.tid);
    this.publish(entry.state);
  }

  private progress(entry: Active): (n: number) => void {
    let last = 0;
    return (n) => {
      entry.state.done += n;
      const now = Date.now();
      if (now - last > 120) {
        last = now;
        this.publish(entry.state);
      }
    };
  }

  cancel(tid: string): void {
    this.active.get(tid)?.controller.abort();
  }

  cancelAll(): void {
    this.active.forEach((a) => a.controller.abort());
  }

  upload(remoteDir: string, locals: string[]): string[] {
    return locals.map((local) => {
      const name = path.basename(local);
      const entry = this.create(name, 'up');
      this.enqueue(entry, async () => {
        const plan = await planLocal(local, join(remoteDir, name));
        entry.state.total = plan.files.reduce((sum, f) => sum + f.size, 0);
        entry.state.files = plan.files.length;
        this.publish(entry.state);
        const remote = this.fsOf();
        for (const dir of plan.dirs) await remote.ensureDir(dir);
        const onBytes = this.progress(entry);
        for (const file of plan.files) {
          entry.controller.signal.throwIfAborted();
          entry.state.current = path.basename(file.local);
          await remote.upload(file.local, file.remote, onBytes, entry.controller.signal);
        }
      });
      return entry.state.tid;
    });
  }

  download(items: { path: string; name: string; type: string; size: number }[], localDir: string): string[] {
    return items.map((item) => {
      const name = safeName(item.name);
      const entry = this.create(name, 'down');
      this.enqueue(entry, async () => {
        const remote = this.fsOf();
        const plan = item.type === 'dir' ? await planRemote(remote, item.path, path.join(localDir, name), entry.controller.signal) : { dirs: [], files: [{ remote: item.path, local: path.join(localDir, name), size: item.size }] };
        entry.state.total = plan.files.reduce((sum, f) => sum + f.size, 0);
        entry.state.files = plan.files.length;
        this.publish(entry.state);
        for (const dir of plan.dirs) fs.mkdirSync(dir, { recursive: true });
        const onBytes = this.progress(entry);
        for (const file of plan.files) {
          entry.controller.signal.throwIfAborted();
          entry.state.current = path.basename(file.local);
          fs.mkdirSync(path.dirname(file.local), { recursive: true });
          await remote.download(file.remote, file.local, onBytes, entry.controller.signal);
        }
      });
      return entry.state.tid;
    });
  }
}

export function safeName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
  return cleaned && cleaned !== '..' ? cleaned : '_';
}

interface UploadPlan {
  dirs: string[];
  files: { local: string; remote: string; size: number }[];
}

async function planLocal(local: string, remote: string): Promise<UploadPlan> {
  const plan: UploadPlan = { dirs: [], files: [] };
  const stat = await fs.promises.lstat(local);
  if (stat.isSymbolicLink()) throw new RemoteError('Symbolische Verknüpfungen werden nicht hochgeladen.');
  if (!stat.isDirectory()) {
    plan.files.push({ local, remote, size: stat.size });
    return plan;
  }
  const walk = async (dir: string, target: string): Promise<void> => {
    plan.dirs.push(target);
    for (const child of await fs.promises.readdir(dir, { withFileTypes: true })) {
      if (child.isSymbolicLink()) continue;
      const from = path.join(dir, child.name);
      const to = join(target, child.name);
      if (child.isDirectory()) await walk(from, to);
      else if (child.isFile()) plan.files.push({ local: from, remote: to, size: (await fs.promises.stat(from)).size });
    }
  };
  await walk(local, remote);
  return plan;
}

interface DownloadPlan {
  dirs: string[];
  files: { remote: string; local: string; size: number }[];
}

async function planRemote(remote: RemoteFs, root: string, localRoot: string, signal: AbortSignal): Promise<DownloadPlan> {
  const plan: DownloadPlan = { dirs: [], files: [] };
  const walk = async (dir: string, target: string): Promise<void> => {
    signal.throwIfAborted();
    plan.dirs.push(target);
    for (const entry of await remote.list(dir)) {
      const to = path.join(target, safeName(entry.name));
      if (entry.type === 'dir') await walk(entry.path, to);
      else if (entry.type === 'file' || (entry.type === 'link' && !isFolder(entry))) plan.files.push({ remote: entry.path, local: to, size: entry.size });
    }
  };
  await walk(root, localRoot);
  return plan;
}
