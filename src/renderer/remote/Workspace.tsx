import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SessionView } from '../lib/remote';
import { FilePanel } from './FilePanel';
import { TerminalView } from './TerminalView';

const WIDTH_KEY = 'feather.remote.panel';
const MIN_PANEL = 300;
const MIN_TERMINAL = 360;

function savedWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    if (n >= MIN_PANEL) return n;
  } catch {
    return 440;
  }
  return 440;
}

export function Workspace({ session, visible }: { session: SessionView; visible: boolean }) {
  const [width, setWidth] = useState(savedWidth);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
    } catch {
      return;
    }
  }, [width]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setDragging(true);
    const left = box.current?.getBoundingClientRect().left ?? 0;
    const total = box.current?.clientWidth ?? 0;
    const move = (e: PointerEvent): void => setWidth(Math.max(MIN_PANEL, Math.min(total - MIN_TERMINAL, e.clientX - left - 36)));
    const stop = (): void => {
      setDragging(false);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  }

  if (!session.terminal) {
    return (
      <div className="flex flex-1 min-h-0">
        <FilePanel session={session} visible={visible} />
      </div>
    );
  }

  return (
    <div ref={box} className={`flex flex-1 min-h-0 ${dragging ? 'select-none' : ''}`}>
      <div className="w-9 shrink-0 border-r border-neutral-800 flex flex-col items-center py-2 bg-neutral-900/40">
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Dateibaum anzeigen' : 'Dateibaum ausblenden'}
          aria-label={collapsed ? 'Dateibaum anzeigen' : 'Dateibaum ausblenden'}
          data-action="toggle-files"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      {!collapsed && (
        <>
          <div style={{ width }} className="shrink-0 min-w-0 flex">
            <FilePanel session={session} visible={visible && !collapsed} />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startDrag}
            onDoubleClick={() => setWidth(440)}
            className={`w-1 shrink-0 cursor-col-resize transition-colors duration-150 hover:bg-primary/50 ${dragging ? 'bg-primary/70' : 'bg-neutral-800'}`}
          />
        </>
      )}
      <TerminalView session={session} visible={visible} />
    </div>
  );
}
