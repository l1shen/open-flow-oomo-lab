import { defineConfig } from 'vitest/config'
import { twemojiCollectionPlugin } from './src/build/node/twemojiCollection.ts'

export default defineConfig({
  plugins: [twemojiCollectionPlugin()],
  test: {
    coverage: {
      include: [
        'src/execution/common/events.ts',
        'src/execution/common/scheduler.ts',
        'src/flow/common/change.ts',
        'src/flow/common/encoding.ts',
        'src/trigger/providers/google-drive/changes.ts',
        'src/trigger/providers/slack/on-message-posted.ts',
        'src/trigger/providers/telegram/on-update.ts',
      ],
      provider: 'v8',
      reporter: ['text'],
      thresholds: { branches: 70, functions: 80, lines: 80 },
    },
  },
})
