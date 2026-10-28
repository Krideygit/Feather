import { Handle, Position, useReactFlow, type Node, type NodeProps, type NodeTypes } from '@xyflow/react';
import { createContext, useContext, type CSSProperties } from 'react';
import { BOT_DEFS, type BotData, type BotKind, type FieldDef } from '../../shared/bot';

export interface BotEnv {
  problems: Record<string, { message: string; level: 'error' | 'warn' }>;
  active: ReadonlySet<string>;
}

export const BotContext = createContext<BotEnv>({ problems: {}, active: new Set() });

export type FlowNode = Node<BotData, BotKind>;

function Field({ id, def, value }: { id: string; def: FieldDef; value: string | number | boolean | undefined }) {
  const { updateNodeData } = useReactFlow();
  const set = (v: string | number | boolean): void => updateNodeData(id, { [def.key]: v });
  const text = String(value ?? '');
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-neutral-500">{def.label}</span>
      {def.type === 'area' ? (
        <textarea
          className="bp-field nodrag nowheel block h-auto min-h-[28px] resize-none py-1 leading-[18px]"
          style={{ fieldSizing: 'content', maxHeight: 160 } as CSSProperties}
          rows={1}
          value={text}
          placeholder={def.placeholder}
          spellCheck={false}
          onChange={(e) => set(e.target.value)}
          data-bot-field={def.key}
        />
      ) : def.type === 'select' ? (
        <select className="bp-field nodrag" value={text} onChange={(e) => set(e.target.value)} data-bot-field={def.key}>
          {def.options?.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      ) : def.type === 'number' ? (
        <input className="bp-field nodrag" type="number" min={def.min} max={def.max} value={text} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} data-bot-field={def.key} />
      ) : def.type === 'color' ? (
        <div className="flex gap-1.5">
          <input type="color" className="nodrag h-7 w-9 shrink-0 cursor-pointer rounded-md border border-neutral-700 bg-transparent p-0.5" value={/^#[0-9a-f]{6}$/i.test(text) ? text : '#5865f2'} onChange={(e) => set(e.target.value)} aria-label={def.label} data-bot-field={def.key} />
          <input className="bp-field nodrag font-mono" value={text} spellCheck={false} onChange={(e) => set(e.target.value)} />
        </div>
      ) : (
        <input className="bp-field nodrag" value={text} placeholder={def.placeholder} spellCheck={false} onChange={(e) => set(e.target.value)} data-bot-field={def.key} />
      )}
    </label>
  );
}

function BotNodeView({ id, type, data, selected }: NodeProps<FlowNode>) {
  const def = BOT_DEFS[type];
  const env = useContext(BotContext);
  const problem = env.problems[id];
  const active = env.active.has(id);
  const isNote = type === 'note';
  const ring = active
    ? 'border-emerald-400 shadow-[0_0_0_4px_rgb(52_211_153/0.2),0_12px_32px_rgb(0_0_0/0.55)]'
    : problem?.level === 'error'
      ? 'border-red-500/70'
      : selected
        ? 'border-primary shadow-[0_0_0_4px_rgb(14_165_233/0.16),0_12px_32px_rgb(0_0_0/0.55)]'
        : 'border-neutral-700 hover:border-neutral-500';

  return (
    <div style={{ width: def.width }} className="relative animate-node-in" data-bot-node={type}>
      <div className={`rounded-xl border bg-neutral-900/95 shadow-xl transition-[border-color,box-shadow] duration-200 ${isNote ? 'border-dashed bg-amber-300/5' : ''} ${ring}`}>
        <div className="relative flex h-8 items-center gap-1.5 rounded-t-[11px] px-3 text-[13px] font-semibold text-white" style={{ background: def.color }}>
          {!def.event && !isNote && <Handle type="target" position={Position.Left} id="in" className="pin pin-flow" />}
          <span className="flex-1 truncate">{def.title}</span>
          {active && <span className="size-2 animate-pulse rounded-full bg-emerald-300" aria-label="Wurde ausgeführt" />}
        </div>
        {def.fields.length > 0 && (
          <div className="space-y-2 px-3 pb-2 pt-2">
            {def.fields.map((f) => (
              <Field key={f.key} id={id} def={f} value={data[f.key]} />
            ))}
          </div>
        )}
        {def.outputs.length > 0 && (
          <div className="pb-1 pt-0.5">
            {def.outputs.map((o) => (
              <div key={o.id} className="relative flex h-7 items-center justify-end px-3 text-xs text-neutral-300">
                {o.label}
                <Handle type="source" position={Position.Right} id={o.id} className={`pin pin-flow ${o.id === 'yes' ? 'pin-yes' : o.id === 'no' ? 'pin-no' : ''}`} />
              </div>
            ))}
          </div>
        )}
        {problem && <p className={`px-3 pb-2 text-[11px] leading-4 ${problem.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>{problem.message}</p>}
      </div>
    </div>
  );
}

export const botNodeTypes: NodeTypes = Object.fromEntries((Object.keys(BOT_DEFS) as BotKind[]).map((kind) => [kind, BotNodeView]));
