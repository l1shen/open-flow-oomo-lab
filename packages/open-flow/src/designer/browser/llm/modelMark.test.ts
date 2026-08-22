import { describe, expect, it } from 'vitest'
import { modelMarkAppearance } from './modelMark.tsx'

describe('LLM model marks', () => {
  it.each([
    ['accounts/fireworks/models/kimi-k2p5', { label: 'K', tone: 'cyan' }],
    ['qwen3.7-max', { label: 'Q', tone: 'magenta' }],
    ['custom-model', { label: 'AI', tone: 'neutral' }],
  ])('maps %s to its internal visual identity', (model, expected) => {
    expect(modelMarkAppearance(model)).toEqual(expected)
  })
})
