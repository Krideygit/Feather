import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, addEdge, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type IsValidConnection } from '@xyflow/react';
import { Check, ClipboardCopy, Copy, MessageCircle, Rocket, Scissors, Trash2, Wand2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { BOT_DEFS, BOT_GROUPS, BOT_TEMPLATES, generateBot, newBotNode, validateBot, type BotKind, type BotProject } from '../../shared/bot';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { botById, loadProject, renameBot, saveProject } from '../lib/bots';
import { BotContext, botNodeTypes, type BotEnv, type FlowNode } from './BotNodes';
import { openBotDeploy } from './BotDeploy';
import { BotSim } from './BotSim';

const EDGE_STYLE = { stroke: '#5865f2', strokeWidth: 2 };

type Tab = 'sim' | 'code' | 'check';
type MenuTarget = { kind: 'nodes'; ids: string[] } | { kind: 'edge'; id: string };

export function openBotEditor(botId: string): void {
  openLayer((close) => <BotDialog botId={botId} onClose={close} />, { persistent: true });
}

function BotDialog({ botId, onClose }: { botId: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const leave = useCallback((): void => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }, [closing, onClose]);
  return (
    <div className={`fixed inset-x-0 bottom-0 top-10 z-50 flex bg-black/70 p-3 ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}>
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl ${closing ? 'animate-pop-out' : 'animate-pop'}`} role="dialog" aria-label="Bot-Editor">
        <ReactFlowProvider>
          <Editor botId={botId} onClose={leave} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

function toFlow(project: BotProject): { nodes: FlowNode[]; edges: Edge[] } {
  return {
    nodes: project.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: project.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? 'out', target: e.target, targetHandle: 'in', style: EDGE_STYLE })),
  };
}

