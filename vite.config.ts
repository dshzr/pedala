import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const UM_MES = 60 * 60 * 24 * 30;

// No GitHub Pages o site mora em /pedala/; localmente, na raiz. O workflow define BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    // Transforma o site em app instalável (PWA): manifesto, ícones e service worker.
    VitePWA({
      registerType: 'autoUpdate',
      // Os ícones já entram pelo globPatterns; sem isto eles iriam duas vezes.
      includeManifestIcons: false,
      manifest: {
        name: 'Pedala · rotas por ciclovia',
        short_name: 'Pedala',
        description: 'Rotas de bicicleta que preferem ciclovias, com modo viagem.',
        lang: 'pt-BR',
        // Relativos ao manifesto, para funcionar tanto na raiz quanto em /pedala/.
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // O worker do mapa é .mjs e passa de 500 kB; precisa entrar no app guardado.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ico}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        // Pedaços de mapa já vistos ficam guardados: abre rápido e aguenta sinal fraco.
        // Rotas (BRouter) e endereços (Photon) sempre vão à internet.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org' && url.pathname.startsWith('/styles/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'mapa-estilo', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapa-tiles',
              expiration: { maxEntries: 4000, maxAgeSeconds: UM_MES },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('tile-cyclosm.openstreetmap.fr'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ciclovias-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: UM_MES },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fontes',
              expiration: { maxEntries: 30, maxAgeSeconds: UM_MES * 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // O maplibre-gl 6 acha o próprio worker pelo endereço do módulo; o pré-empacotamento
  // do Vite muda esse endereço, então ele fica de fora.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
