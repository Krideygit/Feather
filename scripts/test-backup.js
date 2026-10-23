const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-backup-test-'));
const machineA = path.join(work, 'machine-a');
const machineB = path.join(work, 'machine-b');
for (const dir of [machineA, machineB]) fs.mkdirSync(dir, { recursive: true });
process.env.TEST_USERDATA = machineA;

const stub = path.join(work, 'electron-stub.js');
fs.writeFileSync(
  stub,
  `module.exports = {
    app: { getPath: (name) => (name === 'userData' ? process.env.TEST_USERDATA : require('node:os').tmpdir()), getVersion: () => '9.9.9' },
    safeStorage: { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async (s) => Buffer.from('enc:' + s), decryptStringAsync: async (b) => ({ shouldReEncrypt: false, result: b.toString().slice(4) }) },
    ipcMain: { handle() {}, on() {} },
  };`,
);

const out = path.join(work, 'backup.cjs');
esbuild.buildSync({
  stdin: {
    contents: "export * from './src/main/backup'; export * as vault from './src/main/remote/vault'; export * as creds from './src/main/remote/creds'; export * as settings from './src/main/settings';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: out,
  alias: { electron: stub },
  logLevel: 'error',
});
const lib = require(out);

function fakeCore(home) {
  const calls = [];
  return {
    calls,
    async call(method, params = {}) {
      calls.push({ method, params });
      if (method === 'app.info') return { home };
      if (method === 'profile.list') return { profiles: [{ id: 'p1', name: 'Standard' }, { id: 'p2', name: 'Arbeit' }] };
      if (method === 'profile.export') {
        fs.writeFileSync(params.file, Buffer.from(`profil-${params.id}-${params.includeData}`));
        return {};
      }
      if (method === 'plugin.install') {
        assert.ok(fs.existsSync(params.file), 'Plugin-Datei existiert beim Installieren');
        calls.at(-1).content = fs.readFileSync(params.file, 'utf8');
        return {};
      }
      if (method === 'profile.import') {
        calls.at(-1).content = fs.readFileSync(params.file, 'utf8');
        return {};
      }
      throw new Error(`unerwartet: ${method}`);
    },
  };
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

async function main() {
  const homeA = path.join(work, 'home-a');
  fs.mkdirSync(path.join(homeA, 'plugins', 'data'), { recursive: true });
  fs.writeFileSync(path.join(homeA, 'plugins', 'demo.jar'), 'JAR-INHALT');
  fs.writeFileSync(path.join(homeA, 'plugins', 'data', 'demo.json'), '{"state":"off"}');

  const host = await lib.vault.save({ name: 'Prod', protocol: 'ssh', host: 'example.org', port: 22, username: 'root', auth: 'password', keyPath: '', secure: 'none', ignoreCertErrors: false, startPath: '', color: '#ef4444', password: 'server-geheim' });
  const cred = await lib.creds.save({ label: 'Shop', kind: 'ssh', hostKey: `host:${host.id}`, dbHost: '127.0.0.1', port: 3306, user: 'app', password: 'db-geheim', database: 'shop', source: 'install' });
  lib.vault.trustFingerprint('example.org', 22, 'SHA256:abc');
  lib.settings.set({ theme: 'mein-thema', themes: [{ id: 'mein-thema', name: 'Mein Thema', mode: 'dark', accent: '#ff00aa', hue: 200, saturation: 20 }], language: 'en', saveeye: { enabled: true, mode: 'always', blurOnBlur: true } });

  const file = path.join(work, 'sicherung.featherbackup');
  const coreA = fakeCore(homeA);

  await test('Sicherung mit Passwort wird erstellt', async () => {
    const result = await lib.createBackup(coreA, { file, password: 'backup-pw', includeData: true });
    assert.deepEqual([result.profiles, result.hosts, result.connections, result.plugins, result.encrypted], [2, 1, 1, 1, true]);
    assert.ok(result.bytes > 100);
    assert.deepEqual(coreA.calls.filter((c) => c.method === 'profile.export').map((c) => c.params.includeData), [true, true]);
  });

  await test('Passwörter stehen nicht im Klartext in der Sicherung', async () => {
    const bytes = fs.readFileSync(file).toString('latin1');
    for (const secret of ['server-geheim', 'db-geheim', 'backup-pw']) assert.ok(!bytes.includes(secret), `${secret} im Klartext gefunden`);
    assert.ok(fs.readdirSync(work).every((f) => !f.endsWith('.part')), 'keine Reste');
  });

  await test('Inhalt der Sicherung lässt sich vorab ansehen', async () => {
    const info = await lib.inspectBackup(file);
    assert.deepEqual([info.profiles, info.hosts, info.connections, info.plugins, info.encrypted, info.includesData, info.appVersion], [['Standard', 'Arbeit'], 1, 1, 1, true, true, '9.9.9']);
    const bogus = path.join(work, 'bogus.featherbackup');
    fs.writeFileSync(bogus, 'kein zip');
    await assert.rejects(lib.inspectBackup(bogus), /keine gültige Feather-Sicherung/);
  });

  await test('Wiederherstellen auf einem anderen Rechner stellt alles wieder her', async () => {
    process.env.TEST_USERDATA = machineB;
    assert.deepEqual(lib.vault.list(), []);
    const homeB = path.join(work, 'home-b');
    fs.mkdirSync(homeB, { recursive: true });
    const coreB = fakeCore(homeB);
    await assert.rejects(lib.restoreBackup(coreB, { file, password: '' }), /Passwort geschützt/);
    await assert.rejects(lib.restoreBackup(coreB, { file, password: 'falsch' }), /Passwort der Sicherung ist falsch/);
    assert.deepEqual(lib.vault.list(), [], 'Fehlversuche ändern nichts');

    const report = await lib.restoreBackup(coreB, { file, password: 'backup-pw' });
    assert.deepEqual([report.settings, report.hosts, report.connections, report.plugins, report.profiles, report.skippedSecrets, report.warnings], [true, 1, 1, 1, 2, false, []]);

    const hosts = lib.vault.list();
    assert.deepEqual([hosts[0].id, hosts[0].name, hosts[0].hasPassword, hosts[0].color], [host.id, 'Prod', true, '#ef4444']);
    assert.equal((await lib.vault.resolve(host.id)).password, 'server-geheim');
    assert.equal(await lib.creds.reveal(cred.id), 'db-geheim');
    assert.equal(lib.creds.list()[0].database, 'shop');
    assert.equal(lib.vault.knownFingerprint('example.org', 22), 'SHA256:abc');
    const settings = lib.settings.get();
    assert.deepEqual([settings.theme, settings.themes[0].accent, settings.language, settings.saveeye.mode], ['mein-thema', '#ff00aa', 'en', 'always']);
    assert.equal(coreB.calls.find((c) => c.method === 'plugin.install').content, 'JAR-INHALT');
    assert.equal(fs.readFileSync(path.join(homeB, 'plugins', 'data', 'demo.json'), 'utf8'), '{"state":"off"}');
    assert.deepEqual(coreB.calls.filter((c) => c.method === 'profile.import').map((c) => c.content).sort(), ['profil-p1-true', 'profil-p2-true']);
  });

  await test('Sicherung ohne Passwort enthält keine Geheimnisse und meldet das', async () => {
    process.env.TEST_USERDATA = machineA;
    const plain = path.join(work, 'plain.featherbackup');
    const result = await lib.createBackup(fakeCore(homeA), { file: plain, password: '', includeData: false });
    assert.equal(result.encrypted, false);
    assert.ok(!fs.readFileSync(plain).toString('latin1').includes('server-geheim'));
    process.env.TEST_USERDATA = path.join(work, 'machine-c');
    fs.mkdirSync(process.env.TEST_USERDATA, { recursive: true });
    const core = fakeCore(path.join(work, 'home-c'));
    const report = await lib.restoreBackup(core, { file: plain, password: '' });
    assert.equal(report.skippedSecrets, true);
    assert.equal(lib.vault.list()[0].hasPassword, false);
    assert.equal(core.calls.filter((c) => c.method === 'profile.import').length, 2);
  });

  console.log(`\n${passed} Sicherungs-Tests bestanden`);
}

main()
  .then(() => 0)
  .catch((err) => {
    console.error(err);
    return 1;
  })
  .then((code) => {
    fs.rmSync(work, { recursive: true, force: true });
    process.exit(code);
  });
