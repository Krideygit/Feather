import { Cable, CircleAlert, Database, Loader2, Plus, RotateCw, Server, Table2, Unplug, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rowsOf, runSql, useSqlSources } from '../lib/sqlsource';
import { QueryTab } from './QueryTab';
import { TableTab } from './TableTab';
import { Tree } from './Tree';

interface Tab {
  id: string;
  kind: 'query' | 'table';
  title: string;
  db: string;
  table: string;
  sql: string;
}

type Status = { state: 'connecting' } | { state: 'ready'; version: string } | { state: 'error'; message: string };

const ICON = { local: Database, ssh: Server, direct: Cable } as const;

interface Props {
  sourceId: string;
  onExit?: () => void;
  exitLabel?: string;
  compact?: boolean;
}

export function Workbench({ sourceId, onExit, exitLabel = 'Trennen', compact }: Props) {
  const sources = useSqlSources();
  const source = sources.find((s) => s.id === sourceId);
  const [status, setStatus] = useState<Status>({ state: 'connecting' });
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState('');
  const [reload, setReload] = useState(0);
  const counter = useRef(0);
  const attempt = useRef(0);

  const connect = useCallback(async (): Promise<void> => {
    const mine = ++attempt.current;
    setStatus({ state: 'connecting' });
    setTabs([]);
    setActive('');
    try {
      const rows = rowsOf(await runSql(sourceId, 'SELECT VERSION()'));
      if (mine !== attempt.current) return;
      setStatus({ state: 'ready', version: rows[0]?.[0] ?? '' });
      setReload((n) => n + 1);
    } catch (err) {
      if (mine !== attempt.current) return;
      setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [sourceId]);

  useEffect(() => {
    void connect();
    return () => {
      attempt.current += 1;
    };
  }, [connect]);

  const addTab = useCallback((tab: Omit<Tab, 'id'>): void => {
    counter.current += 1;
    const id = `t${Date.now().toString(36)}${counter.current}`;
    setTabs((list) => [...list, { ...tab, id }]);
    setActive(id);
  }, []);

  const openTable = useCallback(
    (db: string, table: string): void => {
      const existing = tabs.find((t) => t.kind === 'table' && t.db === db && t.table === table);
      if (existing) return setActive(existing.id);
      addTab({ kind: 'table', title: table, db, table, sql: '' });
    },
    [tabs, addTab],
  );

  const newQuery = useCallback(
    (db: string, sql = ''): void => addTab({ kind: 'query', title: `Abfrage ${tabs.filter((t) => t.kind === 'query').length + 1}`, db, table: '', sql }),
    [tabs, addTab],
  );

  function closeTab(id: string): void {
    setTabs((list) => {
      const index = list.findIndex((t) => t.id === id);
      const next = list.filter((t) => t.id !== id);
      if (active === id) setActive(next[Math.min(index, next.length - 1)]?.id ?? '');
      return next;
    });
  }

  const dropped = useCallback((db: string, table?: string): void => {
    setTabs((list) => list.filter((t) => !(t.kind === 'table' && t.db === db && (!table || t.table === table))));
  }, []);

  if (status.state !== 'ready') {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in" data-sql-status={status.state}>
        {status.state === 'connecting' ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-neutral-400">Verbindung zu „{source?.label ?? 'Datenbank'}“ wird aufgebaut …</p>
          </>
        ) : (
          <>
            <div className="flex max-w-xl items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-left text-sm text-red-200">
              <CircleAlert className="size-4 mt-0.5 shrink-0" />
              <span className="flex-1"><span className="font-medium">Verbindung zu „{source?.label ?? 'Datenbank'}“ fehlgeschlagen.</span> {status.message}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline btn-sm" onClick={() => void connect()} data-action="sql-retry">
                <RotateCw className="size-3.5" />
                Erneut versuchen
              </button>
              {onExit && (
                <button className="btn btn-ghost btn-sm" onClick={onExit}>
                  {exitLabel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const Icon = ICON[source?.kind ?? 'local'];

  return (
    <div className="flex flex-1 min-h-0 flex-col" data-sql-workbench>
      <div className={`shrink-0 flex items-center gap-3 px-4 border-b border-neutral-800 ${compact ? 'h-11' : 'h-12'}`}>
        <div className="size-7 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-100 truncate" data-notranslate>{source?.label ?? 'Verbindung'}</p>
          <p className="text-[11px] text-neutral-500 font-mono truncate" data-notranslate>{source?.detail} · {status.version}</p>
        </div>
        <span className="flex-1" />
        <button className="btn btn-outline btn-sm" onClick={() => newQuery('')} data-action="sql-new-query">
          <Plus className="size-3.5" />
          Neue Abfrage
        </button>
        {onExit && (
          <button className="btn btn-ghost btn-sm" onClick={onExit} data-action="sql-disconnect">
            <Unplug className="size-3.5" />
            {exitLabel}
          </button>
        )}
      </div>
      <div className="flex flex-1 min-h-0">
        <aside className={`${compact ? 'w-56' : 'w-72'} shrink-0 border-r border-neutral-800 bg-neutral-900/30`}>
          <Tree source={sourceId} onOpenTable={openTable} onQuery={newQuery} onDropped={dropped} reloadKey={reload} />
        </aside>
        <div className="flex flex-1 min-w-0 flex-col">
          <div role="tablist" className="shrink-0 flex items-stretch overflow-x-auto border-b border-neutral-800 bg-neutral-900/40 px-2">
            {tabs.map((t) => (
              <div
                key={t.id}
                role="tab"
                aria-selected={active === t.id}
                onClick={() => setActive(t.id)}
                className={`group flex items-center gap-2 h-10 pl-3 pr-1.5 shrink-0 max-w-[220px] cursor-pointer border-b-2 text-[13px] font-medium transition-[background-color,color,border-color] duration-150 ${active === t.id ? 'bg-neutral-800/50 text-neutral-50 border-primary' : 'border-transparent text-neutral-400 hover:bg-neutral-800/30 hover:text-neutral-100'}`}
                data-tab={t.title}
              >
                {t.kind === 'table' ? <Table2 className="size-3.5 text-sky-400" /> : <Database className="size-3.5 text-primary" />}
                <span className="truncate" data-notranslate>{t.title}</span>
                <button className="grid place-items-center size-5 rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100 transition-colors" aria-label={`${t.title} schließen`} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          {tabs.length === 0 && (
            <div className="flex-1 grid place-items-center text-center px-6 animate-fade-in">
              <div>
                <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto">
                  <Table2 className="size-7" />
                </div>
                <p className="mt-4 text-sm font-medium text-neutral-100">Wähle links eine Tabelle oder starte eine Abfrage</p>
                <p className="mt-1 text-sm text-neutral-500">Ein Doppelklick auf eine Zelle ändert den Wert, wenn die Tabelle einen Primärschlüssel hat.</p>
              </div>
            </div>
          )}
          {tabs.map((t) => (
            <div key={t.id} className={active === t.id ? 'flex flex-1 min-h-0 flex-col animate-fade-in' : 'hidden'}>
              {t.kind === 'table' ? <TableTab source={sourceId} db={t.db} table={t.table} /> : <QueryTab source={sourceId} tabId={`${sourceId}.${t.id}`} database={t.db} initial={t.sql} visible={active === t.id} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
