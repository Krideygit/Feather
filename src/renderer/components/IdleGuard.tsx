import { useEffect, useRef, useState } from 'react';
import { isIdle, setIdle, useIdle } from '../lib/idle';
import { getRemote, terminalFor } from '../lib/remote';
import { useAppState } from '../lib/store';

const ACTIVITY = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'pointerdown'] as const;
const CHECK_MS = 5000;

function Robot() {
  return (
    <svg viewBox="0 0 120 120" className="size-24" aria-hidden>
      <g className="idle-breathe">
        <line x1="60" y1="18" x2="60" y2="30" stroke="var(--color-neutral-500)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="14" r="5" fill="var(--color-primary)" className="idle-blink" />
        <rect x="30" y="30" width="60" height="44" rx="14" fill="var(--color-neutral-800)" stroke="var(--color-neutral-600)" strokeWidth="2" />
        <path d="M44 52 q6 6 12 0" fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
        <path d="M64 52 q6 6 12 0" fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
        <path d="M54 63 h12" stroke="var(--color-neutral-500)" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="38" y="76" width="44" height="28" rx="10" fill="var(--color-neutral-800)" stroke="var(--color-neutral-600)" strokeWidth="2" />
        <circle cx="60" cy="90" r="4" fill="var(--color-primary)" opacity="0.7" />
        <rect x="22" y="48" width="8" height="16" rx="4" fill="var(--color-neutral-700)" />
        <rect x="90" y="48" width="8" height="16" rx="4" fill="var(--color-neutral-700)" />
      </g>
    </svg>
  );
}

export function IdleGuard() {
  const config = useAppState((s) => s.settings.idle);
  const idle = useIdle();
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    if (!config.enabled) {
      setIdle(false);
      return;
    }
    last.current = Date.now();
    const touch = (): void => {
      last.current = Date.now();
      if (isIdle()) setIdle(false);
    };
    for (const name of ACTIVITY) window.addEventListener(name, touch, { passive: true, capture: true });
    const timer = setInterval(() => {
      if (!isIdle() && Date.now() - last.current >= config.minutes * 60_000) setIdle(true);
    }, CHECK_MS);
    return () => {
      for (const name of ACTIVITY) window.removeEventListener(name, touch, { capture: true });
      clearInterval(timer);
      setIdle(false);
    };
  }, [config.enabled, config.minutes]);

  useEffect(() => {
    for (const session of getRemote().sessions) {
      try {
        terminalFor(session.sid).term.options.cursorBlink = !idle;
      } catch {
        continue;
      }
    }
    if (idle) {
      setLeaving(false);
      setShown(true);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const timer = setTimeout(() => {
      setShown(false);
      setLeaving(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [idle]);

  if (!shown) return null;

  return (
    <div className={`idle-robot pointer-events-none fixed bottom-10 right-8 z-[200] flex flex-col items-center ${leaving ? 'idle-leave' : 'idle-enter'}`} data-idle-robot={leaving ? 'leaving' : 'sleeping'}>
      <div className="relative">
        <span className="idle-z idle-z1 absolute -top-2 left-16 font-semibold text-primary">z</span>
        <span className="idle-z idle-z2 absolute -top-2 left-16 font-semibold text-primary">z</span>
        <span className="idle-z idle-z3 absolute -top-2 left-16 font-semibold text-primary">z</span>
        <Robot />
      </div>
      <p className="mt-1 rounded-full border border-neutral-800 bg-neutral-900/90 px-3 py-1 text-[11px] text-neutral-400">Feather ruht, bis du wieder etwas machst</p>
    </div>
  );
}
