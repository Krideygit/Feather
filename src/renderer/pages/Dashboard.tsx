import { Activity, ChevronRight, Database, Globe, HardDrive, Play, Square, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Service } from '../../shared/types';
import { PageHeader, StatusBadge } from '../components/Bits';
import { TypeIcon } from '../components/TypeIcon';
import { openServiceDrawer } from '../drawer/ServiceDrawer';
import { openChooser, openCreateDialog } from '../dialogs/CreateService';
import { openGeneralDialog } from '../dialogs/Runtimes';
import { formatBytes } from '../lib/format';
import { TYPES, isActive, toggleService } from '../lib/services';
import { useAppState } from '../lib/store';

function Stat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card p-4 flex items-center gap-3.5">
      <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-lg font-semibold text-neutral-50 leading-tight">{value}</p>
        {sub && <p className="text-xs text-neutral-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function Row({ service: s }: { service: Service }) {
  const active = isActive(s);
  return (
    <div className="flex items-center gap-3.5 px-4 py-3 border-b border-neutral-800 last:border-0 hover:bg-neutral-800/40 cursor-pointer transition-colors" onClick={() => openServiceDrawer(s.id)} data-action="svc:open" data-id={s.id}>
      <div className="size-9 rounded-lg bg-neutral-800 text-neutral-300 grid place-items-center shrink-0">
        <TypeIcon type={s.type} className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-100 truncate">{s.name}</p>
        <p className="text-xs text-neutral-500">
          {TYPES[s.type].label} {s.version} · Port {s.port}
        </p>
      </div>
      <div className="w-28 shrink-0">
        <StatusBadge status={s.status} />
      </div>
      <button
        className={`btn btn-sm ${active ? 'btn-outline' : 'btn-primary'} w-28`}
        disabled={s.status === 'stopping'}
        onClick={(e) => {
          e.stopPropagation();
          void toggleService(s.id);
        }}
      >
        {active ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
        {active ? 'Stoppen' : 'Starten'}
      </button>
    </div>
  );
}

const QUICK_START = [
  { icon: Database, title: 'Datenbank erstellen', text: 'MariaDB mit einem Klick: Download, Einrichtung und Start inklusive.', category: 'database' },
  { icon: Globe, title: 'Webserver erstellen', text: 'Einen Ordner über Nginx oder Apache unter localhost ausliefern.', category: 'webserver' },
] as const;

export function DashboardPage() {
  const services = useAppState((s) => s.services);
  const installed = useAppState((s) => s.installed);
  const running = services.filter((s) => s.status === 'running').length;
  const size = installed.reduce((sum, r) => sum + r.size, 0);

  return (
    <>
      <PageHeader
        title="Übersicht"
        description="Alle deine lokalen Services auf einen Blick."
        createLabel="Neuen Service erstellen"
        settingsLabel="Allgemeine Einstellungen"
        onCreate={openChooser}
        onSettings={openGeneralDialog}
      />
      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-6">
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <Stat icon={Activity} label="Laufende Services" value={`${running} / ${services.length}`} sub={running ? 'aktiv' : 'nichts gestartet'} />
          <Stat icon={Database} label="Datenbanken" value={services.filter((s) => s.category === 'database').length} />
          <Stat icon={Globe} label="Webserver" value={services.filter((s) => s.category === 'webserver').length} />
          <Stat icon={HardDrive} label="Installierte Runtimes" value={installed.length} sub={size ? formatBytes(size) : 'noch nichts geladen'} />
        </div>

        {services.length === 0 ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {QUICK_START.map(({ icon: Icon, title, text, category }) => (
              <button key={category} className="card card-hover text-left p-6 group" onClick={() => openCreateDialog(category)} data-action={`create:${category}`}>
                <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
                  <Icon className="size-6" />
                </div>
                <h3 className="mt-4 font-semibold text-neutral-100 flex items-center gap-1.5">
                  {title}
                  <ChevronRight className="size-4 text-neutral-600 group-hover:text-primary transition-colors" />
                </h3>
                <p className="mt-1 text-sm text-neutral-500">{text}</p>
              </button>
            ))}
          </div>
        ) : (
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-3">Services</h2>
            <div className="card overflow-hidden">
              {services.map((s) => (
                <Row key={s.id} service={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
