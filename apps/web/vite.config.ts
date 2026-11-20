import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import * as NodePath from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "~": NodePath.resolve(import.meta.dirname, "src") } },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
  server: { port: 5833, strictPort: true },
});
