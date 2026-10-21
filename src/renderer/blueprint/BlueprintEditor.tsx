import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type IsValidConnection,
} from '@xyflow/react';
import { Check, ClipboardCopy, FileCode2, Play, Trash2, Wand2, Workflow, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Service, SqlOutput, TableInfo } from '../../shared/types';
import { Notice } from '../components/Bits';
import { confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { Results } from '../drawer/Sql';
import { useDatabases } from '../drawer/useDatabases';
import { attempt, call } from '../lib/api';
import { useService } from '../lib/store';
import { compile } from './compile';
import { BlueprintContext, COLUMN_LIST } from './context';
import { GROUP_ORDER, NODE_DEFS, PIN_COLORS, newNode, pinOf, type BpEdge, type BpNode, type NodeKind } from './graph';
import { nodeTypes } from './nodes';

const SYSTEM = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
const storageKey = (id: string): string => `feather.blueprint.${id}`;

interface Saved {
  nodes: BpNode[];
  edges: BpEdge[];
}

function loadSaved(id: string): Saved {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(id)) ?? 'null') as Saved | null;
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      const nodes = parsed.nodes
        .filter((n) => n && typeof n.id === 'string' && typeof n.type === 'string' && n.type in NODE_DEFS && typeof n.position?.x === 'number')
        .map((n) => ({ id: n.id, type: n.type, position: n.position, data: { ...NODE_DEFS[n.type as NodeKind].create(), ...n.data } }) as BpNode);
      const ids = new Set(nodes.map((n) => n.id));
      return { nodes, edges: parsed.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
    }
  } catch {
    return { nodes: [], edges: [] };
  }
  return { nodes: [], edges: [] };
}

export function openBlueprint(service: Service, onUseSql: (sql: string) => void): void {
  openLayer(
    (close) => (
      <BlueprintDialog
        service={service}
        onClose={close}
        onUseSql={(sql) => {
          onUseSql(sql);
          close();
        }}
      />
    ),
    { persistent: true },
  );
}

function BlueprintDialog(props: { service: Service; onClose: () => void; onUseSql: (sql: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-3 flex">
      <div className="flex-1 min-w-0 flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden shadow-2xl animate-pop">
        <ReactFlowProvider>
          <Editor {...props} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

const KEYWORDS =
  'SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|IS|NULL|JOIN|INNER|LEFT|RIGHT|ON|GROUP|BY|ORDER|LIMIT|OFFSET|AS|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|COUNT|SUM|AVG|MIN|MAX|ASC|DESC';
const TOKENS = new RegExp(`(\`[^\`]*\`|'(?:[^'\\\\]|\\\\.)*'|\\b(?:${KEYWORDS})\\b)`, 'g');

function Highlighted({ sql }: { sql: string }) {
  const parts = sql.split(TOKENS);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith('`')) return <span key={i} className="text-neutral-100">{part}</span>;
        if (part.startsWith("'")) return <span key={i} className="text-emerald-300">{part}</span>;
        return <span key={i} className="text-sky-400 font-semibold">{part}</span>;
      })}
    </>
  );
}

