import { ArrowLeft, ArrowRight, Camera, Check, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { LanguageInfo, Profile, Settings } from '../../shared/types';
import { Avatar } from '../components/Bits';
import { Field, Toggle } from '../components/Form';
import { toast } from '../components/Toast';
import { call, refreshProfiles } from '../lib/api';
import { updateSettings } from '../lib/settings';
import { useAppState } from '../lib/store';
import { PRESETS, palette } from '../lib/theme';

const STEPS = ['Willkommen', 'Profil', 'Darstellung', 'Datenschutz', 'Hilfen', 'Fertig'] as const;

function Mark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </svg>
  );
}

function Choice({ active, onClick, children, id }: { active: boolean; onClick: () => void; children: React.ReactNode; id: string }) {
  return (
    <button type="button" className={`card card-hover p-4 text-left ${active ? 'border-primary! ring-1 ring-primary/40' : ''}`} onClick={onClick} aria-pressed={active} data-choice={id}>
      {children}
    </button>
  );
}

function LanguageStep() {
  const language = useAppState((s) => s.settings.language);
  const [list, setList] = useState<LanguageInfo[]>([]);
  useEffect(() => {
    void window.feather.languagesList().then((reply) => reply.ok && setList(reply.result ?? []));
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">Willkommen bei Feather</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">Feather verwaltet lokale Dienste wie MariaDB und Webserver und bringt ein Terminal, Dateiverwaltung und einen SQL-Client für deine Server mit. Die Einrichtung dauert eine Minute. Alles lässt sich später in den Einstellungen ändern.</p>
      </div>
      <div>
        <p className="label">Sprache</p>
        <div className="grid max-w-lg grid-cols-2 gap-3">
          {list.map((l) => (
            <Choice key={l.code} id={`lang-${l.code}`} active={language === l.code} onClick={() => void updateSettings({ language: l.code })}>
              <p className="text-sm font-medium text-neutral-100" data-notranslate>{l.name}</p>
              <p className="text-xs text-neutral-500" data-notranslate>{l.code === 'de' ? 'Standard' : l.code === 'en' ? 'English' : l.author}</p>
            </Choice>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ProfileDraft {
  name: string;
  avatar: string | null | undefined;
  id: string | null;
}

function ProfileStep({ draft, onChange }: { draft: ProfileDraft; onChange: (next: ProfileDraft) => void }) {
  async function pick(): Promise<void> {
    const res = await window.feather.pickImage();
    if (!res) return;
    if ('error' in res) return void toast(res.error, 'error');
    onChange({ ...draft, avatar: res.dataUrl });
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">Dein Profil</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">Ein Profil bündelt Services und Daten. Du kannst später weitere anlegen, etwa getrennt für Arbeit und Privates.</p>
      </div>
      <div className="flex max-w-lg items-start gap-5">
        <button type="button" className="group relative shrink-0 rounded-2xl" onClick={() => void pick()} title="Profilbild wählen" aria-label="Profilbild wählen">
          <Avatar profile={{ name: draft.name || '?', avatar: draft.avatar ?? null }} size="size-20" text="text-3xl" />
          <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55 text-neutral-50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-5" />
          </span>
        </button>
        <div className="flex-1">
          <Field label="Name" hint="Optional kannst du ein Profilbild wählen.">
            <input className="input" value={draft.name} maxLength={40} placeholder="z. B. Arbeit" onChange={(e) => onChange({ ...draft, name: e.target.value })} data-bind="welcome-name" autoFocus />
          </Field>
        </div>
      </div>
    </div>
  );
}

function ThemeStep() {
  const theme = useAppState((s) => s.settings.theme);
  const custom = useAppState((s) => s.settings.themes);
  const all = useMemo(() => [...PRESETS, ...custom], [custom]);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">Darstellung</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">Wähle ein Farbschema. Eigene Themen erstellst du später unter Einstellungen › Darstellung.</p>
      </div>
      <div className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
        {all.map((t) => {
          const colors = palette(t);
          return (
            <Choice key={t.id} id={`theme-${t.id}`} active={theme === t.id} onClick={() => void updateSettings({ theme: t.id })}>
              <div className="mb-2.5 flex h-7 overflow-hidden rounded-md border border-black/20" aria-hidden>
                <span className="flex-1" style={{ background: colors[900] }} />
                <span className="flex-1" style={{ background: colors[700] }} />
                <span className="flex-1" style={{ background: colors[400] }} />
                <span className="flex-1" style={{ background: t.accent }} />
              </div>
              <p className="flex items-center justify-between text-sm font-medium text-neutral-100">
                <span data-notranslate={t.id.length > 20 ? 'true' : undefined}>{t.name}</span>
                {theme === t.id && <Check className="size-4 text-primary" />}
              </p>
              <p className="text-xs text-neutral-500">{t.mode === 'light' ? 'Hell' : 'Dunkel'}</p>
            </Choice>
          );
        })}
      </div>
    </div>
  );
}

function PrivacyStep() {
  const saveeye = useAppState((s) => s.settings.saveeye);
  const set = (patch: Partial<Settings['saveeye']>): void => void updateSettings({ saveeye: { ...saveeye, ...patch } });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">Schutz bei Bildschirmaufnahmen</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">Saveeye erkennt Bildschirmübertragungen, etwa über Discord, OBS oder Teams, und Screenshot-Tasten. Dann wird Feather unscharf und fragt, ob andere es sehen dürfen. Das schützt Zugangsdaten und Serverinhalte.</p>
      </div>
      <div className="max-w-lg space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <EyeOff className="size-5" />
          </span>
          <div className="flex-1">
            <Toggle checked={saveeye.enabled} onChange={(enabled) => set({ enabled })} label="Saveeye aktivieren" description="Empfohlen, wenn du Bildschirme teilst oder aufzeichnest." />
          </div>
        </div>
        <div className={`grid gap-3 transition-opacity ${saveeye.enabled ? '' : 'pointer-events-none opacity-50'}`}>
          <Choice id="saveeye-ask" active={saveeye.mode === 'ask'} onClick={() => set({ mode: 'ask' })}>
            <p className="text-sm font-medium text-neutral-100">Nachfragen</p>
            <p className="mt-0.5 text-xs text-neutral-500">Feather wird unscharf, und du entscheidest bei jeder Aufnahme.</p>
          </Choice>
          <Choice id="saveeye-always" active={saveeye.mode === 'always'} onClick={() => set({ mode: 'always' })}>
            <p className="text-sm font-medium text-neutral-100">Immer geschützt</p>
            <p className="mt-0.5 text-xs text-neutral-500">Feather erscheint in jeder Aufnahme schwarz, auch in deinen eigenen Screenshots.</p>
          </Choice>
        </div>
      </div>
    </div>
  );
}

function HelpStep() {
  const terminal = useAppState((s) => s.settings.terminal);
  const database = useAppState((s) => s.settings.database);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">Hilfen</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">Diese Funktionen nehmen dir Tipparbeit ab. Du kannst sie jederzeit unter Einstellungen › Terminal und Datenbank ändern.</p>
      </div>
      <div className="max-w-lg space-y-5">
        <Toggle checked={terminal.suggestions} onChange={(suggestions) => void updateSettings({ terminal: { ...terminal, suggestions } })} label="Befehlsvorschläge im Terminal" description="Zeigt passende Befehle an. Mit Tab übernimmst du sie." />
        <Toggle checked={terminal.hints} onChange={(hints) => void updateSettings({ terminal: { ...terminal, hints } })} label="Hinweise bei Fehlern" description="Schlägt bei Meldungen wie „Befehl nicht gefunden“ den passenden Befehl vor." />
        <Toggle checked={database.autocomplete} onChange={(autocomplete) => void updateSettings({ database: { ...database, autocomplete } })} label="Vorschläge in Feather SQL" description="Vervollständigt Tabellen, Spalten und den nächsten Schritt einer Abfrage." />
        <Toggle checked={database.history} onChange={(history) => void updateSettings({ database: { ...database, history } })} label="Änderungsverlauf für Tabellen" description="Merkt sich frühere Werte und zeigt sie beim erneuten Ändern an." />
        <Toggle checked={database.keepDeleted} onChange={(keepDeleted) => void updateSettings({ database: { ...database, keepDeleted } })} label="Gelöschte Zeilen sichern" description="Gelöschte Zeilen lassen sich im Verlauf wiederherstellen." />
      </div>
    </div>
  );
}

function DoneStep({ name }: { name: string }) {
  const settings = useAppState((s) => s.settings);
  const theme = [...PRESETS, ...settings.themes].find((t) => t.id === settings.theme);
  const rows: [string, string][] = [
    ['Profil', name || 'Standard'],
    ['Sprache', settings.language === 'de' ? 'Deutsch' : settings.language === 'en' ? 'English' : settings.language],
    ['Thema', theme?.name ?? settings.theme],
    ['Saveeye', settings.saveeye.enabled ? (settings.saveeye.mode === 'always' ? 'Immer geschützt' : 'Nachfragen') : 'Aus'],
    ['Befehlsvorschläge', settings.terminal.suggestions ? 'An' : 'Aus'],
    ['SQL-Vorschläge', settings.database.autocomplete ? 'An' : 'Aus'],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">Alles bereit</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">Feather ist eingerichtet. Unter Einstellungen findest du alle Optionen wieder, und die Dokumentation erklärt jeden Bereich im Detail.</p>
      </div>
      <dl className="max-w-md divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="font-medium text-neutral-100" data-notranslate={label === 'Profil' || label === 'Thema' ? 'true' : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Welcome() {
  const profiles = useAppState((s) => s.profiles);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({ name: '', avatar: undefined, id: null });

  const last = step === STEPS.length - 1;

  async function saveProfile(): Promise<boolean> {
    const name = draft.name.trim();
    if (!name) {
      toast('Bitte gib deinem Profil einen Namen.', 'error');
      return false;
    }
    setBusy(true);
    try {
      const avatar = draft.avatar === undefined ? {} : { avatar: draft.avatar ?? '' };
      const lone = profiles.length === 1 && profiles[0]?.name === 'Standard' ? profiles[0] : null;
      const existing = draft.id ?? lone?.id ?? null;
      if (existing) {
        await call<Profile>('profile.update', { id: existing, name, ...avatar });
        setDraft((d) => ({ ...d, id: existing }));
      } else {
        const created = await call<Profile>('profile.create', { name, ...avatar });
        await call('profile.switch', { id: created.id });
        setDraft((d) => ({ ...d, id: created.id }));
      }
      await refreshProfiles();
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next(): Promise<void> {
    if (step === 1 && !(await saveProfile())) return;
    if (last) return void (await updateSettings({ onboarded: true }));
    setStep(step + 1);
  }

  return (
    <div className="fixed inset-0 z-[70] flex bg-neutral-950 animate-fade-in" role="dialog" aria-modal="true" aria-label="Einrichtung" data-welcome>
      <aside className="drag hidden w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40 px-6 pb-6 pt-14 md:flex">
        <div className="flex items-center gap-2.5 text-neutral-50">
          <span className="text-primary"><Mark /></span>
          <span className="text-base font-semibold tracking-tight">Feather</span>
        </div>
        <ol className="no-drag mt-10 space-y-1">
          {STEPS.map((label, i) => (
            <li key={label} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === step ? 'bg-primary/10 font-medium text-primary' : i < step ? 'text-neutral-300' : 'text-neutral-600'}`}>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${i < step ? 'border-primary bg-primary text-[var(--on-primary)]' : i === step ? 'border-primary' : 'border-neutral-700'}`}>{i < step ? <Check className="size-3" /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="drag h-10 shrink-0" />
        <div className="flex-1 overflow-y-auto px-10 pb-6 pt-6 md:px-16">
          <div key={step} className="animate-fade-in">
            {step === 0 && <LanguageStep />}
            {step === 1 && <ProfileStep draft={draft} onChange={setDraft} />}
            {step === 2 && <ThemeStep />}
            {step === 3 && <PrivacyStep />}
            {step === 4 && <HelpStep />}
            {step === 5 && <DoneStep name={draft.name.trim()} />}
          </div>
        </div>
        <footer className="no-drag flex items-center gap-3 border-t border-neutral-800 px-10 py-4 md:px-16">
          <button className="btn btn-ghost" onClick={() => void updateSettings({ onboarded: true })} data-action="welcome-skip">Überspringen</button>
          <span className="flex-1" />
          {step > 0 && (
            <button className="btn btn-outline" onClick={() => setStep(step - 1)} disabled={busy} data-action="welcome-back">
              <ArrowLeft className="size-4" />
              Zurück
            </button>
          )}
          <button className="btn btn-primary" onClick={() => void next()} disabled={busy} data-action="welcome-next">
            {busy ? <Loader2 className="size-4 animate-spin" /> : last ? <Check className="size-4" /> : null}
            {last ? 'Feather starten' : 'Weiter'}
            {!last && !busy && <ArrowRight className="size-4" />}
          </button>
        </footer>
      </section>
    </div>
  );
}
