import { Check, FolderOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Service } from '../../shared/types';
import { Notice } from '../components/Bits';
import { Field, Toggle } from '../components/Form';
import { confirmDialog } from '../components/Layers';
import { toast } from '../components/Toast';
import { applyServiceView, attempt, call, refreshRuntimes, refreshServices } from '../lib/api';
import { useAppState } from '../lib/store';

export function SettingsTab({ service: svc, onDeleted }: { service: Service; onDeleted: () => void }) {
  const installed = useAppState((s) => s.installed);
  const locked = svc.status !== 'stopped' && svc.status !== 'error';
  const web = svc.category === 'webserver';

  const [name, setName] = useState(svc.name);
  const [port, setPort] = useState(String(svc.port));
  const [folder, setFolder] = useState(svc.folder);
  const [version, setVersion] = useState(svc.version);
  const [spa, setSpa] = useState(svc.spa);
  const [autoindex, setAutoindex] = useState(svc.autoindex);
  const [autoStart, setAutoStart] = useState(svc.autoStart);

  const versions = installed.filter((r) => r.type === svc.type).map((r) => r.version);

  async function save(): Promise<void> {
    const patch: Record<string, unknown> = { id: svc.id, name, autoStart };
    if (!locked) {
      patch.port = Number(port);
      if (web) Object.assign(patch, { folder, version, spa, autoindex });
    }
    const view = await attempt(call<Service>('service.update', patch));
    if (view) {
      applyServiceView(view);
      toast('Einstellungen gespeichert.', 'success');
    }
  }

  async function chooseFolder(): Promise<void> {
    const picked = await window.feather.pickFolder(folder);
    if (picked) setFolder(picked);
  }

  async function remove(): Promise<void> {
    const ok = await confirmDialog({
      title: `„${svc.name}“ löschen?`,
      message: web
        ? 'Der Service und seine Konfiguration werden gelöscht. Dein Projektordner bleibt unberührt.'
        : 'Der Service und alle seine Datenbanken werden unwiderruflich gelöscht.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    onDeleted();
    await attempt(call('service.delete', { id: svc.id }), { success: `„${svc.name}“ wurde gelöscht.` });
    await refreshServices();
    await refreshRuntimes();
  }

  return (
    <>
      <div className="space-y-4">
        {locked && <Notice>Stoppe den Service, um Port, Ordner und Server-Optionen zu ändern.</Notice>}
        <Field label="Name">
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Port">
            <input className="input font-mono" value={port} inputMode="numeric" disabled={locked} onChange={(e) => setPort(e.target.value)} />
          </Field>
          <Field label="Version">
            {web ? (
              <select className="input" value={version} disabled={locked} onChange={(e) => setVersion(e.target.value)}>
                {versions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <div className="input flex items-center text-neutral-400">{svc.version}</div>
            )}
          </Field>
        </div>
        {web && (
          <>
            <Field label="Ordner">
              <div className="flex gap-2">
                <input className="input" value={folder} disabled={locked} onChange={(e) => setFolder(e.target.value)} />
                <button className="btn btn-outline shrink-0" disabled={locked} onClick={() => void chooseFolder()}>
                  <FolderOpen className="size-4" />
                  Ändern
                </button>
              </div>
            </Field>
            <div className="space-y-3">
              <Toggle checked={spa} onChange={setSpa} disabled={locked} label="Single-Page-App-Modus" description="Unbekannte Pfade liefern index.html aus" />
              <Toggle checked={autoindex} onChange={setAutoindex} disabled={locked} label="Verzeichnislisting" description="Zeigt den Ordnerinhalt, wenn keine index.html existiert" />
            </div>
          </>
        )}
        <div className="border-t border-neutral-800 pt-4">
          <Toggle checked={autoStart} onChange={setAutoStart} label="Beim Start von Feather automatisch starten" />
        </div>
        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={() => void save()} data-action="saveSettings">
            <Check className="size-4" />
            Speichern
          </button>
        </div>
      </div>
      <section className="mt-8 rounded-xl border border-red-500/20 p-4">
        <h3 className="text-sm font-medium text-red-300">Gefahrenzone</h3>
        <p className="text-sm text-neutral-500 mt-1">{web ? 'Löscht den Service. Dein Projektordner bleibt erhalten.' : 'Löscht den Service inklusive aller Datenbanken.'}</p>
        <button className="btn btn-danger btn-sm mt-3 border border-red-500/30" onClick={() => void remove()}>
          <Trash2 className="size-3.5" />
          Service löschen
        </button>
      </section>
    </>
  );
}
