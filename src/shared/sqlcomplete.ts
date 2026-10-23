export interface ColumnHint {
  name: string;
  type: string;
  key?: string;
}

export interface SchemaView {
  databases: string[];
  tables: (db: string) => string[] | undefined;
  columns: (db: string, table: string) => ColumnHint[] | undefined;
}

export type ItemKind = 'keyword' | 'function' | 'database' | 'table' | 'column' | 'snippet' | 'operator';

export interface Item {
  label: string;
  insert: string;
  kind: ItemKind;
  detail?: string;
  cursor?: number;
}

export interface TableRef {
  db: string | null;
  table: string;
  alias: string | null;
}

export type Context = 'none' | 'start' | 'table' | 'database' | 'column' | 'qualified' | 'next';

export interface Analysis {
  context: Context;
  from: number;
  to: number;
  prefix: string;
  quoted: boolean;
  qualifier: string | null;
  qualifier2: string | null;
  refs: TableRef[];
  next: string[];
  proactive: boolean;
}

interface Token {
  type: 'word' | 'quoted' | 'string' | 'comment' | 'punct';
  text: string;
  start: number;
  end: number;
}

const STARTERS: Item[] = [
  { label: 'SELECT * FROM', insert: 'SELECT * FROM ', kind: 'snippet', detail: 'Alle Spalten lesen' },
  { label: 'SELECT COUNT(*) FROM', insert: 'SELECT COUNT(*) FROM ', kind: 'snippet', detail: 'Zeilen zählen' },
  { label: 'INSERT INTO', insert: 'INSERT INTO ', kind: 'snippet', detail: 'Zeile einfügen' },
  { label: 'UPDATE', insert: 'UPDATE ', kind: 'snippet', detail: 'Zeilen ändern' },
  { label: 'DELETE FROM', insert: 'DELETE FROM ', kind: 'snippet', detail: 'Zeilen löschen' },
  { label: 'CREATE TABLE', insert: 'CREATE TABLE ', kind: 'snippet', detail: 'Tabelle anlegen' },
  { label: 'ALTER TABLE', insert: 'ALTER TABLE ', kind: 'snippet', detail: 'Tabelle ändern' },
  { label: 'SHOW TABLES', insert: 'SHOW TABLES;', kind: 'snippet', detail: 'Tabellen auflisten' },
  { label: 'SHOW DATABASES', insert: 'SHOW DATABASES;', kind: 'snippet', detail: 'Datenbanken auflisten' },
  { label: 'DESCRIBE', insert: 'DESCRIBE ', kind: 'snippet', detail: 'Spalten einer Tabelle zeigen' },
  { label: 'USE', insert: 'USE ', kind: 'snippet', detail: 'Datenbank wechseln' },
  { label: 'EXPLAIN SELECT', insert: 'EXPLAIN SELECT ', kind: 'snippet', detail: 'Abfrageplan ansehen' },
];

const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'AS', 'DISTINCT', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'ON', 'USING', 'UNION', 'UNION ALL', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'CREATE DATABASE', 'CREATE INDEX', 'CREATE VIEW', 'CREATE USER', 'ALTER TABLE', 'DROP TABLE', 'DROP DATABASE', 'DROP INDEX', 'TRUNCATE TABLE',
  'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'AUTO_INCREMENT', 'ASC', 'DESC', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF',
  'SHOW', 'DESCRIBE', 'USE', 'EXPLAIN', 'GRANT', 'REVOKE', 'FLUSH PRIVILEGES', 'ENGINE', 'CHARACTER SET', 'COLLATE', 'INTERVAL', 'TRUE', 'FALSE',
];

