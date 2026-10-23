const fs = require('node:fs');
const path = require('node:path');

const posix = (p) => p.replace(/\\/g, '/');

const TEMPLATES = {
  nginx: `#!/bin/sh
case "$1" in
  -v) echo "nginx version: nginx/1.24.0 (Ubuntu)" >&2 ;;
  -t)
    if grep -rqs "domain=fail.example" "$FAKE/etc/nginx/conf.d"; then echo "nginx: [emerg] unknown directive in conf.d" >&2; exit 1; fi
    echo "nginx: configuration file test is successful" ;;
esac
`,
  apache2: `#!/bin/sh
case "$1" in -v) echo "Server version: Apache/2.4.58 (Ubuntu)" ;; esac
`,
  apache2ctl: `#!/bin/sh
if grep -rqs "domain=fail.example" "$FAKE/etc/apache2/conf-enabled"; then echo "AH00526: Syntax error on line 3" >&2; exit 1; fi
echo "Syntax OK" >&2
`,
  mariadbd: `#!/bin/sh
echo "mariadbd  Ver 10.11.6-MariaDB-0ubuntu0.24.04.1 for debian-linux-gnu on x86_64"
`,
  mariadb: `#!/bin/sh
if [ -f "$FAKE/state/real-client" ]; then exec "$(cat "$FAKE/state/real-client")" -uroot -h127.0.0.1 -P3306 "$@"; fi
if [ "$1" = "-e" ]; then echo "$2" >> "$FAKE/state/sql.log"; echo 1; exit 0; fi
sql="$(cat)"
printf '%s\\n--\\n' "$sql" >> "$FAKE/state/sql.log"
case "$sql" in
  *FAIL_ME*) echo "ERROR 1007 (HY000) at line 1: Can't create database; database exists" >&2; exit 1 ;;
  *information_schema.schemata*) printf 'information_schema\\t0\\t0\\nmysql\\t31\\t655360\\nshop\\t3\\t49152\\n' ;;
  *mysql.user*) printf 'root\\tlocalhost\\tunix_socket\\nwebapp\\tlocalhost\\tmysql_native_password\\n' ;;
  *@@port*) printf '3306\\t127.0.0.1\\t10.11.6-MariaDB\\n' ;;
esac
`,
};

