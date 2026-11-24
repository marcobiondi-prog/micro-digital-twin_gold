import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // jsdom + the video/camera components are slow to load on modest machines.
    testTimeout: 15000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "ez-tree-src": path.resolve(__dirname, "node_modules/@dgreenheck/ez-tree/src/lib/index.js"),
    },
  },
});
