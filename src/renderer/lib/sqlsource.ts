import { useMemo } from 'react';
import type { SqlOutput } from '../../shared/types';
import type { SqlConnection, SqlTarget } from '../../shared/sql';
import { call } from './api';
import { getSqlConnections, revealSqlConnection, useSqlConnections } from './creds';
import { callRemote, connect, getRemote, useRemote } from './remote';
import { getState, useAppState } from './store';
import { sourceOf } from '../remote/Hosts';

export interface SqlSource {
  id: string;
  kind: 'local' | 'ssh' | 'direct';
  label: string;
  detail: string;
  group: string;
  ready: boolean;
  hint: string;
}

export const LOCAL_PREFIX = 'local:';
export const CRED_PREFIX = 'cred:';

export function useSqlSources(): SqlSource[] {
  const services = useAppState((s) => s.services);
  const creds = useSqlConnections();
  const hosts = useRemote((s) => s.hosts);
  return useMemo(() => {
    const list: SqlSource[] = [];
    for (const s of services) {
      if (s.type !== 'mariadb') continue;
      list.push({ id: `${LOCAL_PREFIX}${s.id}`, kind: 'local', label: s.name, detail: `127.0.0.1:${s.port}`, group: 'Dieser Rechner', ready: s.status === 'running', hint: s.status === 'running' ? '' : 'Starte den Dienst zuerst' });
    }
    const hostName = (key: string): string => {
      const id = key.startsWith('host:') ? key.slice(5) : '';
      return hosts.find((h) => h.id === id)?.name ?? key.replace(/^adhoc:/, '');
    };
    for (const c of creds) {
      list.push({
        id: `${CRED_PREFIX}${c.id}`,
        kind: c.kind,
        label: c.label,
        detail: `${c.user}@${c.dbHost}:${c.port}${c.kind === 'ssh' ? ` · über ${hostName(c.hostKey)}` : ''}`,
        group: c.kind === 'ssh' ? hostName(c.hostKey) : 'Direkte Verbindungen',
        ready: true,
        hint: c.kind === 'ssh' ? 'Verbindet sich über deinen Server' : '',
      });
    }
    return list;
  }, [services, creds, hosts]);
}

const passwords = new Map<string, string>();

async function secretOf(cred: SqlConnection): Promise<string> {
  const known = passwords.get(cred.id);
  if (known !== undefined) return known;
  const password = await revealSqlConnection(cred.id);
  passwords.set(cred.id, password);
  return password;
}

export const forgetSecret = (id: string): void => void passwords.delete(id);

async function sessionFor(hostKey: string): Promise<string> {
  const find = (): string | undefined => getRemote().sessions.find((s) => s.status === 'ready' && (s.hostId ? `host:${s.hostId}` : `adhoc:${s.username}@${s.host}:${s.port}`) === hostKey)?.sid;
  const existing = find();
  if (existing) return existing;
  const host = hostKey.startsWith('host:') ? getRemote().hosts.find((h) => h.id === hostKey.slice(5)) : undefined;
  if (!host) throw new Error('Der Server dieser Zugangsdaten ist nicht gespeichert. Verbinde dich zuerst im Bereich Terminal.');
  if (!(await connect(sourceOf(host)))) throw new Error('Die Verbindung zum Server wurde nicht hergestellt.');
  const sid = find();
  if (!sid) throw new Error('Die Verbindung zum Server wurde nicht hergestellt.');
  return sid;
}

export async function resolveTarget(sourceId: string): Promise<SqlTarget> {
  if (sourceId.startsWith(LOCAL_PREFIX)) {
    const service = getState().services.find((s) => s.id === sourceId.slice(LOCAL_PREFIX.length));
    if (!service) throw new Error('Diese Datenbank existiert nicht mehr.');
    if (service.status !== 'running') throw new Error('Starte die Datenbank zuerst.');
    return { id: service.id };
  }
  const cred = getSqlConnections().find((c) => `${CRED_PREFIX}${c.id}` === sourceId);
  if (!cred) throw new Error('Diese Zugangsdaten existieren nicht mehr.');
  const password = await secretOf(cred);
  if (cred.kind === 'direct') return { conn: { host: cred.dbHost, port: cred.port, user: cred.user, password } };
  const sid = await sessionFor(cred.hostKey);
  const { port } = await callRemote<{ port: number }>('tunnel.open', { sid, host: cred.dbHost, port: cred.port });
  return { conn: { host: '127.0.0.1', port, user: cred.user, password } };
}

export async function runSql(sourceId: string, sql: string, database?: string): Promise<SqlOutput> {
  const target = await resolveTarget(sourceId);
  return call<SqlOutput>('sql.query', { ...target, database: database || undefined, sql });
}

export function rowsOf(output: SqlOutput, index = 0): (string | null)[][] {
  if (output.error) throw new Error(output.error.message);
  const result = output.results[index];
  return result && result.type === 'rows' ? result.rows : [];
}

export { ident, literal } from '../../shared/sqlgen';

export function serverKeyOf(sourceId: string): string {
  if (sourceId.startsWith(LOCAL_PREFIX)) return `local:${sourceId.slice(LOCAL_PREFIX.length)}`;
  const cred = getSqlConnections().find((c) => `${CRED_PREFIX}${c.id}` === sourceId);
  if (!cred) return sourceId;
  return cred.kind === 'direct' ? `direct:${cred.dbHost}:${cred.port}` : `ssh:${cred.hostKey}:${cred.dbHost}:${cred.port}`;
}
