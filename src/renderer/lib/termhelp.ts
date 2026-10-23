import type { Terminal } from '@xterm/xterm';
import { useSyncExternalStore } from 'react';
import { detectHint, extractInput, suggestInput, type Hint, type HistoryItem, type TermItem } from '../../shared/termcomplete';
import { getState } from './store';

export interface HelpDeps {
  send: (data: string) => void;
  hostKey: () => string;
  isRoot: () => boolean;
  manager: () => string;
  units: () => string[];
  call: (method: string, params: object) => Promise<unknown>;
}

export interface HelpState {
  items: TermItem[];
  selected: number;
  x: number;
  y: number;
  cellH: number;
  hint: Hint | null;
}

interface Runtime {
  term: Terminal;
  deps: HelpDeps;
  history: HistoryItem[] | null;
  loadedFor: string;
  input: string;
  shell: boolean;
  suppressedFor: string | null;
  force: boolean;
  lastCommand: string | null;
  tail: string;
  computeTimer: ReturnType<typeof setTimeout> | null;
  hintTimer: ReturnType<typeof setTimeout> | null;
  hintExpire: ReturnType<typeof setTimeout> | null;
  dismissedHint: string | null;
}

const EMPTY: HelpState = { items: [], selected: 0, x: 0, y: 0, cellH: 0, hint: null };
const runtimes = new Map<string, Runtime>();
let states: Record<string, HelpState> = {};
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function set(sid: string, patch: Partial<HelpState>): void {
  const current = states[sid] ?? EMPTY;
  const next = { ...current, ...patch };
  if (next.items === current.items && next.selected === current.selected && next.x === current.x && next.y === current.y && next.hint === current.hint && next.cellH === current.cellH) return;
  states = { ...states, [sid]: next };
  listeners.forEach((l) => l());
}

export const useHelp = (sid: string): HelpState => useSyncExternalStore(subscribe, () => states[sid] ?? EMPTY);

const options = () => getState().settings.terminal;

async function loadHistory(sid: string, rt: Runtime): Promise<void> {
  const host = rt.deps.hostKey();
  if (rt.loadedFor === host) return;
  rt.loadedFor = host;
  try {
    rt.history = (await rt.deps.call('cmdhistory.list', { host })) as HistoryItem[];
  } catch {
    rt.history = [];
  }
  schedule(sid);
}

function context(rt: Runtime) {
  return { history: rt.history ?? [], units: rt.deps.units(), isRoot: rt.deps.isRoot(), manager: rt.deps.manager() };
}

function currentLine(term: Terminal): { before: string; after: string } | null {
  const buffer = term.buffer.active;
  if (buffer.type === 'alternate') return null;
  const row = buffer.baseY + buffer.cursorY;
  let line = buffer.getLine(row);
  if (!line) return null;
  const after = line.translateToString(true, buffer.cursorX);
  let text = line.translateToString(false, 0, buffer.cursorX);
  let guard = 0;
  let index = row;
  while (line?.isWrapped && guard++ < 20) {
    index--;
    line = buffer.getLine(index);
    if (line) text = line.translateToString(false) + text;
  }
  return { before: text, after };
}

function compute(sid: string): void {
  const rt = runtimes.get(sid);
  if (!rt) return;
  rt.computeTimer = null;
  const cfg = options();
  if (!cfg.suggestions) return set(sid, { items: [] });
  const line = currentLine(rt.term);
  if (!line || line.after.trim() !== '') {
    rt.input = '';
    rt.shell = false;
    return set(sid, { items: [] });
  }
  const parsed = extractInput(line.before);
  if (!parsed) {
    rt.input = '';
    rt.shell = false;
    return set(sid, { items: [] });
  }
  rt.input = parsed.input;
  rt.shell = parsed.shell;
  if (!parsed.shell) return set(sid, { items: [] });
  if (rt.suppressedFor !== null && rt.suppressedFor !== parsed.input) rt.suppressedFor = null;
  if (rt.suppressedFor === parsed.input) return set(sid, { items: [] });
  void loadHistory(sid, rt);
  const items = suggestInput(parsed.input, context(rt), rt.force);
  const screen = rt.term.element?.querySelector<HTMLElement>('.xterm-screen');
  if (!screen || items.length === 0) return set(sid, { items: [] });
  const cellW = screen.clientWidth / rt.term.cols;
  const cellH = screen.clientHeight / rt.term.rows;
  const buffer = rt.term.buffer.active;
  const previous = states[sid];
  const same = previous && previous.items.length === items.length && previous.items.every((p, i) => p.label === items[i]?.label);
  set(sid, { items, selected: same ? previous.selected : 0, x: buffer.cursorX * cellW, y: (buffer.cursorY + 1) * cellH, cellH });
}

function schedule(sid: string): void {
  const rt = runtimes.get(sid);
  if (!rt) return;
  if (rt.computeTimer) clearTimeout(rt.computeTimer);
  rt.computeTimer = setTimeout(() => compute(sid), 50);
}

