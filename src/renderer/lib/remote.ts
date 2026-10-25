import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { detachHelp, observeOutput } from './termhelp';
import { useSyncExternalStore } from 'react';
import {
  RemoteError,
  type RemoteErrorCode,
  type RemoteHost,
  type RemoteHostInput,
  type SessionInfo,
  type SessionOpen,
  type Transfer,
} from '../../shared/remote';
import { toast } from '../components/Toast';
import { askPassword, confirmHostKey } from '../remote/prompts';
import { forgetSession } from './modules';

export type SessionView = SessionInfo & {
  status: 'ready' | 'closed';
  reason: string;
  shell: 'idle' | 'running' | 'exited';
  transfers: Transfer[];
  filesTarget: { path: string; nonce: number } | null;
};

export interface Pending {
  key: string;
  name: string;
  color: string;
  protocol: SessionInfo['protocol'];
}

export interface RemoteState {
  hosts: RemoteHost[];
  hostsLoaded: boolean;
  sessions: SessionView[];
  pending: Pending[];
  active: string;
}

let state: RemoteState = { hosts: [], hostsLoaded: false, sessions: [], pending: [], active: 'home' };
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getRemote = (): RemoteState => state;

type SessionListener = (name: string, data: Record<string, unknown>) => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionEvent(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

const emitSession = (name: string, info: Pick<SessionInfo, 'sid' | 'name' | 'host' | 'port' | 'username' | 'protocol'>): void =>
  sessionListeners.forEach((l) => l(name, { sid: info.sid, name: info.name, host: info.host, port: info.port, username: info.username, protocol: info.protocol }));

function setRemote(patch: Partial<RemoteState> | ((s: RemoteState) => Partial<RemoteState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export const useRemote = <T>(selector: (s: RemoteState) => T): T => useSyncExternalStore(subscribe, () => selector(state));
export const useSession = (sid: string): SessionView | undefined => useRemote((s) => s.sessions.find((x) => x.sid === sid));

export async function callRemote<T = unknown>(method: string, params: object = {}): Promise<T> {
  const reply = await window.feather.remote(method, params);
  if (!reply.ok) throw new RemoteError(reply.error ?? 'Unbekannter Fehler', (reply.code as RemoteErrorCode | undefined) ?? 'generic', reply.data ?? {});
  return reply.result as T;
}

export async function attemptRemote<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
    return undefined;
  }
}

function patchSession(sid: string, patch: Partial<SessionView> | ((s: SessionView) => Partial<SessionView>)): void {
  setRemote((s) => ({ sessions: s.sessions.map((x) => (x.sid === sid ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x)) }));
}

export const setActiveTab = (active: string): void => setRemote({ active });

export async function loadHosts(): Promise<void> {
  const hosts = await callRemote<RemoteHost[]>('hosts.list');
  setRemote({ hosts, hostsLoaded: true });
}

export async function saveHost(input: RemoteHostInput): Promise<RemoteHost> {
  const saved = await callRemote<RemoteHost>('hosts.save', { input });
  await loadHosts();
  return saved;
}

export async function removeHost(id: string): Promise<void> {
  await callRemote('hosts.remove', { id });
  await loadHosts();
}

export interface ConnectSource {
  hostId?: string;
  draft?: RemoteHostInput;
  name: string;
  color: string;
  protocol: Pending['protocol'];
  host: string;
  port: number;
  auth: RemoteHostInput['auth'];
}

function addSession(info: SessionInfo): void {
  const view: SessionView = { ...info, status: 'ready', reason: '', shell: 'idle', transfers: [], filesTarget: null };
  setRemote((s) => ({ sessions: [...s.sessions.filter((x) => x.sid !== info.sid), view], active: info.sid }));
  emitSession('session.opened', info);
}

export async function connect(source: ConnectSource): Promise<boolean> {
  const key = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  setRemote((s) => ({ pending: [...s.pending, { key, name: source.name, color: source.color, protocol: source.protocol }], active: key }));
  const base: SessionOpen = source.hostId ? { hostId: source.hostId } : { draft: source.draft };
  let extra: Partial<SessionOpen> = {};
  let connected = false;
  let passwordTries = 0;

  try {
    for (let attempt = 0; attempt < 6 && !connected; attempt++) {
      try {
        addSession(await callRemote<SessionInfo>('session.open', { ...base, ...extra }));
        connected = true;
      } catch (err) {
        if (!(err instanceof RemoteError)) throw err;
        const answer = await recover(err, source, passwordTries);
        if (!answer) break;
        if (err.code === 'need-password' || err.code === 'auth') passwordTries++;
        extra = { ...extra, ...answer };
      }
    }
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    setRemote((s) => ({ pending: s.pending.filter((p) => p.key !== key), active: s.active === key ? 'home' : s.active }));
  }
  return connected;
}

async function recover(err: RemoteError, source: ConnectSource, tries: number): Promise<Partial<SessionOpen> | null> {
  const canRemember = Boolean(source.hostId);
  const target = `${source.host}:${source.port}`;
  switch (err.code) {
    case 'hostkey-new':
    case 'hostkey-changed': {
      const trusted = await confirmHostKey({ target, fingerprint: String(err.data.fingerprint), known: err.data.known ? String(err.data.known) : undefined });
      return trusted ? { trust: String(err.data.fingerprint) } : null;
    }
    case 'need-passphrase': {
      const answer = await askPassword({ title: 'Passphrase eingeben', message: `${err.message} Gib die Passphrase für den Schlüssel von „${source.name}“ ein.`, label: 'Passphrase', canRemember });
      return answer ? { passphrase: answer.password, remember: answer.remember } : null;
    }
    case 'need-password':
    case 'auth': {
      if (err.code === 'auth' && (source.auth !== 'password' || tries >= 3)) {
        toast(err.message, 'error');
        return null;
      }
      const answer = await askPassword({
        title: err.code === 'auth' ? 'Anmeldung fehlgeschlagen' : 'Passwort eingeben',
        message: err.code === 'auth' ? `${err.message} Versuche es mit einem anderen Passwort.` : `Gib das Passwort für „${source.name}“ ein.`,
        label: 'Passwort',
        canRemember,
      });
      return answer ? { password: answer.password, remember: answer.remember } : null;
    }
    default:
      toast(err.message, 'error');
      return null;
  }
}

export async function reconnect(sid: string): Promise<void> {
  const session = getRemote().sessions.find((s) => s.sid === sid);
  if (!session) return;
  let extra: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const info = await callRemote<SessionInfo>('session.reconnect', { sid, ...extra });
      const terminal = terminals.get(sid);
      terminal?.term.writeln('\r\n\x1b[32m[Feather] Verbindung wiederhergestellt\x1b[0m');
      patchSession(sid, { ...info, status: 'ready', reason: '', shell: 'idle' });
      return;
    } catch (err) {
      if (!(err instanceof RemoteError)) return void toast(String(err), 'error');
      const source: ConnectSource = { hostId: session.hostId ?? undefined, name: session.name, color: session.color, protocol: session.protocol, host: session.host, port: session.port, auth: 'password' };
      const answer = await recover(err, source, attempt);
      if (!answer) return;
      extra = { ...extra, ...answer };
    }
  }
}

