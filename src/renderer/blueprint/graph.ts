import type { Edge, Node } from '@xyflow/react';

export type PinType = 'rows' | 'cond';
export type ValueType = 'auto' | 'text' | 'number' | 'column' | 'null';
export type CompareOp = '=' | '<>' | '<' | '<=' | '>' | '>=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
export type Aggregate = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
export type JoinKind = 'INNER' | 'LEFT' | 'RIGHT';

export type Assignment = { column: string; value: string; valueType: ValueType };
export type AggregateItem = { fn: Aggregate; column: string; alias: string };

export type TableData = { database: string; table: string; alias: string };
export type JoinData = { kind: JoinKind; left: string; right: string };
export type ColumnsData = { columns: string[] };
export type FilterData = Record<string, never>;
export type CompareData = { column: string; op: CompareOp; value: string; valueType: ValueType };
export type LogicData = { op: 'AND' | 'OR' };
export type NotData = Record<string, never>;
export type GroupData = { by: string[]; aggregates: AggregateItem[] };
export type OrderData = { column: string; dir: 'ASC' | 'DESC' };
export type LimitData = { count: number; offset: number };
export type DistinctData = Record<string, never>;
export type ResultData = Record<string, never>;
export type InsertData = { database: string; table: string; values: Assignment[] };
export type UpdateData = { database: string; table: string; sets: Assignment[]; all: boolean };
export type DeleteData = { database: string; table: string; all: boolean };

export type BpNode =
  | Node<TableData, 'table'>
  | Node<JoinData, 'join'>
  | Node<ColumnsData, 'columns'>
  | Node<FilterData, 'filter'>
  | Node<CompareData, 'compare'>
  | Node<LogicData, 'logic'>
  | Node<NotData, 'not'>
  | Node<GroupData, 'aggregate'>
  | Node<OrderData, 'order'>
  | Node<LimitData, 'limit'>
  | Node<DistinctData, 'distinct'>
  | Node<ResultData, 'result'>
  | Node<InsertData, 'insert'>
  | Node<UpdateData, 'update'>
  | Node<DeleteData, 'delete'>;

export type NodeKind = NonNullable<BpNode['type']>;
export type BpEdge = Edge;

export interface PinDef {
  id: string;
  label: string;
  type: PinType;
}

export interface NodeDef {
  kind: NodeKind;
  title: string;
  group: string;
  description: string;
  header: string;
  inputs: PinDef[];
  outputs: PinDef[];
  width: number;
  create: () => BpNode['data'];
}

export const PIN_COLORS: Record<PinType, string> = { rows: '#0ea5e9', cond: '#f59e0b' };

export const GROUP_ORDER = ['Quelle', 'Transformieren', 'Bedingungen', 'Ausgabe', 'Aktionen'];

