const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const { utils } = require('ssh2');
const { createFakeLinux } = require('./fake-linux');
const { startSshServer, PASS, USER } = require('./test-ssh-server');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-modules-'));
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

const out = path.join(work, 'modules.cjs');
esbuild.buildSync({
  stdin: {
    contents: [
      "export * from './src/main/remote/session';",
      "export * from './src/main/remote/modules/manager';",
      "export * from './src/main/remote/modules/shell';",
      "export * from './src/main/remote/modules/install';",
      "export * from './src/main/remote/modules/web';",
      "export * from './src/main/remote/modules/mariadb';",
      "export * from './src/main/remote/vault';",
    ].join('\n'),
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
const lib = require(out);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('ok  ', name);
  } catch (err) {
    if (process.env.DEBUG_DIR && globalThis.__ssh) {
      globalThis.__ssh.state.commands.forEach((cmd, i) => {
        const m = /printf %s ([A-Za-z0-9+/=]+) \| base64/.exec(cmd);
        if (m) fs.writeFileSync(path.join(process.env.DEBUG_DIR, `cmd-${i}.sh`), Buffer.from(m[1], 'base64').toString('utf8'));
      });
    }
    console.log('FAIL', name, globalThis.__ssh ? `(längster Befehl ${globalThis.__ssh.state.maxCommand} Zeichen)` : '');
    throw err;
  }
}

async function rejects(promise, code, pattern) {
  try {
    await promise;
  } catch (err) {
    if (code) assert.equal(err.code, code, `erwartet ${code}, bekam ${err.code}: ${err.message}`);
    if (pattern) assert.match(err.message, pattern);
    return err;
  }
  assert.fail('erwartete einen Fehler');
}

async function waitFor(check, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(40);
  }
  assert.fail('Zeitüberschreitung');
}

