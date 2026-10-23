import crypto from 'node:crypto';
import { RemoteError } from '../../../shared/remote';
import type { ModuleId, ModuleState, PackageManager, SystemInfo } from '../../../shared/modules';
import type { ExecResult, Session } from '../session';

export const PRELUDE = `
ETC="\${FEATHER_ETC:-/etc}"
VAR="\${FEATHER_VAR:-/var}"
RUN="\${FEATHER_RUN:-/run}"
export DEBIAN_FRONTEND=noninteractive
step() { echo "##STEP:$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
use_systemd() { have systemctl && [ -d "$RUN/systemd/system" ]; }
svc() {
  if use_systemd; then systemctl "$1" "$2"
  elif have rc-service; then
    case "$1" in
      enable) rc-update add "$2" default ;;
      disable) rc-update del "$2" default ;;
      *) rc-service "$2" "$1" ;;
    esac
  else service "$2" "$1"; fi
}
svc_exists() {
  if use_systemd; then systemctl list-unit-files "$1.service" 2>/dev/null | grep -q "^$1.service"
  else [ -x "$ETC/init.d/$1" ]; fi
}
svc_running() {
  if use_systemd; then systemctl is-active --quiet "$1"
  elif have rc-service; then rc-service "$1" status 2>/dev/null | grep -q started
  else service "$1" status >/dev/null 2>&1; fi
}
svc_enabled() {
  if use_systemd; then systemctl is-enabled --quiet "$1" 2>/dev/null
  elif have rc-update; then rc-update show default 2>/dev/null | grep -qw "$1"
  else return 1; fi
}
pick_service() {
  for s in "$@"; do if svc_exists "$s"; then echo "$s"; return 0; fi; done
  return 1
}
fw_allow() {
  if have ufw && ufw status 2>/dev/null | grep -qi 'Status: active'; then ufw allow "$1/tcp" >/dev/null && echo "Firewall (ufw): Port $1 freigegeben"
  elif have firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --permanent --add-port="$1/tcp" >/dev/null && firewall-cmd --reload >/dev/null && echo "Firewall (firewalld): Port $1 freigegeben"
  else echo "Keine aktive Firewall auf dem Server erkannt."; fi
}
fw_deny() {
  if have ufw && ufw status 2>/dev/null | grep -qi 'Status: active'; then ufw delete allow "$1/tcp" >/dev/null 2>&1 && echo "Firewall (ufw): Port $1 wieder gesperrt"
  elif have firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --permanent --remove-port="$1/tcp" >/dev/null 2>&1 && firewall-cmd --reload >/dev/null && echo "Firewall (firewalld): Port $1 wieder gesperrt"
  fi
}
`;

const DETECT = `
osr="$ETC/os-release"
[ -r "$osr" ] || osr=/usr/lib/os-release
if [ -r "$osr" ]; then . "$osr"; fi
echo "os=\${PRETTY_NAME:-Linux}"
echo "id=\${ID:-linux}"
echo "version=\${VERSION_ID:-}"
echo "arch=$(uname -m)"
pm=unknown
for pair in apt-get:apt dnf:dnf yum:yum zypper:zypper pacman:pacman apk:apk; do
  b="\${pair%%:*}"; n="\${pair##*:}"
  if have "$b"; then pm="$n"; break; fi
done
echo "pm=$pm"
if use_systemd; then init=systemd; elif have rc-service; then init=openrc; else init=none; fi
echo "init=$init"
uid="$(id -u)"
echo "uid=$uid"
echo "user=$(id -un)"
if [ "$uid" = 0 ]; then sudo=root
elif have sudo; then
  if sudo -n true >/dev/null 2>&1; then sudo=passwordless; else sudo=password; fi
else sudo=none; fi
echo "sudo=$sudo"
mod_state() {
  id="$1"; bins="$2"; svcs="$3"
  installed=0; bin=""; service=""; running=0; enabled=0; ver=""
  for b in $bins; do if have "$b"; then installed=1; bin="$b"; break; fi; done
  if [ "$installed" = 1 ]; then
    service="$(pick_service $svcs || true)"
    if [ -n "$service" ]; then
      if svc_running "$service"; then running=1; fi
      if svc_enabled "$service"; then enabled=1; fi
    fi
    ver="$("$bin" --version 2>&1 | head -n 1 | tr -d '\\r')"
    case "$bin" in nginx) ver="$(nginx -v 2>&1 | head -n 1)" ;; apache2|httpd) ver="$("$bin" -v 2>&1 | head -n 1)" ;; esac
  fi
  echo "mod.$id.installed=$installed"
  echo "mod.$id.running=$running"
  echo "mod.$id.enabled=$enabled"
  echo "mod.$id.service=$service"
  echo "mod.$id.version=$ver"
}
mod_state mariadb "mariadbd mysqld mariadb mysql" "mariadb mysql mysqld"
mod_state nginx "nginx" "nginx"
mod_state apache "apache2 httpd" "apache2 httpd"
`;

