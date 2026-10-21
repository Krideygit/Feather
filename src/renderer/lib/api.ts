import type { InstalledRuntime, Profile, Service, ServiceType } from '../../shared/types';
import { toast } from '../components/Toast';
import { getState, setState, upsertService } from './store';

export const call = <T = unknown>(method: string, params?: object): Promise<T> => window.feather.call(method, params) as Promise<T>;

export async function attempt<T>(promise: Promise<T>, options: { success?: string } = {}): Promise<T | undefined> {
  try {
    const result = await promise;
    if (options.success) toast(options.success, 'success');
    return result;
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
    return undefined;
  }
}

export async function refreshServices(): Promise<void> {
  setState({ services: await call<Service[]>('service.list') });
}

export async function refreshRuntimes(): Promise<void> {
  setState({ installed: await call<InstalledRuntime[]>('runtime.list') });
}

export async function refreshProfiles(): Promise<void> {
  const { profiles } = await call<{ profiles: Profile[] }>('profile.list');
  setState({ profiles });
}

export const applyServiceView = (view: Service): void => upsertService(view);

export const versionKey = (type: ServiceType, version: string): string => `${type}@${version}`;

export const isInstalled = (type: ServiceType, version: string): boolean =>
  getState().installed.some((r) => r.type === type && r.version === version);
