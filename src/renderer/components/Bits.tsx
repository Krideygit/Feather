import { Settings as SettingsIcon, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Profile, Status } from '../../shared/types';

const STATUS: Record<Status, { label: string; dot: string; text: string; pulse: boolean }> = {
  running: { label: 'Läuft', dot: 'bg-emerald-400', text: 'text-emerald-300', pulse: false },
  starting: { label: 'Startet …', dot: 'bg-amber-400', text: 'text-amber-300', pulse: true },
  stopping: { label: 'Stoppt …', dot: 'bg-amber-400', text: 'text-amber-300', pulse: true },
  stopped: { label: 'Gestoppt', dot: 'bg-neutral-500', text: 'text-neutral-400', pulse: false },
  error: { label: 'Fehler', dot: 'bg-red-500', text: 'text-red-300', pulse: false },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`size-2 rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  );
}

export function Avatar({ profile, size = 'size-8', text = 'text-sm' }: { profile?: Pick<Profile, 'name' | 'avatar'> | null; size?: string; text?: string }) {
  if (profile?.avatar) return <img src={profile.avatar} alt="" className={`${size} rounded-lg object-cover shrink-0`} />;
  const letter = (profile?.name || '?').trim().charAt(0).toUpperCase();
  return <span className={`${size} ${text} rounded-lg bg-primary/15 text-primary font-semibold grid place-items-center shrink-0 select-none`}>{letter}</span>;
}

interface PageHeaderProps {
  title: string;
  description: string;
  createLabel: string;
  settingsLabel: string;
  onCreate?: () => void;
  onSettings?: () => void;
  disabled?: boolean;
}

export function PageHeader({ title, description, createLabel, settingsLabel, onCreate, onSettings, disabled = false }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-8 pt-6 pb-5 shrink-0">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-neutral-50 tracking-tight">{title}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button className="btn btn-primary btn-icon" onClick={onCreate} title={createLabel} aria-label={createLabel} disabled={disabled} data-action="page:create">
          <Plus className="size-[18px]" />
        </button>
        <button className="btn btn-outline btn-icon" onClick={onSettings} title={settingsLabel} aria-label={settingsLabel} disabled={disabled} data-action="page:settings">
          <SettingsIcon className="size-[18px]" />
        </button>
      </div>
    </header>
  );
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'info' | 'error'; children: ReactNode }) {
  const tones = {
    warn: 'text-amber-300 bg-amber-500/10',
    info: 'text-neutral-400 bg-neutral-800/60',
    error: 'text-red-200 bg-red-500/10 border border-red-500/20',
  };
  return <p className={`text-xs rounded-lg px-3 py-2 ${tones[tone]}`}>{children}</p>;
}