export async function closeSession(sid: string): Promise<void> {
  const closing = getRemote().sessions.find((s) => s.sid === sid);
  if (closing) emitSession('session.closed', closing);
  const terminal = terminals.get(sid);
  if (terminal) {
    detachHelp(sid);
    terminal.term.dispose();
    terminals.delete(sid);
  }
  setRemote((s) => {
    const sessions = s.sessions.filter((x) => x.sid !== sid);
    return { sessions, active: s.active === sid ? 'home' : s.active };
  });
  forgetSession(sid);
  await callRemote('session.close', { sid }).catch(() => undefined);
}

export const showInFiles = (sid: string, path: string): void => patchSession(sid, { filesTarget: { path, nonce: Date.now() } });

export interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
  opened: boolean;
}

const terminals = new Map<string, TerminalEntry>();

const FONT_KEY = 'feather.term.font';
export const TERM_FONT = '"JetBrains Mono", "Cascadia Mono", "Cascadia Code", Consolas, monospace';

export function savedFontSize(): number {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    if (n >= 9 && n <= 28) return n;
  } catch {
    return 13;
  }
  return 13;
}

export function saveFontSize(size: number): void {
  try {
    localStorage.setItem(FONT_KEY, String(size));
  } catch {
    return;
  }
}

export function terminalFor(sid: string): TerminalEntry {
  const existing = terminals.get(sid);
  if (existing) return existing;
  const term = new Terminal({
    fontFamily: TERM_FONT,
    fontSize: savedFontSize(),
    lineHeight: 1.18,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    allowProposedApi: true,
    macOptionIsMeta: true,
    theme: {
      background: '#0f0f0f',
      foreground: '#d4d4d4',
      cursor: '#38bdf8',
      cursorAccent: '#0f0f0f',
      selectionBackground: 'rgba(14, 165, 233, 0.32)',
      scrollbarSliderBackground: 'rgba(163, 163, 163, 0.28)',
      scrollbarSliderHoverBackground: 'rgba(163, 163, 163, 0.45)',
      scrollbarSliderActiveBackground: 'rgba(163, 163, 163, 0.6)',
      black: '#262626',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#d4d4d4',
      brightBlack: '#737373',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde047',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#fafafa',
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_event, uri) => void window.feather.openExternal(uri)));
  term.onData((data) => window.feather.remoteSend('term.write', { sid, data }));
  term.onResize(({ cols, rows }) => window.feather.remoteSend('term.resize', { sid, cols, rows }));
  const entry = { term, fit, opened: false };
  terminals.set(sid, entry);
  return entry;
}