const FUNCTIONS: [string, string][] = [
  ['COUNT', 'Anzahl'], ['SUM', 'Summe'], ['AVG', 'Durchschnitt'], ['MIN', 'Kleinster Wert'], ['MAX', 'Größter Wert'], ['CONCAT', 'Texte verbinden'],
  ['NOW', 'Aktuelle Zeit'], ['CURDATE', 'Heutiges Datum'], ['DATE_FORMAT', 'Datum formatieren'], ['DATE_ADD', 'Zeit addieren'], ['DATEDIFF', 'Tage zwischen Daten'],
  ['IFNULL', 'Ersatz für NULL'], ['COALESCE', 'Erster Wert ungleich NULL'], ['LENGTH', 'Länge'], ['UPPER', 'Großbuchstaben'], ['LOWER', 'Kleinbuchstaben'],
  ['TRIM', 'Leerzeichen entfernen'], ['SUBSTRING', 'Teiltext'], ['REPLACE', 'Text ersetzen'], ['ROUND', 'Runden'], ['FLOOR', 'Abrunden'], ['CEIL', 'Aufrunden'],
  ['UUID', 'Neue UUID'], ['GROUP_CONCAT', 'Werte einer Gruppe verbinden'], ['JSON_EXTRACT', 'Wert aus JSON'], ['LAST_INSERT_ID', 'Zuletzt erzeugte ID'],
];

const OPERATORS: Item[] = [
  { label: '=', insert: '= ', kind: 'operator', detail: 'gleich' },
  { label: '<>', insert: '<> ', kind: 'operator', detail: 'ungleich' },
  { label: 'LIKE', insert: "LIKE '%%'", kind: 'operator', detail: 'enthält Muster', cursor: 7 },
  { label: 'IN', insert: 'IN ()', kind: 'operator', detail: 'einer von mehreren', cursor: 4 },
  { label: 'IS NULL', insert: 'IS NULL', kind: 'operator', detail: 'ist leer' },
  { label: 'IS NOT NULL', insert: 'IS NOT NULL', kind: 'operator', detail: 'ist nicht leer' },
  { label: 'BETWEEN', insert: 'BETWEEN  AND ', kind: 'operator', detail: 'zwischen zwei Werten', cursor: 8 },
  { label: '>', insert: '> ', kind: 'operator', detail: 'größer' },
  { label: '<', insert: '< ', kind: 'operator', detail: 'kleiner' },
];

const NEXT: Record<string, string[]> = {
  CREATE: ['TABLE', 'DATABASE', 'INDEX', 'VIEW', 'USER'],
  DROP: ['TABLE', 'DATABASE', 'INDEX', 'VIEW', 'USER'],
  ALTER: ['TABLE'],
  TRUNCATE: ['TABLE'],
  INSERT: ['INTO'],
  DELETE: ['FROM'],
  GROUP: ['BY'],
  ORDER: ['BY'],
  LEFT: ['JOIN'],
  RIGHT: ['JOIN'],
  INNER: ['JOIN'],
  CROSS: ['JOIN'],
  UNION: ['ALL', 'SELECT'],
  SHOW: ['DATABASES', 'TABLES', 'COLUMNS FROM', 'CREATE TABLE', 'INDEX FROM', 'PROCESSLIST', 'STATUS', 'VARIABLES', 'GRANTS', 'TABLE STATUS'],
  EXPLAIN: ['SELECT'],
  ASC: ['LIMIT'],
  DESC: ['LIMIT'],
};

