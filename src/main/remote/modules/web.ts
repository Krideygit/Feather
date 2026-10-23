import {
  DOMAIN_PATTERN,
  PATH_PATTERN,
  SITE_PATTERN,
  type ControlAction,
  type LogKind,
  type ModuleId,
  type NewSite,
  type SiteInfo,
  type SystemInfo,
} from '../../../shared/modules';
import { RemoteError } from '../../../shared/remote';
import type { Session } from '../session';
import { run, system } from './shell';

type Web = Exclude<ModuleId, 'mariadb'>;

const SERVICES: Record<ModuleId, string> = { mariadb: 'mariadb mysql mysqld', nginx: 'nginx', apache: 'apache2 httpd' };

export function siteDir(web: Web, sys: SystemInfo): string {
  if (!sys.sites) throw new RemoteError('Die Website-Verwaltung ist für dieses System noch nicht verfügbar.');
  if (web === 'nginx') return '$ETC/nginx/conf.d';
  switch (sys.pm) {
    case 'apt':
      return '$ETC/apache2/conf-enabled';
    case 'dnf':
    case 'yum':
      return '$ETC/httpd/conf.d';
    case 'zypper':
      return '$ETC/apache2/vhosts.d';
    default:
      return '$ETC/apache2/conf.d';
  }
}

const TEST: Record<Web, string> = {
  nginx: 'nginx -t 2>&1',
  apache: 'if have apache2ctl; then apache2ctl configtest 2>&1; elif have apachectl; then apachectl configtest 2>&1; else httpd -t 2>&1; fi',
};

export function controlScript(module: ModuleId, action: ControlAction): string {
  if (!['start', 'stop', 'restart', 'reload', 'enable', 'disable'].includes(action)) throw new RemoteError('Unbekannte Aktion.');
  return `NAME="$(pick_service ${SERVICES[module]})" || { echo "Dienst nicht gefunden" >&2; exit 1; }\nsvc ${action} "$NAME"\n`;
}

export async function control(session: Session, module: ModuleId, action: ControlAction, sudoPassword?: string): Promise<void> {
  const result = await run(session, controlScript(module, action), { admin: true, sudoPassword });
  if (result.code !== 0) throw new RemoteError(tidy(result.stderr || result.stdout) || 'Der Dienst konnte nicht gesteuert werden.');
}

export function tidy(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-6)
    .join('\n');
}

export async function configTest(session: Session, web: Web, sudoPassword?: string): Promise<{ ok: boolean; output: string }> {
  const result = await run(session, `${TEST[web]}\n`, { admin: true, sudoPassword });
  return { ok: result.code === 0, output: tidy(result.stdout + result.stderr) };
}

