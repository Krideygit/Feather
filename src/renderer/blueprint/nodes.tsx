import { Handle, Position, useReactFlow, type Node, type NodeProps, type NodeTypes } from '@xyflow/react';
import { Plus, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { COLUMN_LIST, useBlueprint } from './context';
import {
  NODE_DEFS,
  type Aggregate,
  type AggregateItem,
  type Assignment,
  type ColumnsData,
  type CompareData,
  type CompareOp,
  type DeleteData,
  type DistinctData,
  type FilterData,
  type GroupData,
  type InsertData,
  type JoinData,
  type JoinKind,
  type LimitData,
  type LogicData,
  type NodeKind,
  type NotData,
  type OrderData,
  type ResultData,
  type TableData,
  type UpdateData,
  type ValueType,
} from './graph';

const OPS: CompareOp[] = ['=', '<>', '<', '<=', '>', '>=', 'LIKE', 'NOT LIKE', 'IN', 'IS NULL', 'IS NOT NULL'];
const AGGREGATES: Aggregate[] = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
const VALUE_TYPES: { id: ValueType; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Zahl' },
  { id: 'column', label: 'Spalte' },
  { id: 'null', label: 'NULL' },
];

function useUpdate(id: string): (patch: Record<string, unknown>) => void {
  const { updateNodeData } = useReactFlow();
  return (patch) => updateNodeData(id, patch);
}

function PinRow({ kind, index }: { kind: NodeKind; index: number }) {
  const def = NODE_DEFS[kind];
  const input = def.inputs[index];
  const output = def.outputs[index];
  return (
    <div className="relative flex items-center justify-between h-7 px-3 text-xs text-neutral-300">
      <span>
        {input && (
          <>
            <Handle type="target" position={Position.Left} id={input.id} className={`pin pin-${input.type}`} />
            {input.label}
          </>
        )}
      </span>
      <span>
        {output && (
          <>
            {output.label}
            <Handle type="source" position={Position.Right} id={output.id} className={`pin pin-${output.type}`} />
          </>
        )}
      </span>
    </div>
  );
}

function Frame({ id, kind, selected, children }: { id: string; kind: NodeKind; selected?: boolean; children?: ReactNode }) {
  const def = NODE_DEFS[kind];
  const problem = useBlueprint().problems[id];
  const rows = Math.max(def.inputs.length, def.outputs.length);
  const border = problem ? 'border-red-500/70' : selected ? 'border-primary' : 'border-neutral-700';
  return (
    <div style={{ width: def.width }} className={`rounded-xl border bg-neutral-900/95 shadow-xl ${border}`}>
      <div className={`${def.header} rounded-t-[11px] px-3 h-8 flex items-center text-[13px] font-semibold text-white`}>{def.title}</div>
      {rows > 0 && (
        <div className="py-1">
          {Array.from({ length: rows }, (_, i) => (
            <PinRow key={i} kind={kind} index={i} />
          ))}
        </div>
      )}
      {children && <div className="px-3 pb-3 pt-1 space-y-2">{children}</div>}
      {problem && <p className="px-3 pb-2 text-[11px] leading-4 text-red-300">{problem}</p>}
    </div>
  );
}

function ColumnInput({ value, onChange, placeholder = 'tabelle.spalte' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="bp-field nodrag" list={COLUMN_LIST} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />;
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select className="bp-field nodrag" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

function ValueEditor({ item, onChange }: { item: { value: string; valueType: ValueType }; onChange: (patch: { value?: string; valueType?: ValueType }) => void }) {
  return (
    <div className="flex gap-1.5">
      <div className="w-[76px] shrink-0">
        <Select value={item.valueType} options={VALUE_TYPES} onChange={(valueType) => onChange({ valueType })} />
      </div>
      {item.valueType === 'null' ? (
        <div className="bp-field flex items-center text-neutral-500">NULL</div>
      ) : item.valueType === 'column' ? (
        <ColumnInput value={item.value} onChange={(value) => onChange({ value })} />
      ) : (
        <input className="bp-field nodrag" value={item.value} placeholder="Wert" spellCheck={false} onChange={(e) => onChange({ value: e.target.value })} />
      )}
    </div>
  );
}

function TableTarget({ database, table, onChange }: { database: string; table: string; onChange: (patch: { database?: string; table?: string }) => void }) {
  const { databases, schema, loadSchema } = useBlueprint();
  useEffect(() => {
    if (database) void loadSchema(database);
  }, [database, loadSchema]);
  const tables = schema[database] ?? [];
  const choices = databases.includes(database) || !database ? databases : [database, ...databases];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <select className="bp-field nodrag" value={database} onChange={(e) => onChange({ database: e.target.value, table: '' })}>
        <option value="">Datenbank …</option>
        {choices.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select className="bp-field nodrag" value={table} disabled={!database} onChange={(e) => onChange({ table: e.target.value })}>
        <option value="">Tabelle …</option>
        {table && !tables.some((t) => t.name === table) && <option value={table}>{table}</option>}
        {tables.map((t) => (
          <option key={t.name} value={t.name}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

function ChipList({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = (): void => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-md bg-neutral-800 pl-2 pr-1 h-6 text-[11px] text-neutral-200">
              {v}
              <button className="nodrag text-neutral-500 hover:text-neutral-100" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`${v} entfernen`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="bp-field nodrag"
        list={COLUMN_LIST}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        onBlur={add}
      />
    </div>
  );
}

function AssignmentList({ items, onChange, label }: { items: Assignment[]; onChange: (items: Assignment[]) => void; label: string }) {
  const patch = (i: number, p: Partial<Assignment>): void => onChange(items.map((it, k) => (k === i ? { ...it, ...p } : it)));
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      {items.map((item, i) => (
        <div key={i} className="space-y-1.5 rounded-lg bg-neutral-950/40 p-1.5">
          <div className="flex gap-1.5">
            <input className="bp-field nodrag" value={item.column} placeholder="Spalte" spellCheck={false} onChange={(e) => patch(i, { column: e.target.value })} />
            <button className="nodrag btn btn-ghost btn-icon btn-sm size-7! shrink-0" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Zeile entfernen">
              <X className="size-3.5" />
            </button>
          </div>
          <ValueEditor item={item} onChange={(p) => patch(i, p)} />
        </div>
      ))}
      <button className="nodrag btn btn-ghost btn-sm w-full" onClick={() => onChange([...items, { column: '', value: '', valueType: 'auto' }])}>
        <Plus className="size-3.5" />
        Spalte hinzufügen
      </button>
    </div>
  );
}

function AllRows({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="nodrag flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer">
      <input type="checkbox" className="size-3.5 accent-sky-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Alle Zeilen (ohne Bedingung)
    </label>
  );
}

function TableNode({ id, data, selected }: NodeProps<Node<TableData, 'table'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="table" selected={selected}>
      <TableTarget database={data.database} table={data.table} onChange={update} />
      <input className="bp-field nodrag" value={data.alias} placeholder="Alias (optional)" spellCheck={false} onChange={(e) => update({ alias: e.target.value })} />
    </Frame>
  );
}

function JoinNode({ id, data, selected }: NodeProps<Node<JoinData, 'join'>>) {
  const update = useUpdate(id);
  const kinds: { id: JoinKind; label: string }[] = [
    { id: 'INNER', label: 'INNER JOIN' },
    { id: 'LEFT', label: 'LEFT JOIN' },
    { id: 'RIGHT', label: 'RIGHT JOIN' },
  ];
  return (
    <Frame id={id} kind="join" selected={selected}>
      <Select value={data.kind} options={kinds} onChange={(kind) => update({ kind })} />
      <ColumnInput value={data.left} placeholder="Spalte links" onChange={(left) => update({ left })} />
      <ColumnInput value={data.right} placeholder="Spalte rechts" onChange={(right) => update({ right })} />
    </Frame>
  );
}

function ColumnsNode({ id, data, selected }: NodeProps<Node<ColumnsData, 'columns'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="columns" selected={selected}>
      <ChipList values={data.columns} placeholder="Spalte hinzufügen (Enter)" onChange={(columns) => update({ columns })} />
      {data.columns.length === 0 && <p className="text-[11px] text-neutral-500">Ohne Auswahl bleiben alle Spalten.</p>}
    </Frame>
  );
}

function FilterNode({ id, selected }: NodeProps<Node<FilterData, 'filter'>>) {
  return <Frame id={id} kind="filter" selected={selected} />;
}

function CompareNode({ id, data, selected }: NodeProps<Node<CompareData, 'compare'>>) {
  const update = useUpdate(id);
  const unary = data.op === 'IS NULL' || data.op === 'IS NOT NULL';
  const forcedText = data.op === 'LIKE' || data.op === 'NOT LIKE';
  return (
    <Frame id={id} kind="compare" selected={selected}>
      <ColumnInput value={data.column} onChange={(column) => update({ column })} />
      <Select value={data.op} options={OPS.map((op) => ({ id: op, label: op }))} onChange={(op) => update({ op })} />
      {!unary &&
        (data.op === 'IN' || forcedText ? (
          <input className="bp-field nodrag" value={data.value} placeholder={data.op === 'IN' ? 'Werte, mit Komma getrennt' : 'z. B. Ber%'} spellCheck={false} onChange={(e) => update({ value: e.target.value })} />
        ) : (
          <ValueEditor item={data} onChange={update} />
        ))}
    </Frame>
  );
}

function LogicNode({ id, data, selected }: NodeProps<Node<LogicData, 'logic'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="logic" selected={selected}>
      <Select
        value={data.op}
        options={[
          { id: 'AND', label: 'UND (AND)' },
          { id: 'OR', label: 'ODER (OR)' },
        ]}
        onChange={(op) => update({ op })}
      />
    </Frame>
  );
}

function NotNode({ id, selected }: NodeProps<Node<NotData, 'not'>>) {
  return <Frame id={id} kind="not" selected={selected} />;
}

function GroupNode({ id, data, selected }: NodeProps<Node<GroupData, 'aggregate'>>) {
  const update = useUpdate(id);
  const setAggregate = (i: number, p: Partial<AggregateItem>): void => update({ aggregates: data.aggregates.map((a, k) => (k === i ? { ...a, ...p } : a)) });
  return (
    <Frame id={id} kind="aggregate" selected={selected}>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">Gruppieren nach</p>
      <ChipList values={data.by} placeholder="Spalte hinzufügen (Enter)" onChange={(by) => update({ by })} />
      <p className="text-[11px] uppercase tracking-wide text-neutral-500 pt-1">Aggregate</p>
      {data.aggregates.map((a, i) => (
        <div key={i} className="space-y-1.5 rounded-lg bg-neutral-950/40 p-1.5">
          <div className="flex gap-1.5">
            <div className="w-[84px] shrink-0">
              <Select value={a.fn} options={AGGREGATES.map((fn) => ({ id: fn, label: fn }))} onChange={(fn) => setAggregate(i, { fn })} />
            </div>
            <ColumnInput value={a.column} placeholder={a.fn === 'COUNT' ? '* (alle)' : 'Spalte'} onChange={(column) => setAggregate(i, { column })} />
            <button className="nodrag btn btn-ghost btn-icon btn-sm size-7! shrink-0" onClick={() => update({ aggregates: data.aggregates.filter((_, k) => k !== i) })} aria-label="Aggregat entfernen">
              <X className="size-3.5" />
            </button>
          </div>
          <input className="bp-field nodrag" value={a.alias} placeholder="Name der Ergebnisspalte" spellCheck={false} onChange={(e) => setAggregate(i, { alias: e.target.value })} />
        </div>
      ))}
      <button className="nodrag btn btn-ghost btn-sm w-full" onClick={() => update({ aggregates: [...data.aggregates, { fn: 'COUNT', column: '', alias: '' }] })}>
        <Plus className="size-3.5" />
        Aggregat hinzufügen
      </button>
    </Frame>
  );
}

function OrderNode({ id, data, selected }: NodeProps<Node<OrderData, 'order'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="order" selected={selected}>
      <ColumnInput value={data.column} onChange={(column) => update({ column })} />
      <Select
        value={data.dir}
        options={[
          { id: 'ASC', label: 'Aufsteigend (ASC)' },
          { id: 'DESC', label: 'Absteigend (DESC)' },
        ]}
        onChange={(dir) => update({ dir })}
      />
    </Frame>
  );
}

function LimitNode({ id, data, selected }: NodeProps<Node<LimitData, 'limit'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="limit" selected={selected}>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[11px] text-neutral-500">
          Anzahl
          <input className="bp-field nodrag mt-0.5" type="number" min={0} value={data.count} onChange={(e) => update({ count: Number(e.target.value) })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          Überspringen
          <input className="bp-field nodrag mt-0.5" type="number" min={0} value={data.offset} onChange={(e) => update({ offset: Number(e.target.value) })} />
        </label>
      </div>
    </Frame>
  );
}

function DistinctNode({ id, selected }: NodeProps<Node<DistinctData, 'distinct'>>) {
  return <Frame id={id} kind="distinct" selected={selected} />;
}

function ResultNode({ id, selected }: NodeProps<Node<ResultData, 'result'>>) {
  return <Frame id={id} kind="result" selected={selected} />;
}

function InsertNode({ id, data, selected }: NodeProps<Node<InsertData, 'insert'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="insert" selected={selected}>
      <TableTarget database={data.database} table={data.table} onChange={update} />
      <AssignmentList label="Werte" items={data.values} onChange={(values) => update({ values })} />
    </Frame>
  );
}

function UpdateNode({ id, data, selected }: NodeProps<Node<UpdateData, 'update'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="update" selected={selected}>
      <TableTarget database={data.database} table={data.table} onChange={update} />
      <AssignmentList label="Setze" items={data.sets} onChange={(sets) => update({ sets })} />
      <AllRows checked={data.all} onChange={(all) => update({ all })} />
    </Frame>
  );
}

function DeleteNode({ id, data, selected }: NodeProps<Node<DeleteData, 'delete'>>) {
  const update = useUpdate(id);
  return (
    <Frame id={id} kind="delete" selected={selected}>
      <TableTarget database={data.database} table={data.table} onChange={update} />
      <AllRows checked={data.all} onChange={(all) => update({ all })} />
    </Frame>
  );
}

export const nodeTypes: NodeTypes = {
  table: TableNode,
  join: JoinNode,
  columns: ColumnsNode,
  filter: FilterNode,
  compare: CompareNode,
  logic: LogicNode,
  not: NotNode,
  aggregate: GroupNode,
  order: OrderNode,
  limit: LimitNode,
  distinct: DistinctNode,
  result: ResultNode,
  insert: InsertNode,
  update: UpdateNode,
  delete: DeleteNode,
};
