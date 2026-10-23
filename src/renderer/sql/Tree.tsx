import { ChevronRight, Database, FilePlus2, Loader2, Plus, RefreshCw, Search, Table2, Trash2, Eraser, Eye, TextCursorInput } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { Field } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { ident, literal, rowsOf, runSql } from '../lib/sqlsource';

const SYSTEM = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

interface TableNode {
  name: string;
  view: boolean;
  rows: number;
}

interface DbNode {
  name: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  tables: TableNode[] | null;
}

interface Props {
  source: string;
  onOpenTable: (db: string, table: string) => void;
  onQuery: (db: string, sql?: string) => void;
  onDropped: (db: string, table?: string) => void;
  reloadKey: number;
}

const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), 'error');

function NewDatabase({ source, onDone, onClose }: { source: string; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(): Promise<void> {
    setBusy(true);
    try {
      const out = await runSql(source, `CREATE DATABASE ${ident(name.trim())} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      if (out.error) throw new Error(out.error.message);
      toast(`Datenbank „${name.trim()}“ wurde angelegt.`, 'success');
      onDone();
      onClose();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }
  return (
    <Modal title="Neue Datenbank" size="max-w-md" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void submit()} data-action="newdb-submit">Anlegen</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Name der Datenbank" hint="Zeichensatz: utf8mb4 (empfohlen für Umlaute und Emojis).">
          <input className="input font-mono" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} data-bind="newdb-name" />
        </Field>
      </form>
    </Modal>
  );
}

export function Tree({ source, onOpenTable, onQuery, onDropped, reloadKey }: Props) {
  const [dbs, setDbs] = useState<DbNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);

  const loadDatabases = useCallback(async (): Promise<void> => {
    try {
      const rows = rowsOf(await runSql(source, 'SHOW DATABASES'));
      const names = rows.map((r) => r[0] ?? '').filter(Boolean);
      names.sort((a, b) => Number(SYSTEM.has(a)) - Number(SYSTEM.has(b)) || a.localeCompare(b));
      setDbs((previous) => names.map((name) => previous?.find((d) => d.name === name) ?? { name, open: false, loading: false, error: null, tables: null }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [source]);

  const loadTables = useCallback(
    async (name: string): Promise<void> => {
      setDbs((list) => list?.map((d) => (d.name === name ? { ...d, loading: true, error: null } : d)) ?? list);
      try {
        const rows = rowsOf(await runSql(source, `SELECT table_name, table_type, COALESCE(table_rows, 0) FROM information_schema.tables WHERE table_schema = ${literal(name)} ORDER BY table_name`));
        const tables = rows.map((r) => ({ name: r[0] ?? '', view: (r[1] ?? '').includes('VIEW'), rows: Number(r[2]) || 0 }));
        setDbs((list) => list?.map((d) => (d.name === name ? { ...d, loading: false, tables } : d)) ?? list);
      } catch (err) {
        setDbs((list) => list?.map((d) => (d.name === name ? { ...d, loading: false, error: err instanceof Error ? err.message : String(err) } : d)) ?? list);
      }
    },
    [source],
  );

  useEffect(() => {
    setDbs(null);
    void loadDatabases();
  }, [loadDatabases, reloadKey]);

  function toggle(db: DbNode): void {
    setDbs((list) => list?.map((d) => (d.name === db.name ? { ...d, open: !d.open } : d)) ?? list);
    if (!db.open && !db.tables) void loadTables(db.name);
  }

  async function dropDb(name: string): Promise<void> {
    const ok = await confirmDialog({ title: `Datenbank „${name}“ löschen?`, message: 'Alle Tabellen und Daten darin werden unwiderruflich gelöscht.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try {
      const out = await runSql(source, `DROP DATABASE ${ident(name)}`);
      if (out.error) throw new Error(out.error.message);
      toast('Datenbank gelöscht.', 'success');
      onDropped(name);
      void loadDatabases();
    } catch (err) {
      fail(err);
    }
  }

  async function tableAction(db: string, table: string, kind: 'drop' | 'truncate'): Promise<void> {
    const drop = kind === 'drop';
    const ok = await confirmDialog({
      title: drop ? `Tabelle „${table}“ löschen?` : `Tabelle „${table}“ leeren?`,
      message: drop ? 'Die Tabelle samt allen Daten wird unwiderruflich gelöscht.' : 'Alle Zeilen werden unwiderruflich gelöscht. Die Tabelle bleibt bestehen.',
      confirmLabel: drop ? 'Löschen' : 'Leeren',
      danger: true,
    });
    if (!ok) return;
    try {
      const out = await runSql(source, `${drop ? 'DROP TABLE' : 'TRUNCATE TABLE'} ${ident(db)}.${ident(table)}`);
      if (out.error) throw new Error(out.error.message);
      toast(drop ? 'Tabelle gelöscht.' : 'Tabelle geleert.', 'success');
      if (drop) onDropped(db, table);
      void loadTables(db);
    } catch (err) {
      fail(err);
    }
  }

  const visible = useMemo(() => {
    if (!dbs) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return dbs;
    return dbs.filter((d) => d.name.toLowerCase().includes(q) || d.tables?.some((t) => t.name.toLowerCase().includes(q)));
  }, [dbs, filter]);

  return (
    <div className="flex flex-col min-h-0 h-full" data-sqltree>
      <div className="shrink-0 flex items-center gap-1 p-2 border-b border-neutral-800">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-500 pointer-events-none" />
          <input className="input h-8 pl-8 text-[13px]" placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" title="Aktualisieren" aria-label="Aktualisieren" onClick={() => void loadDatabases()}>
          <RefreshCw className="size-4" />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Neue Datenbank" aria-label="Neue Datenbank" onClick={() => openLayer((close) => <NewDatabase source={source} onDone={() => void loadDatabases()} onClose={close} />)} data-action="sql-new-db">
          <Plus className="size-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {error && <p className="px-3 py-2 text-xs text-red-300">{error}</p>}
        {!dbs && !error && (
          <p className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-500">
            <Loader2 className="size-3 animate-spin" />
            Wird geladen …
          </p>
        )}
        {visible?.map((db) => {
          const system = SYSTEM.has(db.name);
          const open = db.open || (filter.trim() !== '' && Boolean(db.tables?.some((t) => t.name.toLowerCase().includes(filter.trim().toLowerCase()))));
          const tables = db.tables?.filter((t) => !filter.trim() || db.name.toLowerCase().includes(filter.trim().toLowerCase()) || t.name.toLowerCase().includes(filter.trim().toLowerCase()));
          return (
            <div key={db.name} data-sqldb={db.name}>
              <div
                className="group flex items-center gap-1.5 px-2 h-7 cursor-pointer hover:bg-neutral-800/60 transition-colors"
                onClick={() => toggle(db)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    entries: [
                      { kind: 'action', label: 'Neue Abfrage', icon: FilePlus2, onSelect: () => onQuery(db.name) },
                      { kind: 'action', label: 'Tabellen aktualisieren', icon: RefreshCw, onSelect: () => void loadTables(db.name) },
                      ...(system ? [] : [{ kind: 'separator' as const }, { kind: 'action' as const, label: 'Datenbank löschen', icon: Trash2, danger: true, onSelect: () => void dropDb(db.name) }]),
                    ],
                  });
                }}
              >
                <ChevronRight className={`size-3.5 text-neutral-500 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
                {db.loading ? <Loader2 className="size-4 animate-spin text-primary" /> : <Database className={`size-4 ${system ? 'text-neutral-600' : 'text-primary'}`} />}
                <span className={`flex-1 truncate text-[13px] ${system ? 'text-neutral-500' : 'text-neutral-200'}`} data-notranslate>{db.name}</span>
                {db.tables && <span className="text-[11px] text-neutral-600">{db.tables.length}</span>}
              </div>
              {open && (
                <div className="animate-fade-in">
                  {db.error && <p className="pl-9 pr-2 py-1 text-xs text-red-300">{db.error}</p>}
                  {tables?.length === 0 && !db.loading && <p className="pl-9 py-1 text-xs text-neutral-600">Keine Tabellen</p>}
                  {tables?.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center gap-1.5 pl-8 pr-2 h-7 cursor-pointer hover:bg-neutral-800/60 transition-colors"
                      onClick={() => onOpenTable(db.name, t.name)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({
                          x: e.clientX,
                          y: e.clientY,
                          entries: [
                            { kind: 'action', label: 'Daten öffnen', icon: Table2, onSelect: () => onOpenTable(db.name, t.name) },
                            { kind: 'action', label: 'SELECT-Abfrage', icon: TextCursorInput, onSelect: () => onQuery(db.name, `SELECT * FROM ${ident(t.name)} LIMIT 100;`) },
                            ...(t.view ? [] : [{ kind: 'separator' as const }, { kind: 'action' as const, label: 'Tabelle leeren', icon: Eraser, danger: true, onSelect: () => void tableAction(db.name, t.name, 'truncate') }]),
                            { kind: 'action', label: t.view ? 'Ansicht löschen' : 'Tabelle löschen', icon: Trash2, danger: true, onSelect: () => void tableAction(db.name, t.name, 'drop') },
                          ],
                        });
                      }}
                      data-sqltable={`${db.name}.${t.name}`}
                    >
                      {t.view ? <Eye className="size-3.5 text-violet-400" /> : <Table2 className="size-3.5 text-sky-400" />}
                      <span className="flex-1 truncate text-[13px] text-neutral-300" data-notranslate>{t.name}</span>
                      {!t.view && <span className="text-[11px] text-neutral-600">{t.rows >= 1000 ? `${Math.round(t.rows / 100) / 10}k` : t.rows}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
}
