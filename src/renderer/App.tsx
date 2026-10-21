import { ChevronsUpDown, CircleAlert, Database, Globe, LayoutDashboard, Package, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from './components/Bits';
import { LayerHost } from './components/Layers';
import { ToastHost } from './components/Toast';
import { ProfileMenu } from './dialogs/Profiles';
import { call, refreshProfiles, refreshRuntimes, refreshServices } from './lib/api';
import { listenToCore } from './lib/events';
import { type Route, setState, useActiveProfile, useAppState } from './lib/store';
import { CategoryPage } from './pages/CategoryPage';
import { DashboardPage } from './pages/Dashboard';
import { PackagesPage } from './pages/Packages';
import type { AppInfo } from '../shared/types';

const NAV: { route: Route; label: string; icon: LucideIcon; soon?: boolean }[] = [
  { route: 'dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { route: 'database', label: 'Datenbanken', icon: Database },
  { route: 'webserver', label: 'Webserver', icon: Globe },
  { route: 'packages', label: 'Packages', icon: Package, soon: true },
];

const ROUTES = NAV.map((n) => n.route);

function storedRoute(): Route {
  try {
    const saved = localStorage.getItem('feather.route') as Route | null;
    if (saved && ROUTES.includes(saved)) return saved;
  } catch {
  }
  return 'dashboard';
}

function Sidebar() {
  const route = useAppState((s) => s.route);
  const services = useAppState((s) => s.services);
  const profile = useActiveProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (!holder.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const go = (next: Route): void => {
    setState({ route: next });
    try {
      localStorage.setItem('feather.route', next);
    } catch {
    }
  };

  const count = (r: Route): number => (r === 'database' || r === 'webserver' ? services.filter((s) => s.category === r).length : 0);

  return (
    <aside className="w-60 shrink-0 border-r border-neutral-800/80 flex flex-col px-3 py-4">
      <nav className="flex flex-col gap-1">
        {NAV.map(({ route: r, label, icon: Icon, soon }) => {
          const active = route === r;
          return (
            <button
              key={r}
              className={`no-drag flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-100'}`}
              onClick={() => go(r)}
              aria-current={active ? 'page' : undefined}
              data-route={r}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1 text-left">{label}</span>
              {soon && <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5">Bald</span>}
              {count(r) > 0 && <span className={`text-xs ${active ? 'text-primary/70' : 'text-neutral-500'}`}>{count(r)}</span>}
            </button>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="relative" ref={holder}>
        {menuOpen && <ProfileMenu onClose={() => setMenuOpen(false)} />}
        <button id="profile-button" className="no-drag flex items-center gap-2.5 w-full rounded-lg p-2 hover:bg-neutral-800/70 transition-colors" onClick={() => setMenuOpen(!menuOpen)} title="Profil wechseln" aria-haspopup="menu" aria-expanded={menuOpen}>
          <Avatar profile={profile} />
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-sm font-medium text-neutral-100 truncate">{profile?.name ?? 'Profil'}</span>
            <span className="block text-[11px] text-neutral-500">Aktives Profil</span>
          </span>
          <ChevronsUpDown className="size-4 text-neutral-500" />
        </button>
      </div>
    </aside>
  );
}

function Page() {
  const route = useAppState((s) => s.route);
  switch (route) {
    case 'database':
      return <CategoryPage category="database" />;
    case 'webserver':
      return <CategoryPage category="webserver" />;
    case 'packages':
      return <PackagesPage />;
    default:
      return <DashboardPage />;
  }
}

export function App() {
  const coreError = useAppState((s) => s.coreError);
  const version = useAppState((s) => s.version);
  const ready = useAppState((s) => s.ready);

  useEffect(() => {
    const bridge = window.feather;
    setState({ route: storedRoute() });
    bridge.bootProgress(66, 'Profil wird geladen …');
    const stopListening = listenToCore();

    void (async () => {
      try {
        const [version, settings, info] = await Promise.all([bridge.getVersion(), bridge.getSettings(), call<AppInfo>('app.info')]);
        setState({ version, settings, info });
        bridge.bootProgress(78, 'Services werden geladen …');
        await Promise.all([refreshServices(), refreshRuntimes(), refreshProfiles()]);
      } catch (err) {
        setState({ coreError: err instanceof Error ? err.message : String(err) });
      }
      bridge.bootProgress(94, 'Oberfläche wird aufgebaut …');
      setState({ ready: true });
    })();
    return stopListening;
  }, []);

  useEffect(() => {
    if (ready) requestAnimationFrame(() => requestAnimationFrame(() => window.feather.bootReady()));
  }, [ready]);

  return (
    <div className="h-screen flex flex-col">
      <div className="h-10 shrink-0 flex drag border-b border-neutral-800/80">
        <div className="w-60 shrink-0 flex items-center gap-2.5 px-5 text-neutral-50">
          <FeatherLogo />
          <span className="text-sm font-semibold tracking-tight">Feather</span>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          {coreError && (
            <div className="mx-8 mt-4 shrink-0 rounded-lg bg-red-500/10 border border-red-500/25 px-4 py-3 text-sm text-red-200 flex gap-3">
              <CircleAlert className="size-4 mt-0.5" />
              <span>{coreError}</span>
            </div>
          )}
          <Page />
        </main>
      </div>
      <div className="pointer-events-none fixed bottom-1.5 left-1/2 -translate-x-1/2 text-[11px] text-neutral-600 select-none z-10">{version && `Feather v${version}`}</div>
      <LayerHost />
      <ToastHost />
    </div>
  );
}

function FeatherLogo() {
  return (
    <span className="text-primary">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" />
        <path d="M16 8 2 22" />
        <path d="M17.5 15H9" />
      </svg>
    </span>
  );
}
