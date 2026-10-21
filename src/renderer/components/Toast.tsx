import { CircleAlert, Check, Info } from 'lucide-react';
import { useSyncExternalStore } from 'react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: Kind;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const publish = (next: ToastItem[]): void => {
  items = next;
  listeners.forEach((l) => l());
};

export function toast(message: string, kind: Kind = 'info'): void {
  const id = nextId++;
  publish([...items, { id, message, kind }]);
  setTimeout(() => publish(items.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 3500);
}

const COLORS: Record<Kind, string> = {
  success: 'border-emerald-500/30 text-emerald-300',
  error: 'border-red-500/40 text-red-300',
  info: 'border-neutral-700 text-neutral-200',
};

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => items);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-sm flex items-start gap-2.5 rounded-xl border bg-neutral-900 px-3.5 py-3 text-sm shadow-xl animate-toast ${COLORS[t.kind]}`}>
          {t.kind === 'success' ? <Check className="size-4 mt-0.5" /> : t.kind === 'error' ? <CircleAlert className="size-4 mt-0.5" /> : <Info className="size-4 mt-0.5" />}
          <span className="whitespace-pre-line">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
