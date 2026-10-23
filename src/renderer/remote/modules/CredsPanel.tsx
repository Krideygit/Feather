import { Eye, EyeOff, KeyRound, Plus, Table2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SqlConnection } from '../../../shared/sql';
import { Field, PasswordInput } from '../../components/Form';
import { Modal, confirmDialog, openLayer } from '../../components/Layers';
import { toast } from '../../components/Toast';
import { hostKeyOf, loadSqlConnections, removeSqlConnection, requestSqlConnection, revealSqlConnection, saveSqlConnection, useSqlConnections } from '../../lib/creds';
import type { SessionView } from '../../lib/remote';
import { setState } from '../../lib/store';
import { CopyButton, Empty } from './ui';

const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), 'error');

export function openInSql(id: string): void {
  requestSqlConnection(id);
  setState({ route: 'sql' });
  try {
    localStorage.setItem('feather.route', 'sql');
  } catch {
    return;
  }
}

function AddDialog({ session, onClose }: { session: SessionView; onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [port, setPort] = useState(3306);
  const [dbHost, setDbHost] = useState('127.0.0.1');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    try {
      await saveSqlConnection({ label: label.trim(), kind: 'ssh', hostKey: hostKeyOf(session), dbHost: dbHost.trim(), port, user: user.trim(), password, database: database.trim(), source: 'manual' });
      toast('Zugangsdaten gespeichert.', 'success');
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Zugangsdaten speichern"
      subtitle="Feather legt sie verschlüsselt ab und nutzt sie für Feather SQL"
      size="max-w-lg"
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !user.trim()} onClick={() => void submit()} data-action="cred-save">Speichern</button></>}
    >
      <div className="space-y-4">
        <Field label="Bezeichnung" hint="Optional, z. B. „Shop-Datenbank“.">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} data-bind="cred-label" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Benutzername">
            <input className="input font-mono" value={user} spellCheck={false} onChange={(e) => setUser(e.target.value)} data-bind="cred-user" />
          </Field>
          <Field label="Datenbank" hint="Optional.">
            <input className="input font-mono" value={database} spellCheck={false} onChange={(e) => setDatabase(e.target.value)} />
          </Field>
        </div>
        <Field label="Passwort">
          <PasswordInput value={password} onChange={setPassword} data-bind="cred-password" />
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Datenbank-Host" hint="Aus Sicht des Servers. Meist 127.0.0.1.">
            <input className="input font-mono" value={dbHost} spellCheck={false} onChange={(e) => setDbHost(e.target.value)} />
          </Field>
          <Field label="Port">
            <input className="input font-mono" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Row({ cred }: { cred: SqlConnection }) {
  const [password, setPassword] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    if (password !== null) return setPassword(null);
    try {
      setPassword(await revealSqlConnection(cred.id));
    } catch (err) {
      fail(err);
    }
  }

  async function remove(): Promise<void> {
    const ok = await confirmDialog({ title: `„${cred.label}“ löschen?`, message: 'Die gespeicherten Zugangsdaten werden aus Feather entfernt. Der Benutzer auf dem Server bleibt bestehen.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try {
      await removeSqlConnection(cred.id);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="card px-4 py-3 animate-rise" data-cred={cred.user}>
      <div className="flex items-center gap-3">
        <KeyRound className="size-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-100 truncate">
            {cred.label}
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5 align-middle">{cred.source === 'install' ? 'Installation' : cred.source === 'user' ? 'Benutzer' : 'Manuell'}</span>
          </p>
          <p className="text-xs font-mono text-neutral-500 truncate">{cred.user}@{cred.dbHost}:{cred.port}{cred.database ? ` · ${cred.database}` : ''}</p>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void toggle()} aria-label={password === null ? 'Passwort anzeigen' : 'Passwort verbergen'} title={password === null ? 'Passwort anzeigen' : 'Passwort verbergen'}>
          {password === null ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => openInSql(cred.id)} data-action="cred-open-sql">
          <Table2 className="size-3.5" />
          In Feather SQL
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" onClick={() => void remove()} aria-label={`${cred.label} löschen`}>
          <Trash2 className="size-4" />
        </button>
      </div>
      {password !== null && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/40 border border-neutral-800 px-3 py-2 animate-fade-in" data-cred-password>
          <span className="flex-1 font-mono text-sm text-neutral-100 truncate select-text">{password || '(kein Passwort gespeichert)'}</span>
          {password && <CopyButton value={password} />}
        </div>
      )}
    </div>
  );
}

export function MariaCredentials({ session }: { session: SessionView }) {
  const all = useSqlConnections();
  const key = hostKeyOf(session);
  const list = all.filter((c) => c.kind === 'ssh' && c.hostKey === key);

  useEffect(() => {
    void loadSqlConnections().catch(fail);
  }, []);

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-neutral-200">Zugangsdaten</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Alles, was du hier speicherst, liegt verschlüsselt in Feather und lässt sich jederzeit einsehen.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => openLayer((close) => <AddDialog session={session} onClose={close} />)} data-action="cred-add">
          <Plus className="size-3.5" />
          Hinzufügen
        </button>
      </div>
      {list.length === 0 ? (
        <Empty icon={KeyRound} title="Noch keine Zugangsdaten" text="Zugangsdaten aus der Installation und von neu angelegten Benutzern speichert Feather automatisch. Du kannst auch eigene hinzufügen." />
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <Row key={c.id} cred={c} />
          ))}
        </div>
      )}
    </div>
  );
}
