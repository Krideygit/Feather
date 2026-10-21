import { Car, Database, Globe, Pickaxe, Server, type LucideProps } from 'lucide-react';
import type { ServiceType } from '../../shared/types';

const ICONS = { mariadb: Database, nginx: Globe, apache: Server, minecraft: Pickaxe, paper: Pickaxe, fivem: Car } as const;

export function TypeIcon({ type, ...props }: { type: ServiceType } & LucideProps) {
  const Component = ICONS[type];
  return <Component {...props} />;
}
