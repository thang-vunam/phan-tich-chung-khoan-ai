import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const freeKey = env.GEMINI_FREE_API_KEY || env.GEMINI_API_KEY || process.env.GEMINI_FREE_API_KEY || process.env.GEMINI_API_KEY || '';
    const paidKey = env.GEMINI_PAID_API_KEY || process.env.GEMINI_PAID_API_KEY || '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(freeKey || paidKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(freeKey || paidKey),
        'process.env.GEMINI_FREE_API_KEY': JSON.stringify(freeKey),
        'process.env.GEMINI_PAID_API_KEY': JSON.stringify(paidKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
