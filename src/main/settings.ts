import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Settings } from '../shared/types';

const DEFAULTS: Settings = { runInBackground: true };

const file = (): string => path.join(app.getPath('userData'), 'settings.json');

export function get(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function set(patch: Partial<Settings>): Settings {
  const next: Settings = { ...get() };
  if (typeof patch.runInBackground === 'boolean') next.runInBackground = patch.runInBackground;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  return next;
}
