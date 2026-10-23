import { useState } from 'react';
import { Field, PasswordInput } from '../components/Form';
import { Modal, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { loadSqlConnections, saveSqlConnection } from '../lib/creds';
import { getRemote } from '../lib/remote';
import { CRED_PREFIX } from '../lib/sqlsource';

function Dialog({ onDone, onClose }: { onDone: (sourceId: string) => void; onClose: () => void }) {
  const hosts = getRemote().hosts.filter((h) => h.protocol === 'ssh');
  const [kind, setKind] = useState<'direct' | 'ssh'>(hosts.length ? 'ssh' : 'direct');
  const [label, setLabel] = useState('');
  const [hostId, setHostId] = useState(hosts[0]?.id ?? '');
  const [dbHost, setDbHost] = useState(kind === 'ssh' ? '127.0.0.1' : '');
  const [port, setPort] = useState(3306);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    try {
      const saved = await saveSqlConnection({
        label: label.trim(),
        kind,
        hostKey: kind === 'ssh' ? `host:${hostId}` : '',
        dbHost: dbHost.trim() || '127.0.0.1',
        port,
        user: user.trim(),
        password,
        database: database.trim(),
        source: 'manual',
      });
      await loadSqlConnections();
      onDone(`${CRED_PREFIX}${saved.id}`);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Neue Datenbankverbindung"
      subtitle="MariaDB oder MySQL, direkt oder über einen deiner Server"
      size="max-w-lg"
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !user.trim() || (kind === 'ssh' && !hostId)} onClick={() => void submit()} data-action="sqlconn-save">Speichern und verbinden</button></>}
    >
      <div className="space-y-4">
        <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1">
          {([['ssh', 'Über SSH-Server'], ['direct', 'Direkt']] as const).map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={kind === id}
              disabled={id === 'ssh' && hosts.length === 0}
              onClick={() => {
                setKind(id);
                setDbHost(id === 'ssh' ? '127.0.0.1' : '');
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-[background-color,color] duration-150 disabled:opacity-40 ${kind === id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70'}`}
            >
              {text}
            </button>
          ))}
        </div>
        {kind === 'ssh' && (
          <Field label="Server" hint="Feather baut dafür bei Bedarf automatisch einen sicheren Tunnel auf.">
            <select className="input" value={hostId} onChange={(e) => setHostId(e.target.value)}>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Bezeichnung" hint="Optional.">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} data-bind="sqlconn-label" />
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label={kind === 'ssh' ? 'Datenbank-Host (aus Sicht des Servers)' : 'Host'}>
            <input className="input font-mono" value={dbHost} placeholder={kind === 'ssh' ? '127.0.0.1' : 'db.example.com'} spellCheck={false} onChange={(e) => setDbHost(e.target.value)} data-bind="sqlconn-host" />
          </Field>
          <Field label="Port">
            <input className="input font-mono" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} data-bind="sqlconn-port" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Benutzername">
            <input className="input font-mono" value={user} spellCheck={false} onChange={(e) => setUser(e.target.value)} data-bind="sqlconn-user" />
          </Field>
          <Field label="Standard-Datenbank" hint="Optional.">
            <input className="input font-mono" value={database} spellCheck={false} onChange={(e) => setDatabase(e.target.value)} />
          </Field>
        </div>
        <Field label="Passwort" hint="Wird verschlüsselt gespeichert.">
          <PasswordInput value={password} onChange={setPassword} data-bind="sqlconn-password" />
        </Field>
      </div>
    </Modal>
  );
}

export function openConnectionDialog(onDone: (sourceId: string) => void): void {
  openLayer((close) => <Dialog onDone={onDone} onClose={close} />);
}
