import type { Edge } from '@xyflow/react';
import { TERMINALS, type Assignment, type BpNode, type ValueType } from './graph';

export interface Statement {
  nodeId: string;
  kind: 'select' | 'insert' | 'update' | 'delete';
  sql: string;
}

export interface Problem {
  nodeId: string | null;
  message: string;
}

export interface CompileResult {
  statements: Statement[];
  problems: Problem[];
}

export const lit = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '')}'`;
export const ident = (value: string): string => `\`${value.replace(/`/g, '``')}\``;

const NUMBER = /^-?\d+(\.\d+)?$/;
const UNARY = new Set(['IS NULL', 'IS NOT NULL']);

function colRef(ref: string, qualified: boolean): string {
  const dot = ref.indexOf('.');
  if (dot < 0) return ident(ref);
  const table = ref.slice(0, dot);
  const column = ref.slice(dot + 1);
  return qualified ? `${ident(table)}.${ident(column)}` : ident(column);
}

interface Query {
  from: string;
  select: string[] | null;
  where: string[];
  groupBy: string[];
  orderBy: string[];
  limit: number | null;
  offset: number;
  distinct: boolean;
  derived: boolean;
}

const baseQuery = (from: string): Query => ({ from, select: null, where: [], groupBy: [], orderBy: [], limit: null, offset: 0, distinct: false, derived: false });

const isPlain = (q: Query): boolean => q.select === null && q.where.length === 0 && q.groupBy.length === 0 && q.orderBy.length === 0 && q.limit === null && !q.distinct;

function render(q: Query): string {
  let sql = `SELECT ${q.distinct ? 'DISTINCT ' : ''}${q.select ? q.select.join(', ') : '*'} FROM ${q.from}`;
  if (q.where.length) sql += ` WHERE ${q.where.map((w) => `(${w})`).join(' AND ')}`;
  if (q.groupBy.length) sql += ` GROUP BY ${q.groupBy.join(', ')}`;
  if (q.orderBy.length) sql += ` ORDER BY ${q.orderBy.join(', ')}`;
  if (q.limit !== null) sql += ` LIMIT ${q.limit}${q.offset ? ` OFFSET ${q.offset}` : ''}`;
  else if (q.offset) sql += ` LIMIT 18446744073709551615 OFFSET ${q.offset}`;
  return sql;
}

class Compiler {
  readonly problems: Problem[] = [];
  private aliases = 0;
  private readonly byId = new Map<string, BpNode>();

  constructor(
    nodes: BpNode[],
    private readonly edges: Edge[],
  ) {
    for (const n of nodes) this.byId.set(n.id, n);
  }

  problem(nodeId: string | null, message: string): void {
    this.problems.push({ nodeId, message });
  }

  private source(nodeId: string, handle: string): string | undefined {
    return this.edges.find((e) => e.target === nodeId && (e.targetHandle ?? 'in') === handle)?.source;
  }

  private derive(q: Query): Query {
    const alias = `t${++this.aliases}`;
    return { ...baseQuery(`(${render(q)}) AS ${ident(alias)}`), derived: true };
  }

  private asSource(q: Query): string {
    return isPlain(q) ? q.from : this.derive(q).from;
  }

  private input(node: BpNode, handle: string, trail: Set<string>): Query | null {
    const from = this.source(node.id, handle);
    if (!from) {
      this.problem(node.id, 'Es ist keine Zeilenquelle verbunden.');
      return null;
    }
    return this.rows(from, trail);
  }

