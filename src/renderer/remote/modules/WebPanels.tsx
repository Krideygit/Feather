import { CircleCheck, ExternalLink, FolderOpen, Globe, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ModuleId, ModuleState, NewSite, SiteInfo, SystemInfo } from '../../../shared/modules';
import { Notice } from '../../components/Bits';
import { Field, Toggle } from '../../components/Form';
import { Modal, confirmDialog, openLayer } from '../../components/Layers';
import { toast } from '../../components/Toast';
import { callModule } from '../../lib/modules';
import { showInFiles, type SessionView } from '../../lib/remote';
import { Empty, ErrorBox, InfoCard, useAsync } from './ui';

const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), 'error');

const urlOf = (host: string, port: number): string => `http://${host}${port === 80 ? '' : `:${port}`}`;

export function WebOverview({ session, module, state, sys }: { session: SessionView; module: ModuleId; state: ModuleState; sys: SystemInfo }) {
  const [result, setResult] = useState<{ ok: boolean; output: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function test(): Promise<void> {
    setBusy(true);
    try {
      setResult(await callModule<{ ok: boolean; output: string }>(session.sid, 'web.test', { module }));
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {!state.running && <Notice tone="warn">Der Webserver läuft gerade nicht. Starte ihn oben, damit deine Websites erreichbar sind.</Notice>}
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        <InfoCard label="Dienst" value={state.running ? 'Läuft' : 'Gestoppt'} tone={state.running ? 'good' : 'warn'} />
        <InfoCard label="Autostart" value={state.enabled ? 'Aktiv' : 'Aus'} hint="Startet beim Hochfahren des Servers" />
        <InfoCard label="Version" value={state.version || 'unbekannt'} />
        <InfoCard label="Dienstname" value={state.service || '–'} />
      </div>
      {state.running && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-medium text-neutral-100">Standardadresse</p>
          <p className="text-xs text-neutral-500">Ohne eigene Website zeigt der Server seine Willkommensseite unter der IP-Adresse:</p>
          <button className="inline-flex items-center gap-1.5 font-mono text-sm text-primary hover:underline" onClick={() => void window.feather.openExternal(urlOf(session.host, 80))}>
            {urlOf(session.host, 80)}
            <ExternalLink className="size-3.5" />
          </button>
        </div>
      )}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-100">Konfiguration prüfen</p>
            <p className="text-xs text-neutral-500">Testet, ob die Einstellungen fehlerfrei sind, bevor du etwas neu lädst.</p>
          </div>
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => void test()} data-action="web-test">
            <ShieldCheck className="size-3.5" />
            Prüfen
          </button>
        </div>
        {result && (
          <pre className={`rounded-lg border px-3 py-2 font-mono text-xs whitespace-pre-wrap animate-fade-in ${result.ok ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-red-500/25 bg-red-500/10 text-red-200'}`} data-test-result={result.ok ? 'ok' : 'fail'}>
            {result.ok ? 'Alles in Ordnung.\n' : 'Fehler in der Konfiguration:\n'}
            {result.output}
          </pre>
        )}
      </div>
      {!sys.sites && <Notice tone="info">Die Website-Verwaltung ist für dieses System noch nicht verfügbar. Installation und Dienststeuerung funktionieren.</Notice>}
    </div>
  );
}

function SiteDialog({ sid, module, onDone, onClose }: { sid: string; module: ModuleId; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [port, setPort] = useState(80);
  const [root, setRoot] = useState('');
  const [rootTouched, setRootTouched] = useState(false);
  const [welcome, setWelcome] = useState(true);
  const [firewall, setFirewall] = useState(true);
  const [busy, setBusy] = useState(false);
  const folder = rootTouched ? root : name ? `/var/www/${name}` : '';

  async function submit(): Promise<void> {
    setBusy(true);
    try {
      const site: NewSite = { name: name.trim(), domain: domain.trim(), port, root: folder, welcome, firewall };
      await callModule(sid, 'web.createSite', { module, site });
      toast(`Website „${site.name}“ ist online.`, 'success');
      onDone();
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Neue Website"
      subtitle="Feather legt Ordner und Konfiguration an und lädt den Webserver neu"
      size="max-w-lg"
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !name.trim() || !folder} onClick={() => void submit()} data-action="site-submit">Website anlegen</button></>}
    >
      <div className="space-y-4">
        <Field label="Name" hint="Kleinbuchstaben, Zahlen und - (z. B. meine-seite).">
          <input className="input font-mono" value={name} spellCheck={false} onChange={(e) => setName(e.target.value.toLowerCase())} data-bind="site-name" />
        </Field>
        <Field label="Domain" hint={domain ? 'Die Domain muss per DNS auf die IP-Adresse deines Servers zeigen.' : 'Leer lassen, um die Website unter der IP-Adresse des Servers anzuzeigen.'}>
          <input className="input font-mono" value={domain} spellCheck={false} placeholder="meine-seite.de" onChange={(e) => setDomain(e.target.value)} data-bind="site-domain" />
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Website-Ordner" hint="Hier legst du deine Dateien ab.">
            <input className="input font-mono" value={folder} spellCheck={false} placeholder="/var/www/meine-seite" onChange={(e) => { setRootTouched(true); setRoot(e.target.value); }} data-bind="site-root" />
          </Field>
          <Field label="Port">
            <input className="input font-mono" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} data-bind="site-port" />
          </Field>
        </div>
        <Toggle checked={welcome} onChange={setWelcome} label="Willkommensseite anlegen" description="Nur, wenn der Ordner noch leer ist. So siehst du sofort, dass alles funktioniert." />
        {port !== 80 && port !== 443 && <Toggle checked={firewall} onChange={setFirewall} label="Port in der Firewall freigeben" description="Gilt für ufw oder firewalld auf dem Server." />}
        {module === 'nginx' && !domain && port === 80 && <Notice tone="info">Ohne Domain wird diese Website zur Standardseite. Die Platzhalterseite von Nginx wird dabei abgeschaltet.</Notice>}
      </div>
    </Modal>
  );
}