const PACKAGE_MANAGERS: PackageManager[] = ['apt', 'dnf', 'yum', 'zypper', 'pacman', 'apk', 'unknown'];

export function parseSystem(output: string): SystemInfo {
  const kv = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const get = (key: string): string => kv.get(key) ?? '';
  const pm = PACKAGE_MANAGERS.includes(get('pm') as PackageManager) ? (get('pm') as PackageManager) : 'unknown';
  const init = get('init') === 'systemd' ? 'systemd' : get('init') === 'openrc' ? 'openrc' : 'none';
  const sudo = (['root', 'passwordless', 'password', 'none'] as const).find((m) => m === get('sudo')) ?? 'none';
  const state = (id: ModuleId): ModuleState => ({
    installed: get(`mod.${id}.installed`) === '1',
    running: get(`mod.${id}.running`) === '1',
    enabled: get(`mod.${id}.enabled`) === '1',
    version: cleanVersion(get(`mod.${id}.version`)),
    service: get(`mod.${id}.service`),
  });
  let reason = '';
  if (pm === 'unknown') reason = 'Dieses System verwendet keinen bekannten Paketmanager (unterstützt: apt, dnf, yum, zypper, pacman, apk).';
  else if (init === 'none') reason = 'Auf diesem System läuft weder systemd noch OpenRC. Dienste lassen sich nicht verwalten.';
  return {
    os: get('os') || 'Linux',
    id: get('id'),
    version: get('version'),
    arch: get('arch'),
    pm,
    init,
    uid: Number(get('uid')) || 0,
    user: get('user'),
    sudo,
    supported: reason === '',
    reason,
    sites: pm !== 'unknown' && pm !== 'pacman',
    modules: { mariadb: state('mariadb'), nginx: state('nginx'), apache: state('apache') },
  };
}

export function cleanVersion(raw: string): string {
  const match = /(\d+\.\d+(?:\.\d+)?)/.exec(raw);
  return match ? (match[1] as string) : '';
}

export function wrap(script: string, mode: 'plain' | 'sudo' | 'sudo-n'): string {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  const inner = `sh -c 'eval "$(printf %s ${encoded} | base64 -d)"'`;
  if (mode === 'sudo') return `sudo -S -p '' ${inner}`;
  if (mode === 'sudo-n') return `sudo -n ${inner}`;
  return inner;
}

async function plain(session: Session, script: string, stdin?: string): Promise<ExecResult> {
  return session.exec(wrap(`${PRELUDE}\n${script}`, 'plain'), { stdin });
}

export async function detect(session: Session): Promise<SystemInfo> {
  const result = await plain(session, DETECT);
  if (!result.stdout.includes('pm=')) throw new RemoteError('Das System konnte nicht erkannt werden. Läuft auf dem Server eine Linux-Shell?');
  session.sys = parseSystem(result.stdout);
  return session.sys;
}

export async function system(session: Session): Promise<SystemInfo> {
  return session.sys ?? detect(session);
}

