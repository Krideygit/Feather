import type { Category, Service, ServiceType } from '../../shared/types';
import { applyServiceView, attempt, call } from './api';
import { getState } from './store';

export interface TypeInfo {
  label: string;
  category: Category;
  defaultPort: number;
}

export const TYPES: Record<ServiceType, TypeInfo> = {
  mariadb: { label: 'MariaDB', category: 'database', defaultPort: 3306 },
  nginx: { label: 'Nginx', category: 'webserver', defaultPort: 8080 },
  apache: { label: 'Apache', category: 'webserver', defaultPort: 8081 },
  minecraft: { label: 'Minecraft (Vanilla)', category: 'package', defaultPort: 25565 },
  paper: { label: 'Minecraft (Paper)', category: 'package', defaultPort: 25565 },
  fivem: { label: 'FiveM', category: 'package', defaultPort: 30120 },
  mailpit: { label: 'Mailpit', category: 'package', defaultPort: 8025 },
};

export interface CategoryInfo {
  types: ServiceType[];
  singular: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyText: string;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  database: {
    types: ['mariadb'],
    singular: 'Datenbank',
    title: 'Datenbanken',
    description: 'MariaDB-Server, die lokal auf deinem Rechner laufen.',
    emptyTitle: 'Noch keine Datenbank',
    emptyText: 'Erstelle eine MariaDB-Instanz. Feather lädt die Binaries automatisch herunter und richtet alles ein.',
  },
  webserver: {
    types: ['nginx', 'apache'],
    singular: 'Webserver',
    title: 'Webserver',
    description: 'Nginx und Apache, die einen Ordner deiner Wahl ausliefern.',
    emptyTitle: 'Noch kein Webserver',
    emptyText: 'Wähle einen Ordner, und Feather liefert ihn über Nginx oder Apache unter localhost aus.',
  },
  package: {
    types: ['minecraft', 'paper', 'fivem', 'mailpit'],
    singular: 'Package',
    title: 'Packages',
    description: 'Fertige Server und Werkzeuge, nach Kategorien sortiert.',
    emptyTitle: 'Noch kein Package',
    emptyText: 'Wähle ein Package aus einer Kategorie und Feather richtet es ein.',
  },
};

export const isActive = (s: Pick<Service, 'status'>): boolean => s.status === 'running' || s.status === 'starting';

export async function toggleService(id: string): Promise<void> {
  const s = getState().services.find((x) => x.id === id);
  if (!s || s.status === 'stopping') return;
  const view = await attempt(call<Service>(isActive(s) ? 'service.stop' : 'service.start', { id }));
  if (view) applyServiceView(view);
}

export async function restartService(id: string): Promise<void> {
  const view = await attempt(call<Service>('service.restart', { id }));
  if (view) applyServiceView(view);
}

export function openInBrowser(service: Service): void {
  if (service.connection.url) void window.feather.openExternal(service.connection.url);
}

export async function openFolder(path: string): Promise<void> {
  const error = await window.feather.openPath(path);
  if (error) await attempt(Promise.reject(new Error(error)));
}
