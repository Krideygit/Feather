import type { Settings } from '../../shared/types';
import { toast } from '../components/Toast';
import { getState, setState } from './store';

export async function updateSettings(patch: Partial<Settings>): Promise<Settings | null> {
  try {
    const next = await window.feather.setSettings(patch);
    setState({ settings: next });
    return next;
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
    return null;
  }
}

export const currentSettings = (): Settings => getState().settings;
