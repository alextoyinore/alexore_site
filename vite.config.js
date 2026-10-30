import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const root = import.meta.dirname;
const pages = Object.fromEntries(readdirSync(root)
  .filter((name) => extname(name) === '.html')
  .map((name) => [basename(name, '.html'), resolve(root, name)]));

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(root, 'public'),
  plugins: [{
    name: 'alexore-favicon',
    transformIndexHtml(html) {
      return html.replace('</head>', '  <link rel="icon" type="image/svg+xml" href="./favicon.svg">\n</head>');
    },
  }],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost/alexore',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (request) => request.removeHeader('origin'));
        },
      },
      '/uploads': {
        target: 'http://localhost/alexore',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: { input: pages },
  },
});