const AFTER_TABLE: Record<string, string[]> = {
  SELECT: ['WHERE', 'ORDER BY', 'GROUP BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'AS'],
  DELETE: ['WHERE', 'ORDER BY', 'LIMIT'],
  UPDATE: ['SET'],
  INSERT: ['VALUES', 'SELECT'],
  ALTER: ['ADD COLUMN', 'DROP COLUMN', 'MODIFY COLUMN', 'CHANGE COLUMN', 'RENAME TO', 'ADD INDEX', 'ADD PRIMARY KEY'],
  DESCRIBE: [],
  DROP: [],
  TRUNCATE: [],
};

const AFTER_COLUMN_CLAUSE: Record<string, string[]> = {
  ORDER: ['ASC', 'DESC', 'LIMIT'],
  GROUP: ['HAVING', 'ORDER BY', 'LIMIT'],
};

const TABLE_CLAUSE = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'DESCRIBE', 'TRUNCATE', 'ANALYZE', 'OPTIMIZE', 'REFERENCES']);
const COLUMN_CLAUSE = new Set(['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'BY', 'SET', 'HAVING', 'WHEN', 'THEN', 'ELSE', 'USING', 'DISTINCT', 'NOT']);
const STOP_ALIAS = new Set(['WHERE', 'ON', 'USING', 'SET', 'GROUP', 'ORDER', 'LIMIT', 'LEFT', 'RIGHT', 'INNER', 'CROSS', 'OUTER', 'JOIN', 'HAVING', 'UNION', 'VALUES', 'SELECT', 'FROM', 'AS', 'AND', 'OR', 'NATURAL', 'STRAIGHT_JOIN', 'FOR']);
const RESERVED = new Set([...KEYWORDS.flatMap((k) => k.split(' ')), 'KEY', 'TABLE', 'INDEX', 'DATABASE', 'USER', 'ORDER', 'GROUP', 'RANGE', 'READ', 'WRITE', 'RANK', 'LEFT', 'RIGHT', 'DESC', 'ASC', 'LIMIT', 'RETURN', 'TRIGGER']);

export function quoteIdent(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(name) && !RESERVED.has(name.toUpperCase()) ? name : `\`${name.replace(/`/g, '``')}\``;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const start = i;
    if (c === '-' && text[i + 1] === '-' || c === '#') {
      while (i < text.length && text[i] !== '\n') i++;
      out.push({ type: 'comment', text: text.slice(start, i), start, end: i });
    } else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 2;
      out.push({ type: 'comment', text: text.slice(start, i), start, end: i });
    } else if (c === "'" || c === '"') {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      i = Math.min(text.length, i + 1);
      out.push({ type: 'string', text: text.slice(start, i), start, end: i });
    } else if (c === '`') {
      i++;
      while (i < text.length && text[i] !== '`') i++;
      const closed = text[i] === '`';
      i = Math.min(text.length, i + 1);
      out.push({ type: 'quoted', text: text.slice(start + 1, closed ? i - 1 : i), start, end: closed ? i : i });
    } else if (/[A-Za-z0-9_$À-￿]/.test(c)) {
      while (i < text.length && /[A-Za-z0-9_$À-￿]/.test(text[i] as string)) i++;
      out.push({ type: 'word', text: text.slice(start, i), start, end: i });
    } else {
      i++;
      out.push({ type: 'punct', text: c, start, end: i });
    }
  }
  return out;
}

function statementBounds(tokens: Token[], caret: number): [number, number] {
  let first = 0;
  let last = tokens.length;
  tokens.forEach((t, i) => {
    if (t.type === 'punct' && t.text === ';') {
      if (t.end <= caret) first = i + 1;
      else if (last === tokens.length && t.start >= caret) last = i;
    }
  });
  return [first, last];
}

function collectRefs(tokens: Token[]): TableRef[] {
  const refs: TableRef[] = [];
  const isName = (t?: Token): boolean => Boolean(t && (t.type === 'quoted' || (t.type === 'word' && !STOP_ALIAS.has(t.text.toUpperCase()))));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.type !== 'word' || !['FROM', 'JOIN', 'UPDATE', 'INTO'].includes(t.text.toUpperCase())) continue;
    let j = i + 1;
    while (isName(tokens[j])) {
      let db: string | null = null;
      let table = (tokens[j] as Token).text;
      j++;
      if (tokens[j]?.text === '.' && isName(tokens[j + 1])) {
        db = table;
        table = (tokens[j + 1] as Token).text;
        j += 2;
      }
      let alias: string | null = null;
      if (tokens[j]?.type === 'word' && tokens[j]?.text.toUpperCase() === 'AS' && isName(tokens[j + 1])) {
        alias = (tokens[j + 1] as Token).text;
        j += 2;
      } else if (isName(tokens[j]) && tokens[j]?.type === 'word') {
        alias = (tokens[j] as Token).text;
        j++;
      }
      refs.push({ db, table, alias });
      if (tokens[j]?.text === ',' && t.text.toUpperCase() === 'FROM') j++;
      else break;
    }
  }
  return refs;
}

