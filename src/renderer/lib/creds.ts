import { useSyncExternalStore } from 'react';
import type { SqlConnection, SqlConnectionInput } from '../../shared/sql';
import { callRemote, type SessionView } from './remote';

export const hostKeyOf = (session: Pick<SessionView, 'hostId' | 'username' | 'host' | 'port'>): string =>
  session.hostId ? `host:${session.hostId}` : `adhoc:${session.username}@${session.host}:${session.port}`;

let connections: SqlConnection[] = [];
let loaded = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function publish(next: SqlConnection[]): void {
  connections = next;
  loaded = true;
  listeners.forEach((l) => l());
}

export const useSqlConnections = (): SqlConnection[] => useSyncExternalStore(subscribe, () => connections);
export const connectionsLoaded = (): boolean => loaded;
export const getSqlConnections = (): SqlConnection[] => connections;

export async function loadSqlConnections(): Promise<void> {
  publish(await callRemote<SqlConnection[]>('creds.list'));
}

export async function saveSqlConnection(input: SqlConnectionInput): Promise<SqlConnection> {
  const saved = await callRemote<SqlConnection>('creds.save', { input });
  await loadSqlConnections();
  return saved;
}

export async function removeSqlConnection(id: string): Promise<void> {
  await callRemote('creds.remove', { id });
  await loadSqlConnections();
}

export const revealSqlConnection = async (id: string): Promise<string> => (await callRemote<{ password: string }>('creds.reveal', { id })).password;

let request: string | null = null;
const requestListeners = new Set<() => void>();

export function requestSqlConnection(id: string): void {
  request = id;
  requestListeners.forEach((l) => l());
}

export const takeSqlRequest = (): string | null => {
  const id = request;
  request = null;
  return id;
};

export const useSqlRequest = (): string | null =>
  useSyncExternalStore(
    (listener) => {
      requestListeners.add(listener);
      return () => requestListeners.delete(listener);
    },
    () => request,
  );
