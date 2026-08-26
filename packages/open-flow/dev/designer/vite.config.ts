import tailwindcss from '@tailwindcss/vite'
import UnoCSS from '@unocss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import designerUnoConfig from '../../src/build/node/designerUnoConfig.ts'
import { twemojiCollectionPlugin } from '../../src/build/node/twemojiCollection.ts'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [twemojiCollectionPlugin(), tailwindcss(), UnoCSS(designerUnoConfig), react()],
  resolve: { alias: { '@lab': path.resolve(import.meta.dirname) } },
  server: { open: false },
})
