export const ident = (name: string): string => `\`${name.replace(/`/g, '``')}\``;
export const literal = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '')}'`;

export type DefaultMode = 'none' | 'null' | 'value' | 'now';

export interface ColumnSpec {
  name: string;
  type: string;
  length: string;
  unsigned: boolean;
  nullable: boolean;
  defaultMode: DefaultMode;
  defaultValue: string;
  autoIncrement: boolean;
  primary: boolean;
  unique: boolean;
}

export interface TypeInfo {
  id: string;
  label: string;
  group: string;
  length: 'none' | 'optional' | 'required' | 'values';
  hint?: string;
  numeric?: boolean;
  integer?: boolean;
  temporal?: boolean;
  text?: boolean;
}

export const COLUMN_TYPES: TypeInfo[] = [
  { id: 'INT', label: 'INT (ganze Zahl)', group: 'Zahlen', length: 'none', numeric: true, integer: true },
  { id: 'BIGINT', label: 'BIGINT (große ganze Zahl)', group: 'Zahlen', length: 'none', numeric: true, integer: true },
  { id: 'MEDIUMINT', label: 'MEDIUMINT', group: 'Zahlen', length: 'none', numeric: true, integer: true },
  { id: 'SMALLINT', label: 'SMALLINT', group: 'Zahlen', length: 'none', numeric: true, integer: true },
  { id: 'TINYINT', label: 'TINYINT', group: 'Zahlen', length: 'none', numeric: true, integer: true },
  { id: 'BOOLEAN', label: 'BOOLEAN (ja/nein)', group: 'Zahlen', length: 'none', numeric: true },
  { id: 'DECIMAL', label: 'DECIMAL (Kommazahl, exakt)', group: 'Zahlen', length: 'optional', hint: '10,2', numeric: true },
  { id: 'FLOAT', label: 'FLOAT', group: 'Zahlen', length: 'none', numeric: true },
  { id: 'DOUBLE', label: 'DOUBLE', group: 'Zahlen', length: 'none', numeric: true },
  { id: 'VARCHAR', label: 'VARCHAR (Text, begrenzt)', group: 'Text', length: 'required', hint: '255', text: true },
  { id: 'CHAR', label: 'CHAR (Text, feste Länge)', group: 'Text', length: 'required', hint: '36', text: true },
  { id: 'TEXT', label: 'TEXT (langer Text)', group: 'Text', length: 'none', text: true },
  { id: 'MEDIUMTEXT', label: 'MEDIUMTEXT', group: 'Text', length: 'none', text: true },
  { id: 'LONGTEXT', label: 'LONGTEXT', group: 'Text', length: 'none', text: true },
  { id: 'JSON', label: 'JSON', group: 'Text', length: 'none' },
  { id: 'ENUM', label: 'ENUM (Auswahlliste)', group: 'Text', length: 'values', hint: 'a,b,c', text: true },
  { id: 'DATE', label: 'DATE (Datum)', group: 'Zeit', length: 'none', temporal: true },
  { id: 'DATETIME', label: 'DATETIME (Datum und Uhrzeit)', group: 'Zeit', length: 'none', temporal: true },
  { id: 'TIMESTAMP', label: 'TIMESTAMP', group: 'Zeit', length: 'none', temporal: true },
  { id: 'TIME', label: 'TIME (Uhrzeit)', group: 'Zeit', length: 'none', temporal: true },
  { id: 'BLOB', label: 'BLOB (Binärdaten)', group: 'Sonstige', length: 'none' },
];

const NAMED = new Map(COLUMN_TYPES.map((t) => [t.id, t]));

export const typeInfo = (id: string): TypeInfo => NAMED.get(id.toUpperCase()) ?? { id: id.toUpperCase(), label: id.toUpperCase(), group: 'Sonstige', length: 'optional' };

export function blankColumn(over: Partial<ColumnSpec> = {}): ColumnSpec {
  return { name: '', type: 'VARCHAR', length: '255', unsigned: false, nullable: false, defaultMode: 'none', defaultValue: '', autoIncrement: false, primary: false, unique: false, ...over };
}

