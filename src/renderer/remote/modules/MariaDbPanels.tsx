import { Database, KeyRound, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { DatabaseInfo, DbSettings, DbUserInfo, Grant, ModuleState } from '../../../shared/modules';
import { Notice } from '../../components/Bits';
import { Field, PasswordInput, Toggle } from '../../components/Form';
import { Modal, confirmDialog, openLayer } from '../../components/Layers';
import { toast } from '../../components/Toast';
import { formatBytes } from '../../lib/format';
import { hostKeyOf, saveSqlConnection } from '../../lib/creds';
import { callModule } from '../../lib/modules';
import type { SessionView } from '../../lib/remote';
import { CopyButton, Empty, ErrorBox, InfoCard, generatePassword, useAsync } from './ui';

const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), 'error');

function Stopped() {
  return <Notice tone="warn">MariaDB läuft gerade nicht. Starte den Dienst oben, um Datenbanken und Benutzer zu verwalten.</Notice>;
}

export function MariaOverview({ session, state }: { session: SessionView; state: ModuleState }) {
  const { data, error, reload } = useAsync(() => (state.running ? callModule<DbSettings>(session.sid, 'db.settings') : Promise.resolve(undefined)), [session.sid, state.running]);
  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {!state.running && <Stopped />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        <InfoCard label="Dienst" value={state.running ? 'Läuft' : 'Gestoppt'} tone={state.running ? 'good' : 'warn'} />
        <InfoCard label="Autostart" value={state.enabled ? 'Aktiv' : 'Aus'} hint="Startet beim Hochfahren des Servers" />
        <InfoCard label="Version" value={state.version || 'unbekannt'} />
        <InfoCard label="Port" value={data ? data.port : '–'} />
        <InfoCard label="Erreichbar" value={data ? (data.remote ? 'Von außen' : 'Nur lokal') : '–'} tone={data?.remote ? 'warn' : undefined} hint={data?.bind ? `Adresse: ${data.bind}` : undefined} />
      </div>
      {data && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-medium text-neutral-100">Verbinden</p>
          {data.remote ? (
            <>
              <p className="text-xs text-neutral-500">Trage in deiner Anwendung diese Adresse ein:</p>
              <div className="flex items-center gap-2 rounded-lg bg-black/40 border border-neutral-800 px-3 py-2">
                <span className="flex-1 font-mono text-sm text-neutral-100 select-text">{session.host}:{data.port}</span>
                <CopyButton value={`${session.host}:${data.port}`} />
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-400">Die Datenbank ist nur auf dem Server selbst erreichbar (127.0.0.1:{data.port}). Deine Website auf demselben Server nutzt sie so automatisch. Für Zugriffe von deinem Rechner aktiviere den Fernzugriff unter „Einstellungen“.</p>
          )}
        </div>
      )}
    </div>
  );
}

function NameDialog({ title, label, hint, confirm, onSubmit, onClose }: { title: string; label: string; hint?: string; confirm: string; onSubmit: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(): Promise<void> {
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }
  return (
    <Modal title={title} size="max-w-md" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void submit()} data-action="dialog-submit">{confirm}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label={label} hint={hint}>
          <input className="input font-mono" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} data-bind="dialog-name" />
        </Field>
      </form>
    </Modal>
  );
}

