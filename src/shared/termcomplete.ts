export interface HistoryItem {
  cmd: string;
  count: number;
  last: number;
}

export interface TermItem {
  label: string;
  append: string;
  detail?: string;
  kind: 'history' | 'command' | 'subcommand' | 'option' | 'value';
}

export interface TermContext {
  history: HistoryItem[];
  units: string[];
  isRoot: boolean;
  manager: string;
}

export interface Hint {
  id: string;
  title: string;
  text: string;
  command: string | null;
}

interface Spec {
  desc: string;
  sub?: Record<string, string>;
  opts?: Record<string, string>;
  values?: Record<string, string[]>;
}

const UNITS = ['ssh', 'sshd', 'cron', 'ufw', 'docker', 'nginx', 'apache2', 'httpd', 'mariadb', 'mysql', 'fail2ban', 'php-fpm', 'redis', 'postgresql', 'networking', 'systemd-resolved'];
const PACKAGES = ['htop', 'curl', 'wget', 'git', 'nano', 'vim', 'ufw', 'nginx', 'apache2', 'mariadb-server', 'mariadb-client', 'docker.io', 'unzip', 'zip', 'certbot', 'fail2ban', 'net-tools', 'tmux', 'screen', 'ncdu', 'rsync', 'python3', 'python3-pip', 'nodejs', 'npm', 'default-jre-headless', 'openjdk-17-jre-headless', 'build-essential', 'jq', 'lsof', 'dnsutils', 'cron', 'php-fpm', 'redis-server'];

const SERVICE_ACTIONS = { start: 'Dienst starten', stop: 'Dienst stoppen', restart: 'Dienst neu starten', reload: 'Konfiguration neu laden', status: 'Status anzeigen', enable: 'Beim Hochfahren starten', disable: 'Nicht mehr beim Hochfahren starten', 'is-active': 'Läuft der Dienst?' };

