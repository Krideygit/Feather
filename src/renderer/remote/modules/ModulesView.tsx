import { CircleAlert, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODULES, type ModuleId, type ModuleInfo } from '../../../shared/modules';
import { Notice, StatusBadge } from '../../components/Bits';
import { control, detect, useModules } from '../../lib/modules';
import type { SessionView } from '../../lib/remote';
import { ModuleDetail } from './ModuleDetail';
import { openInstall, openProgress } from './InstallDialog';
import { MODULE_ICON, statusOf } from './ui';

const GROUPS: { id: ModuleInfo['group']; label: string }[] = [
  { id: 'database', label: 'Datenbank' },
  { id: 'web', label: 'Webserver' },
];

export function ModulesView({ session }: { session: SessionView }) {
  const { sid } = session;
  const { sys, loading, error, busy, jobs } = useModules(sid);
  const [selected, setSelected] = useState<ModuleId | null>(null);

  useEffect(() => {
    if (!sys && !loading && !error && session.status === 'ready') void detect(sid);
  }, [sys, loading, error, session.status, sid]);

  if (selected && sys) return <ModuleDetail session={session} module={selected} sys={sys} onBack={() => setSelected(null)} />;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" data-modules={sid}>
      <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-50 tracking-tight">Module</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Installiere Software auf deinem Server per Klick. Feather richtet alles ein und hält es für dich in Schuss.</p>
        </div>
        <button className="btn btn-outline btn-sm shrink-0" onClick={() => void detect(sid)} disabled={loading} data-action="modules-refresh">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Neu prüfen
        </button>
      </div>

      <div className="px-6 pb-8 space-y-6">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
            <CircleAlert className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!sys && !error && (
          <div className="flex items-center gap-3 text-sm text-neutral-400 animate-fade-in">
            <Loader2 className="size-4 animate-spin text-primary" />
            Dein Server wird untersucht …
          </div>
        )}

        {sys && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 animate-fade-in" data-system>
              <span className="text-neutral-300 font-medium">{sys.os}</span>
              <span>{sys.arch}</span>
              <span>Paketmanager: {sys.pm}</span>
              <span>Dienste: {sys.init}</span>
              <span>Benutzer: {sys.user}{sys.sudo === 'root' ? ' (root)' : sys.sudo === 'none' ? ' (ohne Administratorrechte)' : ' (sudo)'}</span>
            </div>
            {!sys.supported && <Notice tone="error">{sys.reason}</Notice>}
            {sys.supported && sys.sudo === 'none' && (
              <Notice tone="warn">Dein Benutzer hat keine Administratorrechte. Zum Installieren melde dich als root an oder richte sudo für „{sys.user}“ ein.</Notice>
            )}

            {GROUPS.map((group) => (
              <section key={group.id}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-3">{group.label}</h3>
                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                  {MODULES.filter((m) => m.group === group.id).map((m) => {
                    const state = sys.modules[m.id];
                    const job = jobs[m.id];
                    const working = job?.state === 'running';
                    const Icon = MODULE_ICON[m.id];
                    const action = busy[m.id];
                    return (
                      <article key={m.id} className="card card-hover animate-pop flex flex-col p-4" data-module={m.id}>
                        <div className="flex items-start gap-3">
                          <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-neutral-100">{m.name}</h4>
                            <p className="text-sm text-neutral-500 mt-0.5">{state.installed ? `Version ${state.version || 'unbekannt'}` : m.description}</p>
                          </div>
                          {state.installed && <StatusBadge status={statusOf(state, job)} />}
                        </div>
                        <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center gap-2">
                          {working ? (
                            <button className="btn btn-outline btn-sm" onClick={() => openProgress(sid, m.id, sys, () => setSelected(m.id), () => undefined)} data-action="module-progress">
                              <Loader2 className="size-3.5 animate-spin" />
                              {job.kind === 'install' ? 'Wird installiert …' : 'Wird entfernt …'}
                            </button>
                          ) : state.installed ? (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => setSelected(m.id)} data-action="module-manage">Verwalten</button>
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                disabled={Boolean(action) || !state.service}
                                title={state.running ? 'Stoppen' : 'Starten'}
                                aria-label={state.running ? 'Stoppen' : 'Starten'}
                                onClick={() => void control(sid, m.id, state.running ? 'stop' : 'start')}
                              >
                                {action ? <Loader2 className="size-4 animate-spin" /> : state.running ? <Square className="size-4" /> : <Play className="size-4" />}
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-primary btn-sm" disabled={!sys.supported || sys.sudo === 'none'} onClick={() => openInstall(sid, m.id, sys, () => setSelected(m.id))} data-action="module-install" data-module-id={m.id}>
                              Installieren
                            </button>
                          )}
                          {job?.state === 'error' && !working && (
                            <button className="text-xs text-red-300 hover:underline" onClick={() => openProgress(sid, m.id, sys, () => setSelected(m.id), () => undefined)}>Fehler anzeigen</button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
