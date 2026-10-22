import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileCog,
  FileImage,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Link2,
  type LucideIcon,
} from 'lucide-react';
import type { RemoteEntry } from '../../shared/remote';

export const isFolder = (e: Pick<RemoteEntry, 'type' | 'linkTo'>): boolean => e.type === 'dir' || (e.type === 'link' && e.linkTo === 'dir');

export function dirname(p: string): string {
  const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
  const i = trimmed.lastIndexOf('/');
  return i <= 0 ? '/' : trimmed.slice(0, i);
}

export const basename = (p: string): string => p.replace(/\/+$/, '').split('/').pop() || '/';

export const joinPath = (dir: string, name: string): string => `${dir === '/' ? '' : dir.replace(/\/+$/, '')}/${name}`;

export function normalizePath(input: string, base: string): string {
  const raw = input.trim() || '/';
  const parts: string[] = [];
  for (const part of (raw.startsWith('/') ? raw : `${base}/${raw}`).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

export const isInside = (path: string, folder: string): boolean => path === folder || path.startsWith(folder === '/' ? '/' : `${folder}/`);

export const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const EXT: Record<string, LucideIcon> = {};
const assign = (icon: LucideIcon, list: string): void => list.split(' ').forEach((ext) => (EXT[ext] = icon));
assign(FileCode, 'js mjs cjs ts tsx jsx json html htm css scss less php py rb go rs java kt c h cpp hpp cs sql xml yml yaml toml vue svelte lua pl');
assign(FileText, 'txt md log csv rst ini cfg conf env readme license');
assign(FileImage, 'png jpg jpeg gif webp svg ico bmp avif');
assign(FileArchive, 'zip tar gz tgz bz2 xz 7z rar zst');
assign(FileAudio, 'mp3 wav flac ogg m4a');
assign(FileVideo, 'mp4 mkv mov avi webm');
assign(FileSpreadsheet, 'xlsx xls ods');
assign(FileTerminal, 'sh bash zsh fish bat ps1 service');
assign(FileCog, 'lock pid sock');

export function iconFor(entry: RemoteEntry, expanded: boolean): { Icon: LucideIcon; tone: string } {
  if (isFolder(entry)) return { Icon: expanded ? FolderOpen : Folder, tone: 'text-sky-400' };
  if (entry.type === 'link') return { Icon: Link2, tone: 'text-violet-400' };
  const name = entry.name.toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : name;
  const Icon = EXT[ext] ?? File;
  const tone = Icon === FileCode ? 'text-emerald-400' : Icon === FileImage ? 'text-pink-400' : Icon === FileArchive ? 'text-amber-400' : Icon === FileTerminal ? 'text-lime-400' : 'text-neutral-400';
  return { Icon, tone };
}

export function modeText(mode: number | null, type: RemoteEntry['type']): string {
  if (mode === null) return '';
  const bits = 'rwxrwxrwx';
  let out = type === 'dir' ? 'd' : type === 'link' ? 'l' : '-';
  for (let i = 0; i < 9; i++) out += mode & (1 << (8 - i)) ? (bits[i] as string) : '-';
  return out;
}

const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export const dateText = (ms: number): string => (ms ? dateFormat.format(ms) : '');

export function sortEntries(list: RemoteEntry[], key: 'name' | 'size' | 'mtime', dir: 1 | -1): RemoteEntry[] {
  return [...list].sort((a, b) => {
    const folders = Number(isFolder(b)) - Number(isFolder(a));
    if (folders) return folders;
    const by = key === 'size' ? a.size - b.size : key === 'mtime' ? a.mtime - b.mtime : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return (by || a.name.localeCompare(b.name, undefined, { numeric: true })) * dir;
  });
}
