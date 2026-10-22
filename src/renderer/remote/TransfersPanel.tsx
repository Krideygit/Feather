import { ArrowDownToLine, ArrowUpFromLine, Check, CircleAlert, X } from 'lucide-react';
import type { Transfer } from '../../shared/remote';
import { callRemote, dismissTransfers, type SessionView } from '../lib/remote';
import { formatBytes } from '../lib/format';

const FINISHED: Transfer['state'][] = ['done', 'error', 'cancelled'];

function Row({ sid, t }: { sid: string; t: Transfer }) {
  const finished = FINISHED.includes(t.state);
  const percent = t.total > 0 ? Math.min(100, (t.done / t.total) * 100) : t.state === 'done' ? 100 : 0;
  const Icon = t.direction === 'up' ? ArrowUpFromLine : ArrowDownToLine;
  const detail =
    t.state === 'error'
      ? t.error ?? 'Fehlgeschlagen'
      : t.state === 'cancelled'
        ? 'Abgebrochen'
        : t.state === 'queued'
          ? 'Wartet …'
          : t.total === 0 && t.state === 'running'
            ? 'Wird vorbereitet …'
            : `${formatBytes(t.done)} von ${formatBytes(t.total)}${t.files > 1 ? ` · ${t.files} Dateien` : ''}`;

  return (
    <div className="animate-rise px-3 py-2" data-transfer={t.name} data-state={t.state}>
      <div className="flex items-center gap-2 text-[13px]">
        <Icon className={`size-3.5 ${t.direction === 'up' ? 'text-sky-400' : 'text-emerald-400'}`} />
        <span className="flex-1 truncate text-neutral-200" title={t.name}>{t.name}</span>
        {t.state === 'done' && <Check className="size-4 text-emerald-400" />}
        {t.state === 'error' && <CircleAlert className="size-4 text-red-400" />}
        {!finished && (
          <button className="grid place-items-center size-5 rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100 transition-colors" aria-label="Übertragung abbrechen" onClick={() => void callRemote('transfer.cancel', { sid, tid: t.tid })}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${t.state === 'error' ? 'bg-red-500' : t.state === 'cancelled' ? 'bg-neutral-600' : t.state === 'done' ? 'bg-emerald-500' : 'bg-primary'} ${t.state === 'running' && t.total === 0 ? 'w-1/3 animate-pulse' : ''}`}
          style={t.state === 'running' && t.total === 0 ? undefined : { width: `${percent}%` }}
        />
      </div>
      <p className={`mt-1 text-[11px] truncate ${t.state === 'error' ? 'text-red-300' : 'text-neutral-500'}`} title={detail}>{detail}</p>
    </div>
  );
}

export function TransfersPanel({ session }: { session: SessionView }) {
  const list = session.transfers;
  if (!list.length) return null;
  const hasFinished = list.some((t) => FINISHED.includes(t.state));
  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/60 animate-rise" data-transfers>
      <div className="flex items-center justify-between px-3 h-8 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        <span>Übertragungen</span>
        {hasFinished && (
          <button className="normal-case tracking-normal text-neutral-500 hover:text-neutral-100 transition-colors" onClick={() => dismissTransfers(session.sid)}>
            Erledigte entfernen
          </button>
        )}
      </div>
      <div className="max-h-44 overflow-y-auto pb-1">
        {[...list].reverse().map((t) => (
          <Row key={t.tid} sid={session.sid} t={t} />
        ))}
      </div>
    </div>
  );
}
