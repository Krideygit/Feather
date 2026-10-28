const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feather-bot-'));
const out = path.join(work, 'bot.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src', 'shared', 'bot.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'error' });
const bot = require(out);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('ok  ', name);
}

const user = { id: '42', name: 'Mira', roles: ['Mitglied'] };
const state = () => ({ vars: {}, members: 12, server: 'Testserver' });
const template = (id) => bot.BOT_TEMPLATES.find((t) => t.id === id).build();
const msg = (content, channel = 'allgemein', u = user) => ({ type: 'message', user: u, channel, content });

function fakeDiscord(dir) {
  const modules = path.join(dir, 'node_modules');
  fs.mkdirSync(path.join(modules, 'discord.js'), { recursive: true });
  fs.mkdirSync(path.join(modules, 'dotenv'), { recursive: true });
  fs.writeFileSync(path.join(modules, 'dotenv', 'index.js'), 'module.exports = { config() {} };');
  fs.writeFileSync(
    path.join(modules, 'discord.js', 'index.js'),
    `
const handlers = {};
class Embed { constructor() { this.data = {}; } setColor(c) { this.data.color = c; return this; } setTitle(t) { this.data.title = t; return this; } setDescription(d) { this.data.description = d; return this; } }
class Client {
  constructor(opts) { this.opts = opts; this.user = { id: '999', username: 'TestBot', tag: 'TestBot#0001', setActivity(t) { global.__activity = t; } }; this.guilds = { cache: { first: () => global.__guild, get: () => global.__guild }, fetch: async () => global.__guild }; this.application = { commands: { set: async (c) => { global.__commands = c; } } }; global.__client = this; }
  on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); }
  once(name, fn) { (handlers[name] = handlers[name] || []).push(fn); }
  async login(token) { global.__token = token; }
}
module.exports = { Client, EmbedBuilder: Embed, MessageFlags: { Ephemeral: 64 }, Events: { ClientReady: 'ready', MessageCreate: 'messageCreate', InteractionCreate: 'interactionCreate', GuildMemberAdd: 'guildMemberAdd', GuildMemberRemove: 'guildMemberRemove' }, GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, GuildMembers: 8 }, __handlers: handlers };
`,
  );
}

function loadGenerated(project, name) {
  const dir = fs.mkdtempSync(path.join(work, 'gen-'));
  fakeDiscord(dir);
  const files = bot.generateBot(project, name);
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), content);
  process.env.DISCORD_TOKEN = 'test-token';
  const sent = [];
  const channel = (n) => ({ name: n, isTextBased: () => true, send: async (p) => void sent.push({ channel: n, ...p }) });
  const channels = [channel('allgemein'), channel('willkommen')];
  const roles = [{ name: 'Mitglied', id: 'r1' }];
  global.__guild = {
    name: 'Testserver',
    memberCount: 12,
    systemChannel: channels[1],
    channels: { cache: { find: (fn) => channels.find(fn) } },
    roles: { cache: { find: (fn) => roles.find(fn) } },
    commands: { set: async (c) => void (global.__commands = c) },
  };
  const entry = path.join(dir, 'index.js');
  delete require.cache[entry];
  const discord = require(path.join(dir, 'node_modules', 'discord.js'));
  require(entry);
  return { dir, files, sent, channels, roles, handlers: discord.__handlers, client: global.__client };
}