export function analyze(text: string, caret: number): Analysis {
  const base: Analysis = { context: 'none', from: caret, to: caret, prefix: '', quoted: false, qualifier: null, qualifier2: null, refs: [], next: [], proactive: false };
  const tokens = tokenize(text);
  const inside = (t: Token): boolean => {
    if (t.type !== 'string' && t.type !== 'comment') return false;
    if (caret <= t.start) return false;
    const closed = t.type === 'string' ? t.text.length >= 2 && t.text.endsWith(t.text[0] as string) : t.text.startsWith('/*') ? t.text.endsWith('*/') : false;
    return closed ? caret < t.end : caret <= t.end;
  };
  if (tokens.some(inside)) return base;

  const [first, last] = statementBounds(tokens, caret);
  const stmt = tokens.slice(first, last);
  const refs = collectRefs(stmt);

  let from = caret;
  let to = caret;
  let prefix = '';
  let quoted = false;
  const current = stmt.find((t) => (t.type === 'word' || t.type === 'quoted') && caret > t.start && caret <= t.end);
  if (current) {
    quoted = current.type === 'quoted';
    from = current.start;
    prefix = text.slice(quoted ? current.start + 1 : current.start, caret);
    to = quoted && text[caret] === '`' ? caret + 1 : caret;
  }
  const before = stmt.filter((t) => t.end <= from);
  const L = before[before.length - 1];
  const upper = (t?: Token): string => (t && t.type === 'word' ? t.text.toUpperCase() : '');
  const result: Analysis = { ...base, from, to, prefix, quoted, refs };

  if (L && L.type === 'punct' && L.text === '.') {
    const q1 = before[before.length - 2];
    if (!q1 || (q1.type !== 'word' && q1.type !== 'quoted')) return base;
    const dot = before[before.length - 3];
    const q0 = before[before.length - 4];
    result.context = 'qualified';
    result.qualifier = q1.text;
    result.qualifier2 = dot?.text === '.' && q0 && (q0.type === 'word' || q0.type === 'quoted') ? q0.text : null;
    result.proactive = true;
    return result;
  }

  if (before.length === 0) {
    result.context = 'start';
    result.proactive = prefix.length > 0;
    return result;
  }

  if (upper(before[0]) === 'USE' && before.length === 1) {
    result.context = 'database';
    result.proactive = true;
    return result;
  }

  let clause = '';
  for (let i = before.length - 1; i >= 0; i--) {
    const w = upper(before[i]);
    if (TABLE_CLAUSE.has(w) || COLUMN_CLAUSE.has(w) || w === 'ORDER' || w === 'GROUP') {
      clause = w;
      break;
    }
  }
  const firstWord = upper(before[0]);
  const lastWord = upper(L);
  const lastIsName = L && (L.type === 'quoted' || (L.type === 'word' && !RESERVED.has(lastWord) && !TABLE_CLAUSE.has(lastWord) && !COLUMN_CLAUSE.has(lastWord)));

  if (L && L.type === 'word' && (TABLE_CLAUSE.has(lastWord) || (lastWord === 'DESC' && before.length === 1))) {
    result.context = 'table';
    result.proactive = true;
    return result;
  }
  if (L && L.type === 'punct' && L.text === ',' && TABLE_CLAUSE.has(clause)) {
    result.context = 'table';
    result.proactive = true;
    return result;
  }
  if (NEXT[lastWord] !== undefined && L?.type === 'word') {
    result.context = 'next';
    result.next = NEXT[lastWord] ?? [];
    result.proactive = (NEXT[lastWord] ?? []).length > 0;
    return result;
  }
  if (lastIsName && TABLE_CLAUSE.has(clause) && !['SELECT'].includes(clause)) {
    result.context = 'next';
    result.next = AFTER_TABLE[firstWord] ?? AFTER_TABLE.SELECT ?? [];
    result.proactive = result.next.length > 0;
    return result;
  }
  if (lastIsName && (clause === 'BY') && (upper(before[before.length - 2]) === 'BY' || before[before.length - 2]?.text === ',')) {
    const by = [...before].reverse().find((t) => ['ORDER', 'GROUP'].includes(upper(t)));
    result.context = 'next';
    result.next = AFTER_COLUMN_CLAUSE[upper(by)] ?? [];
    result.proactive = result.next.length > 0;
    return result;
  }
  if (lastIsName && clause === 'SELECT' && !prefix) {
    result.context = 'next';
    result.next = ['FROM', 'AS', 'WHERE'];
    result.proactive = true;
    return result;
  }
  if (lastIsName && (clause === 'WHERE' || clause === 'AND' || clause === 'OR' || clause === 'HAVING' || clause === 'ON')) {
    result.context = 'next';
    result.next = ['__operators__'];
    result.proactive = true;
    return result;
  }
  if (COLUMN_CLAUSE.has(clause) || (L?.type === 'punct' && ['(', ',', '=', '<', '>', '+', '-', '*', '/'].includes(L.text))) {
    result.context = 'column';
    result.proactive = (L?.type === 'word' && COLUMN_CLAUSE.has(lastWord)) || (L?.type === 'punct' && ['(', ','].includes(L.text));
    return result;
  }
  result.context = 'next';
  result.next = [];
  return result;
}

