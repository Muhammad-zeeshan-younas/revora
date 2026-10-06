import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import type { Plugin } from 'vite';

function offlineShell(): Plugin {
  return {
    name: 'revora-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = ['/', '/index.html', ...Object.keys(bundle).map((file) => `/${file}`)];
      const cacheName = `revora-shell-${Date.now()}`;
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE_NAME = ${JSON.stringify(cacheName)};
const SHELL_FILES = ${JSON.stringify(assets)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('revora-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});`,
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), offlineShell()],
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
