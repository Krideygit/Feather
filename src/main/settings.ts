import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { LANG_CODE } from '../shared/langpack';
import type { DatabaseSettings, TerminalSettings, SaveeyeSettings, Settings, Theme } from '../shared/types';

export const DEFAULTS: Settings = {
  runInBackground: true,
  theme: 'feather-dark',
  themes: [],
  language: 'de',
  database: { history: true, keepDeleted: true, autocomplete: true },
  terminal: { suggestions: true, hints: true },
  saveeye: { enabled: false, mode: 'ask', blurOnBlur: false },
};

const file = (): string => path.join(app.getPath('userData'), 'settings.json');
const HEX = /^#[0-9a-f]{6}$/i;

function cleanTheme(raw: unknown): Theme | null {
  const t = raw as Partial<Theme> | null;
  if (!t || typeof t.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(t.id) || typeof t.name !== 'string' || !t.name.trim()) return null;
  if (!HEX.test(String(t.accent))) return null;
  return {
    id: t.id,
    name: t.name.trim().slice(0, 40),
    mode: t.mode === 'light' ? 'light' : 'dark',
    accent: String(t.accent).toLowerCase(),
    hue: Math.max(0, Math.min(360, Number(t.hue) || 0)),
    saturation: Math.max(0, Math.min(40, Number(t.saturation) || 0)),
  };
}

function cleanSaveeye(raw: unknown, base: SaveeyeSettings): SaveeyeSettings {
  const s = (raw ?? {}) as Partial<SaveeyeSettings>;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : base.enabled,
    mode: s.mode === 'always' ? 'always' : s.mode === 'ask' ? 'ask' : base.mode,
    blurOnBlur: typeof s.blurOnBlur === 'boolean' ? s.blurOnBlur : base.blurOnBlur,
  };
}

function cleanDatabase(raw: unknown, base: DatabaseSettings): DatabaseSettings {
  const s = (raw ?? {}) as Partial<DatabaseSettings>;
  return {
    history: typeof s.history === 'boolean' ? s.history : base.history,
    keepDeleted: typeof s.keepDeleted === 'boolean' ? s.keepDeleted : base.keepDeleted,
    autocomplete: typeof s.autocomplete === 'boolean' ? s.autocomplete : base.autocomplete,
  };
}

function cleanTerminal(raw: unknown, base: TerminalSettings): TerminalSettings {
  const s = (raw ?? {}) as Partial<TerminalSettings>;
  return {
    suggestions: typeof s.suggestions === 'boolean' ? s.suggestions : base.suggestions,
    hints: typeof s.hints === 'boolean' ? s.hints : base.hints,
  };
}

function normalize(raw: Partial<Settings>, base: Settings): Settings {
  const themes = Array.isArray(raw.themes) ? raw.themes.map(cleanTheme).filter((t): t is Theme => t !== null).slice(0, 30) : base.themes;
  const theme = typeof raw.theme === 'string' && raw.theme ? raw.theme : base.theme;
  return {
    runInBackground: typeof raw.runInBackground === 'boolean' ? raw.runInBackground : base.runInBackground,
    theme,
    themes,
    language: typeof raw.language === 'string' && LANG_CODE.test(raw.language) ? raw.language : base.language,
    saveeye: cleanSaveeye(raw.saveeye, base.saveeye),
    database: cleanDatabase(raw.database, base.database),
    terminal: cleanTerminal(raw.terminal, base.terminal),
  };
}

export function get(): Settings {
  try {
    return normalize(JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Settings>, DEFAULTS);
  } catch {
    return { ...DEFAULTS, themes: [], saveeye: { ...DEFAULTS.saveeye }, database: { ...DEFAULTS.database }, terminal: { ...DEFAULTS.terminal } };
  }
}

export function set(patch: Partial<Settings>): Settings {
  const next = normalize(patch, get());
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  return next;
}

export const filePath = file;
