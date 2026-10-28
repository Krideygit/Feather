import { ChevronRight, Database, Download, FolderOpen, Globe, Package, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Catalog, CatalogVersion, Category, OptionValue, RuntimePhase, Service, ServiceType } from '../../shared/types';
import { Notice } from '../components/Bits';
import { Field, PasswordInput, Toggle } from '../components/Form';
import { Modal, openLayer } from '../components/Layers';
import { PackageOptions } from '../components/PackageOptions';
import { toast } from '../components/Toast';
import { TypeIcon } from '../components/TypeIcon';
import { applyServiceView, attempt, call, isInstalled, refreshRuntimes } from '../lib/api';
import { formatBytes } from '../lib/format';
import { openBotManager } from '../bot/BotManager';
import { GROUPS, PACKAGES, defaultOptions, isAvailable, type PackageDef } from '../lib/packages';
import { CATEGORIES, TYPES } from '../lib/services';
import { getState, useAppState, useBus } from '../lib/store';

export function openChooser(): void {
  openLayer((close) => (
    <Modal title="Was möchtest du erstellen?" size="max-w-md" onClose={close}>
      <div className="grid gap-3">
        {(Object.keys(CATEGORIES) as Category[]).map((key) => {
          const cfg = CATEGORIES[key];
          const Icon = key === 'database' ? Database : key === 'webserver' ? Globe : Package;
          return (
            <button
              key={key}
              className="card card-hover flex items-center gap-4 p-4 text-left"
              onClick={() => {
                close();
                if (key === 'package') openPackageChooser();
                else openCreateDialog(key);
              }}
            >
              <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-neutral-100">{cfg.singular}</p>
                <p className="text-sm text-neutral-500">{cfg.description}</p>
              </div>
              <ChevronRight className="size-4 text-neutral-600" />
            </button>
          );
        })}
      </div>
    </Modal>
  ));
}

export function openPackage(pkg: PackageDef): void {
  if (pkg.tool === 'bots') openBotManager();
  else openCreateDialog('package', pkg);
}

export const openCreateDialog = (category: Category, pkg?: PackageDef): void =>
  openLayer((close) => <CreateDialog category={category} pkg={pkg} onClose={close} />);

