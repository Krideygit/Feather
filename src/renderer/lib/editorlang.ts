import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage, type LanguageSupport } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

type Loader = () => Promise<Extension>;

async function legacy(load: () => Promise<Record<string, unknown>>, key: string): Promise<Extension> {
  const mod = await load();
  return StreamLanguage.define(mod[key] as Parameters<typeof StreamLanguage.define>[0]);
}

const shell: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/shell'), 'shell');
const properties: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/properties'), 'properties');
const nginx: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/nginx'), 'nginx');
const toml: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/toml'), 'toml');
const dockerfile: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/dockerfile'), 'dockerFile');
const go: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/go'), 'go');
const rust: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/rust'), 'rust');
const lua: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/lua'), 'lua');
const ruby: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/ruby'), 'ruby');
const perl: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/perl'), 'perl');
const powershell: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/powershell'), 'powerShell');
const diff: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/diff'), 'diff');
const c: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'c');
const cpp: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'cpp');
const csharp: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'csharp');
const kotlin: Loader = () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'kotlin');

const now = (support: LanguageSupport): Loader => async () => support;

const BY_EXTENSION: Record<string, () => Loader> = {
  js: () => now(javascript()),
  mjs: () => now(javascript()),
  cjs: () => now(javascript()),
  jsx: () => now(javascript({ jsx: true })),
  ts: () => now(javascript({ typescript: true })),
  tsx: () => now(javascript({ typescript: true, jsx: true })),
  json: () => now(json()),
  jsonc: () => now(json()),
  mcmeta: () => now(json()),
  html: () => now(html()),
  htm: () => now(html()),
  vue: () => now(html()),
  css: () => now(css()),
  scss: () => now(css()),
  less: () => now(css()),
  xml: () => now(xml()),
  svg: () => now(xml()),
  xsd: () => now(xml()),
  pom: () => now(xml()),
  md: () => now(markdown()),
  markdown: () => now(markdown()),
  yml: () => now(yaml()),
  yaml: () => now(yaml()),
  py: () => now(python()),
  pyw: () => now(python()),
  php: () => now(php()),
  java: () => now(java()),
  sql: () => now(sql()),
  sh: () => shell,
  bash: () => shell,
  zsh: () => shell,
  env: () => properties,
  service: () => properties,
  timer: () => properties,
  socket: () => properties,
  properties: () => properties,
  ini: () => properties,
  conf: () => nginx,
  cnf: () => properties,
  cfg: () => properties,
  toml: () => toml,
  go: () => go,
  rs: () => rust,
  lua: () => lua,
  rb: () => ruby,
  pl: () => perl,
  ps1: () => powershell,
  diff: () => diff,
  patch: () => diff,
  c: () => c,
  h: () => c,
  cpp: () => cpp,
  cc: () => cpp,
  hpp: () => cpp,
  cs: () => csharp,
  kt: () => kotlin,
};

const BY_NAME: Record<string, () => Loader> = {
  dockerfile: () => dockerfile,
  '.bashrc': () => shell,
  '.profile': () => shell,
  '.zshrc': () => shell,
  '.bash_profile': () => shell,
  '.env': () => properties,
  '.gitconfig': () => properties,
  'nginx.conf': () => nginx,
  'server.properties': () => properties,
  'my.cnf': () => properties,
  'crontab': () => shell,
};

export function languageLabel(path: string): string {
  const name = (path.split('/').pop() ?? path).toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  if (BY_NAME[name]) return name;
  if (BY_EXTENSION[ext]) return ext.toUpperCase();
  return 'Text';
}

export async function loadLanguage(path: string, firstLine: string): Promise<Extension | null> {
  const name = (path.split('/').pop() ?? path).toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  let pick = BY_NAME[name] ?? (name.startsWith('nginx') || /\bsites-(available|enabled)\b/.test(path) ? () => nginx : undefined) ?? BY_EXTENSION[ext];
  if (!pick && firstLine.startsWith('#!')) {
    if (/\b(ba|z|da)?sh\b/.test(firstLine)) pick = () => shell;
    else if (/python/.test(firstLine)) pick = BY_EXTENSION.py;
    else if (/node/.test(firstLine)) pick = BY_EXTENSION.js;
    else if (/perl/.test(firstLine)) pick = () => perl;
    else if (/ruby/.test(firstLine)) pick = () => ruby;
  }
  if (!pick) return null;
  try {
    return await pick()();
  } catch {
    return null;
  }
}
