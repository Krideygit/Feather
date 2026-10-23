import { ClipboardCopy, ClipboardPaste, Eraser, MousePointerClick, Plug, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { getModules } from '../lib/modules';
import { callRemote, getRemote, reconnect, restartShell, saveFontSize, savedFontSize, sendToTerminal, startShell, terminalFor, type SessionView } from '../lib/remote';
import { attachHelp, handleHelpKey } from '../lib/termhelp';
import { TermAssist } from './TermAssist';

export function TerminalView({ session, visible }: { session: SessionView; visible: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { sid } = session;

  const refit = useCallback((): void => {
    const { fit } = terminalFor(sid);
    try {
      fit.fit();
    } catch {
      return;
    }
  }, [sid]);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const entry = terminalFor(sid);
    if (!entry.opened) {
      entry.term.open(el);
      entry.opened = true;
    } else if (entry.term.element && entry.term.element.parentElement !== el) {
      el.appendChild(entry.term.element);
    }

    const live = (): SessionView | undefined => getRemote().sessions.find((s) => s.sid === sid);
    attachHelp(sid, entry.term, {
      send: (data) => sendToTerminal(sid, data),
      hostKey: () => {
        const s = live();
        return s ? (s.hostId ? `host:${s.hostId}` : `adhoc:${s.username}@${s.host}:${s.port}`) : '';
      },
      isRoot: () => live()?.username === 'root',
      manager: () => getModules(sid).sys?.pm ?? 'apt',
      units: () => Object.values(getModules(sid).sys?.modules ?? {}).filter((m) => m.installed && m.service).map((m) => m.service),
      call: (method, params) => callRemote(method, params),
    });

    entry.term.attachCustomKeyEventHandler((event) => {
      if (handleHelpKey(sid, event)) return false;
      if (event.type !== 'keydown') return true;
      const key = event.key.toLowerCase();
      const copyCombo = (event.ctrlKey && event.shiftKey && key === 'c') || (event.ctrlKey && key === 'insert');
      const pasteCombo = (event.ctrlKey && event.shiftKey && key === 'v') || (event.shiftKey && key === 'insert');
      if (copyCombo || (event.ctrlKey && !event.shiftKey && key === 'c' && entry.term.hasSelection())) {
        event.preventDefault();
        void window.feather.copy(entry.term.getSelection());
        entry.term.clearSelection();
        return false;
      }
      if (pasteCombo) {
        event.preventDefault();
        void window.feather.readClipboard().then((text) => text && entry.term.paste(text));
        return false;
      }
      return true;
    });

    let frame = 0;
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    schedule();

    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  }, [sid, refit]);

  useEffect(() => {
    if (session.status !== 'ready' || session.shell !== 'idle' || !visible) return;
    refit();
    void startShell(sid);
    terminalFor(sid).term.focus();
  }, [session.status, session.shell, visible, sid, refit]);

  useEffect(() => {
    if (visible) {
      refit();
      terminalFor(sid).term.focus();
    }
  }, [visible, sid, refit]);

  function zoom(delta: number): void {
    const { term } = terminalFor(sid);
    const next = Math.max(9, Math.min(28, (term.options.fontSize ?? savedFontSize()) + delta));
    term.options.fontSize = next;
    saveFontSize(next);
    refit();
  }

  const entries = (): MenuEntry[] => {
    const { term } = terminalFor(sid);
    return [
      { kind: 'action', label: 'Kopieren', icon: ClipboardCopy, hint: 'Strg+Umschalt+C', disabled: !term.hasSelection(), onSelect: () => void window.feather.copy(term.getSelection()) },
      { kind: 'action', label: 'Einfügen', icon: ClipboardPaste, hint: 'Strg+Umschalt+V', onSelect: () => void window.feather.readClipboard().then((t) => t && term.paste(t)) },
      { kind: 'action', label: 'Alles auswählen', icon: MousePointerClick, onSelect: () => term.selectAll() },
      { kind: 'separator' },
      { kind: 'action', label: 'Ausgabe leeren', icon: Eraser, onSelect: () => term.clear() },
      { kind: 'action', label: 'Schrift größer', icon: ZoomIn, hint: 'Strg+Mausrad', onSelect: () => zoom(1) },
      { kind: 'action', label: 'Schrift kleiner', icon: ZoomOut, onSelect: () => zoom(-1) },
    ];
  };

  const ended = session.status === 'closed' || session.shell === 'exited';

  return (
    <div ref={outer} className="relative flex-1 min-w-0 min-h-0 bg-[#0f0f0f]">
      <div
        ref={holder}
        className="absolute inset-0 pl-3 pt-2 pb-1"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        data-terminal={sid}
      />
      <TermAssist sid={sid} visible={visible && !ended} outer={outer} />
      {ended && (
        <div className="absolute inset-x-0 bottom-0 animate-rise flex items-center gap-3 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur px-4 py-2.5">
          <span className={`size-2 rounded-full ${session.status === 'closed' ? 'bg-red-500' : 'bg-amber-400'}`} />
          <span className="flex-1 text-sm text-neutral-300">{session.status === 'closed' ? session.reason || 'Die Verbindung wurde getrennt.' : 'Das Terminal wurde beendet.'}</span>
          {session.status === 'closed' ? (
            <button className="btn btn-primary btn-sm" onClick={() => void reconnect(sid)} data-action="reconnect">
              <Plug className="size-3.5" />
              Neu verbinden
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => restartShell(sid)} data-action="restart-shell">
              <RotateCcw className="size-3.5" />
              Neues Terminal
            </button>
          )}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries()} onClose={() => setMenu(null)} />}
    </div>
  );
}
