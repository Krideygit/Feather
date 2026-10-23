import { Check, MoreHorizontal, Palette, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Theme } from '../../shared/types';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { Field } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { updateSettings } from '../lib/settings';
import { useAppState } from '../lib/store';
import { PRESETS, palette, themeVariables, uniqueThemeId } from '../lib/theme';

function Swatches({ theme }: { theme: Theme }) {
  const colors = palette(theme);
  return (
    <div className="flex h-8 overflow-hidden rounded-md border border-black/20" aria-hidden>
      <span className="flex-1" style={{ background: colors[900] }} />
      <span className="flex-1" style={{ background: colors[800] }} />
      <span className="flex-1" style={{ background: colors[600] }} />
      <span className="flex-1" style={{ background: colors[200] }} />
      <span className="flex-1" style={{ background: theme.accent }} />
    </div>
  );
}

function Preview({ theme }: { theme: Theme }) {
  const vars = themeVariables(theme) as React.CSSProperties;
  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ ...vars, background: 'var(--color-bg)', borderColor: 'var(--color-neutral-800)', color: 'var(--color-neutral-200)' }} data-theme-preview>
      <div className="flex items-center gap-2">
        <span className="size-7 rounded-lg grid place-items-center" style={{ background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)', color: 'var(--color-primary)' }}>
          <Palette className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-neutral-100)' }}>Vorschau</p>
          <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>So sieht Feather mit diesem Thema aus.</p>
        </div>
      </div>
      <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-neutral-800)', background: 'color-mix(in srgb, var(--color-neutral-800) 30%, transparent)' }}>
        <p style={{ color: 'var(--color-neutral-100)' }}>MariaDB</p>
        <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>127.0.0.1:3306</p>
      </div>
      <div className="flex gap-2">
        <span className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: 'var(--color-primary)', color: 'var(--on-primary)' }}>Starten</span>
        <span className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--color-neutral-700)', color: 'var(--color-neutral-200)' }}>Abbrechen</span>
      </div>
    </div>
  );
}

function Editor({ initial, taken, onSave, onClose }: { initial: Theme | null; taken: string[]; onSave: (theme: Theme) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [mode, setMode] = useState<Theme['mode']>(initial?.mode ?? 'dark');
  const [accent, setAccent] = useState(initial?.accent ?? '#0ea5e9');
  const [hue, setHue] = useState(initial?.hue ?? 220);
  const [saturation, setSaturation] = useState(initial?.saturation ?? 12);
  const theme: Theme = { id: initial?.id ?? 'preview', name: name || 'Mein Thema', mode, accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#0ea5e9', hue, saturation };

  function save(): void {
    if (!name.trim()) return void toast('Bitte gib dem Thema einen Namen.', 'error');
    onSave({ ...theme, id: initial?.id ?? uniqueThemeId(name, taken), name: name.trim() });
    onClose();
  }

  return (
    <Modal title={initial ? 'Thema bearbeiten' : 'Eigenes Thema erstellen'} subtitle="Wähle Farben, die Vorschau aktualisiert sich sofort" size="max-w-2xl" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" onClick={save} data-action="theme-save">Speichern und anwenden</button></>}>
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        <div className="space-y-4">
          <Field label="Name">
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-bind="theme-name" placeholder="z. B. Nachtblau" />
          </Field>
          <div>
            <label className="label">Modus</label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1">
              {([['dark', 'Dunkel'], ['light', 'Hell']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-100'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Akzentfarbe">
            <div className="flex gap-2">
              <input type="color" className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-700 bg-transparent p-1" value={theme.accent} onChange={(e) => setAccent(e.target.value)} aria-label="Akzentfarbe wählen" data-bind="theme-accent" />
              <input className="input font-mono" value={accent} spellCheck={false} onChange={(e) => setAccent(e.target.value)} />
            </div>
          </Field>
          <Field label={`Farbton der Oberfläche (${hue}°)`}>
            <input type="range" min={0} max={360} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="w-full accent-sky-500" data-bind="theme-hue" style={{ accentColor: theme.accent }} />
          </Field>
          <Field label={`Farbintensität (${saturation} %)`}>
            <input type="range" min={0} max={40} value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full" style={{ accentColor: theme.accent }} data-bind="theme-saturation" />
          </Field>
        </div>
        <div className="space-y-3">
          <Preview theme={theme} />
          <Swatches theme={theme} />
        </div>
      </div>
    </Modal>
  );
}

export function ThemeSection() {
  const settings = useAppState((s) => s.settings);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
  const all = [...PRESETS, ...settings.themes];
  const taken = all.map((t) => t.id);

  const choose = (id: string): void => void updateSettings({ theme: id });

  function create(initial: Theme | null): void {
    openLayer((close) => (
      <Editor
        initial={initial}
        taken={taken}
        onClose={close}
        onSave={(theme) => {
          const themes = initial ? settings.themes.map((t) => (t.id === initial.id ? theme : t)) : [...settings.themes, theme];
          void updateSettings({ themes, theme: theme.id });
        }}
      />
    ));
  }

  async function remove(theme: Theme): Promise<void> {
    const ok = await confirmDialog({ title: `„${theme.name}“ löschen?`, message: 'Das Thema wird entfernt. Ist es gerade aktiv, wechselt Feather zum Standard.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    void updateSettings({ themes: settings.themes.filter((t) => t.id !== theme.id), theme: settings.theme === theme.id ? 'feather-dark' : settings.theme });
  }

  return (
    <div className="space-y-5 animate-fade-in" data-section="themes">
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {all.map((t) => {
          const custom = settings.themes.some((x) => x.id === t.id);
          const active = settings.theme === t.id;
          return (
            <article
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => choose(t.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && choose(t.id)}
              className={`card card-hover p-3 cursor-pointer space-y-3 ${active ? 'border-primary! ring-1 ring-primary/40' : ''}`}
              data-theme-card={t.id}
              aria-pressed={active}
            >
              <Swatches theme={t} />
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-100 truncate">{t.name}</p>
                  <p className="text-xs text-neutral-500">{t.mode === 'light' ? 'Hell' : 'Dunkel'}{custom ? ' · Eigenes' : ''}</p>
                </div>
                {active && <Check className="size-4 text-primary" />}
                {custom && (
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label="Weitere Aktionen"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu({ x: r.left, y: r.bottom + 4, entries: [{ kind: 'action', label: 'Bearbeiten', icon: Pencil, onSelect: () => create(t) }, { kind: 'action', label: 'Löschen', icon: Trash2, danger: true, onSelect: () => void remove(t) }] });
                    }}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                )}
              </div>
            </article>
          );
        })}
        <button className="card border-dashed card-hover p-3 flex flex-col items-center justify-center gap-2 text-neutral-400 hover:text-neutral-100 min-h-[110px]" onClick={() => create(null)} data-action="theme-create">
          <Plus className="size-5" />
          <span className="text-sm font-medium">Eigenes Thema erstellen</span>
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
}
