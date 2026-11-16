/// <reference types="vite/client" />

// Browser-visible build variables. Read them with dot access (import.meta.env.NAME):
// Vite then inlines only that value instead of the whole env object.
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
}

// EZ-Tree's sources (vite alias "ez-tree-src", see vite.config.ts), used by views/ar-tree.
declare module "ez-tree-src" {
  import type { Group } from "three";
  export class Tree extends Group {
    options: { seed: number; leaves: { count: number; tint: number }; bark: { tint: number } } & Record<string, unknown>;
    loadPreset(name: string): void;
    generate(): void;
  }
}
