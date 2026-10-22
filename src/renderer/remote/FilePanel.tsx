import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  ClipboardCopy,
  Eye,
  EyeOff,
  FilePlus,
  FolderInput,
  FolderPlus,
  FolderUp,
  House,
  Loader2,
  Pencil,
  Plug,
  RefreshCw,
  Shield,
  SquareTerminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { RemoteEntry } from '../../shared/remote';
import { Notice } from '../components/Bits';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { confirmDialog } from '../components/Layers';
import { toast } from '../components/Toast';
import { formatBytes } from '../lib/format';
import { attemptRemote, callRemote, onTransfer, reconnect, sendToTerminal, type SessionView } from '../lib/remote';
import { openChmod } from './Chmod';
import { openRemoteEditor } from './Editor';
import { TransfersPanel } from './TransfersPanel';
import { basename, dateText, dirname, iconFor, isFolder, isInside, joinPath, modeText, normalizePath, shellQuote, sortEntries } from './fileutils';

type SortKey = 'name' | 'size' | 'mtime';

interface DirState {
  entries?: RemoteEntry[];
  loading: boolean;
  error?: string;
}

type Edit = { kind: 'rename'; path: string } | { kind: 'file' | 'folder'; parent: string };

type Row =
  | { kind: 'entry'; key: string; entry: RemoteEntry; depth: number; expanded: boolean }
  | { kind: 'new'; key: string; parent: string; depth: number; type: 'file' | 'folder' }
  | { kind: 'note'; key: string; depth: number; text: string; error?: boolean };

const HIDDEN_KEY = 'feather.remote.hidden';
const DRAG_TYPE = 'application/x-feather-remote';

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function NameInput({ initial, placeholder, isFile, onCommit, onCancel }: { initial: string; placeholder?: string; isFile: boolean; onCommit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = isFile ? initial.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, isFile]);

  const finish = (commit: boolean): void => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (commit && name && name !== initial) onCommit(name);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      className="min-w-0 flex-1 h-6 rounded border border-primary bg-neutral-950 px-1.5 text-[13px] text-neutral-100 outline-none"
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') {
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => finish(true)}
      data-bind="name-input"
    />
  );
}

