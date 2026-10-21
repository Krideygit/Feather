import { useEffect, useState } from 'react';

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatUptime(since: number | null): string {
  if (!since) return '';
  const minutes = Math.floor((Date.now() - since) / 60000);
  if (minutes < 1) return 'gerade gestartet';
  if (minutes < 60) return `seit ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `seit ${hours} Std. ${minutes % 60} Min.`;
  return `seit ${Math.floor(hours / 24)} Tg.`;
}

export function useTicker(ms = 30000): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}
