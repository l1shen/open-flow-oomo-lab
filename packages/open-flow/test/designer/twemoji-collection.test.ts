import type { IconifyJSONPackageExports } from '@iconify/types'

import { describe, expect, it } from 'vitest'
import { filterTwemoji } from '../../src/build/node/twemojiCollection.ts'

const fixture: IconifyJSONPackageExports = {
  chars: { a: 'wave', b: 'wave-skin-tone-dark' },
  icons: {
    prefix: 'twemoji',
    icons: {
      'wave': { body: '<path />' },
      'wave-skin-tone-dark': { body: '<path />' },
    },
    aliases: {
      'hello': { parent: 'wave' },
      'hello-skin-tone-dark': { parent: 'wave-skin-tone-dark' },
    },
  },
  info: {
    name: 'Twemoji',
    author: { name: 'Twitter' },
    license: { title: 'CC-BY 4.0' },
  },
  metadata: {
    categories: {
      people: ['wave', 'hello', 'wave-skin-tone-dark', 'hello-skin-tone-dark'],
      removed: ['wave-skin-tone-dark'],
    },
  },
}

describe('Twemoji build collection', () => {
  it('removes skin tones and every dangling index entry', () => {
    const result = filterTwemoji(fixture)

    expect(Object.keys(result.icons.icons)).toEqual(['wave'])
    expect(Object.keys(result.icons.aliases ?? {})).toEqual(['hello'])
    expect(result.chars).toEqual({ a: 'wave' })
    expect(result.metadata.categories).toEqual({ people: ['wave', 'hello'] })
  })
})
