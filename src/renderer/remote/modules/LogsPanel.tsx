import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LogKind, ModuleId } from '../../../shared/modules';
import { callModule } from '../../lib/modules';
import { ErrorBox, useAsync } from './ui';

const KINDS: { id: LogKind; label: string }[] = [
  { id: 'service', label: 'Dienst' },
  { id: 'error', label: 'Fehler' },
  { id: 'access', label: 'Zugriffe' },
];

export function LogsPanel({ sid, module }: { sid: string; module: ModuleId }) {
  const [kind, setKind] = useState<LogKind>('service');
  const kinds = module === 'mariadb' ? KINDS.slice(0, 2) : KINDS;
  const { data, loading, error, reload } = useAsync(() => callModule<string>(sid, 'mod.logs', { module, kind, lines: 300 }), [sid, module, kind]);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [data]);

  return (
    <div className="flex flex-col flex-1 min-h-0 p-6 gap-3 animate-fade-in">
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex rounded-lg bg-neutral-950/60 border border-neutral-800 p-0.5">
          {kinds.map((k) => (
            <button key={k.id} className={`px-3 h-7 rounded-md text-[13px] font-medium transition-colors ${kind === k.id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-100'}`} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button className="btn btn-outline btn-sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <pre ref={box} className="flex-1 min-h-[200px] overflow-auto rounded-lg bg-black/50 border border-neutral-800 p-3 font-mono text-[12px] leading-5 text-neutral-300 whitespace-pre-wrap break-all select-text" data-logs>
        {loading && !data ? 'Wird geladen …' : data || 'Keine Einträge.'}
      </pre>
    </div>
  );
}
