import { Cable, FolderTree, LayoutGrid, Loader2, Terminal, X, type LucideIcon } from 'lucide-react';
import type { RemoteProtocol } from '../../shared/remote';
import { confirmDialog } from '../components/Layers';
import { PluginButtons } from '../components/PluginUi';
import { closeSession, setActiveTab, useRemote, type SessionView } from '../lib/remote';
import { HostsView } from '../remote/Hosts';
import { Workspace } from '../remote/Workspace';

const ICONS: Record<RemoteProtocol, LucideIcon> = { ssh: Terminal, sftp: FolderTree, ftp: Cable };

function Tab({ active, color, children, onSelect, onClose, label }: { active: boolean; color?: string; children: React.ReactNode; onSelect: () => void; onClose?: () => void; label: string }) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={onSelect}
      onAuxClick={(e) => e.button === 1 && onClose?.()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      title={label}
      style={active && color ? { borderBottomColor: color } : undefined}
      className={`group relative flex items-center gap-2 h-10 pl-3 ${onClose ? 'pr-1.5' : 'pr-3'} shrink-0 max-w-[240px] cursor-pointer border-b-2 text-[13px] font-medium transition-[background-color,color,border-color] duration-150 ${
        active ? 'bg-neutral-800/50 text-neutral-50 border-primary' : 'border-transparent text-neutral-400 hover:bg-neutral-800/30 hover:text-neutral-100'
      }`}
    >
      {children}
      {onClose && (
        <button
          className="grid place-items-center size-5 rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
          aria-label={`${label} schließen`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          data-action="tab-close"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

async function closeWithCheck(session: SessionView): Promise<void> {
  const busy = session.transfers.some((t) => t.state === 'running' || t.state === 'queued');
  if (busy) {
    const ok = await confirmDialog({ title: 'Sitzung schließen?', message: 'Es laufen noch Übertragungen. Sie werden abgebrochen.', confirmLabel: 'Schließen', danger: true });
    if (!ok) return;
  }
  await closeSession(session.sid);
}

export function ServerPage() {
  const sessions = useRemote((s) => s.sessions);
  const pending = useRemote((s) => s.pending);
  const active = useRemote((s) => s.active);

  return (
    <div className="flex flex-1 min-h-0 flex-col" data-feather-area="server">
      <div role="tablist" className="flex items-stretch shrink-0 overflow-x-auto border-b border-neutral-800 bg-neutral-900/40 px-2">
        <Tab active={active === 'home'} onSelect={() => setActiveTab('home')} label="Verbindungen">
          <LayoutGrid className="size-4" />
          Verbindungen
        </Tab>
        {sessions.map((s) => {
          const Icon = ICONS[s.protocol];
          return (
            <Tab key={s.sid} active={active === s.sid} color={s.color} onSelect={() => setActiveTab(s.sid)} onClose={() => void closeWithCheck(s)} label={s.name}>
              <span className="relative grid place-items-center">
                <Icon className="size-4" style={{ color: s.color }} />
                <span className={`absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-2 ring-neutral-900 ${s.status === 'ready' ? 'bg-emerald-400' : 'bg-red-500'}`} />
              </span>
              <span className="truncate" data-notranslate>{s.name}</span>
            </Tab>
          );
        })}
        {pending.map((p) => (
          <Tab key={p.key} active={active === p.key} color={p.color} onSelect={() => setActiveTab(p.key)} label={p.name}>
            <Loader2 className="size-4 animate-spin" style={{ color: p.color }} />
            <span className="truncate">{p.name}</span>
          </Tab>
        ))}
        <span className="flex-1" />
        <PluginButtons location="server.tabbar" className="shrink-0 pl-2" />
      </div>

      <div className="relative flex flex-1 min-h-0">
        {active === 'home' && <HostsView />}
        {pending.some((p) => p.key === active) && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 animate-fade-in text-neutral-400">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">Verbindung zu {pending.find((p) => p.key === active)?.name} wird aufgebaut …</p>
          </div>
        )}
        {sessions.map((s) => (
          <div key={s.sid} className={active === s.sid ? 'flex flex-1 min-h-0 min-w-0 animate-fade-in' : 'hidden'} data-session={s.sid}>
            <Workspace session={s} visible={active === s.sid} />
          </div>
        ))}
      </div>
    </div>
  );
}