export const COMMANDS: Record<string, Spec> = {
  ls: { desc: 'Dateien auflisten', opts: { '-l': 'Ausführliche Liste', '-a': 'Auch versteckte Dateien', '-la': 'Ausführlich mit versteckten', '-lh': 'Ausführlich mit lesbaren Größen', '-lah': 'Alles, lesbare Größen', '-t': 'Nach Zeit sortieren' } },
  cd: { desc: 'Ordner wechseln' },
  pwd: { desc: 'Aktuellen Ordner anzeigen' },
  cat: { desc: 'Datei ausgeben' },
  less: { desc: 'Datei seitenweise lesen' },
  nano: { desc: 'Datei bearbeiten' },
  vim: { desc: 'Datei mit vim bearbeiten' },
  tail: { desc: 'Dateiende anzeigen', opts: { '-f': 'Live mitlesen', '-n': 'Anzahl Zeilen', '-F': 'Live, auch bei Rotation' } },
  head: { desc: 'Dateianfang anzeigen', opts: { '-n': 'Anzahl Zeilen' } },
  grep: { desc: 'Text suchen', opts: { '-r': 'In Ordnern suchen', '-i': 'Groß-/Kleinschreibung ignorieren', '-n': 'Zeilennummern', '-v': 'Treffer ausschließen', '-c': 'Treffer zählen' } },
  find: { desc: 'Dateien suchen', opts: { '-name': 'Nach Name', '-type': 'Nach Typ', '-mtime': 'Nach Änderungsdatum', '-size': 'Nach Größe' } },
  cp: { desc: 'Kopieren', opts: { '-r': 'Ordner mitkopieren', '-a': 'Archivmodus', '-v': 'Ausführlich' } },
  mv: { desc: 'Verschieben oder umbenennen' },
  rm: { desc: 'Löschen', opts: { '-r': 'Ordner löschen', '-rf': 'Ordner ohne Rückfrage löschen', '-i': 'Vor jedem Löschen fragen' } },
  mkdir: { desc: 'Ordner anlegen', opts: { '-p': 'Auch fehlende Elternordner' } },
  touch: { desc: 'Leere Datei anlegen' },
  chmod: { desc: 'Rechte ändern', opts: { '-R': 'Rekursiv' }, values: { '': ['755', '644', '600', '700', '777', '+x', 'u+x', 'g+w'] } },
  chown: { desc: 'Besitzer ändern', opts: { '-R': 'Rekursiv' } },
  df: { desc: 'Speicherplatz der Laufwerke', opts: { '-h': 'Lesbare Größen' } },
  du: { desc: 'Platzbedarf von Ordnern', opts: { '-sh': 'Gesamtgröße, lesbar', '-h': 'Lesbare Größen', '--max-depth=1': 'Nur eine Ebene' } },
  free: { desc: 'Arbeitsspeicher anzeigen', opts: { '-h': 'Lesbare Größen', '-m': 'In Megabyte' } },
  top: { desc: 'Prozesse live ansehen' },
  htop: { desc: 'Prozesse live ansehen (komfortabel)' },
  ps: { desc: 'Prozesse auflisten', opts: { aux: 'Alle Prozesse', '-ef': 'Alle Prozesse, volle Form' } },
  kill: { desc: 'Prozess beenden', opts: { '-9': 'Sofort beenden', '-15': 'Höflich beenden' } },
  pkill: { desc: 'Prozess per Name beenden' },
  uptime: { desc: 'Laufzeit des Servers' },
  whoami: { desc: 'Angemeldeter Benutzer' },
  history: { desc: 'Befehlsverlauf der Shell' },
  clear: { desc: 'Bildschirm leeren' },
  reboot: { desc: 'Server neu starten' },
  shutdown: { desc: 'Server herunterfahren', opts: { '-h now': 'Sofort herunterfahren', '-r now': 'Sofort neu starten' } },
  curl: { desc: 'Webadresse abrufen', opts: { '-I': 'Nur Kopfzeilen', '-L': 'Weiterleitungen folgen', '-o': 'In Datei speichern', '-O': 'Mit Originalnamen speichern', '-s': 'Still', '-X': 'HTTP-Methode', '-H': 'Kopfzeile senden', '-d': 'Daten senden' } },
  wget: { desc: 'Datei herunterladen', opts: { '-O': 'Dateiname festlegen', '-c': 'Download fortsetzen', '-q': 'Still' } },
  tar: { desc: 'Archive packen und entpacken', opts: { '-xzf': 'tar.gz entpacken', '-czf': 'tar.gz erstellen', '-xf': 'Archiv entpacken', '-tf': 'Inhalt anzeigen', '-xvf': 'Entpacken, ausführlich' } },
  unzip: { desc: 'ZIP entpacken', opts: { '-d': 'Zielordner' } },
  zip: { desc: 'ZIP erstellen', opts: { '-r': 'Ordner einpacken' } },
  scp: { desc: 'Dateien per SSH kopieren', opts: { '-r': 'Ordner mitkopieren', '-P': 'Port' } },
  rsync: { desc: 'Ordner abgleichen', opts: { '-avz': 'Archiv, ausführlich, komprimiert', '-av': 'Archiv, ausführlich', '--progress': 'Fortschritt', '--delete': 'Überzählige löschen' } },
  ssh: { desc: 'Verbindung zu einem Server', opts: { '-p': 'Port', '-i': 'Schlüsseldatei' } },
  ping: { desc: 'Erreichbarkeit testen', opts: { '-c': 'Anzahl Pakete' } },
  ss: { desc: 'Offene Ports anzeigen', opts: { '-tulpn': 'Lauschende Ports mit Programmen', '-tulpen': 'Lauschende Ports, ausführlich' } },
  netstat: { desc: 'Netzwerkverbindungen', opts: { '-tulpn': 'Lauschende Ports mit Programmen' } },
  journalctl: { desc: 'Systemprotokoll lesen', opts: { '-u': 'Nur ein Dienst', '-f': 'Live mitlesen', '-n': 'Anzahl Zeilen', '-xe': 'Letzte Fehler', '--since': 'Seit Zeitpunkt', '-p': 'Nach Schweregrad' }, values: { '-u': UNITS } },
  systemctl: { desc: 'Dienste verwalten', sub: { ...SERVICE_ACTIONS, 'list-units': 'Alle Dienste auflisten', 'daemon-reload': 'Dienstdateien neu einlesen', 'list-unit-files': 'Alle Dienstdateien', 'is-enabled': 'Startet der Dienst beim Hochfahren?' }, opts: { '--type=service': 'Nur Dienste', '--failed': 'Nur fehlgeschlagene', '--no-pager': 'Ohne Seitenansicht' } },
  service: { desc: 'Dienste verwalten (alt)', sub: { start: 'Starten', stop: 'Stoppen', restart: 'Neu starten', status: 'Status' } },
  apt: { desc: 'Pakete verwalten (Debian/Ubuntu)', sub: { install: 'Paket installieren', remove: 'Paket entfernen', update: 'Paketlisten aktualisieren', upgrade: 'Pakete aktualisieren', search: 'Paket suchen', show: 'Paketinfo', autoremove: 'Unnötiges entfernen', purge: 'Paket samt Konfiguration entfernen', list: 'Pakete auflisten', 'full-upgrade': 'Vollständig aktualisieren' }, opts: { '-y': 'Ohne Rückfrage', '--installed': 'Nur installierte', '--upgradable': 'Nur aktualisierbare' }, values: { install: PACKAGES, remove: PACKAGES, purge: PACKAGES, show: PACKAGES } },
  'apt-get': { desc: 'Pakete verwalten (Debian/Ubuntu)', sub: { install: 'Paket installieren', remove: 'Paket entfernen', update: 'Paketlisten aktualisieren', upgrade: 'Pakete aktualisieren', autoremove: 'Unnötiges entfernen', purge: 'Paket samt Konfiguration entfernen' }, opts: { '-y': 'Ohne Rückfrage' }, values: { install: PACKAGES, remove: PACKAGES, purge: PACKAGES } },
  dnf: { desc: 'Pakete verwalten (Fedora/RHEL)', sub: { install: 'Installieren', remove: 'Entfernen', update: 'Aktualisieren', search: 'Suchen', 'check-update': 'Updates prüfen' }, opts: { '-y': 'Ohne Rückfrage' }, values: { install: PACKAGES, remove: PACKAGES } },
  yum: { desc: 'Pakete verwalten (RHEL)', sub: { install: 'Installieren', remove: 'Entfernen', update: 'Aktualisieren', search: 'Suchen' }, opts: { '-y': 'Ohne Rückfrage' }, values: { install: PACKAGES, remove: PACKAGES } },
  pacman: { desc: 'Pakete verwalten (Arch)', opts: { '-S': 'Installieren', '-Syu': 'System aktualisieren', '-R': 'Entfernen', '-Ss': 'Suchen' } },
  apk: { desc: 'Pakete verwalten (Alpine)', sub: { add: 'Installieren', del: 'Entfernen', update: 'Listen aktualisieren', upgrade: 'Aktualisieren', search: 'Suchen' }, values: { add: PACKAGES, del: PACKAGES } },
  ufw: { desc: 'Firewall verwalten', sub: { status: 'Status anzeigen', enable: 'Firewall einschalten', disable: 'Firewall ausschalten', allow: 'Port oder Dienst erlauben', deny: 'Port sperren', delete: 'Regel löschen', reload: 'Neu laden', reset: 'Zurücksetzen' }, opts: { verbose: 'Ausführlich', numbered: 'Nummerierte Regeln' }, values: { allow: ['22/tcp', '80/tcp', '443/tcp', '3306/tcp', '25565/tcp', 'ssh', 'http', 'https'], deny: ['3306/tcp', '23/tcp'], status: ['verbose', 'numbered'] } },
  docker: { desc: 'Container verwalten', sub: { ps: 'Laufende Container', images: 'Images auflisten', run: 'Container starten', stop: 'Container stoppen', start: 'Container starten', restart: 'Container neu starten', rm: 'Container löschen', rmi: 'Image löschen', logs: 'Protokoll lesen', exec: 'Befehl im Container', pull: 'Image laden', build: 'Image bauen', compose: 'Compose-Projekte', stats: 'Ressourcenverbrauch', inspect: 'Details', network: 'Netzwerke', volume: 'Datenspeicher', system: 'Aufräumen und Info' }, opts: { '-d': 'Im Hintergrund', '-it': 'Interaktiv', '--rm': 'Danach löschen', '-p': 'Port weiterleiten', '-v': 'Ordner einbinden', '--name': 'Name festlegen', '-a': 'Auch beendete' } },
  'docker compose': { desc: 'Compose-Projekte', sub: { up: 'Starten', down: 'Stoppen und entfernen', ps: 'Status', logs: 'Protokoll', restart: 'Neu starten', pull: 'Images laden', build: 'Bauen', stop: 'Stoppen', start: 'Starten', exec: 'Befehl im Dienst' }, opts: { '-d': 'Im Hintergrund', '-f': 'Datei wählen', '--build': 'Vorher bauen' } },
  git: { desc: 'Versionsverwaltung', sub: { status: 'Änderungen anzeigen', add: 'Dateien vormerken', commit: 'Änderungen speichern', push: 'Hochladen', pull: 'Herunterladen und zusammenführen', clone: 'Repository kopieren', log: 'Verlauf', diff: 'Unterschiede', checkout: 'Branch wechseln', branch: 'Branches', merge: 'Zusammenführen', stash: 'Zwischenlagern', fetch: 'Abrufen', reset: 'Zurücksetzen', remote: 'Gegenstellen', init: 'Neues Repository', restore: 'Wiederherstellen', switch: 'Branch wechseln', tag: 'Markierungen' }, opts: { '-m': 'Nachricht', '--oneline': 'Kurz', '-a': 'Alle', '--hard': 'Hart zurücksetzen', '--stat': 'Statistik', '-b': 'Neuer Branch' } },
  mariadb: { desc: 'MariaDB-Client', opts: { '-u': 'Benutzer', '-p': 'Passwort abfragen', '-h': 'Server', '-P': 'Port', '-e': 'Befehl ausführen', '--version': 'Version' } },
  mysql: { desc: 'MySQL/MariaDB-Client', opts: { '-u': 'Benutzer', '-p': 'Passwort abfragen', '-h': 'Server', '-P': 'Port', '-e': 'Befehl ausführen' } },
  mysqldump: { desc: 'Datenbank sichern', opts: { '-u': 'Benutzer', '-p': 'Passwort abfragen', '--all-databases': 'Alle Datenbanken', '--single-transaction': 'Konsistent ohne Sperren' } },
  crontab: { desc: 'Zeitgesteuerte Aufgaben', opts: { '-e': 'Bearbeiten', '-l': 'Anzeigen', '-r': 'Alle löschen' } },
  sudo: { desc: 'Befehl als Administrator', opts: { '-i': 'Als root anmelden', '-u': 'Als anderer Benutzer', '-s': 'Shell als root' } },
  su: { desc: 'Benutzer wechseln', opts: { '-': 'Mit Umgebung des Benutzers' } },
  passwd: { desc: 'Passwort ändern' },
  useradd: { desc: 'Benutzer anlegen', opts: { '-m': 'Mit Home-Ordner', '-s': 'Shell festlegen', '-G': 'Gruppen' } },
  nginx: { desc: 'Nginx', opts: { '-t': 'Konfiguration prüfen', '-s reload': 'Neu laden', '-v': 'Version' } },
  apache2ctl: { desc: 'Apache steuern', sub: { configtest: 'Konfiguration prüfen', restart: 'Neu starten', graceful: 'Sanft neu laden', status: 'Status' } },
  certbot: { desc: 'HTTPS-Zertifikate', sub: { certificates: 'Zertifikate anzeigen', renew: 'Erneuern', certonly: 'Nur Zertifikat holen' }, opts: { '--nginx': 'Nginx nutzen', '--apache': 'Apache nutzen', '--dry-run': 'Nur testen' } },
  tmux: { desc: 'Terminal-Sitzungen', sub: { new: 'Neue Sitzung', attach: 'Sitzung öffnen', ls: 'Sitzungen auflisten', kill: 'Sitzung beenden' }, opts: { '-s': 'Name', '-t': 'Ziel' } },
  screen: { desc: 'Terminal-Sitzungen', opts: { '-S': 'Neue Sitzung mit Namen', '-r': 'Sitzung öffnen', '-ls': 'Sitzungen auflisten' } },
  java: { desc: 'Java-Programm starten', opts: { '-jar': 'JAR-Datei starten', '-Xmx': 'Maximaler Speicher', '-Xms': 'Start-Speicher', '-version': 'Version' } },
  node: { desc: 'Node.js', opts: { '-v': 'Version' } },
  npm: { desc: 'Node-Pakete', sub: { install: 'Installieren', run: 'Skript ausführen', start: 'Starten', test: 'Tests', build: 'Bauen', update: 'Aktualisieren', init: 'Neues Projekt' } },
  python3: { desc: 'Python', opts: { '-m': 'Modul ausführen', '--version': 'Version' } },
  pip: { desc: 'Python-Pakete', sub: { install: 'Installieren', uninstall: 'Entfernen', list: 'Auflisten', freeze: 'Auflisten (Format)' } },
  lsof: { desc: 'Offene Dateien und Ports', opts: { '-i': 'Netzwerkverbindungen', '-i :80': 'Wer nutzt Port 80?' } },
  ip: { desc: 'Netzwerk anzeigen', sub: { a: 'Adressen', addr: 'Adressen', link: 'Schnittstellen', route: 'Routen' } },
  hostname: { desc: 'Servername', opts: { '-I': 'IP-Adressen' } },
  uname: { desc: 'Systeminfo', opts: { '-a': 'Alles' } },
  date: { desc: 'Datum und Uhrzeit' },
  exit: { desc: 'Sitzung beenden' },
};