export interface RunOptions {
  admin?: boolean;
  payload?: string;
  sudoPassword?: string;
  onData?: (text: string) => void;
  bare?: boolean;
}

const SUDO_FAILURE = /incorrect password|sorry, try again|no password was provided|a password is required|authentication failure/i;
const NOT_ALLOWED = /not in the sudoers|may not run sudo|is not allowed to run sudo/i;

async function uploadPayload(session: Session, payload: string): Promise<string> {
  const result = await plain(session, 'umask 077; f="$(mktemp "${TMPDIR:-/tmp}/feather.XXXXXXXX")" && cat > "$f" && printf %s "$f"', payload);
  const path = result.stdout.trim();
  if (result.code !== 0 || !/^\/[A-Za-z0-9._/-]+$/.test(path)) throw new RemoteError('Auf dem Server konnte keine temporäre Datei angelegt werden.');
  return path;
}

export async function run(session: Session, script: string, options: RunOptions = {}): Promise<ExecResult> {
  const sys = await system(session);
  let mode: 'plain' | 'sudo' | 'sudo-n' = 'plain';
  let password = '';
  if (options.admin && sys.uid !== 0) {
    if (sys.sudo === 'none') throw new RemoteError('Dein Benutzer hat keine Administratorrechte. Melde dich als root an oder richte sudo auf dem Server ein.');
    if (sys.sudo === 'passwordless') mode = 'sudo-n';
    else {
      password = options.sudoPassword || session.sudoPassword;
      if (!password) throw new RemoteError('Für diese Aktion braucht Feather Administratorrechte. Gib das sudo-Passwort deines Benutzers ein.', 'need-sudo');
      mode = 'sudo';
    }
  }
  let payloadPath = '';
  if (options.payload !== undefined) payloadPath = await uploadPayload(session, options.payload);
  const head = payloadPath ? `FEATHER_PAYLOAD='${payloadPath}'; export FEATHER_PAYLOAD\n` : '';
  const tail = payloadPath ? `\ntrap 'rm -f "$FEATHER_PAYLOAD"' EXIT` : '';
  const body = `${options.bare ? '' : `${PRELUDE}\n`}${head}${tail}\n${script}`;
  const result = await session.exec(wrap(body, mode), { stdin: mode === 'sudo' ? `${password}\n` : '', onData: options.onData });
  if (mode === 'sudo') {
    if (result.code !== 0 && NOT_ALLOWED.test(result.stderr)) {
      session.sudoPassword = '';
      throw new RemoteError('Dein Benutzer darf sudo nicht verwenden. Melde dich als root an.');
    }
    if (result.code !== 0 && SUDO_FAILURE.test(result.stderr)) {
      session.sudoPassword = '';
      throw new RemoteError('Das sudo-Passwort ist falsch.', 'need-sudo');
    }
    session.sudoPassword = password;
  }
  return result;
}

export function jobId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function jobScript(id: string, inner: string): string {
  const encoded = Buffer.from(`trap 'rm -f "$FEATHER_PAYLOAD" "$0"' EXIT\n${PRELUDE}\n${inner}`, 'utf8').toString('base64');
  return `
VAR="\${FEATHER_VAR:-/var}"
JOBDIR="$VAR/tmp"
mkdir -p "$JOBDIR"
LOG="$JOBDIR/feather-${id}.log"
: > "$LOG"
printf %s ${encoded} | base64 -d > "$LOG.sh"
nohup sh -c 'sh "$0"; echo "##EXIT:$?"' "$LOG.sh" >> "$LOG" 2>&1 < /dev/null &
pos=0
while :; do
  finished=0
  if grep -q '^##EXIT:' "$LOG" 2>/dev/null; then finished=1; fi
  size="$(wc -c < "$LOG" | tr -d ' ')"
  if [ "$size" -gt "$pos" ]; then
    tail -c +$((pos + 1)) "$LOG" | head -c $((size - pos))
    pos="$size"
  fi
  if [ "$finished" = 1 ]; then break; fi
  sleep "\${FEATHER_POLL:-1}"
done
rm -f "$LOG"
`;
}
