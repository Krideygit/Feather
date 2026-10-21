import { Eraser } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { attempt, call } from '../lib/api';
import { useBus } from '../lib/store';

const MAX_LINES = 1000;

function lineClass(line: string): string {
  if (line.startsWith('[feather]')) return 'text-primary';
  if (/\b(error|fatal|emerg|crit|alert)\b/i.test(line)) return 'text-red-300';
  if (/\b(warn|warning)\b/i.test(line)) return 'text-amber-300';
  return 'text-neutral-300';
}

export function LogsTab({ id, active }: { id: string; active: boolean }) {
  const [lines, setLines] = useState<string[]>([]);
  const pending = useRef<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void attempt(call<string[]>('service.logs', { id, lines: MAX_LINES })).then((initial) => {
      if (!cancelled) setLines((current) => [...(initial ?? []), ...current].slice(-MAX_LINES));
    });
    const timer = setInterval(() => {
      if (!pending.current.length) return;
      const batch = pending.current;
      pending.current = [];
      setLines((current) => [...current, ...batch].slice(-MAX_LINES));
    }, 120);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  useBus('log', (e) => {
    if (e.id === id) pending.current.push(e.line);
  });

  useLayoutEffect(() => {
    const el = box.current;
    if (el && (stick.current || active)) el.scrollTop = el.scrollHeight;
  }, [lines, active]);

  return (
    <>
      <div className="flex items-center justify-between px-5 py-2.5 shrink-0">
        <span className="text-xs text-neutral-500">Live-Ausgabe · letzte {MAX_LINES} Zeilen</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            pending.current = [];
            setLines([]);
            void attempt(call('service.clearLogs', { id }));
          }}
        >
          <Eraser className="size-3.5" />
          Leeren
        </button>
      </div>
      <div
        ref={box}
        className="flex-1 min-h-0 mx-5 mb-5 rounded-lg bg-black/40 border border-neutral-800 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        <pre className="p-3 text-[12px] leading-5 font-mono whitespace-pre-wrap break-all">
          {lines.length === 0 ? (
            <span className="text-neutral-600">Noch keine Ausgabe. Starte den Service, um Logs zu sehen.</span>
          ) : (
            lines.map((line, i) => (
              <span key={i} className={lineClass(line)}>{`${line}\n`}</span>
            ))
          )}
        </pre>
      </div>
    </>
  );
}
