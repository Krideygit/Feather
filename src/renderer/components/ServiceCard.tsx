import { Activity, ExternalLink, FolderOpen, Link, Play, RotateCw, Square, Terminal } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { Service } from '../../shared/types';
import { openServiceDrawer } from '../drawer/ServiceDrawer';
import { formatUptime, useTicker } from '../lib/format';
import { TYPES, isActive, openFolder, openInBrowser, restartService, toggleService } from '../lib/services';
import { StatusBadge } from './Bits';
import { TypeIcon } from './TypeIcon';

const stop = (handler: () => void) => (event: MouseEvent) => {
  event.stopPropagation();
  handler();
};

export function ServiceCard({ service: s }: { service: Service }) {
  useTicker();
  const type = TYPES[s.type];
  const active = isActive(s);
  const web = s.category === 'webserver';

  return (
    <article className="card card-hover p-4 cursor-pointer flex flex-col" onClick={() => openServiceDrawer(s.id)} data-action="svc:open" data-id={s.id}>
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <TypeIcon type={s.type} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-neutral-100 truncate">{s.name}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {type.label} {s.version}
          </p>
        </div>
        <StatusBadge status={s.status} />
      </div>

      <dl className="mt-4 space-y-1.5 text-[13px]">
        <div className="flex items-center gap-2 text-neutral-400">
          <Link className="size-3.5" />
          <span className="font-mono">{s.category === 'database' ? `127.0.0.1:${s.port}` : `localhost:${s.port}`}</span>
        </div>
        {web && (
          <div className="flex items-center gap-2 text-neutral-400 min-w-0">
            <FolderOpen className="size-3.5" />
            <span className="truncate" title={s.folder}>{s.folder}</span>
          </div>
        )}
        {s.status === 'running' && (
          <div className="flex items-center gap-2 text-neutral-500">
            <Activity className="size-3.5" />
            <span>{formatUptime(s.startedAt)}</span>
          </div>
        )}
      </dl>

      {s.status === 'error' && s.error && (
        <p className="mt-3 text-xs text-red-300/90 bg-red-500/10 rounded-lg px-2.5 py-2 line-clamp-3 whitespace-pre-line">{s.error}</p>
      )}

      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-neutral-800">
        <button className={`btn btn-sm ${active ? 'btn-outline' : 'btn-primary'}`} onClick={stop(() => void toggleService(s.id))} disabled={s.status === 'stopping'} data-action="svc:toggle" data-id={s.id}>
          {active ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
          {s.status === 'starting' ? 'Abbrechen' : active ? 'Stoppen' : 'Starten'}
        </button>
        {s.status === 'running' && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={stop(() => void restartService(s.id))} title="Neu starten" aria-label="Neu starten">
            <RotateCw className="size-4" />
          </button>
        )}
        <span className="flex-1" />
        {web && s.status === 'running' && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={stop(() => openInBrowser(s))} title="Im Browser öffnen" aria-label="Im Browser öffnen">
            <ExternalLink className="size-4" />
          </button>
        )}
        {web && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={stop(() => void openFolder(s.folder))} title="Ordner öffnen" aria-label="Ordner öffnen">
            <FolderOpen className="size-4" />
          </button>
        )}
        <button className="btn btn-ghost btn-icon btn-sm" onClick={stop(() => openServiceDrawer(s.id))} title="Details & Logs" aria-label="Details und Logs">
          <Terminal className="size-4" />
        </button>
      </div>
    </article>
  );
}
