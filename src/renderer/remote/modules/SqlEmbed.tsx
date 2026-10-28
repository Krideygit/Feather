import { KeyRound, Loader2, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DbSettings, DbUserInfo, ModuleState } from '../../../shared/modules';
import { Notice } from '../../components/Bits';
import { toast } from '../../components/Toast';
import { hostKeyOf, loadSqlConnections, saveSqlConnection, useSqlConnections } from '../../lib/creds';
import { callModule } from '../../lib/modules';
import type { SessionView } from '../../lib/remote';
import { CRED_PREFIX } from '../../lib/sqlsource';
import { Workbench } from '../../sql/Workbench';
import { generatePassword } from './ui';

const FEATHER_USER = 'feather_sql';
const FEATHER_HOST = '127.0.0.1';

function Setup({ session, onDone }: { session: SessionView; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function setup(): Promise<void> {
    setBusy(true);
    try {
      const sid = session.sid;
      const [settings, users] = await Promise.all([callModule<DbSettings>(sid, 'db.settings'), callModule<DbUserInfo[]>(sid, 'db.users')]);
      const password = generatePassword();
      if (users.some((u) => u.name === FEATHER_USER && u.host === FEATHER_HOST)) await callModule(sid, 'db.userPassword', { name: FEATHER_USER, host: FEATHER_HOST, password });
      else await callModule(sid, 'db.createUser', { user: { name: FEATHER_USER, host: FEATHER_HOST, password, database: '*', grant: 'all' } });
      const saved = await saveSqlConnection({ label: `${session.name}: Feather SQL`, kind: 'ssh', hostKey: hostKeyOf(session), dbHost: '127.0.0.1', port: settings.port, user: FEATHER_USER, password, database: '', source: 'user' });
      await loadSqlConnections();
      onDone(saved.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 animate-fade-in">
      <div className="card max-w-md p-6 text-center">
        <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto">
          <Table2 className="size-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-neutral-100">Feather SQL einrichten</h3>
        <p className="mt-1.5 text-sm text-neutral-500">Feather legt dafür einen eigenen Datenbankbenutzer an (nur vom Server selbst erreichbar) und speichert das Passwort verschlüsselt unter „Zugangsdaten“. Danach öffnet sich Feather SQL hier direkt.</p>
        <button className="btn btn-primary mt-5" disabled={busy} onClick={() => void setup()} data-action="sql-embed-setup">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Zugang einrichten
        </button>
      </div>
    </div>
  );
}

export function MariaSql({ session, state }: { session: SessionView; state: ModuleState }) {
  const all = useSqlConnections();
  const key = hostKeyOf(session);
  const list = useMemo(() => all.filter((c) => c.kind === 'ssh' && c.hostKey === key && c.hasPassword && c.dbHost === '127.0.0.1'), [all, key]);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    void loadSqlConnections().catch(() => undefined);
  }, []);

  if (!state.running) return <div className="p-6"><Notice tone="warn">MariaDB läuft gerade nicht. Starte den Dienst oben, um Feather SQL zu nutzen.</Notice></div>;

  const current = list.find((c) => c.id === chosen) ?? list.find((c) => c.source === 'install') ?? list.find((c) => c.user === FEATHER_USER) ?? list[0];
  if (!current) return <Setup session={session} onDone={setChosen} />;

  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col" data-sql-embed>
      {list.length > 1 && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-neutral-800 text-xs text-neutral-500">
          <KeyRound className="size-3.5" />
          Angemeldet als
          <select className="input h-7 w-auto py-0 text-xs" value={current.id} onChange={(e) => setChosen(e.target.value)} data-bind="sql-embed-cred">
            {list.map((c) => (
              <option key={c.id} value={c.id}>{c.user} · {c.label}</option>
            ))}
          </select>
        </div>
      )}
      <Workbench key={current.id} sourceId={`${CRED_PREFIX}${current.id}`} compact />
    </div>
  );
}
