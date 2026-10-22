import { FileText, Loader2, Save, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { FileContent } from '../../shared/remote';
import { confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { attemptRemote, callRemote } from '../lib/remote';
import { formatBytes } from '../lib/format';

interface Props {
  sid: string;
  path: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditorDialog({ sid, path, onClose, onSaved }: Props) {
  const [loaded, setLoaded] = useState<{ original: string; crlf: boolean; size: number } | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [closing, setClosing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const gutter = useRef<HTMLDivElement>(null);
  const dirty = loaded !== null && text !== loaded.original;

  useEffect(() => {
    let cancelled = false;
    void callRemote<FileContent>('fs.read', { sid, path }).then(
      (content) => {
        if (cancelled) return;
        const crlf = content.text.includes('\r\n');
        const normalized = crlf ? content.text.replace(/\r\n/g, '\n') : content.text;
        setLoaded({ original: normalized, crlf, size: content.size });
        setText(normalized);
        requestAnimationFrame(() => area.current?.focus());
      },
      (err: Error) => {
        toast(err.message, 'error');
        closeRef.current();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sid, path]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!loaded || saving) return false;
    setSaving(true);
    const data = loaded.crlf ? text.replace(/\n/g, '\r\n') : text;
    const ok = await attemptRemote(callRemote('fs.write', { sid, path, text: data }).then(() => true));
    setSaving(false);
    if (!ok) return false;
    setLoaded({ ...loaded, original: text, size: new TextEncoder().encode(data).length });
    toast('Datei gespeichert.', 'success');
    onSaved();
    return true;
  }, [loaded, saving, text, sid, path, onSaved]);

  const leave = useCallback(async (): Promise<void> => {
    if (dirty) {
      const ok = await confirmDialog({ title: 'Ungespeicherte Änderungen', message: 'Wenn du schließt, gehen deine Änderungen verloren.', confirmLabel: 'Verwerfen', danger: true });
      if (!ok) return;
    }
    setClosing(true);
    setTimeout(() => closeRef.current(), 160);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      } else if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) {
        e.stopPropagation();
        void leave();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [save, leave]);

  const lines = useMemo(() => text.split('\n').length, [text]);
  const numbers = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1).join('\n'), [lines]);

  function track(): void {
    const el = area.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const line = before.split('\n').length;
    setCursor({ line, column: before.length - before.lastIndexOf('\n') });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart: from, selectionEnd: to } = el;
    el.setRangeText('\t', from, to, 'end');
    setText(el.value);
  }

  const name = path.split('/').pop() ?? path;

  return (
    <div className={`fixed inset-x-0 bottom-0 top-10 z-50 bg-black/70 p-4 flex ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}>
      <div className={`flex-1 min-w-0 flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden shadow-2xl ${closing ? 'animate-pop-out' : 'animate-pop'}`} role="dialog" aria-label={`Bearbeiten: ${name}`}>
        <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-neutral-800">
          <FileText className="size-[18px] text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-neutral-100 truncate">
              {name}
              {dirty && <span className="ml-2 inline-block size-2 rounded-full bg-amber-400 align-middle" title="Ungespeichert" />}
            </h2>
            <p className="text-[11px] text-neutral-500 font-mono truncate">{path}</p>
          </div>
          <button className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={() => void save()} data-action="editor-save">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Speichern
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Schließen" onClick={() => void leave()} data-action="editor-close">
            <X className="size-4" />
          </button>
        </header>
        {loaded ? (
          <div className="flex flex-1 min-h-0 bg-[#0f0f0f] font-mono text-[13px] leading-[20px]">
            <div ref={gutter} aria-hidden className="shrink-0 overflow-hidden select-none text-right text-neutral-600 py-3 pl-4 pr-3 border-r border-neutral-800/80 whitespace-pre">
              {numbers}
            </div>
            <textarea
              ref={area}
              value={text}
              spellCheck={false}
              wrap="off"
              className="flex-1 min-w-0 resize-none bg-transparent text-neutral-200 outline-none py-3 px-4 whitespace-pre overflow-auto"
              style={{ tabSize: 4 }}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              onKeyUp={track}
              onClick={track}
              onSelect={track}
              onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
              data-bind="editor"
            />
          </div>
        ) : (
          <div className="flex-1 grid place-items-center text-neutral-500">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}
        <footer className="h-8 shrink-0 flex items-center gap-4 px-4 border-t border-neutral-800 text-[11px] text-neutral-500">
          <span>Zeile {cursor.line}, Spalte {cursor.column}</span>
          <span>{lines} Zeilen</span>
          {loaded && <span>{formatBytes(loaded.size)}</span>}
          {loaded && <span>{loaded.crlf ? 'Windows (CRLF)' : 'Unix (LF)'}</span>}
          <span className="flex-1" />
          <span>Strg + S speichert</span>
        </footer>
      </div>
    </div>
  );
}

export function openRemoteEditor(sid: string, path: string, onSaved: () => void): void {
  openLayer((close) => <EditorDialog sid={sid} path={path} onClose={close} onSaved={onSaved} />, { persistent: true });
}
