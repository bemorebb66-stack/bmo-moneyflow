import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const STATIC_ROUTES = [
  "scanner",
  "stock",
  "insider",
  "ipo-lockup",
  "today",
  "methodology",
  "feedback",
  "disclaimer",
  "privacy-policy",
];

const routeShells = () => ({
  name: "route-shells",
  closeBundle() {
    const outputDir = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "dist",
    );
    const shell = resolve(outputDir, "index.html");

    for (const route of STATIC_ROUTES) {
      const routeDir = resolve(outputDir, route);
      mkdirSync(routeDir, { recursive: true });
      copyFileSync(shell, resolve(routeDir, "index.html"));
    }
  },
});

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    routeShells(),
  ],
  build: { outDir: "dist" },
});