const rowsIn = (id = 'in', label = 'Zeilen'): PinDef => ({ id, label, type: 'rows' });
const rowsOut: PinDef = { id: 'out', label: 'Zeilen', type: 'rows' };
const condIn = (id = 'cond', label = 'Bedingung'): PinDef => ({ id, label, type: 'cond' });
const condOut: PinDef = { id: 'out', label: 'Bedingung', type: 'cond' };

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
  table: {
    kind: 'table',
    title: 'Tabelle',
    group: 'Quelle',
    description: 'Liest alle Zeilen einer Tabelle.',
    header: 'bg-sky-600',
    inputs: [],
    outputs: [rowsOut],
    width: 250,
    create: () => ({ database: '', table: '', alias: '' }),
  },
  join: {
    kind: 'join',
    title: 'Verbinden (JOIN)',
    group: 'Transformieren',
    description: 'Verknüpft zwei Zeilenmengen über je eine Spalte.',
    header: 'bg-emerald-600',
    inputs: [rowsIn('left', 'Links'), rowsIn('right', 'Rechts')],
    outputs: [rowsOut],
    width: 260,
    create: () => ({ kind: 'INNER', left: '', right: '' }),
  },
  columns: {
    kind: 'columns',
    title: 'Spalten wählen',
    group: 'Transformieren',
    description: 'Behält nur die gewählten Spalten.',
    header: 'bg-emerald-600',
    inputs: [rowsIn()],
    outputs: [rowsOut],
    width: 260,
    create: () => ({ columns: [] }),
  },
  filter: {
    kind: 'filter',
    title: 'Filter (WHERE)',
    group: 'Transformieren',
    description: 'Behält Zeilen, für die die Bedingung gilt.',
    header: 'bg-emerald-600',
    inputs: [rowsIn(), condIn()],
    outputs: [rowsOut],
    width: 220,
    create: () => ({}),
  },
  aggregate: {
    kind: 'aggregate',
    title: 'Gruppieren',
    group: 'Transformieren',
    description: 'Fasst Zeilen zusammen und berechnet COUNT, SUM, AVG, MIN, MAX.',
    header: 'bg-emerald-600',
    inputs: [rowsIn()],
    outputs: [rowsOut],
    width: 290,
    create: () => ({ by: [], aggregates: [{ fn: 'COUNT', column: '', alias: 'anzahl' }] }),
  },
  order: {
    kind: 'order',
    title: 'Sortieren',
    group: 'Transformieren',
    description: 'Sortiert nach einer Spalte. Mehrere Knoten ergeben mehrere Sortierstufen.',
    header: 'bg-emerald-600',
    inputs: [rowsIn()],
    outputs: [rowsOut],
    width: 250,
    create: () => ({ column: '', dir: 'ASC' }),
  },
  limit: {
    kind: 'limit',
    title: 'Limit',
    group: 'Transformieren',
    description: 'Begrenzt die Anzahl der Zeilen.',
    header: 'bg-emerald-600',
    inputs: [rowsIn()],
    outputs: [rowsOut],
    width: 220,
    create: () => ({ count: 100, offset: 0 }),
  },
  distinct: {
    kind: 'distinct',
    title: 'Eindeutig',
    group: 'Transformieren',
    description: 'Entfernt doppelte Zeilen.',
    header: 'bg-emerald-600',
    inputs: [rowsIn()],
    outputs: [rowsOut],
    width: 200,
    create: () => ({}),
  },
  compare: {
    kind: 'compare',
    title: 'Vergleich',
    group: 'Bedingungen',
    description: 'Vergleicht eine Spalte mit einem Wert oder einer anderen Spalte.',
    header: 'bg-amber-600',
    inputs: [],
    outputs: [condOut],
    width: 270,
    create: () => ({ column: '', op: '=', value: '', valueType: 'auto' }),
  },
  logic: {
    kind: 'logic',
    title: 'Logik (UND / ODER)',
    group: 'Bedingungen',
    description: 'Verbindet zwei Bedingungen.',
    header: 'bg-amber-600',
    inputs: [condIn('a', 'A'), condIn('b', 'B')],
    outputs: [condOut],
    width: 210,
    create: () => ({ op: 'AND' }),
  },
  not: {
    kind: 'not',
    title: 'Nicht',
    group: 'Bedingungen',
    description: 'Kehrt eine Bedingung um.',
    header: 'bg-amber-600',
    inputs: [condIn('a', 'Bedingung')],
    outputs: [condOut],
    width: 190,
    create: () => ({}),
  },
  result: {
    kind: 'result',
    title: 'Ergebnis',
    group: 'Ausgabe',
    description: 'Gibt die Zeilen als Tabelle aus (SELECT).',
    header: 'bg-fuchsia-600',
    inputs: [rowsIn()],
    outputs: [],
    width: 190,
    create: () => ({}),
  },
  insert: {
    kind: 'insert',
    title: 'Einfügen (INSERT)',
    group: 'Aktionen',
    description: 'Fügt eine Zeile in eine Tabelle ein.',
    header: 'bg-rose-600',
    inputs: [],
    outputs: [],
    width: 300,
    create: () => ({ database: '', table: '', values: [{ column: '', value: '', valueType: 'auto' }] }),
  },
  update: {
    kind: 'update',
    title: 'Ändern (UPDATE)',
    group: 'Aktionen',
    description: 'Setzt Werte in Zeilen, die zur Bedingung passen.',
    header: 'bg-rose-600',
    inputs: [condIn()],
    outputs: [],
    width: 300,
    create: () => ({ database: '', table: '', sets: [{ column: '', value: '', valueType: 'auto' }], all: false }),
  },
  delete: {
    kind: 'delete',
    title: 'Löschen (DELETE)',
    group: 'Aktionen',
    description: 'Löscht Zeilen, die zur Bedingung passen.',
    header: 'bg-rose-600',
    inputs: [condIn()],
    outputs: [],
    width: 260,
    create: () => ({ database: '', table: '', all: false }),
  },
};

export function pinOf(kind: NodeKind, handle: string | null | undefined, side: 'in' | 'out'): PinDef | undefined {
  const def = NODE_DEFS[kind];
  const pins = side === 'in' ? def.inputs : def.outputs;
  return pins.find((p) => p.id === (handle ?? (side === 'in' ? 'in' : 'out')));
}

export function newNode(kind: NodeKind, id: string, position: { x: number; y: number }): BpNode {
  return { id, type: kind, position, data: NODE_DEFS[kind].create() } as BpNode;
}

export const TERMINALS: ReadonlySet<NodeKind> = new Set<NodeKind>(['result', 'insert', 'update', 'delete']);
