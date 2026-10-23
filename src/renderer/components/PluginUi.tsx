import {
  Bell,
  Bug,
  Cloud,
  Code,
  Cpu,
  Database,
  Download,
  Eye,
  Flame,
  Folder,
  Gift,
  Globe,
  Heart,
  Lock,
  Package,
  Palette,
  Pencil,
  Play,
  Plug,
  Puzzle,
  Rainbow,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Star,
  Terminal,
  Upload,
  Wand2,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { pluginEvent, usePlugins, type PluginBlock, type PluginButton } from '../lib/plugins';

const ICONS: Record<string, LucideIcon> = {
  bell: Bell, bug: Bug, cloud: Cloud, code: Code, cpu: Cpu, database: Database, download: Download, eye: Eye, flame: Flame,
  folder: Folder, gift: Gift, globe: Globe, heart: Heart, lock: Lock, package: Package, palette: Palette, pencil: Pencil,
  play: Play, plug: Plug, puzzle: Puzzle, rainbow: Rainbow, refresh: RefreshCw, rocket: Rocket, search: Search, server: Server,
  settings: Settings, shield: Shield, sparkles: Sparkles, star: Star, terminal: Terminal, upload: Upload, wand: Wand2, wrench: Wrench, zap: Zap,
};

export function PluginIcon({ icon, className = 'size-4' }: { icon: string; className?: string }) {
  if (!icon) return null;
  const Icon = ICONS[icon.toLowerCase()];
  if (Icon) return <Icon className={className} />;
  return <span className="leading-none select-none" aria-hidden>{icon.slice(0, 4)}</span>;
}

export function PluginButtons({ location, className = '' }: { location: string; className?: string }) {
  const contributions = usePlugins((s) => s.contributions);
  const buttons: { plugin: string; button: PluginButton }[] = [];
  for (const c of contributions) for (const button of c.buttons) if (button.location === location) buttons.push({ plugin: c.plugin, button });
  if (!buttons.length) return null;
  return (
    <div className={`flex items-center gap-1 ${className}`} data-plugin-slot={location}>
      {buttons.map(({ plugin, button }) => (
        <button
          key={`${plugin}:${button.id}`}
          className="btn btn-ghost btn-sm animate-fade-in"
          title={button.tooltip || button.label}
          onClick={() => pluginEvent('button.click', { plugin, id: button.id })}
          data-plugin-button={`${plugin}:${button.id}`}
        >
          <PluginIcon icon={button.icon} />
          {button.label}
        </button>
      ))}
    </div>
  );
}

export function PluginView({ plugin, view, blocks }: { plugin: string; view: string; blocks: PluginBlock[] }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3 animate-fade-in" data-plugin-view={`${plugin}:${view}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return <h2 key={i} className="text-lg font-semibold text-neutral-50 tracking-tight">{b.text}</h2>;
          case 'text':
            return <p key={i} className="text-sm text-neutral-300 whitespace-pre-wrap">{b.text}</p>;
          case 'code':
            return <pre key={i} className="rounded-lg bg-black/40 border border-neutral-800 p-3 font-mono text-xs text-neutral-300 whitespace-pre-wrap overflow-auto select-text">{b.text}</pre>;
          case 'divider':
            return <hr key={i} className="border-neutral-800" />;
          case 'button':
            return (
              <button key={i} className="btn btn-primary btn-sm" onClick={() => pluginEvent('view.action', { plugin, view, id: b.id ?? '' })}>
                {b.label}
              </button>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
