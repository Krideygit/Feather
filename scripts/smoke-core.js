const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const home = process.env.FEATHER_HOME || fs.mkdtempSync(path.join(os.tmpdir(), 'feather-smoke-'));
const jar = path.join(__dirname, '..', 'core', 'feather-core.jar');
const core = spawn('java', ['-jar', jar], { env: { ...process.env, FEATHER_HOME: home }, stdio: ['pipe', 'pipe', 'inherit'] });

let nextId = 1;
const pending = new Map();
const logs = new Map();
readline.createInterface({ input: core.stdout }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.id !== undefined && msg.id !== null) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
  } else if (msg.event === 'runtime.progress' && msg.data.phase !== 'download' && msg.data.phase !== 'extract') {
    console.log('  progress:', msg.data.phase);
  } else if (msg.event === 'service.log') {
    (logs.get(msg.data.id) || logs.set(msg.data.id, []).get(msg.data.id)).push(msg.data.line);
  }
});
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    core.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log(`\n== ${msg}`);

async function waitStatus(id, want, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = (await call('service.list')).find((x) => x.id === id);
    if (s.status === want) return s;
    if (s.status === 'error') throw new Error(`service error: ${s.error}`);
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${want}`);
}

async function ensureRuntime(type, pick) {
  const { versions } = await call('catalog.versions', { type });
  if (!versions.length) throw new Error(`no ${type} versions resolved`);
  const v = pick ? versions.find(pick) : versions[0];
  console.log(`  ${type}: ${versions.map((x) => x.id + (x.channel ? `(${x.channel})` : '')).join(', ')} -> using ${v.id}`);
  if (!v.installed) await call('runtime.install', { type, version: v.id });
  return v.id;
}

async function webTest(type) {
  step(`${type}`);
  const version = await ensureRuntime(type, type === 'nginx' ? (v) => v.channel === 'Stable' : undefined);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-www-'));
  fs.writeFileSync(path.join(folder, 'index.html'), '<h1>hello from feather</h1>');
  const { port } = await call('port.suggest', { preferred: 18080 });
  const svc = await call('service.create', { type, name: `smoke-${type}`, version, port, folder });
  await call('service.start', { id: svc.id });
  const running = await waitStatus(svc.id, 'running');
  const body = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  console.log(`  pid ${running.pid}, GET / -> ${body.trim()}`);
  if (!body.includes('hello from feather')) throw new Error('unexpected response');
  await fetch(`http://127.0.0.1:${port}/nope`);
  await sleep(1200);
  console.log('  log lines captured:', (logs.get(svc.id) || []).length);
  await call('service.stop', { id: svc.id });
  await waitStatus(svc.id, 'stopped');
  console.log('  stopped cleanly; port free again:', await fetch(`http://127.0.0.1:${port}/`).then(() => false, () => true));
  await call('service.delete', { id: svc.id });
}

