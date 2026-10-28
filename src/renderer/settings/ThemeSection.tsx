import { Check, MoreHorizontal, Palette, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { Theme, ThemeAnimation } from '../../shared/types';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { Field, Toggle } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { updateSettings } from '../lib/settings';
import { useAppState } from '../lib/store';
import { ANIMATION_PRESETS, PRESETS, activeAnimation, cycleCss, glowCss, palette, themeVariables, uniqueThemeId } from '../lib/theme';

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_COLORS = 6;

function Swatches({ theme }: { theme: Theme }) {
  const colors = palette(theme);
  const vars = themeVariables(theme);
  return (
    <div className="flex h-8 overflow-hidden rounded-md border border-black/20" aria-hidden>
      <span className="flex-1" style={{ background: vars['--color-neutral-900'] ?? colors[900] }} />
      <span className="flex-1" style={{ background: vars['--color-neutral-800'] ?? colors[800] }} />
      <span className="flex-1" style={{ background: vars['--color-neutral-600'] ?? colors[600] }} />
      <span className="flex-1" style={{ background: vars['--color-neutral-200'] ?? colors[200] }} />
      <span className="flex-1" style={{ background: theme.accent }} />
    </div>
  );
}

function Preview({ theme }: { theme: Theme }) {
  const vars = themeVariables(theme) as CSSProperties;
  const animation = activeAnimation(theme);
  const icon = theme.icon ?? 'var(--color-neutral-400)';
  return (
    <div className="relative overflow-hidden rounded-xl border" style={{ ...vars, background: 'var(--color-bg)', borderColor: 'var(--color-neutral-800)', color: 'var(--color-neutral-200)' }} data-theme-preview>
      {animation && (
        <>
          <style>{[cycleCss(animation, '[data-theme-preview]', 'preview-cycle'), animation.target === 'accent' ? '' : glowCss(animation, '[data-preview-glow]', 'preview-glow-move')].join('\n')}</style>
          {animation.target !== 'accent' && <div data-preview-glow className="absolute inset-0 z-10" aria-hidden />}
        </>
      )}
      <div className="space-y-3 p-4" style={{ zoom: (theme.scale ?? 100) / 100 }}>
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
        <div className="flex items-center gap-2">
          <span className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: 'var(--color-primary)', color: 'var(--on-primary)' }}>Starten</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--color-neutral-700)', color: 'var(--color-neutral-200)' }}>
            <Pencil className="size-3.5" style={{ color: icon }} />
            Bearbeiten
          </span>
          <Trash2 className="size-4" style={{ color: icon }} />
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, fallback, onChange, hint }: { label: string; value: string | undefined; fallback: string; onChange: (value: string | undefined) => void; hint?: string }) {
  const [text, setText] = useState(value ?? '');
  const shown = value ?? fallback;
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <input
          type="color"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-700 bg-transparent p-1"
          value={HEX.test(shown) ? shown : '#000000'}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          aria-label={`${label} wählen`}
          data-bind={`theme-${label}`}
        />
        <input
          className="input font-mono"
          value={text}
          placeholder="Automatisch"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase());
            else if (!e.target.value) onChange(undefined);
          }}
        />
        <button
          type="button"
          className="btn btn-outline btn-icon shrink-0"
          disabled={value === undefined}
          title="Zurück auf automatisch"
          aria-label={`${label} zurücksetzen`}
          onClick={() => {
            setText('');
            onChange(undefined);
          }}
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </Field>
  );
}

const DEFAULT_ANIMATION: ThemeAnimation = { enabled: false, colors: ANIMATION_PRESETS[0]?.colors ?? ['#34d399', '#38bdf8'], speed: 24, target: 'both' };