export interface Needs {
  databases: boolean;
  tables: string[];
  columns: { db: string; table: string }[];
}

export function needs(a: Analysis, schema: Pick<SchemaView, 'databases' | 'tables'>, defaultDb: string): Needs {
  const out: Needs = { databases: false, tables: [], columns: [] };
  const addTables = (db: string): void => void (db && !out.tables.includes(db) && out.tables.push(db));
  const addColumns = (db: string, table: string): void => void (db && table && !out.columns.some((c) => c.db === db && c.table === table) && out.columns.push({ db, table }));
  if (a.context === 'database') out.databases = true;
  if (a.context === 'table') {
    out.databases = true;
    addTables(defaultDb);
  }
  if (a.context === 'qualified') {
    out.databases = true;
    const q = a.qualifier ?? '';
    const ref = a.refs.find((r) => r.alias === q) ?? (schema.databases.includes(q) ? undefined : a.refs.find((r) => r.table === q));
    if (a.qualifier2) addColumns(a.qualifier2, q);
    else if (ref) addColumns(ref.db ?? defaultDb, ref.table);
    else if (schema.databases.includes(q)) addTables(q);
    else addColumns(defaultDb, q);
  }
  if (a.context === 'column') for (const r of a.refs) addColumns(r.db ?? defaultDb, r.table);
  if (a.context === 'next' && a.next.includes('__operators__')) for (const r of a.refs) addColumns(r.db ?? defaultDb, r.table);
  return out;
}

const rank = (label: string, prefix: string): number => {
  if (!prefix) return 0;
  const l = label.toLowerCase();
  const p = prefix.toLowerCase();
  if (l === p) return 0;
  if (l.startsWith(p)) return 1;
  if (l.split(/[_\s.]/).some((w) => w.startsWith(p))) return 2;
  if (p.length >= 2 && l.includes(p)) return 3;
  if (p.length >= 3) {
    let i = 0;
    for (const ch of l) if (ch === p[i]) i++;
    if (i === p.length) return 4;
  }
  return -1;
};

