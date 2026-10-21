import { Archive, Camera, Check, Download, Image as ImageIcon, Pencil, Plus, Settings as SettingsIcon, Trash2, Upload, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { ImportResult, Profile } from '../../shared/types';
import { Avatar, Notice } from '../components/Bits';
import { Field, Toggle } from '../components/Form';
import { Modal, confirmDialog, openLayer } from '../components/Layers';
import { toast } from '../components/Toast';
import { attempt, call, refreshProfiles, refreshRuntimes, versionKey } from '../lib/api';
import { formatBytes } from '../lib/format';
import { TYPES, isActive } from '../lib/services';
import { getState, useAppState } from '../lib/store';

export async function switchProfile(id: string): Promise<void> {
  const target = getState().profiles.find((p) => p.id === id);
  if (!target || target.active) return;
  const running = getState().services.filter(isActive).length;
  if (running) {
    const ok = await confirmDialog({
      title: `Zu „${target.name}“ wechseln?`,
      message: `${running === 1 ? 'Ein laufender Service wird' : `${running} laufende Services werden`} dabei gestoppt. Jedes Profil hat seine eigenen Services.`,
      confirmLabel: 'Wechseln',
    });
    if (!ok) return;
  }
  toast('Profil wird gewechselt …');
  const done = await attempt(call('profile.switch', { id }));
  if (done) toast(`Profil „${target.name}“ ist aktiv.`, 'success');
}

const menuItem = 'w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50 transition-colors';

export function ProfileMenu({ onClose }: { onClose: () => void }) {
  const profiles = useAppState((s) => s.profiles);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <div className="absolute bottom-full left-0 mb-2 z-40 w-[232px] rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl animate-pop overflow-hidden" role="menu">
      <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Profile</p>
      <div className="px-1.5 pb-1.5 max-h-60 overflow-y-auto space-y-0.5">
        {profiles.map((p) => (
          <button key={p.id} role="menuitem" className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${p.active ? 'bg-primary/10' : 'hover:bg-neutral-800'}`} onClick={run(() => void switchProfile(p.id))} data-menu="switch">
            <Avatar profile={p} size="size-7" text="text-xs" />
            <span className={`flex-1 min-w-0 text-sm truncate ${p.active ? 'text-primary font-medium' : 'text-neutral-200'}`}>{p.name}</span>
            {p.active && <Check className="size-4 text-primary" />}
          </button>
        ))}
      </div>
      <div className="border-t border-neutral-800 p-1.5 space-y-0.5">
        <button role="menuitem" className={menuItem} onClick={run(() => openProfileForm())} data-menu="new">
          <UserPlus className="size-4 text-neutral-500" />
          Neues Profil
        </button>
        <button role="menuitem" className={menuItem} onClick={run(() => void importProfile())} data-menu="import">
          <Upload className="size-4 text-neutral-500" />
          Profil importieren
        </button>
        <button role="menuitem" className={menuItem} onClick={run(openProfilesManager)} data-menu="manage">
          <SettingsIcon className="size-4 text-neutral-500" />
          Profile verwalten
        </button>
      </div>
    </div>
  );
}

export const openProfileForm = (profile?: Profile): void => openLayer((close) => <ProfileForm profile={profile} onClose={close} />);

function ProfileForm({ profile, onClose }: { profile?: Profile; onClose: () => void }) {
  const editing = Boolean(profile);
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const shown = avatar === '' ? null : (avatar ?? profile?.avatar ?? null);

  async function pickImage(): Promise<void> {
    const res = await window.feather.pickImage();
    if (!res) return;
    if ('error' in res) return void toast(res.error, 'error');
    setAvatar(res.dataUrl);
  }

  async function save(): Promise<void> {
    if (!name.trim()) return void toast('Bitte gib dem Profil einen Namen.', 'error');
    setBusy(true);
    const payload: Record<string, unknown> = { name: name.trim() };
    if (avatar !== undefined) payload.avatar = avatar;
    const result = await attempt(call<Profile>(editing ? 'profile.update' : 'profile.create', editing ? { id: profile?.id, ...payload } : payload));
    setBusy(false);
    if (!result) return;
    await refreshProfiles();
    onClose();
    toast(editing ? 'Profil gespeichert.' : `Profil „${result.name}“ angelegt.`, 'success');
  }

  return (
    <Modal
      title={editing ? 'Profil bearbeiten' : 'Neues Profil'}
      subtitle="Trenne Arbeit und Privates: jedes Profil hat eigene Services und Daten."
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()} data-action="save">
            <Check className="size-4" />
            {editing ? 'Speichern' : 'Anlegen'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <button className="relative group rounded-2xl" onClick={() => void pickImage()} title="Profilbild wählen" aria-label="Profilbild wählen">
            <Avatar profile={{ name: name || '?', avatar: shown }} size="size-20" text="text-3xl" />
            <span className="absolute inset-0 rounded-2xl bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center text-neutral-50">
              <Camera className="size-5" />
            </span>
          </button>
          <div className="flex flex-col items-start gap-1.5">
            <button className="btn btn-outline btn-sm" onClick={() => void pickImage()}>
              <ImageIcon className="size-3.5" />
              {shown ? 'Bild ändern' : 'Bild wählen'}
            </button>
            {shown ? (
              <button className="btn btn-ghost btn-sm text-neutral-500" onClick={() => setAvatar('')}>Bild entfernen</button>
            ) : (
              <span className="text-xs text-neutral-500">PNG, JPG oder WebP</span>
            )}
          </div>
        </div>
        <Field label="Name">
          <input
            className="input"
            value={name}
            maxLength={40}
            placeholder="z. B. Arbeitsplatz oder Privat"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            data-bind="name"
          />
        </Field>
      </div>
    </Modal>
  );
}

export const openProfilesManager = (): void => openLayer((close) => <ProfilesManager onClose={close} />);

function ProfilesManager({ onClose }: { onClose: () => void }) {
  const profiles = useAppState((s) => s.profiles);

  async function remove(p: Profile): Promise<void> {
    const ok = await confirmDialog({
      title: `Profil „${p.name}“ löschen?`,
      message: 'Alle Services, Datenbanken und Daten dieses Profils werden unwiderruflich gelöscht. Sichere es vorher als .feather-Datei, wenn du es behalten willst.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await attempt(call('profile.delete', { id: p.id }), { success: `Profil „${p.name}“ gelöscht.` });
    await refreshProfiles();
  }

  return (
    <Modal
      title="Profile verwalten"
      subtitle="Heruntergeladene Server-Versionen werden von allen Profilen geteilt."
      size="max-w-xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={() => void importProfile()}>
            <Upload className="size-4" />
            Importieren
          </button>
          <button className="btn btn-primary" onClick={() => openProfileForm()}>
            <Plus className="size-4" />
            Neues Profil
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.id} className="card flex items-center gap-3 p-3">
            <Avatar profile={p} size="size-10" text="text-base" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100 truncate">{p.name}</p>
              <p className={`text-xs ${p.active ? 'text-primary' : 'text-neutral-500'}`}>{p.active ? 'Aktiv' : 'Inaktiv'}</p>
            </div>
            {!p.active && <button className="btn btn-outline btn-sm" onClick={() => void switchProfile(p.id)}>Wechseln</button>}
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openExportDialog(p)} title="Als .feather-Datei sichern" aria-label="Sichern">
              <Archive className="size-4" />
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openProfileForm(p)} title="Bearbeiten" aria-label="Bearbeiten">
              <Pencil className="size-4" />
            </button>
            <button className="btn btn-danger btn-icon btn-sm" disabled={p.active || profiles.length <= 1} onClick={() => void remove(p)} title={p.active ? 'Das aktive Profil kann nicht gelöscht werden' : 'Löschen'} aria-label="Löschen">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

const openExportDialog = (profile: Profile): void => openLayer((close) => <ExportProfileDialog profile={profile} onClose={close} />);

function ExportProfileDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const services = useAppState((s) => s.services);
  const [includeData, setIncludeData] = useState(true);
  const [busy, setBusy] = useState(false);
  const running = profile.active ? services.filter(isActive).length : 0;

  async function save(): Promise<void> {
    const file = await window.feather.saveFile({
      title: 'Profil sichern',
      defaultName: `${profile.name.replace(/[\\/:*?"<>|]/g, '_')}.feather`,
      filters: [{ name: 'Feather-Profil', extensions: ['feather'] }],
    });
    if (!file) return;
    setBusy(true);
    const result = await attempt(call<{ file: string; bytes: number }>('profile.export', { id: profile.id, file, includeData }));
    setBusy(false);
    if (!result) return;
    onClose();
    toast(`Profil gesichert (${formatBytes(result.bytes)}).`, 'success');
    void window.feather.showItem(result.file);
  }

  return (
    <Modal
      title={`„${profile.name}“ sichern`}
      subtitle="Erstellt eine .feather-Datei, die du jederzeit wieder importieren kannst."
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            <Archive className="size-4" />
            {busy ? 'Sichere …' : 'Sichern …'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Toggle checked={includeData} onChange={setIncludeData} label="Daten einschließen" description="Datenbank-Inhalte und Server-Konfigurationen. Ohne diese Option sicherst du nur die Service-Einstellungen." />
        {includeData && running > 0 && (
          <Notice>{running === 1 ? 'Ein laufender Service wird' : `${running} laufende Services werden`} dafür kurz gestoppt und danach wieder gestartet.</Notice>
        )}
        <p className="text-xs text-neutral-500">Die Datei enthält auch Datenbank-Passwörter im Klartext. Projektordner von Webservern werden nicht mitgesichert, nur ihr Pfad.</p>
      </div>
    </Modal>
  );
}

export async function importProfile(): Promise<void> {
  const file = await window.feather.openFile({
    title: 'Profil importieren',
    filters: [{ name: 'Feather-Profil', extensions: ['feather'] }],
  });
  if (!file) return;
  toast('Profil wird importiert …');
  const result = await attempt(call<ImportResult>('profile.import', { file }));
  if (!result) return;
  await refreshProfiles();
  openLayer((close) => <ImportResultDialog result={result} onClose={close} />);
}

function ImportResultDialog({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const { profile, report } = result;
  const installed = useAppState((s) => s.installed);
  const progress = useAppState((s) => s.progress);
  const [installing, setInstalling] = useState(false);

  const missing = report.missingRuntimes.filter((r) => !installed.some((i) => i.type === r.type && i.version === r.version));

  async function installMissing(): Promise<void> {
    setInstalling(true);
    for (const { type, version } of report.missingRuntimes) {
      if (installed.some((i) => i.type === type && i.version === version)) continue;
      const ok = await attempt(call('runtime.install', { type, version }));
      if (ok === undefined) break;
    }
    await refreshRuntimes();
    setInstalling(false);
  }

  return (
    <Modal
      title={`Profil „${profile.name}“ importiert`}
      subtitle={`${report.services} ${report.services === 1 ? 'Service' : 'Services'} übernommen`}
      size="max-w-md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Später</button>
          {missing.length > 0 && (
            <button className="btn btn-outline" disabled={installing} onClick={() => void installMissing()}>
              <Download className="size-4" />
              {installing ? 'Installiere …' : 'Fehlende installieren'}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              void switchProfile(profile.id);
            }}
          >
            Zu diesem Profil wechseln
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {missing.length > 0 ? (
          <div>
            <p className="text-sm text-neutral-200">Diese Versionen fehlen auf diesem Rechner:</p>
            <div className="mt-2 card divide-y divide-neutral-800">
              {missing.map((r) => {
                const p = progress[versionKey(r.type, r.version)];
                const busy = installing && p && p.phase !== 'done' && p.phase !== 'error';
                return (
                  <div key={versionKey(r.type, r.version)} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                    <span className="text-neutral-100">{TYPES[r.type].label} {r.version}</span>
                    <span className="text-xs text-primary tabular-nums">{busy ? (p.phase === 'download' && p.percent >= 0 ? `${p.percent}%` : 'Installiere …') : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-emerald-300 flex items-center gap-2">
            <Check className="size-4" />
            Alle benötigten Versionen sind vorhanden.
          </p>
        )}
        {report.missingFolders.length > 0 && (
          <div className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2.5 space-y-1">
            <p className="font-medium">Diese Projektordner gibt es hier nicht – wähle sie in den Einstellungen des Webservers neu:</p>
            {report.missingFolders.map((f) => (
              <p key={f.name} className="font-mono text-amber-200/80 truncate" title={f.folder}>{f.name}: {f.folder}</p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
