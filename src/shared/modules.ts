export type ModuleId = 'mariadb' | 'nginx' | 'apache';
export type PackageManager = 'apt' | 'dnf' | 'yum' | 'zypper' | 'pacman' | 'apk' | 'unknown';
export type InitSystem = 'systemd' | 'openrc' | 'none';
export type SudoMode = 'root' | 'passwordless' | 'password' | 'none';
export type ControlAction = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable';

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  group: 'database' | 'web';
  description: string;
}

export const MODULES: ModuleInfo[] = [
  { id: 'mariadb', name: 'MariaDB', group: 'database', description: 'Schneller, MySQL-kompatibler Datenbankserver für Websites und Apps.' },
  { id: 'nginx', name: 'Nginx', group: 'web', description: 'Leichter, sehr schneller Webserver, auch als Reverse-Proxy beliebt.' },
  { id: 'apache', name: 'Apache', group: 'web', description: 'Bewährter Webserver mit .htaccess und vielen Erweiterungen.' },
];

export interface ModuleState {
  installed: boolean;
  running: boolean;
  enabled: boolean;
  version: string;
  service: string;
}

export interface SystemInfo {
  os: string;
  id: string;
  version: string;
  arch: string;
  pm: PackageManager;
  init: InitSystem;
  uid: number;
  user: string;
  sudo: SudoMode;
  supported: boolean;
  reason: string;
  sites: boolean;
  modules: Record<ModuleId, ModuleState>;
}

export interface MariaDbInstallOptions {
  port: number;
  remote: boolean;
  firewall: boolean;
  database: string;
  user: string;
  password: string;
  userHost: 'localhost' | '%';
}

export interface WebInstallOptions {
  firewall: boolean;
}

export type InstallOptions = Partial<MariaDbInstallOptions & WebInstallOptions>;

export interface JobStart {
  jobId: string;
  steps: string[];
}

export interface JobEvent {
  sid: string;
  jobId: string;
  module: ModuleId;
  kind: 'install' | 'uninstall';
  state: 'running' | 'done' | 'error' | 'detached';
  steps: string[];
  step: string;
  error: string | null;
}

export interface JobLog {
  sid: string;
  jobId: string;
  text: string;
}

export interface DatabaseInfo {
  name: string;
  tables: number;
  bytes: number;
  system: boolean;
}

export interface DbUserInfo {
  name: string;
  host: string;
  plugin: string;
  system: boolean;
}

export interface DbSettings {
  port: number;
  bind: string;
  version: string;
  remote: boolean;
}

export type Grant = 'all' | 'readwrite' | 'read';

export interface NewDbUser {
  name: string;
  host: string;
  password: string;
  database: string;
  grant: Grant;
}

export interface SiteInfo {
  name: string;
  domain: string;
  port: number;
  root: string;
  enabled: boolean;
}

export interface NewSite {
  name: string;
  domain: string;
  port: number;
  root: string;
  welcome: boolean;
  firewall: boolean;
}

export type LogKind = 'service' | 'error' | 'access';

export const ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
export const SITE_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const DOMAIN_PATTERN = /^(\*\.)?[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
export const HOST_PATTERN = /^[A-Za-z0-9_.%:-]{1,80}$/;
export const PATH_PATTERN = /^\/[A-Za-z0-9._/-]{1,200}$/;
export const SYSTEM_DATABASES = ['information_schema', 'mysql', 'performance_schema', 'sys'];
export const SYSTEM_USERS = ['root', 'mariadb.sys', 'mysql', 'PUBLIC', 'debian-sys-maint', 'healthcheck'];
