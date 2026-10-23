const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-term-test-'));
const out = path.join(work, 'term.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src', 'shared', 'termcomplete.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'error' });
const t = require(out);

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ', name);
}

const ctx = (over = {}) => ({ history: [], units: ['mariadb', 'nginx'], isRoot: true, manager: 'apt', ...over });
const appended = (input, c = ctx(), force = false) => t.suggestInput(input, c, force).map((i) => i.append);
const labels = (input, c = ctx()) => t.suggestInput(input, c).map((i) => i.label);

test('Eingabe wird aus der Terminalzeile hinter dem Prompt gelesen', () => {
  assert.deepEqual(t.extractInput('root@srv:~# apt ins'), { input: 'apt ins', shell: true });
  assert.deepEqual(t.extractInput('deploy@host:/var/www$ ls -l'), { input: 'ls -l', shell: true });
  assert.deepEqual(t.extractInput('[root@host ~]# '), { input: '', shell: true });
  assert.deepEqual(t.extractInput('$ git st'), { input: 'git st', shell: true });
  assert.equal(t.extractInput('MariaDB [(none)]> select 1').shell, false);
  assert.equal(t.extractInput('mysql> show tables').shell, false);
  assert.equal(t.extractInput('[sudo] Passwort für deploy: '), null);
  assert.equal(t.extractInput('Password: '), null);
  assert.equal(t.extractInput('Reading package lists...'), null);
});

test('Befehle, Unterbefehle, Optionen und Werte werden vervollständigt', () => {
  assert.ok(labels('sys').includes('systemctl'));
  assert.ok(appended('systemctl res').includes('tart'));
  assert.ok(labels('systemctl restart ma').includes('mariadb'));
  assert.ok(labels('systemctl status ng').includes('nginx'));
  assert.ok(labels('apt ins').includes('install'));
  assert.ok(labels('apt install ht').includes('htop'));
  assert.ok(labels('apt install -').length === 0 || labels('apt install -').every((l) => l.startsWith('-')));
  assert.ok(labels('ls -').includes('-la'));
  assert.ok(labels('docker compose u').includes('up'));
  assert.ok(labels('git com').includes('commit'));
  assert.ok(labels('chmod 7').includes('755'));
  assert.ok(labels('ufw allow 4').includes('443/tcp'));
  assert.ok(labels('journalctl -u ma').includes('mariadb'));
  assert.deepEqual(appended('systemctl restart mariadb'), []);
});

test('sudo wird übersprungen, ohne Eingabe gibt es nichts, außer auf Wunsch', () => {
  assert.ok(labels('sudo apt up').includes('update'));
  assert.ok(labels('sudo sys').includes('systemctl'));
  assert.deepEqual(labels(''), []);
  assert.deepEqual(labels('   '), []);
  assert.deepEqual(labels('nichtvorhanden foo'), []);
  const c = ctx({ history: [{ cmd: 'ls', count: 1, last: 5 }, { cmd: 'df -h', count: 1, last: 9 }] });
  assert.deepEqual(t.suggestInput('', c, true).map((i) => i.label), ['df -h', 'ls']);
});

test('Verlauf hat Vorrang und rankt nach Häufigkeit', () => {
  const c = ctx({
    history: [
      { cmd: 'ssh root@10.0.0.1', count: 1, last: 100 },
      { cmd: 'ssh root@10.0.0.2', count: 6, last: 50 },
      { cmd: 'tail -f /var/log/syslog', count: 2, last: 70 },
    ],
  });
  const items = t.suggestInput('ssh root', c);
  assert.equal(items[0].kind, 'history');
  assert.equal(items[0].append, '@10.0.0.2');
  assert.equal(items[1].append, '@10.0.0.1');
  assert.equal(t.suggestInput('tail -f /var', c)[0].append, '/log/syslog');
  assert.ok(t.suggestInput('tai', c).some((i) => i.label === 'tail'));
  assert.equal(t.suggestInput('ssh root@10.0.0.2', c).length, 0);
});

test('Eigene Befehle aus dem Verlauf werden als Befehlsname vorgeschlagen', () => {
  const c = ctx({ history: [{ cmd: './start-server.sh --port 25565', count: 3, last: 10 }, { cmd: 'minecraftctl restart', count: 4, last: 20 }] });
  assert.ok(labels('mine', c).includes('minecraftctl'));
  assert.ok(!labels('sta', c).some((l) => l.includes('/')));
});

test('Sensible Zeilen werden nie gemerkt', () => {
  for (const line of ['mysql -u root -pGeheim123 shop', 'htopmysql -u root -pGeheim123', 'export API_KEY=abc', 'curl https://user:pw@example.com/x', 'mariadb --password=x', 'echo $TOKEN', ' ls -la', 'sshpass -p x ssh a@b', 'set secret=1']) assert.ok(t.isSensitive(line), line);
  for (const line of ['ls -la', 'systemctl restart mariadb', 'mysql -u root -p', 'git push origin main', 'apt install -y htop']) assert.ok(!t.isSensitive(line), line);
});

test('Fehlermeldungen führen zu passenden Hinweisen', () => {
  const root = { isRoot: true, manager: 'apt' };
  const user = { isRoot: false, manager: 'dnf' };
  let h = t.detectHint('-bash: htop: command not found\n', 'htop', root);
  assert.equal(h.command, 'apt install -y htop');
  h = t.detectHint('bash: ifconfig: command not found', 'ifconfig', user);
  assert.equal(h.command, 'sudo dnf install -y net-tools');
  h = t.detectHint("Command 'jq' not found, but can be installed with:", 'jq .', root);
  assert.equal(h.command, 'apt install -y jq');
  h = t.detectHint('\u001b[31mUnit foo.service could not be found.\u001b[0m', 'systemctl restart foo', root);
  assert.equal(h.command, 'systemctl list-units --type=service --all | grep -i foo');
  h = t.detectHint('E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 1234', 'apt install nginx', root);
  assert.equal(h.id, 'lock');
  assert.equal(h.command, 'apt install nginx');
  h = t.detectHint('nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)', 'nginx', root);
  assert.equal(h.command, 'ss -tulpn | grep :80');
  h = t.detectHint('tee: /var/log/x: No space left on device', 'x', root);
  assert.equal(h.command, 'df -h');
  h = t.detectHint('cat: /etc/shadow: Permission denied', 'cat /etc/shadow', user);
  assert.equal(h.command, 'sudo cat /etc/shadow');
  assert.equal(t.detectHint('cat: /etc/shadow: Permission denied', 'cat /etc/shadow', root), null);
  assert.equal(t.detectHint('Permission denied (publickey).', 'ssh a@b', user), null);
  assert.equal(t.detectHint('all fine', 'ls', user), null);
});

console.log(`\n${passed} Terminal-Tests bestanden`);
fs.rmSync(work, { recursive: true, force: true });
process.exit(0);