export function attachHelp(sid: string, term: Terminal, deps: HelpDeps): void {
  if (runtimes.has(sid)) return;
  const rt: Runtime = { term, deps, history: null, loadedFor: '', input: '', shell: false, suppressedFor: null, force: false, lastCommand: null, tail: '', computeTimer: null, hintTimer: null, hintExpire: null, dismissedHint: null };
  runtimes.set(sid, rt);
  term.onWriteParsed(() => schedule(sid));
  term.onData((data) => helpInput(sid, data));
}

export function detachHelp(sid: string): void {
  const rt = runtimes.get(sid);
  if (rt) {
    for (const t of [rt.computeTimer, rt.hintTimer, rt.hintExpire]) if (t) clearTimeout(t);
  }
  runtimes.delete(sid);
  const { [sid]: _gone, ...rest } = states;
  states = rest;
  listeners.forEach((l) => l());
}

export function helpInput(sid: string, data: string): void {
  const rt = runtimes.get(sid);
  if (!rt) return;
  if (data.includes('\r')) {
    const cmd = rt.input.trim();
    if (rt.shell && cmd && options().suggestions) {
      rt.lastCommand = cmd;
      rt.force = false;
      const host = rt.deps.hostKey();
      void rt.deps.call('cmdhistory.add', { host, cmd }).then((res) => {
        if ((res as { added?: boolean }).added && rt.history) {
          const found = rt.history.find((h) => h.cmd === cmd);
          if (found) {
            found.count++;
            found.last = Date.now();
          } else rt.history.push({ cmd, count: 1, last: Date.now() });
        }
      }).catch(() => undefined);
    } else if (!rt.shell) {
      rt.lastCommand = null;
    }
    rt.tail = '';
    rt.dismissedHint = null;
    if (rt.hintTimer) clearTimeout(rt.hintTimer);
    set(sid, { items: [], hint: null });
    return;
  }
  if (data === '\x03' || data === '\x04') {
    rt.force = false;
    set(sid, { items: [] });
    return;
  }
  schedule(sid);
}

export function observeOutput(sid: string, text: string): void {
  const rt = runtimes.get(sid);
  if (!rt || !options().hints || !rt.lastCommand) return;
  rt.tail = (rt.tail + text).slice(-3000);
  if (rt.hintTimer) clearTimeout(rt.hintTimer);
  rt.hintTimer = setTimeout(() => {
    const hint = detectHint(rt.tail, rt.lastCommand, { isRoot: rt.deps.isRoot(), manager: rt.deps.manager() });
    if (!hint || hint.id === rt.dismissedHint) return;
    if (states[sid]?.hint?.id === hint.id) return;
    set(sid, { hint });
    if (rt.hintExpire) clearTimeout(rt.hintExpire);
    rt.hintExpire = setTimeout(() => {
      if (states[sid]?.hint?.id === hint.id) set(sid, { hint: null });
    }, 30_000);
  }, 450);
}

export function acceptSuggestion(sid: string): void {
  const rt = runtimes.get(sid);
  const state = states[sid];
  const item = state?.items[state.selected];
  if (!rt || !item) return;
  const space = item.kind === 'command' || item.kind === 'subcommand' ? ' ' : '';
  rt.suppressedFor = null;
  set(sid, { items: [] });
  rt.deps.send(item.append + space);
}

export function moveSelection(sid: string, delta: number): void {
  const state = states[sid];
  if (!state || state.items.length === 0) return;
  set(sid, { selected: (state.selected + delta + state.items.length) % state.items.length });
}

export function dismissSuggestions(sid: string): void {
  const rt = runtimes.get(sid);
  if (!rt) return;
  rt.suppressedFor = rt.input;
  rt.force = false;
  set(sid, { items: [] });
}

export function forceSuggestions(sid: string): void {
  const rt = runtimes.get(sid);
  if (!rt) return;
  rt.force = true;
  rt.suppressedFor = null;
  compute(sid);
}

export function applyHint(sid: string): void {
  const rt = runtimes.get(sid);
  const hint = states[sid]?.hint;
  if (!rt || !hint) return;
  rt.dismissedHint = hint.id;
  set(sid, { hint: null });
  if (hint.command) rt.deps.send(hint.command);
  rt.term.focus();
}

export function dismissHint(sid: string): void {
  const rt = runtimes.get(sid);
  const hint = states[sid]?.hint;
  if (rt && hint) rt.dismissedHint = hint.id;
  set(sid, { hint: null });
  rt?.term.focus();
}

export function resetHelpHistory(): void {
  for (const rt of runtimes.values()) {
    rt.history = null;
    rt.loadedFor = '';
  }
}

export function handleHelpKey(sid: string, event: KeyboardEvent): boolean {
  if (event.type !== 'keydown' || !runtimes.has(sid) || !options().suggestions) return false;
  if (event.ctrlKey && !event.shiftKey && !event.altKey && event.code === 'Space') {
    event.preventDefault();
    forceSuggestions(sid);
    return true;
  }
  const state = states[sid];
  if (!state || state.items.length === 0) return false;
  if ((event.key === 'Tab' || event.key === 'ArrowRight') && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    event.preventDefault();
    acceptSuggestion(sid);
    return true;
  }
  if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    moveSelection(sid, event.key === 'ArrowDown' ? 1 : -1);
    return true;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    dismissSuggestions(sid);
    return true;
  }
  return false;
}
