import { Cable, Copy, FolderTree, KeyRound, MoreHorizontal, Pencil, Plug, Plus, ShieldAlert, Terminal, Trash2, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DEFAULT_PORTS, type FtpSecurity, type RemoteAuth, type RemoteHost, type RemoteHostInput, type RemoteProtocol } from '../../shared/remote';
import { Notice, PageHeader } from '../components/Bits';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { Field, PasswordInput, Toggle } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { attemptRemote, connect, removeHost, saveHost, useRemote, type ConnectSource } from '../lib/remote';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#d946ef', '#8b5cf6', '#64748b'];

const PROTOCOLS: { id: RemoteProtocol; label: string; hint: string }[] = [
  { id: 'ssh', label: 'SSH', hint: 'Terminal und Dateien' },
  { id: 'sftp', label: 'SFTP', hint: 'Nur Dateien' },
  { id: 'ftp', label: 'FTP / FTPS', hint: 'Nur Dateien' },
];

const AUTHS: { id: RemoteAuth; label: string }[] = [
  { id: 'password', label: 'Passwort' },
  { id: 'key', label: 'Schlüsseldatei' },
  { id: 'agent', label: 'SSH-Agent' },
];

const blank = (): RemoteHostInput => ({
  name: '',
  protocol: 'ssh',
  host: '',
  port: 22,
  username: 'root',
  auth: 'password',
  keyPath: '',
  secure: 'none',
  ignoreCertErrors: false,
  startPath: '',
  color: COLORS[0] as string,
  password: undefined,
  passphrase: undefined,
});

function fromHost(h: RemoteHost): RemoteHostInput {
  const { id, name, protocol, host, port, username, auth, keyPath, secure, ignoreCertErrors, startPath, color } = h;
  return { id, name, protocol, host, port, username, auth, keyPath, secure, ignoreCertErrors, startPath, color, password: undefined, passphrase: undefined };
}

export const sourceOf = (h: Pick<RemoteHost, 'id' | 'name' | 'color' | 'protocol' | 'host' | 'port' | 'auth'>): ConnectSource => ({
  hostId: h.id,
  name: h.name,
  color: h.color,
  protocol: h.protocol,
  host: h.host,
  port: h.port,
  auth: h.auth,
});

const draftSource = (input: RemoteHostInput): ConnectSource => ({
  draft: input,
  name: input.name.trim() || input.host.trim(),
  color: input.color,
  protocol: input.protocol,
  host: input.host.trim(),
  port: input.port,
  auth: input.auth,
});

