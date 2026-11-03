import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  // A production build must not inherit NODE_ENV=development from a sourced
  // .env file or the CI environment. When it does, Vite keeps React's development
  // build AND the JSX dev runtime, and the bundle more than doubles (356 kB vs
  // 161 kB here) while still reporting a successful build. Set it here, before
  // the plugins read it, so the output depends on the command alone.
  if (command === "build") process.env.NODE_ENV = "production";
  return {
    plugins: [react()],
    ...(command === "build"
      ? { define: { "process.env.NODE_ENV": JSON.stringify("production") } }
      : {}),
    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: true,
      proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } },
    },
  };
});
