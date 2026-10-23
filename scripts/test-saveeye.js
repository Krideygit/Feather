const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-saveeye-'));
const stub = path.join(work, 'electron-stub.js');
fs.writeFileSync(stub, 'module.exports = {};');
const out = path.join(work, 'saveeye.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src', 'main', 'saveeye.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: out, alias: { electron: stub }, logLevel: 'error' });
const { parseCaptureRegistry, activeNames, Saveeye } = require(out);

const B = String.fromCharCode(92);
const base = ['HKEY_CURRENT_USER', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'CapabilityAccessManager', 'ConsentStore', 'graphicsCaptureProgrammatic'].join(B);
const block = (leaf, start, stop) => `${base}${B}${leaf}\n    Value    REG_SZ    Allow\n    LastUsedTimeStart    REG_QWORD    ${start}\n    LastUsedTimeStop    REG_QWORD    ${stop}\n`;
const sample = [
  base,
  `${base}${B}NonPackaged`,
  block(`NonPackaged${B}C:#Users#me#AppData#Local#Discord#app-1.0.9#Discord.exe`.split(`NonPackaged${B}`)[1], '0x1dc5a1b2c3d4e5f', '0x0'),
  block('C:#Program Files#obs-studio#bin#64bit#obs64.exe', '0x1dc5a1b2c3d4e5f', '0x1dc5a1b2c3d9999'),
  block('Microsoft.ScreenSketch_8wekyb3d8bbwe', '0x1dc5a1b2c3d4e5f', '0x1dc5a1b2c3d4e50'),
  block('C:#Program Files#Feather#Feather.exe', '0x1dc5a1b2c3d4e5f', '0x0'),
  block('C:#Tools#never.exe', '0x0', '0x0'),
].join('\n');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ', name);
}

test('Registry-Ausgabe: aktive und beendete Aufnahmen werden unterschieden', () => {
  const sources = parseCaptureRegistry(sample);
  const byName = Object.fromEntries(sources.map((s) => [s.app.split(B).pop(), s.active]));
  assert.equal(byName['Discord.exe'], true);
  assert.equal(byName['obs64.exe'], false);
  assert.equal(byName['Microsoft.ScreenSketch_8wekyb3d8bbwe'], true);
  assert.equal(byName['Feather.exe'], true);
  assert.ok(!('never.exe' in byName), 'nie benutzte Programme zählen nicht');
  assert.deepEqual(parseCaptureRegistry(''), []);
});

test('Veraltete Einträge ohne laufendes Programm lösen keinen Alarm aus', () => {
  const sources = parseCaptureRegistry(sample);
  assert.deepEqual(activeNames(sources, new Set(['discord.exe', 'obs64.exe'])).sort(), ['Discord', 'Microsoft.ScreenSketch_8wekyb3d8bbwe']);
  assert.deepEqual(activeNames(sources, new Set(['obs64.exe'])), ['Microsoft.ScreenSketch_8wekyb3d8bbwe'], 'Discord läuft nicht mehr, der Eintrag ist veraltet');
  assert.ok(!activeNames(sources, null).includes('Feather'), 'Feather ignoriert sich selbst');
});

function harness(initial) {
  const protection = [];
  const notices = [];
  const win = { isDestroyed: () => false, setContentProtection: (on) => protection.push(on) };
  const eye = new Saveeye(() => win, (n) => notices.push(n));
  eye.configure({ enabled: true, mode: 'ask', blurOnBlur: false, ...initial });
  protection.length = 0;
  notices.length = 0;
  return { eye, protection, notices };
}

test('Nachfragen-Modus: Aufnahme schützt sofort und meldet sich', () => {
  const { eye, protection, notices } = harness({});
  eye.update(['Discord'], false);
  assert.deepEqual(protection, [true]);
  assert.deepEqual(notices, [{ active: true, sources: ['Discord'], transient: false }]);
  eye.update(['Discord'], false);
  assert.equal(notices.length, 1, 'gleiche Quellen melden nichts erneut');
});

test('Antwort Ja gibt Feather frei, Nein hält den Schutz', () => {
  const { eye, protection } = harness({});
  eye.update(['OBS'], false);
  eye.answer(true);
  assert.deepEqual(protection, [true, false]);
  eye.answer(false);
  assert.deepEqual(protection, [true, false, true]);
});

test('Ende der Aufnahme hebt den Schutz wieder auf', () => {
  const { eye, protection, notices } = harness({});
  eye.update(['Zoom'], false);
  eye.update([], false);
  assert.deepEqual(protection, [true, false]);
  assert.equal(notices.at(-1).active, false);
});

test('Modus „Immer geschützt“ schützt dauerhaft und fragt nie', () => {
  const protection = [];
  const notices = [];
  const eye = new Saveeye(() => ({ isDestroyed: () => false, setContentProtection: (on) => protection.push(on) }), (n) => notices.push(n));
  eye.configure({ enabled: true, mode: 'always', blurOnBlur: false });
  assert.equal(protection.at(-1), true);
  eye.trigger('Screenshot-Taste');
  eye.update(['Discord'], false);
  assert.equal(protection.at(-1), true, 'Schutz bleibt an');
  eye.configure({ enabled: false, mode: 'always', blurOnBlur: false });
  assert.equal(protection.at(-1), false, 'Ausschalten hebt den Schutz auf');
});

test('Screenshot-Taste löst eine kurze Meldung aus, ausgeschaltet nichts', () => {
  const { eye, notices } = harness({});
  eye.trigger('Screenshot-Taste');
  assert.deepEqual(notices[0], { active: true, sources: ['Screenshot-Taste'], transient: true });
  eye.stop();
  const off = harness({ enabled: false });
  off.eye.trigger('Screenshot-Taste');
  off.eye.update(['Discord'], false);
  assert.equal(off.notices.length, 0);
});

console.log(`\n${passed} Saveeye-Tests bestanden`);
fs.rmSync(work, { recursive: true, force: true });
process.exit(0);
