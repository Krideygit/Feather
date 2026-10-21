import { useCallback, useEffect, useState } from 'react';
import type { DbInfo } from '../../shared/types';
import { call } from '../lib/api';

export function useDatabases(id: string, running: boolean) {
  const [dbs, setDbs] = useState<DbInfo[] | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!running) return;
    setError('');
    try {
      setDbs(await call<DbInfo[]>('db.list', { id }));
    } catch (err) {
      setDbs([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id, running]);

  useEffect(() => {
    if (running) void reload();
    else setDbs(null);
  }, [running, reload]);

  return { dbs, error, reload };
}
