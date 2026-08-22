import { describe, expect, it } from 'vitest'
import { resolveTranslationSeed } from '../../src/designer/browser/components/input2.tsx'

describe('translated input', () => {
  it('uses the node ID when an untitled node enables translation', () => {
    expect(resolveTranslationSeed(undefined, 'greet')).toBe('greet')
    expect(resolveTranslationSeed('', 'greet')).toBe('greet')
    expect(resolveTranslationSeed('Greeting', 'greet')).toBe('Greeting')
  })
})
