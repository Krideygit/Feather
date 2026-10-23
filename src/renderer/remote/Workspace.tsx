import { Boxes, PanelLeftClose, PanelLeftOpen, SquareTerminal } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SessionView } from '../lib/remote';
import { FilePanel } from './FilePanel';
import { PluginButtons, PluginIcon, PluginView } from '../components/PluginUi';
import { usePlugins } from '../lib/plugins';
import { ModulesView } from './modules/ModulesView';
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
  const [view, setView] = useState<string>('terminal');
  const contributions = usePlugins((s) => s.contributions);
  const pluginViews = contributions.flatMap((c) => c.views.map((v) => ({ key: `plugin:${c.plugin}:${v.id}`, plugin: c.plugin, spec: v })));
  const pluginView = pluginViews.find((v) => v.key === view);
  const [visitedModules, setVisitedModules] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view === 'modules') setVisitedModules(true);
  }, [view]);

  useEffect(() => {
    if (session.filesTarget) setCollapsed(false);
  }, [session.filesTarget]);

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
      <div className="flex flex-1 min-w-0 min-h-0 flex-col">
        <div className="shrink-0 h-10 flex items-center gap-1 px-3 border-b border-neutral-800 bg-neutral-900/40">
          {([
            ['terminal', 'Terminal', SquareTerminal],
            ['modules', 'Module', Boxes],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              data-view={id}
              className={`inline-flex items-center gap-2 h-7 px-3 rounded-md text-[13px] font-medium transition-[background-color,color] duration-150 ${view === id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'}`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
          {pluginViews.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              data-view={v.key}
              className={`inline-flex items-center gap-2 h-7 px-3 rounded-md text-[13px] font-medium transition-[background-color,color] duration-150 ${view === v.key ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'}`}
            >
              <PluginIcon icon={v.spec.icon} className="size-3.5" />
              {v.spec.title}
            </button>
          ))}
          <span className="flex-1" />
          <PluginButtons location="terminal.toolbar" />
          <span className="text-xs text-neutral-500 font-mono truncate pl-2">{session.username}@{session.host}</span>
        </div>
        <div className={view === 'terminal' ? 'flex flex-1 min-w-0 min-h-0' : 'hidden'}>
          <TerminalView session={session} visible={visible && view === 'terminal'} />
        </div>
        {pluginView && <PluginView plugin={pluginView.plugin} view={pluginView.spec.id} blocks={pluginView.spec.blocks} />}
        {visitedModules && (
          <div className={view === 'modules' ? 'flex flex-1 min-w-0 min-h-0 animate-fade-in' : 'hidden'}>
            <ModulesView session={session} />
          </div>
        )}
      </div>
    </div>
  );
}