export const PRESET_COLUMNS: { label: string; spec: () => ColumnSpec }[] = [
  { label: 'ID (automatisch)', spec: () => blankColumn({ name: 'id', type: 'INT', length: '', unsigned: true, autoIncrement: true, primary: true }) },
  { label: 'UUID', spec: () => blankColumn({ name: 'uuid', type: 'CHAR', length: '36', unique: true }) },
  { label: 'Name', spec: () => blankColumn({ name: 'name', type: 'VARCHAR', length: '64' }) },
  { label: 'Erstellt am', spec: () => blankColumn({ name: 'created_at', type: 'DATETIME', length: '', defaultMode: 'now' }) },
];

function lengthOf(spec: ColumnSpec): string {
  const info = typeInfo(spec.type);
  const raw = spec.length.trim();
  if (info.length === 'none') return '';
  if (info.length === 'values') return `(${raw.split(',').map((v) => literal(v.trim())).join(', ')})`;
  return raw ? `(${raw})` : '';
}

export function typeSql(spec: ColumnSpec): string {
  const info = typeInfo(spec.type);
  if (info.id === 'BOOLEAN') return 'TINYINT(1)';
  const base = `${info.id}${lengthOf(spec)}`;
  return info.numeric && spec.unsigned && info.id !== 'BOOLEAN' ? `${base} UNSIGNED` : base;
}

export function validateColumn(spec: ColumnSpec): string | null {
  const name = spec.name.trim();
  if (!name) return 'Jede Spalte braucht einen Namen.';
  if (name.length > 64) return `Der Spaltenname „${name}“ ist länger als 64 Zeichen.`;
  if (/[\u0000-\u001f]/.test(name)) return `Der Spaltenname „${name}“ enthält ungültige Zeichen.`;
  const info = typeInfo(spec.type);
  const raw = spec.length.trim();
  if (info.length === 'required' && !raw) return `„${name}“: ${info.id} braucht eine Länge, z. B. ${info.hint}.`;
  if (info.length === 'required' || info.length === 'optional') {
    if (raw && !/^\d{1,5}(,\d{1,2})?$/.test(raw)) return `„${name}“: Die Länge „${raw}“ ist ungültig.`;
    if (raw && info.id !== 'DECIMAL' && raw.includes(',')) return `„${name}“: ${info.id} nimmt nur eine Länge ohne Komma.`;
    if ((info.id === 'VARCHAR' || info.id === 'CHAR') && raw && (Number(raw) < 1 || Number(raw) > 16383)) return `„${name}“: Die Länge muss zwischen 1 und 16383 liegen.`;
  }
  if (info.length === 'values' && raw.split(',').map((v) => v.trim()).filter(Boolean).length === 0) return `„${name}“: Die Auswahlliste braucht mindestens einen Wert, getrennt durch Komma.`;
  if (spec.autoIncrement && !info.integer) return `„${name}“: Nur ganze Zahlen können automatisch hochzählen.`;
  if (spec.autoIncrement && spec.nullable) return `„${name}“: Eine automatisch hochzählende Spalte darf nicht leer sein.`;
  if (spec.primary && spec.nullable) return `„${name}“: Ein Primärschlüssel darf nicht leer sein.`;
  if (spec.defaultMode === 'now' && !info.temporal) return `„${name}“: Die aktuelle Zeit passt nur zu Datum und Uhrzeit.`;
  if (spec.defaultMode === 'null' && !spec.nullable) return `„${name}“: NULL als Standard setzt voraus, dass die Spalte leer sein darf.`;
  return null;
}

export function validateColumns(columns: ColumnSpec[]): string | null {
  if (columns.length === 0) return 'Eine Tabelle braucht mindestens eine Spalte.';
  const seen = new Set<string>();
  for (const c of columns) {
    const problem = validateColumn(c);
    if (problem) return problem;
    const key = c.name.trim().toLowerCase();
    if (seen.has(key)) return `Die Spalte „${c.name.trim()}“ kommt doppelt vor.`;
    seen.add(key);
  }
  const auto = columns.filter((c) => c.autoIncrement);
  if (auto.length > 1) return 'Nur eine Spalte kann automatisch hochzählen.';
  if (auto[0] && !auto[0].primary && !auto[0].unique) return `„${auto[0].name.trim()}“ zählt automatisch hoch und muss deshalb Primärschlüssel oder eindeutig sein.`;
  return null;
}

