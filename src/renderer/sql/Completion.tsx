import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { analyze, applyItem, needs, suggest, type Analysis, type Item, type ItemKind } from '../../shared/sqlcomplete';
import { bumpUsage, ensureSchema, loadUsage, schemaView } from '../lib/sqlschema';

type Field = HTMLTextAreaElement | HTMLInputElement;

interface Options {
  source: string;
  db: string;
  enabled: boolean;
  field: RefObject<Field | null>;
  contextPrefix?: string;
  onValue: (value: string) => void;
}

interface State {
  items: Item[];
  selected: number;
  navigated: boolean;
  analysis: Analysis;
  text: string;
  x: number;
  y: number;
}

const MIRRORED = ['boxSizing', 'width', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize'] as const;

function caretPosition(el: HTMLTextAreaElement, index: number): { x: number; y: number; height: number } {
  const style = getComputedStyle(el);
  const mirror = document.createElement('div');
  for (const name of MIRRORED) mirror.style[name] = style[name];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = el.value.slice(index) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const height = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
  const pos = { x: marker.offsetLeft - el.scrollLeft, y: marker.offsetTop - el.scrollTop, height };
  document.body.removeChild(mirror);
  return pos;
}

const KIND: Record<ItemKind, { tag: string; tone: string }> = {
  keyword: { tag: 'K', tone: 'bg-violet-500/20 text-violet-300' },
  function: { tag: 'ƒ', tone: 'bg-amber-500/20 text-amber-300' },
  database: { tag: 'D', tone: 'bg-emerald-500/20 text-emerald-300' },
  table: { tag: 'T', tone: 'bg-sky-500/20 text-sky-300' },
  column: { tag: 'C', tone: 'bg-primary/20 text-primary' },
  snippet: { tag: '›', tone: 'bg-neutral-600/40 text-neutral-200' },
  operator: { tag: '=', tone: 'bg-pink-500/20 text-pink-300' },
};

export function useSqlCompletion({ source, db, enabled, field, contextPrefix = '', onValue }: Options): { popup: ReactNode; onKeyDown: (event: KeyboardEvent<Field>) => boolean; trigger: (force?: boolean) => void; hide: () => void } {
  const [state, setState] = useState<State | null>(null);
  const token = useRef(0);
  const stateRef = useRef<State | null>(null);
  stateRef.current = state;

  const hide = useCallback((): void => {
    token.current++;
    setState(null);
  }, []);

  const trigger = useCallback(
    (force = false): void => {
      const el = field.current;
      if (!enabled || !el || document.activeElement !== el) return;
      const mine = ++token.current;
      const caret = el.selectionStart ?? el.value.length;
      const text = contextPrefix + el.value;
      const analysis = analyze(text, contextPrefix.length + caret);
      if (analysis.context === 'none') return setState(null);
      const compute = (): void => {
        if (mine !== token.current) return;
        const items = suggest(analysis, schemaView(source), db, loadUsage(), force);
        if (items.length === 0) return setState(null);
        const pos = el instanceof HTMLTextAreaElement ? caretPosition(el, caret) : { x: 0, y: 0, height: el.offsetHeight };
        const left = el instanceof HTMLTextAreaElement ? el.offsetLeft + pos.x : el.offsetLeft;
        const top = el.offsetTop + pos.y + pos.height + 4;
        setState((prev) => ({ items, selected: 0, navigated: false, analysis, text, x: Math.max(0, Math.min(left, el.offsetLeft + el.offsetWidth - 300)), y: top, ...(prev && prev.analysis.from === analysis.from && prev.items[0]?.label === items[0]?.label ? { selected: prev.selected, navigated: prev.navigated } : {}) }));
      };
      const missing = (n: ReturnType<typeof needs>): boolean => (n.databases && schemaView(source).databases.length === 0) || n.tables.some((t) => !schemaView(source).tables(t)) || n.columns.some((c) => !schemaView(source).columns(c.db, c.table));
      const first = needs(analysis, schemaView(source), db);
      if (!missing(first)) return compute();
      void (async () => {
        for (let round = 0; round < 3; round++) {
          const need = needs(analysis, schemaView(source), db);
          if (!missing(need) || mine !== token.current) break;
          await ensureSchema(source, need);
        }
        compute();
      })();
    },
    [enabled, field, contextPrefix, source, db],
  );

  const accept = useCallback(
    (index?: number): void => {
      const s = stateRef.current;
      const el = field.current;
      if (!s || !el) return;
      const item = s.items[index ?? s.selected];
      if (!item) return;
      const out = applyItem(s.text, s.analysis, item);
      const value = out.text.slice(contextPrefix.length);
      const caret = out.caret - contextPrefix.length;
      bumpUsage(item.kind, item.label);
      onValue(value);
      setState(null);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
        trigger();
      });
    },
    [field, contextPrefix, onValue, trigger],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<Field>): boolean => {
      if (!enabled) return false;
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        trigger(true);
        return true;
      }
      const s = stateRef.current;
      if (!s) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setState({ ...s, selected: (s.selected + step + s.items.length) % s.items.length, navigated: true });
        return true;
      }
      if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        accept();
        return true;
      }
      if (event.key === 'Enter' && s.navigated && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        accept();
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hide();
        return true;
      }
      return false;
    },
    [enabled, trigger, accept, hide],
  );

  useEffect(() => {
    if (!enabled) setState(null);
  }, [enabled]);

  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }, [state?.selected]);

  const popup = state ? (
    <div className="absolute z-40 w-[340px] max-w-[92%] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl animate-fade-in" style={{ left: state.x, top: state.y }} onMouseDown={(e) => e.preventDefault()} data-completion>
      <div ref={list} className="max-h-60 overflow-y-auto py-1">
        {state.items.map((item, i) => (
          <button key={`${item.kind}:${item.label}`} type="button" data-selected={i === state.selected} className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[13px] ${i === state.selected ? 'bg-primary/15 text-neutral-50' : 'text-neutral-300 hover:bg-neutral-800'}`} onClick={() => accept(i)} onMouseMove={() => i !== state.selected && setState({ ...state, selected: i })} data-completion-item={item.label}>
            <span className={`grid size-5 shrink-0 place-items-center rounded text-[11px] font-semibold ${KIND[item.kind].tone}`}>{KIND[item.kind].tag}</span>
            <span className="min-w-0 flex-1 truncate font-mono" data-notranslate>{item.label}</span>
            {item.detail && <span className="max-w-[45%] shrink-0 truncate text-[11px] text-neutral-500">{item.detail}</span>}
          </button>
        ))}
      </div>
      <div className="border-t border-neutral-800 px-2 py-1 text-[10px] text-neutral-500">Tab übernehmen · ↑↓ wählen · Esc schließen · Strg+Leertaste öffnet</div>
    </div>
  ) : null;

  return { popup, onKeyDown, trigger, hide };
}
