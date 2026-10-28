import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.definitionKeyword, t.modifier], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.namespace, t.annotation], color: 'var(--syn-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--syn-property)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--syn-tag)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--syn-punct)' },
  { tag: [t.variableName, t.name], color: 'var(--syn-variable)' },
  { tag: [t.meta, t.processingInstruction, t.documentMeta], color: 'var(--syn-meta)' },
  { tag: [t.heading, t.strong], color: 'var(--syn-function)', fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'var(--syn-string)', textDecoration: 'underline' },
  { tag: t.inserted, color: 'var(--syn-string)' },
  { tag: t.deleted, color: 'var(--syn-tag)' },
  { tag: t.invalid, color: 'var(--syn-tag)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--syn-text)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '20px', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--color-primary)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-primary)', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--syn-gutter)', border: 'none', borderRight: '1px solid var(--syn-line)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px', minWidth: '40px' },
  '.cm-activeLine': { backgroundColor: 'var(--syn-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--syn-text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--syn-selection)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--syn-match)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--syn-match)', outline: '1px solid var(--syn-gutter)' },
  '.cm-panels': { backgroundColor: 'var(--color-neutral-900)', color: 'var(--syn-text)', borderColor: 'var(--syn-line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--syn-line)' },
  '.cm-searchMatch': { backgroundColor: 'var(--syn-match)', outline: '1px solid var(--syn-gutter)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--syn-selection)' },
  '.cm-panel input, .cm-panel button, .cm-panel label': { fontSize: '12px' },
  '.cm-panel input': { backgroundColor: 'var(--color-neutral-800)', color: 'var(--syn-text)', border: '1px solid var(--syn-line)', borderRadius: '6px', padding: '2px 6px' },
  '.cm-panel button': { backgroundColor: 'var(--color-neutral-800)', color: 'var(--syn-text)', border: '1px solid var(--syn-line)', borderRadius: '6px', padding: '2px 8px', backgroundImage: 'none' },
  '.cm-tooltip': { backgroundColor: 'var(--color-neutral-900)', color: 'var(--syn-text)', border: '1px solid var(--syn-line)' },
});

export const editorTheme: Extension = [theme, syntaxHighlighting(highlight)];
