import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sandbox-only host allowlist: the preview proxy forwards the sandbox hostname,
// which changes whenever the environment is recreated. Enabled only when
// BASE44_PREVIEW_MODE is exactly "1"; otherwise Vite's default applies.
const previewMode = process.env.BASE44_PREVIEW_MODE === '1';
const sandboxDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN;
const allowedHosts =
  previewMode && sandboxDomain ? [`.${sandboxDomain}`] : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts,
    watch: { usePolling: true },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
