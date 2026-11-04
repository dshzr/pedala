import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Ícones do app gerados a partir de public/icone.svg (npx pwa-assets-generator).
// Fundo verde em vez de branco nos ícones recortados pelo sistema (Android e iPhone).
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#0b5d3b' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#0b5d3b' } },
  },
  images: ['public/icone.svg'],
});