export function columnDefinition(spec: ColumnSpec): string {
  const parts = [ident(spec.name.trim()), typeSql(spec), spec.nullable && !spec.primary ? 'NULL' : 'NOT NULL'];
  if (spec.autoIncrement) parts.push('AUTO_INCREMENT');
  else if (spec.defaultMode === 'null') parts.push('DEFAULT NULL');
  else if (spec.defaultMode === 'now') parts.push('DEFAULT CURRENT_TIMESTAMP');
  else if (spec.defaultMode === 'value') parts.push(`DEFAULT ${literal(spec.defaultValue)}`);
  return parts.join(' ');
}

const keyName = (table: string, column: string): string => `uq_${table}_${column}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);

export function createTableSql(db: string, table: string, columns: ColumnSpec[]): string {
  const name = table.trim();
  if (!name) throw new Error('Gib der Tabelle einen Namen.');
  if (name.length > 64 || /[\u0000-\u001f/\\.]/.test(name)) throw new Error('Der Tabellenname ist ungültig. Er darf höchstens 64 Zeichen lang sein und weder / noch \\ noch . enthalten.');
  const problem = validateColumns(columns);
  if (problem) throw new Error(problem);
  const lines = columns.map((c) => `  ${columnDefinition(c)}`);
  const primary = columns.filter((c) => c.primary).map((c) => ident(c.name.trim()));
  if (primary.length) lines.push(`  PRIMARY KEY (${primary.join(', ')})`);
  for (const c of columns) if (c.unique && !c.primary) lines.push(`  UNIQUE KEY ${ident(keyName(name, c.name.trim()))} (${ident(c.name.trim())})`);
  return `CREATE TABLE ${ident(db)}.${ident(name)} (\n${lines.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

export function addColumnSql(db: string, table: string, spec: ColumnSpec, after: string | null): string {
  const problem = validateColumn(spec);
  if (problem) throw new Error(problem);
  if (spec.primary) throw new Error('Einen Primärschlüssel kannst du nur beim Anlegen der Tabelle festlegen.');
  const position = after === null ? ' FIRST' : after ? ` AFTER ${ident(after)}` : '';
  const unique = spec.unique ? `, ADD UNIQUE KEY ${ident(keyName(table, spec.name.trim()))} (${ident(spec.name.trim())})` : '';
  return `ALTER TABLE ${ident(db)}.${ident(table)} ADD COLUMN ${columnDefinition(spec)}${position}${unique}`;
}

export function changeColumnSql(db: string, table: string, oldName: string, spec: ColumnSpec): string {
  const problem = validateColumn(spec);
  if (problem) throw new Error(problem);
  return `ALTER TABLE ${ident(db)}.${ident(table)} CHANGE COLUMN ${ident(oldName)} ${columnDefinition(spec)}`;
}

export function dropColumnSql(db: string, table: string, column: string): string {
  return `ALTER TABLE ${ident(db)}.${ident(table)} DROP COLUMN ${ident(column)}`;
}

export interface ExistingColumn {
  name: string;
  type: string;
  nullable: boolean;
  key: string;
  fallback: string | null;
  extra: string;
}

export function specOf(c: ExistingColumn): ColumnSpec {
  const match = /^(\w+)(?:\((.*)\))?(.*)$/.exec(c.type.trim());
  let type = (match?.[1] ?? c.type).toUpperCase();
  let length = match?.[2] ?? '';
  const tail = (match?.[3] ?? '').toLowerCase();
  if (type === 'TINYINT' && length === '1') {
    type = 'BOOLEAN';
    length = '';
  } else if (type === 'ENUM') {
    length = [...length.matchAll(/'((?:[^']|'')*)'/g)].map((m) => (m[1] ?? '').replace(/''/g, "'")).join(',');
  } else if (typeInfo(type).length === 'none' || typeInfo(type).integer) {
    length = '';
  }
  const auto = c.extra.toLowerCase().includes('auto_increment');
  let defaultMode: DefaultMode = 'none';
  let defaultValue = '';
  if (!auto && c.fallback !== null) {
    if (/^current_timestamp/i.test(c.fallback)) defaultMode = 'now';
    else if (c.fallback === 'NULL') defaultMode = 'null';
    else {
      defaultMode = 'value';
      defaultValue = c.fallback.replace(/^'(.*)'$/s, '$1').replace(/''/g, "'");
    }
  } else if (!auto && c.nullable) {
    defaultMode = 'null';
  }
  return { name: c.name, type, length, unsigned: tail.includes('unsigned'), nullable: c.nullable, defaultMode, defaultValue, autoIncrement: auto, primary: c.key === 'PRI', unique: c.key === 'UNI' };
}
