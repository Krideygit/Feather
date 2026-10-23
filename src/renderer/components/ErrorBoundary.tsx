import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
  stack: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim();
    this.setState({ stack });
    window.feather.logRenderer(`Oberfläche abgestürzt: ${error.message}\n${stack}`);
  }

  render(): ReactNode {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center" data-render-error>
        <h1 className="text-lg font-semibold text-neutral-50">Feather ist auf einen Fehler gestoßen</h1>
        <p className="max-w-xl text-sm text-neutral-400">Die Oberfläche konnte nicht angezeigt werden. Deine Daten sind nicht betroffen. Lade die Oberfläche neu. Tritt der Fehler wieder auf, kopiere die Meldung und schicke sie mit.</p>
        <pre className="max-h-48 max-w-2xl overflow-auto rounded-lg border border-neutral-800 bg-black/40 p-3 text-left text-xs text-red-300 select-text" data-notranslate>{error.message}{stack ? `\n\n${stack.slice(0, 1500)}` : ''}</pre>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Neu laden</button>
          <button className="btn btn-outline" onClick={() => void window.feather.copy(`${error.message}\n${stack}`)}>Fehler kopieren</button>
        </div>
      </div>
    );
  }
}
