import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

window.addEventListener('error', (e) => window.feather.logRenderer(`Fehler: ${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => window.feather.logRenderer(`Nicht abgefangen: ${e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason)}`));

const container = document.getElementById('root');
if (!container) throw new Error('#root fehlt in index.html');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
