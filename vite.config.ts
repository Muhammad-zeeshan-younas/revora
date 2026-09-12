import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
