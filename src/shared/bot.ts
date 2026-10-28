export type BotKind =
  | 'onReady'
  | 'onMessage'
  | 'onCommand'
  | 'onJoin'
  | 'onLeave'
  | 'onTimer'
  | 'ifText'
  | 'ifRole'
  | 'chance'
  | 'setVar'
  | 'wait'
  | 'send'
  | 'reply'
  | 'embed'
  | 'react'
  | 'addRole'
  | 'removeRole'
  | 'kick'
  | 'deleteMsg'
  | 'presence'
  | 'log'
  | 'note';

export type BotValue = string | number | boolean;
export type BotData = Record<string, BotValue>;

export interface BotNode {
  id: string;
  type: BotKind;
  position: { x: number; y: number };
  data: BotData;
}

export interface BotEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}

export interface BotProject {
  nodes: BotNode[];
  edges: BotEdge[];
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'area' | 'number' | 'select' | 'color' | 'bool';
  placeholder?: string;
  options?: { id: string; label: string }[];
  min?: number;
  max?: number;
}

export interface PinSpec {
  id: string;
  label: string;
}

export interface BotNodeDef {
  kind: BotKind;
  title: string;
  group: string;
  description: string;
  color: string;
  event: boolean;
  outputs: PinSpec[];
  fields: FieldDef[];
  defaults: BotData;
  width: number;
}

const OUT: PinSpec[] = [{ id: 'out', label: 'Weiter' }];
const YES_NO: PinSpec[] = [
  { id: 'yes', label: 'Ja' },
  { id: 'no', label: 'Nein' },
];

export const COND_OPS: { id: string; label: string }[] = [
  { id: 'contains', label: 'enthält' },
  { id: 'equals', label: 'ist gleich' },
  { id: 'notEquals', label: 'ist ungleich' },
  { id: 'startsWith', label: 'beginnt mit' },
  { id: 'endsWith', label: 'endet mit' },
  { id: 'regex', label: 'passt auf Muster' },
  { id: 'gt', label: 'ist größer als' },
  { id: 'lt', label: 'ist kleiner als' },
];

export const BOT_GROUPS = ['Ereignisse', 'Ablauf', 'Ausgabe', 'Mitglieder', 'Sonstiges'];

const EVENT_COLOR = '#e11d48';
const FLOW_COLOR = '#d97706';
const OUTPUT_COLOR = '#5865f2';
const MEMBER_COLOR = '#059669';
const OTHER_COLOR = '#64748b';

