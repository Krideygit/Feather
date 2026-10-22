export type RemoteProtocol = 'ssh' | 'sftp' | 'ftp';
export type RemoteAuth = 'password' | 'key' | 'agent';
export type FtpSecurity = 'none' | 'explicit' | 'implicit';
export type EntryType = 'dir' | 'file' | 'link' | 'other';

export interface RemoteHost {
  id: string;
  name: string;
  protocol: RemoteProtocol;
  host: string;
  port: number;
  username: string;
  auth: RemoteAuth;
  keyPath: string;
  secure: FtpSecurity;
  ignoreCertErrors: boolean;
  startPath: string;
  color: string;
  hasPassword: boolean;
  hasPassphrase: boolean;
  lastUsed: number | null;
  createdAt: number;
}

export interface RemoteHostInput {
  id?: string;
  name: string;
  protocol: RemoteProtocol;
  host: string;
  port: number;
  username: string;
  auth: RemoteAuth;
  keyPath: string;
  secure: FtpSecurity;
  ignoreCertErrors: boolean;
  startPath: string;
  color: string;
  password?: string | null;
  passphrase?: string | null;
}

export interface SessionOpen {
  hostId?: string;
  draft?: RemoteHostInput;
  password?: string;
  passphrase?: string;
  remember?: boolean;
  trust?: string;
}

export interface SessionInfo {
  sid: string;
  hostId: string | null;
  name: string;
  protocol: RemoteProtocol;
  host: string;
  port: number;
  username: string;
  color: string;
  terminal: boolean;
  home: string;
  fingerprint: string | null;
  filesError: string | null;
}

export interface RemoteEntry {
  name: string;
  path: string;
  type: EntryType;
  size: number;
  mtime: number;
  mode: number | null;
  owner: string;
  linkTo: 'dir' | 'file' | null;
}

export interface Transfer {
  tid: string;
  sid: string;
  name: string;
  direction: 'up' | 'down';
  state: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number;
  current: string;
  files: number;
  error: string | null;
}

export interface FileContent {
  text: string;
  size: number;
  mtime: number;
}

export type RemoteErrorCode = 'need-password' | 'need-passphrase' | 'hostkey-new' | 'hostkey-changed' | 'auth' | 'generic';

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly code: RemoteErrorCode = 'generic',
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

export type RemoteEvents = {
  'term.data': { sid: string; data: string };
  'term.exit': { sid: string };
  'session.closed': { sid: string; reason: string };
  transfer: Transfer;
};

export const DEFAULT_PORTS: Record<RemoteProtocol, number> = { ssh: 22, sftp: 22, ftp: 21 };
export const MAX_EDIT_BYTES = 2 * 1024 * 1024;
