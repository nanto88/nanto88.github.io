// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://nanto88.github.io',

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [mdx(), sitemap()],

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-dimmed' },
      // no inline default colour, global.css picks light or dark from data-theme
      defaultColor: false,
    },
  },
});