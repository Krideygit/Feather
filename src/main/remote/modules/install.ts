import { ID_PATTERN, type InstallOptions, type MariaDbInstallOptions, type ModuleId, type PackageManager, type SystemInfo } from '../../../shared/modules';
import { RemoteError } from '../../../shared/remote';
import { sqlString } from './mariadb';

export interface Plan {
  script: string;
  steps: string[];
  payload?: string;
}

type ByManager = Record<Exclude<PackageManager, 'unknown'>, string>;

const PACKAGES: Record<ModuleId, ByManager> = {
  mariadb: { apt: 'mariadb-server mariadb-client', dnf: 'mariadb-server', yum: 'mariadb-server', zypper: 'mariadb mariadb-client', pacman: 'mariadb', apk: 'mariadb mariadb-client' },
  nginx: { apt: 'nginx', dnf: 'nginx', yum: 'nginx', zypper: 'nginx', pacman: 'nginx', apk: 'nginx' },
  apache: { apt: 'apache2', dnf: 'httpd', yum: 'httpd', zypper: 'apache2', pacman: 'apache', apk: 'apache2' },
};

const REFRESH: ByManager = {
  apt: 'apt-get update -y',
  dnf: 'dnf -y makecache',
  yum: 'yum -y makecache',
  zypper: 'zypper --non-interactive refresh',
  pacman: 'pacman -Sy --noconfirm',
  apk: 'apk update',
};

const ADD: ByManager = {
  apt: 'apt-get install -y',
  dnf: 'dnf install -y',
  yum: 'yum install -y',
  zypper: 'zypper --non-interactive install',
  pacman: 'pacman -S --noconfirm --needed',
  apk: 'apk add',
};

const REMOVE = (purge: boolean): ByManager => ({
  apt: purge ? 'apt-get purge -y' : 'apt-get remove -y',
  dnf: 'dnf remove -y',
  yum: 'yum remove -y',
  zypper: 'zypper --non-interactive remove',
  pacman: purge ? 'pacman -Rns --noconfirm' : 'pacman -R --noconfirm',
  apk: 'apk del',
});

const SERVICES: Record<ModuleId, string> = {
  mariadb: 'mariadb mysql mysqld',
  nginx: 'nginx',
  apache: 'apache2 httpd',
};

const POST_INSTALL_MARIADB: Partial<Record<PackageManager, string>> = {
  pacman: 'mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql',
  apk: 'mysql_install_db --user=mysql --datadir=/var/lib/mysql',
};

function manager(sys: SystemInfo): Exclude<PackageManager, 'unknown'> {
  if (!sys.supported || sys.pm === 'unknown') throw new RemoteError(sys.reason || 'Dieses System wird nicht unterstützt.');
  return sys.pm;
}

const header = 'set -e\n';

