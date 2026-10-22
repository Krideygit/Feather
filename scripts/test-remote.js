const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const esbuild = require('esbuild');
const { utils } = require('ssh2');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-remote-'));
const userData = path.join(work, 'userdata');
fs.mkdirSync(userData);
process.env.TEST_USERDATA = userData;

const stub = path.join(work, 'electron-stub.js');
fs.writeFileSync(
  stub,
  `module.exports = {
    app: { getPath: () => process.env.TEST_USERDATA },
    safeStorage: { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async (s) => Buffer.from('enc:' + s), decryptStringAsync: async (b) => ({ shouldReEncrypt: false, result: b.toString().slice(4) }) },
    ipcMain: { handle() {}, on() {} },
  };`,
);

function loadModules() {
  const out = path.join(work, 'remote.cjs');
  esbuild.buildSync({
    stdin: {
      contents: "export * from './src/main/remote/session'; export * from './src/main/remote/transfers'; export * from './src/main/remote/vault'; export * from './src/main/remote/backends';",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: out,
    external: ['*.node', 'cpu-features'],
    alias: { electron: stub },
    logLevel: 'error',
  });
  return require(out);
}

const { startSshServer, PASS, USER } = require('./test-ssh-server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bundle = loadModules();
const { Session, Transfers, normalize, knownFingerprint } = bundle;

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(name);
    console.log('ok  ', name);
  } catch (err) {
    console.log('FAIL', name);
    throw err;
  }
}

const spec = (extra) =>
  Object.assign(
    { id: '', name: 'Test', protocol: 'ssh', host: '127.0.0.1', port: 0, username: USER, auth: 'password', keyPath: '', secure: 'none', ignoreCertErrors: false, startPath: '', color: '#0ea5e9', createdAt: 0, lastUsed: null, password: PASS, passphrase: '' },
    extra,
  );

async function rejects(promise, code) {
  try {
    await promise;
  } catch (err) {
    assert.equal(err.code, code, `erwartet ${code}, bekam ${err.code}: ${err.message}`);
    return err;
  }
  assert.fail(`erwartete Fehler ${code}`);
}

async function waitFor(check, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(25);
  }
  assert.fail('Zeitüberschreitung beim Warten');
}

