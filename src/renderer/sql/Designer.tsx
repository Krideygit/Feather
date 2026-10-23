import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  COLUMN_TYPES,
  PRESET_COLUMNS,
  addColumnSql,
  blankColumn,
  changeColumnSql,
  createTableSql,
  typeInfo,
  validateColumns,
  type ColumnSpec,
} from '../../shared/sqlgen';
import { Notice } from '../components/Bits';
import { Field } from '../components/Form';
import { Modal, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { runSql } from '../lib/sqlsource';

type Mode = 'create' | 'add' | 'edit';

const GRID = 'grid grid-cols-[minmax(120px,1.2fr)_minmax(170px,1.5fr)_84px_minmax(150px,1.3fr)_repeat(5,46px)_28px] items-center gap-2';
const GROUPS = [...new Set(COLUMN_TYPES.map((t) => t.group))];

const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), 'error');

function Check({ checked, disabled, title, onChange }: { checked: boolean; disabled?: boolean; title: string; onChange: (value: boolean) => void }) {
  return (
    <label className={`grid place-items-center h-8 ${disabled ? 'opacity-30' : 'cursor-pointer'}`} title={title}>
      <input type="checkbox" className="size-4 accent-sky-500" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={title} />
    </label>
  );
}

function Row({ spec, mode, onChange, onRemove }: { spec: ColumnSpec; mode: Mode; onChange: (next: ColumnSpec) => void; onRemove?: () => void }) {
  const info = typeInfo(spec.type);
  const patch = (p: Partial<ColumnSpec>): void => onChange({ ...spec, ...p });

  function setType(id: string): void {
    const next = typeInfo(id);
    const base: Partial<ColumnSpec> = { type: id, length: next.length === 'required' || next.length === 'values' || id === 'DECIMAL' ? (next.hint ?? '') : '' };
    if (!next.numeric) base.unsigned = false;
    if (!next.integer) base.autoIncrement = false;
    if (!next.temporal && spec.defaultMode === 'now') base.defaultMode = 'none';
    patch(base);
  }

  const keysLocked = mode !== 'create';
  return (
    <div className={GRID} data-column-row={spec.name}>
      <input className="input h-8 font-mono text-[13px]" value={spec.name} placeholder="name" spellCheck={false} onChange={(e) => patch({ name: e.target.value })} data-bind="col-name" />
      <select className="input h-8 text-[13px]" value={spec.type} onChange={(e) => setType(e.target.value)} data-bind="col-type">
        {GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {COLUMN_TYPES.filter((t) => t.group === g).map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </optgroup>
        ))}
        {!COLUMN_TYPES.some((t) => t.id === spec.type) && <option value={spec.type}>{spec.type}</option>}
      </select>
      <input className="input h-8 font-mono text-[13px]" value={spec.length} disabled={info.length === 'none'} placeholder={info.hint ?? ''} spellCheck={false} onChange={(e) => patch({ length: e.target.value })} title={info.length === 'values' ? 'Werte der Auswahlliste, getrennt durch Komma' : 'Länge'} data-bind="col-length" />
      <div className="flex gap-1">
        <select className="input h-8 text-[13px] min-w-0 flex-1" value={spec.autoIncrement ? 'none' : spec.defaultMode} disabled={spec.autoIncrement} onChange={(e) => patch({ defaultMode: e.target.value as ColumnSpec['defaultMode'] })} data-bind="col-default-mode">
          <option value="none">Kein Standard</option>
          <option value="null" disabled={!spec.nullable}>NULL</option>
          <option value="value">Wert …</option>
          {info.temporal && <option value="now">Aktuelle Zeit</option>}
        </select>
        {spec.defaultMode === 'value' && !spec.autoIncrement && <input className="input h-8 w-24 font-mono text-[13px]" value={spec.defaultValue} spellCheck={false} onChange={(e) => patch({ defaultValue: e.target.value })} data-bind="col-default" />}
      </div>
      <Check title="Darf leer sein (NULL)" checked={spec.nullable} disabled={spec.primary || spec.autoIncrement} onChange={(nullable) => patch({ nullable, defaultMode: !nullable && spec.defaultMode === 'null' ? 'none' : spec.defaultMode })} />
      <Check title="Zählt automatisch hoch (Auto-Increment)" checked={spec.autoIncrement} disabled={!info.integer || (keysLocked && !spec.autoIncrement)} onChange={(autoIncrement) => patch(autoIncrement ? { autoIncrement, nullable: false, defaultMode: 'none', ...(mode === 'create' ? { primary: true } : {}) } : { autoIncrement })} />
      <Check title="Primärschlüssel" checked={spec.primary} disabled={keysLocked} onChange={(primary) => patch({ primary, nullable: primary ? false : spec.nullable })} />
      <Check title="Eindeutig (kein Wert doppelt)" checked={spec.unique} disabled={mode === 'edit'} onChange={(unique) => patch({ unique })} />
      <Check title="Nur positive Zahlen (UNSIGNED)" checked={spec.unsigned} disabled={!info.numeric || info.id === 'BOOLEAN'} onChange={(unsigned) => patch({ unsigned })} />
      {onRemove ? (
        <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" onClick={onRemove} aria-label="Spalte entfernen" title="Spalte entfernen">
          <Trash2 className="size-4" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function Head() {
  return (
    <div className={`${GRID} px-0 text-[11px] font-medium uppercase tracking-wide text-neutral-500`}>
      <span>Name</span>
      <span>Typ</span>
      <span>Länge</span>
      <span>Standardwert</span>
      <span className="text-center" title="Darf leer sein (NULL)">NULL</span>
      <span className="text-center" title="Zählt automatisch hoch">Auto</span>
      <span className="text-center" title="Primärschlüssel">PK</span>
      <span className="text-center" title="Eindeutig">Unique</span>
      <span className="text-center" title="Nur positive Zahlen">Positiv</span>
      <span />
    </div>
  );
}

function Preview({ sql }: { sql: string | null }) {
  return (
    <pre className="max-h-40 overflow-auto rounded-lg border border-neutral-800 bg-black/40 p-3 text-xs text-sky-200 select-text whitespace-pre-wrap" data-sql-preview>{sql ?? 'Fülle die Angaben aus, dann erscheint hier der SQL-Befehl.'}</pre>
  );
}

function Designer({ source, db, onCreated, onClose }: { source: string; db: string; onCreated: (table: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<ColumnSpec[]>(() => [PRESET_COLUMNS[0]?.spec() as ColumnSpec, PRESET_COLUMNS[2]?.spec() as ColumnSpec]);
  const [busy, setBusy] = useState(false);
  const [showSql, setShowSql] = useState(false);

  const result = useMemo(() => {
    try {
      return { sql: createTableSql(db, name, columns), error: null as string | null };
    } catch (err) {
      return { sql: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [db, name, columns]);

  async function submit(): Promise<void> {
    if (!result.sql) return;
    setBusy(true);
    try {
      const out = await runSql(source, result.sql);
      if (out.error) throw new Error(out.error.message);
      toast(`Tabelle „${name.trim()}“ wurde angelegt.`, 'success');
      onCreated(name.trim());
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  const update = (index: number, next: ColumnSpec): void => setColumns((list) => list.map((c, i) => (i === index ? next : c)));
  const hint = name.trim() === '' ? 'Gib der Tabelle einen Namen.' : validateColumns(columns);

  return (
    <Modal
      title="Neue Tabelle"
      subtitle={`in der Datenbank „${db}“`}
      size="max-w-6xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost mr-auto" onClick={() => setShowSql((v) => !v)} data-action="designer-sql">{showSql ? 'SQL ausblenden' : 'SQL anzeigen'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy || !result.sql} onClick={() => void submit()} data-action="designer-create">Tabelle anlegen</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name der Tabelle" hint="z. B. spieler oder BUCKET_USERS. Auf Linux-Servern zählt die Groß- und Kleinschreibung.">
          <input className="input font-mono max-w-sm" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} data-bind="table-name" />
        </Field>
        <div className="space-y-2 overflow-x-auto pb-1">
          <div className="min-w-[860px] space-y-2">
            <Head />
            {columns.map((c, i) => (
              <Row key={i} spec={c} mode="create" onChange={(next) => update(i, next)} onRemove={columns.length > 1 ? () => setColumns((list) => list.filter((_, ix) => ix !== i)) : undefined} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => setColumns((list) => [...list, blankColumn()])} data-action="designer-add-column">
            <Plus className="size-3.5" />
            Spalte
          </button>
          <span className="text-xs text-neutral-600">Schnell hinzufügen:</span>
          {PRESET_COLUMNS.map((p) => (
            <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => setColumns((list) => [...list, p.spec()])}>{p.label}</button>
          ))}
        </div>
        {hint && <Notice tone="warn">{hint}</Notice>}
        {showSql && <Preview sql={result.sql} />}
      </div>
    </Modal>
  );
}

export function openTableDesigner(source: string, db: string, onCreated: (table: string) => void): void {
  openLayer((close) => <Designer source={source} db={db} onCreated={onCreated} onClose={close} />);
}

function ColumnDialog({ source, db, table, mode, initial, columns, onDone, onClose }: { source: string; db: string; table: string; mode: 'add' | 'edit'; initial: ColumnSpec; columns: string[]; onDone: () => void; onClose: () => void }) {
  const [spec, setSpec] = useState(initial);
  const [position, setPosition] = useState<string>('end');
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => {
    try {
      const after = position === 'end' ? '' : position === 'first' ? null : position;
      return { sql: mode === 'add' ? addColumnSql(db, table, spec, after) : changeColumnSql(db, table, initial.name, spec), error: null as string | null };
    } catch (err) {
      return { sql: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [db, table, mode, spec, position, initial.name]);

  async function submit(): Promise<void> {
    if (!result.sql) return;
    setBusy(true);
    try {
      const out = await runSql(source, result.sql);
      if (out.error) throw new Error(out.error.message);
      toast(mode === 'add' ? `Spalte „${spec.name.trim()}“ wurde hinzugefügt.` : `Spalte „${spec.name.trim()}“ wurde geändert.`, 'success');
      onDone();
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === 'add' ? 'Spalte hinzufügen' : `Spalte „${initial.name}“ bearbeiten`}
      subtitle={`${db}.${table}`}
      size="max-w-5xl"
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !result.sql} onClick={() => void submit()} data-action="column-save">{mode === 'add' ? 'Hinzufügen' : 'Speichern'}</button></>}
    >
      <div className="space-y-4">
        <div className="space-y-2 overflow-x-auto pb-1">
          <div className="min-w-[860px] space-y-2">
            <Head />
            <Row spec={spec} mode={mode} onChange={setSpec} />
          </div>
        </div>
        {mode === 'add' && (
          <Field label="Position">
            <select className="input max-w-xs" value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="end">Am Ende</option>
              <option value="first">Ganz vorne</option>
              {columns.map((c) => (
                <option key={c} value={c}>Nach „{c}“</option>
              ))}
            </select>
          </Field>
        )}
        {mode === 'edit' && <Notice tone="info">Beim Ändern des Typs wandelt MariaDB die vorhandenen Werte um. Passen sie nicht, bricht der Vorgang ab oder Werte werden gekürzt. Sichere vorher wichtige Daten.</Notice>}
        {result.error && <Notice tone="warn">{result.error}</Notice>}
        <Preview sql={result.sql} />
      </div>
    </Modal>
  );
}

export function openColumnDialog(props: { source: string; db: string; table: string; mode: 'add' | 'edit'; initial: ColumnSpec; columns: string[]; onDone: () => void }): void {
  openLayer((close) => <ColumnDialog {...props} onClose={close} />);
}
