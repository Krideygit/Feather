import { Check, CircleAlert, ChevronDown, Loader2, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MODULES, type MariaDbInstallOptions, type ModuleId, type SystemInfo } from '../../../shared/modules';
import { Notice } from '../../components/Bits';
import { Field, PasswordInput, Toggle } from '../../components/Form';
import { Modal, openLayer } from '../../components/Layers';
import { toast } from '../../components/Toast';
import { hostKeyOf, saveSqlConnection } from '../../lib/creds';
import { dismissJob, getModules, startInstall, startUninstall, useModules, type JobView } from '../../lib/modules';
import { useSession } from '../../lib/remote';
import { CopyButton, MODULE_ICON, generatePassword } from './ui';

const PM_NAMES: Record<string, string> = { apt: 'apt', dnf: 'dnf', yum: 'yum', zypper: 'zypper', pacman: 'pacman', apk: 'apk' };

export function Progress({ job }: { job: JobView }) {
  const [showLog, setShowLog] = useState(job.state === 'error');
  const log = useRef<HTMLPreElement>(null);
  const current = job.steps.indexOf(job.step);
  const finished = job.state === 'done';

  useEffect(() => {
    if (job.state === 'error') setShowLog(true);
  }, [job.state]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [job.log, showLog]);

  return (
    <div className="space-y-4" data-job={job.state}>
      <ol className="space-y-2">
        {job.steps.map((step, i) => {
          const done = finished || i < current || (job.state === 'error' && i < current);
          const active = !finished && i === current && job.state === 'running';
          const failed = job.state === 'error' && i === current;
          return (
            <li key={step} className={`flex items-center gap-3 text-sm transition-colors duration-300 ${done ? 'text-neutral-300' : active ? 'text-neutral-50' : failed ? 'text-red-300' : 'text-neutral-600'}`}>
              <span className={`size-5 rounded-full grid place-items-center shrink-0 border transition-colors duration-300 ${done ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : active ? 'border-primary/60 text-primary' : failed ? 'border-red-500/50 text-red-400' : 'border-neutral-700'}`}>
                {done ? <Check className="size-3" /> : active ? <Loader2 className="size-3 animate-spin" /> : failed ? <X className="size-3" /> : null}
              </span>
              {step}
            </li>
          );
        })}
      </ol>
      {job.state === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200 animate-fade-in">
          <CircleAlert className="size-4 mt-0.5 shrink-0" />
          <span>{job.error}</span>
        </div>
      )}
      {job.state === 'detached' && <Notice tone="warn">{job.error}</Notice>}
      <div>
        <button className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200 transition-colors" onClick={() => setShowLog(!showLog)}>
          <ChevronDown className={`size-3.5 transition-transform duration-150 ${showLog ? '' : '-rotate-90'}`} />
          Technische Ausgabe
        </button>
        {showLog && (
          <pre ref={log} className="mt-2 h-48 overflow-auto rounded-lg bg-black/50 border border-neutral-800 p-3 font-mono text-[11.5px] leading-5 text-neutral-400 whitespace-pre-wrap break-all animate-fade-in">
            {job.log || 'Noch keine Ausgabe …'}
          </pre>
        )}
      </div>
    </div>
  );
}

interface Credentials {
  user: string;
  password: string;
  database: string;
  host: string;
  port: number;
  remote: boolean;
}