export const protocolLabel = (h: Pick<RemoteHost, 'protocol' | 'secure'>): string =>
  h.protocol === 'ftp' ? (h.secure === 'none' ? 'FTP' : 'FTPS') : h.protocol.toUpperCase();

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          data-option={o.id}
          className={`rounded-lg px-3 py-1.5 text-center transition-[background-color,color] duration-150 ${value === o.id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70'}`}
        >
          <span className="block text-sm font-medium">{o.label}</span>
          {o.hint && <span className="block text-[11px] opacity-70">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

function HostDialog({ initial, saved, onClose }: { initial: RemoteHostInput; saved: RemoteHost | null; onClose: () => void }) {
  const [form, setForm] = useState<RemoteHostInput>(initial);
  const [portTouched, setPortTouched] = useState(Boolean(saved));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof RemoteHostInput>(key: K, value: RemoteHostInput[K]): void => setForm((f) => ({ ...f, [key]: value }));
  const ssh = form.protocol !== 'ftp';

  function pickProtocol(protocol: RemoteProtocol): void {
    setForm((f) => ({
      ...f,
      protocol,
      port: portTouched ? f.port : DEFAULT_PORTS[protocol],
      username: protocol === 'ftp' && f.username === 'root' ? 'anonymous' : protocol !== 'ftp' && f.username === 'anonymous' ? 'root' : f.username,
    }));
  }

  async function chooseKey(): Promise<void> {
    const file = await window.feather.openFile({ title: 'Private Schlüsseldatei auswählen', filters: [{ name: 'Alle Dateien', extensions: ['*'] }] });
    if (file) set('keyPath', file);
  }

  async function submit(mode: 'save' | 'connect' | 'only'): Promise<void> {
    if (!form.host.trim()) return void toast('Bitte gib einen Host oder eine IP-Adresse an.', 'error');
    setBusy(true);
    if (mode === 'only') {
      onClose();
      void connect(draftSource(form));
      return;
    }
    const result = await attemptRemote(saveHost(form));
    setBusy(false);
    if (!result) return;
    onClose();
    toast(`„${result.name}“ wurde gespeichert.`, 'success');
    if (mode === 'connect') void connect(sourceOf(result));
  }

  return (
    <Modal
      title={saved ? 'Verbindung bearbeiten' : 'Neue Verbindung'}
      subtitle="SSH-Terminal, SFTP oder FTP zu deinem Server"
      size="max-w-xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost mr-auto" disabled={busy} onClick={() => void submit('only')} data-action="host-only">
            <Zap className="size-4" />
            Nur verbinden
          </button>
          <button className="btn btn-outline" disabled={busy} onClick={() => void submit('save')} data-action="host-save">Speichern</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void submit('connect')} data-action="host-save-connect">
            <Plug className="size-4" />
            Speichern und verbinden
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented label="Protokoll" value={form.protocol} options={PROTOCOLS} onChange={pickProtocol} />

        <div className="grid grid-cols-[1fr_110px] gap-4">
          <Field label="Host oder IP-Adresse">
            <input className="input font-mono" value={form.host} placeholder="203.0.113.10 oder server.example.com" spellCheck={false} onChange={(e) => set('host', e.target.value)} data-bind="host" />
          </Field>
          <Field label="Port">
            <input
              className="input font-mono"
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => {
                setPortTouched(true);
                set('port', Number(e.target.value));
              }}
              data-bind="port"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" hint="Optional. Sonst wird der Host angezeigt.">
            <input className="input" value={form.name} placeholder={form.host || 'Mein Server'} onChange={(e) => set('name', e.target.value)} data-bind="name" />
          </Field>
          <Field label="Benutzername">
            <input className="input font-mono" value={form.username} spellCheck={false} onChange={(e) => set('username', e.target.value)} data-bind="username" />
          </Field>
        </div>

        {ssh ? (
          <>
            <div>
              <label className="label">Anmeldung</label>
              <Segmented label="Anmeldemethode" value={form.auth} options={AUTHS} onChange={(auth) => set('auth', auth)} />
            </div>
            {form.auth === 'password' && (
              <Field label="Passwort" hint={saved?.hasPassword ? 'Ein Passwort ist gespeichert. Leer lassen, um es zu behalten.' : 'Optional. Ohne Passwort fragt Feather bei jeder Verbindung.'}>
                <PasswordInput value={form.password ?? ''} placeholder={saved?.hasPassword ? '••••••••' : ''} onChange={(v) => set('password', v || undefined)} data-bind="password" />
                {saved?.hasPassword && (
                  <button type="button" className="mt-2 text-xs text-neutral-500 hover:text-red-400 transition-colors" onClick={() => set('password', null)}>
                    {form.password === null ? 'Gespeichertes Passwort wird entfernt' : 'Gespeichertes Passwort entfernen'}
                  </button>
                )}
              </Field>
            )}
            {form.auth === 'key' && (
              <div className="space-y-4">
                <Field label="Private Schlüsseldatei">
                  <div className="flex gap-2">
                    <input className="input font-mono" value={form.keyPath} placeholder="C:\Users\du\.ssh\id_ed25519" spellCheck={false} onChange={(e) => set('keyPath', e.target.value)} data-bind="keyPath" />
                    <button type="button" className="btn btn-outline shrink-0" onClick={() => void chooseKey()}>
                      <KeyRound className="size-4" />
                      Wählen
                    </button>
                  </div>
                </Field>
                <Field label="Passphrase" hint={saved?.hasPassphrase ? 'Eine Passphrase ist gespeichert. Leer lassen, um sie zu behalten.' : 'Nur nötig, wenn der Schlüssel geschützt ist.'}>
                  <PasswordInput value={form.passphrase ?? ''} onChange={(v) => set('passphrase', v || undefined)} />
                </Field>
              </div>
            )}
            {form.auth === 'agent' && <Notice tone="info">Feather nutzt den laufenden SSH-Agenten (z. B. OpenSSH-Agent oder Pageant) für die Anmeldung.</Notice>}
          </>
        ) : (
          <>
            <Field label="Passwort" hint={saved?.hasPassword ? 'Ein Passwort ist gespeichert. Leer lassen, um es zu behalten.' : 'Bei „anonymous“ nicht nötig.'}>
              <PasswordInput value={form.password ?? ''} onChange={(v) => set('password', v || undefined)} data-bind="password" />
            </Field>
            <div>
              <label className="label">Verschlüsselung</label>
              <Segmented<FtpSecurity>
                label="Verschlüsselung"
                value={form.secure}
                options={[
                  { id: 'none', label: 'Keine', hint: 'Klartext' },
                  { id: 'explicit', label: 'FTPS explizit', hint: 'Empfohlen' },
                  { id: 'implicit', label: 'FTPS implizit', hint: 'Port 990' },
                ]}
                onChange={(secure) => setForm((f) => ({ ...f, secure, port: portTouched ? f.port : secure === 'implicit' ? 990 : 21 }))}
              />
            </div>
            {form.secure === 'none' ? (
              <Notice tone="warn">Ohne Verschlüsselung gehen Passwort und Dateien im Klartext über das Netzwerk. Nutze FTPS oder besser SFTP, wenn dein Server das kann.</Notice>
            ) : (
              <Toggle checked={form.ignoreCertErrors} onChange={(v) => set('ignoreCertErrors', v)} label="Zertifikatsfehler ignorieren" description="Nur für Server mit selbst signiertem Zertifikat, denen du vertraust." />
            )}
          </>
        )}

        <Field label="Startordner" hint="Optional. Sonst beginnt Feather im Home-Verzeichnis.">
          <input className="input font-mono" value={form.startPath} placeholder="/var/www" spellCheck={false} onChange={(e) => set('startPath', e.target.value)} />
        </Field>

        <div>
          <label className="label">Farbe</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Farbe ${c}`}
                style={{ background: c }}
                onClick={() => set('color', c)}
                className={`size-7 rounded-full transition-transform duration-150 hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-neutral-900 ring-white/80' : ''}`}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function openHostDialog(host?: RemoteHost, preset?: Partial<RemoteHostInput>): void {
  openLayer((close) => <HostDialog initial={host ? fromHost(host) : { ...blank(), ...preset }} saved={host ?? null} onClose={close} />);
}

