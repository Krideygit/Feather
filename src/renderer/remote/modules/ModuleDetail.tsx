import { ArrowLeft, Loader2, MoreHorizontal, Play, RotateCw, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODULES, type ModuleId, type ModuleState, type SystemInfo } from '../../../shared/modules';
import { StatusBadge } from '../../components/Bits';
import { ContextMenu, type MenuEntry } from '../../components/ContextMenu';
import { control, useModules } from '../../lib/modules';
import type { SessionView } from '../../lib/remote';
import { openUninstall } from './InstallDialog';
import { MariaCredentials } from './CredsPanel';
import { LogsPanel } from './LogsPanel';
import { MariaDatabases, MariaOverview, MariaSettings, MariaUsers } from './MariaDbPanels';
import { MariaSql } from './SqlEmbed';
import { MODULE_ICON, Tabs, statusOf } from './ui';
import { WebOverview, WebSites } from './WebPanels';

type Tab = 'overview' | 'databases' | 'users' | 'credentials' | 'settings' | 'sites' | 'logs';

const DB_TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'databases', label: 'Datenbanken' },
  { id: 'users', label: 'Benutzer' },
  { id: 'credentials', label: 'Zugangsdaten' },
  { id: 'settings', label: 'Einstellungen' },
  { id: 'logs', label: 'Logs' },
];

const WEB_TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'sites', label: 'Websites' },
  { id: 'logs', label: 'Logs' },
];

function DatabasesTab({ session, state }: { session: SessionView; state: ModuleState }) {
  const [view, setView] = useState<'sql' | 'list'>('sql');
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-neutral-800">
        {([['sql', 'Feather SQL'], ['list', 'Einfache Liste']] as const).map(([id, label]) => (
          <button
            key={id}
            className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${view === id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'}`}
            onClick={() => setView(id)}
            data-action={`db-view-${id}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'sql' ? <MariaSql session={session} state={state} /> : <div className="flex-1 min-h-0 overflow-y-auto"><MariaDatabases session={session} state={state} /></div>}
    </div>
  );
}

export function ModuleDetail({ session, module, sys, onBack }: { session: SessionView; module: ModuleId; sys: SystemInfo; onBack: () => void }) {
  const { sid } = session;
  const info = MODULES.find((m) => m.id === module)!;
  const state = sys.modules[module];
  const { busy, jobs } = useModules(sid);
  const action = busy[module];
  const job = jobs[module];
  const [tab, setTab] = useState<Tab>('overview');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const Icon = MODULE_ICON[module];
  const tabs = module === 'mariadb' ? DB_TABS : WEB_TABS;

  useEffect(() => {
    if (!state.installed && job?.state !== 'running') onBack();
  }, [state.installed, job?.state, onBack]);

  const entries: MenuEntry[] = [
    ...(module !== 'mariadb' ? [{ kind: 'action' as const, label: 'Konfiguration prüfen', icon: ShieldCheck, onSelect: () => setTab('overview') }] : []),
    { kind: 'action', label: 'Deinstallieren …', icon: Trash2, danger: true, onSelect: () => openUninstall(sid, module, () => undefined) },
  ];

  const busyText = action === 'start' ? 'Startet …' : action === 'stop' ? 'Stoppt …' : action === 'restart' ? 'Startet neu …' : '';

  return (
    <div className="flex flex-1 min-h-0 flex-col animate-fade-in" data-module-detail={module}>
      <div className="shrink-0 px-6 pt-4 pb-4 border-b border-neutral-800">
        <button className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-100 transition-colors mb-3" onClick={onBack} data-action="module-back">
          <ArrowLeft className="size-3.5" />
          Alle Module
        </button>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
            <Icon className="size-6" />
          </div>
          <div className="min-w-[12rem] flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-neutral-50 tracking-tight">{info.name}</h2>
              <StatusBadge status={statusOf(state, job)} />
            </div>
            <p className="text-sm text-neutral-500">Version {state.version || 'unbekannt'}{state.service ? ` · Dienst „${state.service}“` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {state.running ? (
              <button className="btn btn-outline btn-sm" disabled={Boolean(action)} onClick={() => void control(sid, module, 'stop')} data-action="module-stop">
                {action === 'stop' ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
                Stoppen
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" disabled={Boolean(action) || !state.service} onClick={() => void control(sid, module, 'start')} data-action="module-start">
                {action === 'start' ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                Starten
              </button>
            )}
            <button className="btn btn-outline btn-sm" disabled={Boolean(action) || !state.service} onClick={() => void control(sid, module, 'restart')} data-action="module-restart">
              {action === 'restart' ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              Neu starten
            </button>
            <label className="flex items-center gap-2 text-[13px] text-neutral-300 cursor-pointer select-none px-1" title="Dienst beim Hochfahren des Servers starten">
              <input type="checkbox" className="peer sr-only" checked={state.enabled} disabled={Boolean(action) || !state.service} onChange={() => void control(sid, module, state.enabled ? 'disable' : 'enable')} aria-label="Autostart" data-action="module-autostart" />
              <span className="toggle" />
              Autostart
            </label>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Weitere Aktionen"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ x: r.right - 220, y: r.bottom + 4 });
              }}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </div>
        {busyText && <p className="mt-2 text-xs text-amber-300 animate-fade-in">{busyText}</p>}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {tab === 'overview' && (module === 'mariadb' ? <MariaOverview session={session} state={state} /> : <WebOverview session={session} module={module} state={state} sys={sys} />)}
        {tab === 'databases' && <DatabasesTab session={session} state={state} />}
        {tab === 'users' && <MariaUsers session={session} state={state} />}
        {tab === 'credentials' && <MariaCredentials session={session} />}
        {tab === 'settings' && <MariaSettings session={session} state={state} />}
        {tab === 'sites' && <WebSites session={session} module={module} state={state} sys={sys} />}
        {tab === 'logs' && <LogsPanel sid={sid} module={module} />}
      </div>
      {menu && <ContextMenu x={Math.max(8, menu.x)} y={menu.y} entries={entries} onClose={() => setMenu(null)} />}
    </div>
  );
}