function Editor({ initial, taken, onSave, onClose }: { initial: Theme | null; taken: string[]; onSave: (theme: Theme) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [mode, setMode] = useState<Theme['mode']>(initial?.mode ?? 'dark');
  const [accent, setAccent] = useState(initial?.accent ?? '#0ea5e9');
  const [hue, setHue] = useState(initial?.hue ?? 220);
  const [saturation, setSaturation] = useState(initial?.saturation ?? 12);
  const [background, setBackground] = useState<string | undefined>(initial?.background);
  const [text, setText] = useState<string | undefined>(initial?.text);
  const [icon, setIcon] = useState<string | undefined>(initial?.icon);
  const [scale, setScale] = useState(initial?.scale ?? 100);
  const [animation, setAnimation] = useState<ThemeAnimation>(initial?.animation ?? DEFAULT_ANIMATION);
  const base: Theme = { id: 'preview', name: 'x', mode, accent, hue, saturation };
  const auto = palette(base);
  const theme: Theme = {
    id: initial?.id ?? 'preview',
    name: name || 'Mein Thema',
    mode,
    accent: HEX.test(accent) ? accent : '#0ea5e9',
    hue,
    saturation,
    ...(background ? { background } : {}),
    ...(text ? { text } : {}),
    ...(icon ? { icon } : {}),
    ...(scale !== 100 ? { scale } : {}),
    ...(animation.enabled && animation.colors.length >= 2 ? { animation } : {}),
  };

  function save(): void {
    if (!name.trim()) return void toast('Bitte gib dem Thema einen Namen.', 'error');
    const saved: Theme = { ...theme, id: initial?.id ?? uniqueThemeId(name, taken), name: name.trim() };
    if (animation.colors.length >= 2) saved.animation = animation;
    onSave(saved);
    onClose();
  }

  const setColor = (index: number, value: string): void => setAnimation((a) => ({ ...a, colors: a.colors.map((c, i) => (i === index ? value : c)) }));

  return (
    <Modal title={initial ? 'Thema bearbeiten' : 'Eigenes Thema erstellen'} subtitle="Wähle Farben und Animation, die Vorschau aktualisiert sich sofort" size="max-w-4xl" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" onClick={save} data-action="theme-save">Speichern und anwenden</button></>}>
      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-5">
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
          <section className="space-y-4" data-theme-group="colors">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Farben</h4>
            <Field label="Primärfarbe">
              <div className="flex gap-2">
                <input type="color" className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-700 bg-transparent p-1" value={theme.accent} onChange={(e) => setAccent(e.target.value)} aria-label="Primärfarbe wählen" data-bind="theme-accent" />
                <input className="input font-mono" value={accent} spellCheck={false} onChange={(e) => setAccent(e.target.value)} />
              </div>
            </Field>
            <ColorField label="Hintergrund" value={background} fallback={auto[900] as string} onChange={setBackground} hint="Flächen und Ränder passen sich dem Hintergrund an." />
            <ColorField label="Textfarbe" value={text} fallback={auto[100] as string} onChange={setText} hint="Überschriften und Fließtext, abgestuft bis zu Hinweisen." />
            <ColorField label="Symbolfarbe" value={icon} fallback={auto[400] as string} onChange={setIcon} hint="Symbole in Schaltflächen, Seitenleiste und Kopfzeilen." />
            <Field label={`Farbton der Oberfläche (${hue}°)`}>
              <input type="range" min={0} max={360} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="w-full" data-bind="theme-hue" style={{ accentColor: theme.accent }} />
            </Field>
            <Field label={`Farbintensität (${saturation} %)`}>
              <input type="range" min={0} max={40} value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full" style={{ accentColor: theme.accent }} data-bind="theme-saturation" />
            </Field>
          </section>
          <section className="space-y-4" data-theme-group="size">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Größe</h4>
            <Field label={`Oberfläche (${scale} %)`} hint="Skaliert Texte, Symbole und Abstände der gesamten Oberfläche.">
              <input type="range" min={80} max={130} step={5} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full" style={{ accentColor: theme.accent }} data-bind="theme-scale" />
            </Field>
          </section>
        </div>
        <div className="space-y-5">
          <div className="space-y-3">
            <Preview theme={theme} />
            <Swatches theme={theme} />
          </div>
          <section className="space-y-4" data-theme-group="animation">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Animation</h4>
            <Toggle checked={animation.enabled} onChange={(enabled) => setAnimation((a) => ({ ...a, enabled }))} label="Farbverlauf animieren" description="Die gewählten Farben gehen fließend ineinander über." />
            {animation.enabled && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <p className="label">{`Farben (${animation.colors.length} von ${MAX_COLORS})`}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {animation.colors.map((c, i) => (
                      <span key={i} className="relative">
                        <input type="color" className="h-9 w-10 cursor-pointer rounded-lg border border-neutral-700 bg-transparent p-1" value={c} onChange={(e) => setColor(i, e.target.value)} aria-label={`Farbe ${i + 1}`} data-anim-color={i} />
                        {animation.colors.length > 2 && (
                          <button type="button" className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-neutral-700 text-neutral-200 hover:bg-red-500" aria-label={`Farbe ${i + 1} entfernen`} onClick={() => setAnimation((a) => ({ ...a, colors: a.colors.filter((_, n) => n !== i) }))}>
                            <X className="size-2.5" />
                          </button>
                        )}
                      </span>
                    ))}
                    {animation.colors.length < MAX_COLORS && (
                      <button type="button" className="grid size-9 place-items-center rounded-lg border border-dashed border-neutral-700 text-neutral-500 transition-colors hover:border-primary hover:text-primary" aria-label="Farbe hinzufügen" onClick={() => setAnimation((a) => ({ ...a, colors: [...a.colors, a.colors[a.colors.length - 1] ?? '#38bdf8'] }))} data-action="anim-add">
                        <Plus className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ANIMATION_PRESETS.map((p) => (
                      <button key={p.id} type="button" className="inline-flex items-center gap-2 rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-primary" onClick={() => setAnimation((a) => ({ ...a, colors: p.colors }))} data-anim-preset={p.id}>
                        <span className="h-2.5 w-8 rounded-full" style={{ background: `linear-gradient(90deg, ${p.colors.join(', ')})` }} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="label">Wirkt auf</p>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-950/60 border border-neutral-800 p-1">
                    {([['accent', 'Primärfarbe'], ['glow', 'Schimmer'], ['both', 'Beides']] as const).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setAnimation((a) => ({ ...a, target: id }))} className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${animation.target === id ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-100'}`} data-anim-target={id}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label={`Dauer eines Durchlaufs (${animation.speed} s)`} hint="Langsamer wirkt ruhiger und schont den Rechner. Im Ruhemodus pausiert die Animation.">
                  <input type="range" min={6} max={90} step={2} value={animation.speed} onChange={(e) => setAnimation((a) => ({ ...a, speed: Number(e.target.value) }))} className="w-full" style={{ accentColor: theme.accent }} data-bind="theme-anim-speed" />
                </Field>
              </div>
            )}
          </section>
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
                  <p className="text-xs text-neutral-500">{t.mode === 'light' ? 'Hell' : 'Dunkel'}{custom ? ' · Eigenes' : ''}{activeAnimation(t) ? ' · Animiert' : ''}</p>
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
