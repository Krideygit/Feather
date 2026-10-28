import { Bot, Clock, LogIn, LogOut, Play, RotateCcw, Send, Terminal, Trash2, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { simulate, type BotProject, type SimOut, type SimState, type SimUser } from '../../shared/bot';

type Entry =
  | { id: number; kind: 'user'; channel: string; text: string; deleted?: boolean; reactions: string[] }
  | { id: number; kind: 'bot'; channel: string; text: string; reply?: boolean }
  | { id: number; kind: 'embed'; channel: string; title: string; text: string; color: string }
  | { id: number; kind: 'system'; text: string; tone?: 'warn' | 'info' };

type Draft = Entry extends infer E ? (E extends { id: number } ? Omit<E, 'id'> : never) : never;

const DEFAULT_CHANNELS = ['allgemein', 'willkommen', 'befehle'];

export function BotSim({ project, onVisit }: { project: BotProject; onVisit: (ids: string[]) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [name, setName] = useState('Du');
  const [roles, setRoles] = useState('Mitglied');
  const [channel, setChannel] = useState('allgemein');
  const [text, setText] = useState('');
  const [command, setCommand] = useState('');
  const [option, setOption] = useState('');
  const [status, setStatus] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [members, setMembers] = useState(12);
  const state = useRef<SimState>({ vars: {}, members: 12, server: 'Testserver' });
  const counter = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const channels = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS);
    for (const n of project.nodes) {
      if (n.type === 'onMessage' || n.type === 'send' || n.type === 'embed' || n.type === 'onTimer') {
        const c = String(n.data.channel ?? '').trim().replace(/^#/, '');
        if (c) set.add(c);
      }
    }
    return [...set];
  }, [project.nodes]);
  const commands = useMemo(() => project.nodes.filter((n) => n.type === 'onCommand'), [project.nodes]);
  const timers = useMemo(() => project.nodes.filter((n) => n.type === 'onTimer'), [project.nodes]);
  const selected = commands.find((n) => String(n.data.name) === command) ?? commands[0];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  const me = (): SimUser => ({ id: '42', name: name.trim() || 'Du', roles: roles.split(',').map((r) => r.trim()).filter(Boolean) });
  const push = (...list: Draft[]): void => setEntries((current) => [...current, ...list.map((e) => ({ ...e, id: ++counter.current }) as Entry)].slice(-200));

  function present(outputs: SimOut[]): Draft[] {
    const list: Draft[] = [];
    for (const o of outputs) {
      switch (o.kind) {
        case 'message':
          list.push({ kind: 'bot', channel: o.channel ?? '', text: o.text ?? '' });
          break;
        case 'reply':
          list.push({ kind: 'bot', channel: o.channel ?? '', text: o.text ?? '', reply: true });
          break;
        case 'embed':
          list.push({ kind: 'embed', channel: o.channel ?? '', title: o.title ?? '', text: o.text ?? '', color: o.color ?? '#5865f2' });
          break;
        case 'role':
          list.push({ kind: 'system', text: `${o.add ? 'Rolle vergeben' : 'Rolle entfernt'}: ${o.role}`, tone: 'info' });
          break;
        case 'kick':
          list.push({ kind: 'system', text: `Mitglied gekickt${o.text ? `: ${o.text}` : ''}`, tone: 'warn' });
          break;
        case 'wait':
          list.push({ kind: 'system', text: `Pause von ${o.seconds} s (im Test übersprungen)` });
          break;
        case 'presence':
          setStatus(o.text ?? '');
          break;
        default:
          break;
      }
    }
    return list;
  }

  function fire(event: Parameters<typeof simulate>[1], before: Draft[] = []): void {
    state.current.members = members;
    const result = simulate(project, event, state.current);
    onVisit(result.visited);
    if (result.roles.join('|') !== me().roles.join('|') && event.user) setRoles(result.roles.join(', '));
    const lines = result.outputs.filter((o) => o.kind === 'log').map((o) => o.text ?? '');
    const trace = result.outputs.filter((o) => o.kind === 'var').map((o) => `Variable ${o.text}`);
    if (lines.length || trace.length) setConsoleLines((c) => [...c, ...trace, ...lines].slice(-100));
    setVars({ ...state.current.vars });
    const shown = present(result.outputs);
    const reacted = result.outputs.filter((o) => o.kind === 'react').map((o) => o.emoji ?? '');
    const removed = result.outputs.some((o) => o.kind === 'delete');
    if (before.length) {
      const [first, ...rest] = before;
      const decorated = first && first.kind === 'user' ? { ...first, reactions: reacted, deleted: removed } : first;
      push(...(decorated ? [decorated] : []), ...rest, ...shown);
    } else {
      push(...shown);
    }
    if (!before.length && !shown.length && !result.outputs.length && !result.visited.length) push({ kind: 'system', text: 'Dazu ist im Bot kein Ereignis verbunden.' });
    if (result.kicked) push({ kind: 'system', text: `${me().name} wurde vom Server entfernt.`, tone: 'warn' });
  }

  function sendMessage(): void {
    const content = text.trim();
    if (!content) return;
    setText('');
    fire({ type: 'message', user: me(), channel, content }, [{ kind: 'user', channel, text: content, reactions: [] }]);
  }

  function reset(): void {
    state.current = { vars: {}, members, server: 'Testserver' };
    setVars({});
    setEntries([]);
    setConsoleLines([]);
    setStatus('');
    onVisit([]);
  }

  const bubble = (e: Entry): React.ReactNode => {
    if (e.kind === 'system') return <p className={`text-center text-[11px] ${e.tone === 'warn' ? 'text-amber-300' : 'text-neutral-500'}`}>{e.text}</p>;
    if (e.kind === 'user') {
      return (
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-neutral-700 text-neutral-200"><UserRound className="size-4" /></span>
          <div className="min-w-0">
            <p className="text-xs"><span className="font-semibold text-neutral-100">{name || 'Du'}</span> <span className="text-neutral-600">#{e.channel}</span></p>
            <p className={`whitespace-pre-wrap break-words text-sm ${e.deleted ? 'text-neutral-600 line-through' : 'text-neutral-200'}`}>{e.text}</p>
            {e.reactions.length > 0 && <div className="mt-1 flex gap-1">{e.reactions.map((r, i) => <span key={i} className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs">{r} 1</span>)}</div>}
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#5865f2] text-white"><Bot className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-xs"><span className="font-semibold text-neutral-100">Dein Bot</span> <span className="rounded bg-[#5865f2] px-1 text-[9px] font-semibold text-white">BOT</span> <span className="text-neutral-600">#{e.channel}</span>{e.kind === 'bot' && e.reply ? <span className="text-neutral-600"> · Antwort</span> : null}</p>
          {e.kind === 'embed' ? (
            <div className="mt-1 max-w-sm rounded-md border-l-4 bg-neutral-800/70 px-3 py-2" style={{ borderLeftColor: e.color }}>
              {e.title && <p className="text-sm font-semibold text-neutral-50">{e.title}</p>}
              {e.text && <p className="whitespace-pre-wrap break-words text-[13px] text-neutral-300">{e.text}</p>}
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">{e.text}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 gap-3 p-3" data-bot-sim>
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-neutral-800 bg-neutral-950/50">
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
          <span className="font-medium text-neutral-300">Testserver</span>
          {status && <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">Spielt {status}</span>}
          <span className="flex-1" />
          <button className="btn btn-ghost btn-sm h-6" onClick={reset} data-action="bot-sim-reset"><RotateCcw className="size-3" />Zurücksetzen</button>
        </div>
        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-3 py-3" data-sim-log>
          {entries.length === 0 && <p className="py-4 text-center text-sm text-neutral-600">Schreib etwas, löse ein Ereignis aus oder führe einen Befehl aus. Dein Bot antwortet hier, ohne dass Discord nötig ist.</p>}
          {entries.map((e) => (
            <div key={e.id} className="animate-fade-in">{bubble(e)}</div>
          ))}
        </div>
        <form className="flex items-center gap-2 border-t border-neutral-800 p-2" onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
          <select className="bp-field h-8 w-32 shrink-0" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Kanal" data-bind="sim-channel">
            {channels.map((c) => <option key={c} value={c}>#{c}</option>)}
          </select>
          <input className="input h-8 flex-1" value={text} placeholder="Nachricht schreiben, z. B. !hilfe" spellCheck={false} onChange={(e) => setText(e.target.value)} data-bind="sim-text" />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!text.trim()} data-action="sim-send"><Send className="size-3.5" />Senden</button>
        </form>
      </div>

      <div className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto pr-1">
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Ereignisse auslösen</h4>
          <div className="grid grid-cols-2 gap-1.5">
            <button className="btn btn-outline btn-sm" onClick={() => { push({ kind: 'system', text: 'Bot ist online.' }); fire({ type: 'ready' }); }} data-action="sim-ready"><Play className="size-3.5" />Bot starten</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setMembers((m) => m + 1); state.current.members = members + 1; push({ kind: 'system', text: `${me().name} ist dem Server beigetreten.` }); fire({ type: 'join', user: me(), channel: 'willkommen' }); }} data-action="sim-join"><LogIn className="size-3.5" />Beitritt</button>
            <button className="btn btn-outline btn-sm" onClick={() => { push({ kind: 'system', text: `${me().name} hat den Server verlassen.` }); fire({ type: 'leave', user: me(), channel: 'allgemein' }); }} data-action="sim-leave"><LogOut className="size-3.5" />Austritt</button>
            {timers.map((t) => (
              <button key={t.id} className="btn btn-outline btn-sm" onClick={() => fire({ type: 'timer', nodeId: t.id, channel: String(t.data.channel) })} data-action="sim-timer"><Clock className="size-3.5" />Alle {String(t.data.minutes)} min</button>
            ))}
          </div>
        </section>

        <section className="space-y-1.5">
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Slash-Befehl</h4>
          {commands.length === 0 ? (
            <p className="text-xs text-neutral-600">Noch kein Slash-Befehl im Bot.</p>
          ) : (
            <div className="space-y-1.5">
              <select className="bp-field h-8" value={selected ? String(selected.data.name) : ''} onChange={(e) => setCommand(e.target.value)} data-bind="sim-command">
                {commands.map((c) => <option key={c.id} value={String(c.data.name)}>/{String(c.data.name)}</option>)}
              </select>
              {selected && String(selected.data.option ?? '').trim() && <input className="bp-field h-8" value={option} placeholder={String(selected.data.option)} onChange={(e) => setOption(e.target.value)} />}
              <button className="btn btn-outline btn-sm w-full" onClick={() => selected && fire({ type: 'command', user: me(), channel, command: String(selected.data.name), option }, [{ kind: 'system', text: `${me().name} nutzt /${String(selected.data.name)}${option ? ` ${option}` : ''}` }])} data-action="sim-command">Ausführen</button>
            </div>
          )}
        </section>

        <section className="space-y-1.5">
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Testmitglied</h4>
          <input className="bp-field h-8" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <input className="bp-field h-8" value={roles} placeholder="Rollen, mit Komma getrennt" onChange={(e) => setRoles(e.target.value)} aria-label="Rollen" data-bind="sim-roles" />
        </section>

        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500"><Terminal className="size-3" />Konsole und Variablen</h4>
          <div className="max-h-28 overflow-y-auto rounded-lg border border-neutral-800 bg-black/40 p-2 font-mono text-[11px] leading-5 text-neutral-400" data-sim-console>
            {consoleLines.length === 0 && Object.keys(vars).length === 0 ? <span className="text-neutral-600">Noch keine Ausgabe.</span> : null}
            {Object.entries(vars).map(([k, v]) => <div key={k} className="text-sky-300">{k} = {v}</div>)}
            {consoleLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {consoleLines.length > 0 && <button className="btn btn-ghost btn-sm h-6" onClick={() => setConsoleLines([])}><Trash2 className="size-3" />Leeren</button>}
        </section>
      </div>
    </div>
  );
}
