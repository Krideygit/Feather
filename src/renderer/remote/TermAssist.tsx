import { Lightbulb, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { TermItem } from '../../shared/termcomplete';
import { terminalFor } from '../lib/remote';
import { applyHint, dismissHint, useHelp } from '../lib/termhelp';

const TAG: Record<TermItem['kind'], { tag: string; tone: string }> = {
  history: { tag: '↺', tone: 'bg-neutral-600/40 text-neutral-200' },
  command: { tag: '$', tone: 'bg-primary/20 text-primary' },
  subcommand: { tag: '›', tone: 'bg-violet-500/20 text-violet-300' },
  option: { tag: '-', tone: 'bg-amber-500/20 text-amber-300' },
  value: { tag: '=', tone: 'bg-emerald-500/20 text-emerald-300' },
};

export function TermAssist({ sid, visible, outer }: { sid: string; visible: boolean; outer: RefObject<HTMLDivElement | null> }) {
  const help = useHelp(sid);
  if (!visible) return null;

  const container = outer.current;
  const screen = terminalFor(sid).term.element?.querySelector<HTMLElement>('.xterm-screen');
  let popup = null;
  if (help.items.length > 0 && container && screen) {
    const box = container.getBoundingClientRect();
    const rect = screen.getBoundingClientRect();
    const height = help.items.length * 28 + 30;
    const left = Math.max(8, Math.min(rect.left - box.left + help.x, box.width - 380));
    const below = rect.top - box.top + help.y;
    const flip = below + height > box.height - 8;
    const top = flip ? rect.top - box.top + help.y - help.cellH - height - 2 : below + 2;
    popup = (
      <div className="absolute z-30 w-[370px] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900/95 shadow-2xl backdrop-blur animate-fade-in" style={{ left, top }} onMouseDown={(e) => e.preventDefault()} data-term-suggest>
        <div className="py-1">
          {help.items.map((item, i) => (
            <div key={`${item.kind}:${item.label}`} className={`flex items-center gap-2 px-2 h-7 text-[13px] ${i === help.selected ? 'bg-primary/15 text-neutral-50' : 'text-neutral-300'}`} data-term-item={item.label}>
              <span className={`grid size-5 shrink-0 place-items-center rounded text-[11px] font-semibold ${TAG[item.kind].tone}`}>{TAG[item.kind].tag}</span>
              <span className="min-w-0 flex-1 truncate font-mono" data-notranslate>{item.label}</span>
              {item.detail && <span className="max-w-[45%] shrink-0 truncate text-[11px] text-neutral-500">{item.detail}</span>}
            </div>
          ))}
        </div>
        <div className="border-t border-neutral-800 px-2 py-1 text-[10px] text-neutral-500">Tab übernehmen · Alt+↑↓ wählen · Esc schließen · Strg+Leertaste öffnet</div>
      </div>
    );
  }

  return (
    <>
      {popup}
      {help.hint && (
        <div className="absolute bottom-4 right-4 z-30 w-[360px] max-w-[calc(100%-2rem)] animate-rise rounded-xl border border-amber-500/30 bg-neutral-900/95 p-3.5 shadow-2xl backdrop-blur" data-term-hint={help.hint.id}>
          <div className="flex items-start gap-2.5">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">{help.hint.title}</p>
              <p className="mt-0.5 text-xs text-neutral-400">{help.hint.text}</p>
              {help.hint.command && <code className="mt-2 block truncate rounded-md bg-black/40 px-2 py-1 text-xs text-sky-200" data-notranslate>{help.hint.command}</code>}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm -mr-1 -mt-1" onClick={() => dismissHint(sid)} aria-label="Hinweis schließen">
              <X className="size-3.5" />
            </button>
          </div>
          {help.hint.command && (
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => dismissHint(sid)}>Nein danke</button>
              <button className="btn btn-primary btn-sm" onClick={() => applyHint(sid)} data-action="hint-apply">Ins Terminal einfügen</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
