import { execFile } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import type { SaveeyeSettings } from '../shared/types';

const SEP = String.fromCharCode(92);
const CONSENT = ['HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'CapabilityAccessManager', 'ConsentStore'].join(SEP);
const KEYS = ['graphicsCaptureProgrammatic', 'graphicsCaptureWithoutBorder'].map((name) => `${CONSENT}${SEP}${name}`);
const CONTAINERS = ['NonPackaged', ...KEYS.map((k) => k.slice(k.lastIndexOf(SEP) + 1))];

export interface CaptureSource {
  app: string;
  active: boolean;
}

export function parseCaptureRegistry(output: string): CaptureSource[] {
  const found: CaptureSource[] = [];
  let current: { app: string; start: bigint; stop: bigint } | null = null;
  const flush = (): void => {
    if (current && current.start > 0n) found.push({ app: current.app, active: current.start > current.stop });
    current = null;
  };
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('HKEY_')) {
      flush();
      const leaf = line.slice(line.lastIndexOf(SEP) + 1);
      if (CONTAINERS.includes(leaf)) continue;
      current = { app: leaf.split('#').join(SEP), start: 0n, stop: 0n };
      continue;
    }
    const match = /^\s*(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(0x[0-9a-fA-F]+)/.exec(line);
    if (match && current) {
      const value = BigInt(match[2] as string);
      if (match[1] === 'LastUsedTimeStart') current.start = value;
      else current.stop = value;
    }
  }
  flush();
  return found;
}

const shortName = (app: string): string => (app.split(SEP).pop() ?? app).replace(/\.exe$/i, '');

function readRegistry(key: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key, '/s'], { windowsHide: true, timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (_err, stdout) => resolve(stdout ?? ''));
  });
}

function runningImages(): Promise<Set<string>> {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => {
      const names = new Set<string>();
      for (const line of (stdout ?? '').split(/\r?\n/)) {
        const match = /^"([^"]+)"/.exec(line);
        if (match) names.add((match[1] as string).toLowerCase());
      }
      resolve(names);
    });
  });
}

export function activeNames(sources: CaptureSource[], running: Set<string> | null): string[] {
  const names = new Set<string>();
  for (const source of sources) {
    if (!source.active) continue;
    const leaf = source.app.split(SEP).pop() ?? source.app;
    const name = shortName(source.app);
    if (/^(feather|electron)$/i.test(name)) continue;
    if (running && /\.exe$/i.test(leaf) && !running.has(leaf.toLowerCase())) continue;
    names.add(name);
  }
  return [...names];
}

export async function activeCaptures(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const outputs = await Promise.all(KEYS.map(readRegistry));
  const sources = outputs.flatMap((output) => parseCaptureRegistry(output));
  const candidates = sources.filter((s) => s.active);
  if (!candidates.length) return [];
  return activeNames(sources, await runningImages());
}

export interface CaptureNotice {
  active: boolean;
  sources: string[];
  transient: boolean;
}

export class Saveeye {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private config: SaveeyeSettings = { enabled: false, mode: 'ask', blurOnBlur: false };
  private sources: string[] = [];
  private transientTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly notify: (notice: CaptureNotice) => void,
  ) {}

  configure(config: SaveeyeSettings): void {
    this.config = config;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sources = [];
    if (config.enabled && process.platform === 'win32') {
      this.timer = setInterval(() => void this.poll(), 1500);
      this.timer.unref();
    }
    this.protect(config.enabled && config.mode === 'always');
    this.notify({ active: false, sources: [], transient: false });
  }

  protect(on: boolean): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.setContentProtection(on);
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.update(await activeCaptures(), false);
    } finally {
      this.busy = false;
    }
  }

  update(sources: string[], transient: boolean): void {
    if (!this.config.enabled) return;
    const changed = sources.length !== this.sources.length || sources.some((s, i) => s !== this.sources[i]);
    if (!changed) return;
    const starting = this.sources.length === 0 && sources.length > 0;
    this.sources = sources;
    if (starting && this.config.mode === 'ask') this.protect(true);
    if (sources.length === 0 && this.config.mode === 'ask') this.protect(false);
    this.notify({ active: sources.length > 0, sources, transient });
  }

  trigger(source: string): void {
    if (!this.config.enabled || this.config.mode === 'always') return;
    if (this.transientTimer) clearTimeout(this.transientTimer);
    this.update([source], true);
    this.transientTimer = setTimeout(() => this.update([], true), 6000);
    this.transientTimer.unref();
  }

  answer(allow: boolean): void {
    if (this.config.mode === 'ask') this.protect(!allow);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
