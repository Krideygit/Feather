const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadCompiler() {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'feather-bp-')), 'compile.cjs');
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', 'src', 'renderer', 'blueprint', 'compile.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
  });
  return require(out);
}

const node = (id, type, data, x = 0, y = 0) => ({ id, type, data, position: { x, y } });
const edge = (source, target, targetHandle = 'in') => ({ id: `${source}-${target}-${targetHandle}`, source, target, sourceHandle: 'out', targetHandle });

const { compile } = loadCompiler();
let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('ok  ', name);
};

const users = node('t1', 'table', { database: 'shop', table: 'users', alias: '' });
const orders = node('t2', 'table', { database: 'shop', table: 'orders', alias: '' });

test('table to result', () => {
  const r = compile([users, node('r', 'result', {}, 400)], [edge('t1', 'r')]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.statements[0].sql, 'SELECT * FROM `shop`.`users`');
});

test('filter with comparison, order and limit', () => {
  const nodes = [
    users,
    node('c', 'compare', { column: 'users.age', op: '>=', value: '18', valueType: 'auto' }),
    node('f', 'filter', {}),
    node('o', 'order', { column: 'users.name', dir: 'DESC' }),
    node('l', 'limit', { count: 10, offset: 5 }),
    node('r', 'result', {}, 900),
  ];
  const edges = [edge('t1', 'f'), edge('c', 'f', 'cond'), edge('f', 'o'), edge('o', 'l'), edge('l', 'r')];
  const r = compile(nodes, edges);
  assert.deepEqual(r.problems, []);
  assert.equal(r.statements[0].sql, 'SELECT * FROM `shop`.`users` WHERE (`users`.`age` >= 18) ORDER BY `users`.`name` DESC LIMIT 10 OFFSET 5');
});

test('values are escaped and cannot break out', () => {
  const nodes = [
    users,
    node('c', 'compare', { column: 'users.name', op: '=', value: "x'; DROP TABLE users; --", valueType: 'auto' }),
    node('f', 'filter', {}),
    node('r', 'result', {}, 500),
  ];
  const r = compile(nodes, [edge('t1', 'f'), edge('c', 'f', 'cond'), edge('f', 'r')]);
  assert.equal(r.statements[0].sql, "SELECT * FROM `shop`.`users` WHERE (`users`.`name` = 'x\\'; DROP TABLE users; --')");
});

test('identifiers with backticks are doubled', () => {
  const evil = node('t', 'table', { database: 'a`b', table: 'c', alias: '' });
  const r = compile([evil, node('r', 'result', {}, 100)], [edge('t', 'r')]);
  assert.equal(r.statements[0].sql, 'SELECT * FROM `a``b`.`c`');
});

test('logic combines conditions', () => {
  const nodes = [
    users,
    node('c1', 'compare', { column: 'users.age', op: '>', value: '30', valueType: 'number' }),
    node('c2', 'compare', { column: 'users.city', op: 'LIKE', value: 'Ber%', valueType: 'auto' }),
    node('l', 'logic', { op: 'OR' }),
    node('n', 'not', {}),
    node('f', 'filter', {}),
    node('r', 'result', {}, 900),
  ];
  const edges = [edge('c1', 'l', 'a'), edge('c2', 'l', 'b'), edge('l', 'n', 'a'), edge('t1', 'f'), edge('n', 'f', 'cond'), edge('f', 'r')];
  const r = compile(nodes, edges);
  assert.deepEqual(r.problems, []);
  assert.equal(r.statements[0].sql, "SELECT * FROM `shop`.`users` WHERE (NOT ((`users`.`age` > 30) OR (`users`.`city` LIKE 'Ber%')))");
});

