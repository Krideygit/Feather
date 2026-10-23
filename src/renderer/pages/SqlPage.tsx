import { Cable, Database, Loader2, Plus, Server, Table2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/Bits';
import { confirmDialog } from '../components/Layers';
import { toast } from '../components/Toast';
import { loadSqlConnections, removeSqlConnection, takeSqlRequest, useSqlConnections, useSqlRequest } from '../lib/creds';
import { CRED_PREFIX, forgetSecret, useSqlSources, type SqlSource } from '../lib/sqlsource';
import { openConnectionDialog } from '../sql/ConnectionDialog';
import { Workbench } from '../sql/Workbench';

const ICON = { local: Database, ssh: Server, direct: Cable } as const;

function Chooser({ sources, onPick, busy }: { sources: SqlSource[]; onPick: (id: string) => void; busy: string | null }) {
  const creds = useSqlConnections();
  const groups = [...new Set(sources.map((s) => s.group))];

  async function remove(source: SqlSource): Promise<void> {
    const id = source.id.slice(CRED_PREFIX.length);
    const ok = await confirmDialog({ title: `„${source.label}“ entfernen?`, message: 'Die gespeicherten Zugangsdaten werden aus Feather gelöscht. Die Datenbank selbst bleibt unberührt.', confirmLabel: 'Entfernen', danger: true });
    if (!ok) return;
    try {
      await removeSqlConnection(id);
      forgetSecret(id);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 pb-8">
      {sources.length === 0 ? (
        <div className="card border-dashed flex flex-col items-center text-center px-6 py-16">
          <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Table2 className="size-7" />
          </div>
          <h2 className="mt-5 text-base font-semibold text-neutral-100">Noch keine Datenbank</h2>
          <p className="mt-1.5 text-sm text-neutral-500 max-w-md">Lege unter „Datenbanken“ einen lokalen Server an, installiere MariaDB auf deinem Server oder füge eine eigene Verbindung hinzu.</p>
          <button className="btn btn-primary mt-6" onClick={() => openConnectionDialog(onPick)}>
            <Plus className="size-4" />
            Verbindung hinzufügen
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-3">{group}</h3>
              <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                {sources
                  .filter((s) => s.group === group)
                  .map((s) => {
                    const Icon = ICON[s.kind];
                    const isCred = s.id.startsWith(CRED_PREFIX) && creds.some((c) => c.id === s.id.slice(CRED_PREFIX.length));
                    return (
                      <article
                        key={s.id}
                        className={`card card-hover animate-pop p-4 flex items-center gap-3 ${s.ready ? 'cursor-pointer' : 'opacity-60'}`}
                        onClick={() => s.ready && onPick(s.id)}
                        data-source={s.label}
                      >
                        <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                          {busy === s.id ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-neutral-100 truncate">{s.label}</h4>
                          <p className="text-xs font-mono text-neutral-500 truncate">{s.detail}</p>
                          {s.hint && <p className="text-xs text-neutral-600 mt-0.5">{s.hint}</p>}
                        </div>
                        {isCred && (
                          <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" aria-label={`${s.label} entfernen`} onClick={(e) => { e.stopPropagation(); void remove(s); }}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function SqlPage() {
  const sources = useSqlSources();
  const request = useSqlRequest();
  const [sourceId, setSourceId] = useState<string | null>(null);

  useEffect(() => {
    void loadSqlConnections().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!request) return;
    const id = takeSqlRequest();
    if (id) setSourceId(`${CRED_PREFIX}${id}`);
  }, [request]);

  if (sourceId) {
    return (
      <div className="flex flex-1 min-h-0 flex-col" data-page="sql">
        <Workbench key={sourceId} sourceId={sourceId} onExit={() => setSourceId(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col" data-page="sql">
      <PageHeader title="Feather SQL" description="Datenbanken ansehen, abfragen und bearbeiten, lokal und auf deinen Servern." createLabel="Verbindung hinzufügen" settingsLabel="Einstellungen" onCreate={() => openConnectionDialog((id) => setSourceId(id))} onSettings={() => undefined} />
      <Chooser sources={sources} onPick={setSourceId} busy={null} />
    </div>
  );
}
