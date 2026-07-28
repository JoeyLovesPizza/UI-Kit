import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dts()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'ui-kit',
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom', 'motion/react', 'dialkit'],
    },
  },
})