export async function startShell(sid: string): Promise<void> {
  const session = getRemote().sessions.find((s) => s.sid === sid);
  if (!session || session.shell === 'running' || session.status !== 'ready') return;
  const { term } = terminalFor(sid);
  patchSession(sid, { shell: 'running' });
  try {
    await callRemote('term.start', { sid, cols: term.cols, rows: term.rows });
  } catch (err) {
    patchSession(sid, { shell: 'exited' });
    term.writeln(`\r\n\x1b[31m[Feather] ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
  }
}

export function restartShell(sid: string): void {
  patchSession(sid, { shell: 'idle' });
}

export function sendToTerminal(sid: string, data: string): void {
  window.feather.remoteSend('term.write', { sid, data });
}

type TransferListener = (t: Transfer) => void;
const transferListeners = new Set<TransferListener>();

export function onTransfer(listener: TransferListener): () => void {
  transferListeners.add(listener);
  return () => transferListeners.delete(listener);
}

const FINISHED: Transfer['state'][] = ['done', 'error', 'cancelled'];

function applyTransfer(t: Transfer): void {
  patchSession(t.sid, (s) => {
    const rest = s.transfers.filter((x) => x.tid !== t.tid);
    return { transfers: [...rest, t].slice(-40) };
  });
  if (FINISHED.includes(t.state)) transferListeners.forEach((l) => l(t));
}

export const dismissTransfers = (sid: string): void => patchSession(sid, (s) => ({ transfers: s.transfers.filter((t) => !FINISHED.includes(t.state)) }));

export function listenToRemote(): () => void {
  return window.feather.onRemoteEvent((name, data) => {
    if (name === 'term.data') {
      const { sid, data: text } = data as { sid: string; data: string };
      terminals.get(sid)?.term.write(text);
      observeOutput(sid, text);
    } else if (name === 'term.exit') {
      const { sid } = data as { sid: string };
      patchSession(sid, { shell: 'exited' });
      terminals.get(sid)?.term.writeln('\r\n\x1b[33m[Feather] Das Terminal wurde beendet.\x1b[0m');
    } else if (name === 'session.closed') {
      const { sid, reason } = data as { sid: string; reason: string };
      patchSession(sid, { status: 'closed', reason, shell: 'exited' });
      terminals.get(sid)?.term.writeln(`\r\n\x1b[31m[Feather] ${reason}\x1b[0m`);
    } else if (name === 'transfer') {
      applyTransfer(data as Transfer);
    }
  });
}
