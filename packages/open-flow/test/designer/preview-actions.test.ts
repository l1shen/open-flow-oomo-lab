import { describe, expect, it } from 'vitest'
import { createPreviewActions } from '../../src/workbench/browser/previewActions.ts'

describe('Preview actions', () => {
  it('provides download and open actions for media', () => {
    expect(createPreviewActions({ type: 'image', data: '/one.png' }, 'result').map((action) => action.type)).toEqual(['download', 'openInNewTab'])
  })

  it('does not expose actions for malformed previews', () => {
    expect(createPreviewActions({ type: 'image', data: [] }, 'result')).toEqual([])
  })
})
