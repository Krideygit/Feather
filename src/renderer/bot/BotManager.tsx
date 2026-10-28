import { Copy, MessageCircle, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BOT_TEMPLATES, validateBot } from '../../shared/bot';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { Field } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { createBot, deleteBot, duplicateBot, loadProject, renameBot, useBots, type BotEntry } from '../lib/bots';
import { openBotDeploy } from './BotDeploy';
import { openBotEditor } from './BotEditor';

export function openBotManager(): void {
  openLayer((close) => <Manager onClose={close} />);
}

function CreateForm({ onCreated, onCancel }: { onCreated: (entry: BotEntry) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('ping');

  function submit(): void {
    if (!name.trim()) return void toast('Bitte gib dem Bot einen Namen.', 'error');
    const entry = createBot(name, template);
    if (!entry) return void toast('Der Bot konnte nicht gespeichert werden. Der Speicher ist voll.', 'error');
    onCreated(entry);
  }

  return (
    <div className="space-y-4 animate-fade-in" data-bot-create>
      <Field label="Name des Bots">
        <input className="input" value={name} maxLength={40} placeholder="z. B. Willkommens-Bot" autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} data-bind="bot-new-name" />
      </Field>
      <div>
        <p className="label">Startpunkt</p>
        <div className="grid gap-2">
          {BOT_TEMPLATES.map((t) => (
            <button key={t.id} type="button" className={`rounded-xl border p-3 text-left transition-colors ${template === t.id ? 'border-primary bg-primary/10' : 'border-neutral-800 hover:bg-neutral-800/60'}`} onClick={() => setTemplate(t.id)} data-bot-new-template={t.id}>
              <p className="text-sm font-medium text-neutral-100">{t.name}</p>
              <p className="text-xs text-neutral-500">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onCancel}>Abbrechen</button>
        <button className="btn btn-primary" onClick={submit} data-action="bot-create">Erstellen und öffnen</button>
      </div>
    </div>
  );
}

function Manager({ onClose }: { onClose: () => void }) {
  const bots = useBots();
  const [creating, setCreating] = useState(bots.length === 0);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);

  const open = (id: string): void => {
    onClose();
    openBotEditor(id);
  };

  async function remove(bot: BotEntry): Promise<void> {
    const ok = await confirmDialog({ title: `„${bot.name}“ löschen?`, message: 'Der Bot und alle seine Knoten werden entfernt. Ein bereits auf einem Server laufender Bot bleibt unberührt.', confirmLabel: 'Löschen', danger: true });
    if (ok) deleteBot(bot.id);
  }

  function rename(bot: BotEntry): void {
    openLayer((close) => <RenameDialog bot={bot} onClose={close} />);
  }

  return (
    <Modal
      title="Discord-Bots"
      subtitle="Baue Bots aus Knoten, teste sie lokal und stelle sie auf einem Server bereit."
      size="max-w-2xl"
      onClose={onClose}
      footer={
        creating ? undefined : (
          <button className="btn btn-primary" onClick={() => setCreating(true)} data-action="bot-new">
            <Plus className="size-4" />
            Neuer Bot
          </button>
        )
      }
    >
      {creating ? (
        <CreateForm
          onCancel={() => (bots.length ? setCreating(false) : onClose())}
          onCreated={(entry) => {
            onClose();
            openBotEditor(entry.id);
          }}
        />
      ) : (
        <div className="space-y-2">
          {bots.map((bot) => {
            const project = loadProject(bot.id);
            const errors = validateBot(project).filter((p) => p.level === 'error').length;
            return (
              <div key={bot.id} className="card card-hover flex items-center gap-3 p-3" data-bot={bot.name} onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  entries: [
                    { kind: 'action', label: 'Öffnen', icon: MessageCircle, onSelect: () => open(bot.id) },
                    { kind: 'action', label: 'Umbenennen …', icon: Pencil, onSelect: () => rename(bot) },
                    { kind: 'action', label: 'Duplizieren', icon: Copy, onSelect: () => void duplicateBot(bot.id) },
                    { kind: 'separator' },
                    { kind: 'action', label: 'Löschen', icon: Trash2, danger: true, onSelect: () => void remove(bot) },
                  ],
                });
              }}>
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => open(bot.id)} data-action="bot-open">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#5865f2]/15 text-[#8c96ff]"><MessageCircle className="size-5" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-100">{bot.name}</span>
                    <span className="block text-xs text-neutral-500">
                      {project.nodes.filter((n) => n.type !== 'note').length} Knoten · {errors ? `${errors} Fehler` : 'bereit'} · {new Date(bot.updated).toLocaleDateString('de-DE')}
                    </span>
                  </span>
                </button>
                <button className="btn btn-outline btn-sm" disabled={errors > 0} title={errors ? 'Behebe zuerst die Fehler im Editor' : 'Auf einen Server laden'} onClick={() => openBotDeploy(project, bot.name)}>
                  <Rocket className="size-3.5" />
                  Bereitstellen
                </button>
                <button className="btn btn-ghost btn-icon btn-sm text-neutral-500 hover:text-red-400" aria-label={`${bot.name} löschen`} onClick={() => void remove(bot)}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}
    </Modal>
  );
}

function RenameDialog({ bot, onClose }: { bot: BotEntry; onClose: () => void }) {
  const [name, setName] = useState(bot.name);
  return (
    <Modal
      title="Bot umbenennen"
      size="max-w-sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              renameBot(bot.id, name);
              onClose();
            }}
          >
            Speichern
          </button>
        </>
      }
    >
      <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
    </Modal>
  );
}
