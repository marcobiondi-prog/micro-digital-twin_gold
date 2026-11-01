import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

// Deploy target: nitro detects Vercel/Netlify/Cloudflare automatically and falls
// back to a Node server (`npm start`). Force one with NITRO_PRESET, e.g.
// NITRO_PRESET=cloudflare-module npm run build.
// One build time for the whole build: written into the code (__BUILD_TIME__) and served as /version.json, so the app
// can tell whether the version it runs is the one online (lib/app-version).
const BUILD_TIME = new Date().toISOString();

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  // Simulated sign-in (src/lib/demo-login.ts): dev server and Vercel previews only, never production.
  define: { __DEMO_LOGIN__: JSON.stringify(command === "serve" || process.env["VERCEL_ENV"] === "preview"), __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
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
    ...(command === "build" ? [nitro({ vercel: { functions: { maxDuration: 60 } } })] : []),
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
      // most presets; adjust if your host uses another static dir (Vercel: .vercel/output/static).
      outDir: process.env["PWA_OUT_DIR"] ?? ".output/public",
      devOptions: { enabled: false },
      workbox: {
        navigateFallback: null,
        globPatterns: ["**/*.{js,css,woff2,png,svg,ico}"],
        // The heavy files used only now and then (PDF, maps, AI camera scene, towns list, screenshots) are not
        // downloaded with every update: they are kept the first time they are used (the "assets" cache below), so a
        // new version installs in a few seconds instead of after ~6 MB.
        globIgnores: ["**/pdf.worker*", "**/pdf-*", "**/maplibre-gl*", "**/ar-scene*", "**/jspdf*", "**/html2canvas*", "**/comuni-it*", "**/index.es-*", "**/purify*"],
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
