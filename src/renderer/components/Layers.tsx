import { X } from 'lucide-react';
import { Fragment, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

interface LayerOptions {
  persistent?: boolean;
  onClosed?: () => void;
}

interface Layer {
  id: number;
  render: (close: () => void) => ReactNode;
  options: LayerOptions;
}

let layers: Layer[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const publish = (next: Layer[]): void => {
  layers = next;
  listeners.forEach((l) => l());
};

function closeLayer(id: number): void {
  const layer = layers.find((l) => l.id === id);
  if (!layer) return;
  publish(layers.filter((l) => l.id !== id));
  layer.options.onClosed?.();
}

export function openLayer(render: (close: () => void) => ReactNode, options: LayerOptions = {}): void {
  publish([...layers, { id: nextId++, render, options }]);
}

export function closeAllLayers(): void {
  [...layers].forEach((l) => closeLayer(l.id));
}

export function LayerHost() {
  const list = useSyncExternalStore(subscribe, () => layers);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const top = layers[layers.length - 1];
      if (top && !top.options.persistent) closeLayer(top.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {list.map((l) => (
        <Fragment key={l.id}>{l.render(() => closeLayer(l.id))}</Fragment>
      ))}
    </>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="btn btn-ghost btn-icon btn-sm -mr-1.5 shrink-0" onClick={onClose} aria-label="Schließen">
      <X className="size-4" />
    </button>
  );
}

interface ModalProps {
  title: ReactNode;
  subtitle?: ReactNode;
  size?: string;
  onClose: () => void;
  footer?: ReactNode;
  dismissible?: boolean;
  children: ReactNode;
}

export function Modal({ title, subtitle, size = 'max-w-lg', onClose, footer, dismissible = true, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=hidden]), select, textarea')?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panel} role="dialog" aria-modal="true" className={`flex w-full ${size} max-h-full flex-col rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl animate-pop`}>
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-100 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-neutral-800 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

interface DrawerProps {
  header: ReactNode;
  size?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ header, size = 'max-w-[560px]', onClose, children }: DrawerProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className={`flex h-full w-full ${size} flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl animate-slide-in`}>
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          {header}
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function confirmDialog({ title, message, confirmLabel = 'Bestätigen', danger = false }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    openLayer(
      (close) => (
        <Modal
          title={title}
          size="max-w-md"
          onClose={close}
          footer={
            <>
              <button className="btn btn-ghost" onClick={close}>Abbrechen</button>
              <button
                className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={() => {
                  answered = true;
                  resolve(true);
                  close();
                }}
              >
                {confirmLabel}
              </button>
            </>
          }
        >
          <p className="text-sm text-neutral-300 whitespace-pre-line">{message}</p>
        </Modal>
      ),
      {
        onClosed: () => {
          if (!answered) resolve(false);
        },
      },
    );
  });
}
