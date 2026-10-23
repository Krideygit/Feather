export type SqlConnectionKind = 'ssh' | 'direct';
export type SqlConnectionSource = 'install' | 'user' | 'manual';

export interface SqlConnection {
  id: string;
  label: string;
  kind: SqlConnectionKind;
  hostKey: string;
  dbHost: string;
  port: number;
  user: string;
  database: string;
  source: SqlConnectionSource;
  hasPassword: boolean;
  createdAt: number;
}

export interface SqlConnectionInput {
  id?: string;
  label: string;
  kind: SqlConnectionKind;
  hostKey: string;
  dbHost: string;
  port: number;
  user: string;
  password?: string | null;
  database: string;
  source: SqlConnectionSource;
}

export interface SqlTarget {
  id?: string;
  conn?: { host: string; port: number; user: string; password: string };
}

export type HistoryKind = 'update' | 'delete';

export interface HistoryEntry {
  id: string;
  ts: number;
  server: string;
  db: string;
  table: string;
  kind: HistoryKind;
  key: Record<string, string | null>;
  column: string;
  old: string | null;
  value: string | null;
  row: Record<string, string | null> | null;
  undone?: number;
}

export interface HistoryScope {
  server: string;
  db: string;
  table: string;
}

export interface HistoryStats {
  entries: number;
  bytes: number;
}
