const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-ui-'));

function load(name, rel) {
  const out = path.join(work, `${name}.cjs`);
  esbuild.buildSync({ entryPoints: [path.join(root, rel)], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'error' });
  return require(out);
}

const theme = load('theme', 'src/renderer/lib/theme.ts');
const shortcuts = load('shortcuts', 'src/renderer/lib/shortcuts.ts');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ', name);
}

const base = { id: 't', name: 'T', mode: 'dark', accent: '#0ea5e9', hue: 220, saturation: 12 };

test('Shortcut schickt Strg+U, jede Zeile und Enter', () => {
  assert.equal(shortcuts.commandPayload('ls -la'), '\u0015ls -la\r');
  assert.equal(shortcuts.commandPayload('cd /srv\r\n\r\n./start.sh  \n'), '\u0015cd /srv\r./start.sh\r');
});

test('Ohne eigene Farben bleibt die Palette unverändert', () => {
  const vars = theme.themeVariables(base);
  assert.equal(vars['--color-primary'], '#0ea5e9');
  assert.equal(vars['--color-bg'], vars['--color-neutral-900']);
  assert.equal(Object.keys(vars).filter((k) => k.startsWith('--color-neutral-')).length, 11);
});

test('Eigener Hintergrund verschiebt Flächen mit', () => {
  const plain = theme.themeVariables(base);
  const custom = theme.themeVariables({ ...base, background: '#101820' });
  assert.equal(custom['--color-bg'], '#101820');
  assert.equal(custom['--color-neutral-900'], '#101820');
  assert.notEqual(custom['--color-neutral-800'], plain['--color-neutral-800']);
  assert.equal(custom['--color-neutral-200'], plain['--color-neutral-200']);
});

test('Eigene Textfarbe stuft Text von hell nach gedämpft ab', () => {
  const vars = theme.themeVariables({ ...base, text: '#ffeecc' });
  assert.equal(vars['--color-neutral-100'], '#ffeecc');
  const lum = (hex) => theme.hexToRgb(hex).reduce((a, b) => a + b, 0);
  assert.ok(lum(vars['--color-neutral-200']) <= lum(vars['--color-neutral-100']));
  assert.ok(lum(vars['--color-neutral-500']) < lum(vars['--color-neutral-300']));
});

test('Animation ist nur mit zwei Farben und eingeschaltet aktiv', () => {
  assert.equal(theme.activeAnimation(base), null);
  assert.equal(theme.activeAnimation({ ...base, animation: { enabled: false, colors: ['#ff0000', '#00ff00'], speed: 20, target: 'both' } }), null);
  assert.equal(theme.activeAnimation({ ...base, animation: { enabled: true, colors: ['#ff0000'], speed: 20, target: 'both' } }), null);
  assert.ok(theme.activeAnimation({ ...base, animation: { enabled: true, colors: ['#ff0000', '#00ff00'], speed: 20, target: 'both' } }));
});

test('Animierte Primärfarbe nutzt die Animationsvariable und lesbare Schrift', () => {
  const animated = { ...base, animation: { enabled: true, colors: ['#ffff00', '#00ffff'], speed: 12, target: 'accent' } };
  const vars = theme.themeVariables(animated);
  assert.equal(vars['--color-primary'], 'var(--anim-color)');
  assert.equal(vars['--on-primary'], '#0a0a0a');
  const glowOnly = theme.themeVariables({ ...animated, animation: { ...animated.animation, target: 'glow' } });
  assert.equal(glowOnly['--color-primary'], '#0ea5e9');
});

test('Farbverlauf kehrt zur ersten Farbe zurück', () => {
  const css = theme.cycleCss({ enabled: true, colors: ['#ff0000', '#00ff00', '#0000ff'], speed: 30, target: 'both' }, 'html', 'cycle');
  assert.match(css, /0\.00% \{ --anim-color: #ff0000; \}/);
  assert.match(css, /100\.00% \{ --anim-color: #ff0000; \}/);
  assert.match(css, /html \{ animation: cycle 30s linear infinite; \}/);
  const glow = theme.cycleCss({ enabled: true, colors: ['#ff0000', '#00ff00'], speed: 30, target: 'glow' }, 'html', 'cycle');
  assert.doesNotMatch(glow, /html \{/);
});

test('Farben mischen und mitteln', () => {
  assert.equal(theme.mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(theme.averageHex(['#000000', '#ffffff']), '#808080');
});

console.log(`\n${passed} Oberflächen-Tests bestanden`);