function Editor({ botId, onClose }: { botId: string; onClose: () => void }) {
  const initial = useMemo(() => toFlow(loadProject(botId)), [botId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [tab, setTab] = useState<Tab>('sim');
  const [file, setFile] = useState('index.js');
  const [active, setActive] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const [name, setName] = useState(botById(botId)?.name ?? 'Bot');
  const flow = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const project = useMemo<BotProject>(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, type: n.type as BotKind, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? 'out', target: e.target })),
    }),
    [nodes, edges],
  );
  const problems = useMemo(() => validateBot(project), [project]);
  const errors = problems.filter((p) => p.level === 'error');
  const env = useMemo<BotEnv>(() => {
    const map: BotEnv['problems'] = {};
    for (const p of problems) if (p.nodeId && (!map[p.nodeId] || p.level === 'error')) map[p.nodeId] = { message: p.message, level: p.level };
    return { problems: map, active };
  }, [problems, active]);
  const files = useMemo(() => (errors.length ? null : generateBot(project, name)), [project, name, errors.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!saveProject(botId, project)) toast('Der Bot konnte nicht gespeichert werden. Der Speicher ist voll.', 'error');
    }, 500);
    return () => clearTimeout(timer);
  }, [project, botId]);

  const visit = useCallback((ids: string[]): void => {
    if (clear.current) clearTimeout(clear.current);
    setActive(new Set(ids));
    if (ids.length) clear.current = setTimeout(() => setActive(new Set()), 2200);
  }, []);

  const addNode = useCallback(
    (kind: BotKind, at?: { x: number; y: number }): void => {
      counter.current += 1;
      const rect = canvas.current?.getBoundingClientRect();
      const center = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
      const jitter = (counter.current % 5) * 26;
      const node = newBotNode(kind, `n${Date.now().toString(36)}${counter.current}`, at ?? { x: center.x - 120 + jitter, y: center.y - 80 + jitter });
      setNodes((current) => [...current, { id: node.id, type: node.type, position: node.position, data: node.data }]);
    },
    [flow, setNodes],
  );

  const remove = useCallback(
    (ids: string[]): void => {
      const gone = new Set(ids);
      setNodes((current) => current.filter((n) => !gone.has(n.id)));
      setEdges((current) => current.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    },
    [setNodes, setEdges],
  );

  const duplicate = useCallback(
    (ids: string[]): void => {
      const stamp = Date.now().toString(36);
      const map = new Map(ids.map((id, i) => [id, `${stamp}d${i}`]));
      setNodes((current) => [
        ...current.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...current.filter((n) => map.has(n.id)).map((n) => ({ id: map.get(n.id) as string, type: n.type, data: { ...n.data }, position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true })),
      ]);
      setEdges((current) => [
        ...current,
        ...current.filter((e) => map.has(e.source) && map.has(e.target)).map((e) => ({ ...e, id: `${e.id}-${stamp}`, source: map.get(e.source) as string, target: map.get(e.target) as string, selected: false })),
      ]);
    },
    [setNodes, setEdges],
  );

  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (c) => {
      if (c.source === c.target) return false;
      const from = nodes.find((n) => n.id === c.source);
      const to = nodes.find((n) => n.id === c.target);
      if (!from?.type || !to?.type) return false;
      return !BOT_DEFS[to.type].event && to.type !== 'note' && from.type !== 'note';
    },
    [nodes],
  );

  const onConnect = useCallback(
    (c: Connection) => setEdges((current) => addEdge({ ...c, style: EDGE_STYLE }, current)),
    [setEdges],
  );

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/feather-bot') as BotKind;
    if (kind in BOT_DEFS) addNode(kind, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function openNodeMenu(event: ReactMouseEvent, node: FlowNode): void {
    event.preventDefault();
    const ids = node.selected ? nodes.filter((n) => n.selected).map((n) => n.id) : [node.id];
    if (!node.selected) setNodes((current) => current.map((n) => ({ ...n, selected: n.id === node.id })));
    setMenu({ x: event.clientX, y: event.clientY, target: { kind: 'nodes', ids } });
  }

  const entries = useMemo((): MenuEntry[] => {
    if (!menu) return [];
    const { target } = menu;
    if (target.kind === 'edge') return [{ kind: 'action', label: 'Verbindung entfernen', icon: Scissors, danger: true, onSelect: () => setEdges((c) => c.filter((e) => e.id !== target.id)) }];
    const plural = target.ids.length > 1 ? ` (${target.ids.length})` : '';
    const connected = edges.some((e) => target.ids.includes(e.source) || target.ids.includes(e.target));
    return [
      { kind: 'action', label: `Duplizieren${plural}`, icon: Copy, onSelect: () => duplicate(target.ids) },
      ...(connected ? [{ kind: 'action' as const, label: 'Verbindungen trennen', icon: Scissors, onSelect: () => setEdges((c) => c.filter((e) => !target.ids.includes(e.source) && !target.ids.includes(e.target))) }] : []),
      { kind: 'separator' },
      { kind: 'action', label: `Entfernen${plural}`, icon: Trash2, danger: true, hint: 'Entf', onSelect: () => remove(target.ids) },
    ];
  }, [menu, edges, duplicate, remove, setEdges]);

  async function clearAll(): Promise<void> {
    if (!nodes.length) return;
    const ok = await confirmDialog({ title: 'Bot leeren?', message: 'Alle Knoten und Verbindungen werden entfernt.', confirmLabel: 'Leeren', danger: true });
    if (!ok) return;
    setNodes([]);
    setEdges([]);
  }

  function loadTemplate(id: string): void {
    const template = BOT_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    const next = toFlow(template.build());
    setNodes(next.nodes);
    setEdges(next.edges);
    setTimeout(() => void flow.fitView({ padding: 0.25, maxZoom: 1, duration: 400 }), 60);
  }

  const visibleFile = files?.[file] ?? files?.['index.js'] ?? '';

  return (
    <BotContext.Provider value={env}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-800 px-4">
        <MessageCircle className="size-[18px] text-[#5865f2]" />
        <input
          className="h-8 w-56 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-neutral-100 outline-none hover:border-neutral-700 focus:border-primary"
          value={name}
          maxLength={40}
          aria-label="Name des Bots"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? renameBot(botId, name) : setName(botById(botId)?.name ?? 'Bot'))}
          data-bind="bot-name"
        />
        <span className="hidden text-xs text-neutral-500 md:inline">Discord-Bot</span>
        <span className="flex-1" />
        <select className="bp-field h-8 w-44" value="" onChange={(e) => e.target.value && loadTemplate(e.target.value)} aria-label="Vorlage laden" data-bind="bot-template">
          <option value="">Vorlage laden …</option>
          {BOT_TEMPLATES.filter((t) => t.id !== 'empty').map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => void clearAll()} disabled={!nodes.length}><Trash2 className="size-3.5" />Leeren</button>
        <button className="btn btn-primary btn-sm" disabled={errors.length > 0} onClick={() => openBotDeploy(project, name)} title={errors.length ? 'Behebe zuerst die Fehler im Reiter Prüfung' : 'Bot auf einen Server laden'} data-action="bot-deploy">
          <Rocket className="size-3.5" />
          Auf Server bereitstellen
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Bot-Editor schließen" data-action="bot-close"><X className="size-4" /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 space-y-4 overflow-y-auto border-r border-neutral-800 p-3">
          {BOT_GROUPS.map((group) => {
            const defs = Object.values(BOT_DEFS).filter((d) => d.group === group);
            return (
              <section key={group}>
                <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">{group}</h3>
                <div className="space-y-1">
                  {defs.map((def) => (
                    <button
                      key={def.kind}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/feather-bot', def.kind);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => addNode(def.kind)}
                      title={def.description}
                      className="group flex h-8 w-full cursor-grab items-center gap-2 rounded-lg px-2 text-left text-[13px] text-neutral-300 transition-[background-color,color,transform] duration-150 hover:translate-x-0.5 hover:bg-neutral-800 hover:text-neutral-50 active:scale-[0.98] active:cursor-grabbing"
                      data-bot-kind={def.kind}
                    >
                      <span className="size-2.5 shrink-0 rounded-sm transition-transform duration-150 group-hover:scale-125" style={{ background: def.color }} />
                      <span className="truncate">{def.title}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={canvas} className="relative min-h-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <ReactFlow<FlowNode, Edge>
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={botNodeTypes}
              colorMode="dark"
              deleteKeyCode={['Backspace', 'Delete']}
              panOnDrag={[0, 1]}
              onNodeContextMenu={openNodeMenu}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault();
                setMenu({ x: event.clientX, y: event.clientY, target: { kind: 'edge', id: edge.id } });
              }}
              onMoveStart={() => setMenu(null)}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.2}
              maxZoom={1.6}
              defaultEdgeOptions={{ style: EDGE_STYLE }}
            >
              <Background gap={22} color="#2a2a2a" />
              <Controls showInteractive={false} fitViewOptions={{ padding: 0.25, maxZoom: 1, duration: 400 }} />
              <MiniMap pannable zoomable maskColor="rgb(0 0 0 / 0.55)" nodeColor="#404040" />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="pointer-events-auto max-w-md animate-pop rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/80 px-6 py-8 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-xl bg-[#5865f2]/15 text-[#8c96ff]"><MessageCircle className="size-6" /></div>
                  <p className="mt-4 text-sm font-medium text-neutral-100">Baue deinen Discord-Bot aus Knoten</p>
                  <p className="mt-1 text-sm text-neutral-500">Beginne mit einem Ereignis wie „Nachricht empfangen“, verbinde es mit Ausgaben und teste alles unten im Simulator.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {BOT_TEMPLATES.filter((t) => t.id !== 'empty').map((t) => (
                      <button key={t.id} className="btn btn-outline btn-sm" onClick={() => loadTemplate(t.id)} title={t.description} data-bot-template={t.id}>
                        <Wand2 className="size-3.5" />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex h-[40%] min-h-[220px] shrink-0 flex-col border-t border-neutral-800">
            <div className="flex shrink-0 items-center gap-1 border-b border-neutral-800 px-3">
              <button className={`tab ${tab === 'sim' ? 'tab-active' : ''}`} onClick={() => setTab('sim')} data-tab="bot-sim">Simulator</button>
              <button className={`tab ${tab === 'code' ? 'tab-active' : ''}`} onClick={() => setTab('code')} data-tab="bot-code">Code</button>
              <button className={`tab ${tab === 'check' ? 'tab-active' : ''}`} onClick={() => setTab('check')} data-tab="bot-check">
                Prüfung
                {problems.length > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-semibold ${errors.length ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{problems.length}</span>}
              </button>
              <span className="flex-1" />
              {errors.length === 0 && nodes.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="size-3.5" />Bereit zum Bereitstellen</span>
              )}
            </div>
            <div className="min-h-0 flex-1">
              {tab === 'sim' && <BotSim project={project} onVisit={visit} />}
              {tab === 'code' && (
                <div className="flex h-full min-h-0 flex-col">
                  {files ? (
                    <>
                      <div className="flex shrink-0 items-center gap-1 px-3 py-1.5">
                        {Object.keys(files).filter((f) => f !== '.env.example').map((f) => (
                          <button key={f} className={`rounded-md px-2 py-1 text-xs font-mono ${file === f ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-100'}`} onClick={() => setFile(f)}>{f}</button>
                        ))}
                        <span className="flex-1" />
                        <button className="btn btn-ghost btn-sm" onClick={() => void window.feather.copy(visibleFile).then(() => toast('Code kopiert.', 'success'))}><ClipboardCopy className="size-3.5" />Kopieren</button>
                      </div>
                      <pre className="min-h-0 flex-1 overflow-auto bg-black/40 px-4 py-3 font-mono text-[12px] leading-5 text-neutral-300" data-bot-code>{visibleFile}</pre>
                    </>
                  ) : (
                    <p className="p-4 text-sm text-neutral-500">Der Code erscheint, sobald alle Fehler behoben sind. Details stehen im Reiter Prüfung.</p>
                  )}
                </div>
              )}
              {tab === 'check' && (
                <div className="h-full space-y-2 overflow-y-auto p-4" data-bot-check>
                  {problems.length === 0 ? (
                    <p className="text-sm text-neutral-500">{nodes.length ? 'Alles in Ordnung.' : 'Noch keine Knoten.'}</p>
                  ) : (
                    problems.map((p, i) => (
                      <button
                        key={i}
                        className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${p.level === 'error' ? 'border-red-500/25 bg-red-500/10 text-red-200' : 'border-amber-500/25 bg-amber-500/10 text-amber-200'}`}
                        onClick={() => {
                          const node = nodes.find((n) => n.id === p.nodeId);
                          if (node) void flow.fitView({ nodes: [{ id: node.id }], padding: 0.8, maxZoom: 1, duration: 400 });
                        }}
                      >
                        <span className="font-medium">{p.nodeId ? BOT_DEFS[nodes.find((n) => n.id === p.nodeId)?.type ?? 'note'].title : 'Bot'}: </span>
                        {p.message}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} />}
    </BotContext.Provider>
  );
}