export function WebSites({ session, module, state, sys }: { session: SessionView; module: ModuleId; state: ModuleState; sys: SystemInfo }) {
  const { sid } = session;
  const { data, loading, error, reload } = useAsync(() => (sys.sites ? callModule<SiteInfo[]>(sid, 'web.sites', { module }) : Promise.resolve([])), [sid, module, sys.sites]);

  async function toggle(site: SiteInfo): Promise<void> {
    try {
      await callModule(sid, 'web.toggleSite', { module, name: site.name, enable: !site.enabled });
      toast(site.enabled ? 'Website deaktiviert.' : 'Website aktiviert.', 'success');
      reload();
    } catch (err) {
      fail(err);
    }
  }

  async function remove(site: SiteInfo): Promise<void> {
    const ok = await confirmDialog({ title: `„${site.name}“ entfernen?`, message: `Die Konfiguration wird gelöscht und der Webserver neu geladen. Die Dateien in ${site.root} bleiben erhalten.`, confirmLabel: 'Entfernen', danger: true });
    if (!ok) return;
    try {
      await callModule(sid, 'web.deleteSite', { module, name: site.name });
      toast('Website entfernt.', 'success');
      reload();
    } catch (err) {
      fail(err);
    }
  }

  if (!sys.sites) return <div className="p-6"><Notice tone="info">Die Website-Verwaltung ist für dieses System noch nicht verfügbar.</Notice></div>;

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {!state.running && <Notice tone="warn">Der Webserver läuft nicht. Websites lassen sich trotzdem anlegen, sind aber erst nach dem Start erreichbar.</Notice>}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-neutral-200 flex-1">Websites</h3>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={reload} aria-label="Aktualisieren" disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => openLayer((close) => <SiteDialog sid={sid} module={module} onDone={reload} onClose={close} />)} data-action="site-create">
          <Plus className="size-3.5" />
          Website
        </button>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty icon={Globe} title="Noch keine Website" text="Lege eine Website an. Feather richtet Ordner, Konfiguration und Neustart des Webservers für dich ein." />}
      <div className="space-y-2">
        {data?.map((site) => {
          const link = urlOf(site.domain || session.host, site.port);
          return (
            <div key={site.name} className={`card px-4 py-3 animate-rise transition-opacity ${site.enabled ? '' : 'opacity-60'}`} data-site={site.name}>
              <div className="flex items-center gap-3">
                <CircleCheck className={`size-4 shrink-0 ${site.enabled ? 'text-emerald-400' : 'text-neutral-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-100 truncate">{site.name}<span className="ml-2 text-xs font-normal text-neutral-500">{site.domain || 'Alle Adressen'} · Port {site.port}</span></p>
                  <p className="text-xs font-mono text-neutral-500 truncate">{site.root}</p>
                </div>
                <label className="cursor-pointer" title={site.enabled ? 'Deaktivieren' : 'Aktivieren'}>
                  <input type="checkbox" className="peer sr-only" checked={site.enabled} onChange={() => void toggle(site)} aria-label={`${site.name} aktiv`} />
                  <span className="toggle" />
                </label>
              </div>
              <div className="mt-3 flex items-center gap-1 flex-wrap">
                <button className="btn btn-ghost btn-sm" onClick={() => void window.feather.openExternal(link)} disabled={!site.enabled || !state.running}>
                  <ExternalLink className="size-3.5" />
                  Öffnen
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => showInFiles(sid, site.root)} data-action="site-files">
                  <FolderOpen className="size-3.5" />
                  Dateien
                </button>
                <span className="flex-1" />
                <button className="btn btn-ghost btn-sm text-neutral-500 hover:text-red-400" onClick={() => void remove(site)} aria-label={`${site.name} entfernen`}>
                  <Trash2 className="size-3.5" />
                  Entfernen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