export function parseSites(output: string): SiteInfo[] {
  const sites: SiteInfo[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^site\|([01])\|# feather-site (.*)$/.exec(line.trim());
    if (!match) continue;
    const fields = Object.fromEntries((match[2] as string).split(' ').map((p) => p.split('=')).filter((p) => p.length === 2)) as Record<string, string>;
    if (!fields.name) continue;
    sites.push({ name: fields.name, domain: fields.domain === '_' ? '' : (fields.domain ?? ''), port: Number(fields.port) || 80, root: fields.root ?? '', enabled: match[1] === '1' });
  }
  return sites.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSites(session: Session, web: Web, sudoPassword?: string): Promise<SiteInfo[]> {
  const sys = await system(session);
  const dir = siteDir(web, sys);
  const script = `D="${dir}"
for f in "$D"/feather-*.conf "$D"/feather-*.conf.disabled; do
  [ -f "$f" ] || continue
  en=1
  case "$f" in *.disabled) en=0 ;; esac
  printf 'site|%s|%s\\n' "$en" "$(head -n 1 "$f")"
done
`;
  const result = await run(session, script, { admin: true, sudoPassword });
  return parseSites(result.stdout);
}

export function validateSite(site: NewSite): NewSite {
  if (!SITE_PATTERN.test(site.name)) throw new RemoteError('Der Name darf nur Kleinbuchstaben, Zahlen und - enthalten und muss mit einem Buchstaben oder einer Zahl beginnen.');
  const domain = site.domain.trim();
  if (domain && !DOMAIN_PATTERN.test(domain)) throw new RemoteError('Die Domain ist ungültig. Beispiel: meine-seite.de');
  if (!Number.isInteger(site.port) || site.port < 1 || site.port > 65535) throw new RemoteError('Der Port muss zwischen 1 und 65535 liegen.');
  if (!PATH_PATTERN.test(site.root) || site.root.includes('..') || site.root.includes('//')) throw new RemoteError('Der Ordner muss ein absoluter Pfad sein, z. B. /var/www/meine-seite (nur Buchstaben, Zahlen und . _ - /).');
  if (['/', '/etc', '/bin', '/usr', '/var', '/root', '/boot', '/dev', '/proc', '/sys', '/lib', '/sbin'].includes(site.root.replace(/\/+$/, ''))) throw new RemoteError('Dieser Ordner darf nicht als Website-Ordner dienen.');
  return { ...site, domain };
}

export function siteConfig(web: Web, site: NewSite, pm: string, standard: boolean): string {
  const domain = site.domain || '_';
  const head = `# feather-site name=${site.name} domain=${domain} port=${site.port} root=${site.root}`;
  if (web === 'nginx') {
    const flag = standard ? ' default_server' : '';
    return `${head}
server {
    listen ${site.port}${flag};
    listen [::]:${site.port}${flag};
    server_name ${domain};
    root ${site.root};
    index index.html index.htm;
    location / {
        try_files $uri $uri/ =404;
    }
    access_log /var/log/nginx/${site.name}.access.log;
    error_log /var/log/nginx/${site.name}.error.log;
}
`;
  }
  const logDir = pm === 'apt' ? '${APACHE_LOG_DIR}' : pm === 'dnf' || pm === 'yum' ? 'logs' : '/var/log/apache2';
  const listen = site.port !== 80 && site.port !== 443 ? `Listen ${site.port}\n` : '';
  return `${head}
${listen}<VirtualHost *:${site.port}>
    ServerName ${domain === '_' ? 'localhost' : domain}
    DocumentRoot ${site.root}
    <Directory ${site.root}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    ErrorLog ${logDir}/${site.name}-error.log
    CustomLog ${logDir}/${site.name}-access.log combined
</VirtualHost>
`;
}

const OWNER = `OWNER=""
for u in www-data nginx apache http wwwrun; do if id "$u" >/dev/null 2>&1; then OWNER="$u"; break; fi; done
`;

const WELCOME = (name: string): string => `if [ -z "$(ls -A "$ROOT" 2>/dev/null)" ]; then
cat > "$ROOT/index.html" <<'FEATHER_HTML'
<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${name}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0}main{text-align:center}h1{font-size:2.2rem;margin:0 0 .5rem}p{color:#94a3b8}</style></head>
<body><main><h1>${name} ist online</h1><p>Diese Seite wurde mit Feather eingerichtet. Lade deine Dateien in den Website-Ordner hoch.</p></main></body></html>
FEATHER_HTML
fi
`;

export async function createSite(session: Session, web: Web, input: NewSite, sudoPassword?: string): Promise<void> {
  const sys = await system(session);
  const site = validateSite(input);
  const dir = siteDir(web, sys);
  const standard = web === 'nginx' && sys.pm === 'apt' && site.domain === '' && site.port === 80;
  const config = siteConfig(web, site, sys.pm, standard);
  const conflict = site.domain === '' && site.port === 80 && !standard
    ? 'echo "Ohne Domain lässt sich Port 80 auf diesem System nicht belegen. Gib eine Domain an oder nutze einen anderen Port." >&2; exit 2\n'
    : '';
  const listen = web === 'apache' && site.port !== 80 && site.port !== 443
    ? `if grep -rqs "^Listen ${site.port}$" "$ETC/apache2" "$ETC/httpd" 2>/dev/null; then grep -v "^Listen ${site.port}$" "$FEATHER_PAYLOAD" > "$FEATHER_PAYLOAD.new"; mv "$FEATHER_PAYLOAD.new" "$FEATHER_PAYLOAD"; fi\n`
    : '';
  const script = `set -e
D="${dir}"
ROOT="${site.root}"
F="$D/feather-${site.name}.conf"
${conflict}if [ -e "$F" ] || [ -e "$F.disabled" ]; then echo "Eine Website mit diesem Namen existiert bereits." >&2; exit 2; fi
mkdir -p "$D" "$ROOT"
${OWNER}${WELCOME(site.name)}if [ -n "$OWNER" ]; then chown -R "$OWNER" "$ROOT" 2>/dev/null || true; fi
${listen}${standard ? 'if [ -e "$ETC/nginx/sites-enabled/default" ]; then rm -f "$ETC/nginx/sites-enabled/default"; fi\n' : ''}cp "$FEATHER_PAYLOAD" "$F"
if ! out="$(${TEST[web]})"; then rm -f "$F"; echo "$out" >&2; exit 3; fi
NAME="$(pick_service ${SERVICES[web]})"
svc reload "$NAME" 2>&1 || svc restart "$NAME"
${site.firewall ? `fw_allow ${site.port}\n` : ''}`;
  const result = await run(session, script, { admin: true, payload: config, sudoPassword });
  if (result.code !== 0) throw new RemoteError(tidy(result.stderr || result.stdout) || 'Die Website konnte nicht angelegt werden.');
}

export async function toggleSite(session: Session, web: Web, name: string, enable: boolean, sudoPassword?: string): Promise<void> {
  if (!SITE_PATTERN.test(name)) throw new RemoteError('Ungültiger Website-Name.');
  const dir = siteDir(web, await system(session));
  const from = enable ? 'feather-' + name + '.conf.disabled' : 'feather-' + name + '.conf';
  const to = enable ? 'feather-' + name + '.conf' : 'feather-' + name + '.conf.disabled';
  const script = `set -e
D="${dir}"
[ -e "$D/${from}" ] || { echo "Website nicht gefunden." >&2; exit 2; }
mv "$D/${from}" "$D/${to}"
if ! out="$(${TEST[web]})"; then mv "$D/${to}" "$D/${from}"; echo "$out" >&2; exit 3; fi
NAME="$(pick_service ${SERVICES[web]})"
svc reload "$NAME" 2>&1 || svc restart "$NAME"
`;
  const result = await run(session, script, { admin: true, sudoPassword });
  if (result.code !== 0) throw new RemoteError(tidy(result.stderr || result.stdout) || 'Die Website konnte nicht umgeschaltet werden.');
}

export async function deleteSite(session: Session, web: Web, name: string, sudoPassword?: string): Promise<void> {
  if (!SITE_PATTERN.test(name)) throw new RemoteError('Ungültiger Website-Name.');
  const dir = siteDir(web, await system(session));
  const script = `set -e
D="${dir}"
rm -f "$D/feather-${name}.conf" "$D/feather-${name}.conf.disabled"
NAME="$(pick_service ${SERVICES[web]})"
svc reload "$NAME" 2>&1 || svc restart "$NAME"
`;
  const result = await run(session, script, { admin: true, sudoPassword });
  if (result.code !== 0) throw new RemoteError(tidy(result.stderr || result.stdout) || 'Die Website konnte nicht gelöscht werden.');
}

const LOG_FILES: Record<ModuleId, Record<'error' | 'access', string>> = {
  mariadb: { error: '$VAR/log/mysql/error.log $VAR/log/mariadb/mariadb.log $VAR/log/mysqld.log', access: '' },
  nginx: { error: '$VAR/log/nginx/error.log', access: '$VAR/log/nginx/access.log' },
  apache: { error: '$VAR/log/apache2/error.log $VAR/log/httpd/error_log $VAR/log/apache2/error_log', access: '$VAR/log/apache2/access.log $VAR/log/httpd/access_log $VAR/log/apache2/access_log' },
};

export async function logs(session: Session, module: ModuleId, kind: LogKind, lines: number, sudoPassword?: string): Promise<string> {
  const count = Math.max(10, Math.min(1000, Math.floor(lines) || 200));
  const files = kind === 'service' ? '' : LOG_FILES[module][kind];
  const script = kind === 'service' || !files
    ? `NAME="$(pick_service ${SERVICES[module]} || true)"
if use_systemd && have journalctl; then journalctl -u "$NAME" -n ${count} --no-pager 2>&1
else for f in $VAR/log/messages $VAR/log/syslog; do [ -r "$f" ] && { grep -i "$NAME" "$f" | tail -n ${count}; break; }; done; fi
`
    : `found=0
for f in ${files}; do
  if [ -r "$f" ]; then tail -n ${count} "$f"; found=1; break; fi
done
[ "$found" = 1 ] || echo "Keine Logdatei gefunden."
`;
  const result = await run(session, script, { admin: true, sudoPassword });
  return result.stdout || result.stderr || '';
}
