import { useSyncExternalStore } from 'react';
import { BOT_DEFS, BOT_TEMPLATES, type BotEdge, type BotKind, type BotNode, type BotProject } from '../../shared/bot';

export interface BotEntry {
  id: string;
  name: string;
  updated: number;
}

const LIST_KEY = 'feather.bots';
const projectKey = (id: string): string => `feather.bot.${id}`;
const listeners = new Set<() => void>();
let cache: BotEntry[] | null = null;

function parseList(): BotEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((b): b is Partial<BotEntry> => !!b && typeof b === 'object')
      .map((b) => ({ id: typeof b.id === 'string' ? b.id : '', name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 40) : 'Bot', updated: typeof b.updated === 'number' ? b.updated : 0 }))
      .filter((b) => b.id);
  } catch {
    return [];
  }
}

function list(): BotEntry[] {
  if (!cache) cache = parseList();
  return cache;
}

function commit(next: BotEntry[]): boolean {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  cache = next;
  listeners.forEach((l) => l());
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useBots = (): BotEntry[] => useSyncExternalStore(subscribe, list);

export function loadProject(id: string): BotProject {
  try {
    const raw = JSON.parse(localStorage.getItem(projectKey(id)) ?? 'null') as Partial<BotProject> | null;
    if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return { nodes: [], edges: [] };
    const nodes = raw.nodes
      .filter((n): n is BotNode => !!n && typeof n.id === 'string' && typeof n.type === 'string' && n.type in BOT_DEFS && typeof n.position?.x === 'number' && typeof n.position?.y === 'number')
      .map((n) => ({ id: n.id, type: n.type, position: { x: n.position.x, y: n.position.y }, data: { ...BOT_DEFS[n.type as BotKind].defaults, ...(n.data ?? {}) } }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = raw.edges.filter((e): e is BotEdge => !!e && typeof e.id === 'string' && ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function saveProject(id: string, project: BotProject): boolean {
  try {
    localStorage.setItem(projectKey(id), JSON.stringify(project));
  } catch {
    return false;
  }
  commit(list().map((b) => (b.id === id ? { ...b, updated: Date.now() } : b)));
  return true;
}

export function createBot(name: string, templateId: string): BotEntry | null {
  const template = BOT_TEMPLATES.find((t) => t.id === templateId) ?? BOT_TEMPLATES[0];
  if (!template) return null;
  const entry: BotEntry = { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: name.trim().slice(0, 40) || 'Mein Bot', updated: Date.now() };
  try {
    localStorage.setItem(projectKey(entry.id), JSON.stringify(template.build()));
  } catch {
    return null;
  }
  return commit([...list(), entry]) ? entry : null;
}

export function renameBot(id: string, name: string): void {
  const clean = name.trim().slice(0, 40);
  if (clean) commit(list().map((b) => (b.id === id ? { ...b, name: clean } : b)));
}

export function duplicateBot(id: string): BotEntry | null {
  const source = list().find((b) => b.id === id);
  if (!source) return null;
  const entry: BotEntry = { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: `${source.name} (Kopie)`.slice(0, 40), updated: Date.now() };
  try {
    localStorage.setItem(projectKey(entry.id), JSON.stringify(loadProject(id)));
  } catch {
    return null;
  }
  return commit([...list(), entry]) ? entry : null;
}

export function deleteBot(id: string): void {
  try {
    localStorage.removeItem(projectKey(id));
  } catch {
    return;
  }
  commit(list().filter((b) => b.id !== id));
}

export const botById = (id: string): BotEntry | undefined => list().find((b) => b.id === id);
