import { describe, expect, it } from 'vitest'
import { getIframeSandbox } from '../../src/designer/browser/preview/iframePolicy.ts'

describe('Iframe sandbox policy', () => {
  it('keeps inline HTML in an opaque origin', () => {
    const tokens = new Set(getIframeSandbox(true).split(' '))
    expect(tokens.has('allow-scripts')).toBe(true)
    expect(tokens.has('allow-same-origin')).toBe(false)
    expect(tokens.has('allow-popups-to-escape-sandbox')).toBe(false)
  })

  it('keeps the existing external URL capabilities separate', () => {
    const tokens = new Set(getIframeSandbox(false).split(' '))
    expect(tokens.has('allow-scripts')).toBe(true)
    expect(tokens.has('allow-same-origin')).toBe(true)
  })
})