const SENSITIVE = [
  /\b(pass(?:word|wd)?|passphrase|secret|token|api[-_]?key|apikey|authorization|bearer|private[-_]?key|credentials?)\b/i,
  /(?:mysql|mariadb|mysqldump|mysqladmin)\S*\s.*\s-p\S/i,
  /\bsshpass\b/i,
  /:\/\/[^\s:/@]+:[^\s@]+@/,
  /(?:^|\s)export\s+\w*(?:KEY|SECRET|TOKEN|PASS)\w*=/i,
];

export const isSensitive = (line: string): boolean => line.startsWith(' ') || SENSITIVE.some((r) => r.test(line));

export function splitInput(input: string): { tokens: string[]; fragment: string; endsWithSpace: boolean } {
  const endsWithSpace = /\s$/.test(input);
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  return { tokens, fragment: endsWithSpace ? '' : (tokens[tokens.length - 1] ?? ''), endsWithSpace };
}

export function extractInput(lineBeforeCursor: string): { input: string; shell: boolean } | null {
  const match = /^(.*?[$#%>]) (?=\S|$)/.exec(lineBeforeCursor);
  if (!match) return null;
  const prompt = match[1] ?? '';
  const input = lineBeforeCursor.slice(match[0].length);
  const shell = (/[\w.-]+@[\w.-]+/.test(prompt) || /(^|\s|\])[$#]$/.test(prompt)) && !/mariadb|mysql|sqlite|psql|>>>|\(gdb\)|irb|sql>|redis/i.test(prompt);
  return { input, shell };
}

function bump(map: Map<string, number>, key: string, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function matches(list: string[], fragment: string): string[] {
  const f = fragment.toLowerCase();
  return list.filter((x) => x.toLowerCase().startsWith(f) && x.toLowerCase() !== f);
}

export function suggestInput(input: string, ctx: TermContext, force = false): TermItem[] {
  if (!input.trim()) return force ? ctx.history.slice().sort((a, b) => b.last - a.last).slice(0, 6).map((h) => ({ label: h.cmd, append: h.cmd, kind: 'history' as const, detail: 'Verlauf' })) : [];
  const out: TermItem[] = [];
  const seen = new Set<string>();
  const push = (item: TermItem): void => {
    const key = `${item.append}`;
    if (seen.has(key) || item.append === '') return;
    seen.add(key);
    out.push(item);
  };

  const scored = ctx.history
    .filter((h) => h.cmd.startsWith(input) && h.cmd !== input && h.cmd.length > input.length)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, 3);
  for (const h of scored) push({ label: h.cmd, append: h.cmd.slice(input.length), kind: 'history', detail: h.count > 1 ? `Verlauf · ${h.count}×` : 'Verlauf' });

  const { tokens, fragment, endsWithSpace } = splitInput(input);
  let words = tokens;
  while (words[0] === 'sudo' && words.length > (endsWithSpace ? 0 : 1) && words[1] !== undefined && !words[1].startsWith('-')) words = words.slice(1);
  const index = endsWithSpace ? words.length : words.length - 1;

  if (index === 0 || (words[0] === 'sudo' && index === 1)) {
    const names = new Map<string, number>();
    for (const c of Object.keys(COMMANDS)) if (!c.includes(' ')) bump(names, c, 1);
    for (const h of ctx.history) {
      const first = h.cmd.split(/\s+/)[0] ?? '';
      if (first && first !== 'sudo' && !first.includes('/')) bump(names, first, 2 + Math.min(h.count, 5));
    }
    const candidates = matches([...names.keys()], fragment).sort((a, b) => (names.get(b) ?? 0) - (names.get(a) ?? 0) || a.length - b.length || a.localeCompare(b));
    for (const name of candidates.slice(0, 6)) push({ label: name, append: name.slice(fragment.length), kind: 'command', detail: COMMANDS[name]?.desc });
    return out.slice(0, 6);
  }

  const first = words[0] as string;
  const compound = words[1] ? `${first} ${words[1]}` : '';
  const spec = (index >= 2 && COMMANDS[compound]) || COMMANDS[first];
  if (!spec) return out.slice(0, 6);
  const base = spec === COMMANDS[compound] ? 2 : 1;
  const prev = endsWithSpace ? words[words.length - 1] ?? '' : words[words.length - 2] ?? '';
  const subIndex = index - base + 1;

  const valueSet = spec.values?.[prev] ?? (first === 'systemctl' && ['start', 'stop', 'restart', 'reload', 'status', 'enable', 'disable', 'is-active', 'is-enabled'].includes(prev) ? [...new Set([...ctx.units, ...UNITS])] : undefined) ?? (first === 'service' && index === 1 ? [...new Set([...ctx.units, ...UNITS])] : undefined) ?? (first === 'chmod' && index === 1 ? spec.values?.[''] : undefined);

  if (fragment.startsWith('-') && spec.opts) {
    for (const name of matches(Object.keys(spec.opts), fragment).slice(0, 6)) push({ label: name, append: name.slice(fragment.length), kind: 'option', detail: spec.opts[name] });
  } else if (valueSet) {
    for (const name of matches(valueSet, fragment).slice(0, 6)) push({ label: name, append: name.slice(fragment.length), kind: 'value' });
  } else if (spec.sub && subIndex === 1 && !fragment.startsWith('-')) {
    for (const name of matches(Object.keys(spec.sub), fragment).slice(0, 6)) push({ label: name, append: name.slice(fragment.length), kind: 'subcommand', detail: spec.sub[name] });
  } else if (spec.opts && fragment === '' && endsWithSpace) {
    for (const name of Object.keys(spec.opts).slice(0, 4)) push({ label: name, append: name, kind: 'option', detail: spec.opts[name] });
  }
  if (first === 'systemctl' && subIndex === 1 && fragment === '' && endsWithSpace) return out.slice(0, 6);
  return out.slice(0, 6);
}

const PACKAGE_FOR: Record<string, string> = { ifconfig: 'net-tools', netstat: 'net-tools', dig: 'dnsutils', nslookup: 'dnsutils', pip: 'python3-pip', pip3: 'python3-pip', node: 'nodejs', java: 'default-jre-headless', unzip: 'unzip', zip: 'zip', htop: 'htop', ncdu: 'ncdu', tmux: 'tmux', screen: 'screen', jq: 'jq', lsof: 'lsof', git: 'git', curl: 'curl', wget: 'wget', nano: 'nano', vim: 'vim', rsync: 'rsync', mysql: 'mariadb-client', mariadb: 'mariadb-client', nginx: 'nginx', ufw: 'ufw', docker: 'docker.io', certbot: 'certbot', make: 'build-essential', gcc: 'build-essential' };

function installLine(manager: string, pkg: string, isRoot: boolean): string {
  const sudo = isRoot ? '' : 'sudo ';
  const base = { apt: `apt install -y ${pkg}`, dnf: `dnf install -y ${pkg}`, yum: `yum install -y ${pkg}`, pacman: `pacman -S --noconfirm ${pkg}`, apk: `apk add ${pkg}`, zypper: `zypper install -y ${pkg}` }[manager] ?? `apt install -y ${pkg}`;
  return `${sudo}${base}`;
}

export function detectHint(output: string, lastCommand: string | null, ctx: Pick<TermContext, 'isRoot' | 'manager'>): Hint | null {
  const text = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  const missing = /(?:^|\n)(?:-?(?:ba|z)?sh: (?:line \d+: )?)?([A-Za-z0-9_.+-]+): (?:command not found|Befehl nicht gefunden)/i.exec(text) ?? /Command '([A-Za-z0-9_.+-]+)' not found/.exec(text);
  if (missing) {
    const name = missing[1] as string;
    const pkg = PACKAGE_FOR[name] ?? name;
    return { id: `missing:${name}`, title: `„${name}“ ist nicht installiert`, text: `Soll Feather den Befehl zum Installieren vorbereiten? Du drückst danach selbst Enter.`, command: installLine(ctx.manager, pkg, ctx.isRoot) };
  }
  const unit = /Unit ([\w@.-]+?)(?:\.service)? could not be found/i.exec(text);
  if (unit) {
    const name = unit[1] as string;
    return { id: `unit:${name}`, title: `Dienst „${name}“ nicht gefunden`, text: 'Suche, wie der Dienst auf diesem Server heißt.', command: `systemctl list-units --type=service --all | grep -i ${name}` };
  }
  if (/Could not get lock|Unable to acquire the dpkg|dpkg frontend lock|Waiting for cache lock/i.test(text)) {
    return { id: 'lock', title: 'Ein anderer Paketvorgang läuft noch', text: 'Warte einen Moment, bis er fertig ist, und wiederhole den Befehl dann.', command: lastCommand };
  }
  const port = /(?:Address already in use|address already in use|EADDRINUSE)[^\n]*?:(\d{2,5})|:(\d{2,5})[^\n]*(?:Address already in use|EADDRINUSE)/.exec(text);
  if (port) {
    const number = port[1] ?? port[2];
    return { id: `port:${number}`, title: `Port ${number} ist schon belegt`, text: 'Finde heraus, welches Programm ihn benutzt.', command: `ss -tulpn | grep :${number}` };
  }
  if (/No space left on device|Kein Speicherplatz mehr/i.test(text)) {
    return { id: 'space', title: 'Der Speicherplatz ist voll', text: 'Sieh nach, welches Laufwerk voll ist.', command: 'df -h' };
  }
  if (lastCommand && !ctx.isRoot && !/^sudo\b/.test(lastCommand) && !/^(ssh|scp|rsync)\b/.test(lastCommand) && /Permission denied|Operation not permitted|Zugriff verweigert|Keine Berechtigung/i.test(text) && !/Permission denied \(publickey/i.test(text)) {
    return { id: 'sudo', title: 'Dafür fehlen die Rechte', text: 'Wiederhole den Befehl als Administrator.', command: `sudo ${lastCommand}` };
  }
  return null;
}
