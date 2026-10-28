import { ArrowDown, ArrowUp, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { Field, Toggle } from '../components/Form';
import { confirmDialog, Modal, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { commandPayload, deleteShortcut, moveShortcut, saveShortcut, SHORTCUT_TEMPLATES, useShortcuts, type Shortcut } from '../lib/shortcuts';
import { sendToTerminal, terminalFor } from '../lib/remote';
import { CustomIcon, FOLDER_COLORS, FOLDER_ICONS, parseIcon } from './FolderIcon';

interface EditorProps {
  initial: Shortcut | null;
  host: string;
  onClose: () => void;
}

function ShortcutEditor({ initial, host, onClose }: EditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'terminal|#38bdf8');
  const [confirm, setConfirm] = useState(initial?.confirm ?? false);
  const [scope, setScope] = useState<'all' | 'host'>(initial?.scope ?? 'all');
  const parsed = parseIcon(icon);
  const symbol = parsed?.kind === 'symbol' ? icon.split('|')[0] ?? 'terminal' : 'terminal';
  const color = parsed?.color ?? FOLDER_COLORS[0] ?? '#38bdf8';

  function submit(): void {
    if (!label.trim()) return void toast('Gib dem Shortcut einen Namen.', 'error');
    if (!command.trim()) return void toast('Gib einen Befehl ein.', 'error');
    const ok = saveShortcut({ id: initial?.id, label: label.trim(), command, icon, confirm, scope, host: scope === 'host' ? host : '' });
    if (!ok) return void toast('Der Shortcut konnte nicht gespeichert werden.', 'error');
    onClose();
  }

  return (
    <Modal
      title={initial ? 'Shortcut bearbeiten' : 'Neuer Shortcut'}
      subtitle="Ein Klick auf den Button schickt den Befehl an das Terminal."
      size="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={submit} data-action="shortcut-save">Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        {!initial && (
          <div>
            <p className="label">Vorlagen</p>
            <div className="flex flex-wrap gap-1.5">
              {SHORTCUT_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-primary hover:text-primary"
                  onClick={() => {
                    setLabel(t.label);
                    setCommand(t.command);
                    setIcon(t.icon);
                    setConfirm(t.confirm);
                  }}
                  data-template={t.label}
                >
                  <CustomIcon value={t.icon} className="size-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Name">
          <input className="input" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="Minecraft starten" data-bind="shortcut-label" />
        </Field>
        <Field label="Befehl" hint="Mehrere Zeilen werden nacheinander ausgeführt. Eine halb getippte Eingabe im Terminal wird vorher gelöscht.">
          <textarea className="input font-mono min-h-[84px] resize-y py-2" value={command} spellCheck={false} onChange={(e) => setCommand(e.target.value)} placeholder="cd ~/minecraft && ./start.sh" data-bind="shortcut-command" />
        </Field>
        <div>
          <p className="label">Symbol</p>
          <div className="grid grid-cols-10 gap-1.5" role="listbox" aria-label="Symbole">
            {Object.entries(FOLDER_ICONS).map(([id, { label: name, Icon }]) => (
              <button
                key={id}
                type="button"
                title={name}
                aria-label={name}
                aria-selected={symbol === id}
                className={`grid size-8 place-items-center rounded-lg border transition-colors ${symbol === id ? 'border-primary bg-primary/15' : 'border-neutral-800 hover:bg-neutral-800'}`}
                onClick={() => setIcon(`${id}|${color}`)}
              >
                <Icon className="size-4" style={{ color: symbol === id ? color : undefined }} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} className={`size-6 rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-neutral-100' : 'border-transparent'}`} style={{ background: c }} onClick={() => setIcon(`${symbol}|${c}`)} />
            ))}
          </div>
        </div>
        <Toggle checked={confirm} onChange={setConfirm} label="Vor dem Ausführen nachfragen" description="Sinnvoll für Befehle, die etwas stoppen oder löschen." />
        <Toggle checked={scope === 'host'} onChange={(v) => setScope(v ? 'host' : 'all')} label="Nur für diesen Server" description="Aus: der Button erscheint bei allen Verbindungen." />
      </div>
    </Modal>
  );
}

function openEditor(initial: Shortcut | null, host: string): void {
  openLayer((close) => <ShortcutEditor initial={initial} host={host} onClose={close} />);
}

async function run(sid: string, item: Shortcut): Promise<void> {
  if (item.confirm) {
    const ok = await confirmDialog({ title: item.label, message: item.command, confirmLabel: 'Ausführen' });
    if (!ok) {
      terminalFor(sid).term.focus();
      return;
    }
  }
  sendToTerminal(sid, commandPayload(item.command));
  terminalFor(sid).term.focus();
}

export function ShortcutRail({ sid, host, disabled }: { sid: string; host: string; disabled: boolean }) {
  const items = useShortcuts(host);
  const [menu, setMenu] = useState<{ x: number; y: number; item: Shortcut } | null>(null);

  const entries = (item: Shortcut): MenuEntry[] => [
    { kind: 'action', label: 'Ausführen', icon: Play, disabled, onSelect: () => void run(sid, item) },
    { kind: 'action', label: 'Bearbeiten …', icon: Pencil, onSelect: () => openEditor(item, host) },
    { kind: 'action', label: 'Nach oben', icon: ArrowUp, onSelect: () => moveShortcut(item.id, -1) },
    { kind: 'action', label: 'Nach unten', icon: ArrowDown, onSelect: () => moveShortcut(item.id, 1) },
    { kind: 'separator' },
    { kind: 'action', label: 'Löschen', icon: Trash2, danger: true, onSelect: () => deleteShortcut(item.id) },
  ];

  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-l border-neutral-800 bg-neutral-900/60 py-2" data-shortcut-rail>
      {items.map((item) => (
        <button
          key={item.id}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-transparent text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40"
          title={`${item.label}\n${item.command.split('\n')[0]}`}
          aria-label={item.label}
          disabled={disabled}
          onClick={() => void run(sid, item)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, item });
          }}
          data-shortcut={item.label}
        >
          <CustomIcon value={item.icon} className="size-[18px]" />
        </button>
      ))}
      <button
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-dashed border-neutral-700 text-neutral-500 transition-colors hover:border-primary hover:text-primary"
        title="Shortcut hinzufügen"
        aria-label="Shortcut hinzufügen"
        onClick={() => openEditor(null, host)}
        data-action="shortcut-add"
      >
        <Plus className="size-4" />
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={entries(menu.item)}
          onClose={() => {
            setMenu(null);
            requestAnimationFrame(() => terminalFor(sid).term.focus());
          }}
        />
      )}
    </div>
  );
}
