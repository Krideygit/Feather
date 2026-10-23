import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { EN } from '../renderer/lib/i18n-en';
import { BUILTIN_LANGUAGES, MAX_PACK_BYTES, PACK_EXTENSION, buildTemplate, cleanMeta, mergePack, parsePack, type PackMeta, type ParsedPack } from '../shared/langpack';
import type { LanguageInfo } from '../shared/types';

export const dir = (): string => path.join(app.getPath('userData'), 'languages');

interface Loaded {
  file: string;
  pack: ParsedPack;
}

const cache = new Map<string, Record<string, string> | null>();

export const clearCache = (): void => cache.clear();

function readPacks(): Loaded[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir()).filter((n) => n.toLowerCase().endsWith(`.${PACK_EXTENSION}`)).sort();
  } catch {
    return [];
  }
  const out: Loaded[] = [];
  for (const name of names) {
    const file = path.join(dir(), name);
    try {
      if (fs.statSync(file).size > MAX_PACK_BYTES) continue;
      out.push({ file, pack: parsePack(fs.readFileSync(file, 'utf8'), EN) });
    } catch {
      continue;
    }
  }
  return out;
}

const total = Object.keys(EN).length;

export function list(): LanguageInfo[] {
  clearCache();
  const builtin: LanguageInfo[] = [
    { code: 'de', name: 'Deutsch', author: 'Feather', version: '', builtin: true, translated: total, total },
    { code: 'en', name: 'English', author: 'Feather', version: '', builtin: true, translated: total, total },
  ];
  const byCode = new Map<string, LanguageInfo>();
  for (const { pack } of readPacks()) byCode.set(pack.meta.code, { ...pack.meta, builtin: false, translated: pack.translated, total: pack.total });
  return [...builtin, ...[...byCode.values()].sort((a, b) => a.name.localeCompare(b.name))];
}

export function pack(code: string): Record<string, string> | null {
  if (BUILTIN_LANGUAGES.includes(code)) return null;
  const found = readPacks().filter((l) => l.pack.meta.code === code).pop();
  return found ? found.pack.strings : null;
}

export function dictionary(code: string): Record<string, string> | null {
  if (code === 'de') return null;
  if (cache.has(code)) return cache.get(code) ?? null;
  const merged = mergePack(EN, pack(code));
  cache.set(code, merged);
  return merged;
}

export function importFile(source: string): { info: LanguageInfo; skipped: number; replaced: boolean } {
  if (fs.statSync(source).size > MAX_PACK_BYTES) throw new Error('Die Sprachdatei ist zu groß.');
  const parsed = parsePack(fs.readFileSync(source, 'utf8'), EN);
  const target = path.join(dir(), `${parsed.meta.code}.${PACK_EXTENSION}`);
  const replaced = readPacks().some((l) => l.pack.meta.code === parsed.meta.code);
  for (const l of readPacks()) if (l.pack.meta.code === parsed.meta.code) fs.rmSync(l.file, { force: true });
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(target, buildTemplate(parsed.meta, EN, parsed.strings));
  clearCache();
  return { info: { ...parsed.meta, builtin: false, translated: parsed.translated, total: parsed.total }, skipped: parsed.skipped, replaced };
}

export function remove(code: string): void {
  if (BUILTIN_LANGUAGES.includes(code)) throw new Error('Eingebaute Sprachen lassen sich nicht entfernen.');
  for (const l of readPacks()) if (l.pack.meta.code === code) fs.rmSync(l.file, { force: true });
  clearCache();
}

export function writeTemplate(file: string, raw: Partial<Record<keyof PackMeta, unknown>>): number {
  const meta = cleanMeta(raw);
  fs.writeFileSync(file, buildTemplate(meta, EN, pack(meta.code) ?? undefined));
  return total;
}
