export const LANG_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
export const BUILTIN_LANGUAGES = ['de', 'en'];
export const PACK_EXTENSION = 'featherlang';
export const MAX_PACK_BYTES = 4 * 1024 * 1024;

export interface PackMeta {
  code: string;
  name: string;
  author: string;
  version: string;
}

export interface ParsedPack {
  meta: PackMeta;
  strings: Record<string, string>;
  total: number;
  translated: number;
  skipped: number;
}

const slots = (text: string): string => (text.match(/\{\d+\}/g) ?? []).sort().join(',');

export function cleanCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!LANG_CODE.test(code)) throw new Error('Der Sprachcode muss aus 2 bis 3 Buchstaben bestehen, z. B. „tr“ oder „pt-br“.');
  if (BUILTIN_LANGUAGES.includes(code)) throw new Error('Die Sprachcodes „de“ und „en“ sind fest eingebaut.');
  return code;
}

export function cleanMeta(raw: Partial<Record<keyof PackMeta, unknown>>): PackMeta {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
  if (!name) throw new Error('Der Name der Sprache fehlt, z. B. „Türkçe“.');
  return {
    code: cleanCode(raw.code),
    name,
    author: typeof raw.author === 'string' ? raw.author.trim().slice(0, 60) : '',
    version: typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim().slice(0, 20) : '1.0.0',
  };
}

export function parsePack(text: string, reference: Record<string, string>): ParsedPack {
  if (text.length > MAX_PACK_BYTES) throw new Error('Die Sprachdatei ist zu groß.');
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('Die Datei ist keine gültige Sprachdatei. Beim Bearbeiten ist vermutlich ein Anführungszeichen oder Komma verloren gegangen.');
  }
  const file = (raw ?? {}) as { format?: unknown; strings?: unknown } & Partial<Record<keyof PackMeta, unknown>>;
  if (file.format !== undefined && file.format !== 1) throw new Error('Diese Sprachdatei stammt aus einer neueren Feather-Version.');
  const meta = cleanMeta(file);
  if (!file.strings || typeof file.strings !== 'object' || Array.isArray(file.strings)) throw new Error('In der Datei fehlt der Abschnitt „strings“ mit den Übersetzungen.');
  const strings: Record<string, string> = {};
  let skipped = 0;
  let translated = 0;
  for (const [key, value] of Object.entries(file.strings as Record<string, unknown>)) {
    if (!Object.hasOwn(reference, key) || typeof value !== 'string') {
      skipped++;
      continue;
    }
    const clean = value.trim();
    if (!clean) continue;
    if (slots(clean) !== slots(key)) {
      skipped++;
      continue;
    }
    strings[key] = clean;
    if (clean !== reference[key]) translated++;
  }
  const total = Object.keys(reference).length;
  if (Object.keys(strings).length === 0) throw new Error('Die Datei enthält keine verwendbaren Übersetzungen.');
  return { meta, strings, total, translated, skipped };
}

export function buildTemplate(meta: PackMeta, reference: Record<string, string>, existing?: Record<string, string>): string {
  const strings: Record<string, string> = {};
  for (const key of Object.keys(reference)) strings[key] = existing && Object.hasOwn(existing, key) ? (existing[key] as string) : (reference[key] as string);
  return `${JSON.stringify(
    {
      format: 1,
      hint: 'Translate only the values on the right. The keys on the left are the German original texts, the values are pre-filled with English. Keep placeholders such as {0} and {1} unchanged. Texts you leave in English stay English.',
      code: meta.code,
      name: meta.name,
      author: meta.author,
      version: meta.version,
      strings,
    },
    null,
    2,
  )}\n`;
}

export function mergePack(reference: Record<string, string>, pack: Record<string, string> | null): Record<string, string> {
  return pack ? { ...reference, ...pack } : reference;
}