export function validateMariaDb(options: InstallOptions): MariaDbInstallOptions {
  const port = Number(options.port ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RemoteError('Der Port muss zwischen 1 und 65535 liegen.');
  const user = String(options.user ?? '').trim();
  const database = String(options.database ?? '').trim();
  const password = String(options.password ?? '');
  const userHost = options.userHost === '%' ? '%' : 'localhost';
  if (user) {
    if (!ID_PATTERN.test(user)) throw new RemoteError('Der Benutzername darf nur Buchstaben, Zahlen und _ enthalten.');
    if (password.length < 8) throw new RemoteError('Das Passwort für den Datenbank-Benutzer braucht mindestens 8 Zeichen.');
    if (database && !ID_PATTERN.test(database)) throw new RemoteError('Der Datenbankname darf nur Buchstaben, Zahlen und _ enthalten.');
  }
  return { port, remote: options.remote === true, firewall: options.firewall !== false, database: user ? database : '', user, password, userHost };
}

export function installPlan(module: ModuleId, sys: SystemInfo, raw: InstallOptions): Plan {
  const pm = manager(sys);
  const packages = PACKAGES[module][pm];
  const steps = ['Paketlisten werden aktualisiert', `${module === 'mariadb' ? 'MariaDB' : module === 'nginx' ? 'Nginx' : 'Apache'} wird installiert`];
  let body = `step "${steps[0]}"\n${REFRESH[pm]}\nstep "${steps[1]}"\n${ADD[pm]} ${packages}\n`;
  let payload: string | undefined;

  if (module === 'mariadb') {
    const o = validateMariaDb(raw);
    const post = POST_INSTALL_MARIADB[pm];
    if (post) body += `if [ ! -d /var/lib/mysql/mysql ]; then\n${post}\nfi\n`;
    const custom = o.remote || o.port !== 3306;
    if (custom) {
      steps.push('Einstellungen werden geschrieben');
      body += `step "Einstellungen werden geschrieben"\n${writeConfig(o.port, o.remote)}`;
    }
    steps.push('MariaDB wird gestartet');
    body += `step "MariaDB wird gestartet"\nNAME="$(pick_service mariadb mysql mysqld)"\nsvc enable "$NAME"\nsvc restart "$NAME"\n${waitReady()}`;
    if (o.user) {
      steps.push('Datenbank-Benutzer wird angelegt');
      body += `step "Datenbank-Benutzer wird angelegt"\nDB="$(command -v mariadb || command -v mysql)"\n"$DB" --batch < "$FEATHER_PAYLOAD"\n`;
      payload = newUserSql(o);
    }
    if (o.remote && o.firewall) {
      steps.push('Firewall wird eingerichtet');
      body += `step "Firewall wird eingerichtet"\nfw_allow ${o.port}\n`;
    }
  } else {
    steps.push(`${module === 'nginx' ? 'Nginx' : 'Apache'} wird gestartet`);
    body += `step "${steps[2]}"\nNAME="$(pick_service ${SERVICES[module]})"\nsvc enable "$NAME"\nsvc restart "$NAME"\n`;
    if (module === 'apache' && pm === 'pacman') {
      body += `mkdir -p "$ETC/httpd/conf/feather"\ngrep -q 'conf/feather/' "$ETC/httpd/conf/httpd.conf" || echo 'IncludeOptional conf/feather/*.conf' >> "$ETC/httpd/conf/httpd.conf"\n`;
    }
    if (raw.firewall !== false) {
      steps.push('Firewall wird eingerichtet');
      body += `step "Firewall wird eingerichtet"\nfw_allow 80\nfw_allow 443\n`;
    }
  }
  steps.push('Fertig');
  body += `step "Fertig"\n`;
  return { script: header + body, steps, payload };
}

export function uninstallPlan(module: ModuleId, sys: SystemInfo, purge: boolean): Plan {
  const pm = manager(sys);
  const steps = ['Dienst wird gestoppt', 'Pakete werden entfernt'];
  let body = `step "${steps[0]}"\nNAME="$(pick_service ${SERVICES[module]} || true)"\nif [ -n "$NAME" ]; then svc stop "$NAME" || true; svc disable "$NAME" || true; fi\n`;
  body += `step "${steps[1]}"\n${REMOVE(purge)[pm]} ${PACKAGES[module][pm]}\n`;
  if (pm === 'apt') body += 'apt-get autoremove -y || true\n';
  if (module === 'mariadb') {
    body += 'rm -f "$ETC/mysql/mariadb.conf.d/99-feather.cnf" "$ETC/my.cnf.d/99-feather.cnf"\n';
    if (purge) {
      steps.push('Datenbanken werden gelöscht');
      body += `step "Datenbanken werden gelöscht"\nrm -rf /var/lib/mysql\n`;
    }
  }
  steps.push('Fertig');
  body += `step "Fertig"\n`;
  return { script: header + body, steps };
}

export function writeConfig(port: number, remote: boolean): string {
  return `if [ -d "$ETC/mysql/mariadb.conf.d" ]; then CNF="$ETC/mysql/mariadb.conf.d/99-feather.cnf"; else mkdir -p "$ETC/my.cnf.d"; CNF="$ETC/my.cnf.d/99-feather.cnf"; fi
cat > "$CNF" <<'FEATHER_CNF'
[mysqld]
bind-address = ${remote ? '0.0.0.0' : '127.0.0.1'}
port = ${port}
FEATHER_CNF
`;
}

export function waitReady(): string {
  return `DB="$(command -v mariadb || command -v mysql)"\ni=0\nuntil "$DB" -e 'SELECT 1' >/dev/null 2>&1; do\n  i=$((i + 1))\n  if [ "$i" -gt 30 ]; then echo "MariaDB antwortet nicht."; exit 1; fi\n  sleep 1\ndone\n`;
}

export function newUserSql(o: Pick<MariaDbInstallOptions, 'user' | 'userHost' | 'password' | 'database'>): string {
  const account = `${sqlString(o.user)}@${sqlString(o.userHost)}`;
  const lines = [`CREATE OR REPLACE USER ${account} IDENTIFIED BY ${sqlString(o.password)};`];
  if (o.database) {
    lines.push(`CREATE DATABASE IF NOT EXISTS \`${o.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    lines.push(`GRANT ALL PRIVILEGES ON \`${o.database}\`.* TO ${account};`);
  } else {
    lines.push(`GRANT ALL PRIVILEGES ON *.* TO ${account} WITH GRANT OPTION;`);
  }
  lines.push('FLUSH PRIVILEGES;');
  return `${lines.join('\n')}\n`;
}
