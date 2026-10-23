import { Archive, Database, EyeOff, Languages, SquareTerminal, Palette, Puzzle, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { BackupSection, DatabaseSection, GeneralSection, TerminalSection, LanguageSection, PluginsSection, SaveeyeSection } from '../settings/Sections';
import { ThemeSection } from '../settings/ThemeSection';

type Section = 'themes' | 'language' | 'terminal' | 'database' | 'saveeye' | 'backup' | 'plugins' | 'general';

const SECTIONS: { id: Section; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'themes', label: 'Darstellung', description: 'Wähle ein Thema oder gestalte dein eigenes.', icon: Palette },
  { id: 'language', label: 'Sprache', description: 'Die Sprache der Oberfläche.', icon: Languages },
  { id: 'terminal', label: 'Terminal', description: 'Hilfen für das Terminal auf deinen Servern.', icon: SquareTerminal },
  { id: 'database', label: 'Datenbank', description: 'Hilfen für Feather SQL und die Tabellenansicht.', icon: Database },
  { id: 'saveeye', label: 'Saveeye', description: 'Schütze dein Feather bei Bildschirmaufnahmen und Übertragungen.', icon: EyeOff },
  { id: 'backup', label: 'Sicherung', description: 'Sichere alles in einer Datei und hole es jederzeit zurück.', icon: Archive },
  { id: 'plugins', label: 'Plugins', description: 'Erweitere Feather mit eigenen .jar-Plugins.', icon: Puzzle },
  { id: 'general', label: 'Allgemein', description: 'Weitere Einstellungen.', icon: SlidersHorizontal },
];

export function SettingsPage() {
  const [section, setSection] = useState<Section>('themes');
  const current = SECTIONS.find((s) => s.id === section) ?? (SECTIONS[0] as (typeof SECTIONS)[number]);

  return (
    <div className="flex flex-1 min-h-0" data-page="settings">
      <nav className="w-56 shrink-0 border-r border-neutral-800/80 p-3 space-y-1" aria-label="Einstellungen">
        <h1 className="px-3 pt-3 pb-3 text-xl font-semibold text-neutral-50 tracking-tight">Einstellungen</h1>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            aria-current={section === id ? 'page' : undefined}
            data-section-link={id}
            className={`w-full flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-colors ${section === id ? 'bg-primary/10 text-primary' : 'text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-100'}`}
          >
            <Icon className="size-[18px]" />
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-10 pt-8 pb-10">
          <header className="mb-6">
            <h2 className="text-lg font-semibold text-neutral-50 tracking-tight">{current.label}</h2>
            <p className="text-sm text-neutral-500 mt-0.5">{current.description}</p>
          </header>
          <div key={section}>
            {section === 'themes' && <ThemeSection />}
            {section === 'language' && <LanguageSection />}
            {section === 'terminal' && <TerminalSection />}
            {section === 'database' && <DatabaseSection />}
            {section === 'saveeye' && <SaveeyeSection />}
            {section === 'backup' && <BackupSection />}
            {section === 'plugins' && <PluginsSection />}
            {section === 'general' && <GeneralSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
