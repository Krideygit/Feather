import { createContext, useContext } from 'react';
import type { TableInfo } from '../../shared/types';

export interface BlueprintEnv {
  databases: string[];
  schema: Record<string, TableInfo[] | undefined>;
  loadSchema: (database: string) => Promise<TableInfo[]>;
  problems: Record<string, string>;
}

export const BlueprintContext = createContext<BlueprintEnv>({
  databases: [],
  schema: {},
  loadSchema: () => Promise.resolve([]),
  problems: {},
});

export const useBlueprint = (): BlueprintEnv => useContext(BlueprintContext);

export const COLUMN_LIST = 'bp-columns';
