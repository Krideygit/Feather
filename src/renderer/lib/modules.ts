import { useSyncExternalStore } from 'react';
import type { ControlAction, InstallOptions, JobEvent, JobLog, JobStart, ModuleId, SystemInfo } from '../../shared/modules';
import { RemoteError } from '../../shared/remote';
import { toast } from '../components/Toast';
import { askPassword } from '../remote/prompts';
import { callRemote } from './remote';

export interface JobView {
  jobId: string;
  module: ModuleId;
  kind: 'install' | 'uninstall';
  state: JobEvent['state'];
  steps: string[];
  step: string;
  error: string | null;
  log: string;
}

export interface ModState {
  sys: SystemInfo | null;
  loading: boolean;
  error: string | null;
  busy: Partial<Record<ModuleId, ControlAction>>;
  jobs: Partial<Record<ModuleId, JobView>>;
}

const EMPTY: ModState = { sys: null, loading: false, error: null, busy: {}, jobs: {} };
const LOG_LIMIT = 200_000;

let states: Record<string, ModState> = {};
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function update(sid: string, patch: Partial<ModState> | ((s: ModState) => Partial<ModState>)): void {
  const current = states[sid] ?? EMPTY;
  states = { ...states, [sid]: { ...current, ...(typeof patch === 'function' ? patch(current) : patch) } };
  listeners.forEach((l) => l());
}

export const getModules = (sid: string): ModState => states[sid] ?? EMPTY;

export const useModules = (sid: string): ModState => useSyncExternalStore(subscribe, () => states[sid] ?? EMPTY);

export async function callModule<T = unknown>(sid: string, method: string, params: object = {}): Promise<T> {
  let sudoPassword: string | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await callRemote<T>(method, { sid, ...params, sudoPassword });
    } catch (err) {
      if (!(err instanceof RemoteError) || err.code !== 'need-sudo') throw err;
      const answer = await askPassword({ title: 'Administratorrechte nötig', message: err.message, label: 'sudo-Passwort', canRemember: false, confirmLabel: 'Bestätigen' });
      if (!answer) throw new RemoteError('Abgebrochen.');
      sudoPassword = answer.password;
    }
  }
  throw new RemoteError('Das sudo-Passwort wurde mehrfach falsch eingegeben.');
}

export async function detect(sid: string): Promise<void> {
  update(sid, { loading: true, error: null });
  try {
    update(sid, { sys: await callRemote<SystemInfo>('sys.detect', { sid }), loading: false });
  } catch (err) {
    update(sid, { loading: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function control(sid: string, module: ModuleId, action: ControlAction): Promise<boolean> {
  update(sid, (s) => ({ busy: { ...s.busy, [module]: action } }));
  try {
    update(sid, { sys: await callModule<SystemInfo>(sid, 'mod.control', { module, action }) });
    return true;
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
    return false;
  } finally {
    update(sid, (s) => ({ busy: { ...s.busy, [module]: undefined } }));
  }
}

async function startJob(sid: string, module: ModuleId, kind: 'install' | 'uninstall', params: object): Promise<boolean> {
  try {
    const start = await callModule<JobStart>(sid, kind === 'install' ? 'mod.install' : 'mod.uninstall', { module, ...params });
    update(sid, (s) => ({ jobs: { ...s.jobs, [module]: { jobId: start.jobId, module, kind, state: 'running', steps: start.steps, step: start.steps[0] ?? '', error: null, log: '' } } }));
    return true;
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
    return false;
  }
}

export const startInstall = (sid: string, module: ModuleId, options: InstallOptions): Promise<boolean> => startJob(sid, module, 'install', { options });
export const startUninstall = (sid: string, module: ModuleId, purge: boolean): Promise<boolean> => startJob(sid, module, 'uninstall', { purge });

export const dismissJob = (sid: string, module: ModuleId): void => update(sid, (s) => ({ jobs: { ...s.jobs, [module]: undefined } }));

export function listenToModules(): () => void {
  return window.feather.onRemoteEvent((name, data) => {
    if (name === 'mod.job') {
      const e = data as JobEvent;
      update(e.sid, (s) => {
        const previous = s.jobs[e.module];
        const job: JobView = { jobId: e.jobId, module: e.module, kind: e.kind, state: e.state, steps: e.steps, step: e.step, error: e.error, log: previous?.jobId === e.jobId ? previous.log : '' };
        return { jobs: { ...s.jobs, [e.module]: job } };
      });
      if (e.state !== 'running') void detect(e.sid);
    } else if (name === 'mod.log') {
      const e = data as JobLog;
      update(e.sid, (s) => {
        const entry = Object.values(s.jobs).find((j) => j?.jobId === e.jobId);
        if (!entry) return {};
        const log = (entry.log + e.text).slice(-LOG_LIMIT);
        return { jobs: { ...s.jobs, [entry.module]: { ...entry, log } } };
      });
    }
  });
}

export function forgetSession(sid: string): void {
  const { [sid]: _removed, ...rest } = states;
  states = rest;
  listeners.forEach((l) => l());
}
