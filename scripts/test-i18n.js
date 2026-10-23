const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-i18n-'));
const out = path.join(work, 'i18n.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src', 'renderer', 'lib', 'i18n.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'error' });
const { translate } = require(out);
const { EN } = require(path.join(work, 'i18n.cjs')).default ?? {};

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ', name);
}

test('Einfache Texte werden übersetzt, Leerraum bleibt erhalten', () => {
  assert.equal(translate('Abbrechen'), 'Cancel');
  assert.equal(translate('  Datenbanken '), '  Databases ');
  assert.equal(translate(' Zeilen'), ' rows');
});

test('Texte mit Platzhaltern werden übersetzt', () => {
  assert.equal(translate('„Shop“ wurde erstellt.'), '“Shop” was created.');
  assert.equal(translate('Abfrage 3'), 'Query 3');
  assert.equal(translate('Benutzer „webapp“ gelöscht.'), 'User “webapp” deleted.');
  assert.equal(translate('Profil „Arbeit“ ist aktiv.'), 'Profile “Arbeit” is active.');
  assert.equal(translate('Version 10.11.6'), 'Version 10.11.6');
});

test('Mehrzeilige Texte mit Umbrüchen werden gefunden', () => {
  assert.equal(translate('Alle Knoten und\n   Verbindungen werden entfernt.'), 'All nodes and connections will be removed.');
});

test('Unbekannte Texte und Daten des Benutzers bleiben unverändert', () => {
  assert.equal(translate('Meine eigene Datenbank xyz'), 'Meine eigene Datenbank xyz');
  assert.equal(translate('constructor'), 'constructor');
  assert.equal(translate('__proto__'), '__proto__');
  assert.equal(translate(''), '');
  assert.equal(translate('   '), '   ');
});

test('Wörterbuch hat keine leeren oder doppelten Übersetzungen', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'renderer', 'lib', 'i18n-en.ts'), 'utf8');
  const entries = [...source.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/gm)].map((m) => [JSON.parse(m[1]), JSON.parse(m[2])]);
  assert.ok(entries.length > 1000, `nur ${entries.length} Einträge`);
  const keys = new Set();
  for (const [key, value] of entries) {
    assert.ok(value.trim().length > 0, `leere Übersetzung für „${key}“`);
    assert.ok(!keys.has(key), `doppelter Schlüssel „${key}“`);
    keys.add(key);
    const slots = (text) => (text.match(/\{\d+\}/g) ?? []).sort().join();
    assert.equal(slots(value), slots(key), `Platzhalter passen nicht bei „${key}“`);
  }
});

console.log(`\n${passed} Übersetzungs-Tests bestanden`);
fs.rmSync(work, { recursive: true, force: true });
process.exit(0);
