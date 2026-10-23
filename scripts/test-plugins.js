const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-plugins-'));
const coreJar = process.env.FEATHER_CORE_JAR || path.join(root, 'core', 'feather-core.jar');
const classes = path.join(root, 'core', 'out');
const tool = (name) => (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name);

function makeJar(name, files) {
  const dir = path.join(work, `${name}.src`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  const jar = path.join(work, `${name}.jar`);
  execFileSync(tool('jar'), ['--create', '--file', jar, '-C', dir, '.']);
  return jar;
}

function compileJar(name, className, source, manifest) {
  const dir = path.join(work, `${name}.build`);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  const srcFile = path.join(dir, 'src', `${className}.java`);
  fs.writeFileSync(srcFile, source);
  const out = path.join(dir, 'classes');
  fs.mkdirSync(out, { recursive: true });
  execFileSync(tool('javac'), ['--release', '17', '-cp', classes, '-d', out, srcFile]);
  fs.writeFileSync(path.join(out, 'feather-plugin.json'), JSON.stringify(manifest));
  const jar = path.join(work, `${name}.jar`);
  execFileSync(tool('jar'), ['--create', '--file', jar, '-C', out, '.']);
  return jar;
}

class Core {
  constructor() {
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.proc = spawn('java', ['-jar', coreJar], { env: { ...process.env, FEATHER_HOME: path.join(work, 'home') }, stdio: ['pipe', 'pipe', 'inherit'] });
    this.ready = new Promise((resolve) => {
      readline.createInterface({ input: this.proc.stdout }).on('line', (line) => {
        const msg = JSON.parse(line);
        if (msg.event) {
          this.events.push(msg);
          if (msg.event === 'core.ready') resolve();
        } else if (this.pending.has(msg.id)) {
          const { resolve: ok, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error));
          else ok(msg.result);
        }
      });
    });
  }

  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  eventsOf(name) {
    return this.events.filter((e) => e.event === name).map((e) => e.data);
  }

  stop() {
    this.proc.stdin.end();
    this.proc.kill();
  }
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('ok  ', name);
  } catch (err) {
    console.log('FAIL', name);
    throw err;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(30);
  }
  assert.fail('Zeitüberschreitung');
}