export const BOT_DEFS: Record<BotKind, BotNodeDef> = {
  onReady: { kind: 'onReady', title: 'Bot gestartet', group: 'Ereignisse', description: 'Läuft einmal, sobald der Bot online ist.', color: EVENT_COLOR, event: true, outputs: OUT, fields: [], defaults: {}, width: 220 },
  onMessage: {
    kind: 'onMessage',
    title: 'Nachricht empfangen',
    group: 'Ereignisse',
    description: 'Läuft bei jeder Nachricht eines Mitglieds. Nachrichten von Bots werden ignoriert.',
    color: EVENT_COLOR,
    event: true,
    outputs: OUT,
    fields: [{ key: 'channel', label: 'Nur im Kanal', type: 'text', placeholder: 'leer = alle Kanäle' }],
    defaults: { channel: '' },
    width: 250,
  },
  onCommand: {
    kind: 'onCommand',
    title: 'Slash-Befehl',
    group: 'Ereignisse',
    description: 'Läuft, wenn jemand /befehl benutzt.',
    color: EVENT_COLOR,
    event: true,
    outputs: OUT,
    fields: [
      { key: 'name', label: 'Befehl', type: 'text', placeholder: 'ping' },
      { key: 'description', label: 'Beschreibung', type: 'text', placeholder: 'Was macht der Befehl?' },
      { key: 'option', label: 'Eingabe (optional)', type: 'text', placeholder: 'z. B. text' },
    ],
    defaults: { name: 'ping', description: 'Antwortet mit Pong', option: '' },
    width: 260,
  },
  onJoin: { kind: 'onJoin', title: 'Mitglied beigetreten', group: 'Ereignisse', description: 'Läuft, wenn jemand dem Server beitritt.', color: EVENT_COLOR, event: true, outputs: OUT, fields: [], defaults: {}, width: 240 },
  onLeave: { kind: 'onLeave', title: 'Mitglied verlassen', group: 'Ereignisse', description: 'Läuft, wenn jemand den Server verlässt.', color: EVENT_COLOR, event: true, outputs: OUT, fields: [], defaults: {}, width: 240 },
  onTimer: {
    kind: 'onTimer',
    title: 'Zeitplan',
    group: 'Ereignisse',
    description: 'Läuft in festen Abständen, solange der Bot online ist.',
    color: EVENT_COLOR,
    event: true,
    outputs: OUT,
    fields: [
      { key: 'minutes', label: 'Alle … Minuten', type: 'number', min: 1, max: 1440 },
      { key: 'channel', label: 'Kanal', type: 'text', placeholder: 'allgemein' },
    ],
    defaults: { minutes: 60, channel: 'allgemein' },
    width: 240,
  },
  ifText: {
    kind: 'ifText',
    title: 'Bedingung',
    group: 'Ablauf',
    description: 'Vergleicht zwei Texte und geht je nach Ergebnis nach Ja oder Nein weiter.',
    color: FLOW_COLOR,
    event: false,
    outputs: YES_NO,
    fields: [
      { key: 'left', label: 'Wenn', type: 'text', placeholder: '{content}' },
      { key: 'op', label: 'Vergleich', type: 'select', options: COND_OPS },
      { key: 'right', label: 'Wert', type: 'text', placeholder: '!hilfe' },
    ],
    defaults: { left: '{content}', op: 'contains', right: '' },
    width: 260,
  },
  ifRole: {
    kind: 'ifRole',
    title: 'Hat Rolle',
    group: 'Ablauf',
    description: 'Prüft, ob das Mitglied eine Rolle besitzt.',
    color: FLOW_COLOR,
    event: false,
    outputs: YES_NO,
    fields: [{ key: 'role', label: 'Rolle', type: 'text', placeholder: 'Moderator' }],
    defaults: { role: '' },
    width: 240,
  },
  chance: {
    kind: 'chance',
    title: 'Zufall',
    group: 'Ablauf',
    description: 'Geht mit der eingestellten Wahrscheinlichkeit nach Ja.',
    color: FLOW_COLOR,
    event: false,
    outputs: YES_NO,
    fields: [{ key: 'percent', label: 'Wahrscheinlichkeit (%)', type: 'number', min: 0, max: 100 }],
    defaults: { percent: 50 },
    width: 240,
  },
  setVar: {
    kind: 'setVar',
    title: 'Variable',
    group: 'Ablauf',
    description: 'Merkt sich einen Wert. Abrufbar als {var.name}. Die Werte bleiben nach einem Neustart erhalten.',
    color: FLOW_COLOR,
    event: false,
    outputs: OUT,
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'zaehler' },
      {
        key: 'mode',
        label: 'Aktion',
        type: 'select',
        options: [
          { id: 'set', label: 'Setzen auf' },
          { id: 'add', label: 'Erhöhen um' },
        ],
      },
      { key: 'value', label: 'Wert', type: 'text', placeholder: '1' },
    ],
    defaults: { name: 'zaehler', mode: 'add', value: '1' },
    width: 250,
  },
  wait: {
    kind: 'wait',
    title: 'Warten',
    group: 'Ablauf',
    description: 'Pausiert den Ablauf.',
    color: FLOW_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'seconds', label: 'Sekunden', type: 'number', min: 0, max: 300 }],
    defaults: { seconds: 3 },
    width: 220,
  },
  send: {
    kind: 'send',
    title: 'Nachricht senden',
    group: 'Ausgabe',
    description: 'Schreibt eine Nachricht in einen Kanal.',
    color: OUTPUT_COLOR,
    event: false,
    outputs: OUT,
    fields: [
      { key: 'channel', label: 'Kanal', type: 'text', placeholder: 'leer = aktueller Kanal' },
      { key: 'text', label: 'Text', type: 'area', placeholder: 'Hallo {user}!' },
    ],
    defaults: { channel: '', text: 'Hallo {user}!' },
    width: 270,
  },
  reply: {
    kind: 'reply',
    title: 'Antworten',
    group: 'Ausgabe',
    description: 'Antwortet auf die Nachricht oder den Slash-Befehl.',
    color: OUTPUT_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'text', label: 'Text', type: 'area', placeholder: 'Pong!' }],
    defaults: { text: 'Pong!' },
    width: 270,
  },
  embed: {
    kind: 'embed',
    title: 'Embed senden',
    group: 'Ausgabe',
    description: 'Schickt eine formatierte Karte mit Titel und Text.',
    color: OUTPUT_COLOR,
    event: false,
    outputs: OUT,
    fields: [
      { key: 'channel', label: 'Kanal', type: 'text', placeholder: 'leer = antworten / aktueller Kanal' },
      { key: 'title', label: 'Titel', type: 'text', placeholder: 'Willkommen!' },
      { key: 'description', label: 'Text', type: 'area', placeholder: 'Schön, dass du da bist, {username}.' },
      { key: 'color', label: 'Farbe', type: 'color' },
    ],
    defaults: { channel: '', title: 'Hinweis', description: '', color: '#5865f2' },
    width: 280,
  },
  react: {
    kind: 'react',
    title: 'Reagieren',
    group: 'Ausgabe',
    description: 'Fügt der Nachricht ein Emoji hinzu.',
    color: OUTPUT_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'emoji', label: 'Emoji', type: 'text', placeholder: '👍' }],
    defaults: { emoji: '👍' },
    width: 220,
  },
  log: {
    kind: 'log',
    title: 'Konsole',
    group: 'Ausgabe',
    description: 'Schreibt einen Text in die Konsole des Bots. Praktisch zum Testen.',
    color: OUTPUT_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'text', label: 'Text', type: 'text', placeholder: '{username} hat geschrieben' }],
    defaults: { text: '{username}: {content}' },
    width: 250,
  },
  addRole: {
    kind: 'addRole',
    title: 'Rolle geben',
    group: 'Mitglieder',
    description: 'Gibt dem Mitglied eine Rolle. Der Bot braucht dafür das Recht „Rollen verwalten“.',
    color: MEMBER_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'role', label: 'Rolle', type: 'text', placeholder: 'Mitglied' }],
    defaults: { role: '' },
    width: 230,
  },
  removeRole: {
    kind: 'removeRole',
    title: 'Rolle entfernen',
    group: 'Mitglieder',
    description: 'Nimmt dem Mitglied eine Rolle.',
    color: MEMBER_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'role', label: 'Rolle', type: 'text', placeholder: 'Mitglied' }],
    defaults: { role: '' },
    width: 230,
  },
  kick: {
    kind: 'kick',
    title: 'Mitglied kicken',
    group: 'Mitglieder',
    description: 'Wirft das Mitglied vom Server. Der Bot braucht das Recht „Mitglieder kicken“.',
    color: MEMBER_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'reason', label: 'Grund', type: 'text', placeholder: 'Regelverstoß' }],
    defaults: { reason: '' },
    width: 240,
  },
  deleteMsg: {
    kind: 'deleteMsg',
    title: 'Nachricht löschen',
    group: 'Mitglieder',
    description: 'Löscht die auslösende Nachricht. Der Bot braucht das Recht „Nachrichten verwalten“.',
    color: MEMBER_COLOR,
    event: false,
    outputs: OUT,
    fields: [],
    defaults: {},
    width: 220,
  },
  presence: {
    kind: 'presence',
    title: 'Status setzen',
    group: 'Sonstiges',
    description: 'Ändert den Text, den der Bot unter seinem Namen anzeigt.',
    color: OTHER_COLOR,
    event: false,
    outputs: OUT,
    fields: [{ key: 'text', label: 'Spielt …', type: 'text', placeholder: 'mit Feather' }],
    defaults: { text: 'mit Feather' },
    width: 240,
  },
  note: {
    kind: 'note',
    title: 'Kommentar',
    group: 'Sonstiges',
    description: 'Freie Notiz auf der Arbeitsfläche. Beeinflusst den Bot nicht.',
    color: '#a16207',
    event: false,
    outputs: [],
    fields: [{ key: 'text', label: 'Notiz', type: 'area', placeholder: 'Notiz …' }],
    defaults: { text: '' },
    width: 240,
  },
};

