import { Download, FolderOpen, Square, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Catalog, Category, ServiceType } from '../../shared/types';
import { Notice } from '../components/Bits';
import { Toggle } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { attempt, call, isInstalled, refreshRuntimes, versionKey } from '../lib/api';
import { formatBytes } from '../lib/format';
import { CATEGORIES, TYPES, isActive } from '../lib/services';
import { useAppState, setState } from '../lib/store';

export const openRuntimesDialog = (category: Category): void => openLayer((close) => <RuntimesDialog category={category} onClose={close} />);
export const openGeneralDialog = (): void => openLayer((close) => <GeneralDialog onClose={close} />);

function RuntimesDialog({ category, onClose }: { category: Category; onClose: () => void }) {
  const cfg = CATEGORIES[category];
  const installed = useAppState((s) => s.installed);
  const services = useAppState((s) => s.services);
  const progress = useAppState((s) => s.progress);
  const [tab, setTab] = useState<ServiceType>(cfg.types[0]);
  const [catalogs, setCatalogs] = useState<Partial<Record<ServiceType, Catalog | undefined>>>({});

  useEffect(() => {
    for (const type of cfg.types) {
      void attempt(call<Catalog>('catalog.versions', { type })).then((catalog) => setCatalogs((c) => ({ ...c, [type]: catalog ?? { versions: [], online: false } })));
    }
  }, [cfg.types]);

  const catalog = catalogs[tab];
  const versions = catalog ? [...catalog.versions.map((v) => ({ id: v.id, channel: v.channel }))] : [];
  for (const r of installed) if (r.type === tab && !versions.some((v) => v.id === r.version)) versions.push({ id: r.version, channel: '' });

  async function install(type: ServiceType, version: string): Promise<void> {
    await attempt(call('runtime.install', { type, version }), { success: `${TYPES[type].label} ${version} installiert.` });
    await refreshRuntimes();
  }

  async function remove(type: ServiceType, version: string): Promise<void> {
    const ok = await confirmDialog({
      title: `${TYPES[type].label} ${version} entfernen?`,
      message: 'Die heruntergeladenen Dateien werden gelöscht. Du kannst die Version jederzeit erneut installieren.',
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!ok) return;
    await attempt(call('runtime.remove', { type, version }), { success: 'Version entfernt.' });
    await refreshRuntimes();
  }

  return (
    <Modal title={`${cfg.title}-Einstellungen`} subtitle="Installierte Versionen verwalten" size="max-w-xl" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Fertig</button>}>
      <div className="-mx-5 -my-4">
        {cfg.types.length > 1 && (
          <div className="flex gap-1 px-5 border-b border-neutral-800">
            {cfg.types.map((t) => (
              <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
                {TYPES[t].label}
              </button>
            ))}
          </div>
        )}
        <div className="px-5 py-3">
          {!catalog ? (
            <p className="py-8 text-center text-sm text-neutral-500">Lade Versionen …</p>
          ) : (
            <>
              {!catalog.online && <div className="mb-2"><Notice>Offline: Es werden nur installierte Versionen angezeigt.</Notice></div>}
              {versions.map((v) => {
                const isThere = isInstalled(tab, v.id);
                const used = services.some((s) => s.type === tab && s.version === v.id);
                const p = progress[versionKey(tab, v.id)];
                const installing = Boolean(p) && p.phase !== 'done' && p.phase !== 'error';
                const size = installed.find((r) => r.type === tab && r.version === v.id)?.size ?? 0;
                return (
                  <div key={v.id} className="kbd-row">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-100">
                        {TYPES[tab].label} {v.id}
                        {v.channel && <span className="ml-1 text-[11px] font-normal text-neutral-500"> {v.channel}</span>}
                      </p>
                      <p className="text-xs text-neutral-500">{installing ? 'Wird installiert …' : isThere ? `Installiert · ${formatBytes(size)}${used ? ' · in Verwendung' : ''}` : 'Nicht installiert'}</p>
                      {installing && p.phase === 'download' && p.percent >= 0 && (
                        <div className="mt-1.5 h-1 w-40 rounded-full bg-neutral-800 overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${p.percent}%` }} />
                        </div>
                      )}
                    </div>
                    {installing ? (
                      <span className="text-xs text-primary font-medium tabular-nums">{p.phase === 'download' && p.percent >= 0 ? `${p.percent}%` : p.phase === 'verify' ? 'Prüfe …' : 'Entpacke …'}</span>
                    ) : isThere ? (
                      <button className="btn btn-danger btn-sm" disabled={used} title={used ? 'Wird von einem Service verwendet' : undefined} onClick={() => void remove(tab, v.id)}>
                        <Trash2 className="size-3.5" />
                        Entfernen
                      </button>
                    ) : (
                      <button className="btn btn-outline btn-sm" onClick={() => void install(tab, v.id)}>
                        <Download className="size-3.5" />
                        Installieren
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kbd-row">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-sm text-neutral-200 truncate">{children}</span>
    </div>
  );
}

function GeneralDialog({ onClose }: { onClose: () => void }) {
  const info = useAppState((s) => s.info);
  const installed = useAppState((s) => s.installed);
  const services = useAppState((s) => s.services);
  const settings = useAppState((s) => s.settings);
  const running = services.filter(isActive);

  async function stopAll(): Promise<void> {
    for (const svc of running) await attempt(call('service.stop', { id: svc.id }));
    onClose();
  }

  async function setBackground(runInBackground: boolean): Promise<void> {
    setState({ settings: await window.feather.setSettings({ runInBackground }) });
  }

  return (
    <Modal
      title="Allgemeine Einstellungen"
      size="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" disabled={running.length === 0} onClick={() => void stopAll()}>
            <Square className="size-3.5" />
            Alle Services stoppen
          </button>
          <button className="btn btn-outline" onClick={() => info && void window.feather.openPath(info.home)}>
            <FolderOpen className="size-4" />
            Ordner öffnen
          </button>
        </>
      }
    >
      <div>
        <Row label="Feather-Ordner"><span className="font-mono" title={info?.home}>{info?.home}</span></Row>
        <Row label="Java">{info?.java ?? '–'}</Row>
        <Row label="System">{info?.os ?? '–'}</Row>
        <Row label="Runtimes">{installed.length} installiert · {formatBytes(installed.reduce((a, r) => a + r.size, 0))}</Row>
        <p className="hint">Alle Daten (Runtimes, Datenbanken, Konfigurationen) liegen in diesem Ordner. Beim Beenden stoppt Feather alle laufenden Services.</p>
        <div className="border-t border-neutral-800 mt-4 pt-4">
          <Toggle
            checked={settings.runInBackground}
            onChange={(v) => void setBackground(v)}
            label="Im Hintergrund weiterlaufen"
            description="Beim Schließen des Fensters bleibt Feather im Infobereich der Taskleiste aktiv, und deine Services laufen weiter."
          />
        </div>
      </div>
    </Modal>
  );
}
