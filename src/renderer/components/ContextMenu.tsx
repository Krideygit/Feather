import { Check, Slash, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface MenuAction {
  kind: 'action';
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  onSelect: () => void;
}

export interface MenuSwatches {
  kind: 'swatches';
  label: string;
  colors: { value: string; label: string }[];
  current: string | undefined;
  onPick: (value: string | undefined) => void;
}

export type MenuEntry = MenuAction | MenuSwatches | { kind: 'separator' };

interface Props {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}

const MARGIN = 8;

export function ContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPlace({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
      ready: true,
    });
    el.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const away = (event: Event): void => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  function navigate(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  const choose = (run: () => void): void => {
    onClose();
    run();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onKeyDown={navigate}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: place.left, top: place.top, visibility: place.ready ? 'visible' : 'hidden' }}
      className="fixed z-[70] min-w-[220px] origin-top-left animate-menu-in rounded-xl border border-neutral-700 bg-neutral-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-md"
    >
      {entries.map((entry, i) => {
        if (entry.kind === 'separator') return <div key={i} className="my-1.5 h-px bg-neutral-800" />;
        if (entry.kind === 'swatches') {
          return (
            <div key={i} className="px-2 py-1.5">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">{entry.label}</p>
              <div className="flex items-center gap-1.5">
                <button
                  role="menuitem"
                  title="Standardfarbe"
                  aria-label="Standardfarbe"
                  className="size-6 rounded-full border border-neutral-600 text-neutral-400 grid place-items-center transition-transform duration-150 hover:scale-110 hover:text-neutral-100"
                  onClick={() => choose(() => entry.onPick(undefined))}
                >
                  {entry.current === undefined ? <Check className="size-3.5" /> : <Slash className="size-3" />}
                </button>
                {entry.colors.map((c) => (
                  <button
                    key={c.value}
                    role="menuitem"
                    title={c.label}
                    aria-label={c.label}
                    style={{ background: c.value }}
                    className="size-6 rounded-full grid place-items-center text-white transition-transform duration-150 hover:scale-110"
                    onClick={() => choose(() => entry.onPick(c.value))}
                  >
                    {entry.current === c.value && <Check className="size-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        const Icon = entry.icon;
        return (
          <button
            key={i}
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => choose(entry.onSelect)}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-left text-[13px] transition-colors disabled:opacity-40 disabled:pointer-events-none ${
              entry.danger ? 'text-red-400 hover:bg-red-500/10 focus-visible:bg-red-500/10' : 'text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800'
            } outline-none`}
          >
            {Icon && <Icon className="size-4 opacity-80" />}
            <span className="flex-1">{entry.label}</span>
            {entry.hint && <span className="text-[11px] text-neutral-500">{entry.hint}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