async function mariadbTest() {
  step('mariadb');
  const version = await ensureRuntime('mariadb', (v) => v.id.startsWith('11.8'));
  const { port } = await call('port.suggest', { preferred: 13306 });
  const svc = await call('service.create', { type: 'mariadb', name: 'smoke-db', version, port, password: 'secret' });
  await call('service.start', { id: svc.id });
  await waitStatus(svc.id, 'running', 180000);
  await call('db.create', { id: svc.id, name: 'feather_test' });
  const dbs = await call('db.list', { id: svc.id });
  console.log('  databases:', dbs.map((d) => d.name).join(', '));
  if (!dbs.some((d) => d.name === 'feather_test')) throw new Error('database not created');

  step('mariadb: SQL console');
  const q = await call('db.query', {
    id: svc.id,
    database: 'feather_test',
    sql: "CREATE TABLE t (id INT PRIMARY KEY, name VARCHAR(20)); INSERT INTO t VALUES (1,'a;b'),(2,'c'); -- note\nSELECT * FROM t ORDER BY id; SELECT * FROM does_not_exist; SELECT 'not reached';",
  });
  console.log('  results:', q.results.map((r) => r.type + (r.rows ? `(${r.rows.length})` : `(${r.affected})`)).join(', '), '| error:', q.error && q.error.message);
  const sel = q.results.find((r) => r.type === 'rows');
  if (!sel || sel.rows[0][1] !== 'a;b') throw new Error('semicolon inside string was split');
  if (!q.error) throw new Error('missing table should have errored');

  step('mariadb: users and passwords');
  await call('db.userCreate', { id: svc.id, user: 'appuser', password: "pa'ss\\w", database: 'feather_test' });
  let users = await call('db.users', { id: svc.id });
  console.log('  users:', users.map((u) => `${u.user}@${u.host}`).join(', '));
  if (!users.some((u) => u.user === 'appuser')) throw new Error('user not created');
  console.log('  grants:', (await call('db.userGrants', { id: svc.id, user: 'appuser', host: 'localhost' })).join(' | '));
  await call('db.userPassword', { id: svc.id, user: 'appuser', host: 'localhost', password: 'changed-1' });
  await call('db.userRename', { id: svc.id, user: 'appuser', host: 'localhost', newName: 'appuser2' });
  users = await call('db.users', { id: svc.id });
  if (!users.some((u) => u.user === 'appuser2') || users.some((u) => u.user === 'appuser')) throw new Error('rename failed');
  await call('db.userDrop', { id: svc.id, user: 'appuser2', host: 'localhost' });
  await call('db.userRename', { id: svc.id, user: 'root', host: 'localhost', newName: 'x' }).then(
    () => { throw new Error('root rename must fail'); },
    (e) => console.log('  root rename refused:', e.message.slice(0, 40)),
  );
  const changed = await call('db.userPassword', { id: svc.id, user: 'root', host: 'localhost', password: 'new-secret' });
  if (changed.connection.password !== 'new-secret') throw new Error('stored root password not updated');
  await call('db.list', { id: svc.id });
  console.log('  root password changed and still working');

  step('mariadb: ZIP export');
  const zipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-zip-'));
  for (const perTable of [false, true]) {
    const file = path.join(zipDir, perTable ? 'tables.zip' : 'dbs.zip');
    const res = await call('db.export', { id: svc.id, databases: ['feather_test'], perTable, file });
    const listing = require('node:child_process').execFileSync(process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar', ['-tf', file]).toString().trim().split(/\r?\n/);
    console.log(`  perTable=${perTable}: ${res.files} file(s), ${res.bytes} B ->`, listing.join(', '));
    const want = perTable ? 'feather_test/t.sql' : 'feather_test.sql';
    if (!listing.includes(want)) throw new Error(`zip misses ${want}`);
  }
  await call('db.drop', { id: svc.id, name: 'feather_test' });
  await call('service.stop', { id: svc.id });
  await waitStatus(svc.id, 'stopped');
  console.log('  mariadb stopped');
  await call('service.delete', { id: svc.id });
}

async function profilesTest() {
  step('profiles');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  let list = await call('profile.list');
  console.log('  initial:', list.profiles.map((p) => p.name).join(', '), '| active', list.active);
  const work = await call('profile.create', { name: 'Arbeit', avatar: png });
  if (!work.avatar) throw new Error('avatar not stored');
  await call('profile.delete', { id: list.active }).then(
    () => { throw new Error('deleting the active profile must fail'); },
    (e) => console.log('  deleting active refused:', e.message.slice(0, 50)),
  );

  await call('profile.switch', { id: work.id });
  if ((await call('service.list')).length) throw new Error('new profile should start empty');
  const version = await ensureRuntime('nginx', (v) => v.channel === 'Stable');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-www-'));
  const { port } = await call('port.suggest', { preferred: 18090 });
  await call('service.create', { type: 'nginx', name: 'Projekt A', version, port, folder });

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'feather-bak-')), 'Arbeit.feather');
  const exp = await call('profile.export', { id: work.id, file, includeData: true });
  console.log(`  exported ${exp.files} file(s), ${exp.bytes} B`);
  const imp = await call('profile.import', { file });
  console.log('  imported as', imp.profile.name, JSON.stringify(imp.report));
  if (imp.profile.name === 'Arbeit' || imp.report.services !== 1) throw new Error('import result unexpected');

  await call('profile.switch', { id: imp.profile.id });
  const copied = await call('service.list');
  if (copied.length !== 1 || copied[0].name !== 'Projekt A') throw new Error('imported service missing');
  await call('profile.switch', { id: list.active });
  await call('profile.delete', { id: imp.profile.id });
  await call('profile.delete', { id: work.id });
  list = await call('profile.list');
  console.log('  after cleanup:', list.profiles.map((p) => p.name).join(', '));
}

(async () => {
  const wanted = process.argv.slice(2);
  if (!wanted.length) wanted.push('nginx');
  console.log('FEATHER_HOME =', home);
  console.log('info:', JSON.stringify(await call('app.info')));
  for (const w of wanted) {
    if (w === 'mariadb') await mariadbTest();
    else if (w === 'profiles') await profilesTest();
    else await webTest(w);
  }
  console.log('\nOK');
})()
  .catch((e) => {
    console.error('\nFAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    core.stdin.end();
    setTimeout(() => process.exit(), 15000).unref();
    core.on('exit', () => process.exit());
  });
