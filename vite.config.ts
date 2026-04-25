import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import apiDevPlugin from './vite-plugin-api';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Eagerly load .env so api/* handlers (run via ssrLoadModule) see them too.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [react(), apiDevPlugin()],
    server: {
      port: 5173,
    },
  };
});
