import type { CoreEvents } from '../../shared/types';
import { closeAllLayers } from '../components/Layers';
import { toast } from '../components/Toast';
import { refreshProfiles, refreshRuntimes, refreshServices } from './api';
import { emit, setState, upsertService } from './store';

function handle<K extends keyof CoreEvents>(name: K, data: CoreEvents[K]): void {
  switch (name) {
    case 'service.status':
      upsertService(data as CoreEvents['service.status']);
      break;
    case 'service.removed': {
      const { id } = data as CoreEvents['service.removed'];
      setState((s) => ({ services: s.services.filter((x) => x.id !== id) }));
      break;
    }
    case 'service.log':
      emit('log', data as CoreEvents['service.log']);
      break;
    case 'runtime.progress': {
      const p = data as CoreEvents['runtime.progress'];
      setState((s) => ({ progress: { ...s.progress, [`${p.type}@${p.version}`]: p } }));
      emit('progress', p);
      break;
    }
    case 'db.export.progress':
      emit('exportProgress', data as CoreEvents['db.export.progress']);
      break;
    case 'profile.changed':
      closeAllLayers();
      setState({ services: [] });
      Promise.all([refreshServices(), refreshProfiles(), refreshRuntimes()]).catch((err: Error) => toast(err.message, 'error'));
      break;
    default:
  }
}

export function listenToCore(): () => void {
  window.feather.onFatal((message) => setState({ coreError: message }));
  return window.feather.onEvent((name, data) => handle(name as keyof CoreEvents, data as never));
}
