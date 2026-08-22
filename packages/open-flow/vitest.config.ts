import { defineConfig } from 'vitest/config'
import { twemojiCollectionPlugin } from './src/build/node/twemojiCollection.ts'

export default defineConfig({ plugins: [twemojiCollectionPlugin()] })