async function main() {
  if (!fs.existsSync(path.join(classes, 'feather', 'api', 'FeatherPlugin.class'))) throw new Error('Zuerst den Core bauen (npm run build:core).');
  execFileSync(process.execPath, [path.join(__dirname, 'build-plugins.js')], { stdio: 'ignore' });
  const sample = path.join(root, 'plugins-dist', 'rainbow-icons.jar');
  const core = new Core();
  await core.ready;

  await test('Beispielplugin wird installiert und liefert Buttons, Stylesheet und Ansicht', async () => {
    const view = await core.call('plugin.install', { file: sample });
    assert.deepEqual([view.id, view.name, view.author, view.version, view.main, view.running, view.error], ['rainbow-icons', 'Rainbow Icons', 'Kridey', '1.0.0', 'dev.feather.rainbow.RainbowIcons', true, null]);
    const [c] = await core.call('plugin.contributions');
    assert.equal(c.plugin, 'rainbow-icons');
    assert.equal(c.buttons.length, 1);
    assert.deepEqual([c.buttons[0].id, c.buttons[0].label, c.buttons[0].location, c.buttons[0].icon], ['toggle', 'Regenbogen an', 'server.tabbar', '🌈']);
    assert.match(c.css[0].css, /@keyframes feather-rainbow/);
    assert.match(c.css[0].css, /\[data-feather-area="server"\] svg\.lucide/);
    assert.equal(c.views[0].id, 'rainbow');
    assert.deepEqual(c.views[0].blocks.map((b) => b.type), ['heading', 'text', 'divider', 'text', 'button']);
    assert.ok(fs.existsSync(path.join(work, 'home', 'plugins', 'rainbow-icons.jar')));
  });

  await test('Button-Klick schaltet den Regenbogen aus und wieder an', async () => {
    const before = core.eventsOf('plugin.action').length;
    await core.call('plugin.event', { name: 'button.click', data: { plugin: 'rainbow-icons', id: 'toggle' } });
    await waitFor(() => core.eventsOf('plugin.action').length > before);
    let [c] = await core.call('plugin.contributions');
    assert.equal(c.css.length, 0, 'Stylesheet entfernt');
    assert.equal(c.buttons[0].label, 'Regenbogen aus');
    const toast = core.eventsOf('plugin.action').pop();
    assert.deepEqual([toast.action, toast.message, toast.kind], ['toast', 'Regenbogen-Icons sind aus.', 'success']);
    await core.call('plugin.event', { name: 'view.action', data: { plugin: 'rainbow-icons', view: 'rainbow', id: 'toggle' } });
    await waitFor(async () => true);
    await sleep(150);
    [c] = await core.call('plugin.contributions');
    assert.equal(c.css.length, 1, 'Stylesheet wieder da');
    assert.equal(c.views[0].blocks[4].label, 'Ausschalten');
  });

  await test('Plugin-Zustand bleibt gespeichert (Storage)', async () => {
    await core.call('plugin.event', { name: 'button.click', data: { plugin: 'rainbow-icons', id: 'toggle' } });
    await sleep(200);
    const data = JSON.parse(fs.readFileSync(path.join(work, 'home', 'plugins', 'data', 'rainbow-icons.json'), 'utf8'));
    assert.equal(data.state, 'off');
  });

  await test('Deaktivieren entfernt alle Beiträge, Aktivieren stellt sie wieder her', async () => {
    const off = await core.call('plugin.setEnabled', { id: 'rainbow-icons', enabled: false });
    assert.equal(off.enabled, false);
    assert.equal(off.running, false);
    assert.deepEqual(await core.call('plugin.contributions'), []);
    const on = await core.call('plugin.setEnabled', { id: 'rainbow-icons', enabled: true });
    assert.equal(on.running, true);
    const [c] = await core.call('plugin.contributions');
    assert.equal(c.css.length, 0, 'gespeicherter Zustand „aus“ wird übernommen');
    assert.equal(c.buttons[0].label, 'Regenbogen aus');
  });

  await test('Sitzungs-Ereignisse erreichen Plugins', async () => {
    const jar = compileJar(
      'sessions',
      'SessionPlugin',
      `import feather.api.*;
      public class SessionPlugin implements FeatherPlugin {
        public void onEnable(PluginAPIManager api) {
          api.events().on("session.opened", e -> api.ui().toast("offen:" + e.string("name") + ":" + api.terminal().sessions().size(), "info"));
          api.events().on("session.closed", e -> api.ui().toast("zu:" + api.terminal().sessions().size(), "info"));
          api.ui().addButton(ButtonSpec.of("print").label("P").location(Locations.TERMINAL_TOOLBAR).onClick(e -> { api.terminal().print("", "hallo\\nwelt"); api.terminal().send("abc", "ls\\r"); }));
        }
      }`,
      { name: 'Session Test', author: 'Test', version: '0.1', main: 'SessionPlugin' },
    );
    await core.call('plugin.install', { file: jar });
    const mark = core.eventsOf('plugin.action').length;
    await core.call('plugin.event', { name: 'session.opened', data: { sid: 's1', name: 'Server A' } });
    await core.call('plugin.event', { name: 'session.closed', data: { sid: 's1', name: 'Server A' } });
    await core.call('plugin.event', { name: 'button.click', data: { plugin: 'session-test', id: 'print' } });
    await waitFor(() => core.eventsOf('plugin.action').length >= mark + 4);
    const actions = core.eventsOf('plugin.action').slice(mark).filter((a) => a.plugin === 'session-test');
    assert.deepEqual(actions.map((a) => a.message ?? `${a.action}:${a.session}:${JSON.stringify(a.text)}`), ['offen:Server A:1', 'zu:0', 'terminal.print::"hallo\\nwelt"', 'terminal.send:abc:"ls\\r"']);
  });

  await test('Fehlerhafte Plugin-Dateien werden mit klaren Meldungen abgelehnt', async () => {
    const bad = async (name, files, pattern) => {
      const jar = makeJar(name, files);
      await assert.rejects(core.call('plugin.install', { file: jar }), pattern);
    };
    await bad('no-manifest', { 'a.txt': 'x' }, /keine feather-plugin\.json/);
    await bad('no-author', { 'feather-plugin.json': JSON.stringify({ main: 'a.B', version: '1' }) }, /Pflichtfeld "author"/);
    await bad('no-main', { 'feather-plugin.json': JSON.stringify({ author: 'x', version: '1' }) }, /Pflichtfeld "main"/);
    await bad('no-version', { 'feather-plugin.json': JSON.stringify({ author: 'x', main: 'a.B' }) }, /Pflichtfeld "version"/);
    await bad('bad-json', { 'feather-plugin.json': '{ kaputt' }, /kein gültiges JSON/);
    await bad('bad-main', { 'feather-plugin.json': JSON.stringify({ author: 'x', main: 'a b;c', version: '1' }) }, /kein gültiger Klassenname/);
    await bad('missing-class', { 'feather-plugin.json': JSON.stringify({ author: 'x', main: 'gibt.es.nicht', version: '1' }) }, /nicht gefunden/);
    await bad('future', { 'feather-plugin.json': JSON.stringify({ author: 'x', main: 'a.B', version: '1', apiVersion: 99 }) }, /neuere Feather-Version/);
    const notJar = path.join(work, 'x.jar');
    fs.writeFileSync(notJar, 'das ist keine jar');
    await assert.rejects(core.call('plugin.install', { file: notJar }), /keine gültige \.jar/);
    const names = (await core.call('plugin.list')).map((p) => p.id).sort();
    assert.deepEqual(names, ['rainbow-icons', 'session-test'], 'abgelehnte Plugins hinterlassen nichts');
  });

  await test('Plugin mit Fehler in onEnable wird nicht installiert', async () => {
    const jar = compileJar('broken', 'Broken', 'import feather.api.*; public class Broken implements FeatherPlugin { public void onEnable(PluginAPIManager api) { throw new IllegalStateException("kaputt beim Start"); } }', { name: 'Broken', author: 'x', version: '1', main: 'Broken' });
    await assert.rejects(core.call('plugin.install', { file: jar }), /kaputt beim Start/);
    assert.equal((await core.call('plugin.list')).some((p) => p.id === 'broken'), false);
  });

  await test('Neuinstallation ersetzt die alte Version', async () => {
    const jar = compileJar('rb2', 'Other', 'import feather.api.*; public class Other implements FeatherPlugin { public void onEnable(PluginAPIManager api) { api.ui().toast("v2", "info"); } }', { name: 'Rainbow Icons', author: 'Kridey', version: '2.0.0', main: 'Other' });
    const view = await core.call('plugin.install', { file: jar });
    assert.equal(view.version, '2.0.0');
    assert.equal((await core.call('plugin.list')).filter((p) => p.id === 'rainbow-icons').length, 1);
  });

  await test('Plugins überleben einen Neustart und lassen sich entfernen', async () => {
    core.stop();
    await sleep(500);
    const again = new Core();
    await again.ready;
    const list = await again.call('plugin.list');
    assert.deepEqual(list.map((p) => [p.id, p.running]).sort(), [['rainbow-icons', true], ['session-test', true]]);
    await again.call('plugin.remove', { id: 'session-test' });
    assert.equal((await again.call('plugin.list')).some((p) => p.id === 'session-test'), false);
    assert.ok(!fs.existsSync(path.join(work, 'home', 'plugins', 'session-test.jar')));
    again.stop();
  });

  console.log(`\n${passed} Plugin-Tests bestanden`);
}

main()
  .then(() => 0)
  .catch((err) => {
    console.error(err);
    return 1;
  })
  .then((code) => {
    setTimeout(() => {
      fs.rmSync(work, { recursive: true, force: true });
      process.exit(code);
    }, 300);
  });
