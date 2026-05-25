import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { mockBackendPlugin } from "./src/mock/vite-plugin";

const TEMPLATE_URL = "http://localhost:3001";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = (env.VITE_BACKEND ?? "mock").toLowerCase();
  const isReal = backend === "real";

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Mock plugin is wired only in mock mode. In real mode the dev proxy below
      // forwards /api/* to the vercel/chatbot template instead.
      ...(isReal ? [] : [mockBackendPlugin()]),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      host: true,
      ...(isReal && {
        proxy: {
          "/api": {
            target: TEMPLATE_URL,
            changeOrigin: true,
            cookieDomainRewrite: { "*": "" }, // strip explicit Domain= attr
            ws: false,
          },
        },
      }),
    },
    define: {
      __BACKEND_MODE__: JSON.stringify(backend),
    },
  };
});
