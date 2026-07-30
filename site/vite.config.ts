import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Aliases straight to ui-kit's source (not dist) so the site always reflects
// what's currently in src/ with full HMR — no build step in the library
// needed while working on either side.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      'ui-kit': resolve(import.meta.dirname, '../src/index.ts'),
    },
    // Aliasing straight to src/ means its imports of react/motion/dialkit
    // would otherwise resolve against ui-kit's own root node_modules (the
    // nearest one walking up from src/) instead of this site's — two
    // copies of React loaded at once, which breaks hooks. Same fix the
    // README documents for consuming apps.
    dedupe: ['react', 'react-dom', 'motion', 'dialkit'],
  },
  // GitHub Pages serves a project site from /<repo-name>/, but the dev
  // server needs to stay at the root or asset URLs break locally.
  base: command === 'build' ? '/UI-Kit/' : '/',
}))
