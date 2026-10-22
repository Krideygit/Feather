import { useState } from 'react';
import type { RemoteEntry } from '../../shared/remote';
import { Modal, openLayer } from '../components/Layers';
import { attemptRemote, callRemote } from '../lib/remote';
import { modeText } from './fileutils';

const GROUPS = ['Besitzer', 'Gruppe', 'Andere'];
const BITS = ['Lesen', 'Schreiben', 'Ausführen'];

function ChmodDialog({ sid, entry, onClose, onDone }: { sid: string; entry: RemoteEntry; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState((entry.mode ?? 0o644) & 0o777);
  const [busy, setBusy] = useState(false);
  const toggle = (group: number, bit: number): void => setMode((m) => m ^ (1 << (8 - (group * 3 + bit))));

  async function apply(): Promise<void> {
    setBusy(true);
    const ok = await attemptRemote(callRemote('fs.chmod', { sid, path: entry.path, mode }).then(() => true));
    setBusy(false);
    if (!ok) return;
    onDone();
    onClose();
  }

  return (
    <Modal
      title="Berechtigungen"
      subtitle={entry.path}
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void apply()} data-action="chmod-apply">Übernehmen</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[90px_repeat(3,1fr)] gap-y-2 items-center text-sm">
          <span />
          {BITS.map((b) => (
            <span key={b} className="text-xs text-neutral-500 text-center">{b}</span>
          ))}
          {GROUPS.map((g, gi) => (
            <div key={g} className="contents">
              <span className="text-neutral-300">{g}</span>
              {BITS.map((b, bi) => (
                <label key={b} className="grid place-items-center cursor-pointer">
                  <input type="checkbox" className="size-4 accent-sky-500" checked={Boolean(mode & (1 << (8 - (gi * 3 + bi))))} onChange={() => toggle(gi, bi)} aria-label={`${g} ${b}`} />
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            className="input font-mono w-24 text-center"
            value={mode.toString(8).padStart(3, '0')}
            maxLength={3}
            aria-label="Oktalwert"
            onChange={(e) => /^[0-7]{0,3}$/.test(e.target.value) && setMode(parseInt(e.target.value || '0', 8))}
          />
          <span className="font-mono text-sm text-neutral-400">{modeText(mode, entry.type === 'dir' ? 'dir' : 'file')}</span>
        </div>
      </div>
    </Modal>
  );
}

export function openChmod(sid: string, entry: RemoteEntry, onDone: () => void): void {
  openLayer((close) => <ChmodDialog sid={sid} entry={entry} onClose={close} onDone={onDone} />);
}
