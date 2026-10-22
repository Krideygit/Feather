import { RemoteError } from '../../shared/remote';

interface Raw {
  code?: string | number;
  level?: string;
  message?: string;
}

const NETWORK: [RegExp, string][] = [
  [/ECONNREFUSED/, 'Verbindung abgelehnt. Läuft der Server, und stimmt der Port?'],
  [/ENOTFOUND|EAI_AGAIN/, 'Der Host wurde nicht gefunden. Prüfe die Adresse.'],
  [/EHOSTUNREACH|ENETUNREACH/, 'Der Server ist nicht erreichbar.'],
  [/ECONNRESET/, 'Die Verbindung wurde vom Server zurückgesetzt.'],
  [/ETIMEDOUT|timed out|timeout/i, 'Zeitüberschreitung. Der Server antwortet nicht.'],
  [/EPIPE|ECONNABORTED/, 'Die Verbindung wurde unterbrochen.'],
];

const SFTP_STATUS: Record<number, string> = {
  2: 'Datei oder Ordner nicht gefunden.',
  3: 'Zugriff verweigert.',
  4: 'Vorgang fehlgeschlagen. Der Name existiert evtl. schon, oder der Ordner ist nicht leer.',
  7: 'Die Verbindung zum Server ist abgebrochen.',
  8: 'Der Server unterstützt diesen Vorgang nicht.',
};

const FTP_STATUS: Record<number, string> = {
  421: 'Der FTP-Server hat die Verbindung beendet.',
  450: 'Datei oder Ordner ist gerade nicht verfügbar.',
  530: 'Anmeldung fehlgeschlagen. Benutzername oder Passwort prüfen.',
  550: 'Nicht gefunden oder Zugriff verweigert.',
  553: 'Dieser Name ist nicht erlaubt.',
};

export function friendly(err: unknown): RemoteError {
  if (err instanceof RemoteError) return err;
  const raw = (err ?? {}) as Raw;
  const message = raw.message ?? String(err);

  if (raw.level === 'client-authentication' || /All configured authentication methods failed/i.test(message)) {
    return new RemoteError('Anmeldung fehlgeschlagen. Benutzername, Passwort oder Schlüssel prüfen.', 'auth');
  }
  if (typeof raw.code === 'number' && raw.code === 530) return new RemoteError(FTP_STATUS[530] as string, 'auth');
  if (/CERT|certificate|self.signed/i.test(`${raw.code ?? ''} ${message}`)) {
    return new RemoteError('Dem Zertifikat des Servers wird nicht vertraut. Aktiviere „Zertifikatsfehler ignorieren“, wenn du dem Server vertraust.');
  }
  for (const [pattern, text] of NETWORK) if (pattern.test(`${raw.code ?? ''} ${message}`)) return new RemoteError(text);
  if (typeof raw.code === 'number') {
    const known = SFTP_STATUS[raw.code] ?? FTP_STATUS[raw.code];
    if (known) return new RemoteError(known);
  }
  if (/No such file/i.test(message)) return new RemoteError(SFTP_STATUS[2] as string);
  if (/Permission denied/i.test(message)) return new RemoteError(SFTP_STATUS[3] as string);
  if (/AbortError|aborted/i.test(`${(err as Error).name} ${message}`)) return new RemoteError('Abgebrochen.');
  return new RemoteError(message);
}
