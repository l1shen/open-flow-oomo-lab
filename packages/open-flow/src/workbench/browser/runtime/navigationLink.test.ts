import type { MouseEvent } from 'react'

import { describe, expect, it, vi } from 'vitest'
import { followWorkbenchLink } from './navigationLink.ts'

function click(overrides: Partial<MouseEvent<Element>> = {}): MouseEvent<Element> {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    ...overrides,
  } as MouseEvent<Element>
}

describe('followWorkbenchLink', () => {
  it('uses client navigation for an ordinary primary click', () => {
    const event = click()
    const navigate = vi.fn()

    followWorkbenchLink(event, navigate)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledOnce()
  })

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)('preserves browser navigation when %s is pressed', (key) => {
    const event = click({ [key]: true })
    const navigate = vi.fn()

    followWorkbenchLink(event, navigate)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('preserves non-primary and already handled clicks', () => {
    for (const event of [click({ button: 1 }), click({ defaultPrevented: true })]) {
      const navigate = vi.fn()
      followWorkbenchLink(event, navigate)
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
    }
  })
})
