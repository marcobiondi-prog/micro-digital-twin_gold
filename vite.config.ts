import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Deploy target: nitro detects Vercel/Netlify/Cloudflare automatically and falls
// back to a Node server (`npm start`). Force one with NITRO_PRESET, e.g.
// NITRO_PRESET=cloudflare-module npm run build.
// One build time for the whole build: written into the code (__BUILD_TIME__) and served as /version.json, so the app
// can tell whether the version it runs is the one online (lib/app-version).
const BUILD_TIME = new Date().toISOString();

/**
 * Vercel: the year-long immutable cache header must reach only page files that exist. Nitro's Vercel output puts it
 * on every /assets/ path before the filesystem check, so a file asked for while a deploy was switching got a 404
 * cached for a year — on that phone the page then never loaded again ("Failed to fetch dynamically imported module",
 * shown as "reading 'component'"), and clearing the app's caches did not help, as it sits in the browser's HTTP
 * cache. The rule is moved to Vercel's "hit" phase, which runs only when a static file was found.
 */
function cacheOnlyFoundAssets(outputDir: string) {
  const file = join(outputDir, "config.json");
  if (!existsSync(file)) return;
  type VercelRoute = { src?: string; headers?: Record<string, string>; handle?: string; continue?: boolean; dest?: string };
  const config = JSON.parse(readFileSync(file, "utf8")) as { routes?: VercelRoute[] };
  const routes = config.routes ?? [];
  const isAssetCache = (r: VercelRoute) => r.src === "/assets/(.*)" && !!r.headers && !r.dest && !r.handle;
  const assetRule = routes.find(isAssetCache);
  if (!assetRule) return;
  config.routes = [
    ...routes.filter((r) => !isAssetCache(r)),
    { handle: "hit" },
    { src: "^/assets/(.*)$", headers: assetRule.headers ?? {}, continue: true },
  ];
  writeFileSync(file, JSON.stringify(config, null, 2));
}

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  // Simulated sign-in (src/lib/demo-login.ts): dev server and Vercel previews only, never production.
  define: { __DEMO_LOGIN__: JSON.stringify(command === "serve" || process.env["VERCEL_ENV"] === "preview"), __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core", "three"],
    // EZ-Tree's own sources (the package's build inlines its 3 MB of textures into the code): its pictures become
    // separate files, fetched only when the AR draws a tree.
    alias: { "ez-tree-src": join(process.cwd(), "node_modules/@dgreenheck/ez-tree/src/lib/index.js") },
  },
  // Hex hashes (2026-11-14): every page file got a new name once, so the 404s already cached for a year on phones
  // under the old names (see cacheOnlyFoundAssets) are never asked for again.
  build: { sourcemap: process.env["MDT_SOURCEMAP"] === "1", rollupOptions: { output: { hashCharacters: "hex" } } },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Vercel: AI recognition can outlast the default 10 s function limit (60 s fits every plan).
    ...(command === "build"
      ? [
          nitro({
            vercel: { functions: { maxDuration: 60 } },
            // Added with hooks.hook (a plain `hooks` option replaced the Vercel preset's own and no config.json was written).
            modules: [(n) => { n.hooks.hook("compiled", () => cacheOnlyFoundAssets(n.options.output.dir)); }],
          }),
        ]
      : []),
    viteReact(),
    {
      name: "mdt-version-json",
      apply: "build",
      generateBundle() {
        // Only the browser build serves it (the server build has its own output).
        if (this.environment?.name && this.environment.name !== "client") return;
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_TIME }) });
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: false,
      filename: "sw.js",
      // Nitro writes the client build here for node-server, cloudflare-module and
      // most presets; on Vercel it defaults to .vercel/output/static.
      outDir: process.env["PWA_OUT_DIR"] ?? (process.env["VERCEL"] ? ".vercel/output/static" : ".output/public"),
      devOptions: { enabled: false },
      workbox: {
        navigateFallback: null,
        globPatterns: ["**/*.{js,css,woff2,png,svg,ico}"],
        // The heavy files used only now and then (PDF, maps, AI camera scene, towns list, screenshots) are not
        // downloaded with every update: they are kept the first time they are used (the "assets" cache below), so a
        // new version installs in a few seconds instead of after ~6 MB.
        globIgnores: ["**/pdf.worker*", "**/pdf-*", "**/maplibre-gl*", "**/ar-scene*", "**/jspdf*", "**/html2canvas*", "**/comuni-it*", "**/index.es-*", "**/purify*", "**/three.module*", "**/three-layer*", "**/ArCameraLazy*", "**/jszip*", "**/*_1k-*", "**/ash_color-*", "**/aspen_color-*", "**/oak_color-*", "**/pine_color-*", "**/ez-tree*", "**/ar-tree*"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" && !url.pathname.startsWith("/auth/"),
            handler: "NetworkFirst",
            // Pages wait for the network and fall back to the saved copy only offline: with a timeout, a slow start of the
            // server made the worker serve a page of an older version with the new files ("reading 'component'").
            options: { cacheName: "pages-v2", expiration: { maxEntries: 30 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: { cacheName: "assets", expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
}));