function parseQuick(text: string): { username: string; host: string; port: number } | null {
  const match = /^(?:([^@\s]+)@)?(\[[0-9a-f:]+\]|[^\s:@]+)(?::(\d{1,5}))?$/i.exec(text.trim());
  if (!match) return null;
  const port = match[3] ? Number(match[3]) : 0;
  if (port > 65535) return null;
  return { username: match[1] ?? 'root', host: (match[2] as string).replace(/^\[|\]$/g, ''), port };
}

function QuickConnect() {
  const [text, setText] = useState('');
  const [protocol, setProtocol] = useState<RemoteProtocol>('ssh');

  function go(): void {
    const parsed = parseQuick(text);
    if (!parsed) return void toast('Format: benutzer@host oder host:port', 'error');
    const port = parsed.port || DEFAULT_PORTS[protocol];
    const draft: RemoteHostInput = { ...blank(), protocol, host: parsed.host, port, username: protocol === 'ftp' && parsed.username === 'root' ? 'anonymous' : parsed.username, name: parsed.host };
    setText('');
    void connect(draftSource(draft));
  }

  return (
    <form
      className="flex gap-2 mb-6"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <div className="relative flex-1">
        <Zap className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
        <input className="input pl-9 font-mono" value={text} placeholder="Schnellverbindung: root@203.0.113.10 oder server.example.com:2222" spellCheck={false} onChange={(e) => setText(e.target.value)} data-bind="quick" />
      </div>
      <select className="input w-28" value={protocol} onChange={(e) => setProtocol(e.target.value as RemoteProtocol)} aria-label="Protokoll">
        <option value="ssh">SSH</option>
        <option value="sftp">SFTP</option>
        <option value="ftp">FTP</option>
      </select>
      <button className="btn btn-primary" type="submit" disabled={!text.trim()} data-action="quick-connect">
        <Plug className="size-4" />
        Verbinden
      </button>
    </form>
  );
}

const relative = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });

function lastUsed(ts: number | null): string {
  if (!ts) return 'Noch nie verbunden';
  const minutes = Math.round((ts - Date.now()) / 60_000);
  if (Math.abs(minutes) < 1) return 'Gerade eben verbunden';
  if (Math.abs(minutes) < 60) return `Zuletzt ${relative.format(minutes, 'minute')}`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return `Zuletzt ${relative.format(hours, 'hour')}`;
  return `Zuletzt ${relative.format(Math.round(hours / 24), 'day')}`;
}

function HostCard({ host }: { host: RemoteHost }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const Icon = host.protocol === 'ssh' ? Terminal : host.protocol === 'sftp' ? FolderTree : Cable;

  const entries: MenuEntry[] = [
    { kind: 'action', label: 'Verbinden', icon: Plug, onSelect: () => void connect(sourceOf(host)) },
    { kind: 'action', label: 'Bearbeiten', icon: Pencil, onSelect: () => openHostDialog(host) },
    {
      kind: 'action',
      label: 'Duplizieren',
      icon: Copy,
      onSelect: () => void attemptRemote(saveHost({ ...fromHost(host), id: undefined, name: `${host.name} (Kopie)` })),
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Löschen',
      icon: Trash2,
      danger: true,
      onSelect: () =>
        void confirmDialog({ title: 'Verbindung löschen?', message: `„${host.name}“ wird samt gespeichertem Passwort entfernt. Der Server selbst bleibt unberührt.`, confirmLabel: 'Löschen', danger: true }).then((ok) => ok && void attemptRemote(removeHost(host.id))),
    },
  ];

  const open = (e: React.MouseEvent): void => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <article
      className="card card-hover animate-pop relative overflow-hidden cursor-pointer flex flex-col p-4 pl-5"
      onClick={() => void connect(sourceOf(host))}
      onContextMenu={open}
      data-action="host:connect"
      data-host={host.name}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: host.color }} />
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg grid place-items-center shrink-0" style={{ background: `${host.color}22`, color: host.color }}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-neutral-100 truncate">{host.name}</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-neutral-800 text-neutral-400 shrink-0">{protocolLabel(host)}</span>
            {host.protocol === 'ftp' && host.secure === 'none' && <ShieldAlert className="size-3.5 text-amber-400 shrink-0" aria-label="Unverschlüsselt" />}
          </div>
          <p className="text-sm text-neutral-500 font-mono truncate mt-0.5">
            {host.username ? `${host.username}@` : ''}
            {host.host}:{host.port}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-icon btn-sm -mr-1 -mt-1"
          aria-label="Weitere Aktionen"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
        <span>{lastUsed(host.lastUsed)}</span>
        <span className="text-neutral-600">
          {host.protocol === 'ssh' ? 'Terminal + Dateien' : 'Dateien'}
          {host.protocol !== 'ftp' && host.auth === 'key' ? ' · Schlüssel' : host.protocol !== 'ftp' && host.auth === 'agent' ? ' · Agent' : ''}
        </span>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} />}
    </article>
  );
}

export function HostsView(): ReactNode {
  const hosts = useRemote((s) => s.hosts);
  const loaded = useRemote((s) => s.hostsLoaded);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader
        title="Server"
        description="Verbinde dich per SSH, SFTP oder FTP mit deinen Servern und verwalte Dateien."
        createLabel="Verbindung hinzufügen"
        settingsLabel="Einstellungen"
        onCreate={() => openHostDialog()}
        onSettings={() => toast('Weitere Einstellungen folgen.', 'info')}
      />
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <QuickConnect />
        {loaded && hosts.length === 0 ? (
          <div className="card border-dashed flex flex-col items-center text-center px-6 py-16">
            <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <Terminal className="size-7" />
            </div>
            <h2 className="mt-5 text-base font-semibold text-neutral-100">Noch keine Verbindung</h2>
            <p className="mt-1.5 text-sm text-neutral-500 max-w-sm">Lege deinen ersten Server an. Feather öffnet ein Terminal und zeigt dir daneben alle Dateien als Baum, zum Bearbeiten, Hochladen und Herunterladen.</p>
            <button className="btn btn-primary mt-6" onClick={() => openHostDialog()}>
              <Plus className="size-4" />
              Verbindung hinzufügen
            </button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {hosts.map((h) => (
              <HostCard key={h.id} host={h} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