  rows(id: string, trail: Set<string>): Query | null {
    const node = this.byId.get(id);
    if (!node) return null;
    if (trail.has(id)) {
      this.problem(id, 'Der Graph enthält einen Kreis.');
      return null;
    }
    const next = new Set(trail).add(id);

    switch (node.type) {
      case 'table': {
        const { database, table, alias } = node.data;
        if (!database || !table) {
          this.problem(id, 'Wähle Datenbank und Tabelle.');
          return null;
        }
        return baseQuery(`${ident(database)}.${ident(table)}${alias ? ` AS ${ident(alias)}` : ''}`);
      }
      case 'join': {
        const left = this.input(node, 'left', next);
        const right = this.input(node, 'right', next);
        if (!left || !right) return null;
        const { kind, left: lc, right: rc } = node.data;
        if (!lc || !rc) {
          this.problem(id, 'Wähle auf beiden Seiten eine Spalte für die Verknüpfung.');
          return null;
        }
        return baseQuery(`${this.asSource(left)} ${kind} JOIN ${this.asSource(right)} ON ${colRef(lc, true)} = ${colRef(rc, true)}`);
      }
      case 'filter': {
        let q = this.input(node, 'in', next);
        if (!q) return null;
        const condId = this.source(id, 'cond');
        if (!condId) {
          this.problem(id, 'Verbinde eine Bedingung.');
          return q;
        }
        if (q.groupBy.length || q.limit !== null) q = this.derive(q);
        const cond = this.cond(condId, next, !q.derived);
        if (cond) q.where.push(cond);
        return q;
      }
      case 'columns': {
        let q = this.input(node, 'in', next);
        if (!q) return null;
        if (!node.data.columns.length) return q;
        if (q.select !== null || q.groupBy.length) q = this.derive(q);
        q.select = node.data.columns.map((c) => colRef(c, !q.derived));
        return q;
      }
      case 'aggregate': {
        let q = this.input(node, 'in', next);
        if (!q) return null;
        const { by, aggregates } = node.data;
        if (!by.length && !aggregates.length) {
          this.problem(id, 'Wähle Gruppenspalten oder Aggregate.');
          return q;
        }
        if (q.groupBy.length || q.limit !== null || q.select !== null) q = this.derive(q);
        const qualified = !q.derived;
        const select = by.map((c) => colRef(c, qualified));
        for (const a of aggregates) {
          if (a.fn !== 'COUNT' && !a.column) {
            this.problem(id, `${a.fn} braucht eine Spalte.`);
            continue;
          }
          const target = a.column ? colRef(a.column, qualified) : '*';
          const alias = a.alias.trim() || `${a.fn.toLowerCase()}_${(a.column || 'alle').replace(/\W+/g, '_')}`;
          select.push(`${a.fn}(${target}) AS ${ident(alias)}`);
        }
        q.groupBy = by.map((c) => colRef(c, qualified));
        q.select = select;
        return q;
      }
      case 'order': {
        let q = this.input(node, 'in', next);
        if (!q) return null;
        if (!node.data.column) {
          this.problem(id, 'Wähle eine Spalte zum Sortieren.');
          return q;
        }
        if (q.limit !== null) q = this.derive(q);
        q.orderBy.push(`${colRef(node.data.column, !q.derived)} ${node.data.dir}`);
        return q;
      }
      case 'limit': {
        let q = this.input(node, 'in', next);
        if (!q) return null;
        if (q.limit !== null) q = this.derive(q);
        const count = Math.floor(Number(node.data.count));
        if (!Number.isFinite(count) || count < 0) {
          this.problem(id, 'Das Limit muss eine Zahl ab 0 sein.');
          return q;
        }
        q.limit = count;
        q.offset = Math.max(0, Math.floor(Number(node.data.offset) || 0));
        return q;
      }
      case 'distinct': {
        const q = this.input(node, 'in', next);
        if (q) q.distinct = true;
        return q;
      }
      default:
        this.problem(id, 'Dieser Knoten liefert keine Zeilen.');
        return null;
    }
  }

  value(nodeId: string, raw: string, type: ValueType, qualified: boolean): string | null {
    switch (type) {
      case 'null':
        return 'NULL';
      case 'column':
        if (!raw) break;
        return colRef(raw, qualified);
      case 'number':
        if (!NUMBER.test(raw.trim())) {
          this.problem(nodeId, `„${raw}“ ist keine Zahl.`);
          return null;
        }
        return raw.trim();
      case 'text':
        return lit(raw);
      default:
        return NUMBER.test(raw.trim()) ? raw.trim() : lit(raw);
    }
    this.problem(nodeId, 'Wähle eine Spalte als Wert.');
    return null;
  }