export function suggest(a: Analysis, schema: SchemaView, defaultDb: string, usage: Record<string, number> = {}, force = false): Item[] {
  if (a.context === 'none') return [];
  if (!force && !a.proactive && a.prefix.length === 0) return [];
  const items: Item[] = [];
  const wrap = (name: string): string => (a.quoted ? `\`${name.replace(/`/g, '``')}\`` : quoteIdent(name));
  const tableItems = (db: string, qualify: boolean): void => {
    for (const t of schema.tables(db) ?? []) items.push({ label: t, insert: wrap(t), kind: 'table', detail: qualify ? db : undefined });
  };
  const columnItems = (db: string, table: string, qualifier: string | null, detail?: string): void => {
    for (const c of schema.columns(db, table) ?? []) items.push({ label: c.name, insert: wrap(c.name), kind: 'column', detail: detail ?? `${c.type}${c.key === 'PRI' ? ' · Primärschlüssel' : ''}` });
    void qualifier;
  };
  const functionItems = (): void => {
    for (const [name, detail] of FUNCTIONS) items.push({ label: `${name}()`, insert: `${name}()`, kind: 'function', detail, cursor: name.length + 1 });
  };
  const keywordItems = (list: string[] = KEYWORDS): void => {
    for (const k of list) items.push({ label: k, insert: `${k} `, kind: 'keyword' });
  };

  if (a.context === 'start') {
    items.push(...STARTERS);
    keywordItems(KEYWORDS.filter((k) => /^(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|CREATE DATABASE|ALTER TABLE|DROP TABLE|DROP DATABASE|TRUNCATE TABLE|SHOW|DESCRIBE|USE|EXPLAIN|GRANT)$/.test(k)));
  } else if (a.context === 'database') {
    for (const d of schema.databases) items.push({ label: d, insert: wrap(d), kind: 'database' });
  } else if (a.context === 'table') {
    tableItems(defaultDb, false);
    for (const d of schema.databases) items.push({ label: d, insert: wrap(d), kind: 'database', detail: 'Datenbank' });
  } else if (a.context === 'qualified') {
    const q = a.qualifier ?? '';
    const ref = a.refs.find((r) => r.alias === q) ?? (schema.databases.includes(q) ? undefined : a.refs.find((r) => r.table === q));
    if (a.qualifier2) columnItems(a.qualifier2, q, q);
    else if (ref) columnItems(ref.db ?? defaultDb, ref.table, q);
    else if (schema.databases.includes(q)) tableItems(q, false);
    else columnItems(defaultDb, q, q);
  } else if (a.context === 'column') {
    for (const r of a.refs) {
      const db = r.db ?? defaultDb;
      for (const c of schema.columns(db, r.table) ?? []) {
        items.push({ label: c.name, insert: wrap(c.name), kind: 'column', detail: `${r.alias ?? r.table} · ${c.type}${c.key === 'PRI' ? ' · Primärschlüssel' : ''}` });
      }
    }
    if (a.refs.length > 1) {
      for (const r of a.refs) for (const c of schema.columns(r.db ?? defaultDb, r.table) ?? []) items.push({ label: `${r.alias ?? r.table}.${c.name}`, insert: `${r.alias ?? r.table}.${wrap(c.name)}`, kind: 'column', detail: c.type });
    }
    if (a.prefix || force) {
      items.push({ label: '*', insert: '*', kind: 'keyword', detail: 'Alle Spalten' });
      functionItems();
      keywordItems(['DISTINCT', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'CASE', 'AS', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'LIMIT']);
    } else {
      items.push({ label: '*', insert: '*', kind: 'keyword', detail: 'Alle Spalten' });
    }
  } else if (a.context === 'next') {
    if (a.next.includes('__operators__')) {
      items.push(...OPERATORS);
      keywordItems(['AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT']);
    } else if (a.next.length > 0) {
      keywordItems(a.next);
    } else {
      keywordItems();
      functionItems();
    }
  }

  const seen = new Set<string>();
  const scored: { item: Item; score: number; boost: number; order: number; index: number }[] = [];
  const order: Record<ItemKind, number> = { column: 0, table: 1, database: 2, snippet: 3, keyword: 4, operator: 4, function: 5 };
  for (const item of items) {
    const id = `${item.kind}:${item.label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const score = rank(item.label, a.prefix);
    if (score < 0) continue;
    if (a.prefix && item.label.toLowerCase() === a.prefix.toLowerCase() && a.context !== 'qualified') continue;
    scored.push({ item, score, boost: usage[`${item.kind}:${item.label}`] ?? 0, order: order[item.kind], index: scored.length });
  }
  scored.sort((x, y) => x.score - y.score || y.boost - x.boost || x.order - y.order || x.index - y.index);
  return scored.slice(0, 12).map((s) => s.item);
}

export function applyItem(text: string, a: Analysis, item: Item): { text: string; caret: number } {
  let insert = item.insert;
  if (a.quoted && item.kind !== 'keyword' && item.kind !== 'function' && item.kind !== 'snippet' && item.kind !== 'operator' && !insert.startsWith('`')) insert = `\`${item.label}\``;
  const out = text.slice(0, a.from) + insert + text.slice(a.to);
  const caret = a.from + (item.cursor ?? insert.length);
  return { text: out, caret };
}
