import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm text-neutral-200">{label}</span>
        {description && <span className="block text-xs text-neutral-500 mt-0.5">{description}</span>}
      </span>
      <span className="mt-0.5">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle" />
      </span>
    </label>
  );
}

type PasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
};

export function PasswordInput({ value, onChange, ...rest }: PasswordProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex gap-2">
      <input {...rest} className="input font-mono" type={shown ? 'text' : 'password'} value={value} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="btn btn-outline btn-icon shrink-0" onClick={() => setShown(!shown)} title={shown ? 'Verbergen' : 'Anzeigen'} aria-label="Passwort anzeigen oder verbergen">
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
