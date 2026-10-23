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