const SCRIPTS = {
  'apt-get': `#!/bin/sh
S="$FAKE/state"
echo "apt-get $*" >> "$S/commands.log"
if [ -f "$S/lock" ]; then echo "E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 1234" >&2; exit 100; fi
cmd="$1"; shift
put() { cp "$FAKE/templates/$1" "$FAKE/bin/$1"; chmod +x "$FAKE/bin/$1"; }
unit_add() { echo "$1" >> "$S/units"; }
unit_del() { grep -vx "$1" "$S/units" > "$S/units.new"; mv "$S/units.new" "$S/units"; rm -f "$S/active/$1" "$S/enabled/$1"; }
install_pkg() {
  case "$1" in
    nginx) put nginx; mkdir -p "$FAKE/etc/nginx/conf.d" "$FAKE/etc/nginx/sites-enabled"; echo default > "$FAKE/etc/nginx/sites-enabled/default"; unit_add nginx ;;
    apache2) put apache2; put apache2ctl; mkdir -p "$FAKE/etc/apache2/conf-enabled"; echo "Listen 80" > "$FAKE/etc/apache2/ports.conf"; unit_add apache2 ;;
    mariadb-server) put mariadbd; put mariadb; mkdir -p "$FAKE/etc/mysql/mariadb.conf.d"; unit_add mariadb ;;
  esac
}
remove_pkg() {
  case "$1" in
    nginx) rm -f "$FAKE/bin/nginx"; unit_del nginx ;;
    apache2) rm -f "$FAKE/bin/apache2" "$FAKE/bin/apache2ctl"; unit_del apache2 ;;
    mariadb-server) rm -f "$FAKE/bin/mariadbd" "$FAKE/bin/mariadb"; unit_del mariadb ;;
  esac
}
case "$cmd" in
  update) echo "Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease"; echo "Reading package lists..." ;;
  install) for a in "$@"; do case "$a" in -*) ;; *) echo "Setting up $a ..."; install_pkg "$a" ;; esac; done ;;
  remove|purge) for a in "$@"; do case "$a" in -*) ;; *) echo "Removing $a ..."; remove_pkg "$a" ;; esac; done ;;
  autoremove) echo "0 upgraded, 0 newly installed" ;;
esac
`,
  systemctl: `#!/bin/sh
S="$FAKE/state"; mkdir -p "$S/active" "$S/enabled"
echo "systemctl $*" >> "$S/commands.log"
cmd="$1"; shift
name=""
for a in "$@"; do case "$a" in --*) ;; *) name="\${a%.service}" ;; esac; done
has_unit() { [ -f "$S/units" ] && grep -qx "$1" "$S/units"; }
case "$cmd" in
  list-unit-files) if has_unit "$name"; then echo "$name.service enabled enabled"; fi; exit 0 ;;
  is-active) [ -f "$S/active/$name" ] ;;
  is-enabled) [ -f "$S/enabled/$name" ] ;;
  start) has_unit "$name" || { echo "Failed to start $name.service: Unit not found." >&2; exit 5; }; touch "$S/active/$name" ;;
  stop) rm -f "$S/active/$name" ;;
  restart) has_unit "$name" || exit 5; touch "$S/active/$name" ;;
  reload) [ -f "$S/active/$name" ] || { echo "$name.service is not active, cannot reload." >&2; exit 1; } ;;
  enable) touch "$S/enabled/$name"; touch "$S/active/$name" ;;
  disable) rm -f "$S/enabled/$name" ;;
esac
`,
  id: `#!/bin/sh
case "$1" in
  -u) echo "\${FAKE_UID:-0}" ;;
  -un) echo "\${FAKE_USER:-root}" ;;
  *) [ "$1" = "www-data" ] ;;
esac
`,
  sudo: `#!/bin/sh
echo "sudo $*" >> "$FAKE/state/commands.log"
case "$1" in
  -n) shift; [ "$FAKE_SUDO" = passwordless ] || { echo "sudo: a password is required" >&2; exit 1; } ;;
  -S) shift; shift; shift; IFS= read -r pw
      if [ "$pw" != "$FAKE_SUDO_PW" ]; then echo "Sorry, try again." >&2; echo "sudo: 1 incorrect password attempt" >&2; exit 1; fi ;;
esac
FAKE_UID=0 FAKE_USER=root exec "$@"
`,
  ufw: `#!/bin/sh
case "$1" in
  status) echo "Status: active" ;;
  allow|delete) echo "ufw $*" >> "$FAKE/state/firewall.log" ;;
esac
`,
  journalctl: `#!/bin/sh
echo "Oct 22 10:00:01 server systemd[1]: Started service."
echo "Oct 22 10:00:02 server service[100]: ready to accept connections"
`,
};

function createFakeLinux(dir) {
  const root = path.join(dir, 'fake');
  const bin = path.join(root, 'bin');
  for (const sub of ['bin', 'templates', 'etc', 'var/tmp', 'var/log/nginx', 'run/systemd/system', 'state', 'tmp']) fs.mkdirSync(path.join(root, sub), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'etc', 'os-release'),
    'NAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n',
  );
  for (const [name, body] of Object.entries(SCRIPTS)) fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  for (const [name, body] of Object.entries(TEMPLATES)) fs.writeFileSync(path.join(root, 'templates', name), body, { mode: 0o755 });
  const settings = { uid: '0', user: 'root', sudo: 'root', sudoPw: 'richtiges-sudo-pw' };
  return {
    root,
    settings,
    file: (...p) => path.join(root, ...p),
    read: (...p) => fs.readFileSync(path.join(root, ...p), 'utf8'),
    exists: (...p) => fs.existsSync(path.join(root, ...p)),
    env() {
      return {
        ...process.env,
        PATH: `${posix(bin)};${process.env.PATH}`,
        FAKE: posix(root),
        FEATHER_ETC: posix(path.join(root, 'etc')),
        FEATHER_VAR: posix(path.join(root, 'var')),
        FEATHER_RUN: posix(path.join(root, 'run')),
        FEATHER_POLL: '0.1',
        TMPDIR: posix(path.join(root, 'tmp')),
        FAKE_UID: settings.uid,
        FAKE_USER: settings.user,
        FAKE_SUDO: settings.sudo,
        FAKE_SUDO_PW: settings.sudoPw,
      };
    },
  };
}

module.exports = { createFakeLinux };
