import { Info, Key, Pencil, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { DbUser, Service } from '../../shared/types';
import { Field, PasswordInput } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { applyServiceView, attempt, call } from '../lib/api';
import { NotRunning } from './Databases';
import { useDatabases } from './useDatabases';

export function UsersTab({ service }: { service: Service }) {
  const running = service.status === 'running';
  const [users, setUsers] = useState<DbUser[] | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      setUsers(await call<DbUser[]>('db.users', { id: service.id }));
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [service.id]);

  useEffect(() => {
    if (running) void reload();
    else setUsers(null);
  }, [running, reload]);

  if (!running) return <NotRunning text="Starte den Service, um Benutzer zu verwalten." />;

  async function drop(u: DbUser): Promise<void> {
    const ok = await confirmDialog({
      title: `Benutzer „${u.user}“ löschen?`,
      message: `${u.user}@${u.host} verliert den Zugriff auf alle Datenbanken.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await attempt(call('db.userDrop', { id: service.id, user: u.user, host: u.host }), { success: `Benutzer „${u.user}“ gelöscht.` });
    void reload();
  }

  async function showGrants(u: DbUser): Promise<void> {
    const lines = await attempt(call<string[]>('db.userGrants', { id: service.id, user: u.user, host: u.host }));
    if (!lines) return;
    openLayer((close) => (
      <Modal title={`Rechte von „${u.user}“`} subtitle={`${u.user}@${u.host}`} size="max-w-2xl" onClose={close} footer={<button className="btn btn-ghost" onClick={close}>Schließen</button>}>
        <pre className="rounded-lg bg-black/40 border border-neutral-800 p-3 text-[12px] leading-5 font-mono text-neutral-300 whitespace-pre-wrap break-all">{lines.join('\n')}</pre>
      </Modal>
    ));
  }

  const iconButton = 'btn btn-ghost btn-icon btn-sm';
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Konten dieser Datenbank. Neue Benutzer gelten für <span className="font-mono">localhost</span>.
        </p>
        <button className="btn btn-primary btn-sm shrink-0" data-action="userCreate" onClick={() => openLayer((close) => <CreateUserDialog service={service} onDone={() => void reload()} onClose={close} />)}>
          <UserPlus className="size-3.5" />
          Benutzer anlegen
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-4 card overflow-hidden">
        {users === null ? (
          <p className="p-6 text-center text-sm text-neutral-500">Lade …</p>
        ) : (
          users.map((u) => (
            <div key={`${u.user}@${u.host}`} className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-800 last:border-0">
              <span className={`size-8 rounded-lg grid place-items-center shrink-0 ${u.root ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-400'}`}>
                {u.root ? <Shield className="size-4" /> : <Users className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-100 truncate">
                  {u.user || '(anonym)'}
                  <span className="text-neutral-500">@{u.host}</span>
                  {u.root && <span className="ml-1 text-[11px] text-primary"> Root</span>}
                </p>
              </div>
              <button className={iconButton} onClick={() => void showGrants(u)} title="Rechte anzeigen" aria-label="Rechte anzeigen">
                <Info className="size-4" />
              </button>
              <button className={iconButton} data-action="userPassword" data-user={u.user} data-host={u.host} onClick={() => openPasswordDialog(service.id, u.user, u.host)} title="Passwort ändern" aria-label="Passwort ändern">
                <Key className="size-4" />
              </button>
              {!u.system && (
                <>
                  <button className={iconButton} onClick={() => openLayer((close) => <RenameDialog service={service} user={u} onDone={() => void reload()} onClose={close} />)} title="Umbenennen" aria-label="Umbenennen">
                    <Pencil className="size-4" />
                  </button>
                  <button className="btn btn-danger btn-icon btn-sm" onClick={() => void drop(u)} title="Löschen" aria-label="Löschen">
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function CreateUserDialog({ service, onDone, onClose }: { service: Service; onDone: () => void; onClose: () => void }) {
  const { dbs } = useDatabases(service.id, true);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(): Promise<void> {
    setBusy(true);
    const ok = await attempt(call('db.userCreate', { id: service.id, user: user.trim(), password, database: database || undefined }));
    setBusy(false);
    if (!ok) return;
    onClose();
    toast(`Benutzer „${user.trim()}“ angelegt.`, 'success');
    onDone();
  }

  return (
    <Modal
      title="Benutzer anlegen"
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy || !user.trim()} onClick={() => void create()}>
            <UserPlus className="size-4" />
            Anlegen
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Benutzername">
          <input className="input" value={user} maxLength={32} autoComplete="off" onChange={(e) => setUser(e.target.value)} />
        </Field>
        <Field label="Passwort">
          <PasswordInput value={password} onChange={setPassword} placeholder="leer lassen für keins" />
        </Field>
        <Field label="Zugriff" hint="Vergibt alle Rechte auf die gewählte Datenbank.">
          <select className="input" value={database} onChange={(e) => setDatabase(e.target.value)}>
            <option value="">Keine Rechte</option>
            <option value="*">Alle Datenbanken</option>
            {(dbs ?? []).filter((d) => !d.system).map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export const openPasswordDialog = (serviceId: string, user: string, host: string): void =>
  openLayer((close) => <PasswordDialog serviceId={serviceId} user={user} host={host} onClose={close} />);

function PasswordDialog({ serviceId, user, host, onClose }: { serviceId: string; user: string; host: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    const view = await attempt(call<Service>('db.userPassword', { id: serviceId, user, host, password }));
    setBusy(false);
    if (!view) return;
    applyServiceView(view);
    onClose();
    toast('Passwort geändert.', 'success');
  }

  return (
    <Modal
      title={`Passwort für „${user}“ ändern`}
      subtitle={`${user}@${host}`}
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()} data-action="save">
            Speichern
          </button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={(e) => e.key === 'Enter' && void save()}>
        <Field label="Neues Passwort">
          <PasswordInput value={password} onChange={setPassword} placeholder="leer lassen, um es zu entfernen" />
        </Field>
        {user === 'root' && (
          <p className="text-xs text-neutral-400 bg-neutral-800/60 rounded-lg px-3 py-2">
            Das ist das Passwort, mit dem sich auch deine Anwendungen als root verbinden. Feather merkt sich das neue Passwort automatisch.
          </p>
        )}
      </div>
    </Modal>
  );
}

function RenameDialog({ service, user, onDone, onClose }: { service: Service; user: DbUser; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState(user.user);
  const [busy, setBusy] = useState(false);
  const valid = name.trim() !== '' && name.trim() !== user.user;

  async function save(): Promise<void> {
    if (!valid) return;
    setBusy(true);
    const ok = await attempt(call('db.userRename', { id: service.id, user: user.user, host: user.host, newName: name.trim() }));
    setBusy(false);
    if (!ok) return;
    onClose();
    toast(`Benutzer heißt jetzt „${name.trim()}“.`, 'success');
    onDone();
  }

  return (
    <Modal
      title={`„${user.user}“ umbenennen`}
      subtitle={`${user.user}@${user.host}`}
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy || !valid} onClick={() => void save()}>Umbenennen</button>
        </>
      }
    >
      <Field label="Neuer Benutzername">
        <input className="input" value={name} maxLength={32} autoComplete="off" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
      </Field>
    </Modal>
  );
}
