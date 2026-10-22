import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Notice } from '../components/Bits';
import { Field, PasswordInput, Toggle } from '../components/Form';
import { Modal, openLayer } from '../components/Layers';

interface PasswordOptions {
  title: string;
  message: string;
  label: string;
  canRemember: boolean;
}

export interface PasswordAnswer {
  password: string;
  remember: boolean;
}

function PasswordPrompt({ options, onAnswer, onClose }: { options: PasswordOptions; onAnswer: (a: PasswordAnswer) => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const submit = (): void => {
    if (!password) return;
    onAnswer({ password, remember });
    onClose();
  };
  return (
    <Modal
      title={options.title}
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={!password} onClick={submit} data-action="prompt-submit">Verbinden</button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-neutral-300">{options.message}</p>
        <Field label={options.label}>
          <PasswordInput value={password} onChange={setPassword} autoFocus data-bind="prompt-password" />
        </Field>
        {options.canRemember && <Toggle checked={remember} onChange={setRemember} label="Sicher speichern" description="Das Passwort wird verschlüsselt und nur für diesen Windows-Benutzer lesbar abgelegt." />}
      </form>
    </Modal>
  );
}

export function askPassword(options: PasswordOptions): Promise<PasswordAnswer | null> {
  return new Promise((resolve) => {
    let answered = false;
    openLayer(
      (close) => (
        <PasswordPrompt
          options={options}
          onAnswer={(a) => {
            answered = true;
            resolve(a);
          }}
          onClose={close}
        />
      ),
      { onClosed: () => !answered && resolve(null) },
    );
  });
}

interface HostKeyOptions {
  target: string;
  fingerprint: string;
  known?: string;
}

export function confirmHostKey({ target, fingerprint, known }: HostKeyOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const changed = Boolean(known);
    openLayer(
      (close) => (
        <Modal
          title={changed ? 'Server-Schlüssel hat sich geändert' : 'Neuem Server vertrauen?'}
          size="max-w-lg"
          onClose={close}
          footer={
            <>
              <button className="btn btn-ghost" onClick={close} data-action="hostkey-cancel">Abbrechen</button>
              <button
                className={`btn ${changed ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={() => {
                  answered = true;
                  resolve(true);
                  close();
                }}
                data-action="hostkey-trust"
              >
                {changed ? 'Trotzdem verbinden' : 'Vertrauen und verbinden'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className={`size-10 rounded-xl grid place-items-center shrink-0 ${changed ? 'bg-red-500/10 text-red-400' : 'bg-primary/10 text-primary'}`}>
                {changed ? <ShieldAlert className="size-5" /> : <ShieldCheck className="size-5" />}
              </div>
              <p className="text-sm text-neutral-300">
                {changed
                  ? `Der Schlüssel von ${target} unterscheidet sich von dem, dem du früher vertraut hast. Das kann ein Server-Umzug sein, aber auch ein Angriff.`
                  : `Du verbindest dich zum ersten Mal mit ${target}. Prüfe den Fingerabdruck, wenn du ihn kennst. Feather merkt ihn sich danach.`}
              </p>
            </div>
            <div>
              <p className="label">Fingerabdruck (SHA256)</p>
              <p className="rounded-lg bg-black/40 border border-neutral-800 px-3 py-2 font-mono text-xs text-neutral-200 break-all select-text">{fingerprint}</p>
            </div>
            {known && (
              <div>
                <p className="label">Bisher bekannt</p>
                <p className="rounded-lg bg-black/40 border border-neutral-800 px-3 py-2 font-mono text-xs text-neutral-500 break-all select-text">{known}</p>
              </div>
            )}
            {changed && <Notice tone="error">Verbinde nur, wenn du weißt, dass sich der Server geändert hat.</Notice>}
          </div>
        </Modal>
      ),
      { onClosed: () => !answered && resolve(false) },
    );
  });
}