function Editor({ service, onClose, onUseSql }: { service: Service; onClose: () => void; onUseSql: (sql: string) => void }) {
  const live = useService(service.id) ?? service;
  const running = live.status === 'running';
  const { dbs } = useDatabases(service.id, running);
  const saved = useMemo(() => loadSaved(service.id), [service.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BpNode>(saved.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<BpEdge>(saved.edges);
  const [schema, setSchema] = useState<Record<string, TableInfo[] | undefined>>({});
  const [tab, setTab] = useState<'sql' | 'result'>('sql');
  const [output, setOutput] = useState<SqlOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const flow = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);
  const pending = useRef(new Map<string, Promise<TableInfo[]>>());
  const counter = useRef(0);

  const databases = useMemo(() => {
    const names = (dbs ?? []).map((d) => d.name);
    return [...names.filter((n) => !SYSTEM.has(n)), ...names.filter((n) => SYSTEM.has(n))];
  }, [dbs]);

  const loadSchema = useCallback(
    (database: string): Promise<TableInfo[]> => {
      const known = pending.current.get(database);
      if (known) return known;
      const request = call<TableInfo[]>('db.schema', { id: service.id, database }).then((tables) => {
        setSchema((s) => ({ ...s, [database]: tables }));
        return tables;
      });
      request.catch(() => pending.current.delete(database));
      pending.current.set(database, request);
      return request;
    },
    [service.id],
  );

  const result = useMemo(() => compile(nodes, edges), [nodes, edges]);
  const problemByNode = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of result.problems) if (p.nodeId && !map[p.nodeId]) map[p.nodeId] = p.message;
    return map;
  }, [result.problems]);

  const env = useMemo(() => ({ databases, schema, loadSchema, problems: problemByNode }), [databases, schema, loadSchema, problemByNode]);

  const columns = useMemo(() => {
    const list = new Set<string>();
    for (const n of nodes) {
      if (n.type === 'table') {
        const tables = schema[n.data.database] ?? [];
        const info = tables.find((t) => t.name === n.data.table);
        for (const c of info?.columns ?? []) list.add(`${n.data.alias || n.data.table}.${c.name}`);
      } else if (n.type === 'aggregate') {
        for (const a of n.data.aggregates) if (a.alias) list.add(a.alias);
      }
    }
    return [...list];
  }, [nodes, schema]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const slim = nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data }));
        localStorage.setItem(storageKey(service.id), JSON.stringify({ nodes: slim, edges }));
      } catch {
        return;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [nodes, edges, service.id]);

  const addNode = useCallback(
    (kind: NodeKind, at?: { x: number; y: number }): BpNode => {
      counter.current += 1;
      const rect = canvas.current?.getBoundingClientRect();
      const center = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
      const jitter = (counter.current % 5) * 24;
      const node = newNode(kind, `n${Date.now().toString(36)}${counter.current}`, at ?? { x: center.x - 110 + jitter, y: center.y - 60 + jitter });
      setNodes((current) => [...current, node]);
      return node;
    },
    [flow, setNodes],
  );

  const isValidConnection: IsValidConnection<BpEdge> = useCallback(
    (c) => {
      if (c.source === c.target) return false;
      const from = nodes.find((n) => n.id === c.source);
      const to = nodes.find((n) => n.id === c.target);
      if (!from?.type || !to?.type) return false;
      const out = pinOf(from.type, c.sourceHandle, 'out');
      const into = pinOf(to.type, c.targetHandle, 'in');
      return Boolean(out && into && out.type === into.type);
    },
    [nodes],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const from = nodes.find((n) => n.id === c.source);
      const pin = from?.type ? pinOf(from.type, c.sourceHandle, 'out') : undefined;
      const stroke = PIN_COLORS[pin?.type ?? 'rows'];
      setEdges((current) =>
        addEdge({ ...c, style: { stroke, strokeWidth: 2 } }, current.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle))),
      );
    },
    [nodes, setEdges],
  );

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/feather-node') as NodeKind;
    if (kind in NODE_DEFS) addNode(kind, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  async function example(): Promise<void> {
    const database = databases[0];
    if (!database) return void toast('Es gibt noch keine Datenbank. Lege zuerst eine an.', 'error');
    const tables = await attempt(loadSchema(database));
    const table = tables?.find((t) => !t.view) ?? tables?.[0];
    if (!table) return void toast(`In „${database}“ gibt es noch keine Tabelle. Lege sie im SQL-Tab an.`, 'error');
    const stamp = Date.now().toString(36);
    const chain: BpNode[] = [
      newNode('table', `${stamp}a`, { x: 40, y: 80 }),
      newNode('limit', `${stamp}b`, { x: 380, y: 80 }),
      newNode('result', `${stamp}c`, { x: 660, y: 80 }),
    ];
    if (chain[0]?.type === 'table') chain[0].data = { database, table: table.name, alias: '' };
    setNodes(chain);
    setEdges([
      { id: `${stamp}e1`, source: `${stamp}a`, sourceHandle: 'out', target: `${stamp}b`, targetHandle: 'in', style: { stroke: PIN_COLORS.rows, strokeWidth: 2 } },
      { id: `${stamp}e2`, source: `${stamp}b`, sourceHandle: 'out', target: `${stamp}c`, targetHandle: 'in', style: { stroke: PIN_COLORS.rows, strokeWidth: 2 } },
    ]);
    setTimeout(() => void flow.fitView({ padding: 0.3, maxZoom: 1 }), 50);
  }

  async function clear(): Promise<void> {
    if (!nodes.length) return;
    const ok = await confirmDialog({ title: 'Blueprint leeren?', message: 'Alle Knoten und Verbindungen werden entfernt.', confirmLabel: 'Leeren', danger: true });
    if (ok) {
      setNodes([]);
      setEdges([]);
    }
  }

  const script = result.statements.map((s) => `${s.sql};`).join('\n');
  const blocked = result.problems.length > 0 || result.statements.length === 0;

  const run = useCallback(async (): Promise<void> => {
    if (busy || blocked) return;
    if (!running) return void toast('Starte die Datenbank, um den Blueprint auszuführen.', 'error');
    const writes = result.statements.filter((s) => s.kind !== 'select').length;
    if (writes) {
      const ok = await confirmDialog({
        title: 'Änderungen ausführen?',
        message: `Der Blueprint enthält ${writes} ${writes === 1 ? 'Änderung' : 'Änderungen'} an deinen Daten (INSERT, UPDATE oder DELETE).`,
        confirmLabel: 'Ausführen',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      setOutput(await call<SqlOutput>('db.query', { id: service.id, sql: script }));
    } catch (err) {
      setOutput({ results: [], error: { message: err instanceof Error ? err.message : String(err) } });
    }
    setBusy(false);
    setTab('result');
  }, [busy, blocked, running, result.statements, script, service.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void run();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [run]);

  return (
    <BlueprintContext.Provider value={env}>
      <header className="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-neutral-800">
        <Workflow className="size-[18px] text-primary" />
        <h2 className="text-sm font-semibold text-neutral-100">Blueprint</h2>
        <span className="text-xs text-neutral-500 truncate">{service.name}</span>
        <span className="flex-1" />
        <button className="btn btn-ghost btn-sm" onClick={() => void example()} disabled={!running} data-action="bp-example">
          <Wand2 className="size-3.5" />
          Beispiel
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void clear()} disabled={!nodes.length}>
          <Trash2 className="size-3.5" />
          Leeren
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => onUseSql(script)} disabled={!script}>
          <FileCode2 className="size-3.5" />
          Im SQL-Editor öffnen
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => void run()} disabled={busy || blocked || !running} data-action="bp-run">
          <Play className="size-3.5" />
          {busy ? 'Läuft …' : 'Ausführen'}
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Blueprint schließen" data-action="bp-close">
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <Palette onAdd={(kind) => addNode(kind)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={canvas} className="flex-1 min-h-0 relative" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <datalist id={COLUMN_LIST}>
              {columns.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <ReactFlow<BpNode, BpEdge>
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              colorMode="dark"
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
              fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
              minZoom={0.2}
              maxZoom={1.6}
              defaultEdgeOptions={{ style: { strokeWidth: 2 } }}
            >
              <Background gap={22} color="#2a2a2a" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable maskColor="rgb(0 0 0 / 0.55)" nodeColor="#404040" />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="pointer-events-auto text-center max-w-sm rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/80 px-6 py-8">
                  <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto">
                    <Workflow className="size-6" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-neutral-100">Baue deine Abfrage aus Knoten</p>
                  <p className="mt-1 text-sm text-neutral-500">Klicke links auf einen Knoten oder ziehe ihn auf die Fläche. Verbinde die Pins miteinander und führe den Graphen aus.</p>
                  <button className="btn btn-primary btn-sm mt-4" onClick={() => void example()} disabled={!running}>
                    <Wand2 className="size-3.5" />
                    Mit Beispiel starten
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-[34%] min-h-[170px] shrink-0 border-t border-neutral-800 flex flex-col">
            <div className="flex items-center gap-1 px-3 border-b border-neutral-800 shrink-0">
              <button className={`tab ${tab === 'sql' ? 'tab-active' : ''}`} onClick={() => setTab('sql')}>Generiertes SQL</button>
              <button className={`tab ${tab === 'result' ? 'tab-active' : ''}`} onClick={() => setTab('result')}>Ergebnis</button>
              <span className="flex-1" />
              {result.problems.length > 0 ? (
                <span className="text-xs text-amber-300">{result.problems.length} {result.problems.length === 1 ? 'Hinweis' : 'Hinweise'}</span>
              ) : (
                result.statements.length > 0 && (
                  <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                    <Check className="size-3.5" />
                    Bereit
                  </span>
                )
              )}
              <button className="btn btn-ghost btn-sm" disabled={!script} onClick={() => void window.feather.copy(script).then(() => toast('SQL kopiert.', 'success'))}>
                <ClipboardCopy className="size-3.5" />
                Kopieren
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {tab === 'sql' ? (
                <SqlView script={script} problems={result.problems.map((p) => p.message)} />
              ) : output ? (
                <Results output={output} />
              ) : (
                <p className="text-sm text-neutral-500">Noch nicht ausgeführt. Mit „Ausführen“ (Strg + Enter) siehst du hier die Ergebnisse.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </BlueprintContext.Provider>
  );
}

function SqlView({ script, problems }: { script: string; problems: string[] }): ReactNode {
  return (
    <div className="space-y-3">
      {problems.length > 0 && (
        <Notice tone="warn">
          {problems.map((p, i) => (
            <span key={i} className="block">{p}</span>
          ))}
        </Notice>
      )}
      {script ? (
        <pre className="rounded-lg bg-black/40 border border-neutral-800 p-3 text-[12.5px] leading-6 font-mono text-neutral-300 whitespace-pre-wrap break-words">
          <Highlighted sql={script} />
        </pre>
      ) : (
        problems.length === 0 && <p className="text-sm text-neutral-500">Verbinde Knoten mit einem Ergebnis, dann erscheint hier das SQL.</p>
      )}
    </div>
  );
}

function Palette({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  return (
    <aside className="w-56 shrink-0 border-r border-neutral-800 overflow-y-auto p-3 space-y-4">
      {GROUP_ORDER.map((group) => {
        const defs = Object.values(NODE_DEFS).filter((d) => d.group === group);
        return (
          <section key={group}>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 mb-1.5">{group}</h3>
            <div className="space-y-1">
              {defs.map((def) => (
                <button
                  key={def.kind}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/feather-node', def.kind);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => onAdd(def.kind)}
                  title={def.description}
                  className="w-full flex items-center gap-2 rounded-lg px-2 h-8 text-left text-[13px] text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50 transition-colors cursor-grab active:cursor-grabbing"
                  data-node-kind={def.kind}
                >
                  <span className={`size-2.5 rounded-sm shrink-0 ${def.header}`} />
                  <span className="truncate">{def.title}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
