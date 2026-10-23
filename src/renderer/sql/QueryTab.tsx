import { Loader2, Play } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SqlOutput } from '../../shared/types';
import { toast } from '../components/Toast';
import { Results } from '../drawer/Sql';
import { rowsOf, runSql } from '../lib/sqlsource';

const key = (id: string): string => `feather.sqlpage.${id}`;

function loadText(id: string, initial: string): string {
  if (initial) return initial;
  try {
    return localStorage.getItem(key(id)) ?? '';
  } catch {
    return '';
  }
}

export function QueryTab({ source, tabId, database, initial, visible }: { source: string; tabId: string; database: string; initial: string; visible: boolean }) {
  const [text, setText] = useState(() => loadText(tabId, initial));
  const [db, setDb] = useState(database);
  const [dbs, setDbs] = useState<string[]>([]);
  const [output, setOutput] = useState<SqlOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    runSql(source, 'SHOW DATABASES').then(
      (out) => alive && setDbs(rowsOf(out).map((r) => r[0] ?? '')),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [source]);

  useEffect(() => {
    if (visible) editor.current?.focus();
  }, [visible]);

  function edit(value: string): void {
    setText(value);
    try {
      localStorage.setItem(key(tabId), value);
    } catch {
      return;
    }
  }

  async function run(): Promise<void> {
    if (busy) return;
    const ta = editor.current;
    const sql = ta && ta.selectionEnd > ta.selectionStart ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : text;
    if (!sql.trim()) return void toast('Schreibe zuerst einen SQL-Befehl.', 'error');
    setBusy(true);
    try {
      setOutput(await runSql(source, sql, db));
    } catch (err) {
      setOutput({ results: [], error: { message: err instanceof Error ? err.message : String(err) } });
    }
    setBusy(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    const ta = event.currentTarget;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void run();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
      edit(ta.value);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-3" data-query-tab={tabId}>
      <div className="flex items-center gap-2 shrink-0">
        <select className="input w-auto! min-w-44" value={db} onChange={(e) => setDb(e.target.value)} title="Standard-Datenbank">
          <option value="">Keine Datenbank gewählt</option>
          {dbs.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <span className="flex-1" />
        <span className="text-xs text-neutral-500 hidden sm:inline">Strg + Enter</span>
        <button className="btn btn-primary" disabled={busy} onClick={() => void run()} data-action="query-run">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {busy ? 'Läuft …' : 'Ausführen'}
        </button>
      </div>
      <textarea
        ref={editor}
        className="input h-44! py-2.5 font-mono text-[13px] leading-5 resize-y shrink-0"
        value={text}
        spellCheck={false}
        placeholder={'SELECT * FROM tabelle;\nMehrere Befehle mit ; trennen. Markierter Text wird einzeln ausgeführt.'}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={onKeyDown}
        data-bind="query-text"
      />
      <div className="flex-1 min-h-0 overflow-y-auto">{output && <Results output={output} />}</div>
    </div>
  );
}