async function main() {
  const serverRoot = path.join(work, 'server');
  fs.mkdirSync(serverRoot);
  const hostKey = utils.generateKeyPairSync('ed25519').private;
  const clientPair = utils.generateKeyPairSync('ed25519');
  const keyFile = path.join(work, 'id_test');
  fs.writeFileSync(keyFile, clientPair.private);
  const clientPub = utils.parseKey(clientPair.public);

  const ssh = await startSshServer(serverRoot, hostKey, clientPub);
  const events = [];
  const emit = (name, data) => events.push({ name, data });
  const make = (extra) => new Session(`s-${crypto.randomUUID()}`, spec({ port: ssh.port, ...extra }), emit);

  let fingerprint;
  await test('Verbindungsspeicher: Passwort verschlüsselt, nie im Klartext lesbar', async () => {
    const saved = await bundle.save({ name: 'Prod', protocol: 'ssh', host: 'example.org', port: 22, username: 'root', auth: 'password', keyPath: '', secure: 'none', ignoreCertErrors: false, startPath: '', color: '#0ea5e9', password: 'geheim-xyz' });
    assert.equal(saved.hasPassword, true);
    assert.equal('password' in saved, false);
    const file = fs.readFileSync(path.join(userData, 'remote-hosts.json'), 'utf8');
    assert.ok(!file.includes('geheim-xyz'), 'Passwort steht im Klartext in der Datei');
    assert.equal((await bundle.resolve(saved.id)).password, 'geheim-xyz');
    const kept = await bundle.save({ ...saved, password: undefined, name: 'Prod 2' });
    assert.equal(kept.hasPassword, true, 'leeres Feld behält das Passwort');
    const cleared = await bundle.save({ ...saved, password: null });
    assert.equal(cleared.hasPassword, false, 'null entfernt das Passwort');
    assert.equal(bundle.list().length, 1);
    bundle.remove(saved.id);
    assert.equal(bundle.list().length, 0);
  });

  await test('Verbindungsspeicher: ungültige Eingaben werden abgelehnt', async () => {
    const base = { name: '', protocol: 'ssh', host: 'h', port: 22, username: 'u', auth: 'password', keyPath: '', secure: 'none', ignoreCertErrors: false, startPath: '', color: '#0ea5e9' };
    assert.throws(() => normalize({ ...base, host: '' }), /Host/);
    assert.throws(() => normalize({ ...base, host: 'a b' }), /Host/);
    assert.throws(() => normalize({ ...base, port: 70000 }), /Port/);
    assert.throws(() => normalize({ ...base, username: ' ' }), /Benutzername/);
    assert.throws(() => normalize({ ...base, auth: 'key', keyPath: '' }), /Schlüssel/);
    assert.equal(normalize({ ...base, protocol: 'ftp', username: '' }).username, 'anonymous');
    assert.equal(normalize({ ...base, color: 'rot' }).color, '#0ea5e9');
  });

  await test('SSH: unbekannter Host-Schlüssel wird gemeldet, aber nicht gespeichert', async () => {
    const err = await rejects(make().connect(), 'hostkey-new');
    fingerprint = err.data.fingerprint;
    assert.match(fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
    assert.equal(knownFingerprint('127.0.0.1', ssh.port), undefined);
  });

  await test('SSH: falsches Passwort wird als auth gemeldet', async () => {
    await rejects(make({ password: 'falsch' }).connect(fingerprint), 'auth');
    assert.equal(knownFingerprint('127.0.0.1', ssh.port), fingerprint, 'Vertrauen wurde gespeichert');
  });

  await test('SSH: Passwort-Anmeldung mit bekanntem Schlüssel', async () => {
    const s = make();
    await s.connect();
    assert.ok(s.open && s.fs);
    s.close();
  });

  await test('SSH: Schlüssel-Anmeldung', async () => {
    const s = make({ auth: 'key', keyPath: keyFile, password: '' });
    await s.connect();
    assert.ok(s.open);
    s.close();
  });

  await test('SSH: fehlendes Passwort wird verlangt', async () => {
    await rejects(make({ password: '' }).connect(), 'need-password');
  });

  await test('SSH: geänderter Host-Schlüssel wird blockiert', async () => {
    const other = await startSshServer(serverRoot, utils.generateKeyPairSync('ed25519').private, clientPub);
    const vault = bundle;
    vault.trustFingerprint('127.0.0.1', other.port, fingerprint);
    const s = new Session('x', spec({ port: other.port }), emit);
    const err = await rejects(s.connect(), 'hostkey-changed');
    assert.equal(err.data.known, fingerprint);
    assert.notEqual(err.data.fingerprint, fingerprint);
    const again = new Session('y', spec({ port: other.port }), emit);
    await again.connect(err.data.fingerprint);
    again.close();
    other.server.close();
  });

  await test('SSH: Verbindung zu geschlossenem Port liefert verständliche Meldung', async () => {
    const closed = await startSshServer(serverRoot, hostKey, clientPub);
    const port = closed.port;
    closed.server.close();
    await sleep(50);
    const err = await rejects(new Session('z', spec({ port }), emit).connect(), 'generic');
    assert.match(err.message, /abgelehnt|nicht erreichbar|Zeit/i);
  });

  const session = make();
  await session.connect();
  const transfers = new Transfers(session.sid, emit, () => session.fs);
  const fsx = session.fs;

  await test('SSH: Terminal sendet und empfängt Daten, Größe wird übernommen', async () => {
    await session.startShell(100, 30);
    await waitFor(() => events.some((e) => e.name === 'term.data' && e.data.data.includes('Willkommen')));
    session.write('hallo\r');
    await waitFor(() => events.some((e) => e.name === 'term.data' && e.data.data.includes('ECHO:hallo')));
    session.resize(132, 43);
    await waitFor(() => ssh.state.window?.cols === 132 && ssh.state.window?.rows === 43);
    session.write('exit\r');
    await waitFor(() => events.some((e) => e.name === 'term.exit'));
  });

  await test('SFTP: Ordner anlegen, Datei anlegen, auflisten', async () => {
    assert.equal(await fsx.home(), '/');
    await fsx.mkdir('/projekt');
    await fsx.touch('/projekt/leer.txt');
    await assert.rejects(fsx.touch('/projekt/leer.txt'), 'doppeltes Anlegen muss scheitern');
    const list = await fsx.list('/');
    assert.deepEqual(list.map((e) => [e.name, e.type]), [['projekt', 'dir']]);
    const inner = await fsx.list('/projekt');
    assert.equal(inner[0].name, 'leer.txt');
    assert.equal(inner[0].type, 'file');
    assert.equal(inner[0].size, 0);
    assert.equal(inner[0].owner, 'tester');
  });

  await test('SFTP: Text schreiben und lesen (Umlaute)', async () => {
    const text = 'Grüße aus Köln ✓\nzweite Zeile\n';
    await fsx.write('/projekt/notiz.txt', Buffer.from(text, 'utf8'));
    assert.equal((await fsx.read('/projekt/notiz.txt', 1024)).toString('utf8'), text);
    await assert.rejects(fsx.read('/projekt/notiz.txt', 5), 'zu große Datei wird abgelehnt');
  });

  await test('SFTP: umbenennen, Rechte ändern, löschen', async () => {
    await fsx.rename('/projekt/notiz.txt', '/projekt/neu.txt');
    await fsx.chmod('/projekt/neu.txt', 0o600);
    const entry = (await fsx.list('/projekt')).find((e) => e.name === 'neu.txt');
    assert.ok(entry, 'umbenannte Datei fehlt');
    assert.equal(entry.mode & 0o777, process.platform === 'win32' ? entry.mode & 0o777 : 0o600);
    await fsx.removeFile('/projekt/neu.txt');
    assert.equal(await fsx.stat('/projekt/neu.txt'), null);
  });

  const localDir = path.join(work, 'local');
  fs.mkdirSync(path.join(localDir, 'seite', 'img'), { recursive: true });
  fs.writeFileSync(path.join(localDir, 'seite', 'index.html'), '<h1>Hallo</h1>');
  fs.writeFileSync(path.join(localDir, 'seite', 'img', 'a.bin'), crypto.randomBytes(300_000));
  fs.writeFileSync(path.join(localDir, 'seite', 'leer-ordner-datei.txt'), '');
  fs.mkdirSync(path.join(localDir, 'seite', 'leerer-ordner'));
  fs.writeFileSync(path.join(localDir, 'gross.bin'), crypto.randomBytes(6 * 1024 * 1024));

  const waitTransfer = async (tid) => {
    await waitFor(() => events.some((e) => e.name === 'transfer' && e.data.tid === tid && ['done', 'error', 'cancelled'].includes(e.data.state)), 30000);
    return events.filter((e) => e.name === 'transfer' && e.data.tid === tid).pop().data;
  };

  await test('Transfer: Ordner hochladen (rekursiv) und Fortschritt', async () => {
    const [tid] = transfers.upload('/projekt', [path.join(localDir, 'seite')]);
    const final = await waitTransfer(tid);
    assert.equal(final.state, 'done', final.error);
    assert.equal(final.files, 3);
    assert.equal(final.done, final.total);
    assert.equal(final.total, 14 + 300_000);
    assert.ok(fs.statSync(path.join(serverRoot, 'projekt', 'seite', 'leerer-ordner')).isDirectory());
    assert.ok(fs.readFileSync(path.join(serverRoot, 'projekt', 'seite', 'img', 'a.bin')).equals(fs.readFileSync(path.join(localDir, 'seite', 'img', 'a.bin'))));
  });

  await test('Transfer: große Datei hoch- und runterladen ist byte-identisch', async () => {
    const [up] = transfers.upload('/projekt', [path.join(localDir, 'gross.bin')]);
    assert.equal((await waitTransfer(up)).state, 'done');
    const target = path.join(work, 'download');
    fs.mkdirSync(target);
    const [down] = transfers.download([{ path: '/projekt/gross.bin', name: 'gross.bin', type: 'file', size: 6 * 1024 * 1024 }], target);
    assert.equal((await waitTransfer(down)).state, 'done');
    assert.ok(fs.readFileSync(path.join(target, 'gross.bin')).equals(fs.readFileSync(path.join(localDir, 'gross.bin'))));
  });

  await test('Transfer: Ordner herunterladen (rekursiv)', async () => {
    const target = path.join(work, 'download-dir');
    fs.mkdirSync(target);
    const [tid] = transfers.download([{ path: '/projekt/seite', name: 'seite', type: 'dir', size: 0 }], target);
    const final = await waitTransfer(tid);
    assert.equal(final.state, 'done', final.error);
    assert.equal(fs.readFileSync(path.join(target, 'seite', 'index.html'), 'utf8'), '<h1>Hallo</h1>');
    assert.ok(fs.statSync(path.join(target, 'seite', 'leerer-ordner')).isDirectory());
  });

  await test('Transfer: Abbrechen stoppt den Upload', async () => {
    const [tid] = transfers.upload('/projekt', [path.join(localDir, 'gross.bin')]);
    await sleep(30);
    transfers.cancel(tid);
    const final = await waitTransfer(tid);
    assert.ok(['cancelled', 'done'].includes(final.state), final.state);
    if (final.state === 'done') console.log('     (Upload war schon fertig, bevor der Abbruch ankam)');
  });

  await test('Transfer: fehlende Quelle meldet Fehler statt zu hängen', async () => {
    const [tid] = transfers.upload('/projekt', [path.join(localDir, 'gibt-es-nicht.txt')]);
    const final = await waitTransfer(tid);
    assert.equal(final.state, 'error');
    assert.ok(final.error);
  });

  await test('SFTP: Ordner rekursiv löschen', async () => {
    const removeTree = async (target, type) => {
      if (type !== 'dir') return fsx.removeFile(target);
      for (const c of await fsx.list(target)) await removeTree(c.path, c.type);
      await fsx.removeDir(target);
    };
    await removeTree('/projekt', 'dir');
    assert.equal(fs.readdirSync(serverRoot).length, 0);
  });

  await test('SSH: Verbindungsabbruch durch den Server wird gemeldet, eigenes Schließen nicht', async () => {
    const mark = events.length;
    ssh.dropAll();
    await waitFor(() => events.slice(mark).some((e) => e.name === 'session.closed' && e.data.sid === session.sid));
    assert.ok(!session.open);
    const quiet = make();
    await quiet.connect();
    const after = events.length;
    quiet.close();
    await sleep(150);
    assert.equal(events.slice(after).filter((e) => e.name === 'session.closed').length, 0);
    ssh.server.close();
  });

  await runFtp();

  console.log(`\n${results.length} Server-Tests bestanden`);
}

async function runFtp() {
  const FtpSrv = require('ftp-srv');
  const ftpRoot = path.join(work, 'ftproot');
  fs.mkdirSync(ftpRoot);
  const port = 40000 + Math.floor(Math.random() * 2000);
  const server = new FtpSrv({ url: `ftp://127.0.0.1:${port}`, anonymous: false, pasv_url: '127.0.0.1', pasv_min: port + 10, pasv_max: port + 60, log: require('bunyan').createLogger({ name: 'ftp', level: 100 }) });
  server.on('login', ({ username, password }, resolve, reject) => (username === USER && password === PASS ? resolve({ root: ftpRoot }) : reject(new Error('530 Login incorrect'))));
  await server.listen();

  const events = [];
  const emit = (name, data) => events.push({ name, data });
  const s = new Session('ftp1', spec({ protocol: 'ftp', port }), emit);

  await test('FTP: falsches Passwort wird als auth gemeldet', async () => {
    await rejects(new Session('ftp0', spec({ protocol: 'ftp', port, password: 'nope' }), emit).connect(), 'auth');
  });

  await test('FTP: anmelden und Wurzel auflisten', async () => {
    await s.connect();
    assert.equal(await s.fs.home(), '/');
    assert.deepEqual(await s.fs.list('/'), []);
  });

  await test('FTP: Ordner, Datei, Umbenennen, Schreiben, Lesen', async () => {
    const f = s.fs;
    await f.mkdir('/web');
    await f.touch('/web/index.html');
    await f.write('/web/index.html', Buffer.from('<p>Grüße</p>', 'utf8'));
    assert.equal((await f.read('/web/index.html', 1024)).toString('utf8'), '<p>Grüße</p>');
    await f.rename('/web/index.html', '/web/start.html');
    const list = await f.list('/web');
    assert.deepEqual(list.map((e) => [e.name, e.type, e.size]), [['start.html', 'file', Buffer.byteLength('<p>Grüße</p>')]]);
    await assert.rejects(f.touch('/web/start.html'));
  });

  await test('FTP: Ordner hochladen, herunterladen, löschen', async () => {
    const local = path.join(work, 'ftp-local');
    fs.mkdirSync(path.join(local, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(local, 'a', 'x.txt'), 'x');
    fs.writeFileSync(path.join(local, 'a', 'b', 'y.bin'), crypto.randomBytes(200_000));
    const t = new Transfers('ftp1', emit, () => s.fs);
    const wait = async (tid) => {
      await waitFor(() => events.some((e) => e.name === 'transfer' && e.data.tid === tid && ['done', 'error', 'cancelled'].includes(e.data.state)), 30000);
      return events.filter((e) => e.name === 'transfer' && e.data.tid === tid).pop().data;
    };
    const [up] = t.upload('/web', [path.join(local, 'a')]);
    const upDone = await wait(up);
    assert.equal(upDone.state, 'done', upDone.error);
    assert.ok(fs.readFileSync(path.join(ftpRoot, 'web', 'a', 'b', 'y.bin')).equals(fs.readFileSync(path.join(local, 'a', 'b', 'y.bin'))));
    const target = path.join(work, 'ftp-down');
    fs.mkdirSync(target);
    const [down] = t.download([{ path: '/web/a', name: 'a', type: 'dir', size: 0 }], target);
    const downDone = await wait(down);
    assert.equal(downDone.state, 'done', downDone.error);
    assert.equal(fs.readFileSync(path.join(target, 'a', 'x.txt'), 'utf8'), 'x');
    const rm = async (p, type) => {
      if (type !== 'dir') return s.fs.removeFile(p);
      for (const c of await s.fs.list(p)) await rm(c.path, c.type);
      await s.fs.removeDir(p);
    };
    await rm('/web', 'dir');
    assert.deepEqual(await s.fs.list('/'), []);
  });

  await test('FTP: Verbindung wird nach Abbruch neu aufgebaut', async () => {
    s.fs.client.close();
    assert.deepEqual(await s.fs.list('/'), []);
  });

  s.close();
  await server.close();
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
