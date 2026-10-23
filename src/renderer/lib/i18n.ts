import type { Language } from '../../shared/types';
import { mergePack } from '../../shared/langpack';
import { EN } from './i18n-en';

const TEXT_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'label'];
const SKIP = 'script, style, textarea, pre, code, [data-notranslate], [contenteditable=true], .xterm';

type Rule = { regex: RegExp; source: string };

const PLACEHOLDER = /\{(\d+)\}/;

let dict: Record<string, string> = EN;

const rules: Rule[] = Object.keys(EN)
  .filter((source) => PLACEHOLDER.test(source))
  .sort((a, b) => b.length - a.length)
  .map((source) => {
    const escaped = source
      .split(/(\{\d+\})/)
      .map((part) => {
        const slot = /^\{(\d+)\}$/.exec(part);
        return slot ? `(?<g${slot[1]}>[\\s\\S]+?)` : part.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
      })
      .join('');
    return { regex: new RegExp(`^${escaped}$`), source };
  });

const ownText = new WeakMap<Node, { original: string; shown: string }>();
const ownAttrs = new WeakMap<Element, Record<string, { original: string; shown: string }>>();
let observer: MutationObserver | null = null;
let active = false;

export function translate(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return text;
  const direct = Object.hasOwn(dict, trimmed) ? dict[trimmed] : undefined;
  let result: string | undefined = direct;
  if (result === undefined) {
    for (const rule of rules) {
      const match = rule.regex.exec(trimmed);
      if (match) {
        const groups = match.groups ?? {};
        result = (dict[rule.source] ?? rule.source).replace(/\{(\d+)\}/g, (_m, n: string) => translate(groups[`g${n}`] ?? ''));
        break;
      }
    }
  }
  if (result === undefined) return text;
  const lead = text.slice(0, text.length - text.trimStart().length);
  const trail = text.slice(text.trimEnd().length);
  return `${lead}${result}${trail}`;
}

function skipped(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !el || Boolean(el.closest(SKIP));
}

function translateTextNode(node: Node): void {
  if (skipped(node)) return;
  const current = node.nodeValue ?? '';
  const known = ownText.get(node);
  if (known && known.shown === current) return;
  const shown = translate(current);
  if (shown === current) {
    ownText.delete(node);
    return;
  }
  ownText.set(node, { original: current, shown });
  node.nodeValue = shown;
}

function translateAttributes(el: Element): void {
  if (el.closest(SKIP)) return;
  const record = ownAttrs.get(el) ?? {};
  for (const name of TEXT_ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    const known = record[name];
    if (known && known.shown === value) continue;
    const shown = translate(value);
    if (shown === value) {
      delete record[name];
      continue;
    }
    record[name] = { original: value, shown };
    el.setAttribute(name, shown);
  }
  if (Object.keys(record).length) ownAttrs.set(el, record);
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest(SKIP)) return;
  translateAttributes(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    else translateAttributes(node as Element);
    node = walker.nextNode();
  }
}

function restore(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const known = ownText.get(node);
      if (known && node.nodeValue === known.shown) node.nodeValue = known.original;
      ownText.delete(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const record = ownAttrs.get(node as Element);
      if (record) {
        for (const [name, { original, shown }] of Object.entries(record)) if ((node as Element).getAttribute(name) === shown) (node as Element).setAttribute(name, original);
        ownAttrs.delete(node as Element);
      }
    }
    node = walker.nextNode();
  }
}

export const setPack = (strings: Record<string, string> | null): void => {
  dict = mergePack(EN, strings);
};

let applyToken = 0;

async function packFor(language: string): Promise<Record<string, string> | null> {
  if (language === 'en') return null;
  try {
    const reply = await window.feather.languagePack(language);
    return reply.ok ? (reply.result ?? null) : null;
  } catch {
    return null;
  }
}

export async function applyLanguage(language: Language): Promise<void> {
  const token = ++applyToken;
  document.documentElement.lang = language;
  if (language === 'de') {
    if (!active) return;
    active = false;
    observer?.disconnect();
    observer = null;
    restore(document.body);
    return;
  }
  const strings = await packFor(language);
  if (token !== applyToken) return;
  if (active) {
    observer?.disconnect();
    restore(document.body);
  }
  setPack(strings);
  if (!active) {
    active = true;
    observer = new MutationObserver((records) => {
      observer?.disconnect();
      for (const r of records) {
        if (r.type === 'characterData') translateTextNode(r.target);
        else if (r.type === 'attributes') translateAttributes(r.target as Element);
        else r.addedNodes.forEach((n) => walk(n));
      }
      observer?.observe(document.body, OPTIONS);
    });
  }
  walk(document.body);
  observer?.observe(document.body, OPTIONS);
}

const OPTIONS: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: TEXT_ATTRIBUTES };
