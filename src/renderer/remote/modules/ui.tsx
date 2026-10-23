import { Check, CircleAlert, Copy, Database, Globe, Server, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { ModuleId, ModuleState } from '../../../shared/modules';
import type { Status } from '../../../shared/types';
import { toast } from '../../components/Toast';
import type { JobView } from '../../lib/modules';

export const MODULE_ICON: Record<ModuleId, LucideIcon> = { mariadb: Database, nginx: Globe, apache: Server };

export function statusOf(state: ModuleState, job?: JobView): Status {
  if (job?.state === 'running') return 'starting';
  return state.running ? 'running' : 'stopped';
}

export function generatePassword(length = 20): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

export function CopyButton({ value, label = 'Kopieren' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => {
        void window.feather.copy(value).then(() => {
          setDone(true);
          toast('In die Zwischenablage kopiert.', 'success');
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      {label}
    </button>
  );
}

export function InfoCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-[15px] font-medium ${tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-neutral-100'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-neutral-800 px-6 shrink-0 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'tab-active' : ''}`} onClick={() => onChange(t.id)} data-tab={t.id}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="card border-dashed flex flex-col items-center text-center px-6 py-10 animate-fade-in">
      <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-neutral-100">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500 max-w-sm">{text}</p>
    </div>
  );
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): { data?: T; loading: boolean; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ data?: T; loading: boolean; error: string | null }>({ loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => alive && setState({ data, loading: false, error: null }),
      (err: unknown) => alive && setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) })),
    );
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200 animate-fade-in">
      <CircleAlert className="size-4 mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button className="text-xs text-red-100 underline underline-offset-2 hover:text-white" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}