export function MariaDatabases({ session, state }: { session: SessionView; state: ModuleState }) {
  const { sid } = session;
  const { data, loading, error, reload } = useAsync(() => (state.running ? callModule<DatabaseInfo[]>(sid, 'db.databases') : Promise.resolve([])), [sid, state.running]);

  const create = (): void =>
    openLayer((close) => (
      <NameDialog
        title="Neue Datenbank"
        label="Name der Datenbank"
        hint="Buchstaben, Zahlen und _ (z. B. mein_shop)."
        confirm="Anlegen"
        onClose={close}
        onSubmit={async (name) => {
          await callModule(sid, 'db.createDb', { name });
          toast(`Datenbank „${name}“ wurde angelegt.`, 'success');
          reload();
        }}
      />
    ));

  async function drop(db: DatabaseInfo): Promise<void> {
    const ok = await confirmDialog({ title: `„${db.name}“ löschen?`, message: `Die Datenbank mit ${db.tables} Tabellen (${formatBytes(db.bytes)}) wird unwiderruflich gelöscht.`, confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try {
      await callModule(sid, 'db.dropDb', { name: db.name });
      toast('Datenbank gelöscht.', 'success');
      reload();
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {!state.running && <Stopped />}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-neutral-200 flex-1">Datenbanken</h3>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={reload} aria-label="Aktualisieren" disabled={loading || !state.running}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={!state.running} data-action="db-create">
          <Plus className="size-3.5" />
          Datenbank
        </button>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && state.running && <Empty icon={Database} title="Noch keine Datenbank" text="Lege eine Datenbank für deine Website oder App an." />}
      <div className="space-y-2">
        {data?.map((db) => (
          <div key={db.name} className="card flex items-center gap-3 px-4 py-3 animate-rise" data-db={db.name}>
            <Database className={`size-4 shrink-0 ${db.system ? 'text-neutral-600' : 'text-primary'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100 truncate">{db.name}</p>
              <p className="text-xs text-neutral-500">{db.tables} {db.tables === 1 ? 'Tabelle' : 'Tabellen'} · {formatBytes(db.bytes)}</p>
            </div>
            {db.system ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5">System</span>
            ) : (
              <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" aria-label={`${db.name} löschen`} onClick={() => void drop(db)}>
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UserDialog({ session, port, databases, onDone, onClose }: { session: SessionView; port: number; databases: DatabaseInfo[]; onDone: () => void; onClose: () => void }) {
  const sid = session.sid;
  const [store, setStore] = useState(true);
  const [name, setName] = useState('');
  const [hostMode, setHostMode] = useState<'localhost' | '%' | 'custom'>('localhost');
  const [custom, setCustom] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [database, setDatabase] = useState(databases.find((d) => !d.system)?.name ?? '*');
  const [grant, setGrant] = useState<Grant>('all');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const host = hostMode === 'custom' ? custom.trim() : hostMode;

  async function submit(): Promise<void> {
    setBusy(true);
    try {
      await callModule(sid, 'db.createUser', { user: { name: name.trim(), host, password, database, grant } });
      if (store) await saveSqlConnection({ label: name.trim(), kind: 'ssh', hostKey: hostKeyOf(session), dbHost: '127.0.0.1', port, user: name.trim(), password, database: database === '*' ? '' : database, source: 'user' });
      onDone();
      setCreated(true);
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  if (created) {
    return (
      <Modal title="Benutzer angelegt" size="max-w-md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Fertig</button>}>
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">{store ? 'Das Passwort ist verschlüsselt in Feather gespeichert (Reiter „Zugangsdaten“).' : 'Notiere dir das Passwort jetzt. Feather speichert es nicht.'}</p>
          {[['Benutzer', name.trim()], ['Passwort', password], ['Host', host]].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <span className="w-20 text-neutral-500">{label}</span>
              <span className="flex-1 font-mono text-neutral-100 truncate select-text">{value}</span>
              <CopyButton value={value as string} />
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Neuer Benutzer"
      size="max-w-lg"
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !name.trim() || password.length < 8} onClick={() => void submit()} data-action="dialog-submit">Anlegen</button></>}
    >
      <div className="space-y-4">
        <Field label="Benutzername" hint="Buchstaben, Zahlen und _.">
          <input className="input font-mono" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} data-bind="user-name" />
        </Field>
        <Field label="Passwort" hint="Mindestens 8 Zeichen. Wurde zufällig erzeugt.">
          <div className="flex gap-2">
            <div className="flex-1">
              <PasswordInput value={password} onChange={setPassword} data-bind="user-password" />
            </div>
            <button type="button" className="btn btn-outline btn-icon shrink-0" aria-label="Neues Passwort erzeugen" title="Neues Passwort erzeugen" onClick={() => setPassword(generatePassword())}>
              <RefreshCw className="size-4" />
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Darf sich verbinden von">
            <select className="input" value={hostMode} onChange={(e) => setHostMode(e.target.value as typeof hostMode)}>
              <option value="localhost">Nur vom Server selbst</option>
              <option value="%">Von überall</option>
              <option value="custom">Bestimmte Adresse …</option>
            </select>
          </Field>
          {hostMode === 'custom' && (
            <Field label="IP-Adresse oder Host">
              <input className="input font-mono" value={custom} spellCheck={false} placeholder="203.0.113.5" onChange={(e) => setCustom(e.target.value)} />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Zugriff auf">
            <select className="input" value={database} onChange={(e) => setDatabase(e.target.value)}>
              {databases.filter((d) => !d.system).map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
              <option value="*">Alle Datenbanken</option>
            </select>
          </Field>
          <Field label="Rechte">
            <select className="input" value={grant} onChange={(e) => setGrant(e.target.value as Grant)}>
              <option value="all">Alles</option>
              <option value="readwrite">Lesen und Schreiben</option>
              <option value="read">Nur Lesen</option>
            </select>
          </Field>
        </div>
        <Toggle checked={store} onChange={setStore} label="In Feather speichern" description="Verschlüsselt, jederzeit einsehbar und direkt in Feather SQL nutzbar." />
        {hostMode === '%' && <Notice tone="warn">Von überall bedeutet: jeder, der den Port erreicht, kann sich mit diesem Benutzer versuchen anzumelden. Nutze ein starkes Passwort.</Notice>}
      </div>
    </Modal>
  );
}

function PasswordDialog({ session, port, user, onClose }: { session: SessionView; port: number; user: DbUserInfo; onClose: () => void }) {
  const sid = session.sid;
  const [store, setStore] = useState(true);
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(): Promise<void> {
    setBusy(true);
    try {
      await callModule(sid, 'db.userPassword', { name: user.name, host: user.host, password });
      if (store) await saveSqlConnection({ label: user.name, kind: 'ssh', hostKey: hostKeyOf(session), dbHost: '127.0.0.1', port, user: user.name, password, database: '', source: 'user' });
      setDone(true);
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }
  return (
    <Modal
      title={`Passwort für ${user.name}@${user.host}`}
      size="max-w-md"
      onClose={onClose}
      footer={done ? <button className="btn btn-primary" onClick={onClose}>Fertig</button> : <><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || password.length < 8} onClick={() => void submit()} data-action="dialog-submit">Ändern</button></>}
    >
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">{store ? 'Das Passwort wurde geändert und verschlüsselt in Feather gespeichert.' : 'Das Passwort wurde geändert. Notiere es dir jetzt.'}</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1 font-mono text-neutral-100 truncate select-text">{password}</span>
            <CopyButton value={password} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
        <Field label="Neues Passwort" hint="Mindestens 8 Zeichen.">
          <div className="flex gap-2">
            <div className="flex-1">
              <PasswordInput value={password} onChange={setPassword} />
            </div>
            <button type="button" className="btn btn-outline btn-icon shrink-0" aria-label="Neues Passwort erzeugen" onClick={() => setPassword(generatePassword())}>
              <RefreshCw className="size-4" />
            </button>
          </div>
        </Field>
        <Toggle checked={store} onChange={setStore} label="In Feather speichern" description="Aktualisiert die gespeicherten Zugangsdaten dieses Benutzers." />
        </div>
      )}
    </Modal>
  );
}

export function MariaUsers({ session, state }: { session: SessionView; state: ModuleState }) {
  const { sid } = session;
  const { data, loading, error, reload } = useAsync(() => (state.running ? callModule<DbUserInfo[]>(sid, 'db.users') : Promise.resolve([])), [sid, state.running]);

  async function add(): Promise<void> {
    try {
      const [databases, settings] = await Promise.all([callModule<DatabaseInfo[]>(sid, 'db.databases'), callModule<DbSettings>(sid, 'db.settings')]);
      openLayer((close) => <UserDialog session={session} port={settings.port} databases={databases} onDone={reload} onClose={close} />);
    } catch (err) {
      fail(err);
    }
  }

  async function drop(user: DbUserInfo): Promise<void> {
    const ok = await confirmDialog({ title: `„${user.name}@${user.host}“ löschen?`, message: 'Der Benutzer verliert sofort jeden Zugriff. Seine Datenbanken bleiben erhalten.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try {
      await callModule(sid, 'db.dropUser', { name: user.name, host: user.host });
      toast('Benutzer gelöscht.', 'success');
      reload();
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {!state.running && <Stopped />}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-neutral-200 flex-1">Benutzer</h3>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={reload} aria-label="Aktualisieren" disabled={loading || !state.running}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => void add()} disabled={!state.running} data-action="user-create">
          <Plus className="size-3.5" />
          Benutzer
        </button>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="space-y-2">
        {data?.map((u) => (
          <div key={`${u.name}@${u.host}`} className="card flex items-center gap-3 px-4 py-3 animate-rise" data-user={`${u.name}@${u.host}`}>
            <UserRound className={`size-4 shrink-0 ${u.system ? 'text-neutral-600' : 'text-primary'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100 truncate">{u.name || '(anonym)'}<span className="text-neutral-500 font-normal">@{u.host}</span></p>
              <p className="text-xs text-neutral-500">{u.plugin === 'unix_socket' || u.plugin === 'auth_socket' ? 'Anmeldung über das Systemkonto' : 'Anmeldung mit Passwort'}</p>
            </div>
            {u.system ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5">System</span>
            ) : (
              <>
                <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Passwort von ${u.name} ändern`} title="Passwort ändern" onClick={() => void callModule<DbSettings>(sid, 'db.settings').then((st) => openLayer((close) => <PasswordDialog session={session} port={st.port} user={u} onClose={close} />), fail)}>
                  <KeyRound className="size-4" />
                </button>
                <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" aria-label={`${u.name} löschen`} onClick={() => void drop(u)}>
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MariaSettings({ session, state }: { session: SessionView; state: ModuleState }) {
  const { sid } = session;
  const { data, error, reload } = useAsync(() => (state.running ? callModule<DbSettings>(sid, 'db.settings') : Promise.resolve(undefined)), [sid, state.running]);
  const [port, setPort] = useState<number | null>(null);
  const [remote, setRemote] = useState<boolean | null>(null);
  const [firewall, setFirewall] = useState(true);
  const [busy, setBusy] = useState(false);
  const currentPort = port ?? data?.port ?? 3306;
  const currentRemote = remote ?? data?.remote ?? false;
  const changed = data !== undefined && (currentPort !== data.port || currentRemote !== data.remote);

  async function apply(): Promise<void> {
    const ok = await confirmDialog({ title: 'Einstellungen übernehmen?', message: 'MariaDB wird dafür kurz neu gestartet. Aktive Verbindungen werden getrennt.', confirmLabel: 'Übernehmen und neu starten' });
    if (!ok) return;
    setBusy(true);
    try {
      await callModule(sid, 'db.configure', { port: currentPort, remote: currentRemote, firewall });
      toast('Einstellungen übernommen.', 'success');
      setPort(null);
      setRemote(null);
      reload();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  return (
    <div className="p-6 space-y-5 max-w-xl animate-fade-in">
      {!state.running && <Stopped />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Field label="Port" hint="Standard ist 3306.">
        <input className="input font-mono w-40" type="number" min={1} max={65535} value={currentPort} disabled={!state.running} onChange={(e) => setPort(Number(e.target.value))} data-bind="db-port" />
      </Field>
      <Toggle checked={currentRemote} onChange={setRemote} disabled={!state.running} label="Zugriff von außen erlauben" description="Erlaubt Verbindungen von anderen Rechnern, z. B. mit HeidiSQL. Der Benutzer muss zusätzlich von dort zugelassen sein." />
      {currentRemote && !data?.remote && <Notice tone="warn">Eine Datenbank im Internet wird ständig angegriffen. Nutze starke Passwörter und erlaube nur Benutzer, die du brauchst.</Notice>}
      <Toggle checked={firewall} onChange={setFirewall} disabled={!state.running} label="Firewall automatisch anpassen" description="Öffnet oder schließt den Port in ufw oder firewalld, falls aktiv." />
      <div>
        <button className="btn btn-primary" disabled={!changed || busy || !state.running} onClick={() => void apply()} data-action="db-apply">
          Übernehmen und neu starten
        </button>
      </div>
    </div>
  );
}
