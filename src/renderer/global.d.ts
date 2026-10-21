import type { FeatherBridge } from '../shared/types';

declare global {
  interface Window {
    feather: FeatherBridge;
  }
}

export {};
