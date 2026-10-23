import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { answerSaveeye, useSaveeye } from '../lib/saveeye';
import { useAppState } from '../lib/store';

export function SaveeyeGuard() {
  const config = useAppState((s) => s.settings.saveeye);
  const { sources, answered, unfocused, test } = useSaveeye();
  if (!config.enabled && !test) return null;

  const capturing = sources.length > 0;
  const ask = capturing && answered === null && (config.mode === 'ask' || test);
  const blur = ask || (config.blurOnBlur && unfocused && !test);

  return (
    <>
      {blur && (
        <div
          className="fixed inset-0 z-[300] grid place-items-center bg-black/55 backdrop-blur-[28px] backdrop-saturate-50 animate-fade-in"
          role={ask ? 'alertdialog' : undefined}
          aria-label="Feather Saveeye"
          data-saveeye={ask ? 'ask' : 'blur'}
        >
          {ask ? (
            <div className="w-[min(440px,calc(100vw-48px))] rounded-2xl border border-neutral-700 bg-neutral-900/95 p-6 shadow-2xl animate-pop">
              <div className="size-12 rounded-xl bg-primary/15 text-primary grid place-items-center">
                <EyeOff className="size-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-neutral-50">Du hast Feather Saveeye aktiv</h2>
              <p className="mt-1.5 text-sm text-neutral-400">
                {test ? 'Das ist ein Test. ' : `Eine Bildschirmaufnahme wurde erkannt (${sources.join(', ')}). `}
                Willst du, dass andere dein Feather sehen?
              </p>
              <div className="mt-6 flex gap-3">
                <button className="btn btn-outline flex-1" onClick={() => answerSaveeye(true)} data-action="saveeye-yes">
                  <Eye className="size-4" />
                  Ja
                </button>
                <button className="btn btn-primary flex-1" onClick={() => answerSaveeye(false)} data-action="saveeye-no" autoFocus>
                  <EyeOff className="size-4" />
                  Nein
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-300 select-none">Feather ist unscharf, solange das Fenster nicht aktiv ist.</p>
          )}
        </div>
      )}
      {capturing && answered !== null && (
        <div
          className={`fixed bottom-4 left-4 z-[250] inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg animate-rise ${answered === 'deny' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}
          data-saveeye-status={answered}
        >
          {answered === 'deny' ? <ShieldCheck className="size-3.5" /> : <Eye className="size-3.5" />}
          {answered === 'deny' ? 'Saveeye verbirgt dein Feather' : 'Dein Feather ist für die Aufnahme sichtbar'}
        </div>
      )}
    </>
  );
}
