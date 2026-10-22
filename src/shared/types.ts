
export type ServiceType = 'mariadb' | 'nginx' | 'apache' | 'minecraft' | 'paper' | 'fivem';
export type Category = 'database' | 'webserver' | 'package';
export type OptionValue = string | number | boolean;
export type Status = 'running' | 'starting' | 'stopping' | 'stopped' | 'error';

export interface Connection {
  host: string;
  port: number;
  user?: string;
  password?: string;
  url: string;
}

export interface Service {
  id: string;
  name: string;
  type: ServiceType;
  version: string;
  port: number;
  folder: string;
  password: string;
  autoStart: boolean;
  spa: boolean;
  autoindex: boolean;
  options: Record<string, OptionValue>;
  createdAt: number;
  category: Category;
  dir: string;
  status: Status;
  error: string | null;
  pid: number | null;
  startedAt: number | null;
  connection: Connection;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  active: boolean;
  avatar: string | null;
}

export interface InstalledRuntime {
  type: ServiceType;
  version: string;
  size: number;
}

export interface CatalogVersion {
  id: string;
  channel: string;
  installed: boolean;
}

export interface Catalog {
  versions: CatalogVersion[];
  online: boolean;
}

export type RuntimePhase = 'download' | 'verify' | 'extract' | 'done' | 'error';

export interface RuntimeProgress {
  type: ServiceType;
  version: string;
  phase: RuntimePhase;
  percent: number;
  bytes: number;
  total: number;
}

export interface AppInfo {
  home: string;
  os: string;
  java: string;
  windows: boolean;
}

export interface Settings {
  runInBackground: boolean;
}

export interface DbInfo {
  name: string;
  sizeKb: number;
  tables: number;
  system: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
  key: string;
}

export interface TableInfo {
  name: string;
  view: boolean;
  columns: ColumnInfo[];
}

export interface DbUser {
  user: string;
  host: string;
  root: boolean;
  system: boolean;
}

export interface SqlRows {
  type: 'rows';
  sql: string;
  columns: string[];
  rows: (string | null)[][];
  truncated: boolean;
  ms: number;
}

export interface SqlOk {
  type: 'ok';
  sql: string;
  affected: number;
  ms: number;
}

export interface SqlError {
  sql?: string;
  message: string;
  code?: number;
}

export interface SqlOutput {
  results: (SqlRows | SqlOk)[];
  error: SqlError | null;
}

export interface ExportResult {
  file: string;
  bytes: number;
  files: number;
  databases?: number;
}

export interface ExportProgress {
  id: string;
  done: number;
  total: number;
  label: string;
}

export interface ImportReport {
  services: number;
  missingRuntimes: { type: ServiceType; version: string }[];
  missingFolders: { name: string; folder: string }[];
}

export interface ImportResult {
  profile: Profile;
  report: ImportReport;
}

export interface CoreEvents {
  'core.ready': { home: string };
  'service.status': Service;
  'service.removed': { id: string };
  'service.log': { id: string; line: string };
  'runtime.progress': RuntimeProgress;
  'db.export.progress': ExportProgress;
  'profile.changed': { active: string };
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface FeatherBridge {
  call(method: string, params?: object): Promise<unknown>;
  onEvent(callback: (name: string, data: unknown) => void): () => void;
  onFatal(callback: (message: string) => void): void;

  getVersion(): Promise<string>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  bootProgress(percent: number, label: string): void;
  bootReady(): void;

  pickFolder(defaultPath?: string): Promise<string | null>;
  pickImage(): Promise<{ dataUrl: string } | { error: string } | null>;
  saveFile(options: { title: string; defaultName: string; filters: FileFilter[] }): Promise<string | null>;
  openFile(options: { title: string; filters: FileFilter[] }): Promise<string | null>;

  openExternal(url: string): Promise<void>;
  openPath(target: string): Promise<string>;
  showItem(target: string): Promise<void>;
  copy(text: string): Promise<void>;
  readClipboard(): Promise<string>;
  platform: string;

  remote(method: string, params?: object): Promise<{ ok: boolean; result?: unknown; error?: string; code?: string; data?: Record<string, unknown> }>;
  remoteSend(method: string, params: object): void;
  onRemoteEvent(callback: (name: string, data: unknown) => void): () => void;
  pathForFile(file: File): string;
}