export const OPTION_PATTERN = /^[a-z0-9_-]{1,32}$/;
export const VAR_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function newBotNode(kind: BotKind, id: string, position: { x: number; y: number }): BotNode {
  return { id, type: kind, position, data: { ...BOT_DEFS[kind].defaults } };
}

export interface BotProblem {
  nodeId: string;
  message: string;
  level: 'error' | 'warn';
}

const str = (n: BotNode, key: string): string => String(n.data[key] ?? '');
const num = (n: BotNode, key: string): number => Number(n.data[key]);

export function validateBot(project: BotProject): BotProblem[] {
  const out: BotProblem[] = [];
  const add = (n: BotNode, message: string, level: 'error' | 'warn' = 'error'): void => void out.push({ nodeId: n.id, message, level });
  const known = new Set(project.nodes.map((n) => n.id));
  const incoming = new Set(project.edges.filter((e) => known.has(e.source) && known.has(e.target)).map((e) => e.target));
  const outgoing = new Set(project.edges.filter((e) => known.has(e.source) && known.has(e.target)).map((e) => e.source));
  const commandNames = new Map<string, number>();
  for (const n of project.nodes) if (n.type === 'onCommand') commandNames.set(str(n, 'name'), (commandNames.get(str(n, 'name')) ?? 0) + 1);
  for (const n of project.nodes) {
    const def = BOT_DEFS[n.type];
    if (!def || n.type === 'note') continue;
    switch (n.type) {
      case 'onCommand':
        if (!OPTION_PATTERN.test(str(n, 'name'))) add(n, 'Der Befehl darf nur Kleinbuchstaben, Zahlen, - und _ enthalten (1 bis 32 Zeichen).');
        else if ((commandNames.get(str(n, 'name')) ?? 0) > 1) add(n, 'Diesen Befehl gibt es schon in einem anderen Knoten.');
        if (str(n, 'description').trim().length < 1 || str(n, 'description').length > 100) add(n, 'Die Beschreibung braucht 1 bis 100 Zeichen.');
        if (str(n, 'option') && !OPTION_PATTERN.test(str(n, 'option'))) add(n, 'Die Eingabe darf nur Kleinbuchstaben, Zahlen, - und _ enthalten.');
        break;
      case 'onTimer':
        if (!(num(n, 'minutes') >= 1 && num(n, 'minutes') <= 1440)) add(n, 'Der Abstand muss zwischen 1 und 1440 Minuten liegen.');
        if (!str(n, 'channel').trim()) add(n, 'Gib einen Kanal an.');
        break;
      case 'ifText':
        if (!str(n, 'left').trim()) add(n, 'Gib an, was verglichen werden soll.');
        if (str(n, 'op') === 'regex') {
          try {
            new RegExp(str(n, 'right'), 'i');
          } catch {
            add(n, 'Das Muster ist ungültig.');
          }
        }
        break;
      case 'ifRole':
      case 'addRole':
      case 'removeRole':
        if (!str(n, 'role').trim()) add(n, 'Gib eine Rolle an.');
        break;
      case 'chance':
        if (!(num(n, 'percent') >= 0 && num(n, 'percent') <= 100)) add(n, 'Die Wahrscheinlichkeit liegt zwischen 0 und 100.');
        break;
      case 'setVar':
        if (!VAR_PATTERN.test(str(n, 'name'))) add(n, 'Der Name darf nur Buchstaben, Zahlen und _ enthalten.');
        break;
      case 'wait':
        if (!(num(n, 'seconds') >= 0 && num(n, 'seconds') <= 300)) add(n, 'Die Wartezeit liegt zwischen 0 und 300 Sekunden.');
        break;
      case 'send':
      case 'reply':
      case 'presence':
      case 'log':
        if (!str(n, 'text').trim()) add(n, 'Der Text fehlt.');
        break;
      case 'embed':
        if (!str(n, 'title').trim() && !str(n, 'description').trim()) add(n, 'Gib einen Titel oder Text an.');
        if (!HEX_COLOR.test(str(n, 'color'))) add(n, 'Die Farbe ist ungültig.');
        break;
      case 'react':
        if (!str(n, 'emoji').trim()) add(n, 'Das Emoji fehlt.');
        break;
      default:
        break;
    }
    if (def.event) {
      if (!outgoing.has(n.id)) add(n, 'Dieses Ereignis tut noch nichts. Verbinde es mit einer Aktion.', 'warn');
    } else if (!incoming.has(n.id)) {
      add(n, 'Nicht verbunden, wird nie ausgeführt.', 'warn');
    }
  }
  if (!project.nodes.some((n) => BOT_DEFS[n.type]?.event)) out.push({ nodeId: '', message: 'Füge ein Ereignis hinzu, zum Beispiel „Nachricht empfangen“.', level: 'error' });
  return out;
}

