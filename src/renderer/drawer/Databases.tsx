import { FileArchive, Layers, Plus, RotateCw, Table2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { DbInfo, ExportResult, Service } from '../../shared/types';
import { Toggle } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { attempt, call } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useBus } from '../lib/store';
import { useDatabases } from './useDatabases';

export function NotRunning({ text }: { text: string }) {
  return (
    <div className="py-14 text-center">
      <div className="size-12 rounded-xl bg-neutral-800 text-neutral-400 grid place-items-center mx-auto">
        <Layers className="size-6" />
      </div>
      <p className="mt-4 text-sm font-medium text-neutral-100">Datenbank ist nicht gestartet</p>
      <p className="mt-1 text-sm text-neutral-500">{text}</p>
    </div>
  );
}

export function DatabasesTab({ service }: { service: Service }) {
  const running = service.status === 'running';
  const { dbs, error, reload } = useDatabases(service.id, running);
  const [newDb, setNewDb] = useState('');

  if (!running) return <NotRunning text="Starte den Service, um Datenbanken zu verwalten." />;

  async function create(): Promise<void> {
    const name = newDb.trim();
    if (!name) return;
    const ok = await attempt(call('db.create', { id: service.id, name }), { success: `Datenbank „${name}“ erstellt.` });
    if (ok) {
      setNewDb('');
      void reload();
    }
  }

  async function drop(name: string): Promise<void> {
    const ok = await confirmDialog({
      title: `Datenbank „${name}“ löschen?`,
      message: 'Alle Tabellen und Daten dieser Datenbank gehen unwiderruflich verloren.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await attempt(call('db.drop', { id: service.id, name }), { success: `Datenbank „${name}“ gelöscht.` });
    void reload();
  }

  function exportZip(): void {
    const own = (dbs ?? []).filter((d) => !d.system);
    if (!own.length) return void toast('Es gibt keine eigenen Datenbanken zum Exportieren.', 'error');
    openLayer((close) => <ExportZipDialog service={service} dbs={own} onClose={close} />);
  }

  return (
    <>
      <div className="flex gap-2">
        <input className="input" value={newDb} maxLength={64} placeholder="Name der neuen Datenbank" onChange={(e) => setNewDb(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
        <button className="btn btn-primary shrink-0" onClick={() => void create()} data-action="createDb">
          <Plus className="size-4" />
          Anlegen
        </button>
        <button className="btn btn-outline btn-icon shrink-0" onClick={() => void reload()} title="Aktualisieren" aria-label="Aktualisieren">
          <RotateCw className="size-4" />
        </button>
        <button className="btn btn-outline shrink-0" onClick={exportZip} title="Alle Tabellen als SQL-Dateien in einer ZIP speichern" data-action="exportZip">
          <FileArchive className="size-4" />
          ZIP-Export
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-4 card overflow-hidden">
        {dbs === null ? (
          <p className="p-6 text-center text-sm text-neutral-500">Lade …</p>
        ) : (
          dbs.map((d) => (
            <div key={d.name} className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-800 last:border-0">
              <span className="text-neutral-500">{d.system ? <Layers className="size-4" /> : <Table2 className="size-4" />}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-100 truncate">
                  {d.name}
                  {d.system && <span className="ml-1 text-[11px] text-neutral-500"> System</span>}
                </p>
                <p className="text-xs text-neutral-500">{d.tables} Tabellen · {formatBytes(d.sizeKb * 1024)}</p>
              </div>
              {!d.system && (
                <button className="btn btn-danger btn-icon btn-sm" onClick={() => void drop(d.name)} title="Löschen" aria-label={`${d.name} löschen`}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ExportZipDialog({ service, dbs, onClose }: { service: Service; dbs: DbInfo[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(dbs.map((d) => d.name)));
  const [perTable, setPerTable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');

  useBus('exportProgress', (p) => {
    if (p.id === service.id && busy) setLabel(p.label ? `${p.label} (${p.done + 1}/${p.total})` : '');
  });

  const toggle = (name: string, on: boolean): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });

  async function run(): Promise<void> {
    const file = await window.feather.saveFile({
      title: 'SQL-Export speichern',
      defaultName: `${service.name.replace(/[\\/:*?"<>|]/g, '_')}-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
    });
    if (!file) return;
    setBusy(true);
    const result = await attempt(call<ExportResult>('db.export', { id: service.id, databases: [...selected], perTable, file }));
    setBusy(false);
    if (!result) return;
    onClose();
    const n = result.databases ?? selected.size;
    toast(`${n} ${n === 1 ? 'Datenbank' : 'Datenbanken'} exportiert (${formatBytes(result.bytes)}).`, 'success');
    void window.feather.showItem(result.file);
  }

  return (
    <Modal
      title="Als ZIP exportieren"
      subtitle="SQL-Dateien mit allen Tabellen und Daten"
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy || selected.size === 0} onClick={() => void run()}>
            <FileArchive className="size-4" />
            {busy ? 'Exportiere …' : 'Exportieren …'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label mb-0!">Datenbanken</span>
            <button className="text-xs text-primary hover:underline" onClick={() => setSelected(selected.size === dbs.length ? new Set() : new Set(dbs.map((d) => d.name)))}>
              {selected.size === dbs.length ? 'Keine auswählen' : 'Alle auswählen'}
            </button>
          </div>
          <div className="card max-h-52 overflow-y-auto divide-y divide-neutral-800">
            {dbs.map((d) => (
              <label key={d.name} className="flex items-center gap-3 px-3.5 py-2 cursor-pointer hover:bg-neutral-800/40">
                <input type="checkbox" className="size-4 accent-sky-500" checked={selected.has(d.name)} onChange={(e) => toggle(d.name, e.target.checked)} />
                <span className="flex-1 text-sm text-neutral-100 truncate">{d.name}</span>
                <span className="text-xs text-neutral-500">{d.tables} Tabellen · {formatBytes(d.sizeKb * 1024)}</span>
              </label>
            ))}
          </div>
        </div>
        <Toggle checked={perTable} onChange={setPerTable} label="Eine Datei pro Tabelle" description="Sonst entsteht pro Datenbank eine einzige .sql-Datei." />
        {busy && <p className="text-xs text-primary animate-pulse">Exportiere {label} …</p>}
      </div>
    </Modal>
  );
}