export function openPackageChooser(): void {
  openLayer((close) => (
    <Modal title="Package hinzufügen" subtitle="Wähle ein Package aus einer Kategorie" size="max-w-xl" onClose={close}>
      <div className="space-y-5">
        {GROUPS.map((group) => {
          const items = PACKAGES.filter((p) => p.group === group.id);
          return (
            <section key={group.id}>
              <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 mb-2">
                <group.icon className="size-3.5" />
                {group.label}
              </h3>
              <div className="grid gap-2">
                {items.map((pkg) => (
                  <button
                    key={pkg.id}
                    disabled={!isAvailable(pkg)}
                    className="card card-hover flex items-center gap-3 p-3 text-left disabled:opacity-50 disabled:pointer-events-none"
                    onClick={() => {
                      close();
                      openPackage(pkg);
                    }}
                  >
                    <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                      <pkg.icon className="size-[18px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-100">{pkg.name}</p>
                      <p className="text-xs text-neutral-500 truncate">{pkg.description}</p>
                    </div>
                    {isAvailable(pkg) ? <ChevronRight className="size-4 text-neutral-600" /> : <span className="text-[11px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">Bald</span>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Modal>
  ));
}

const PHASE_TEXT: Record<RuntimePhase | 'create', (label: string) => string> = {
  download: (label) => `${label} wird heruntergeladen …`,
  verify: () => 'Download wird geprüft …',
  extract: () => 'Dateien werden entpackt …',
  create: () => 'Service wird eingerichtet …',
  done: () => 'Service wird eingerichtet …',
  error: () => 'Fehler',
};

function uniqueName(base: string): string {
  const taken = new Set(getState().services.map((s) => s.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  return name;
}

function pickVersion(type: ServiceType, versions: CatalogVersion[]): CatalogVersion | undefined {
  return (
    versions.find((v) => v.installed) ??
    versions.find((v) => (type === 'mariadb' ? v.id.startsWith('11.8') : v.channel === 'Stable')) ??
    versions[0]
  );
}

interface Busy {
  phase: RuntimePhase | 'create';
  percent: number;
  bytes: number;
  total: number;
}

function CreateDialog({ category, pkg, onClose }: { category: Category; pkg?: PackageDef; onClose: () => void }) {
  const cfg = CATEGORIES[category];
  const types = pkg?.types ?? cfg.types;
  const title = pkg ? pkg.name : cfg.singular;
  const web = category === 'webserver';
  const isPackage = category === 'package';
  useAppState((s) => s.installed);

  const [type, setType] = useState<ServiceType>(types[0]);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [catalog, setCatalog] = useState<Catalog>({ versions: [], online: true });
  const [loading, setLoading] = useState(true);
  const [port, setPort] = useState('');
  const [folder, setFolder] = useState('');
  const [password, setPassword] = useState('');
  const [spa, setSpa] = useState(false);
  const [autoindex, setAutoindex] = useState(false);
  const [start, setStart] = useState(true);
  const [options, setOptions] = useState<Record<string, OptionValue>>(() => defaultOptions(types[0]));
  const [busy, setBusy] = useState<Busy | null>(null);
  const nameTouched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVersion('');
    setOptions(defaultOptions(type));
    void Promise.all([
      attempt(call<Catalog>('catalog.versions', { type })),
      attempt(call<{ port: number }>('port.suggest', { preferred: TYPES[type].defaultPort })),
    ]).then(([found, suggestion]) => {
      if (cancelled) return;
      const next = found ?? { versions: [], online: false };
      setCatalog(next);
      setVersion(pickVersion(type, next.versions)?.id ?? '');
      setPort(String(suggestion?.port ?? TYPES[type].defaultPort));
      if (!nameTouched.current) setName(uniqueName(TYPES[type].label));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [type]);

  useBus('progress', (p) => {
    if (!busy || p.type !== type || p.version !== version || p.phase === 'done') return;
    setBusy({ phase: p.phase, percent: p.percent, bytes: p.bytes, total: p.total });
  });

  async function submit(): Promise<void> {
    const portNumber = Number(port);
    if (!name.trim()) return void toast('Bitte gib einen Namen an.', 'error');
    if (!Number.isInteger(portNumber)) return void toast('Bitte gib einen gültigen Port an.', 'error');
    if (web && !folder.trim()) return void toast('Bitte wähle einen Ordner aus.', 'error');
    if (type === 'fivem' && !String(options.licenseKey ?? '').trim()) return void toast('Bitte gib deinen FiveM-Lizenzschlüssel ein.', 'error');
    if (isPackage && (type === 'minecraft' || type === 'paper') && options.eula !== true) return void toast('Bitte akzeptiere die Minecraft-EULA.', 'error');

    setBusy({ phase: isInstalled(type, version) ? 'create' : 'download', percent: -1, bytes: 0, total: 0 });
    if (!isInstalled(type, version)) {
      const ok = await attempt(call('runtime.install', { type, version }));
      if (ok === undefined) return setBusy(null);
      await refreshRuntimes();
    }
    setBusy({ phase: 'create', percent: -1, bytes: 0, total: 0 });
    const view = await attempt(
      call<Service>('service.create', {
        type,
        version,
        name: name.trim(),
        port: portNumber,
        folder: web ? folder.trim() : undefined,
        password: category === 'database' ? password : undefined,
        options: isPackage ? options : undefined,
        spa,
        autoindex,
      }),
    );
    if (!view) return setBusy(null);
    applyServiceView(view);
    if (start) {
      const started = await attempt(call<Service>('service.start', { id: view.id }));
      if (started) applyServiceView(started);
    }
    onClose();
    toast(`„${view.name}“ wurde erstellt.`, 'success');
  }

  async function chooseFolder(): Promise<void> {
    const picked = await window.feather.pickFolder(folder || undefined);
    if (picked) setFolder(picked);
  }

  if (busy) {
    const indeterminate = busy.percent < 0 || busy.phase !== 'download';
    return (
      <Modal title={`${title} erstellen`} size="max-w-xl" onClose={onClose} dismissible={false} footer={<button className="btn btn-ghost" onClick={onClose}>Im Hintergrund fortsetzen</button>}>
        <div className="py-8 text-center">
          <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto animate-pulse">
            <Download className="size-6" />
          </div>
          <p className="mt-4 text-sm font-medium text-neutral-100">{PHASE_TEXT[busy.phase](`${TYPES[type].label} ${version}`)}</p>
          <div className="mt-4 mx-auto max-w-sm h-2 rounded-full bg-neutral-800 overflow-hidden">
            <div className={`h-full rounded-full bg-primary transition-[width] duration-150 ${indeterminate ? 'animate-pulse' : ''}`} style={{ width: `${indeterminate ? 100 : busy.percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-neutral-500 h-4">
            {busy.phase === 'download' && busy.total > 0 ? `${busy.percent}% · ${formatBytes(busy.bytes)} / ${formatBytes(busy.total)}` : ''}
          </p>
        </div>
      </Modal>
    );
  }

  const selected = catalog.versions.find((v) => v.id === version);
  return (
    <Modal
      title={`${title} erstellen`}
      subtitle={pkg ? pkg.description : web ? 'Lokaler Webserver für einen Projektordner' : 'Lokale MariaDB-Instanz'}
      size="max-w-xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={loading || !version} data-action="submit">
            <Plus className="size-4" />
            Erstellen
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {types.length > 1 && (
          <div>
            <label className="label">{isPackage ? 'Variante' : 'Server'}</label>
            <div className="grid grid-cols-2 gap-2">
              {types.map((t) => (
                <button
                  key={t}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 h-11 text-sm font-medium transition-colors ${type === t ? 'border-primary bg-primary/10 text-primary' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}
                  onClick={() => setType(t)}
                >
                  <TypeIcon type={t} className="size-[18px]" />
                  {TYPES[t].label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <input
              className="input"
              value={name}
              maxLength={60}
              onChange={(e) => {
                nameTouched.current = true;
                setName(e.target.value);
              }}
            />
          </Field>
          <Field label="Version">
            {loading ? (
              <div className="input flex items-center text-neutral-500">Lade Versionen …</div>
            ) : (
              <select className="input" value={version} onChange={(e) => setVersion(e.target.value)} disabled={catalog.versions.length === 0}>
                {catalog.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                    {v.channel ? ` · ${v.channel}` : ''}
                    {v.installed ? ' · installiert' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {!loading && !catalog.online && <Notice>Die Versionsliste konnte nicht geladen werden (offline?). Es sind nur bereits installierte Versionen verfügbar.</Notice>}
        {!loading && selected && !isInstalled(type, selected.id) && (
          <p className="text-xs text-neutral-400 bg-neutral-800/60 rounded-lg px-3 py-2 flex items-center gap-2">
            <Download className="size-3.5 text-primary" />
            {TYPES[type].label} {selected.id} wird beim Erstellen automatisch heruntergeladen.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Port">
            <input className="input font-mono" value={port} inputMode="numeric" onChange={(e) => setPort(e.target.value)} />
          </Field>
          {category === 'database' && (
            <Field label="Root-Passwort">
              <PasswordInput value={password} onChange={setPassword} placeholder="leer lassen für keins" />
            </Field>
          )}
        </div>

        {isPackage && <PackageOptions type={type} options={options} onChange={setOptions} showEula={type === 'minecraft' || type === 'paper'} />}

        {web && (
          <>
            <Field label="Ordner" hint="Dieser Ordner wird als Document-Root ausgeliefert.">
              <div className="flex gap-2">
                <input className="input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Pfad zu deinem Projektordner" data-bind="folder" />
                <button className="btn btn-outline shrink-0" onClick={() => void chooseFolder()}>
                  <FolderOpen className="size-4" />
                  Auswählen
                </button>
              </div>
            </Field>
            <div className="space-y-3 pt-1">
              <Toggle checked={spa} onChange={setSpa} label="Single-Page-App-Modus" description="Unbekannte Pfade liefern index.html aus (React, Vue, ...)" />
              <Toggle checked={autoindex} onChange={setAutoindex} label="Verzeichnislisting" description="Zeigt den Ordnerinhalt, wenn keine index.html existiert" />
            </div>
          </>
        )}

        <div className="border-t border-neutral-800 pt-4">
          <Toggle checked={start} onChange={setStart} label="Direkt nach dem Erstellen starten" />
        </div>
      </div>
    </Modal>
  );
}