  cond(id: string, trail: Set<string>, qualified: boolean): string | null {
    const node = this.byId.get(id);
    if (!node) return null;
    if (trail.has(id)) {
      this.problem(id, 'Der Graph enthält einen Kreis.');
      return null;
    }
    const next = new Set(trail).add(id);

    switch (node.type) {
      case 'compare': {
        const { column, op, value, valueType } = node.data;
        if (!column) {
          this.problem(id, 'Wähle eine Spalte.');
          return null;
        }
        const left = colRef(column, qualified);
        if (UNARY.has(op)) return `${left} ${op}`;
        if (op === 'IN') {
          const items = value.split(',').map((v) => v.trim()).filter(Boolean);
          if (!items.length) {
            this.problem(id, 'IN braucht mindestens einen Wert.');
            return null;
          }
          return `${left} IN (${items.map((v) => (NUMBER.test(v) ? v : lit(v))).join(', ')})`;
        }
        const right = this.value(id, value, op === 'LIKE' || op === 'NOT LIKE' ? 'text' : valueType, qualified);
        return right === null ? null : `${left} ${op} ${right}`;
      }
      case 'logic': {
        const a = this.condInput(node.id, 'a', next, qualified);
        const b = this.condInput(node.id, 'b', next, qualified);
        return a && b ? `${a} ${node.data.op} ${b}` : null;
      }
      case 'not': {
        const a = this.condInput(node.id, 'a', next, qualified);
        return a ? `NOT ${a}` : null;
      }
      default:
        this.problem(id, 'Dieser Knoten liefert keine Bedingung.');
        return null;
    }
  }

  private condInput(nodeId: string, handle: string, trail: Set<string>, qualified: boolean): string | null {
    const from = this.source(nodeId, handle);
    if (!from) {
      this.problem(nodeId, 'Es ist keine Bedingung verbunden.');
      return null;
    }
    const inner = this.cond(from, trail, qualified);
    return inner === null ? null : `(${inner})`;
  }

  assignments(nodeId: string, items: Assignment[]): { columns: string[]; values: string[] } | null {
    const columns: string[] = [];
    const values: string[] = [];
    for (const item of items) {
      if (!item.column.trim()) continue;
      const v = this.value(nodeId, item.value, item.valueType, false);
      if (v === null) return null;
      columns.push(ident(item.column.trim()));
      values.push(v);
    }
    if (!columns.length) {
      this.problem(nodeId, 'Trage mindestens eine Spalte mit Wert ein.');
      return null;
    }
    return { columns, values };
  }

  target(node: BpNode, database: string, table: string): string | null {
    if (!database || !table) {
      this.problem(node.id, 'Wähle Datenbank und Tabelle.');
      return null;
    }
    return `${ident(database)}.${ident(table)}`;
  }

  terminal(node: BpNode): Statement | null {
    switch (node.type) {
      case 'result': {
        const q = this.input(node, 'in', new Set([node.id]));
        return q ? { nodeId: node.id, kind: 'select', sql: render(q) } : null;
      }
      case 'insert': {
        const table = this.target(node, node.data.database, node.data.table);
        const set = this.assignments(node.id, node.data.values);
        if (!table || !set) return null;
        return { nodeId: node.id, kind: 'insert', sql: `INSERT INTO ${table} (${set.columns.join(', ')}) VALUES (${set.values.join(', ')})` };
      }
      case 'update': {
        const table = this.target(node, node.data.database, node.data.table);
        const set = this.assignments(node.id, node.data.sets);
        const where = this.where(node, node.data.all);
        if (!table || !set || where === null) return null;
        const assignments = set.columns.map((c, i) => `${c} = ${set.values[i]}`).join(', ');
        return { nodeId: node.id, kind: 'update', sql: `UPDATE ${table} SET ${assignments}${where}` };
      }
      case 'delete': {
        const table = this.target(node, node.data.database, node.data.table);
        const where = this.where(node, node.data.all);
        if (!table || where === null) return null;
        return { nodeId: node.id, kind: 'delete', sql: `DELETE FROM ${table}${where}` };
      }
      default:
        return null;
    }
  }

  private where(node: BpNode, all: boolean): string | null {
    const condId = this.source(node.id, 'cond');
    if (condId) {
      const cond = this.cond(condId, new Set([node.id]), false);
      return cond === null ? null : ` WHERE ${cond}`;
    }
    if (all) return '';
    this.problem(node.id, 'Verbinde eine Bedingung oder aktiviere „Alle Zeilen“.');
    return null;
  }
}

export function compile(nodes: BpNode[], edges: Edge[]): CompileResult {
  const compiler = new Compiler(nodes, edges);
  const terminals = nodes
    .filter((n) => n.type && TERMINALS.has(n.type))
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

  if (!terminals.length) {
    compiler.problem(null, 'Füge einen Ergebnis-Knoten (oder eine Aktion) hinzu.');
  }
  const statements: Statement[] = [];
  for (const t of terminals) {
    const st = compiler.terminal(t);
    if (st) statements.push(st);
  }
  return { statements, problems: compiler.problems };
}
