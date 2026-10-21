import type { OptionValue, ServiceType } from '../../shared/types';
import { MEMORY_CHOICES } from '../lib/packages';
import { Field, Toggle } from './Form';

interface Props {
  type: ServiceType;
  options: Record<string, OptionValue>;
  onChange: (options: Record<string, OptionValue>) => void;
  locked?: boolean;
  showEula?: boolean;
}

const link = 'text-primary hover:underline';

export function PackageOptions({ type, options, onChange, locked = false, showEula = false }: Props) {
  const set = (key: string, value: OptionValue): void => onChange({ ...options, [key]: value });
  const text = (key: string): string => String(options[key] ?? '');
  const flag = (key: string): boolean => options[key] === true;

  if (type === 'fivem') {
    return (
      <div className="space-y-4">
        <Field
          label="Lizenzschlüssel"
          hint={
            <>
              Kostenlos auf{' '}
              <button type="button" className={link} onClick={() => void window.feather.openExternal('https://keymaster.fivem.net')}>
                keymaster.fivem.net
              </button>
              . Der Schlüssel wird lokal in deiner Service-Konfiguration gespeichert.
            </>
          }
        >
          <input className="input font-mono" value={text('licenseKey')} disabled={locked} placeholder="cfxk_..." autoComplete="off" onChange={(e) => set('licenseKey', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Servername">
            <input className="input" value={text('hostname')} maxLength={80} disabled={locked} onChange={(e) => set('hostname', e.target.value)} />
          </Field>
          <Field label="Max. Spieler">
            <input className="input font-mono" type="number" min={1} max={2048} value={text('maxClients')} disabled={locked} onChange={(e) => set('maxClients', Number(e.target.value))} />
          </Field>
        </div>
        <Toggle checked={flag('lan')} onChange={(v) => set('lan', v)} disabled={locked} label="Im Netzwerk erreichbar" description="Andere Rechner im LAN können sich verbinden. Sonst nur dieser Rechner." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Arbeitsspeicher">
          <select className="input" value={text('memory')} disabled={locked} onChange={(e) => set('memory', e.target.value)}>
            {MEMORY_CHOICES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Max. Spieler">
          <input className="input font-mono" type="number" min={1} max={500} value={text('maxPlayers')} disabled={locked} onChange={(e) => set('maxPlayers', Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Servername (MOTD)">
        <input className="input" value={text('motd')} maxLength={80} disabled={locked} onChange={(e) => set('motd', e.target.value)} />
      </Field>
      <div className="space-y-3">
        <Toggle checked={flag('onlineMode')} onChange={(v) => set('onlineMode', v)} disabled={locked} label="Online-Modus" description="Prüft Spielerkonten bei Mojang. Zum Testen mit Offline-Konten ausschalten." />
        <Toggle checked={flag('lan')} onChange={(v) => set('lan', v)} disabled={locked} label="Im Netzwerk erreichbar" description="Andere Rechner im LAN können sich verbinden. Sonst nur dieser Rechner." />
      </div>
      {showEula && (
        <div className="border-t border-neutral-800 pt-4">
          <Toggle
            checked={flag('eula')}
            onChange={(v) => set('eula', v)}
            label="Ich akzeptiere die Minecraft-EULA"
            description={
              <>
                Ohne Zustimmung startet der Server nicht.{' '}
                <button type="button" className={link} onClick={() => void window.feather.openExternal('https://aka.ms/MinecraftEULA')}>
                  EULA lesen
                </button>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
