import { ExternalLink, Play, RotateCw, Square } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Service } from '../../shared/types';
import { StatusBadge } from '../components/Bits';
import { Drawer, openLayer } from '../components/Layers';
import { TypeIcon } from '../components/TypeIcon';
import { TYPES, isActive, openInBrowser, restartService, toggleService } from '../lib/services';
import { useService } from '../lib/store';
import { DatabasesTab } from './Databases';
import { LogsTab } from './Logs';
import { OverviewTab } from './Overview';
import { SettingsTab } from './SettingsTab';
import { SqlTab } from './Sql';
import { UsersTab } from './Users';

export type TabKey = 'overview' | 'databases' | 'users' | 'sql' | 'logs' | 'settings';

const TABS: { key: TabKey; label: string; databaseOnly?: boolean }[] = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'databases', label: 'Datenbanken', databaseOnly: true },
  { key: 'users', label: 'Benutzer', databaseOnly: true },
  { key: 'sql', label: 'SQL', databaseOnly: true },
  { key: 'logs', label: 'Logs' },
  { key: 'settings', label: 'Einstellungen' },
];

export const openServiceDrawer = (id: string, tab: TabKey = 'overview'): void =>
  openLayer((close) => <ServiceDrawer id={id} initialTab={tab} onClose={close} />);

function Header({ service: svc }: { service: Service }) {
  const active = isActive(svc);
  return (
    <div className="min-w-0 flex-1 pb-3">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <TypeIcon type={svc.type} className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-100 truncate">{svc.name}</h2>
          <p className="text-xs text-neutral-500 flex items-center gap-2">
            {TYPES[svc.type].label} {svc.version} <StatusBadge status={svc.status} />
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button className={`btn btn-sm ${active ? 'btn-outline' : 'btn-primary'}`} disabled={svc.status === 'stopping'} onClick={() => void toggleService(svc.id)}>
          {active ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
          {active ? 'Stoppen' : 'Starten'}
        </button>
        {svc.status === 'running' && (
          <button className="btn btn-outline btn-sm" onClick={() => void restartService(svc.id)}>
            <RotateCw className="size-3.5" />
            Neu starten
          </button>
        )}
        {svc.category === 'webserver' && svc.status === 'running' && (
          <button className="btn btn-outline btn-sm" onClick={() => openInBrowser(svc)}>
            <ExternalLink className="size-3.5" />
            Im Browser öffnen
          </button>
        )}
      </div>
    </div>
  );
}

function Pane({ active, scroll = true, children }: { active: boolean; scroll?: boolean; children: ReactNode }) {
  return <div className={active ? `h-full ${scroll ? 'overflow-y-auto px-5 py-4' : 'flex flex-col'}` : 'hidden'}>{children}</div>;
}

function ServiceDrawer({ id, initialTab, onClose }: { id: string; initialTab: TabKey; onClose: () => void }) {
  const service = useService(id);
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (!service) onClose();
  }, [service, onClose]);
  if (!service) return null;

  const database = service.category === 'database';
  const tabs = TABS.filter((t) => !t.databaseOnly || database);

  return (
    <Drawer size={database ? 'max-w-[760px]' : undefined} header={<Header service={service} />} onClose={onClose}>
      <div className="flex flex-col h-full">
        <div className="flex gap-1 px-5 border-b border-neutral-800 shrink-0">
          {tabs.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'tab-active' : ''}`} onClick={() => setTab(t.key)} data-tab={t.key}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          {tab === 'overview' && <Pane active><OverviewTab service={service} /></Pane>}
          {tab === 'databases' && <Pane active><DatabasesTab service={service} /></Pane>}
          {tab === 'users' && <Pane active><UsersTab service={service} /></Pane>}
          {database && <Pane active={tab === 'sql'}><SqlTab service={service} /></Pane>}
          <Pane active={tab === 'logs'} scroll={false}><LogsTab id={service.id} active={tab === 'logs'} commandable={service.category === 'package'} running={service.status === 'running'} /></Pane>
          {tab === 'settings' && <Pane active><SettingsTab service={service} onDeleted={onClose} /></Pane>}
        </div>
      </div>
    </Drawer>
  );
}
