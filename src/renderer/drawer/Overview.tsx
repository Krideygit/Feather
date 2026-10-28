import { CircleAlert, Copy, FolderOpen, Key } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Service } from '../../shared/types';
import { StatusBadge } from '../components/Bits';
import { toast } from '../components/Toast';
import { formatUptime, useTicker } from '../lib/format';
import { openFolder, openInBrowser } from '../lib/services';
import { openPasswordDialog } from './Users';

function copyText(text: string): void {
  void window.feather.copy(text);
  toast('In die Zwischenablage kopiert.', 'success');
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => copyText(value)} title="Kopieren" aria-label={`${label} kopieren`}>
      <Copy className="size-3.5" />
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kbd-row">
      <span className="text-sm text-neutral-400 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <Row label={label}>
      <span className="flex items-center gap-1 min-w-0">
        <span className="text-sm text-neutral-100 font-mono truncate" title={value}>{value || <span className="text-neutral-600">leer</span>}</span>
        {value && <CopyButton value={value} label={label} />}
      </span>
    </Row>
  );
}

export function OverviewTab({ service: svc }: { service: Service }) {
  useTicker();
  const [showPassword, setShowPassword] = useState(false);
  const conn = svc.connection;

  return (
    <>
      {svc.status === 'error' && svc.error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 text-sm text-red-200 whitespace-pre-line flex gap-2.5">
          <CircleAlert className="size-4 mt-0.5" />
          <span>{svc.error}</span>
        </div>
      )}
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">{svc.category === 'database' ? 'Verbindung' : 'Zugriff'}</h3>
        {svc.category === 'database' ? (
          <>
            <CopyRow label="Host" value={conn.host} />
            <CopyRow label="Port" value={String(conn.port)} />
            <CopyRow label="Benutzer" value={conn.user ?? ''} />
            <Row label="Passwort">
              <span className="flex items-center gap-1 min-w-0">
                <span className="text-sm text-neutral-100 font-mono truncate">
                  {conn.password ? (showPassword ? conn.password : '••••••••') : <span className="text-neutral-600">leer</span>}
                </span>
                {conn.password && (
                  <>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowPassword(!showPassword)} title="Anzeigen / verbergen">
                      <Key className="size-3.5" />
                    </button>
                    <CopyButton value={conn.password} label="Passwort" />
                  </>
                )}
              </span>
            </Row>
            <CopyRow label="URL" value={conn.url} />
            <div className="pt-3">
              <button
                className="btn btn-outline btn-sm"
                data-action="changeRootPassword"
                onClick={() => (svc.status === 'running' ? openPasswordDialog(svc.id, 'root', 'localhost') : toast('Starte die Datenbank, um das Passwort zu ändern.', 'error'))}
              >
                <Key className="size-3.5" />
                Root-Passwort ändern
              </button>
            </div>
          </>
        ) : svc.type === 'mailpit' ? (
          <>
            <Row label="Postfach">
              <span className="flex items-center gap-1 min-w-0">
                <button className="text-sm text-primary hover:underline font-mono truncate" onClick={() => openInBrowser(svc)} data-action="mailpit-open">{conn.url}</button>
                <CopyButton value={conn.url} label="URL" />
              </span>
            </Row>
            <CopyRow label="SMTP-Server" value={`localhost:${conn.smtp ?? 1025}`} />
            <p className="hint">Trage in deiner Anwendung als Mail-Server localhost mit dem SMTP-Port ein, ohne Anmeldung und ohne Verschlüsselung. Alle Mails landen im Postfach und werden nicht wirklich versendet.</p>
          </>
        ) : svc.category === 'package' ? (
          <>
            <CopyRow label="Server-Adresse" value={conn.url} />
            <CopyRow label="Port" value={String(svc.port)} />
            <p className="hint">
              {svc.type === 'fivem'
                ? `Im FiveM-Client mit F8 die Konsole öffnen und "connect ${conn.url}" eingeben.`
                : 'In Minecraft unter Mehrspieler die Server-Adresse als Direktverbindung eintragen.'}
            </p>
          </>
        ) : (
          <>
            <Row label="URL">
              <span className="flex items-center gap-1 min-w-0">
                <button className="text-sm text-primary hover:underline font-mono truncate" onClick={() => openInBrowser(svc)}>{conn.url}</button>
                <CopyButton value={conn.url} label="URL" />
              </span>
            </Row>
            <Row label="Ordner">
              <span className="flex items-center gap-1 min-w-0">
                <span className="text-sm text-neutral-100 truncate" title={svc.folder}>{svc.folder}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void openFolder(svc.folder)} title="Ordner öffnen">
                  <FolderOpen className="size-3.5" />
                </button>
              </span>
            </Row>
            <CopyRow label="Port" value={String(svc.port)} />
          </>
        )}
      </section>
      <section className="mt-6">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Details</h3>
        <Row label="Status"><StatusBadge status={svc.status} /></Row>
        {svc.status === 'running' && (
          <>
            <Row label="Läuft"><span className="text-sm text-neutral-100">{formatUptime(svc.startedAt)}</span></Row>
            <Row label="Prozess-ID"><span className="text-sm text-neutral-100 font-mono">{svc.pid}</span></Row>
          </>
        )}
        {svc.category === 'package' && svc.type !== 'mailpit' && (
          <>
            {svc.type !== 'fivem' && <Row label="Arbeitsspeicher"><span className="text-sm text-neutral-100">{String(svc.options.memory ?? '')}</span></Row>}
            <Row label="Max. Spieler"><span className="text-sm text-neutral-100">{String(svc.options.maxPlayers ?? svc.options.maxClients ?? '')}</span></Row>
            <Row label="Erreichbar"><span className="text-sm text-neutral-100">{svc.options.lan === true ? 'Im Netzwerk' : 'Nur dieser Rechner'}</span></Row>
          </>
        )}
        <Row label="Automatisch starten"><span className="text-sm text-neutral-100">{svc.autoStart ? 'Ja' : 'Nein'}</span></Row>
        <Row label="Konfiguration"><span className="text-sm text-neutral-100 font-mono truncate" title={svc.dir}>{svc.dir}</span></Row>
      </section>
    </>
  );
}
