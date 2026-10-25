import {
  Anchor,
  Archive,
  Box,
  BookOpen,
  Bug,
  Cloud,
  Code,
  Cpu,
  Crown,
  Database,
  Film,
  Flame,
  Folder,
  Gamepad2,
  Gauge,
  Globe,
  HardDrive,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Lock,
  Music,
  Network,
  Package,
  Pickaxe,
  Puzzle,
  Rocket,
  Server,
  Settings,
  Shield,
  Skull,
  Sparkles,
  SquareTerminal,
  Star,
  Swords,
  Upload,
  Users,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Modal, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';

export const FOLDER_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  folder: { label: 'Ordner', Icon: Folder },
  server: { label: 'Server', Icon: Server },
  database: { label: 'Datenbank', Icon: Database },
  package: { label: 'Paket', Icon: Package },
  box: { label: 'Box', Icon: Box },
  layers: { label: 'Ebenen', Icon: Layers },
  rocket: { label: 'Rakete', Icon: Rocket },
  zap: { label: 'Blitz', Icon: Zap },
  wind: { label: 'Wind', Icon: Wind },
  gauge: { label: 'Tempo', Icon: Gauge },
  network: { label: 'Netzwerk', Icon: Network },
  shield: { label: 'Schild', Icon: Shield },
  lock: { label: 'Schloss', Icon: Lock },
  key: { label: 'Schlüssel', Icon: KeyRound },
  globe: { label: 'Web', Icon: Globe },
  cloud: { label: 'Cloud', Icon: Cloud },
  cpu: { label: 'Prozessor', Icon: Cpu },
  terminal: { label: 'Terminal', Icon: SquareTerminal },
  code: { label: 'Code', Icon: Code },
  gamepad: { label: 'Spiel', Icon: Gamepad2 },
  swords: { label: 'Schwerter', Icon: Swords },
  pickaxe: { label: 'Spitzhacke', Icon: Pickaxe },
  puzzle: { label: 'Plugin', Icon: Puzzle },
  settings: { label: 'Einstellungen', Icon: Settings },
  wrench: { label: 'Werkzeug', Icon: Wrench },
  archive: { label: 'Archiv', Icon: Archive },
  drive: { label: 'Laufwerk', Icon: HardDrive },
  image: { label: 'Bilder', Icon: ImageIcon },
  music: { label: 'Musik', Icon: Music },
  film: { label: 'Video', Icon: Film },
  book: { label: 'Buch', Icon: BookOpen },
  users: { label: 'Nutzer', Icon: Users },
  star: { label: 'Stern', Icon: Star },
  heart: { label: 'Herz', Icon: Heart },
  flame: { label: 'Flamme', Icon: Flame },
  sparkles: { label: 'Funken', Icon: Sparkles },
  crown: { label: 'Krone', Icon: Crown },
  anchor: { label: 'Anker', Icon: Anchor },
  skull: { label: 'Totenkopf', Icon: Skull },
  bug: { label: 'Fehler', Icon: Bug },
};

export const FOLDER_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#f472b6', '#a78bfa', '#a3a3a3'];

export interface ParsedIcon {
  kind: 'image' | 'symbol';
  image?: string;
  Icon?: LucideIcon;
  color?: string;
}

export function parseIcon(value: string | undefined): ParsedIcon | null {
  if (!value) return null;
  if (value.startsWith('data:image/')) return { kind: 'image', image: value };
  const [name, color] = value.split('|');
  const found = FOLDER_ICONS[name ?? ''];
  return found ? { kind: 'symbol', Icon: found.Icon, color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined } : null;
}

export function CustomIcon({ value, className = 'size-4' }: { value: string; className?: string }) {
  const parsed = parseIcon(value);
  if (!parsed) return null;
  if (parsed.kind === 'image') return <img src={parsed.image} alt="" className={`${className} shrink-0 rounded-[3px] object-cover`} data-feather-icon="folder" />;
  const Icon = parsed.Icon as LucideIcon;
  return <Icon className={className} style={parsed.color ? { color: parsed.color } : undefined} data-feather-icon="folder" />;
}

async function shrink(dataUrl: string, side: number): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    image.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
  ctx.drawImage(image, 0, 0, side, side);
  return canvas.toDataURL('image/png');
}

function Picker({ name, current, onSave, onClose }: { name: string; current: string | undefined; onSave: (value: string | null) => boolean; onClose: () => void }) {
  const parsed = parseIcon(current);
  const [symbol, setSymbol] = useState<string>(parsed?.kind === 'symbol' ? (current?.split('|')[0] ?? 'folder') : 'folder');
  const [color, setColor] = useState<string>(parsed?.color ?? FOLDER_COLORS[0] ?? '#38bdf8');
  const [image, setImage] = useState<string | null>(parsed?.kind === 'image' ? (parsed.image ?? null) : null);

  async function pick(): Promise<void> {
    const res = await window.feather.pickImage();
    if (!res) return;
    if ('error' in res) return void toast(res.error, 'error');
    try {
      setImage(await shrink(res.dataUrl, 64));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  const value = image ?? `${symbol}|${color}`;
  const preview = <CustomIcon value={value} className="size-7" />;

  return (
    <Modal
      title="Symbol des Ordners"
      subtitle={`„${name}“. Das Symbol ist nur in Feather sichtbar, auf dem Server ändert sich nichts.`}
      size="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-ghost mr-auto"
            onClick={() => {
              onSave(null);
              onClose();
            }}
            data-action="folder-icon-reset"
          >
            Zurücksetzen
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!onSave(value)) return void toast('Das Symbol konnte nicht gespeichert werden. Der Speicher ist voll.', 'error');
              onClose();
            }}
            data-action="folder-icon-save"
          >
            Speichern
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-xl border border-neutral-800 bg-neutral-950/60">{preview}</span>
          <div className="min-w-0 flex-1">
            <button className="btn btn-outline btn-sm" onClick={() => void pick()} data-action="folder-icon-image">
              <Upload className="size-3.5" />
              Eigenes Bild wählen …
            </button>
            <p className="mt-1.5 text-xs text-neutral-500">Zum Beispiel das Logo eines Programms. Das Bild wird verkleinert und lokal gespeichert.</p>
          </div>
        </div>
        <div>
          <p className="label">Symbol</p>
          <div className="grid grid-cols-8 gap-1.5" role="listbox" aria-label="Symbole">
            {Object.entries(FOLDER_ICONS).map(([id, { label, Icon }]) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                aria-selected={!image && symbol === id}
                className={`grid size-9 place-items-center rounded-lg border transition-colors ${!image && symbol === id ? 'border-primary bg-primary/15' : 'border-neutral-800 hover:bg-neutral-800'}`}
                onClick={() => {
                  setSymbol(id);
                  setImage(null);
                }}
                data-icon={id}
              >
                <Icon className="size-4" style={{ color: !image && symbol === id ? color : undefined }} />
              </button>
            ))}
          </div>
        </div>
        <div className={image ? 'pointer-events-none opacity-40' : ''}>
          <p className="label">Farbe</p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} className={`size-7 rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-neutral-100' : 'border-transparent'}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function openFolderIconPicker(name: string, current: string | undefined, onSave: (value: string | null) => boolean): void {
  openLayer((close) => <Picker name={name} current={current} onSave={onSave} onClose={close} />);
}
