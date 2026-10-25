import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, History as HistoryIcon, KeyRound, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from '../components/Bits';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import type { HistoryEntry } from '../../shared/sql';
import { blankColumn, dropColumnSql, specOf } from '../../shared/sqlgen';
import { addHistory, loadHistory, noteKey, notesByCell } from '../lib/sqlhistory';
import { invalidateSchema } from '../lib/sqlschema';
import { ident, literal, rowsOf, runSql, serverKeyOf } from '../lib/sqlsource';
import { useAppState } from '../lib/store';
import { openColumnDialog } from './Designer';
import { useSqlCompletion } from './Completion';
import { HistoryDialog, HistoryNote } from './History';

const PAGE = 100;

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  key: string;
  fallback: string | null;
  extra: string;
}

interface Data {
  columns: string[];
  rows: (string | null)[][];
  total: number;
}

const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), 'error');
const protectedCell = (value: string | null): boolean => value !== null && (value.startsWith('<BINARY ') || (value.length > 2000 && value.endsWith('…')));

function InsertDialog({ columns, onSubmit, onClose }: { columns: Column[]; onSubmit: (values: Record<string, string | null>) => Promise<void>; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [nulls, setNulls] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    const out: Record<string, string | null> = {};
    for (const c of columns) {
      const auto = c.extra.includes('auto_increment') || c.extra.includes('GENERATED');
      if (nulls[c.name]) out[c.name] = null;
      else if (values[c.name] !== undefined && values[c.name] !== '') out[c.name] = values[c.name] as string;
      else if (!auto && c.fallback === null && !c.nullable) out[c.name] = '';
    }
    try {
      await onSubmit(out);
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="Neue Zeile" size="max-w-xl" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy} onClick={() => void submit()} data-action="row-insert">Einfügen</button></>}>
      <div className="space-y-3">
        {columns.map((c) => {
          const auto = c.extra.includes('auto_increment');
          return (
            <div key={c.name} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="text-sm text-neutral-200 truncate flex items-center gap-1">
                  {c.key === 'PRI' && <KeyRound className="size-3 text-amber-400" />}
                  {c.name}
                </p>
                <p className="text-[11px] text-neutral-600 truncate">{c.type}</p>
              </div>
              <input
                className="input font-mono h-8 text-[13px]"
                disabled={nulls[c.name]}
                placeholder={auto ? 'automatisch' : c.fallback !== null ? `Standard: ${c.fallback}` : c.nullable ? 'leer = NULL' : ''}
                value={values[c.name] ?? ''}
                spellCheck={false}
                onChange={(e) => setValues({ ...values, [c.name]: e.target.value })}
              />
              <label className={`flex items-center gap-1.5 text-xs text-neutral-500 ${c.nullable ? 'cursor-pointer' : 'opacity-30'}`}>
                <input type="checkbox" className="size-3.5 accent-sky-500" disabled={!c.nullable} checked={nulls[c.name] ?? false} onChange={(e) => setNulls({ ...nulls, [c.name]: e.target.checked })} />
                NULL
              </label>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function EditRowDialog({ columns, dataColumns, row, notes, keys, onSubmit, onClose }: { columns: Column[]; dataColumns: string[]; row: (string | null)[]; notes: (column: string) => HistoryEntry[]; keys: string[]; onSubmit: (changes: Record<string, string | null>) => Promise<void>; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(dataColumns.map((c, i) => [c, row[i] ?? ''])));
  const [nulls, setNulls] = useState<Record<string, boolean>>(() => Object.fromEntries(dataColumns.map((c, i) => [c, row[i] === null])));
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    const changes: Record<string, string | null> = {};
    dataColumns.forEach((c, i) => {
      if (protectedCell(row[i] ?? null)) return;
      const next = nulls[c] ? null : (values[c] ?? '');
      if (next !== row[i]) changes[c] = next;
    });
    if (Object.keys(changes).length === 0) return onClose();
    setBusy(true);
    try {
      await onSubmit(changes);
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="Zeile bearbeiten" size="max-w-xl" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy} onClick={() => void submit()} data-action="row-save">Speichern</button></>}>
      <div className="space-y-4">
        {dataColumns.map((c, i) => {
          const info = columns.find((x) => x.name === c);
          const locked = protectedCell(row[i] ?? null);
          const note = notes(c);
          return (
            <div key={c} data-edit-field={c}>
              <div className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-neutral-200 truncate flex items-center gap-1">
                    {keys.includes(c) && <KeyRound className="size-3 text-amber-400" />}
                    {c}
                  </p>
                  <p className="text-[11px] text-neutral-600 truncate">{info?.type ?? ''}</p>
                </div>
                <input
                  className="input font-mono h-8 text-[13px]"
                  disabled={nulls[c] || locked}
                  value={nulls[c] ? '' : (values[c] ?? '')}
                  placeholder={locked ? 'nicht bearbeitbar' : nulls[c] ? 'NULL' : ''}
                  spellCheck={false}
                  onChange={(e) => setValues({ ...values, [c]: e.target.value })}
                  data-bind={`edit-${c}`}
                />
                <label className={`flex items-center gap-1.5 text-xs text-neutral-500 ${info?.nullable && !locked ? 'cursor-pointer' : 'opacity-30'}`}>
                  <input type="checkbox" className="size-3.5 accent-sky-500" disabled={!info?.nullable || locked} checked={nulls[c] ?? false} onChange={(e) => setNulls({ ...nulls, [c]: e.target.checked })} />
                  NULL
                </label>
              </div>
              {note.length > 0 && (
                <div className="mt-1 pl-[162px]">
                  <HistoryNote
                    entries={note}
                    onPick={(value) => {
                      setNulls({ ...nulls, [c]: value === null });
                      setValues({ ...values, [c]: value ?? '' });
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function TableTab({ source, db, table, refreshKey = 0 }: { source: string; db: string; table: string; refreshKey?: number }) {
  const full = `${ident(db)}.${ident(table)}`;
  const [view, setView] = useState<'data' | 'structure'>('data');
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const [applied, setApplied] = useState('');
  const [order, setOrder] = useState<{ col: string; dir: 'ASC' | 'DESC' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ row: number; col: number; value: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const filterField = useRef<HTMLInputElement>(null);
  const help = useAppState((st) => st.settings.database);
  const server = useMemo(() => serverKeyOf(source), [source]);
  const scope = useMemo(() => ({ server, db, table }), [server, db, table]);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const notes = useMemo(() => (help.history ? notesByCell(entries) : new Map<string, HistoryEntry[]>()), [entries, help.history]);
  const tracking = help.history || help.keepDeleted;
  const completion = useSqlCompletion({ source, db, enabled: help.autocomplete, field: filterField, contextPrefix: `SELECT * FROM ${full} WHERE `, onValue: setFilter });

  const keys = useMemo(() => columns?.filter((c) => c.key === 'PRI').map((c) => c.name) ?? [], [columns]);

  const loadStructure = useCallback(async (): Promise<void> => {
    try {
      const rows = rowsOf(await runSql(source, `SELECT column_name, column_type, is_nullable, column_key, column_default, extra FROM information_schema.columns WHERE table_schema = ${literal(db)} AND table_name = ${literal(table)} ORDER BY ordinal_position`));
      setColumns(rows.map((r) => ({ name: r[0] ?? '', type: r[1] ?? '', nullable: r[2] === 'YES', key: r[3] ?? '', fallback: r[4] ?? null, extra: r[5] ?? '' })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [source, db, table]);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const where = applied.trim() ? ` WHERE ${applied.trim()}` : '';
    const sort = order ? ` ORDER BY ${ident(order.col)} ${order.dir}` : '';
    try {
      const out = await runSql(source, `SELECT * FROM ${full}${where}${sort} LIMIT ${PAGE} OFFSET ${page * PAGE};\nSELECT COUNT(*) FROM ${full}${where};`);
      if (out.error) throw new Error(out.error.message);
      const first = out.results[0];
      setData({ columns: first && first.type === 'rows' ? first.columns : [], rows: rowsOf(out, 0), total: Number(rowsOf(out, 1)[0]?.[0] ?? 0) });
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, [source, full, applied, order, page]);

  const refreshHistory = useCallback(async (): Promise<void> => {
    try {
      setEntries(await loadHistory(scope));
    } catch {
      setEntries([]);
    }
  }, [scope]);

  useEffect(() => {
    if (tracking) void refreshHistory();
    else setEntries([]);
  }, [tracking, refreshHistory]);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const reloadAll = useCallback(async (): Promise<void> => {
    invalidateSchema(source);
    await Promise.all([loadStructure(), loadData(), tracking ? refreshHistory() : Promise.resolve()]);
  }, [source, loadStructure, loadData, tracking, refreshHistory]);

  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    void reloadAll();
  }, [refreshKey, reloadAll]);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  function whereOf(row: (string | null)[]): string | null {
    if (!data || keys.length === 0) return null;
    const parts: string[] = [];
    for (const k of keys) {
      const index = data.columns.indexOf(k);
      if (index < 0) return null;
      const value = row[index];
      parts.push(value === null || value === undefined ? `${ident(k)} IS NULL` : `${ident(k)} = ${literal(value)}`);
    }
    return parts.join(' AND ');
  }

  function keyOf(row: (string | null)[]): Record<string, string | null> {
    const key: Record<string, string | null> = {};
    for (const k of keys) key[k] = row[data?.columns.indexOf(k) ?? -1] ?? null;
    return key;
  }

  const whereOfKey = (key: Record<string, string | null>): string =>
    Object.entries(key)
      .map(([k, v]) => (v === null ? `${ident(k)} IS NULL` : `${ident(k)} = ${literal(v)}`))
      .join(' AND ');

  async function record(items: { key: Record<string, string | null>; column: string; old: string | null; value: string | null }[]): Promise<void> {
    if (!help.history || items.length === 0) return;
    try {
      await addHistory(items.map((i) => ({ ...i, server, db, table, kind: 'update' as const, row: null })));
      await refreshHistory();
    } catch (err) {
      fail(err);
    }
  }

  async function exec(sql: string): Promise<void> {
    const out = await runSql(source, sql);
    if (out.error) throw new Error(out.error.message);
  }

  async function commit(): Promise<void> {
    if (!editing || !data) return;
    const { row, col, value } = editing;
    setEditing(null);
    const current = data.rows[row];
    const where = current ? whereOf(current) : null;
    const name = data.columns[col];
    if (!current || !where || !name || current[col] === value) return;
    try {
      await exec(`UPDATE ${full} SET ${ident(name)} = ${literal(value)} WHERE ${where} LIMIT 1`);
      setData({ ...data, rows: data.rows.map((r, i) => (i === row ? r.map((v, ci) => (ci === col ? value : v)) : r)) });
      await record([{ key: keyOf(current), column: name, old: current[col] ?? null, value }]);
    } catch (err) {
      fail(err);
    }
  }

  async function setNull(row: number, col: number): Promise<void> {
    if (!data) return;
    const current = data.rows[row];
    const where = current ? whereOf(current) : null;
    const name = data.columns[col];
    if (!current || !where || !name) return;
    try {
      await exec(`UPDATE ${full} SET ${ident(name)} = NULL WHERE ${where} LIMIT 1`);
      setData({ ...data, rows: data.rows.map((r, i) => (i === row ? r.map((v, ci) => (ci === col ? null : v)) : r)) });
      await record([{ key: keyOf(current), column: name, old: current[col] ?? null, value: null }]);
    } catch (err) {
      fail(err);
    }
  }

  function selectRow(index: number, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): void {
    setSelected((prev) => {
      if (event.shiftKey && prev.size > 0) {
        const anchor = Math.min(...prev);
        const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
        return new Set(Array.from({ length: to - from + 1 }, (_v, i) => from + i));
      }
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      }
      return new Set([index]);
    });
  }

  async function remove(): Promise<void> {
    if (!data || selected.size === 0) return;
    const rows = [...selected].map((i) => data.rows[i]).filter((r): r is (string | null)[] => Boolean(r));
    const backupable = (r: (string | null)[]): boolean => !r.some((v) => protectedCell(v));
    const saved = help.keepDeleted ? rows.filter(backupable) : [];
    const note = !help.keepDeleted ? 'Das kann nicht rückgängig gemacht werden.' : saved.length === rows.length ? 'Feather sichert die Zeilen vorher, du kannst sie im Verlauf wiederherstellen.' : 'Zeilen mit Binärdaten oder sehr langen Texten lassen sich nicht sichern. Für sie kann das nicht rückgängig gemacht werden.';
    const ok = await confirmDialog({ title: rows.length === 1 ? 'Zeile löschen?' : `${rows.length} Zeilen löschen?`, message: note, confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try {
      const statements = rows.map((r) => `DELETE FROM ${full} WHERE ${whereOf(r)} LIMIT 1`);
      await exec(statements.join(';\n'));
      if (saved.length > 0) {
        const names = data.columns;
        await addHistory(saved.map((r) => ({ server, db, table, kind: 'delete' as const, key: keyOf(r), column: '', old: null, value: null, row: Object.fromEntries(names.map((c, i) => [c, r[i] ?? null])) })));
        await refreshHistory();
      }
      toast(rows.length === 1 ? 'Zeile gelöscht.' : `${rows.length} Zeilen gelöscht.`, 'success');
      void loadData();
    } catch (err) {
      fail(err);
    }
  }

  async function insert(values: Record<string, string | null>): Promise<void> {
    const names = Object.keys(values);
    const sql = names.length ? `INSERT INTO ${full} (${names.map(ident).join(', ')}) VALUES (${names.map((n) => (values[n] === null ? 'NULL' : literal(values[n] as string))).join(', ')})` : `INSERT INTO ${full} () VALUES ()`;
    await exec(sql);
    toast('Zeile eingefügt.', 'success');
    void loadData();
  }

  async function saveRow(row: (string | null)[], changes: Record<string, string | null>): Promise<void> {
    const where = whereOf(row);
    if (!where) throw new Error('Die Zeile hat keinen Primärschlüssel.');
    const names = Object.keys(changes);
    await exec(`UPDATE ${full} SET ${names.map((n) => `${ident(n)} = ${changes[n] === null ? 'NULL' : literal(changes[n] as string)}`).join(', ')} WHERE ${where} LIMIT 1`);
    const key = keyOf(row);
    await record(names.map((n) => ({ key, column: n, old: row[data?.columns.indexOf(n) ?? -1] ?? null, value: changes[n] ?? null })));
    toast('Zeile gespeichert.', 'success');
    void loadData();
  }

  async function currentValue(entry: HistoryEntry): Promise<string | null | undefined> {
    const out = rowsOf(await runSql(source, `SELECT ${ident(entry.column)} FROM ${full} WHERE ${whereOfKey(entry.key)} LIMIT 1`));
    if (out.length === 0) throw new Error('Diese Zeile gibt es nicht mehr.');
    return out[0]?.[0] ?? null;
  }

  async function revert(entry: HistoryEntry): Promise<void> {
    await currentValue(entry);
    await exec(`UPDATE ${full} SET ${ident(entry.column)} = ${entry.old === null ? 'NULL' : literal(entry.old)} WHERE ${whereOfKey(entry.key)} LIMIT 1`);
    void loadData();
  }

  async function restore(entry: HistoryEntry): Promise<void> {
    const row = entry.row ?? {};
    const names = Object.keys(row);
    if (names.length === 0) throw new Error('Für diesen Eintrag liegt keine Zeile vor.');
    await exec(`INSERT INTO ${full} (${names.map(ident).join(', ')}) VALUES (${names.map((n) => (row[n] === null ? 'NULL' : literal(row[n] as string))).join(', ')})`);
    void loadData();
  }

  async function dropColumn(name: string): Promise<void> {
    const ok = await confirmDialog({ title: `Spalte „${name}“ löschen?`, message: 'Die Spalte und alle ihre Werte werden unwiderruflich gelöscht. Der Änderungsverlauf deckt das nicht ab.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try {
      await exec(dropColumnSql(db, table, name));
      toast('Spalte gelöscht.', 'success');
      void loadStructure();
      void loadData();
    } catch (err) {
      fail(err);
    }
  }

  function structureChanged(): void {
    void loadStructure();
    void loadData();
  }

  function sortBy(col: string): void {
    setPage(0);
    setOrder((o) => (!o || o.col !== col ? { col, dir: 'ASC' } : o.dir === 'ASC' ? { col, dir: 'DESC' } : null));
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const editable = keys.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0" data-table-tab={`${db}.${table}`}>
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-neutral-800">
        <div className="flex rounded-lg bg-neutral-950/60 border border-neutral-800 p-0.5">
          {([['data', 'Daten'], ['structure', 'Struktur']] as const).map(([id, label]) => (
            <button key={id} className={`px-3 h-7 rounded-md text-[13px] font-medium transition-colors ${view === id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-100'}`} onClick={() => setView(id)} data-view-mode={id}>
              {label}
            </button>
          ))}
        </div>
        {view === 'data' && (
          <>
            <form
              className="relative flex-1 min-w-0"
              onSubmit={(e) => {
                e.preventDefault();
                completion.hide();
                setPage(0);
                setApplied(filter);
              }}
            >
              <input
                ref={filterField}
                className="input h-8 font-mono text-[13px]"
                placeholder="Filter, z. B. id > 10 AND name LIKE 'A%'"
                value={filter}
                spellCheck={false}
                onChange={(e) => {
                  setFilter(e.target.value);
                  requestAnimationFrame(() => completion.trigger());
                }}
                onKeyDown={(e) => void completion.onKeyDown(e)}
                onBlur={completion.hide}
                data-bind="table-filter"
              />
              {completion.popup}
            </form>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void reloadAll()} title="Alles neu laden" aria-label="Aktualisieren" data-action="table-refresh">
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {tracking && (
              <button className="btn btn-ghost btn-sm" onClick={() => openLayer((close) => <HistoryDialog db={db} table={table} entries={entries} scope={scope} currentValue={currentValue} revert={revert} restore={restore} onChanged={() => void refreshHistory()} onClose={close} />)} data-action="history-open" title="Änderungsverlauf">
                <HistoryIcon className="size-3.5" />
                Verlauf
                {entries.filter((e) => !e.undone).length > 0 && <span className="rounded-full bg-red-500/20 px-1.5 text-[10px] font-semibold text-red-300">{entries.filter((e) => !e.undone).length}</span>}
              </button>
            )}
            <button className="btn btn-outline btn-sm" disabled={!columns} onClick={() => columns && openLayer((close) => <InsertDialog columns={columns} onSubmit={insert} onClose={close} />)} data-action="row-add">
              <Plus className="size-3.5" />
              Zeile
            </button>
            <button className="btn btn-ghost btn-sm text-neutral-400 hover:text-red-400" disabled={selected.size === 0 || !editable} onClick={() => void remove()} data-action="row-delete">
              <Trash2 className="size-3.5" />
              Löschen
            </button>
          </>
        )}
      </div>

      {error && <div className="px-4 pt-3"><Notice tone="error">{error}</Notice></div>}

      {view === 'structure' ? (
        <div className="flex-1 min-h-0 overflow-auto p-4 animate-fade-in">
          {!columns ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <div className="space-y-3">
            <button className="btn btn-outline btn-sm" onClick={() => openColumnDialog({ source, db, table, mode: 'add', initial: blankColumn({ name: '' }), columns: columns.map((c) => c.name), onDone: structureChanged })} data-action="column-add">
              <Plus className="size-3.5" />
              Spalte hinzufügen
            </button>
            <div className="card overflow-auto">
              <table className="min-w-full text-[12px] font-mono">
                <thead className="bg-neutral-900">
                  <tr>
                    {['Spalte', 'Typ', 'NULL', 'Schlüssel', 'Standard', 'Extra', ''].map((h, i) => (
                      <th key={`${h}${i}`} className="px-3 py-2 text-left font-medium text-neutral-400 border-b border-neutral-800 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.name} className="odd:bg-neutral-800/20">
                      <td className="px-3 py-1.5 text-neutral-100">{c.key === 'PRI' && <KeyRound className="inline size-3 mr-1 text-amber-400" />}{c.name}</td>
                      <td className="px-3 py-1.5 text-sky-300">{c.type}</td>
                      <td className="px-3 py-1.5 text-neutral-400">{c.nullable ? 'ja' : 'nein'}</td>
                      <td className="px-3 py-1.5 text-neutral-400">{c.key}</td>
                      <td className="px-3 py-1.5 text-neutral-400">{c.fallback ?? <span className="italic text-neutral-600">NULL</span>}</td>
                      <td className="px-3 py-1.5 text-neutral-500">{c.extra}</td>
                      <td className="px-3 py-1 text-right whitespace-nowrap">
                        <button className="btn btn-ghost btn-icon btn-sm" aria-label={`${c.name} bearbeiten`} title="Spalte bearbeiten" onClick={() => openColumnDialog({ source, db, table, mode: 'edit', initial: specOf(c), columns: columns.map((x) => x.name), onDone: structureChanged })} data-action="column-edit">
                          <Pencil className="size-3.5" />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" aria-label={`${c.name} löschen`} title="Spalte löschen" disabled={columns.length === 1} onClick={() => void dropColumn(c.name)} data-action="column-drop">
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {columns && !editable && <p className="px-4 pt-2 text-xs text-amber-300">Diese Tabelle hat keinen Primärschlüssel. Zeilen lassen sich nur ansehen, nicht ändern.</p>}
          <div className="flex-1 min-h-0 min-w-0 overflow-auto m-4 mt-3 card" data-grid>
            {!data ? (
              <div className="p-6"><Loader2 className="size-5 animate-spin text-primary" /></div>
            ) : (
              <table className="min-w-full text-[12px] font-mono">
                <thead className="sticky top-0 bg-neutral-900 z-10">
                  <tr>
                    <th className="w-10 px-2 py-2 border-b border-neutral-800" />
                    {data.columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-medium text-neutral-400 border-b border-neutral-800 whitespace-nowrap">
                        <button className="inline-flex items-center gap-1 hover:text-neutral-100 transition-colors" onClick={() => sortBy(c)} data-notranslate>
                          {keys.includes(c) && <KeyRound className="size-3 text-amber-400" />}
                          {c}
                          {order?.col === c && (order.dir === 'ASC' ? <ArrowUp className="size-3 text-primary" /> : <ArrowDown className="size-3 text-primary" />)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={`${selected.has(ri) ? 'bg-primary/20' : 'odd:bg-neutral-800/20 hover:bg-neutral-800/50'} transition-colors`}
                      data-row={ri}
                      data-selected={selected.has(ri)}
                      onClick={(e) => selectRow(ri, e)}
                    >
                      <td className={`px-2 py-1.5 text-right cursor-pointer select-none hover:text-neutral-300 ${selected.has(ri) ? 'text-primary font-medium shadow-[inset_3px_0_0_0_var(--color-primary)]' : 'text-neutral-600'}`}>
                        {page * PAGE + ri + 1}
                      </td>
                      {row.map((value, ci) => {
                        const isEditing = editing?.row === ri && editing.col === ci;
                        const cellNotes = editable && help.history ? notes.get(noteKey(keyOf(row), data.columns[ci] ?? '')) : undefined;
                        return (
                          <td
                            key={ci}
                            className={`relative px-3 py-1.5 whitespace-nowrap max-w-[360px] ${isEditing ? '' : 'truncate'} ${value === null ? 'text-neutral-600 italic' : 'text-neutral-200'} ${editable ? 'cursor-text' : ''}`}
                            title={value ?? 'NULL'}
                            data-notranslate={isEditing ? undefined : 'true'}
                            onDoubleClick={() => editable && !protectedCell(value) && setEditing({ row: ri, col: ci, value: value ?? '' })}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setMenu({
                                x: e.clientX,
                                y: e.clientY,
                                entries: [
                                  { kind: 'action', label: 'Wert kopieren', onSelect: () => void window.feather.copy(value ?? '') },
                                  { kind: 'action', label: 'Zeile kopieren (JSON)', onSelect: () => void window.feather.copy(JSON.stringify(Object.fromEntries(data.columns.map((c, i) => [c, row[i]])), null, 2)) },
                                  ...(editable ? [{ kind: 'separator' as const }, { kind: 'action' as const, label: 'Zeile bearbeiten …', onSelect: () => columns && openLayer((close) => <EditRowDialog columns={columns} dataColumns={data.columns} row={row} keys={keys} notes={(c) => (help.history ? notes.get(noteKey(keyOf(row), c)) ?? [] : [])} onSubmit={(changes) => saveRow(row, changes)} onClose={close} />) }, { kind: 'action' as const, label: 'Auf NULL setzen', disabled: protectedCell(value), onSelect: () => void setNull(ri, ci) }, { kind: 'action' as const, label: 'Zeile löschen', danger: true, onSelect: () => { setSelected(new Set([ri])); void remove(); } }] : []),
                                ],
                              });
                            }}
                          >
                            {isEditing ? (
                              <input
                                ref={input}
                                className="w-full min-w-[120px] bg-neutral-950 border border-primary rounded px-1.5 py-0.5 text-neutral-100 outline-none"
                                value={editing.value}
                                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void commit();
                                  else if (e.key === 'Escape') setEditing(null);
                                }}
                                onBlur={() => void commit()}
                                data-bind="cell-edit"
                              />
                            ) : value === null ? (
                              'NULL'
                            ) : (
                              value
                            )}
                            {cellNotes && cellNotes.length > 0 && !isEditing && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-red-500" title={`Früher: ${cellNotes[0]?.old ?? 'NULL'}`} data-history-dot />}
                            {isEditing && cellNotes && cellNotes.length > 0 && (
                              <div className="absolute left-0 top-full z-30 mt-1 w-max max-w-[340px] whitespace-normal rounded-md border border-red-500/30 bg-neutral-950 px-2.5 py-1.5 not-italic shadow-lg" onMouseDown={(e) => e.preventDefault()}>
                                <HistoryNote entries={cellNotes} onPick={(picked) => setEditing({ row: ri, col: ci, value: picked ?? '' })} />
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr><td colSpan={data.columns.length + 1} className="px-4 py-6 text-center text-neutral-500">Keine Zeilen</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-3 px-4 pb-3 text-xs text-neutral-500">
            <span>{data ? `${data.total} ${data.total === 1 ? 'Zeile' : 'Zeilen'}` : ''}</span>
            {selected.size > 0 && <span className="text-primary">{selected.size} ausgewählt</span>}
            <span className="flex-1" />
            <button className="btn btn-ghost btn-icon btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Vorherige Seite">
              <ChevronLeft className="size-4" />
            </button>
            <span>Seite {page + 1} von {pages}</span>
            <button className="btn btn-ghost btn-icon btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Nächste Seite">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
}