export function FilePanel({ session }: { session: SessionView; visible: boolean }) {
  const { sid } = session;
  const ready = session.status === 'ready' && !session.filesError;
  const [root, setRoot] = useState(session.home);
  const [pathText, setPathText] = useState(session.home);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [edit, setEdit] = useState<Edit | null>(null);
  const [showHidden, setShowHidden] = useState(readHidden);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
  const [width, setWidth] = useState(600);
  const box = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  const uploadDirs = useRef(new Map<string, string>());
  const latest = useRef({ dirs, root, open });
  latest.current = { dirs, root, open };

  const load = useCallback(
    async (path: string): Promise<void> => {
      setDirs((d) => ({ ...d, [path]: { ...d[path], loading: true, error: undefined } }));
      try {
        const res = await callRemote<{ path: string; entries: RemoteEntry[] }>('fs.list', { sid, path });
        setDirs((d) => ({ ...d, [path]: { entries: res.entries, loading: false } }));
      } catch (err) {
        setDirs((d) => ({ ...d, [path]: { entries: d[path]?.entries, loading: false, error: err instanceof Error ? err.message : String(err) } }));
      }
    },
    [sid],
  );

  useEffect(() => {
    if (ready) void load(root);
  }, [root, ready, load]);

  useEffect(() => {
    if (!ready) return;
    latest.current.open.forEach((p) => void load(p));
  }, [ready, load]);

  useEffect(
    () =>
      onTransfer((t) => {
        if (t.sid !== sid) return;
        if (t.direction === 'up') {
          const dir = uploadDirs.current.get(t.tid);
          uploadDirs.current.delete(t.tid);
          if (dir && latest.current.dirs[dir]) void load(dir);
        } else if (t.state === 'done') {
          toast(`„${t.name}“ wurde heruntergeladen.`, 'success');
        }
      }),
    [sid, load],
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, showHidden ? '1' : '0');
    } catch {
      return;
    }
  }, [showHidden]);

  const rows = useMemo((): Row[] => {
    const out: Row[] = [];
    const walk = (dir: string, depth: number): void => {
      const state = dirs[dir];
      if (!state?.entries) {
        if (state?.error) out.push({ kind: 'note', key: `e:${dir}`, depth, text: state.error, error: true });
        else out.push({ kind: 'note', key: `l:${dir}`, depth, text: 'Wird geladen …' });
        return;
      }
      if (edit && edit.kind !== 'rename' && edit.parent === dir) out.push({ kind: 'new', key: `n:${dir}`, parent: dir, depth, type: edit.kind });
      const list = sortEntries(
        state.entries.filter((e) => showHidden || !e.name.startsWith('.')),
        sort.key,
        sort.dir,
      );
      if (!list.length && !(edit && edit.kind !== 'rename' && edit.parent === dir)) out.push({ kind: 'note', key: `x:${dir}`, depth, text: 'Dieser Ordner ist leer.' });
      for (const entry of list) {
        const expanded = isFolder(entry) && open.has(entry.path);
        out.push({ kind: 'entry', key: entry.path, entry, depth, expanded });
        if (expanded) walk(entry.path, depth + 1);
      }
    };
    walk(root, 0);
    return out;
  }, [dirs, open, root, edit, showHidden, sort]);

  const entryRows = useMemo(() => rows.filter((r): r is Extract<Row, { kind: 'entry' }> => r.kind === 'entry'), [rows]);
  const selectedEntries = (): RemoteEntry[] => entryRows.filter((r) => selected.has(r.entry.path)).map((r) => r.entry);
  const columns = width >= 620 ? 4 : width >= 470 ? 3 : 2;
  const template = ['minmax(0,1fr)', '72px', '118px', '86px'].slice(0, columns).join(' ');

  function navigate(target: string): void {
    const next = normalizePath(target, root);
    setRoot(next);
    setPathText(next);
    setOpen(new Set());
    setSelected(new Set());
    setEdit(null);
  }

  function refresh(): void {
    void load(root);
    open.forEach((p) => void load(p));
  }

  function toggle(entry: RemoteEntry): void {
    if (!isFolder(entry)) return;
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
    if (!open.has(entry.path) && !dirs[entry.path]?.entries) void load(entry.path);
  }

  function expand(path: string): void {
    if (path === root) return;
    setOpen((prev) => new Set(prev).add(path));
    if (!latest.current.dirs[path]?.entries) void load(path);
  }

  function activate(entry: RemoteEntry): void {
    if (isFolder(entry)) toggle(entry);
    else openRemoteEditor(sid, entry.path, () => void load(dirname(entry.path)));
  }

  function select(path: string, event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>): void {
    if (event.shiftKey && anchor.current) {
      const paths = entryRows.map((r) => r.entry.path);
      const a = paths.indexOf(anchor.current);
      const b = paths.indexOf(path);
      if (a >= 0 && b >= 0) return setSelected(new Set(paths.slice(Math.min(a, b), Math.max(a, b) + 1)));
    }
    if (event.ctrlKey || event.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    } else {
      setSelected(new Set([path]));
    }
    anchor.current = path;
  }

  async function createItem(parent: string, name: string, type: 'file' | 'folder'): Promise<void> {
    setEdit(null);
    if (/[/\0]/.test(name) || name === '.' || name === '..') return void toast('Dieser Name ist nicht erlaubt.', 'error');
    const target = joinPath(parent, name);
    const ok = await attemptRemote(callRemote(type === 'file' ? 'fs.touch' : 'fs.mkdir', { sid, path: target }).then(() => true));
    if (!ok) return;
    await load(parent);
    setSelected(new Set([target]));
    anchor.current = target;
    if (type === 'file') openRemoteEditor(sid, target, () => void load(parent));
  }

  function startNew(parent: string, type: 'file' | 'folder'): void {
    expand(parent);
    setEdit({ kind: type, parent });
  }

  async function rename(entry: RemoteEntry, name: string): Promise<void> {
    setEdit(null);
    if (/[/\0]/.test(name) || name === '.' || name === '..') return void toast('Dieser Name ist nicht erlaubt.', 'error');
    const parent = dirname(entry.path);
    if (dirs[parent]?.entries?.some((e) => e.name === name)) return void toast(`„${name}“ existiert hier bereits.`, 'error');
    const to = joinPath(parent, name);
    const ok = await attemptRemote(callRemote('fs.rename', { sid, from: entry.path, to }).then(() => true));
    if (!ok) return;
    setOpen((prev) => new Set([...prev].filter((p) => !isInside(p, entry.path))));
    setSelected(new Set([to]));
    anchor.current = to;
    await load(parent);
  }

  async function remove(entries: RemoteEntry[]): Promise<void> {
    if (!entries.length) return;
    const names = entries.slice(0, 6).map((e) => `• ${e.name}${isFolder(e) ? ' (Ordner mit Inhalt)' : ''}`).join('\n');
    const more = entries.length > 6 ? `\n… und ${entries.length - 6} weitere` : '';
    const ok = await confirmDialog({
      title: entries.length === 1 ? `„${entries[0]?.name}“ löschen?` : `${entries.length} Elemente löschen?`,
      message: `${names}${more}\n\nDas kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    const done = await attemptRemote(callRemote('fs.remove', { sid, items: entries.map((e) => ({ path: e.path, type: e.type })) }).then(() => true));
    setOpen((prev) => new Set([...prev].filter((p) => !entries.some((e) => isInside(p, e.path)))));
    setSelected(new Set());
    await Promise.all([...new Set(entries.map((e) => dirname(e.path)))].map((p) => load(p)));
    if (done) toast(entries.length === 1 ? 'Gelöscht.' : `${entries.length} Elemente gelöscht.`, 'success');
  }

  async function upload(dir: string, locals: string[]): Promise<void> {
    if (!locals.length) return;
    const existing = await attemptRemote(callRemote<string[]>('fs.exists', { sid, dir, names: locals.map(basename) }));
    if (!existing) return;
    if (existing.length) {
      const ok = await confirmDialog({
        title: 'Vorhandene Dateien überschreiben?',
        message: `${existing.slice(0, 6).join(', ')}${existing.length > 6 ? ' …' : ''} ${existing.length === 1 ? 'existiert' : 'existieren'} im Zielordner bereits. Ordner werden zusammengeführt, Dateien ersetzt.`,
        confirmLabel: 'Überschreiben',
        danger: true,
      });
      if (!ok) return;
    }
    const tids = await attemptRemote(callRemote<string[]>('transfer.upload', { sid, remoteDir: dir, local: locals }));
    tids?.forEach((tid) => uploadDirs.current.set(tid, dir));
  }

  async function pickAndUpload(dir: string, kind: 'files' | 'folder'): Promise<void> {
    const picked = await attemptRemote(callRemote<string[]>('local.pick', { kind }));
    if (picked?.length) await upload(dir, picked);
  }

  async function download(entries: RemoteEntry[]): Promise<void> {
    if (!entries.length) return;
    const target = await window.feather.pickFolder();
    if (!target) return;
    const existing = await attemptRemote(callRemote<string[]>('local.exists', { dir: target, names: entries.map((e) => e.name) }));
    if (!existing) return;
    if (existing.length) {
      const ok = await confirmDialog({ title: 'Lokale Dateien überschreiben?', message: `${existing.slice(0, 6).join(', ')} ${existing.length === 1 ? 'existiert' : 'existieren'} im Zielordner schon.`, confirmLabel: 'Überschreiben', danger: true });
      if (!ok) return;
    }
    const items = entries.map((e) => ({ path: e.path, name: e.name, type: isFolder(e) ? 'dir' : 'file', size: e.size }));
    await attemptRemote(callRemote('transfer.download', { sid, items, localDir: target }));
  }

  async function move(paths: string[], targetDir: string): Promise<void> {
    const moving = paths.filter((p) => dirname(p) !== targetDir && !isInside(targetDir, p));
    if (!moving.length) return;
    const clash = await attemptRemote(callRemote<string[]>('fs.exists', { sid, dir: targetDir, names: moving.map(basename) }));
    if (!clash) return;
    if (clash.length) return void toast(`„${clash[0]}“ existiert im Zielordner bereits.`, 'error');
    for (const from of moving) {
      const ok = await attemptRemote(callRemote('fs.rename', { sid, from, to: joinPath(targetDir, basename(from)) }).then(() => true));
      if (!ok) break;
    }
    setOpen((prev) => new Set([...prev].filter((p) => !moving.some((m) => isInside(p, m)))));
    setSelected(new Set());
    expand(targetDir);
    await Promise.all([...new Set([...moving.map(dirname), targetDir])].map((p) => load(p)));
  }

  function inTerminal(path: string): void {
    sendToTerminal(sid, `\x15cd ${shellQuote(path)}\r`);
    toast('Terminal wechselt in den Ordner.', 'info');
  }

  function entryMenu(entry: RemoteEntry, targets: RemoteEntry[]): MenuEntry[] {
    const many = targets.length > 1;
    const folder = isFolder(entry);
    const canCd = session.terminal && session.shell === 'running';
    const items: MenuEntry[] = [];
    if (!many && folder) {
      items.push(
        { kind: 'action', label: 'Neue Datei', icon: FilePlus, onSelect: () => startNew(entry.path, 'file') },
        { kind: 'action', label: 'Neuer Ordner', icon: FolderPlus, onSelect: () => startNew(entry.path, 'folder') },
        { kind: 'action', label: 'Dateien hochladen …', icon: Upload, onSelect: () => void pickAndUpload(entry.path, 'files') },
        { kind: 'action', label: 'Ordner hochladen …', icon: FolderInput, onSelect: () => void pickAndUpload(entry.path, 'folder') },
        { kind: 'separator' },
        { kind: 'action', label: 'Als Wurzel anzeigen', icon: FolderUp, onSelect: () => navigate(entry.path) },
      );
      if (canCd) items.push({ kind: 'action', label: 'Im Terminal öffnen', icon: SquareTerminal, onSelect: () => inTerminal(entry.path) });
      items.push({ kind: 'separator' });
    } else if (!many) {
      items.push({ kind: 'action', label: 'Bearbeiten', icon: Pencil, hint: 'Enter', onSelect: () => activate(entry) });
      if (canCd) items.push({ kind: 'action', label: 'Ordner im Terminal öffnen', icon: SquareTerminal, onSelect: () => inTerminal(dirname(entry.path)) });
      items.push({ kind: 'separator' });
    }
    items.push({ kind: 'action', label: many ? `Herunterladen (${targets.length})` : 'Herunterladen', icon: ArrowDownToLine, onSelect: () => void download(targets) });
    if (!many) {
      items.push(
        { kind: 'action', label: 'Umbenennen', icon: Pencil, hint: 'F2', onSelect: () => setEdit({ kind: 'rename', path: entry.path }) },
        { kind: 'action', label: 'Berechtigungen …', icon: Shield, disabled: entry.mode === null && session.protocol === 'ftp', onSelect: () => openChmod(sid, entry, () => void load(dirname(entry.path))) },
        { kind: 'action', label: 'Pfad kopieren', icon: ClipboardCopy, onSelect: () => void window.feather.copy(entry.path) },
      );
    }
    items.push({ kind: 'separator' }, { kind: 'action', label: many ? `Löschen (${targets.length})` : 'Löschen', icon: Trash2, danger: true, hint: 'Entf', onSelect: () => void remove(targets) });
    return items;
  }

  function paneMenu(): MenuEntry[] {
    return [
      { kind: 'action', label: 'Neue Datei', icon: FilePlus, onSelect: () => startNew(root, 'file') },
      { kind: 'action', label: 'Neuer Ordner', icon: FolderPlus, onSelect: () => startNew(root, 'folder') },
      { kind: 'action', label: 'Dateien hochladen …', icon: Upload, onSelect: () => void pickAndUpload(root, 'files') },
      { kind: 'action', label: 'Ordner hochladen …', icon: FolderInput, onSelect: () => void pickAndUpload(root, 'folder') },
      { kind: 'separator' },
      { kind: 'action', label: 'Aktualisieren', icon: RefreshCw, hint: 'F5', onSelect: refresh },
    ];
  }

  function onRowContext(event: MouseEvent, entry: RemoteEntry): void {
    event.preventDefault();
    event.stopPropagation();
    let targets = selectedEntries();
    if (!selected.has(entry.path)) {
      targets = [entry];
      setSelected(new Set([entry.path]));
      anchor.current = entry.path;
    }
    setMenu({ x: event.clientX, y: event.clientY, entries: entryMenu(entry, targets) });
  }

  function targetFor(event: DragEvent): string {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-path]');
    if (!row?.dataset.path) return root;
    return row.dataset.folder === 'true' ? row.dataset.path : dirname(row.dataset.path);
  }

  function onDragOver(event: DragEvent): void {
    const types = event.dataTransfer.types;
    const internal = types.includes(DRAG_TYPE);
    if (!internal && !types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = internal ? 'move' : 'copy';
    const target = targetFor(event);
    if (target !== dropTarget) setDropTarget(target);
  }

  function onDrop(event: DragEvent): void {
    const target = targetFor(event);
    setDropTarget(null);
    const internal = event.dataTransfer.getData(DRAG_TYPE);
    if (internal) {
      event.preventDefault();
      void move(JSON.parse(internal) as string[], target);
    } else if (event.dataTransfer.files.length) {
      event.preventDefault();
      const paths = Array.from(event.dataTransfer.files).map((f) => window.feather.pathForFile(f)).filter(Boolean);
      void upload(target, paths);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const list = entryRows;
    const current = list.findIndex((r) => r.entry.path === anchor.current);
    const single = selectedEntries();
    const step = (index: number): void => {
      const row = list[Math.max(0, Math.min(list.length - 1, index))];
      if (row) {
        setSelected(new Set([row.entry.path]));
        anchor.current = row.entry.path;
        box.current?.querySelector(`[data-path="${CSS.escape(row.entry.path)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        return step(current + 1);
      case 'ArrowUp':
        event.preventDefault();
        return step(current < 0 ? 0 : current - 1);
      case 'ArrowRight': {
        const row = list[current];
        if (row && isFolder(row.entry)) {
          event.preventDefault();
          if (!row.expanded) toggle(row.entry);
          else step(current + 1);
        }
        return;
      }
      case 'ArrowLeft': {
        const row = list[current];
        if (!row) return;
        event.preventDefault();
        if (row.expanded) toggle(row.entry);
        else {
          const parent = dirname(row.entry.path);
          if (parent !== root) {
            setSelected(new Set([parent]));
            anchor.current = parent;
          }
        }
        return;
      }
      case 'Enter':
        if (single.length === 1 && single[0]) activate(single[0]);
        return;
      case 'F2':
        if (single.length === 1 && single[0]) setEdit({ kind: 'rename', path: single[0].path });
        return;
      case 'Delete':
        if (single.length) void remove(single);
        return;
      case 'F5':
        event.preventDefault();
        return refresh();
      case 'a':
        if (event.ctrlKey) {
          event.preventDefault();
          setSelected(new Set(list.map((r) => r.entry.path)));
        }
        return;
      default:
    }
  }

  function sortBy(key: SortKey): void {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  const rootState = dirs[root];
  const count = rootState?.entries?.length ?? 0;
  const chosen = selectedEntries();
  const chosenSize = chosen.filter((e) => !isFolder(e)).reduce((sum, e) => sum + e.size, 0);
  const HeaderCell = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <button className={`flex items-center gap-1 hover:text-neutral-200 transition-colors ${right ? 'justify-end' : ''}`} onClick={() => sortBy(k)}>
      {label}
      {sort.key === k && <span className="text-primary">{sort.dir === 1 ? '↑' : '↓'}</span>}
    </button>
  );

  return (
    <div className="flex flex-1 min-w-0 min-h-0 flex-col bg-neutral-900/30" data-files={sid}>
      <div className="shrink-0 space-y-1.5 border-b border-neutral-800 p-2">
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-icon btn-sm" title="Übergeordneter Ordner" aria-label="Übergeordneter Ordner" disabled={root === '/' || !ready} onClick={() => navigate(dirname(root))} data-action="files-up">
            <FolderUp className="size-4" />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" title="Startordner" aria-label="Startordner" disabled={!ready} onClick={() => navigate(session.home)}>
            <House className="size-4" />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" title="Aktualisieren (F5)" aria-label="Aktualisieren" disabled={!ready} onClick={refresh} data-action="files-refresh">
            <RefreshCw className={`size-4 ${rootState?.loading ? 'animate-spin' : ''}`} />
          </button>
          <form
            className="flex-1 min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(pathText);
            }}
          >
            <input className="input h-8 font-mono text-[13px]" value={pathText} spellCheck={false} aria-label="Pfad" onChange={(e) => setPathText(e.target.value)} onFocus={(e) => e.currentTarget.select()} data-bind="path" />
          </form>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-icon btn-sm" title="Neue Datei" aria-label="Neue Datei" disabled={!ready} onClick={() => startNew(root, 'file')} data-action="files-new-file">
            <FilePlus className="size-4" />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" title="Neuer Ordner" aria-label="Neuer Ordner" disabled={!ready} onClick={() => startNew(root, 'folder')} data-action="files-new-folder">
            <FolderPlus className="size-4" />
          </button>
          <span className="w-px h-5 bg-neutral-800 mx-1" />
          <button
            className="btn btn-ghost btn-sm"
            title="Hochladen"
            disabled={!ready}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const target = chosen.length === 1 && chosen[0] && isFolder(chosen[0]) ? chosen[0].path : root;
              setMenu({
                x: r.left,
                y: r.bottom + 4,
                entries: [
                  { kind: 'action', label: 'Dateien hochladen …', icon: Upload, onSelect: () => void pickAndUpload(target, 'files') },
                  { kind: 'action', label: 'Ordner hochladen …', icon: FolderInput, onSelect: () => void pickAndUpload(target, 'folder') },
                ],
              });
            }}
            data-action="files-upload"
          >
            <ArrowUpFromLine className="size-4" />
            {width > 400 && 'Hochladen'}
          </button>
          <button className="btn btn-ghost btn-sm" title="Herunterladen" disabled={!ready || !chosen.length} onClick={() => void download(chosen)} data-action="files-download">
            <ArrowDownToLine className="size-4" />
            {width > 400 && 'Herunterladen'}
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-neutral-400 hover:text-red-400" title="Löschen (Entf)" aria-label="Löschen" disabled={!ready || !chosen.length} onClick={() => void remove(chosen)}>
            <Trash2 className="size-4" />
          </button>
          <span className="flex-1" />
          <button className="btn btn-ghost btn-icon btn-sm" title={showHidden ? 'Versteckte Dateien ausblenden' : 'Versteckte Dateien anzeigen'} aria-label="Versteckte Dateien umschalten" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
        </div>
      </div>

      {session.status === 'closed' && (
        <div className="shrink-0 flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-3 py-2 animate-rise">
          <span className="flex-1 text-xs text-red-200">{session.reason || 'Die Verbindung wurde getrennt.'}</span>
          <button className="btn btn-outline btn-sm" onClick={() => void reconnect(sid)} data-action="reconnect-files">
            <Plug className="size-3.5" />
            Neu verbinden
          </button>
        </div>
      )}

      {session.filesError ? (
        <div className="p-3">
          <Notice tone="warn">{session.filesError}</Notice>
        </div>
      ) : (
        <>
          <div className="shrink-0 grid items-center gap-2 px-3 h-7 border-b border-neutral-800/70 text-[11px] font-medium uppercase tracking-wide text-neutral-500" style={{ gridTemplateColumns: template }}>
            <div style={{ paddingLeft: 24 }}>
              <HeaderCell k="name" label="Name" />
            </div>
            {columns >= 2 && <HeaderCell k="size" label="Größe" right />}
            {columns >= 3 && <HeaderCell k="mtime" label="Geändert" />}
            {columns >= 4 && <span>Rechte</span>}
          </div>

          <div
            ref={box}
            tabIndex={0}
            role="tree"
            aria-label="Dateibaum"
            className={`relative flex-1 min-h-0 overflow-y-auto outline-none transition-[box-shadow] duration-150 ${dropTarget === root ? 'shadow-[inset_0_0_0_2px_rgb(14_165_233/0.55)]' : ''}`}
            onKeyDown={onKeyDown}
            onDragOver={onDragOver}
            onDragLeave={(e) => {
              if (!box.current?.contains(e.relatedTarget as Node)) setDropTarget(null);
            }}
            onDrop={onDrop}
            onClick={() => setSelected(new Set())}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, entries: paneMenu() });
            }}
          >
            {rows.map((row) => {
              if (row.kind === 'note') {
                return (
                  <div key={row.key} className={`flex items-center gap-2 h-7 text-xs ${row.error ? 'text-red-300' : 'text-neutral-500'}`} style={{ paddingLeft: 32 + row.depth * 14 }}>
                    {!row.error && row.text.startsWith('Wird') && <Loader2 className="size-3 animate-spin" />}
                    {row.text}
                  </div>
                );
              }
              if (row.kind === 'new') {
                const Icon = row.type === 'folder' ? FolderPlus : FilePlus;
                return (
                  <div key={row.key} className="grid items-center gap-2 px-3 h-7 bg-primary/10" style={{ gridTemplateColumns: template }}>
                    <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: 8 + row.depth * 14 + 20 }}>
                      <Icon className="size-4 text-primary" />
                      <NameInput initial="" placeholder={row.type === 'folder' ? 'Name des Ordners' : 'Name der Datei'} isFile={false} onCommit={(name) => void createItem(row.parent, name, row.type)} onCancel={() => setEdit(null)} />
                    </div>
                  </div>
                );
              }
              const { entry, depth, expanded } = row;
              const folder = isFolder(entry);
              const { Icon, tone } = iconFor(entry, expanded);
              const isSelected = selected.has(entry.path);
              const renaming = edit?.kind === 'rename' && edit.path === entry.path;
              const target = dropTarget === entry.path && folder;
              return (
                <div
                  key={row.key}
                  role="treeitem"
                  aria-selected={isSelected}
                  aria-expanded={folder ? expanded : undefined}
                  data-path={entry.path}
                  data-folder={folder}
                  draggable={!renaming}
                  onDragStart={(e) => {
                    const paths = isSelected ? [...selected] : [entry.path];
                    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(paths));
                    e.dataTransfer.effectAllowed = 'move';
                    if (!isSelected) setSelected(new Set([entry.path]));
                  }}
                  onDragEnd={() => setDropTarget(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    select(entry.path, e);
                    box.current?.focus();
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    activate(entry);
                  }}
                  onContextMenu={(e) => onRowContext(e, entry)}
                  className={`grid items-center gap-2 px-3 h-7 cursor-default select-none transition-colors duration-100 ${target ? 'bg-primary/25 ring-1 ring-inset ring-primary/60' : isSelected ? 'bg-primary/15' : 'hover:bg-neutral-800/60'}`}
                  style={{ gridTemplateColumns: template }}
                >
                  <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: 8 + depth * 14 }}>
                    {folder ? (
                      <button
                        className="grid place-items-center size-4 shrink-0 rounded text-neutral-500 hover:text-neutral-100"
                        aria-label={expanded ? 'Zuklappen' : 'Aufklappen'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(entry);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <ChevronRight className={`size-3.5 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
                      </button>
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                    <Icon className={`size-4 ${tone}`} />
                    {renaming ? (
                      <NameInput initial={entry.name} isFile={!folder} onCommit={(name) => void rename(entry, name)} onCancel={() => setEdit(null)} />
                    ) : (
                      <span className={`truncate text-[13px] ${entry.name.startsWith('.') ? 'text-neutral-400' : 'text-neutral-200'}`} title={entry.path}>
                        {entry.name}
                      </span>
                    )}
                  </div>
                  {columns >= 2 && <span className="text-right text-xs text-neutral-500 tabular-nums">{folder ? '' : formatBytes(entry.size)}</span>}
                  {columns >= 3 && <span className="text-xs text-neutral-500 tabular-nums truncate">{dateText(entry.mtime)}</span>}
                  {columns >= 4 && <span className="font-mono text-[11px] text-neutral-500 truncate">{modeText(entry.mode, entry.type)}</span>}
                </div>
              );
            })}
            {dropTarget !== null && (
              <div className="pointer-events-none sticky bottom-3 mx-auto w-fit animate-pop rounded-full border border-primary/50 bg-neutral-900/95 px-3 py-1.5 text-xs text-primary shadow-lg">
                Ablegen nach {dropTarget}
              </div>
            )}
          </div>

          <TransfersPanel session={session} />

          <div className="shrink-0 flex items-center gap-3 border-t border-neutral-800 px-3 h-7 text-[11px] text-neutral-500">
            <span>{count} {count === 1 ? 'Element' : 'Elemente'}</span>
            {chosen.length > 0 && (
              <span className="text-primary">
                {chosen.length} ausgewählt{chosenSize > 0 ? ` · ${formatBytes(chosenSize)}` : ''}
              </span>
            )}
            <span className="flex-1" />
            <span className="font-mono truncate max-w-[50%]" title={root}>{root}</span>
          </div>
        </>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
}