function InstallBody({ sid, module, sys, onClose, onManage }: { sid: string; module: ModuleId; sys: SystemInfo; onClose: () => void; onManage: () => void }) {
  const info = MODULES.find((m) => m.id === module)!;
  const job = useModules(sid).jobs[module];
  const isDb = module === 'mariadb';
  const [port, setPort] = useState(3306);
  const [remote, setRemote] = useState(false);
  const [firewall, setFirewall] = useState(true);
  const [makeUser, setMakeUser] = useState(true);
  const [user, setUser] = useState('app');
  const [database, setDatabase] = useState('app');
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [keep, setKeep] = useState(true);
  const session = useSession(sid);
  const stored = useRef(false);
  const running = job && job.kind === 'install';

  useEffect(() => {
    if (stored.current || !keep || !credentials || !session || job?.state !== 'done' || job.kind !== 'install') return;
    stored.current = true;
    void saveSqlConnection({ label: `${session.name}: ${credentials.user}`, kind: 'ssh', hostKey: hostKeyOf(session), dbHost: '127.0.0.1', port: credentials.port, user: credentials.user, password: credentials.password, database: credentials.database, source: 'install' }).catch((err: Error) => toast(err.message, 'error'));
  }, [job?.state, job?.kind, credentials, keep, session]);

  async function submit(): Promise<void> {
    if (isDb && makeUser && password.length < 8) return void toast('Das Passwort braucht mindestens 8 Zeichen.', 'error');
    setBusy(true);
    const options = isDb
      ? ({ port, remote, firewall, user: makeUser ? user.trim() : '', database: makeUser ? database.trim() : '', password: makeUser ? password : '', userHost: remote ? '%' : 'localhost' } satisfies Partial<MariaDbInstallOptions>)
      : { firewall };
    if (isDb && makeUser) setCredentials({ user: user.trim(), password, database: database.trim(), host: '', port, remote });
    const ok = await startInstall(sid, module, options);
    setBusy(false);
    if (!ok) setCredentials(null);
  }

  if (running) {
    return (
      <div className="space-y-5">
        <Progress job={job} />
        {job.state === 'done' && credentials && (
          <div className="card p-4 space-y-2 animate-rise" data-credentials>
            <p className="text-sm font-medium text-neutral-100">Deine Zugangsdaten</p>
            <p className="text-xs text-neutral-500">{keep ? 'Feather hat die Zugangsdaten verschlüsselt gespeichert. Du findest sie unter MariaDB, Reiter „Zugangsdaten“.' : 'Notiere dir das Passwort jetzt. Feather speichert es nicht.'}</p>
            {[
              ['Benutzer', credentials.user],
              ['Passwort', credentials.password],
              ...(credentials.database ? [['Datenbank', credentials.database]] : []),
              ['Port', String(credentials.port)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <span className="w-24 text-neutral-500">{label}</span>
                <span className="flex-1 font-mono text-neutral-100 truncate select-text">{value}</span>
                <CopyButton value={value as string} />
              </div>
            ))}
            {!credentials.remote && <p className="text-xs text-neutral-500 pt-1">Der Zugriff ist nur auf dem Server selbst möglich. Für Verbindungen von außen aktiviere den Fernzugriff unter Einstellungen.</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {job.state === 'error' && (
            <button className="btn btn-outline" onClick={() => dismissJob(sid, module)}>
              <RefreshCw className="size-4" />
              Zurück zu den Optionen
            </button>
          )}
          {job.state === 'done' ? (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Schließen</button>
              <button className="btn btn-primary" onClick={() => { onClose(); onManage(); }} data-action="install-manage">{info.name} verwalten</button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={onClose}>{job.state === 'running' ? 'Im Hintergrund weiter' : 'Schließen'}</button>
          )}
        </div>
      </div>
    );
  }

  const label = PM_NAMES[sys.pm] ?? sys.pm;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-300 space-y-1.5">
        <p className="font-medium text-neutral-100">Das passiert auf deinem Server</p>
        <p>• {info.name} wird mit <span className="font-mono text-neutral-200">{label}</span> aus den Paketquellen von {sys.os} installiert.</p>
        <p>• Der Dienst wird gestartet und beim Hochfahren automatisch geladen.</p>
        {isDb ? <p>• Standardmäßig ist die Datenbank nur auf dem Server selbst erreichbar. Das ist die sichere Einstellung.</p> : <p>• Die Ports 80 und 443 werden in der Firewall freigegeben, falls eine aktiv ist.</p>}
      </div>

      {isDb ? (
        <div className="space-y-4">
          <Toggle checked={makeUser} onChange={setMakeUser} label="Datenbank und Benutzer anlegen" description="Empfohlen: ein eigener Benutzer für deine Website oder App." />
          {makeUser && (
            <div className="space-y-4 rounded-xl border border-neutral-800 p-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Benutzername">
                  <input className="input font-mono" value={user} spellCheck={false} onChange={(e) => setUser(e.target.value)} data-bind="db-user" />
                </Field>
                <Field label="Datenbank">
                  <input className="input font-mono" value={database} spellCheck={false} onChange={(e) => setDatabase(e.target.value)} data-bind="db-name" />
                </Field>
              </div>
              <Field label="Passwort" hint="Wurde zufällig erzeugt. Du kannst es ändern oder neu erzeugen lassen.">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <PasswordInput value={password} onChange={setPassword} data-bind="db-password" />
                  </div>
                  <button type="button" className="btn btn-outline btn-icon shrink-0" title="Neues Passwort erzeugen" aria-label="Neues Passwort erzeugen" onClick={() => setPassword(generatePassword())}>
                    <RefreshCw className="size-4" />
                  </button>
                </div>
              </Field>
            </div>
          )}
          {makeUser && <Toggle checked={keep} onChange={setKeep} label="Zugangsdaten in Feather speichern" description="Verschlüsselt und jederzeit einsehbar. So kannst du die Datenbank direkt in Feather SQL öffnen." />}
          <Toggle checked={remote} onChange={setRemote} label="Zugriff von außen erlauben" description="Nur nötig, wenn sich z. B. HeidiSQL oder deine App von einem anderen Rechner verbindet." />
          {remote && (
            <div className="space-y-4 animate-fade-in">
              <Notice tone="warn">Eine Datenbank im Internet wird ständig angegriffen. Nutze starke Passwörter und lass nur Benutzer zu, die du wirklich brauchst.</Notice>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Port">
                  <input className="input font-mono" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} />
                </Field>
              </div>
              <Toggle checked={firewall} onChange={setFirewall} label="Firewall-Port freigeben" description="Gilt für die Firewall auf dem Server (ufw oder firewalld). Eine Firewall deines Hosters musst du selbst öffnen." />
            </div>
          )}
        </div>
      ) : (
        <Toggle checked={firewall} onChange={setFirewall} label="Firewall-Ports 80 und 443 freigeben" description="Gilt für die Firewall auf dem Server (ufw oder firewalld). Eine Firewall deines Hosters musst du selbst öffnen." />
      )}

      {sys.sudo !== 'root' && sys.sudo !== 'none' && (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <ShieldAlert className="size-3.5" />
          Du bist als „{sys.user}“ angemeldet. Für die Installation fragt Feather bei Bedarf nach deinem sudo-Passwort.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()} data-action="install-start">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {info.name} installieren
        </button>
      </div>
    </div>
  );
}

function UninstallBody({ sid, module, onClose }: { sid: string; module: ModuleId; onClose: () => void }) {
  const info = MODULES.find((m) => m.id === module)!;
  const job = useModules(sid).jobs[module];
  const [purge, setPurge] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = job && job.kind === 'uninstall';

  if (active) {
    return (
      <div className="space-y-5">
        <Progress job={job} />
        <div className="flex justify-end gap-2">
          <button className="btn btn-primary" onClick={() => { dismissJob(sid, module); onClose(); }}>
            {job.state === 'running' ? 'Im Hintergrund weiter' : 'Schließen'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-300">
        {info.name} wird vom Server entfernt und der Dienst gestoppt.{module === 'mariadb' ? ' Deine Datenbanken bleiben standardmäßig erhalten, falls du sie später wieder brauchst.' : ' Deine Websites und Dateien im Website-Ordner bleiben erhalten.'}
      </p>
      {module === 'mariadb' && (
        <Toggle checked={purge} onChange={setPurge} label="Auch alle Datenbanken löschen" description="Löscht alle Daten unwiderruflich vom Server." />
      )}
      {purge && <Notice tone="error">Alle Datenbanken und Benutzer gehen verloren. Das kann nicht rückgängig gemacht werden.</Notice>}
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
        <button
          className="btn btn-danger-solid"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void startUninstall(sid, module, purge).finally(() => setBusy(false));
          }}
          data-action="uninstall-start"
        >
          {info.name} deinstallieren
        </button>
      </div>
    </div>
  );
}

export function openInstall(sid: string, module: ModuleId, sys: SystemInfo, onManage: () => void): void {
  const existing = getModules(sid).jobs[module];
  if (existing && existing.state !== 'running') dismissJob(sid, module);
  const info = MODULES.find((m) => m.id === module)!;
  const Icon = MODULE_ICON[module];
  openLayer((close) => (
    <Modal
      title={
        <span className="flex items-center gap-2.5">
          <Icon className="size-5 text-primary" />
          {info.name} installieren
        </span>
      }
      subtitle={`${sys.os} · ${sys.arch}`}
      size="max-w-xl"
      dismissible={false}
      onClose={close}
    >
      <InstallBody sid={sid} module={module} sys={sys} onClose={close} onManage={onManage} />
    </Modal>
  ));
}

export function openUninstall(sid: string, module: ModuleId, onDone: () => void): void {
  const existing = getModules(sid).jobs[module];
  if (existing && existing.state !== 'running') dismissJob(sid, module);
  const info = MODULES.find((m) => m.id === module)!;
  openLayer((close) => (
    <Modal title={`${info.name} deinstallieren`} size="max-w-lg" dismissible={false} onClose={() => { close(); onDone(); }}>
      <UninstallBody sid={sid} module={module} onClose={() => { close(); onDone(); }} />
    </Modal>
  ));
}

export function openProgress(sid: string, module: ModuleId, sys: SystemInfo, onManage: () => void, onDone: () => void): void {
  if (getModules(sid).jobs[module]?.kind === 'uninstall') openUninstall(sid, module, onDone);
  else openInstall(sid, module, sys, onManage);
}