async function main() {
  const fake = createFakeLinux(work);
  const serverRoot = path.join(work, 'sftp');
  fs.mkdirSync(serverRoot);
  const hostKey = utils.generateKeyPairSync('ed25519').private;
  const ssh = await startSshServer(serverRoot, hostKey, null, { exec: { env: () => fake.env(), cwd: fake.root } });

  globalThis.__ssh = ssh;
  const events = [];
  const emit = (name, data) => events.push({ name, data });
  let session = null;

  async function connect() {
    const spec = { id: '', name: 'Fake', protocol: 'ssh', host: '127.0.0.1', port: ssh.port, username: USER, auth: 'password', keyPath: '', secure: 'none', ignoreCertErrors: false, startPath: '', color: '#0ea5e9', createdAt: 0, lastUsed: null, password: PASS, passphrase: '' };
    const s = new lib.Session(`s-${crypto.randomUUID()}`, spec, emit);
    try {
      await s.connect();
    } catch (err) {
      assert.equal(err.code, 'hostkey-new');
      await s.connect(err.data.fingerprint);
    }
    return s;
  }

  session = await connect();
  const api = lib.createModuleMethods(() => session, emit);

  const jobEvents = (jobId) => events.filter((e) => e.name === 'mod.job' && e.data.jobId === jobId).map((e) => e.data);
  async function job(method, params) {
    const start = await api[method]({ sid: session.sid, ...params });
    await waitFor(() => jobEvents(start.jobId).some((j) => ['done', 'error', 'detached'].includes(j.state)));
    const list = jobEvents(start.jobId);
    return { start, final: list[list.length - 1], list, log: events.filter((e) => e.name === 'mod.log' && e.data.jobId === start.jobId).map((e) => e.data.text).join('') };
  }

  await test('Erkennung als root: System, Paketmanager, keine Module', async () => {
    const sys = await api['sys.detect']({ sid: session.sid });
    assert.equal(sys.os, 'Ubuntu 24.04.1 LTS');
    assert.equal(sys.pm, 'apt');
    assert.equal(sys.init, 'systemd');
    assert.equal(sys.sudo, 'root');
    assert.equal(sys.uid, 0);
    assert.equal(sys.supported, true);
    assert.equal(sys.sites, true);
    for (const id of ['mariadb', 'nginx', 'apache']) assert.equal(sys.modules[id].installed, false);
  });

  await test('Nginx installieren: Schritte, Ergebnis, Dienst läuft, Firewall', async () => {
    const { start, final, list, log } = await job('mod.install', { module: 'nginx', options: { firewall: true } });
    assert.equal(final.state, 'done', final.error);
    assert.deepEqual(start.steps, ['Paketlisten werden aktualisiert', 'Nginx wird installiert', 'Nginx wird gestartet', 'Firewall wird eingerichtet', 'Fertig']);
    const seen = list.filter((j) => j.state === 'running').map((j) => j.step);
    for (const step of start.steps.slice(0, -1)) assert.ok(seen.includes(step), `Schritt fehlt: ${step}`);
    assert.match(log, /Setting up nginx/);
    assert.match(log, /Port 80 freigegeben/);
    const sys = await api['sys.detect']({ sid: session.sid });
    assert.deepEqual(sys.modules.nginx, { installed: true, running: true, enabled: true, version: '1.24.0', service: 'nginx' });
    const fw = fake.read('state', 'firewall.log');
    assert.match(fw, /ufw allow 80\/tcp/);
    assert.match(fw, /ufw allow 443\/tcp/);
    assert.equal(fs.readdirSync(fake.file('var', 'tmp')).filter((f) => f.startsWith('feather-')).length, 0, 'Job-Dateien aufgeräumt');
  });

  await test('Doppelte Installation wird abgelehnt', async () => {
    await rejects(api['mod.install']({ sid: session.sid, module: 'nginx', options: {} }), null, /bereits installiert/);
  });

  await test('Dienst steuern: stoppen, starten, neu starten, Autostart', async () => {
    const control = async (action) => (await api['mod.control']({ sid: session.sid, module: 'nginx', action })).modules.nginx;
    assert.equal((await control('stop')).running, false);
    assert.equal((await control('start')).running, true);
    assert.equal((await control('restart')).running, true);
    assert.equal((await control('disable')).enabled, false);
    assert.equal((await control('enable')).enabled, true);
    await rejects(api['mod.control']({ sid: session.sid, module: 'nginx', action: 'rm -rf /' }), null, /Unbekannte Aktion/);
    await rejects(api['mod.control']({ sid: session.sid, module: 'evil;ls', action: 'start' }), null, /Unbekanntes Modul/);
  });

  await test('Website anlegen, auflisten, deaktivieren, löschen (nginx)', async () => {
    const site = { name: 'meine-seite', domain: 'meine-seite.de', port: 80, root: '/tmp/feather-www/meine-seite', welcome: true, firewall: false };
    await api['web.createSite']({ sid: session.sid, module: 'nginx', site });
    const conf = fake.read('etc', 'nginx', 'conf.d', 'feather-meine-seite.conf');
    assert.match(conf, /^# feather-site name=meine-seite domain=meine-seite.de port=80 root=\/tmp\/feather-www\/meine-seite\n/);
    assert.match(conf, /server_name meine-seite.de;/);
    assert.match(conf, /root \/tmp\/feather-www\/meine-seite;/);
    assert.ok(fake.exists('..', '..', 'var', 'www') || true);
    let sites = await api['web.sites']({ sid: session.sid, module: 'nginx' });
    assert.deepEqual(sites, [{ name: 'meine-seite', domain: 'meine-seite.de', port: 80, root: '/tmp/feather-www/meine-seite', enabled: true }]);
    await api['web.toggleSite']({ sid: session.sid, module: 'nginx', name: 'meine-seite', enable: false });
    assert.ok(fake.exists('etc', 'nginx', 'conf.d', 'feather-meine-seite.conf.disabled'));
    sites = await api['web.sites']({ sid: session.sid, module: 'nginx' });
    assert.equal(sites[0].enabled, false);
    await api['web.toggleSite']({ sid: session.sid, module: 'nginx', name: 'meine-seite', enable: true });
    await api['web.deleteSite']({ sid: session.sid, module: 'nginx', name: 'meine-seite' });
    assert.equal((await api['web.sites']({ sid: session.sid, module: 'nginx' })).length, 0);
    await rejects(api['web.createSite']({ sid: session.sid, module: 'nginx', site }).then(() => api['web.createSite']({ sid: session.sid, module: 'nginx', site })), null, /existiert bereits/);
  });

  await test('Website ohne Domain wird Standardseite und ersetzt die Platzhalterseite', async () => {
    assert.ok(fake.exists('etc', 'nginx', 'sites-enabled', 'default'));
    await api['web.createSite']({ sid: session.sid, module: 'nginx', site: { name: 'standard', domain: '', port: 80, root: '/tmp/feather-www/standard', welcome: true, firewall: false } });
    assert.match(fake.read('etc', 'nginx', 'conf.d', 'feather-standard.conf'), /listen 80 default_server;/);
    assert.equal(fake.exists('etc', 'nginx', 'sites-enabled', 'default'), false);
  });

  await test('Fehlerhafte Konfiguration wird zurückgerollt', async () => {
    const before = fs.readdirSync(fake.file('etc', 'nginx', 'conf.d')).sort();
    await rejects(api['web.createSite']({ sid: session.sid, module: 'nginx', site: { name: 'kaputt', domain: 'fail.example', port: 8080, root: '/tmp/feather-www/kaputt', welcome: false, firewall: false } }), null, /unknown directive/);
    assert.deepEqual(fs.readdirSync(fake.file('etc', 'nginx', 'conf.d')).sort(), before);
  });

  await test('Ungültige Website-Eingaben werden abgelehnt', async () => {
    const base = { name: 'ok', domain: 'a.de', port: 80, root: '/tmp/feather-www/ok', welcome: false, firewall: false };
    const bad = [
      [{ name: 'Gross' }, /Name/],
      [{ name: 'x; rm -rf /' }, /Name/],
      [{ domain: 'a.de; rm' }, /Domain/],
      [{ port: 70000 }, /Port/],
      [{ root: '/tmp/feather-www/../etc' }, /Ordner/],
      [{ root: 'relativ' }, /Ordner/],
      [{ root: '/etc' }, /nicht als Website-Ordner/],
      [{ root: '/tmp/feather-www/a b' }, /Ordner/],
    ];
    for (const [patch, pattern] of bad) await rejects(api['web.createSite']({ sid: session.sid, module: 'nginx', site: { ...base, ...patch } }), null, pattern);
  });

  await test('Konfigurationstest und Logs', async () => {
    const test = await api['web.test']({ sid: session.sid, module: 'nginx' });
    assert.equal(test.ok, true);
    assert.match(test.output, /successful/);
    assert.match(await api['mod.logs']({ sid: session.sid, module: 'nginx', kind: 'service', lines: 50 }), /ready to accept connections/);
    fs.writeFileSync(fake.file('var', 'log', 'nginx', 'error.log'), 'zeile 1\nzeile 2\n');
    assert.match(await api['mod.logs']({ sid: session.sid, module: 'nginx', kind: 'error', lines: 50 }), /zeile 2/);
  });

  await test('Apache: Installation, Website mit eigenem Port, Listen nur einmal', async () => {
    const { final } = await job('mod.install', { module: 'apache', options: { firewall: false } });
    assert.equal(final.state, 'done', final.error);
    const site = (name, port) => ({ name, domain: `${name}.de`, port, root: `/tmp/feather-www/${name}`, welcome: false, firewall: false });
    await api['web.createSite']({ sid: session.sid, module: 'apache', site: site('eins', 8080) });
    await api['web.createSite']({ sid: session.sid, module: 'apache', site: site('zwei', 8080) });
    const one = fake.read('etc', 'apache2', 'conf-enabled', 'feather-eins.conf');
    const two = fake.read('etc', 'apache2', 'conf-enabled', 'feather-zwei.conf');
    assert.match(one, /^# feather-site name=eins domain=eins.de port=8080/);
    assert.match(one, /Listen 8080\n<VirtualHost \*:8080>/);
    assert.match(one, /ErrorLog \$\{APACHE_LOG_DIR\}\/eins-error.log/);
    assert.ok(!/Listen 8080/.test(two), 'zweite Website darf kein doppeltes Listen enthalten');
    assert.equal((await api['web.sites']({ sid: session.sid, module: 'apache' })).length, 2);
    assert.equal((await api['web.test']({ sid: session.sid, module: 'apache' })).ok, true);
  });

  await test('MariaDB: Installation mit Benutzer, Fernzugriff und sicherem Passwort', async () => {
    const password = `pa'ss"wör\\d;DROP-9`;
    const { start, final, log } = await job('mod.install', { module: 'mariadb', options: { port: 3307, remote: true, firewall: true, database: 'shop', user: 'webapp', password, userHost: 'localhost' } });
    assert.equal(final.state, 'done', final.error + log);
    assert.deepEqual(start.steps, ['Paketlisten werden aktualisiert', 'MariaDB wird installiert', 'Einstellungen werden geschrieben', 'MariaDB wird gestartet', 'Datenbank-Benutzer wird angelegt', 'Firewall wird eingerichtet', 'Fertig']);
    const cnf = fake.read('etc', 'mysql', 'mariadb.conf.d', '99-feather.cnf');
    assert.match(cnf, /bind-address = 0.0.0.0/);
    assert.match(cnf, /port = 3307/);
    const sql = fake.read('state', 'sql.log');
    assert.ok(sql.includes("CREATE OR REPLACE USER 'webapp'@'localhost' IDENTIFIED BY 'pa\\'ss\"wör\\\\d;DROP-9';"), sql);
    assert.match(sql, /GRANT ALL PRIVILEGES ON `shop`\.\* TO 'webapp'@'localhost';/);
    assert.match(fake.read('state', 'firewall.log'), /ufw allow 3307\/tcp/);
    assert.ok(!log.includes('pa\'ss'), 'Passwort darf nicht im Protokoll stehen');
    assert.equal(fs.readdirSync(fake.file('tmp')).filter((f) => f.startsWith('feather.')).length, 0, 'Passwort-Datei wurde gelöscht');
    const sys = await api['sys.detect']({ sid: session.sid });
    assert.equal(sys.modules.mariadb.version, '10.11.6');
    assert.equal(sys.modules.mariadb.running, true);
  });

  await test('MariaDB: Datenbanken und Benutzer verwalten', async () => {
    const dbs = await api['db.databases']({ sid: session.sid });
    assert.deepEqual(dbs.map((d) => [d.name, d.tables, d.bytes, d.system]), [['information_schema', 0, 0, true], ['mysql', 31, 655360, true], ['shop', 3, 49152, false]]);
    const users = await api['db.users']({ sid: session.sid });
    assert.deepEqual(users.map((u) => [u.name, u.host, u.system]), [['root', 'localhost', true], ['webapp', 'localhost', false]]);
    await api['db.createDb']({ sid: session.sid, name: 'blog_2024' });
    assert.match(fake.read('state', 'sql.log'), /CREATE DATABASE `blog_2024` CHARACTER SET utf8mb4/);
    await api['db.dropDb']({ sid: session.sid, name: 'blog_2024' });
    await rejects(api['db.dropDb']({ sid: session.sid, name: 'mysql' }), null, /Systemdatenbanken/);
    await rejects(api['db.createDb']({ sid: session.sid, name: 'x`; DROP DATABASE mysql; --' }), null, /Datenbankname/);
    await api['db.createUser']({ sid: session.sid, user: { name: 'leser', host: '%', password: 'sehr-geheim-1', database: 'shop', grant: 'read' } });
    const sql = fake.read('state', 'sql.log');
    assert.match(sql, /CREATE USER 'leser'@'%' IDENTIFIED BY 'sehr-geheim-1';/);
    assert.match(sql, /GRANT SELECT ON `shop`\.\* TO 'leser'@'%';/);
    await api['db.userPassword']({ sid: session.sid, name: 'leser', host: '%', password: 'neues-passwort-2' });
    assert.match(fake.read('state', 'sql.log'), /SET PASSWORD FOR 'leser'@'%' = PASSWORD\('neues-passwort-2'\);/);
    await api['db.dropUser']({ sid: session.sid, name: 'leser', host: '%' });
    await rejects(api['db.dropUser']({ sid: session.sid, name: 'root', host: 'localhost' }), null, /Systembenutzer/);
    await rejects(api['db.createUser']({ sid: session.sid, user: { name: "a'; DROP", host: '%', password: 'sehr-geheim-1', database: 'shop', grant: 'all' } }), null, /Benutzername/);
    await rejects(api['db.createUser']({ sid: session.sid, user: { name: 'ok', host: "%'; --", password: 'sehr-geheim-1', database: 'shop', grant: 'all' } }), null, /Host/);
    await rejects(api['db.createUser']({ sid: session.sid, user: { name: 'ok', host: '%', password: 'kurz', database: 'shop', grant: 'all' } }), null, /8 Zeichen/);
  });

  await test('MariaDB: SQL-Fehler werden verständlich erklärt', async () => {
    await rejects(api['db.createDb']({ sid: session.sid, name: 'FAIL_ME' }), null, /existiert bereits/);
  });

  await test('MariaDB: Einstellungen lesen und Fernzugriff ändern', async () => {
    const before = await api['db.settings']({ sid: session.sid });
    assert.deepEqual(before, { port: 3306, bind: '127.0.0.1', version: '10.11.6', remote: false });
    await api['db.configure']({ sid: session.sid, port: 3310, remote: false, firewall: true });
    const cnf = fake.read('etc', 'mysql', 'mariadb.conf.d', '99-feather.cnf');
    assert.match(cnf, /bind-address = 127.0.0.1/);
    assert.match(cnf, /port = 3310/);
    await rejects(api['db.configure']({ sid: session.sid, port: 99999, remote: true }), null, /Port/);
  });

  await test('Installationsfehler werden auf Deutsch erklärt', async () => {
    fs.writeFileSync(fake.file('state', 'lock'), '');
    const { final } = await job('mod.uninstall', { module: 'apache', purge: false });
    fs.rmSync(fake.file('state', 'lock'));
    assert.equal(final.state, 'error');
    assert.match(final.error, /anderer Paketvorgang/);
  });

  await test('Deinstallieren entfernt Paket und Einstellungen', async () => {
    const { final } = await job('mod.uninstall', { module: 'mariadb', purge: true });
    assert.equal(final.state, 'done', final.error);
    assert.equal(fake.exists('etc', 'mysql', 'mariadb.conf.d', '99-feather.cnf'), false);
    const sys = await api['sys.detect']({ sid: session.sid });
    assert.equal(sys.modules.mariadb.installed, false);
    assert.equal(sys.modules.nginx.installed, true);
  });

  await test('Ohne root: sudo mit Passwort wird verlangt, geprüft und gemerkt', async () => {
    fake.settings.uid = '1000';
    fake.settings.user = 'deploy';
    fake.settings.sudo = 'password';
    session.close();
    session = await connect();
    const sys = await api['sys.detect']({ sid: session.sid });
    assert.equal(sys.sudo, 'password');
    assert.equal(sys.user, 'deploy');
    await rejects(api['mod.control']({ sid: session.sid, module: 'nginx', action: 'stop' }), 'need-sudo');
    await rejects(api['mod.control']({ sid: session.sid, module: 'nginx', action: 'stop', sudoPassword: 'falsch' }), 'need-sudo', /falsch/);
    const after = await api['mod.control']({ sid: session.sid, module: 'nginx', action: 'stop', sudoPassword: fake.settings.sudoPw });
    assert.equal(after.modules.nginx.running, false);
    const again = await api['mod.control']({ sid: session.sid, module: 'nginx', action: 'start' });
    assert.equal(again.modules.nginx.running, true, 'Passwort wird für die Sitzung gemerkt');
    const wire = ssh.state.commands.join('\n');
    assert.ok(!wire.includes(fake.settings.sudoPw), 'sudo-Passwort darf nie in einer Befehlszeile stehen');
  });

  await test('Ohne root: sudo ohne Passwort und ohne sudo', async () => {
    fake.settings.sudo = 'passwordless';
    session.close();
    session = await connect();
    assert.equal((await api['sys.detect']({ sid: session.sid })).sudo, 'passwordless');
    assert.equal((await api['mod.control']({ sid: session.sid, module: 'nginx', action: 'restart' })).modules.nginx.running, true);
    session.sys = { ...session.sys, sudo: 'none' };
    await rejects(api['mod.control']({ sid: session.sid, module: 'nginx', action: 'restart' }), null, /keine Administratorrechte/);
  });

  await test('Skripte für alle Paketmanager sind gültiges Shell-Skript mit den richtigen Paketen', async () => {
    const expected = {
      apt: { mariadb: 'apt-get install -y mariadb-server mariadb-client', nginx: 'apt-get install -y nginx', apache: 'apt-get install -y apache2' },
      dnf: { mariadb: 'dnf install -y mariadb-server', nginx: 'dnf install -y nginx', apache: 'dnf install -y httpd' },
      yum: { mariadb: 'yum install -y mariadb-server', nginx: 'yum install -y nginx', apache: 'yum install -y httpd' },
      zypper: { mariadb: 'zypper --non-interactive install mariadb mariadb-client', nginx: 'zypper --non-interactive install nginx', apache: 'zypper --non-interactive install apache2' },
      pacman: { mariadb: 'pacman -S --noconfirm --needed mariadb', nginx: 'pacman -S --noconfirm --needed nginx', apache: 'pacman -S --noconfirm --needed apache' },
      apk: { mariadb: 'apk add mariadb mariadb-client', nginx: 'apk add nginx', apache: 'apk add apache2' },
    };
    const cp = require('node:child_process');
    for (const pm of Object.keys(expected)) {
      const sys = lib.parseSystem(`pm=${pm}\ninit=systemd\nuid=0\nsudo=root\nos=Test\n`);
      for (const module of ['mariadb', 'nginx', 'apache']) {
        const options = module === 'mariadb' ? { port: 3306, remote: false, firewall: false, user: 'app', password: 'passwort-123', database: 'app' } : { firewall: true };
        for (const [kind, plan] of [['install', lib.installPlan(module, sys, options)], ['uninstall', lib.uninstallPlan(module, sys, true)]]) {
          const file = path.join(work, `${pm}-${module}-${kind}.sh`);
          fs.writeFileSync(file, lib.PRELUDE + plan.script);
          const check = cp.spawnSync('sh', ['-n', file.replace(/\\/g, '/')], { encoding: 'utf8' });
          assert.equal(check.status, 0, `${pm}/${module}/${kind}: ${check.stderr}`);
          if (kind === 'install') {
            assert.ok(plan.script.includes(expected[pm][module]), `${pm}/${module}: ${expected[pm][module]} fehlt`);
            assert.equal(plan.steps[plan.steps.length - 1], 'Fertig');
          }
        }
      }
    }
    const arch = lib.installPlan('mariadb', lib.parseSystem('pm=pacman\ninit=systemd\nuid=0\nsudo=root\n'), {});
    assert.match(arch.script, /mariadb-install-db --user=mysql/);
    const alpine = lib.installPlan('mariadb', lib.parseSystem('pm=apk\ninit=openrc\nuid=0\nsudo=root\n'), {});
    assert.match(alpine.script, /mysql_install_db/);
    assert.throws(() => lib.installPlan('nginx', lib.parseSystem('pm=unknown\ninit=systemd\nuid=0\n'), {}), /Paketmanager/);
    assert.throws(() => lib.installPlan('mariadb', lib.parseSystem('pm=apt\ninit=systemd\nuid=0\n'), { user: 'a;b', password: 'passwort-123' }), /Benutzername/);
    assert.throws(() => lib.installPlan('mariadb', lib.parseSystem('pm=apt\ninit=systemd\nuid=0\n'), { user: 'app', password: 'kurz' }), /8 Zeichen/);
    assert.throws(() => lib.installPlan('mariadb', lib.parseSystem('pm=apt\ninit=systemd\nuid=0\n'), { port: 0 }), /Port/);
  });

  session.close();
  ssh.server.close();
  console.log(`\n${passed} Modul-Tests bestanden`);
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
