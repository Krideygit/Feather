import type { Theme, ThemeAnimation } from '../../shared/types';

export const PRESETS: Theme[] = [
  { id: 'feather-dark', name: 'Feather Dunkel', mode: 'dark', accent: '#0ea5e9', hue: 0, saturation: 0 },
  { id: 'midnight', name: 'Mitternacht', mode: 'dark', accent: '#818cf8', hue: 228, saturation: 22 },
  { id: 'forest', name: 'Wald', mode: 'dark', accent: '#34d399', hue: 155, saturation: 14 },
  { id: 'sunset', name: 'Sonnenuntergang', mode: 'dark', accent: '#fb923c', hue: 20, saturation: 12 },
  { id: 'rose', name: 'Rosé', mode: 'dark', accent: '#f472b6', hue: 338, saturation: 14 },
  { id: 'feather-light', name: 'Feather Hell', mode: 'light', accent: '#0284c7', hue: 215, saturation: 12 },
];

export const DEFAULT_THEME = PRESETS[0] as Theme;

export const ANIMATION_PRESETS: { id: string; name: string; colors: string[] }[] = [
  { id: 'aurora', name: 'Polarlicht', colors: ['#34d399', '#38bdf8', '#818cf8', '#a78bfa'] },
  { id: 'ocean', name: 'Ozean', colors: ['#0ea5e9', '#06b6d4', '#14b8a6', '#6366f1'] },
  { id: 'sunset', name: 'Abendrot', colors: ['#fb923c', '#f472b6', '#c084fc'] },
  { id: 'ember', name: 'Glut', colors: ['#f87171', '#fb923c', '#fbbf24'] },
  { id: 'candy', name: 'Zuckerwatte', colors: ['#f472b6', '#a78bfa', '#38bdf8'] },
];

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHTNESS = [98, 96, 90, 83, 64, 45, 32, 25, 15, 9, 4];
const SATURATION_SCALE = [0.35, 0.4, 0.5, 0.55, 0.7, 0.8, 0.9, 1, 1, 1, 1];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

export function mixHex(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return toHex(ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount);
}

function shiftHex(hex: string, delta: [number, number, number]): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r + delta[0], g + delta[1], b + delta[2]);
}

export function averageHex(colors: string[]): string {
  const sum = colors.reduce<[number, number, number]>(
    (acc, c) => {
      const [r, g, b] = hexToRgb(c);
      return [acc[0] + r, acc[1] + g, acc[2] + b];
    },
    [0, 0, 0],
  );
  const n = Math.max(1, colors.length);
  return toHex(sum[0] / n, sum[1] / n, sum[2] / n);
}

function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function palette(theme: Theme): Record<number, string> {
  const out: Record<number, string> = {};
  STEPS.forEach((step, i) => {
    const index = theme.mode === 'light' ? STEPS.length - 1 - i : i;
    out[step] = hsl(theme.hue, theme.saturation * (SATURATION_SCALE[index] as number), LIGHTNESS[index] as number);
  });
  return out;
}

export function readableOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0a0a0a' : '#ffffff';
}

export function activeAnimation(theme: Theme): ThemeAnimation | null {
  const a = theme.animation;
  return a && a.enabled && a.colors.length >= 2 ? a : null;
}

export function themeVariables(theme: Theme): Record<string, string> {
  const colors = palette(theme);
  const base: Record<number, string> = { ...colors };
  if (theme.background) {
    const from = hexToRgb(colors[900] as string);
    const to = hexToRgb(theme.background);
    const delta: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    for (const step of [600, 700, 800, 900, 950]) base[step] = shiftHex(colors[step] as string, delta);
    base[900] = theme.background;
  }
  if (theme.text) {
    const ground = base[900] as string;
    const pole = theme.mode === 'light' ? '#000000' : '#ffffff';
    base[50] = mixHex(theme.text, pole, 0.12);
    base[100] = theme.text;
    base[200] = mixHex(theme.text, ground, 0.12);
    base[300] = mixHex(theme.text, ground, 0.26);
    base[400] = mixHex(theme.text, ground, 0.42);
    base[500] = mixHex(theme.text, ground, 0.58);
  }
  const animation = activeAnimation(theme);
  const cycling = animation !== null && animation.target !== 'glow';
  const vars: Record<string, string> = {
    '--color-primary': cycling ? 'var(--anim-color)' : theme.accent,
    '--color-bg': base[900] as string,
    '--on-primary': readableOn(cycling && animation ? averageHex(animation.colors) : theme.accent),
  };
  for (const step of STEPS) vars[`--color-neutral-${step}`] = base[step] as string;
  return vars;
}

export function findTheme(id: string, custom: Theme[]): Theme {
  return custom.find((t) => t.id === id) ?? PRESETS.find((t) => t.id === id) ?? DEFAULT_THEME;
}

export function cycleCss(animation: ThemeAnimation, scope: string, name: string): string {
  const colors = [...animation.colors, animation.colors[0] as string];
  const stops = colors.map((c, i) => `${((i / (colors.length - 1)) * 100).toFixed(2)}% { --anim-color: ${c}; }`).join(' ');
  const rules = [`@keyframes ${name} { ${stops} }`];
  if (animation.target !== 'glow') rules.push(`${scope} { animation: ${name} ${animation.speed}s linear infinite; }`);
  return rules.join('\n');
}

export function glowCss(animation: ThemeAnimation, scope: string, name: string): string {
  const gradient = [...animation.colors, animation.colors[0] as string].join(', ');
  return [
    `${scope} { overflow: hidden; pointer-events: none; }`,
    `${scope}::before { content: ''; position: absolute; top: 0; left: 0; width: 200%; height: 100%; background: linear-gradient(105deg, ${gradient}); opacity: 0.14; will-change: transform; animation: ${name} ${Math.round(animation.speed * 1.5)}s ease-in-out infinite alternate; }`,
    `@keyframes ${name} { to { transform: translateX(-50%); } }`,
  ].join('\n');
}

function applyAnimation(theme: Theme): void {
  const animation = activeAnimation(theme);
  let style = document.getElementById('feather-theme-anim') as HTMLStyleElement | null;
  let glow = document.getElementById('feather-glow');
  if (!animation) {
    style?.remove();
    glow?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = 'feather-theme-anim';
    document.head.appendChild(style);
  }
  const wantsGlow = animation.target !== 'accent';
  style.textContent = [cycleCss(animation, 'html', 'feather-cycle'), wantsGlow ? glowCss(animation, '#feather-glow', 'feather-glow-move') : ''].join('\n');
  if (!wantsGlow) {
    glow?.remove();
  } else if (!glow) {
    glow = document.createElement('div');
    glow.id = 'feather-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const vars = themeVariables(theme);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  if (theme.icon) {
    root.style.setProperty('--icon-color', theme.icon);
    root.dataset.iconColor = 'true';
  } else {
    root.style.removeProperty('--icon-color');
    delete root.dataset.iconColor;
  }
  root.style.colorScheme = theme.mode;
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  applyAnimation(theme);
  const symbol = theme.mode === 'light' ? '#525252' : '#a3a3a3';
  try {
    window.feather.setTitleBar(vars['--color-bg'] as string, symbol, (theme.scale ?? 100) / 100);
  } catch {
    return;
  }
}

export function uniqueThemeId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'theme';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
