import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Text } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { FileText, Loader2, Save, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileContent } from '../../shared/remote';
import { confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { languageLabel, loadLanguage } from '../lib/editorlang';
import { editorTheme } from '../lib/editortheme';
import { formatBytes } from '../lib/format';
import { attemptRemote, callRemote } from '../lib/remote';

interface Props {
  sid: string;
  path: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditorDialog({ sid, path, onClose, onSaved }: Props) {
  const [loaded, setLoaded] = useState<{ crlf: boolean; size: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [lines, setLines] = useState(1);
  const [closing, setClosing] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const initial = useRef('');
  const saved = useRef<Text | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const ready = loaded !== null;

  useEffect(() => {
    let cancelled = false;
    void callRemote<FileContent>('fs.read', { sid, path }).then(
      (content) => {
        if (cancelled) return;
        const crlf = content.text.includes('\r\n');
        initial.current = crlf ? content.text.replace(/\r\n/g, '\n') : content.text;
        setLoaded({ crlf, size: content.size });
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

  useEffect(() => {
    if (!ready || !host.current) return;
    const language = new Compartment();
    const state = EditorState.create({
      doc: initial.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        indentUnit.of('  '),
        EditorState.tabSize.of(4),
        keymap.of([indentWithTab, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
        editorTheme,
        language.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setDirty(saved.current ? !update.state.doc.eq(saved.current) : true);
            setLines(update.state.doc.lines);
          }
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            setCursor({ line: line.number, column: head - line.from + 1 });
          }
        }),
      ],
    });
    saved.current = state.doc;
    setLines(state.doc.lines);
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    editor.focus();
    let alive = true;
    const firstLine = initial.current.slice(0, initial.current.indexOf('\n') === -1 ? 200 : initial.current.indexOf('\n'));
    void loadLanguage(path, firstLine).then((ext) => {
      if (alive && ext) editor.dispatch({ effects: language.reconfigure(ext) });
    });
    return () => {
      alive = false;
      editor.destroy();
      view.current = null;
    };
  }, [ready, path]);

  const save = useCallback(async (): Promise<boolean> => {
    const editor = view.current;
    if (!loaded || !editor || saving) return false;
    setSaving(true);
    const doc = editor.state.doc;
    const text = doc.toString();
    const data = loaded.crlf ? text.replace(/\n/g, '\r\n') : text;
    const ok = await attemptRemote(callRemote('fs.write', { sid, path, text: data }).then(() => true));
    setSaving(false);
    if (!ok) return false;
    saved.current = doc;
    setDirty(!editor.state.doc.eq(doc));
    setLoaded({ ...loaded, size: new TextEncoder().encode(data).length });
    toast('Datei gespeichert.', 'success');
    onSaved();
    return true;
  }, [loaded, saving, sid, path, onSaved]);

  const leave = useCallback(async (): Promise<void> => {
    if (dirty) {
      const ok = await confirmDialog({ title: 'Ungespeicherte Änderungen', message: 'Wenn du schließt, gehen deine Änderungen verloren.', confirmLabel: 'Verwerfen', danger: true });
      if (!ok) return;
    }
    setClosing(true);
    setTimeout(() => closeRef.current(), 160);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      } else if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && !document.querySelector('.cm-panel')) {
        e.stopPropagation();
        void leave();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [save, leave]);

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
        {ready ? (
          <div ref={host} className="flex-1 min-h-0 min-w-0 overflow-hidden bg-neutral-950" data-bind="editor" />
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
          {loaded && <span data-notranslate>{languageLabel(path)}</span>}
          <span className="flex-1" />
          <span>Strg + S speichert · Strg + F sucht</span>
        </footer>
      </div>
    </div>
  );
}

export function openRemoteEditor(sid: string, path: string, onSaved: () => void): void {
  openLayer((close) => <EditorDialog sid={sid} path={path} onClose={close} onSaved={onSaved} />, { persistent: true });
}
