const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-sql-test-'));
process.env.TEST_USERDATA = work;

const stub = path.join(work, 'electron-stub.js');
fs.writeFileSync(
  stub,
  `module.exports = {
    app: { getPath: () => process.env.TEST_USERDATA },
    safeStorage: { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async (s) => Buffer.from('enc:' + Buffer.from(s).toString('base64')), decryptStringAsync: async (b) => ({ shouldReEncrypt: false, result: Buffer.from(b.toString().slice(4), 'base64').toString() }) },
    ipcMain: { handle() {}, on() {} },
  };`,
);

function bundle(name, entry) {
  const out = path.join(work, `${name}.cjs`);
  esbuild.buildSync({ entryPoints: [path.join(root, entry)], bundle: true, format: 'cjs', platform: 'node', outfile: out, alias: { electron: stub }, logLevel: 'error' });
  return out;
}

const genPath = bundle('sqlgen', 'src/shared/sqlgen.ts');
const historyPath = bundle('sqlhistory', 'src/main/sqlhistory.ts');
const gen = require(genPath);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('ok  ', name);
}

const col = (over) => gen.blankColumn(over);

(async () => {
  await test('Tabelle mit Primärschlüssel, Eindeutigkeit und Standardwerten wird erzeugt', () => {
    const sql = gen.createTableSql('shop', 'BUCKET_USERS', [
      col({ name: 'id', type: 'INT', length: '', unsigned: true, autoIncrement: true, primary: true }),
      col({ name: 'uuid', type: 'CHAR', length: '36', unique: true }),
      col({ name: 'minecraftname', type: 'VARCHAR', length: '16' }),
      col({ name: 'coins', type: 'BIGINT', length: '', unsigned: true, defaultMode: 'value', defaultValue: '0' }),
      col({ name: 'last_join', type: 'DATETIME', length: '', nullable: true, defaultMode: 'null' }),
      col({ name: 'created', type: 'TIMESTAMP', length: '', defaultMode: 'now' }),
    ]);
    assert.match(sql, /^CREATE TABLE `shop`\.`BUCKET_USERS` \(/);
    assert.match(sql, /`id` INT UNSIGNED NOT NULL AUTO_INCREMENT/);
    assert.match(sql, /`uuid` CHAR\(36\) NOT NULL/);
    assert.match(sql, /`coins` BIGINT UNSIGNED NOT NULL DEFAULT '0'/);
    assert.match(sql, /`last_join` DATETIME NULL DEFAULT NULL/);
    assert.match(sql, /`created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /PRIMARY KEY \(`id`\)/);
    assert.match(sql, /UNIQUE KEY `uq_BUCKET_USERS_uuid` \(`uuid`\)/);
    assert.match(sql, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/);
  });

  await test('Zusammengesetzter Primärschlüssel und Sonderzeichen werden korrekt maskiert', () => {
    const sql = gen.createTableSql('a`b', 'ta`ble', [
      col({ name: 'x', type: 'INT', length: '', primary: true }),
      col({ name: 'y', type: 'ENUM', length: "ja,it's", primary: true }),
      col({ name: 'z', type: 'VARCHAR', length: '10', defaultMode: 'value', defaultValue: "o'brien\\" }),
    ]);
    assert.match(sql, /CREATE TABLE `a``b`\.`ta``ble`/);
    assert.match(sql, /PRIMARY KEY \(`x`, `y`\)/);
    assert.match(sql, /ENUM\('ja', 'it\\'s'\)/);
    assert.match(sql, /DEFAULT 'o\\'brien\\\\'/);
  });

  await test('Ungültige Angaben werden mit verständlicher Meldung abgelehnt', () => {
    const fail = (cols, name = 't') => assert.throws(() => gen.createTableSql('d', name, cols));
    const ok = col({ name: 'id', type: 'INT', length: '', primary: true });
    assert.throws(() => gen.createTableSql('d', '  ', [ok]), /Namen/);
    assert.throws(() => gen.createTableSql('d', 'a.b', [ok]), /ungültig/);
    assert.throws(() => gen.createTableSql('d', 't', []), /mindestens eine Spalte/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: '' })]), /Namen/);
    assert.throws(() => gen.createTableSql('d', 't', [ok, col({ name: 'ID', type: 'INT', length: '' })]), /doppelt/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'VARCHAR', length: '' })]), /Länge/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'VARCHAR', length: '99999' })]), /zwischen 1 und 16383/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'TEXT', length: '', autoIncrement: true, primary: true })]), /ganze Zahlen/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'INT', length: '', autoIncrement: true })]), /Primärschlüssel oder eindeutig/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'INT', length: '', primary: true, nullable: true })]), /nicht leer sein/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'INT', length: '', defaultMode: 'now' })]), /Datum und Uhrzeit/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'ENUM', length: ' , ' })]), /Auswahlliste/);
    assert.throws(() => gen.createTableSql('d', 't', [col({ name: 'a', type: 'INT', length: '', autoIncrement: true, primary: true }), col({ name: 'b', type: 'INT', length: '', autoIncrement: true, primary: true })]), /Nur eine Spalte/);
    fail([col({ name: 'a'.repeat(65), type: 'INT', length: '' })]);
  });

  await test('Spalten hinzufügen, ändern und löschen erzeugt passende ALTER-Befehle', () => {
    const spec = col({ name: 'rank', type: 'VARCHAR', length: '32', defaultMode: 'value', defaultValue: 'member', unique: true });
    assert.equal(gen.addColumnSql('d', 't', spec, 'uuid'), 'ALTER TABLE `d`.`t` ADD COLUMN `rank` VARCHAR(32) NOT NULL DEFAULT \'member\' AFTER `uuid`, ADD UNIQUE KEY `uq_t_rank` (`rank`)');
    assert.match(gen.addColumnSql('d', 't', col({ name: 'a', type: 'INT', length: '' }), null), /ADD COLUMN `a` INT NOT NULL FIRST$/);
    assert.match(gen.addColumnSql('d', 't', col({ name: 'a', type: 'INT', length: '' }), ''), /ADD COLUMN `a` INT NOT NULL$/);
    assert.throws(() => gen.addColumnSql('d', 't', col({ name: 'a', type: 'INT', length: '', primary: true }), ''), /Primärschlüssel/);
    assert.equal(gen.changeColumnSql('d', 't', 'old', col({ name: 'new', type: 'TEXT', length: '', nullable: true })), 'ALTER TABLE `d`.`t` CHANGE COLUMN `old` `new` TEXT NULL');
    assert.equal(gen.dropColumnSql('d', 't', 'x`y'), 'ALTER TABLE `d`.`t` DROP COLUMN `x``y`');
  });

  await test('Vorhandene Spalten aus information_schema werden korrekt in Eingaben zurückübersetzt', () => {
    const spec = (type, over = {}) => gen.specOf({ name: 'c', type, nullable: false, key: '', fallback: null, extra: '', ...over });
    assert.deepEqual({ ...spec('int(10) unsigned', { key: 'PRI', extra: 'auto_increment' }) }, { name: 'c', type: 'INT', length: '', unsigned: true, nullable: false, defaultMode: 'none', defaultValue: '', autoIncrement: true, primary: true, unique: false });
    const v = spec('varchar(255)', { nullable: true, fallback: 'NULL' });
    assert.equal(v.type, 'VARCHAR');
    assert.equal(v.length, '255');
    assert.equal(v.defaultMode, 'null');
    assert.equal(spec('tinyint(1)').type, 'BOOLEAN');
    assert.equal(spec('decimal(10,2)').length, '10,2');
    assert.equal(spec("enum('a','it''s')").length, "a,it's");
    assert.equal(spec('datetime', { fallback: 'current_timestamp()' }).defaultMode, 'now');
    const t = spec('varchar(20)', { fallback: "'x''y'" });
    assert.equal(t.defaultMode, 'value');
    assert.equal(t.defaultValue, "x'y");
    assert.equal(spec('char(36)', { key: 'UNI' }).unique, true);
    assert.equal(spec('bigint(20)').length, '');
    assert.equal(spec('longtext', { nullable: true }).defaultMode, 'null');
    assert.equal(gen.columnDefinition(spec('varchar(255)', { nullable: true, fallback: 'NULL' })), '`c` VARCHAR(255) NULL DEFAULT NULL');
  });

  let history = require(historyPath);
  const entry = (over = {}) => ({ server: 'ssh:host:1:127.0.0.1:3306', db: 'shop', table: 'spieler', kind: 'update', key: { id: '1' }, column: 'name', old: 'Lukas', value: 'Maik', row: null, ...over });

  await test('Verlauf speichert Vorher-Werte je Tabelle und liefert die neuesten zuerst', async () => {
    assert.equal(await history.add([entry({ ts: 1000 }), entry({ ts: 3000, old: 'Maik', value: 'Jens' }), entry({ table: 'andere', ts: 2000 })]), 3);
    const list = await history.forTable({ server: 'ssh:host:1:127.0.0.1:3306', db: 'shop', table: 'spieler' });
    assert.deepEqual(list.map((e) => e.old), ['Maik', 'Lukas']);
    assert.equal((await history.forTable({ server: 'x', db: 'shop', table: 'spieler' })).length, 0);
    assert.equal((await history.stats()).entries, 3);
  });

  await test('Ungültige und zu große Einträge werden abgefangen', async () => {
    assert.equal(await history.add([{ kind: 'update' }, entry({ kind: 'drop' }), 'text', null]), 0);
    await history.add([entry({ old: 'x'.repeat(10000), column: 'bio' })]);
    const list = await history.forTable({ server: 'ssh:host:1:127.0.0.1:3306', db: 'shop', table: 'spieler' });
    assert.equal(list.find((e) => e.column === 'bio').old.length, 4000);
  });

  await test('Gelöschte Zeilen werden samt Zeilendaten gesichert', async () => {
    await history.add([entry({ kind: 'delete', key: { id: '9' }, column: '', old: null, value: null, row: { id: '9', name: 'Tom', rang: null } })]);
    const list = await history.forTable({ server: 'ssh:host:1:127.0.0.1:3306', db: 'shop', table: 'spieler' });
    const del = list.find((e) => e.kind === 'delete');
    assert.deepEqual(del.row, { id: '9', name: 'Tom', rang: null });
  });

  await test('Zurückgesetzte Einträge werden markiert, einzelne entfernt, Tabellen geleert', async () => {
    const scope = { server: 'ssh:host:1:127.0.0.1:3306', db: 'shop', table: 'spieler' };
    const first = (await history.forTable(scope)).find((e) => e.old === 'Maik');
    await history.markUndone([first.id]);
    assert.ok((await history.forTable(scope)).find((e) => e.id === first.id).undone > 0);
    await history.remove([first.id]);
    assert.equal((await history.forTable(scope)).some((e) => e.id === first.id), false);
    assert.ok((await history.clear(scope)) >= 3);
    assert.equal((await history.forTable(scope)).length, 0);
    assert.equal((await history.forTable({ ...scope, table: 'andere' })).length, 1);
  });

  await test('Verlauf liegt verschlüsselt auf der Platte und übersteht einen Neustart', async () => {
    await history.add([entry({ old: 'GeheimerName', value: 'x' })]);
    await history.flush();
    const raw = fs.readFileSync(path.join(work, 'sql-history.json'), 'utf8');
    assert.ok(JSON.parse(raw).sealed);
    assert.ok(!raw.includes('GeheimerName'));
    delete require.cache[historyPath];
    history = require(historyPath);
    const list = await history.forTable({ server: 'ssh:host:1:127.0.0.1:3306', db: 'shop', table: 'spieler' });
    assert.equal(list[0].old, 'GeheimerName');
    assert.equal(await history.clear(), 2);
    await history.flush();
    delete require.cache[historyPath];
    assert.equal((await require(historyPath).stats()).entries, 0);
  });

  await test('Pro Tabelle bleiben höchstens 3000 Einträge erhalten', async () => {
    history = require(historyPath);
    const many = Array.from({ length: 3050 }, (_v, i) => entry({ ts: i + 1, old: `v${i}` }));
    await history.add(many);
    const list = await history.forTable({ server: 'ssh:host:1:127.0.0.1:3306', db: 'shop', table: 'spieler' });
    assert.equal(list.length, 3000);
    assert.equal(list[0].old, 'v3049');
    assert.equal(list[2999].old, 'v50');
  });

  console.log(`\n${passed} SQL-Tests bestanden`);
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
