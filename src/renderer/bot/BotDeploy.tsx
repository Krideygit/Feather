import { CircleCheck, ExternalLink, Loader2, Rocket } from 'lucide-react';
import { useState } from 'react';
import { generateBot, requirements, slugify, type BotProject } from '../../shared/bot';
import { Notice } from '../components/Bits';
import { Field, PasswordInput, Toggle } from '../components/Form';
import { Modal, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { callRemote, sendToTerminal, useRemote, type SessionView } from '../lib/remote';
import { saveShortcut } from '../lib/shortcuts';

const TOKEN = /^[A-Za-z0-9._-]{20,200}$/;
const GUILD = /^\d{5,25}$/;

export function openBotDeploy(project: BotProject, name: string): void {
  openLayer((close) => <Deploy project={project} name={name} onClose={close} />);
}

const hostKey = (s: SessionView): string => (s.hostId ? `host:${s.hostId}` : `adhoc:${s.username}@${s.host}:${s.port}`);

async function ensureDir(sid: string, dir: string): Promise<void> {
  const parts = dir.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    try {
      await callRemote('fs.mkdir', { sid, path: current });
    } catch {
      continue;
    }
  }
}

function Deploy({ project, name, onClose }: { project: BotProject; name: string; onClose: () => void }) {
  const sessions = useRemote((s) => s.sessions).filter((s) => s.terminal && s.status === 'ready');
  const [sid, setSid] = useState(sessions[0]?.sid ?? '');
  const session = sessions.find((s) => s.sid === sid);
  const slug = slugify(name);
  const [folder, setFolder] = useState('');
  const [token, setToken] = useState('');
  const [guild, setGuild] = useState('');
  const [start, setStart] = useState(true);
  const [shortcuts, setShortcuts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const need = requirements(project);
  const home = (session?.home ?? '').replace(/\/+$/, '');
  const target = (folder.trim() || `${home}/feather-bots/${slug}`).replace(/\/+$/, '');

  async function deploy(): Promise<void> {
    if (!session) return void toast('Verbinde dich zuerst im Bereich Terminal mit einem Server.', 'error');
    if (token && !TOKEN.test(token.trim())) return void toast('Der Token sieht nicht richtig aus. Kopiere ihn vollständig aus dem Developer Portal.', 'error');
    if (guild && !GUILD.test(guild.trim())) return void toast('Die Server-ID besteht nur aus Ziffern.', 'error');
    if (!target.startsWith('/')) return void toast('Der Ordner muss ein absoluter Pfad sein.', 'error');
    setBusy(true);
    try {
      await ensureDir(sid, target);
      const files = generateBot(project, name);
      for (const file of ['index.js', 'package.json', 'run.sh', 'stop.sh']) {
        await callRemote('fs.write', { sid, path: `${target}/${file}`, text: files[file] ?? '' });
      }
      await callRemote('fs.chmod', { sid, path: `${target}/run.sh`, mode: 0o755 });
      await callRemote('fs.chmod', { sid, path: `${target}/stop.sh`, mode: 0o755 });
      const existing = await callRemote<string[]>('fs.exists', { sid, dir: target, names: ['.env'] });
      const hasEnv = existing.includes('.env');
      if (token.trim() || !hasEnv) {
        const env = `DISCORD_TOKEN=${token.trim()}\nGUILD_ID=${guild.trim()}\n`;
        await callRemote('fs.write', { sid, path: `${target}/.env`, text: env });
        await callRemote('fs.chmod', { sid, path: `${target}/.env`, mode: 0o600 });
      }
      if (shortcuts) {
        const scope = { scope: 'host' as const, host: hostKey(session), confirm: false };
        saveShortcut({ ...scope, label: `${name} starten`, command: `sh "${target}/run.sh"`, icon: 'rocket|#34d399' });
        saveShortcut({ ...scope, label: `${name} stoppen`, command: `sh "${target}/stop.sh"`, icon: 'rocket|#f87171', confirm: true });
        saveShortcut({ ...scope, label: `${name} Protokoll`, command: `tail -n 50 -f "${target}/bot.log"`, icon: 'book|#a78bfa' });
      }
      const ready = token.trim() || hasEnv;
      if (start && ready) sendToTerminal(sid, `\u0015sh "${target}/run.sh"\r`);
      setDone(ready ? (start ? 'Der Bot wurde hochgeladen und wird im Terminal gestartet. Die Ausgabe siehst du dort.' : 'Der Bot wurde hochgeladen.') : `Der Bot wurde hochgeladen. Trage den Token in ${target}/.env ein und starte ihn dann mit „sh run.sh“.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Bot auf einen Server bereitstellen"
      subtitle={`„${name}“ wird als Node.js-Programm hochgeladen und läuft dort dauerhaft.`}
      size="max-w-xl"
      onClose={onClose}
      footer={
        done ? (
          <button className="btn btn-primary" onClick={onClose} data-action="bot-deploy-close">Fertig</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" disabled={busy || !session} onClick={() => void deploy()} data-action="bot-deploy-run">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {busy ? 'Wird hochgeladen …' : 'Hochladen'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100" data-bot-deployed>
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-300" />
          <p>{done}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <Notice tone="warn">Es ist keine SSH-Verbindung offen. Verbinde dich im Bereich <strong>Terminal</strong> mit deinem Server und öffne diesen Dialog dann erneut.</Notice>
          ) : (
            <>
              <Field label="Server">
                <select className="input" value={sid} onChange={(e) => setSid(e.target.value)} data-bind="bot-deploy-session">
                  {sessions.map((s) => (
                    <option key={s.sid} value={s.sid}>{s.name} ({s.username}@{s.host})</option>
                  ))}
                </select>
              </Field>
              <Field label="Ordner auf dem Server" hint="Feather legt ihn an und lädt index.js, package.json und zwei Skripte hinein.">
                <input className="input font-mono" value={folder} placeholder={`${home}/feather-bots/${slug}`} spellCheck={false} onChange={(e) => setFolder(e.target.value)} data-bind="bot-deploy-folder" />
              </Field>
              <Field label="Bot-Token" hint="Du findest ihn im Discord Developer Portal unter Bot › Token. Feather speichert ihn nicht, er landet nur in der Datei .env auf dem Server (nur für den Besitzer lesbar). Leer lassen, um einen vorhandenen Token zu behalten.">
                <PasswordInput value={token} onChange={setToken} placeholder="MTIz…" data-bind="bot-deploy-token" />
              </Field>
              {need.permissions.some((p) => p.includes('Slash')) && (
                <Field label="Server-ID (optional)" hint="Mit Server-ID erscheinen Slash-Befehle sofort. Ohne dauert es bis zu einer Stunde.">
                  <input className="input font-mono" value={guild} placeholder="123456789012345678" spellCheck={false} onChange={(e) => setGuild(e.target.value)} />
                </Field>
              )}
              <div className="space-y-3">
                <Toggle checked={start} onChange={setStart} label="Nach dem Hochladen starten" description="Installiert die Pakete mit npm und startet den Bot im Terminal. Benötigt Node.js 18 oder neuer auf dem Server." />
                <Toggle checked={shortcuts} onChange={setShortcuts} label="Shortcuts anlegen" description="Buttons rechts am Terminal zum Starten, Stoppen und für das Protokoll." />
              </div>
            </>
          )}
          <div className="space-y-1.5 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-400">
            <p className="font-medium text-neutral-200">Vor dem ersten Start im Developer Portal</p>
            <p>
              Lege eine Anwendung mit einem Bot an
              <button type="button" className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => void window.feather.openExternal('https://discord.com/developers/applications')}>
                discord.com/developers
                <ExternalLink className="size-3" />
              </button>
              und lade ihn über OAuth2 auf deinen Server ein.
            </p>
            {need.messageContent && <p>Aktiviere unter Bot den Schalter <strong>Message Content Intent</strong>, sonst kann der Bot Nachrichten nicht lesen.</p>}
            {need.members && <p>Aktiviere unter Bot den Schalter <strong>Server Members Intent</strong>, damit der Bot Beitritte und Austritte sieht.</p>}
            <p>Rechte des Bots: {need.permissions.join(', ')}.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
