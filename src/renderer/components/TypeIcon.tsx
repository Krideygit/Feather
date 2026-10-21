import { Database, Globe, Server, type LucideProps } from 'lucide-react';
import type { ServiceType } from '../../shared/types';

const ICONS = { mariadb: Database, nginx: Globe, apache: Server } as const;

export function TypeIcon({ type, ...props }: { type: ServiceType } & LucideProps) {
  const Component = ICONS[type];
  return <Component {...props} />;
}
