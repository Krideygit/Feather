import { Archive, Check, EyeOff, FolderOpen, Info, Loader2, PackagePlus, Puzzle, RotateCcw, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BackupInfoView, BackupResultView, Language, RestoreReportView } from '../../shared/types';
import { Notice } from '../components/Bits';
import { Field, PasswordInput, Toggle } from '../components/Form';
import { confirmDialog } from '../components/Layers';
import { toast } from '../components/Toast';
import { call, refreshProfiles, refreshRuntimes, refreshServices } from '../lib/api';
import { formatBytes } from '../lib/format';
import { loadSqlConnections } from '../lib/creds';
import { installPlugin, refreshPlugins, removePlugin, setPluginEnabled, usePlugins } from '../lib/plugins';
import { loadHosts } from '../lib/remote';
import { testSaveeye } from '../lib/saveeye';
import { updateSettings } from '../lib/settings';
import { setState, useAppState } from '../lib/store';

const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), 'error');

export function LanguageSection() {
  const language = useAppState((s) => s.settings.language);
  const options: { id: Language; label: string; native: string }[] = [
    { id: 'de', label: 'Deutsch', native: 'Standardsprache' },
    { id: 'en', label: 'English', native: 'English' },
  ];
  return (
    <div className="space-y-4 animate-fade-in" data-section="language">
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] max-w-xl">
        {options.map((o) => (
          <button
            key={o.id}
            className={`card card-hover p-4 text-left flex items-center gap-3 ${language === o.id ? 'border-primary! ring-1 ring-primary/40' : ''}`}
            onClick={() => void updateSettings({ language: o.id })}
            aria-pressed={language === o.id}
            data-lang={o.id}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">{o.label}</p>
              <p className="text-xs text-neutral-500">{o.native}</p>
            </div>
            {language === o.id && <Check className="size-4 text-primary" />}
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-500 max-w-xl">Die Sprache wird sofort umgestellt. Texte, die Plugins oder dein Server liefern, bleiben in ihrer Originalsprache.</p>
    </div>
  );
}

export function SaveeyeSection() {
  const config = useAppState((s) => s.settings.saveeye);
  const set = (patch: Partial<typeof config>): void => void updateSettings({ saveeye: { ...config, ...patch } });
  return (
    <div className="space-y-5 max-w-xl animate-fade-in" data-section="saveeye">
      <div className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
          <EyeOff className="size-5" />
        </div>
        <p className="text-sm text-neutral-400">
          Saveeye schützt dein Feather vor ungewollten Blicken. Sobald eine Bildschirmübertragung (z. B. Discord, OBS, Teams) oder eine Screenshot-Taste erkannt wird, wird alles verschwommen und Feather fragt dich, ob andere es sehen dürfen.
        </p>
      </div>
      <Toggle checked={config.enabled} onChange={(enabled) => set({ enabled })} label="Saveeye aktivieren" description="Beobachtet Bildschirmaufnahmen, solange Feather läuft." />
      <div className={`space-y-4 transition-opacity ${config.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <div>
          <label className="label">Verhalten</label>
          <div className="grid gap-3">
            {([
              ['ask', 'Nachfragen (empfohlen)', 'Feather wird verschwommen und du entscheidest bei jeder Aufnahme: Ja zeigt es, Nein verbirgt es in der Aufnahme.'],
              ['always', 'Immer geschützt', 'Feather erscheint in jeder Aufnahme und Übertragung schwarz. Auch deine eigenen Screenshots zeigen dann kein Feather.'],
            ] as const).map(([id, title, text]) => (
              <button key={id} className={`card card-hover p-4 text-left ${config.mode === id ? 'border-primary! ring-1 ring-primary/40' : ''}`} onClick={() => set({ mode: id })} aria-pressed={config.mode === id} data-saveeye-mode={id}>
                <p className="text-sm font-medium text-neutral-100 flex items-center gap-2">
                  {title}
                  {config.mode === id && <Check className="size-4 text-primary" />}
                </p>
                <p className="text-xs text-neutral-500 mt-1">{text}</p>
              </button>
            ))}
          </div>
        </div>
        <Toggle checked={config.blurOnBlur} onChange={(blurOnBlur) => set({ blurOnBlur })} label="Beim Verlassen des Fensters verschwimmen" description="Sobald du zu einem anderen Programm wechselst, wird Feather unscharf, zum Beispiel beim Auswählen eines Fensters zum Teilen." />
        <div>
          <button className="btn btn-outline" onClick={testSaveeye} data-action="saveeye-test">
            <ShieldAlert className="size-4" />
            Saveeye testen
          </button>
        </div>
      </div>
      <Notice tone="info">Windows meldet Programmen nicht jede Aufnahme. Feather erkennt Übertragungen von Programmen, die die Windows-Bildschirmaufnahme nutzen (u. a. Discord, OBS, Teams, Zoom), sowie die Druck-Taste. Für lückenlosen Schutz wähle „Immer geschützt“.</Notice>
    </div>
  );
}

export function GeneralSection() {
  const runInBackground = useAppState((s) => s.settings.runInBackground);
  return (
    <div className="space-y-5 max-w-xl animate-fade-in" data-section="general">
      <Toggle checked={runInBackground} onChange={(v) => void updateSettings({ runInBackground: v })} label="Im Hintergrund weiterlaufen" description="Beim Schließen des Fensters bleiben deine Services aktiv. Feather liegt dann im Infobereich der Taskleiste." />
    </div>
  );
}

export function BackupSection() {
  const [includeData, setIncludeData] = useState(true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'create' | 'restore' | null>(null);
  const [created, setCreated] = useState<BackupResultView | null>(null);
  const [picked, setPicked] = useState<{ file: string; info: BackupInfoView } | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [report, setReport] = useState<RestoreReportView | null>(null);

  async function create(): Promise<void> {
    setBusy('create');
    setCreated(null);
    const reply = await window.feather.backupCreate({ password, includeData });
    setBusy(null);
    if (!reply.ok) return fail(new Error(reply.error));
    if (reply.result) setCreated(reply.result);
  }

  async function pick(): Promise<void> {
    const reply = await window.feather.backupPick();
    if (!reply.ok) return fail(new Error(reply.error));
    if (reply.result) {
      setPicked(reply.result);
      setReport(null);
      setRestorePassword('');
    }
  }

  async function restore(): Promise<void> {
    if (!picked) return;
    const ok = await confirmDialog({
      title: 'Sicherung wiederherstellen?',
      message: 'Einstellungen, Server, Zugangsdaten und Plugins aus der Sicherung werden übernommen und überschreiben gleiche Einträge. Profile mit ihren Services werden als neue Profile hinzugefügt. Nichts wird gelöscht.',
      confirmLabel: 'Wiederherstellen',
    });
    if (!ok) return;
    setBusy('restore');
    const reply = await window.feather.backupRestore({ file: picked.file, password: restorePassword });
    setBusy(null);
    if (!reply.ok || !reply.result) return fail(new Error(reply.error));
    setReport(reply.result);
    const settings = await window.feather.getSettings();
    setState({ settings });
    await Promise.all([refreshServices(), refreshProfiles(), refreshRuntimes(), loadHosts(), loadSqlConnections(), refreshPlugins()]).catch(() => undefined);
    toast('Die Sicherung wurde wiederhergestellt.', 'success');
  }

  return (
    <div className="space-y-8 max-w-2xl animate-fade-in" data-section="backup">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <Archive className="size-4 text-primary" />
            Sicherung erstellen
          </h3>
          <p className="text-sm text-neutral-500 mt-1">Eine Datei mit allem: Einstellungen, Themen, Server und Zugangsdaten, Plugins und alle Profile mit ihren Services.</p>
        </div>
        <Toggle checked={includeData} onChange={setIncludeData} label="Daten der Services einschließen" description="Datenbank-Inhalte und Dateien deiner Services. Das kann groß werden. Laufende Services werden dafür kurz angehalten." />
        <Field label="Passwort für die Sicherung" hint="Schützt gespeicherte Passwörter (Server, Datenbanken). Ohne Passwort werden diese nicht gesichert.">
          <PasswordInput value={password} onChange={setPassword} placeholder="Empfohlen" data-bind="backup-password" />
        </Field>
        <button className="btn btn-primary" disabled={busy !== null} onClick={() => void create()} data-action="backup-create">
          {busy === 'create' ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
          {busy === 'create' ? 'Sicherung wird erstellt …' : 'Sicherung erstellen …'}
        </button>
        {created && (
          <div className="card p-4 space-y-2 animate-rise" data-backup-result>
            <p className="text-sm font-medium text-emerald-300 flex items-center gap-2">
              <Check className="size-4" />
              Sicherung gespeichert ({formatBytes(created.bytes)})
            </p>
            <p className="text-xs text-neutral-500 font-mono break-all select-text">{created.file}</p>
            <p className="text-xs text-neutral-400">
              {created.profiles} {created.profiles === 1 ? 'Profil' : 'Profile'} · {created.hosts} {created.hosts === 1 ? 'Server' : 'Server'} · {created.connections} Zugangsdaten · {created.plugins} {created.plugins === 1 ? 'Plugin' : 'Plugins'} · {created.encrypted ? 'Passwörter verschlüsselt gesichert' : 'ohne Passwörter'}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => void window.feather.showItem(created.file)}>
              <FolderOpen className="size-3.5" />
              Im Ordner anzeigen
            </button>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <RotateCcw className="size-4 text-primary" />
            Sicherung wiederherstellen
          </h3>
          <p className="text-sm text-neutral-500 mt-1">Wähle eine Sicherungsdatei, um alles zurückzuholen, auch auf einem anderen Rechner.</p>
        </div>
        <button className="btn btn-outline" disabled={busy !== null} onClick={() => void pick()} data-action="backup-pick">
          <FolderOpen className="size-4" />
          Sicherung auswählen …
        </button>
        {picked && (
          <div className="card p-4 space-y-3 animate-rise" data-backup-info>
            <p className="text-xs text-neutral-500 font-mono break-all select-text">{picked.file}</p>
            <p className="text-sm text-neutral-300">
              Erstellt am {new Date(picked.info.createdAt).toLocaleString()} mit Feather {picked.info.appVersion}
            </p>
            <ul className="text-sm text-neutral-400 space-y-0.5">
              <li>Profile: {picked.info.profiles.length ? picked.info.profiles.join(', ') : 'keine'}{picked.info.includesData ? '' : ' (ohne Daten)'}</li>
              <li>Server: {picked.info.hosts}, Zugangsdaten: {picked.info.connections}, Plugins: {picked.info.plugins}</li>
            </ul>
            {picked.info.encrypted && (
              <Field label="Passwort der Sicherung">
                <PasswordInput value={restorePassword} onChange={setRestorePassword} data-bind="restore-password" />
              </Field>
            )}
            <button className="btn btn-primary" disabled={busy !== null || (picked.info.encrypted && !restorePassword)} onClick={() => void restore()} data-action="backup-restore">
              {busy === 'restore' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {busy === 'restore' ? 'Wird wiederhergestellt …' : 'Wiederherstellen'}
            </button>
          </div>
        )}
        {report && (
          <div className="card p-4 space-y-1 animate-rise" data-restore-report>
            <p className="text-sm font-medium text-emerald-300">Wiederhergestellt</p>
            <p className="text-sm text-neutral-400">
              {report.profiles} Profile, {report.hosts} Server, {report.connections} Zugangsdaten, {report.plugins} Plugins{report.settings ? ', Einstellungen' : ''}.
            </p>
            {report.skippedSecrets && <p className="text-xs text-amber-300">Die Sicherung enthielt keine Passwörter. Trage sie bei Bedarf neu ein.</p>}
            {report.warnings.map((w) => (
              <p key={w} className="text-xs text-amber-300">{w}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const MANIFEST_EXAMPLE = `{
  "name": "Mein Plugin",
  "author": "Dein Name",
  "version": "1.0.0",
  "main": "dev.beispiel.MeinPlugin"
}`;

const CODE_EXAMPLE = `public final class MeinPlugin implements FeatherPlugin {
  public void onEnable(PluginAPIManager api) {
    api.ui().addButton(ButtonSpec.of("hallo")
        .label("Hallo")
        .location(Locations.SERVER_TABBAR)
        .onClick(e -> api.ui().toast("Hallo!", "success")));
  }
}`;

export function PluginsSection() {
  const plugins = usePlugins((s) => s.plugins);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState<string | null>(null);

  useEffect(() => {
    void refreshPlugins().catch(() => undefined);
    void window.feather.pluginSample().then(setSample);
  }, []);

  async function install(file: string): Promise<void> {
    setBusy(true);
    try {
      const plugin = await installPlugin(file);
      toast(`Plugin „${plugin.name}“ ${plugin.version} ist aktiv.`, 'success');
      await refreshPlugins();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  async function upload(): Promise<void> {
    const file = await window.feather.openFile({ title: 'Plugin auswählen', filters: [{ name: 'Feather-Plugin (.jar)', extensions: ['jar'] }] });
    if (!file) return;
    const ok = await confirmDialog({
      title: 'Plugin installieren?',
      message: 'Plugins laufen mit allen Rechten auf deinem Rechner und können auf deine Daten und Server zugreifen. Installiere nur Plugins aus Quellen, denen du vertraust.',
      confirmLabel: 'Installieren',
      danger: true,
    });
    if (ok) await install(file);
  }

  async function toggle(id: string, enabled: boolean): Promise<void> {
    try {
      await setPluginEnabled(id, enabled);
      await refreshPlugins();
    } catch (err) {
      fail(err);
    }
  }

  async function remove(id: string, name: string): Promise<void> {
    const ok = await confirmDialog({ title: `„${name}“ entfernen?`, message: 'Das Plugin und seine gespeicherten Daten werden gelöscht.', confirmLabel: 'Entfernen', danger: true });
    if (!ok) return;
    try {
      await removePlugin(id);
      await refreshPlugins();
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in" data-section="plugins">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => void upload()} data-action="plugin-upload">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Plugin hochladen (.jar)
        </button>
        {sample && !plugins.some((p) => p.id === 'rainbow-icons') && (
          <button className="btn btn-outline" disabled={busy} onClick={() => void install(sample)} data-action="plugin-sample">
            <PackagePlus className="size-4" />
            Beispiel „Rainbow Icons“ installieren
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => void call<{ dir: string }>('plugin.dir').then((r) => window.feather.openPath(r.dir))}>
          <FolderOpen className="size-4" />
          Plugin-Ordner öffnen
        </button>
      </div>

      {plugins.length === 0 ? (
        <div className="card border-dashed flex flex-col items-center text-center px-6 py-10">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Puzzle className="size-6" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-neutral-100">Noch keine Plugins</h3>
          <p className="mt-1 text-sm text-neutral-500 max-w-sm">Plugins erweitern Feather um Buttons, Ansichten und Designs. Lade eine .jar-Datei hoch, um zu starten.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map((p) => (
            <div key={p.id} className="card p-4 animate-rise" data-plugin={p.id}>
              <div className="flex items-start gap-3">
                <div className={`size-10 rounded-lg grid place-items-center shrink-0 ${p.running ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-400'}`}>
                  <Puzzle className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-100 flex items-center gap-2">
                    {p.name}
                    <span className="text-xs font-normal text-neutral-500">Version {p.version}</span>
                  </p>
                  <p className="text-xs text-neutral-500">von {p.author} · <span className="font-mono">{p.main}</span></p>
                  {p.description && <p className="text-sm text-neutral-400 mt-1.5">{p.description}</p>}
                  {p.error && <p className="mt-2 text-xs text-red-300 flex items-start gap-1.5"><ShieldAlert className="size-3.5 mt-0.5 shrink-0" />{p.error}</p>}
                </div>
                <label className="cursor-pointer mt-1" title={p.enabled ? 'Deaktivieren' : 'Aktivieren'}>
                  <input type="checkbox" className="peer sr-only" checked={p.enabled} onChange={() => void toggle(p.id, !p.enabled)} aria-label={`${p.name} aktiv`} data-action="plugin-toggle" />
                  <span className="toggle" />
                </label>
                <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" onClick={() => void remove(p.id, p.name)} aria-label={`${p.name} entfernen`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
        <p className="text-sm font-medium text-neutral-100 flex items-center gap-2">
          <Info className="size-4 text-primary" />
          Plugins entwickeln
        </p>
        <p className="text-sm text-neutral-400">Ein Plugin ist eine .jar-Datei mit einer <span className="font-mono text-neutral-300">feather-plugin.json</span> im Hauptordner. Pflichtfelder sind <span className="font-mono text-neutral-300">author</span>, <span className="font-mono text-neutral-300">main</span> (vollständiger Klassenname) und <span className="font-mono text-neutral-300">version</span>. Die Hauptklasse implementiert <span className="font-mono text-neutral-300">feather.api.FeatherPlugin</span> und bekommt den <span className="font-mono text-neutral-300">PluginAPIManager</span>.</p>
        <pre className="rounded-lg bg-black/40 border border-neutral-800 p-3 font-mono text-xs text-neutral-300 overflow-auto select-text">{MANIFEST_EXAMPLE}</pre>
        <pre className="rounded-lg bg-black/40 border border-neutral-800 p-3 font-mono text-xs text-neutral-300 overflow-auto select-text">{CODE_EXAMPLE}</pre>
        <p className="text-xs text-neutral-500">Über <span className="font-mono">ui()</span> legst du Buttons und Stylesheets an, über <span className="font-mono">terminal()</span> eigene Ansichten im Terminal, über <span className="font-mono">events()</span> reagierst du auf Klicks und Verbindungen und über <span className="font-mono">storage()</span> speicherst du Daten. Der Quellcode des Beispiels liegt unter <span className="font-mono">plugins-src/rainbow-icons</span>, gebaut wird mit <span className="font-mono">npm run build:plugins</span>.</p>
      </section>
    </div>
  );
}

