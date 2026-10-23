import {
  HOST_PATTERN,
  ID_PATTERN,
  SYSTEM_DATABASES,
  SYSTEM_USERS,
  type DatabaseInfo,
  type DbSettings,
  type DbUserInfo,
  type Grant,
  type NewDbUser,
} from '../../../shared/modules';
import { RemoteError } from '../../../shared/remote';
import type { Session } from '../session';
import { cleanVersion, run } from './shell';

export function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '')}'`;
}

const ERRORS: [RegExp, string][] = [
  [/ERROR 1007/, 'Diese Datenbank existiert bereits.'],
  [/ERROR 1008/, 'Diese Datenbank existiert nicht.'],
  [/ERROR 1396|ERROR 1410/, 'Dieser Benutzer existiert bereits oder der Vorgang ist nicht möglich.'],
  [/ERROR 1133|ERROR 1141/, 'Dieser Benutzer existiert nicht.'],
  [/ERROR 1045/, 'MariaDB lehnt den Zugriff ab. Standardmäßig meldet sich Feather als Systemkonto (unix_socket) an. Wurde dem Root-Benutzer ein Passwort gegeben, funktioniert das nicht.'],
  [/ERROR 2002|ERROR 2013/, 'MariaDB läuft nicht. Starte den Dienst zuerst.'],
  [/ERROR 1819/, 'Das Passwort erfüllt die Passwort-Regeln des Servers nicht.'],
];

function explain(stderr: string): string {
  for (const [pattern, text] of ERRORS) if (pattern.test(stderr)) return text;
  const line = stderr.split(/\r?\n/).find((l) => /ERROR/.test(l));
  return line ? line.replace(/^ERROR \d+ \(\w+\) (at line \d+: )?/, '') : 'Der Vorgang ist fehlgeschlagen.';
}

const CLIENT = 'DB="$(command -v mariadb || command -v mysql)"\n[ -n "$DB" ] || { echo "ERROR: kein MariaDB-Client gefunden" >&2; exit 1; }\n';

export async function sql(session: Session, statement: string, sudoPassword?: string): Promise<string[][]> {
  const result = await run(session, `${CLIENT}"$DB" --batch --raw --skip-column-names < "$FEATHER_PAYLOAD"`, { admin: true, payload: statement, sudoPassword });
  if (result.code !== 0) throw new RemoteError(explain(result.stderr || result.stdout));
  return result.stdout
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => l.split('\t'));
}

export function checkName(value: string, label: string): string {
  if (!ID_PATTERN.test(value)) throw new RemoteError(`${label} darf nur Buchstaben, Zahlen und _ enthalten (max. 64 Zeichen).`);
  return value;
}

export async function listDatabases(session: Session, sudoPassword?: string): Promise<DatabaseInfo[]> {
  const rows = await sql(
    session,
    'SELECT s.schema_name, COUNT(t.table_name), COALESCE(SUM(t.data_length + t.index_length), 0) FROM information_schema.schemata s LEFT JOIN information_schema.tables t ON t.table_schema = s.schema_name GROUP BY s.schema_name ORDER BY s.schema_name;',
    sudoPassword,
  );
  return rows.map(([name, tables, bytes]) => ({ name: name as string, tables: Number(tables), bytes: Number(bytes), system: SYSTEM_DATABASES.includes(name as string) }));
}

export async function createDatabase(session: Session, name: string, sudoPassword?: string): Promise<void> {
  checkName(name, 'Der Datenbankname');
  await sql(session, `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, sudoPassword);
}

export async function dropDatabase(session: Session, name: string, sudoPassword?: string): Promise<void> {
  checkName(name, 'Der Datenbankname');
  if (SYSTEM_DATABASES.includes(name)) throw new RemoteError('Systemdatenbanken dürfen nicht gelöscht werden.');
  await sql(session, `DROP DATABASE \`${name}\`;`, sudoPassword);
}

export async function listUsers(session: Session, sudoPassword?: string): Promise<DbUserInfo[]> {
  const rows = await sql(session, 'SELECT User, Host, plugin FROM mysql.user ORDER BY User, Host;', sudoPassword);
  return rows.map(([name, host, plugin]) => ({ name: name as string, host: host ?? '', plugin: plugin ?? '', system: SYSTEM_USERS.includes(name as string) || name === '' }));
}

const GRANTS: Record<Grant, string> = { all: 'ALL PRIVILEGES', readwrite: 'SELECT, INSERT, UPDATE, DELETE', read: 'SELECT' };

export function checkHost(host: string): string {
  if (!HOST_PATTERN.test(host)) throw new RemoteError('Der Host darf nur Buchstaben, Zahlen sowie . _ % : - enthalten.');
  return host;
}

export function createUserSql(u: NewDbUser): string {
  checkName(u.name, 'Der Benutzername');
  checkHost(u.host);
  if (u.password.length < 8) throw new RemoteError('Das Passwort braucht mindestens 8 Zeichen.');
  const account = `${sqlString(u.name)}@${sqlString(u.host)}`;
  const lines = [`CREATE USER ${account} IDENTIFIED BY ${sqlString(u.password)};`];
  if (u.database === '*') lines.push(`GRANT ${GRANTS[u.grant] ?? GRANTS.all} ON *.* TO ${account};`);
  else if (u.database) lines.push(`GRANT ${GRANTS[u.grant] ?? GRANTS.all} ON \`${checkName(u.database, 'Der Datenbankname')}\`.* TO ${account};`);
  lines.push('FLUSH PRIVILEGES;');
  return `${lines.join('\n')}\n`;
}

export async function createUser(session: Session, u: NewDbUser, sudoPassword?: string): Promise<void> {
  await sql(session, createUserSql(u), sudoPassword);
}

export async function dropUser(session: Session, name: string, host: string, sudoPassword?: string): Promise<void> {
  checkHost(host);
  if (name !== '') checkName(name.replace(/[.-]/g, '_'), 'Der Benutzername');
  if (SYSTEM_USERS.includes(name)) throw new RemoteError('Systembenutzer dürfen nicht gelöscht werden.');
  await sql(session, `DROP USER ${sqlString(name)}@${sqlString(host)};\nFLUSH PRIVILEGES;\n`, sudoPassword);
}

export async function setUserPassword(session: Session, name: string, host: string, password: string, sudoPassword?: string): Promise<void> {
  checkHost(host);
  if (SYSTEM_USERS.includes(name)) throw new RemoteError('Das Passwort von Systembenutzern lässt Feather unverändert.');
  if (password.length < 8) throw new RemoteError('Das Passwort braucht mindestens 8 Zeichen.');
  await sql(session, `SET PASSWORD FOR ${sqlString(name)}@${sqlString(host)} = PASSWORD(${sqlString(password)});\nFLUSH PRIVILEGES;\n`, sudoPassword);
}

export async function settings(session: Session, sudoPassword?: string): Promise<DbSettings> {
  const [row] = await sql(session, 'SELECT @@port, @@bind_address, @@version;', sudoPassword);
  const [port, bind, version] = row ?? [];
  const address = bind || '';
  return { port: Number(port) || 3306, bind: address, version: cleanVersion(version ?? ''), remote: address !== '' && address !== '127.0.0.1' && address !== '::1' && address !== 'localhost' };
}
