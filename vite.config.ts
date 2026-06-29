import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The GitHub Pages project site is served from /<repo>/.
// Repo name: lithuania-generator (see remote origin).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/lithuania-generator/" : "/",
}));
