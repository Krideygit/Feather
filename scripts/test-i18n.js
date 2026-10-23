const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-i18n-'));
const out = path.join(work, 'i18n.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src', 'renderer', 'lib', 'i18n.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'error' });
const { translate, setPack } = require(out);
const enOut = path.join(work, 'en.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src', 'renderer', 'lib', 'i18n-en.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: enOut, logLevel: 'error' });
const { EN: DICT } = require(enOut);
const packOut = path.join(work, 'langpack.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src', 'shared', 'langpack.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: packOut, logLevel: 'error' });
const { parsePack, buildTemplate, mergePack } = require(packOut);
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

const meta = { code: 'tr', name: 'Türkçe', author: 'Ali', version: '1.0.0' };
const template = () => JSON.parse(buildTemplate(meta, DICT));

test('Vorlage enthält alle Texte mit englischer Vorgabe und Metadaten', () => {
  const t = template();
  assert.equal(t.code, 'tr');
  assert.equal(t.name, 'Türkçe');
  assert.equal(Object.keys(t.strings).length, Object.keys(DICT).length);
  assert.equal(t.strings['Abbrechen'], 'Cancel');
  assert.equal(parsePack(JSON.stringify(t), DICT).translated, 0);
});

test('Importierte Übersetzung wird genutzt, fehlende Texte fallen auf Englisch zurück', () => {
  const t = template();
  t.strings['Abbrechen'] = 'İptal';
  t.strings['„{0}“ wurde erstellt.'] = '“{0}” oluşturuldu.';
  delete t.strings['Speichern'];
  const parsed = parsePack(JSON.stringify(t), DICT);
  assert.equal(parsed.translated, 2);
  setPack(parsed.strings);
  assert.equal(translate('Abbrechen'), 'İptal');
  assert.equal(translate('„Shop“ wurde erstellt.'), '“Shop” oluşturuldu.');
  assert.equal(translate('Speichern'), 'Save');
  assert.equal(translate('Meine eigene Datenbank xyz'), 'Meine eigene Datenbank xyz');
  setPack(null);
  assert.equal(translate('Abbrechen'), 'Cancel');
});

test('Fehlerhafte Einträge werden übersprungen, kaputte Dateien abgelehnt', () => {
  const t = template();
  t.strings['„{0}“ wurde erstellt.'] = 'oluşturuldu';
  t.strings['Gibt es nicht'] = 'x';
  t.strings['Abbrechen'] = 'İptal';
  const parsed = parsePack(JSON.stringify(t), DICT);
  assert.equal(parsed.skipped, 2);
  assert.equal(parsed.strings['„{0}“ wurde erstellt.'], undefined);
  assert.throws(() => parsePack('{ kaputt', DICT), /keine gültige Sprachdatei/);
  assert.throws(() => parsePack(JSON.stringify({ ...t, code: 'en' }), DICT), /fest eingebaut/);
  assert.throws(() => parsePack(JSON.stringify({ ...t, code: 'Türkisch!' }), DICT), /Sprachcode/);
  assert.throws(() => parsePack(JSON.stringify({ ...t, name: ' ' }), DICT), /Name der Sprache/);
  assert.throws(() => parsePack(JSON.stringify({ ...t, strings: { Unbekannt1: 'x' } }), DICT), /keine verwendbaren/);
  assert.throws(() => parsePack(JSON.stringify({ ...t, format: 2 }), DICT), /neueren/);
});

test('Prototyp-Schlüssel in Sprachdateien richten nichts an', () => {
  const t = template();
  const text = JSON.stringify(t).replace('"strings":{', '"strings":{"__proto__":"x","constructor":"y",');
  const parsed = parsePack(text, DICT);
  assert.equal(Object.getPrototypeOf(parsed.strings), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.equal(mergePack(DICT, null), DICT);
});

console.log(`\n${passed} Übersetzungs-Tests bestanden`);
fs.rmSync(work, { recursive: true, force: true });
process.exit(0);