export interface Requirements {
  messageContent: boolean;
  members: boolean;
  permissions: string[];
}

export function requirements(project: BotProject): Requirements {
  const kinds = new Set(project.nodes.map((n) => n.type));
  const permissions = ['Nachrichten senden'];
  if (kinds.has('addRole') || kinds.has('removeRole')) permissions.push('Rollen verwalten');
  if (kinds.has('kick')) permissions.push('Mitglieder kicken');
  if (kinds.has('deleteMsg')) permissions.push('Nachrichten verwalten');
  if (kinds.has('react')) permissions.push('Reaktionen hinzufügen');
  if (kinds.has('embed')) permissions.push('Links einbetten');
  if (project.nodes.some((n) => n.type === 'onCommand')) permissions.push('Slash-Befehle erstellen');
  return { messageContent: kinds.has('onMessage'), members: kinds.has('onJoin') || kinds.has('onLeave'), permissions };
}

export interface BotCtx {
  userId: string;
  username: string;
  roles: string[];
  channel: string;
  server: string;
  content: string;
  option: string;
  members: number;
}

const TOKEN = /\{([A-Za-z0-9_.:-]+)\}/g;

export function words(content: string): string[] {
  return String(content ?? '').trim().split(/\s+/).filter(Boolean);
}

export function render(template: string, c: BotCtx, vars: Record<string, string>, random: () => number = Math.random): string {
  return String(template).replace(TOKEN, (match, key: string) => {
    const k = key.toLowerCase();
    const list = words(c.content);
    if (k === 'user') return `<@${c.userId}>`;
    if (k === 'username') return c.username;
    if (k === 'userid') return c.userId;
    if (k === 'content') return c.content;
    if (k === 'channel') return c.channel;
    if (k === 'server') return c.server;
    if (k === 'members') return String(c.members);
    if (k === 'option') return c.option;
    if (k === 'args') return list.join(' ');
    if (k === 'rest') return list.slice(1).join(' ');
    const arg = /^arg([1-9])$/.exec(k);
    if (arg) return list[Number(arg[1]) - 1] ?? '';
    if (k.startsWith('var.')) return vars[key.slice(4)] ?? '';
    const rnd = /^random:(\d+)-(\d+)$/.exec(k);
    if (rnd) {
      const lo = Math.min(Number(rnd[1]), Number(rnd[2]));
      const hi = Math.max(Number(rnd[1]), Number(rnd[2]));
      return String(lo + Math.floor(random() * (hi - lo + 1)));
    }
    if (k === 'time') {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return match;
  });
}

export function compare(op: string, left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  switch (op) {
    case 'equals':
      return a === b;
    case 'notEquals':
      return a !== b;
    case 'contains':
      return a.includes(b);
    case 'startsWith':
      return a.startsWith(b);
    case 'endsWith':
      return a.endsWith(b);
    case 'regex':
      try {
        return new RegExp(right, 'i').test(left);
      } catch {
        return false;
      }
    case 'gt':
      return Number(left) > Number(right);
    case 'lt':
      return Number(left) < Number(right);
    default:
      return false;
  }
}

export interface SimUser {
  id: string;
  name: string;
  roles: string[];
}

export interface SimEvent {
  type: 'ready' | 'message' | 'command' | 'join' | 'leave' | 'timer';
  user?: SimUser;
  channel?: string;
  content?: string;
  command?: string;
  option?: string;
  nodeId?: string;
}

export interface SimOut {
  kind: 'message' | 'reply' | 'embed' | 'react' | 'role' | 'kick' | 'delete' | 'presence' | 'log' | 'wait' | 'var';
  nodeId: string;
  channel?: string;
  text?: string;
  title?: string;
  color?: string;
  emoji?: string;
  role?: string;
  add?: boolean;
  seconds?: number;
}

export interface SimState {
  vars: Record<string, string>;
  members: number;
  server: string;
}

export interface SimResult {
  outputs: SimOut[];
  visited: string[];
  roles: string[];
  kicked: boolean;
}

const MAX_STEPS = 400;

export function simulate(project: BotProject, event: SimEvent, state: SimState, random: () => number = Math.random): SimResult {
  const outputs: SimOut[] = [];
  const visited: string[] = [];
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const user: SimUser = event.user ? { ...event.user, roles: [...event.user.roles] } : { id: '0', name: 'Bot', roles: [] };
  const ctx: BotCtx = {
    userId: user.id,
    username: user.name,
    roles: user.roles,
    channel: event.channel ?? 'allgemein',
    server: state.server,
    content: event.type === 'command' ? (event.option ?? '') : (event.content ?? ''),
    option: event.option ?? '',
    members: state.members,
  };
  let kicked = false;
  let steps = 0;
  const hasMessage = event.type === 'message';

  const text = (value: string): string => render(value, ctx, state.vars, random);
  const next = (node: BotNode, handle: string): BotNode[] =>
    project.edges
      .filter((e) => e.source === node.id && (e.sourceHandle ?? 'out') === handle)
      .map((e) => byId.get(e.target))
      .filter((n): n is BotNode => Boolean(n));

  const run = (node: BotNode): void => {
    if (++steps > MAX_STEPS) return;
    visited.push(node.id);
    const d = node.data;
    const s = (key: string): string => String(d[key] ?? '');
    let handle = 'out';
    switch (node.type) {
      case 'ifText':
        handle = compare(s('op'), text(s('left')), text(s('right'))) ? 'yes' : 'no';
        break;
      case 'ifRole':
        handle = ctx.roles.some((r) => r.toLowerCase() === s('role').trim().toLowerCase()) ? 'yes' : 'no';
        break;
      case 'chance':
        handle = random() * 100 < Number(d.percent) ? 'yes' : 'no';
        break;
      case 'setVar': {
        const name = s('name');
        const value = text(s('value'));
        const current = state.vars[name] ?? '0';
        const result = s('mode') === 'add' ? String((Number(current) || 0) + (Number(value) || 0)) : value;
        state.vars[name] = result;
        outputs.push({ kind: 'var', nodeId: node.id, text: `${name} = ${result}` });
        break;
      }
      case 'wait':
        outputs.push({ kind: 'wait', nodeId: node.id, seconds: Number(d.seconds) });
        break;
      case 'send':
        outputs.push({ kind: 'message', nodeId: node.id, channel: s('channel').trim() || ctx.channel, text: text(s('text')) });
        break;
      case 'reply':
        outputs.push({ kind: 'reply', nodeId: node.id, channel: ctx.channel, text: text(s('text')) });
        break;
      case 'embed':
        outputs.push({ kind: 'embed', nodeId: node.id, channel: s('channel').trim() || ctx.channel, title: text(s('title')), text: text(s('description')), color: s('color') });
        break;
      case 'react':
        if (hasMessage) outputs.push({ kind: 'react', nodeId: node.id, emoji: s('emoji') });
        break;
      case 'addRole':
      case 'removeRole': {
        const role = s('role').trim();
        const add = node.type === 'addRole';
        if (add && !ctx.roles.includes(role)) ctx.roles.push(role);
        if (!add) ctx.roles = ctx.roles.filter((r) => r !== role);
        outputs.push({ kind: 'role', nodeId: node.id, role, add });
        break;
      }
      case 'kick':
        kicked = true;
        outputs.push({ kind: 'kick', nodeId: node.id, text: text(s('reason')) });
        break;
      case 'deleteMsg':
        if (hasMessage) outputs.push({ kind: 'delete', nodeId: node.id });
        break;
      case 'presence':
        outputs.push({ kind: 'presence', nodeId: node.id, text: text(s('text')) });
        break;
      case 'log':
        outputs.push({ kind: 'log', nodeId: node.id, text: text(s('text')) });
        break;
      default:
        break;
    }
    for (const target of next(node, handle)) run(target);
  };

  const starts = project.nodes.filter((n) => {
    switch (event.type) {
      case 'ready':
        return n.type === 'onReady';
      case 'message':
        return n.type === 'onMessage' && (!str(n, 'channel').trim() || str(n, 'channel').trim().toLowerCase() === ctx.channel.toLowerCase());
      case 'command':
        return n.type === 'onCommand' && str(n, 'name') === event.command;
      case 'join':
        return n.type === 'onJoin';
      case 'leave':
        return n.type === 'onLeave';
      case 'timer':
        return n.type === 'onTimer' && (!event.nodeId || n.id === event.nodeId);
      default:
        return false;
    }
  });
  for (const start of starts) {
    if (event.type === 'timer') ctx.channel = str(start, 'channel') || ctx.channel;
    run(start);
  }
  return { outputs, visited, roles: ctx.roles, kicked };
}

const RUNTIME = String.raw`
const WORD = /\s+/;
function words(content) { return String(content || '').trim().split(WORD).filter(Boolean); }
function render(template, c) {
  return String(template).replace(/\{([A-Za-z0-9_.:-]+)\}/g, function (match, key) {
    var k = key.toLowerCase();
    var list = words(c.content);
    if (k === 'user') return '<@' + c.userId + '>';
    if (k === 'username') return c.username;
    if (k === 'userid') return c.userId;
    if (k === 'content') return c.content;
    if (k === 'channel') return c.channel;
    if (k === 'server') return c.server;
    if (k === 'members') return String(c.members);
    if (k === 'option') return c.option;
    if (k === 'args') return list.join(' ');
    if (k === 'rest') return list.slice(1).join(' ');
    var arg = /^arg([1-9])$/.exec(k);
    if (arg) return list[Number(arg[1]) - 1] || '';
    if (k.indexOf('var.') === 0) return vars[key.slice(4)] === undefined ? '' : vars[key.slice(4)];
    var rnd = /^random:(\d+)-(\d+)$/.exec(k);
    if (rnd) {
      var lo = Math.min(Number(rnd[1]), Number(rnd[2]));
      var hi = Math.max(Number(rnd[1]), Number(rnd[2]));
      return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
    }
    if (k === 'time') {
      var d = new Date();
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return match;
  });
}
function compare(op, left, right) {
  var a = String(left).trim().toLowerCase();
  var b = String(right).trim().toLowerCase();
  if (op === 'equals') return a === b;
  if (op === 'notEquals') return a !== b;
  if (op === 'contains') return a.includes(b);
  if (op === 'startsWith') return a.startsWith(b);
  if (op === 'endsWith') return a.endsWith(b);
  if (op === 'regex') { try { return new RegExp(right, 'i').test(left); } catch (e) { return false; } }
  if (op === 'gt') return Number(left) > Number(right);
  if (op === 'lt') return Number(left) < Number(right);
  return false;
}
`;

const HELPERS = String.raw`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DATA_FILE = path.join(__dirname, 'data.json');
let vars = {};
try { vars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { vars = {}; }
function saveVars() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(vars, null, 2)); } catch (e) { console.error('Variablen konnten nicht gespeichert werden:', e.message); } }
function roleNames(member) { return member && member.roles && member.roles.cache ? member.roles.cache.map((r) => r.name) : []; }
function base(guild) {
  return { userId: client.user ? client.user.id : '0', username: client.user ? client.user.username : 'Bot', roles: [], channel: '', server: guild ? guild.name : '', content: '', option: '', members: guild ? guild.memberCount : 0, guild: guild || null, member: null, message: null, interaction: null, channelObj: null, replied: false };
}
function fromMessage(message) {
  const c = base(message.guild);
  c.userId = message.author.id; c.username = message.author.username; c.roles = roleNames(message.member); c.channel = message.channel.name || ''; c.content = message.content;
  c.member = message.member; c.message = message; c.channelObj = message.channel;
  return c;
}
function fromInteraction(i) {
  const c = base(i.guild);
  c.userId = i.user.id; c.username = i.user.username; c.roles = roleNames(i.member); c.channel = i.channel ? i.channel.name || '' : '';
  c.option = i.options && i.options.data.length ? String(i.options.data[0].value) : ''; c.content = c.option;
  c.member = i.member; c.interaction = i; c.channelObj = i.channel;
  return c;
}
function fromMember(member) {
  const c = base(member.guild);
  c.userId = member.id; c.username = member.user.username; c.roles = roleNames(member); c.member = member;
  c.channelObj = member.guild.systemChannel || null; c.channel = c.channelObj ? c.channelObj.name : '';
  return c;
}
function findChannel(guild, name) {
  if (!guild) return null;
  const wanted = String(name).replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find((ch) => ch.name && ch.name.toLowerCase() === wanted && ch.isTextBased()) || null;
}
async function sendTo(c, channel, payload) {
  const target = channel ? findChannel(c.guild, channel) : c.channelObj;
  if (!target) { console.warn('Kanal nicht gefunden:', channel || '(aktueller Kanal)'); return; }
  await target.send(payload);
}
async function replyTo(c, payload) {
  if (c.interaction) {
    if (c.replied || c.interaction.replied || c.interaction.deferred) await c.interaction.followUp(payload);
    else await c.interaction.reply(payload);
    c.replied = true;
  } else if (c.message) {
    await c.message.reply(payload);
  } else {
    await sendTo(c, '', payload);
  }
}
async function findRole(c, name) {
  if (!c.guild) return null;
  return c.guild.roles.cache.find((r) => r.name.toLowerCase() === String(name).toLowerCase()) || null;
}
`;

const ident = (id: string): string => `n_${id.replace(/[^A-Za-z0-9]/g, '_')}`;
const lit = (value: unknown): string => JSON.stringify(value);

export interface BotFiles {
  [file: string]: string;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'feather-bot';
}

export function generateBot(project: BotProject, name: string): BotFiles {
  const nodes = project.nodes.filter((n) => n.type !== 'note');
  const known = new Set(nodes.map((n) => n.id));
  const targets = (n: BotNode, handle: string): string[] =>
    project.edges.filter((e) => e.source === n.id && (e.sourceHandle ?? 'out') === handle && known.has(e.target)).map((e) => ident(e.target));
  const chain = (n: BotNode, handle = 'out'): string => targets(n, handle).map((t) => `await ${t}(c);`).join(' ');
  const need = requirements(project);

  const functions = nodes
    .filter((n) => !BOT_DEFS[n.type].event)
    .map((n) => {
      const d = n.data;
      const s = (key: string): string => String(d[key] ?? '');
      let body = '';
      switch (n.type) {
        case 'ifText':
          return `async function ${ident(n.id)}(c) {\n  if (compare(${lit(s('op'))}, render(${lit(s('left'))}, c), render(${lit(s('right'))}, c))) { ${chain(n, 'yes')} } else { ${chain(n, 'no')} }\n}`;
        case 'ifRole':
          return `async function ${ident(n.id)}(c) {\n  if (c.roles.some((r) => r.toLowerCase() === ${lit(s('role').trim().toLowerCase())})) { ${chain(n, 'yes')} } else { ${chain(n, 'no')} }\n}`;
        case 'chance':
          return `async function ${ident(n.id)}(c) {\n  if (Math.random() * 100 < ${Number(d.percent) || 0}) { ${chain(n, 'yes')} } else { ${chain(n, 'no')} }\n}`;
        case 'setVar':
          body =
            s('mode') === 'add'
              ? `const current = Number(vars[${lit(s('name'))}] || 0) || 0; vars[${lit(s('name'))}] = String(current + (Number(render(${lit(s('value'))}, c)) || 0));`
              : `vars[${lit(s('name'))}] = render(${lit(s('value'))}, c);`;
          body += ' saveVars();';
          break;
        case 'wait':
          body = `await sleep(${Math.max(0, Number(d.seconds) || 0) * 1000});`;
          break;
        case 'send':
          body = `await sendTo(c, ${lit(s('channel').trim())}, { content: render(${lit(s('text'))}, c) });`;
          break;
        case 'reply':
          body = `await replyTo(c, { content: render(${lit(s('text'))}, c) });`;
          break;
        case 'embed':
          body = `const embed = new EmbedBuilder().setColor(${lit(s('color'))});\n  if (${lit(s('title'))}) embed.setTitle(render(${lit(s('title'))}, c));\n  if (${lit(s('description'))}) embed.setDescription(render(${lit(s('description'))}, c));\n  if (${lit(s('channel').trim())}) await sendTo(c, ${lit(s('channel').trim())}, { embeds: [embed] }); else await replyTo(c, { embeds: [embed] });`;
          break;
        case 'react':
          body = `if (c.message) await c.message.react(${lit(s('emoji').trim())});`;
          break;
        case 'addRole':
          body = `const role = await findRole(c, ${lit(s('role'))}); if (role && c.member) await c.member.roles.add(role); else console.warn('Rolle oder Mitglied nicht gefunden:', ${lit(s('role'))});`;
          break;
        case 'removeRole':
          body = `const role = await findRole(c, ${lit(s('role'))}); if (role && c.member) await c.member.roles.remove(role); else console.warn('Rolle oder Mitglied nicht gefunden:', ${lit(s('role'))});`;
          break;
        case 'kick':
          body = `if (c.member && c.member.kickable) await c.member.kick(render(${lit(s('reason'))}, c)); else console.warn('Mitglied kann nicht gekickt werden.');`;
          break;
        case 'deleteMsg':
          body = `if (c.message && c.message.deletable) await c.message.delete();`;
          break;
        case 'presence':
          body = `client.user.setActivity(render(${lit(s('text'))}, c));`;
          break;
        case 'log':
          body = `console.log(render(${lit(s('text'))}, c));`;
          break;
        default:
          break;
      }
      return `async function ${ident(n.id)}(c) {\n  ${body}\n  ${chain(n)}\n}`;
    });

  const guard = (fn: string): string => `try { ${fn} } catch (err) { console.error('Fehler im Ablauf:', err); }`;
  const readyNodes = nodes.filter((n) => n.type === 'onReady');
  const messageNodes = nodes.filter((n) => n.type === 'onMessage');
  const commandNodes = nodes.filter((n) => n.type === 'onCommand');
  const joinNodes = nodes.filter((n) => n.type === 'onJoin');
  const leaveNodes = nodes.filter((n) => n.type === 'onLeave');
  const timerNodes = nodes.filter((n) => n.type === 'onTimer');

  const commandSpecs = commandNodes.map((n) => {
    const option = String(n.data.option ?? '').trim();
    return {
      name: String(n.data.name),
      description: String(n.data.description).slice(0, 100),
      options: option ? [{ type: 3, name: option, description: option, required: false }] : [],
    };
  });

  const handlers: string[] = [];
  if (messageNodes.length) {
    const calls = messageNodes
      .map((n) => {
        const channel = String(n.data.channel ?? '').trim().toLowerCase().replace(/^#/, '');
        const run = `await ${ident(n.id)}(c);`;
        return channel ? `if (c.channel.toLowerCase() === ${lit(channel)}) { ${run} }` : run;
      })
      .join('\n    ');
    handlers.push(`client.on(Events.MessageCreate, async (message) => {\n  if (message.author.bot || !message.guild) return;\n  const c = fromMessage(message);\n  ${guard(`\n    ${calls}\n  `)}\n});`);
  }
  if (commandNodes.length) {
    const cases = commandNodes.map((n) => `case ${lit(String(n.data.name))}: await ${ident(n.id)}(c); break;`).join('\n      ');
    handlers.push(
      `client.on(Events.InteractionCreate, async (interaction) => {\n  if (!interaction.isChatInputCommand()) return;\n  const c = fromInteraction(interaction);\n  ${guard(`\n    switch (interaction.commandName) {\n      ${cases}\n    }\n    if (!c.replied && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '✔', flags: MessageFlags.Ephemeral });\n  `)}\n});`,
    );
  }
  if (joinNodes.length) {
    handlers.push(`client.on(Events.GuildMemberAdd, async (member) => {\n  const c = fromMember(member);\n  ${guard(`\n    ${joinNodes.map((n) => `await ${ident(n.id)}(c);`).join('\n    ')}\n  `)}\n});`);
  }
  if (leaveNodes.length) {
    handlers.push(`client.on(Events.GuildMemberRemove, async (member) => {\n  const c = fromMember(member);\n  ${guard(`\n    ${leaveNodes.map((n) => `await ${ident(n.id)}(c);`).join('\n    ')}\n  `)}\n});`);
  }

  const timers = timerNodes
    .map((n) => {
      const minutes = Math.max(1, Number(n.data.minutes) || 1);
      return `setInterval(async () => {\n    const guild = client.guilds.cache.first();\n    if (!guild) return;\n    const c = base(guild);\n    c.channelObj = findChannel(guild, ${lit(String(n.data.channel))});\n    c.channel = c.channelObj ? c.channelObj.name : '';\n    ${guard(`await ${ident(n.id)}(c);`)}\n  }, ${minutes * 60000});`;
    })
    .join('\n  ');

  const eventFns = nodes
    .filter((n) => BOT_DEFS[n.type].event)
    .map((n) => `async function ${ident(n.id)}(c) {\n  ${chain(n)}\n}`);

  const intents = ['GatewayIntentBits.Guilds'];
  if (need.messageContent) intents.push('GatewayIntentBits.GuildMessages', 'GatewayIntentBits.MessageContent');
  if (need.members) intents.push('GatewayIntentBits.GuildMembers');

  const ready = `client.once(Events.ClientReady, async () => {
  console.log('Bot online als ' + client.user.tag);
  ${commandSpecs.length ? `await registerCommands();` : ''}
  ${readyNodes.map((n) => guard(`await ${ident(n.id)}(base(client.guilds.cache.first()));`)).join('\n  ')}
  ${timers}
});`;

  const register = commandSpecs.length
    ? `const COMMANDS = ${JSON.stringify(commandSpecs, null, 2)};
async function registerCommands() {
  try {
    if (process.env.GUILD_ID) {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      await guild.commands.set(COMMANDS);
    } else {
      await client.application.commands.set(COMMANDS);
    }
    console.log(COMMANDS.length + ' Slash-Befehle registriert');
  } catch (err) {
    console.error('Slash-Befehle konnten nicht registriert werden:', err.message);
  }
}`
    : '';

  const index = [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "require('dotenv').config({ path: path.join(__dirname, '.env') });",
    "const { Client, Events, GatewayIntentBits, EmbedBuilder, MessageFlags } = require('discord.js');",
    '',
    'if (!process.env.DISCORD_TOKEN) {',
    "  console.error('DISCORD_TOKEN fehlt. Trage den Token in die Datei .env ein.');",
    '  process.exit(1);',
    '}',
    '',
    `const client = new Client({ intents: [${intents.join(', ')}] });`,
    RUNTIME.trim(),
    HELPERS.trim(),
    '',
    ...eventFns,
    ...functions,
    '',
    register,
    ready,
    ...handlers,
    '',
    "client.login(process.env.DISCORD_TOKEN);",
    '',
  ]
    .filter((part) => part !== undefined)
    .join('\n');

  const slug = slugify(name);
  const packageJson = JSON.stringify(
    {
      name: slug,
      version: '1.0.0',
      private: true,
      description: `Discord-Bot „${name}“, erstellt mit Feather`,
      main: 'index.js',
      scripts: { start: 'node index.js' },
      engines: { node: '>=18' },
      dependencies: { 'discord.js': '^14.16.0', dotenv: '^16.4.5' },
    },
    null,
    2,
  );

  const envExample = ['DISCORD_TOKEN=', 'GUILD_ID=', ''].join('\n');

  const run = `#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Installiere Node.js 18 oder neuer."
  exit 1
fi
npm install --omit=dev || exit 1
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete ${lit(slug)} >/dev/null 2>&1
  pm2 start index.js --name ${lit(slug)} && pm2 save
else
  if [ -f bot.pid ] && kill -0 "$(cat bot.pid)" 2>/dev/null; then kill "$(cat bot.pid)"; fi
  nohup node index.js > bot.log 2>&1 &
  echo $! > bot.pid
  echo "Bot gestartet, Protokoll in bot.log"
fi
`;

  const stop = `#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v pm2 >/dev/null 2>&1 && pm2 describe ${lit(slug)} >/dev/null 2>&1; then
  pm2 stop ${lit(slug)}
elif [ -f bot.pid ]; then
  kill "$(cat bot.pid)" 2>/dev/null
  rm -f bot.pid
  echo "Bot gestoppt"
else
  echo "Der Bot läuft nicht."
fi
`;

  return { 'index.js': index, 'package.json': packageJson, '.env.example': envExample, 'run.sh': run, 'stop.sh': stop };
}

interface Template {
  id: string;
  name: string;
  description: string;
  build: () => BotProject;
}

function chainOf(items: { id: string; kind: BotKind; data?: BotData; handle?: string; from?: string }[]): BotProject {
  const nodes: BotNode[] = [];
  const edges: BotEdge[] = [];
  items.forEach((item, i) => {
    nodes.push({ id: item.id, type: item.kind, position: { x: 40 + i * 330, y: 60 }, data: { ...BOT_DEFS[item.kind].defaults, ...item.data } });
  });
  return { nodes, edges };
}

function link(project: BotProject, from: string, to: string, handle = 'out'): void {
  project.edges.push({ id: `e_${from}_${handle}_${to}`, source: from, sourceHandle: handle, target: to });
}

export const BOT_TEMPLATES: Template[] = [
  {
    id: 'empty',
    name: 'Leer',
    description: 'Eine leere Arbeitsfläche.',
    build: () => ({ nodes: [], edges: [] }),
  },
  {
    id: 'ping',
    name: 'Ping und Hilfe',
    description: 'Der Befehl /ping antwortet mit Pong, „!hilfe“ im Chat zeigt eine Hilfe.',
    build: () => {
      const p = chainOf([
        { id: 'a1', kind: 'onCommand', data: { name: 'ping', description: 'Antwortet mit Pong', option: '' } },
        { id: 'a2', kind: 'reply', data: { text: 'Pong! 🏓' } },
      ]);
      const more = chainOf([
        { id: 'b1', kind: 'onMessage', data: { channel: '' } },
        { id: 'b2', kind: 'ifText', data: { left: '{content}', op: 'equals', right: '!hilfe' } },
        { id: 'b3', kind: 'embed', data: { channel: '', title: 'Hilfe', description: 'Mit /ping prüfst du, ob ich online bin.', color: '#5865f2' } },
      ]);
      for (const n of more.nodes) n.position.y = 340;
      p.nodes.push(...more.nodes);
      link(p, 'a1', 'a2');
      link(p, 'b1', 'b2');
      link(p, 'b2', 'b3', 'yes');
      return p;
    },
  },
  {
    id: 'welcome',
    name: 'Willkommen und Rolle',
    description: 'Begrüßt neue Mitglieder im Kanal „willkommen“ und gibt ihnen eine Rolle.',
    build: () => {
      const p = chainOf([
        { id: 'w1', kind: 'onJoin' },
        { id: 'w2', kind: 'send', data: { channel: 'willkommen', text: 'Willkommen auf {server}, {user}! Du bist Mitglied Nummer {members}.' } },
        { id: 'w3', kind: 'addRole', data: { role: 'Mitglied' } },
      ]);
      link(p, 'w1', 'w2');
      link(p, 'w2', 'w3');
      return p;
    },
  },
  {
    id: 'counter',
    name: 'Zähler und Zufall',
    description: '„!würfel“ würfelt eine Zahl, „!zähle“ zählt hoch und merkt sich den Stand.',
    build: () => {
      const p = chainOf([
        { id: 'c1', kind: 'onMessage', data: { channel: '' } },
        { id: 'c2', kind: 'ifText', data: { left: '{content}', op: 'equals', right: '!würfel' } },
        { id: 'c3', kind: 'reply', data: { text: '🎲 Du hast eine {random:1-6} gewürfelt.' } },
      ]);
      const count = chainOf([
        { id: 'd2', kind: 'ifText', data: { left: '{content}', op: 'equals', right: '!zähle' } },
        { id: 'd3', kind: 'setVar', data: { name: 'zaehler', mode: 'add', value: '1' } },
        { id: 'd4', kind: 'reply', data: { text: 'Bisher wurde {var.zaehler} Mal gezählt.' } },
      ]);
      for (const n of count.nodes) n.position.y = 340;
      p.nodes.push(...count.nodes);
      link(p, 'c1', 'c2');
      link(p, 'c2', 'c3', 'yes');
      link(p, 'c2', 'd2', 'no');
      link(p, 'd2', 'd3', 'yes');
      link(p, 'd3', 'd4');
      count.nodes[0]!.position = { x: 370, y: 340 };
      count.nodes[1]!.position = { x: 700, y: 340 };
      count.nodes[2]!.position = { x: 1030, y: 340 };
      return p;
    },
  },
];
