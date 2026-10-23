import { History, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { HistoryEntry } from '../../shared/sql';
import { Modal, confirmDialog } from '../components/Layers';
import { toast } from '../components/Toast';
import { clearHistory, formatTime, markUndone, removeHistory } from '../lib/sqlhistory';

const shown = (value: string | null): string => (value === null ? 'NULL' : value.length > 80 ? `${value.slice(0, 80)} …` : value === '' ? '(leer)' : value);

export function HistoryNote({ entries, onPick, limit = 3 }: { entries: HistoryEntry[]; onPick?: (value: string | null) => void; limit?: number }) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-0.5" data-history-note>
      {entries.slice(0, limit).map((e, i) => (
        <p key={e.id} className="text-[11px] leading-snug text-red-400">
          {i === 0 ? 'Vorher: ' : 'Davor: '}
          {onPick ? (
            <button type="button" className="font-semibold underline decoration-dotted underline-offset-2 hover:text-red-300" title="Diesen Wert wieder einsetzen" onClick={() => onPick(e.old)}>
              {shown(e.old)}
            </button>
          ) : (
            <span className="font-semibold">{shown(e.old)}</span>
          )}
          <span className="text-red-400/60"> · {formatTime(e.ts)}</span>
        </p>
      ))}
      {entries.length > limit && <p className="text-[11px] text-red-400/60">{`und ${entries.length - limit} weitere im Verlauf`}</p>}
    </div>
  );
}

const keyText = (key: Record<string, string | null>): string =>
  Object.entries(key)
    .map(([k, v]) => `${k} = ${v === null ? 'NULL' : v}`)
    .join(', ');

interface DialogProps {
  db: string;
  table: string;
  entries: HistoryEntry[];
  scope: { server: string; db: string; table: string };
  currentValue: (entry: HistoryEntry) => Promise<string | null | undefined>;
  revert: (entry: HistoryEntry) => Promise<void>;
  restore: (entry: HistoryEntry) => Promise<void>;
  onChanged: () => void;
  onClose: () => void;
}

export function HistoryDialog({ db, table, entries, scope, currentValue, revert, restore, onChanged, onClose }: DialogProps) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(entry: HistoryEntry): Promise<void> {
    setBusy(entry.id);
    try {
      if (entry.kind === 'update') {
        const now = await currentValue(entry);
        if (now !== undefined && now !== entry.value) {
          const ok = await confirmDialog({ title: 'Wert wurde inzwischen geändert', message: `Aktuell steht „${shown(now ?? null)}“ in der Zelle, nach dieser Änderung stand dort „${shown(entry.value)}“. Trotzdem auf „${shown(entry.old)}“ zurücksetzen?`, confirmLabel: 'Zurücksetzen' });
          if (!ok) return setBusy(null);
        }
        await revert(entry);
        toast('Wert wurde zurückgesetzt.', 'success');
      } else {
        await restore(entry);
        toast('Zeile wurde wiederhergestellt.', 'success');
      }
      await markUndone([entry.id]);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    setBusy(null);
  }

  async function dropEntry(entry: HistoryEntry): Promise<void> {
    await removeHistory([entry.id]);
    onChanged();
  }

  async function dropAll(): Promise<void> {
    const ok = await confirmDialog({ title: 'Verlauf dieser Tabelle löschen?', message: `Alle ${entries.length} Einträge für „${table}“ werden aus Feather entfernt. Die Daten in der Datenbank bleiben unverändert.`, confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    await clearHistory(scope);
    onChanged();
  }

  return (
    <Modal
      title="Änderungsverlauf"
      subtitle={`${db}.${table}`}
      size="max-w-4xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost mr-auto text-neutral-400 hover:text-red-400" disabled={entries.length === 0} onClick={() => void dropAll()} data-action="history-clear">
            <Trash2 className="size-3.5" />
            Verlauf leeren
          </button>
          <button className="btn btn-primary" onClick={onClose}>Schließen</button>
        </>
      }
    >
      {entries.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-500">
          <History className="mx-auto mb-3 size-8 text-neutral-600" />
          Noch keine Änderungen aufgezeichnet. Feather merkt sich, was du in der Tabellenansicht änderst oder löschst.
        </div>
      ) : (
        <div className="space-y-2" data-history-list>
          {entries.map((e) => (
            <div key={e.id} className={`rounded-lg border px-3 py-2.5 ${e.undone ? 'border-neutral-800 opacity-50' : 'border-neutral-800 bg-neutral-900/40'}`} data-history-entry={e.kind}>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span>{formatTime(e.ts)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${e.kind === 'delete' ? 'bg-red-500/15 text-red-300' : 'bg-sky-500/15 text-sky-300'}`}>{e.kind === 'delete' ? 'Gelöscht' : 'Geändert'}</span>
                <span className="font-mono truncate" data-notranslate>{keyText(e.key)}</span>
                <span className="flex-1" />
                {e.undone ? (
                  <span>{e.kind === 'delete' ? 'wiederhergestellt' : 'zurückgesetzt'}</span>
                ) : (
                  <button className="btn btn-outline btn-sm" disabled={busy === e.id} onClick={() => void run(e)} data-action="history-undo">
                    {e.kind === 'delete' ? <RotateCcw className="size-3.5" /> : <Undo2 className="size-3.5" />}
                    {e.kind === 'delete' ? 'Wiederherstellen' : 'Zurücksetzen'}
                  </button>
                )}
                <button className="btn btn-ghost btn-icon btn-sm text-neutral-600 hover:text-red-400" onClick={() => void dropEntry(e)} aria-label="Eintrag entfernen" title="Eintrag entfernen">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {e.kind === 'update' ? (
                <p className="mt-1.5 text-[13px] font-mono" data-notranslate>
                  <span className="text-neutral-400">{e.column}: </span>
                  <span className="text-red-400">{shown(e.old)}</span>
                  <span className="text-neutral-600"> → </span>
                  <span className="text-emerald-400">{shown(e.value)}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] font-mono text-red-300/90 break-all" data-notranslate>
                  {Object.entries(e.row ?? {})
                    .map(([k, v]) => `${k}: ${shown(v)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
