import type { Theme } from '../../shared/types';

export const PRESETS: Theme[] = [
  { id: 'feather-dark', name: 'Feather Dunkel', mode: 'dark', accent: '#0ea5e9', hue: 0, saturation: 0 },
  { id: 'midnight', name: 'Mitternacht', mode: 'dark', accent: '#818cf8', hue: 228, saturation: 22 },
  { id: 'forest', name: 'Wald', mode: 'dark', accent: '#34d399', hue: 155, saturation: 14 },
  { id: 'sunset', name: 'Sonnenuntergang', mode: 'dark', accent: '#fb923c', hue: 20, saturation: 12 },
  { id: 'rose', name: 'Rosé', mode: 'dark', accent: '#f472b6', hue: 338, saturation: 14 },
  { id: 'feather-light', name: 'Feather Hell', mode: 'light', accent: '#0284c7', hue: 215, saturation: 12 },
];

export const DEFAULT_THEME = PRESETS[0] as Theme;

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHTNESS = [98, 96, 90, 83, 64, 45, 32, 25, 15, 9, 4];
const SATURATION_SCALE = [0.35, 0.4, 0.5, 0.55, 0.7, 0.8, 0.9, 1, 1, 1, 1];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

export function themeVariables(theme: Theme): Record<string, string> {
  const colors = palette(theme);
  const vars: Record<string, string> = { '--color-primary': theme.accent, '--color-bg': colors[900] as string, '--on-primary': readableOn(theme.accent) };
  for (const step of STEPS) vars[`--color-neutral-${step}`] = colors[step] as string;
  return vars;
}

export function findTheme(id: string, custom: Theme[]): Theme {
  return custom.find((t) => t.id === id) ?? PRESETS.find((t) => t.id === id) ?? DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const vars = themeVariables(theme);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  root.style.colorScheme = theme.mode;
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  const symbol = theme.mode === 'light' ? '#525252' : '#a3a3a3';
  try {
    window.feather.setTitleBar(vars['--color-bg'] as string, symbol);
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
