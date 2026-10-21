import { CircleAlert, Play } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { Service, SqlOutput } from '../../shared/types';
import { Notice } from '../components/Bits';
import { toast } from '../components/Toast';
import { call } from '../lib/api';
import { useDatabases } from './useDatabases';

const storageKey = (id: string): string => `feather.sql.${id}`;

function loadText(id: string): string {
  try {
    return localStorage.getItem(storageKey(id)) ?? '';
  } catch {
    return '';
  }
}

const oneLine = (sql: string): string => sql.replace(/\s+/g, ' ').slice(0, 90);

export function SqlTab({ service }: { service: Service }) {
  const running = service.status === 'running';
  const { dbs } = useDatabases(service.id, running);
  const [text, setText] = useState(() => loadText(service.id));
  const [database, setDatabase] = useState('');
  const [output, setOutput] = useState<SqlOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  function edit(value: string): void {
    setText(value);
    try {
      localStorage.setItem(storageKey(service.id), value);
    } catch {
    }
  }

  async function run(): Promise<void> {
    if (busy) return;
    const ta = editor.current;
    const sql = ta && ta.selectionEnd > ta.selectionStart ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : text;
    if (!sql.trim()) return void toast('Schreibe zuerst einen SQL-Befehl.', 'error');
    setBusy(true);
    try {
      setOutput(await call<SqlOutput>('db.query', { id: service.id, database: database || undefined, sql }));
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select className="input w-auto! min-w-44" value={database} onChange={(e) => setDatabase(e.target.value)} title="Standard-Datenbank">
          <option value="">Keine Datenbank gewählt</option>
          {(dbs ?? []).map((d) => (
            <option key={d.name} value={d.name}>{d.name}</option>
          ))}
        </select>
        <span className="flex-1" />
        <span className="text-xs text-neutral-500 hidden sm:inline">Strg + Enter</span>
        <button className="btn btn-primary" disabled={busy || !running} onClick={() => void run()} data-action="sqlRun">
          <Play className="size-3.5" />
          {busy ? 'Läuft …' : 'Ausführen'}
        </button>
      </div>
      <textarea
        ref={editor}
        className="input h-44! py-2.5 font-mono text-[13px] leading-5 resize-y"
        value={text}
        spellCheck={false}
        placeholder={'SELECT * FROM tabelle;\nMehrere Befehle mit ; trennen. Markierter Text wird einzeln ausgeführt.'}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={onKeyDown}
        data-bind="sqlText"
      />
      {!running && <Notice>Starte den Service, um SQL auszuführen.</Notice>}
      {output && <Results output={output} />}
    </div>
  );
}

function Results({ output }: { output: SqlOutput }) {
  return (
    <div className="space-y-3">
      {output.results.map((r, i) =>
        r.type === 'rows' ? (
          <div key={i}>
            <div className="flex items-center justify-between gap-3 mb-1.5 text-xs text-neutral-500">
              <span className="truncate font-mono" title={r.sql}>{oneLine(r.sql)}</span>
              <span className="shrink-0">
                {r.rows.length} {r.rows.length === 1 ? 'Zeile' : 'Zeilen'}
                {r.truncated ? ' (erste 1000)' : ''} · {r.ms} ms
              </span>
            </div>
            {r.columns.length > 0 && (
              <div className="card overflow-auto max-h-[340px]">
                <table className="min-w-full text-[12px] font-mono">
                  <thead className="sticky top-0 bg-neutral-900">
                    <tr>
                      {r.columns.map((c, ci) => (
                        <th key={ci} className="px-3 py-2 text-left font-medium text-neutral-400 border-b border-neutral-800 whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, ri) => (
                      <tr key={ri} className="odd:bg-neutral-800/20">
                        {row.map((v, ci) =>
                          v === null ? (
                            <td key={ci} className="px-3 py-1.5 text-neutral-600 italic">NULL</td>
                          ) : (
                            <td key={ci} className="px-3 py-1.5 text-neutral-200 whitespace-nowrap max-w-[320px] truncate" title={v}>{v}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
            <span className="truncate font-mono text-emerald-200/90" title={r.sql}>{oneLine(r.sql)}</span>
            <span className="shrink-0 text-emerald-300">
              OK · {r.affected} {r.affected === 1 ? 'Zeile betroffen' : 'Zeilen betroffen'} · {r.ms} ms
            </span>
          </div>
        ),
      )}
      {output.error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
          <p className="flex items-start gap-2">
            <CircleAlert className="size-4 mt-0.5" />
            <span className="whitespace-pre-wrap break-words">{output.error.message}</span>
          </p>
          {output.error.sql && <p className="mt-1.5 ml-6 text-xs font-mono text-red-300/70 truncate" title={output.error.sql}>{oneLine(output.error.sql)}</p>}
        </div>
      )}
    </div>
  );
}
