import { Boxes, HardDrive, MessageSquare, Package, Rocket, Terminal, Zap, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/Bits';

const PLANNED: { icon: LucideIcon; name: string; text: string }[] = [
  { icon: MessageSquare, name: 'Discord-Server', text: 'Ein lokaler, Discord-kompatibler Server zum Entwickeln und Testen von Bots – ohne echten Server.' },
  { icon: Zap, name: 'Redis', text: 'In-Memory-Cache und Message-Broker für lokale Projekte.' },
  { icon: Terminal, name: 'PHP', text: 'PHP-FPM, das mit Nginx und Apache zusammenarbeitet.' },
  { icon: Boxes, name: 'Node.js', text: 'Verschiedene Node-Versionen pro Projekt, ohne globale Installation.' },
  { icon: Package, name: 'Mailpit', text: 'Fängt alle ausgehenden Test-Mails lokal ab.' },
  { icon: HardDrive, name: 'MinIO', text: 'S3-kompatibler Objektspeicher für Uploads und Backups.' },
];

export function PackagesPage() {
  return (
    <>
      <PageHeader
        title="Packages"
        description="Fertige Entwicklungsumgebungen auf Knopfdruck."
        createLabel="Package hinzufügen (bald verfügbar)"
        settingsLabel="Einstellungen (bald verfügbar)"
        disabled
      />
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="card px-5 py-4 flex items-center gap-4 border-primary/25 bg-primary/5">
          <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
            <Rocket className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-100">Packages sind in Entwicklung</p>
            <p className="text-sm text-neutral-400">Das hier ist ein Ausblick darauf, was Feather als Nächstes lernt.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {PLANNED.map(({ icon: Icon, name, text }) => (
            <div key={name} className="card p-4 opacity-80">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-lg bg-neutral-800 text-neutral-300 grid place-items-center shrink-0">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-neutral-100">{name}</h3>
                  <p className="text-sm text-neutral-500 mt-1">{text}</p>
                </div>
                <span className="text-[11px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0">Bald</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