test('join then group with aggregates', () => {
  const nodes = [
    users,
    orders,
    node('j', 'join', { kind: 'LEFT', left: 'users.id', right: 'orders.user_id' }),
    node('g', 'aggregate', { by: ['users.name'], aggregates: [{ fn: 'COUNT', column: '', alias: 'bestellungen' }, { fn: 'SUM', column: 'orders.total', alias: 'umsatz' }] }),
    node('o', 'order', { column: 'umsatz', dir: 'DESC' }),
    node('r', 'result', {}, 900),
  ];
  const edges = [edge('t1', 'j', 'left'), edge('t2', 'j', 'right'), edge('j', 'g'), edge('g', 'o'), edge('o', 'r')];
  const r = compile(nodes, edges);
  assert.deepEqual(r.problems, []);
  assert.equal(
    r.statements[0].sql,
    'SELECT `users`.`name`, COUNT(*) AS `bestellungen`, SUM(`orders`.`total`) AS `umsatz` FROM `shop`.`users` LEFT JOIN `shop`.`orders` ON `users`.`id` = `orders`.`user_id` GROUP BY `users`.`name` ORDER BY `umsatz` DESC',
  );
});

test('filter after limit wraps a subquery', () => {
  const nodes = [
    users,
    node('l', 'limit', { count: 5, offset: 0 }),
    node('c', 'compare', { column: 'users.age', op: '>', value: '1', valueType: 'auto' }),
    node('f', 'filter', {}),
    node('r', 'result', {}, 900),
  ];
  const r = compile(nodes, [edge('t1', 'l'), edge('l', 'f'), edge('c', 'f', 'cond'), edge('f', 'r')]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.statements[0].sql, 'SELECT * FROM (SELECT * FROM `shop`.`users` LIMIT 5) AS `t1` WHERE (`age` > 1)');
});

test('insert, update and delete', () => {
  const nodes = [
    node('i', 'insert', { database: 'shop', table: 'users', values: [{ column: 'name', value: 'Ada', valueType: 'text' }, { column: 'age', value: '36', valueType: 'auto' }, { column: 'note', value: '', valueType: 'null' }] }, 0),
    node('c', 'compare', { column: 'users.id', op: '=', value: '7', valueType: 'auto' }),
    node('u', 'update', { database: 'shop', table: 'users', sets: [{ column: 'age', value: '37', valueType: 'auto' }], all: false }, 100),
    node('d', 'delete', { database: 'shop', table: 'users', all: false }, 200),
  ];
  const r = compile(nodes, [edge('c', 'u', 'cond'), edge('c', 'd', 'cond')]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.statements.map((s) => s.sql), [
    "INSERT INTO `shop`.`users` (`name`, `age`, `note`) VALUES ('Ada', 36, NULL)",
    'UPDATE `shop`.`users` SET `age` = 37 WHERE `id` = 7',
    'DELETE FROM `shop`.`users` WHERE `id` = 7',
  ]);
});

test('delete without condition is refused unless all rows are confirmed', () => {
  const bare = compile([node('d', 'delete', { database: 'shop', table: 'users', all: false })], []);
  assert.equal(bare.statements.length, 0);
  assert.ok(bare.problems.length > 0);
  const all = compile([node('d', 'delete', { database: 'shop', table: 'users', all: true })], []);
  assert.equal(all.statements[0].sql, 'DELETE FROM `shop`.`users`');
});

test('missing connections and cycles are reported', () => {
  assert.ok(compile([node('r', 'result', {})], []).problems.some((p) => p.nodeId === 'r'));
  assert.ok(compile([], []).problems.length === 1);
  const a = node('a', 'distinct', {});
  const b = node('b', 'distinct', {});
  const r = node('r', 'result', {}, 100);
  const cyc = compile([a, b, r], [edge('a', 'b'), edge('b', 'a'), edge('b', 'r')]);
  assert.ok(cyc.problems.some((p) => /Kreis/.test(p.message)));
});

test('number type rejects text', () => {
  const nodes = [users, node('c', 'compare', { column: 'users.age', op: '=', value: 'abc', valueType: 'number' }), node('f', 'filter', {}), node('r', 'result', {}, 500)];
  const r = compile(nodes, [edge('t1', 'f'), edge('c', 'f', 'cond'), edge('f', 'r')]);
  assert.ok(r.problems.length > 0);
});

console.log(`\n${passed} Blueprint-Tests bestanden`);