(async () => {
  await test('Vorlagen sind gültig und vollständig verbunden', () => {
    for (const t of bot.BOT_TEMPLATES) {
      const problems = bot.validateBot(t.build()).filter((p) => p.level === 'error' && p.nodeId !== '');
      assert.deepEqual(problems, [], t.id);
    }
    assert.equal(bot.validateBot({ nodes: [], edges: [] })[0].level, 'error');
  });

  await test('Prüfung findet falsche Eingaben und lose Knoten', () => {
    const p = template('ping');
    p.nodes.find((n) => n.id === 'a1').data.name = 'Falsch Name';
    p.nodes.find((n) => n.id === 'a2').data.text = '  ';
    p.nodes.push(bot.newBotNode('send', 'lose', { x: 0, y: 0 }));
    const found = bot.validateBot(p);
    assert.ok(found.some((x) => x.nodeId === 'a1' && x.level === 'error'));
    assert.ok(found.some((x) => x.nodeId === 'a2' && x.level === 'error'));
    assert.ok(found.some((x) => x.nodeId === 'lose' && x.level === 'warn'));
    const dup = template('ping');
    dup.nodes.push({ ...bot.newBotNode('onCommand', 'zwei', { x: 0, y: 0 }) });
    assert.ok(bot.validateBot(dup).some((x) => x.nodeId === 'zwei' && /schon/.test(x.message)));
  });

  await test('Platzhalter werden ersetzt', () => {
    const ctx = { userId: '42', username: 'Mira', roles: [], channel: 'chat', server: 'S', content: '!say hallo welt', option: 'x', members: 3 };
    const vars = { punkte: '7' };
    assert.equal(bot.render('{user} {username} {userid} {channel} {server} {members}', ctx, vars), '<@42> Mira 42 chat S 3');
    assert.equal(bot.render('{arg1}|{arg2}|{rest}|{args}|{arg9}', ctx, vars), '!say|hallo|hallo welt|!say hallo welt|');
    assert.equal(bot.render('{var.punkte} {var.leer} {unbekannt} {random:5-5}', ctx, vars), '7  {unbekannt} 5');
  });

  await test('Simulation: Befehl, Bedingung und Variable', () => {
    const p = template('ping');
    const cmd = bot.simulate(p, { type: 'command', user, channel: 'allgemein', command: 'ping' }, state());
    assert.deepEqual(cmd.outputs.map((o) => [o.kind, o.text]), [['reply', 'Pong! 🏓']]);
    const help = bot.simulate(p, msg('!hilfe'), state());
    assert.equal(help.outputs[0].kind, 'embed');
    assert.equal(help.outputs[0].title, 'Hilfe');
    assert.equal(bot.simulate(p, msg('guten tag'), state()).outputs.length, 0);
    const c = template('counter');
    const s = state();
    bot.simulate(c, msg('!zähle'), s);
    const second = bot.simulate(c, msg('!zähle'), s);
    assert.equal(second.outputs.at(-1).text, 'Bisher wurde 2 Mal gezählt.');
    const dice = bot.simulate(c, msg('!würfel'), s, () => 0.999);
    assert.match(dice.outputs[0].text, /eine 6 gewürfelt/);
  });

  await test('Simulation: Beitritt, Rollen und Kanalfilter', () => {
    const w = template('welcome');
    const res = bot.simulate(w, { type: 'join', user: { id: '7', name: 'Neu', roles: [] }, channel: 'willkommen' }, state());
    assert.equal(res.outputs[0].channel, 'willkommen');
    assert.equal(res.outputs[0].text, 'Willkommen auf Testserver, <@7>! Du bist Mitglied Nummer 12.');
    assert.deepEqual(res.roles, ['Mitglied']);
    const filtered = { nodes: [{ ...bot.newBotNode('onMessage', 'm', { x: 0, y: 0 }), data: { channel: 'befehle' } }, bot.newBotNode('reply', 'r', { x: 0, y: 0 })], edges: [{ id: 'e', source: 'm', sourceHandle: 'out', target: 'r' }] };
    assert.equal(bot.simulate(filtered, msg('x', 'allgemein'), state()).outputs.length, 0);
    assert.equal(bot.simulate(filtered, msg('x', 'befehle'), state()).outputs.length, 1);
  });

  await test('Simulation bricht Endlosschleifen ab', () => {
    const p = { nodes: [bot.newBotNode('onReady', 'a', { x: 0, y: 0 }), bot.newBotNode('log', 'b', { x: 0, y: 0 })], edges: [{ id: '1', source: 'a', target: 'b' }, { id: '2', source: 'b', target: 'b' }] };
    const res = bot.simulate(p, { type: 'ready' }, state());
    assert.ok(res.outputs.length <= 400);
  });

  await test('Erzeugter Code ist gültiges JavaScript', () => {
    for (const t of bot.BOT_TEMPLATES.filter((x) => x.id !== 'empty')) {
      const files = bot.generateBot(t.build(), t.name);
      const file = path.join(work, `${t.id}.js`);
      fs.writeFileSync(file, files['index.js']);
      execFileSync(process.execPath, ['--check', file]);
      assert.equal(JSON.parse(files['package.json']).dependencies['discord.js'].startsWith('^14'), true);
      assert.match(files['run.sh'], /^#!\/bin\/sh/);
    }
  });

  await test('Erzeugter Bot antwortet wie die Simulation', async () => {
    const run = loadGenerated(template('ping'), 'Test Bot');
    assert.equal(global.__token, 'test-token');
    assert.equal(run.client.opts.intents.length, 4 - 1);
    for (const fn of run.handlers.ready) await fn();
    assert.deepEqual(global.__commands.map((c) => c.name), ['ping']);
    const replies = [];
    const message = { author: { bot: false, id: '42', username: 'Mira' }, guild: global.__guild, member: { roles: { cache: { map: (f) => [{ name: 'Mitglied' }].map(f) } } }, channel: run.channels[0], content: '!hilfe', reply: async (p) => void replies.push(p) };
    for (const fn of run.handlers.messageCreate) await fn(message);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].embeds[0].data.title, 'Hilfe');
    const answers = [];
    const interaction = { isChatInputCommand: () => true, commandName: 'ping', user: { id: '42', username: 'Mira' }, guild: global.__guild, member: null, channel: run.channels[0], options: { data: [] }, replied: false, deferred: false, reply: async (p) => { interaction.replied = true; answers.push(p); } };
    for (const fn of run.handlers.interactionCreate) await fn(interaction);
    assert.deepEqual(answers.map((a) => a.content), ['Pong! 🏓']);
    const bots = { ...message, author: { bot: true } };
    replies.length = 0;
    for (const fn of run.handlers.messageCreate) await fn(bots);
    assert.equal(replies.length, 0);
  });

  await test('Erzeugter Bot begrüßt, vergibt Rollen und merkt sich Variablen', async () => {
    const welcome = loadGenerated(template('welcome'), 'Willkommen');
    const added = [];
    const member = { id: '7', user: { username: 'Neu' }, guild: global.__guild, roles: { cache: { map: () => [] }, add: async (r) => void added.push(r.name) } };
    for (const fn of welcome.handlers.guildMemberAdd) await fn(member);
    assert.equal(welcome.sent[0].channel, 'willkommen');
    assert.equal(welcome.sent[0].content, 'Willkommen auf Testserver, <@7>! Du bist Mitglied Nummer 12.');
    assert.deepEqual(added, ['Mitglied']);
    assert.equal(welcome.client.opts.intents.includes(8), true);

    const counter = loadGenerated(template('counter'), 'Zaehler');
    const replies = [];
    const message = (content) => ({ author: { bot: false, id: '42', username: 'Mira' }, guild: global.__guild, member: null, channel: counter.channels[0], content, reply: async (p) => void replies.push(p.content) });
    for (let i = 0; i < 2; i++) for (const fn of counter.handlers.messageCreate) await fn(message('!zähle'));
    assert.equal(replies.at(-1), 'Bisher wurde 2 Mal gezählt.');
    assert.equal(JSON.parse(fs.readFileSync(path.join(counter.dir, 'data.json'), 'utf8')).zaehler, '2');
  });

  await test('Anforderungen nennen Berechtigungen und Intents', () => {
    const need = bot.requirements(template('welcome'));
    assert.equal(need.members, true);
    assert.equal(need.messageContent, false);
    assert.ok(need.permissions.includes('Rollen verwalten'));
    assert.equal(bot.requirements(template('ping')).messageContent, true);
    assert.equal(bot.slugify('Mein Bot Ü!'), 'mein-bot');
  });

  console.log(`\n${passed} Bot-Tests bestanden`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
