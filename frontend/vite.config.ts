/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy note:
// By default the app talks straight to VITE_API_BASE (http://127.0.0.1:8001),
// which requires the backend to allow CORS from the vite origin.
// If you'd rather avoid CORS entirely, set VITE_API_BASE="" (empty string) in
// .env.local — requests then go same-origin to /api/* and the proxy below
// forwards them to the engine.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
