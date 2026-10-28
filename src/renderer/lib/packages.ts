import { Boxes, Car, Code, Gamepad2, HardDrive, Mail, MessageSquare, Pickaxe, Terminal, Zap, type LucideIcon } from 'lucide-react';
import type { OptionValue, ServiceType } from '../../shared/types';

export interface PackageGroup {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface PackageDef {
  id: string;
  group: string;
  name: string;
  description: string;
  icon: LucideIcon;
  types?: ServiceType[];
  tool?: 'bots';
}

export const GROUPS: PackageGroup[] = [
  { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'dev', label: 'Entwicklung', icon: Code },
  { id: 'chat', label: 'Kommunikation', icon: MessageSquare },
  { id: 'data', label: 'Daten & Speicher', icon: HardDrive },
];

export const PACKAGES: PackageDef[] = [
  { id: 'minecraft', group: 'gaming', name: 'Minecraft-Server', description: 'Vanilla oder Paper mit Konsole, Speicher-Auswahl und EULA-Prüfung.', icon: Pickaxe, types: ['minecraft', 'paper'] },
  { id: 'fivem', group: 'gaming', name: 'FiveM-Server', description: 'FXServer mit Standard-Ressourcen. Benötigt einen kostenlosen Lizenzschlüssel.', icon: Car, types: ['fivem'] },
  { id: 'redis', group: 'dev', name: 'Redis', description: 'In-Memory-Cache und Message-Broker für lokale Projekte.', icon: Zap },
  { id: 'php', group: 'dev', name: 'PHP', description: 'PHP-FPM, das mit Nginx und Apache zusammenarbeitet.', icon: Terminal },
  { id: 'node', group: 'dev', name: 'Node.js', description: 'Verschiedene Node-Versionen pro Projekt, ohne globale Installation.', icon: Boxes },
  { id: 'discord', group: 'chat', name: 'Discord-Server', description: 'Baue Discord-Bots aus Knoten, teste sie im Simulator und stelle sie auf einem Server bereit.', icon: MessageSquare, tool: 'bots' },
  { id: 'mailpit', group: 'chat', name: 'Mailpit', description: 'Fängt alle ausgehenden Test-Mails lokal ab und zeigt sie in einem Postfach im Browser.', icon: Mail, types: ['mailpit'] },
  { id: 'minio', group: 'data', name: 'MinIO', description: 'S3-kompatibler Objektspeicher für Uploads und Backups.', icon: HardDrive },
];

export const isAvailable = (pkg: PackageDef): boolean => Boolean(pkg.types?.length || pkg.tool);

export const MEMORY_CHOICES = ['512M', '1G', '2G', '3G', '4G', '6G', '8G', '12G', '16G'];

export function defaultOptions(type: ServiceType): Record<string, OptionValue> {
  if (type === 'mailpit') return { smtpPort: 1025, persist: true, maxMessages: 500, lan: false };
  if (type === 'fivem') return { licenseKey: '', hostname: 'Feather FiveM Server', maxClients: 32, lan: false };
  return { memory: '2G', motd: 'Feather Server', maxPlayers: 20, onlineMode: true, lan: false, eula: false };
}
