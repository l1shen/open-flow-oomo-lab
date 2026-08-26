import { describe, expect, it } from 'vitest'
import { setFlowViewport, setNodePositions } from './workspace.ts'

describe('Designer presentation layouts', () => {
  it('stores positions independently for each display mode', () => {
    const target = { kind: 'flow' } as const
    const detail = setNodePositions({}, target, { task: { x: 10, y: 20 } }, 'detail')
    const overview = setNodePositions(detail, target, { task: { x: 30, y: 40 } }, 'overview')

    expect(overview).toMatchObject({
      designer: {
        flow: {
          layouts: {
            detail: { nodes: { task: { x: 10, y: 20 } } },
            overview: { nodes: { task: { x: 30, y: 40 } } },
          },
        },
      },
    })
  })

  it('persists a default-looking viewport when its display mode has no saved viewport', () => {
    const value = setFlowViewport({}, { kind: 'flow' }, { x: 0, y: 0, zoom: 1 }, 'overview')

    expect(value).toMatchObject({
      designer: { flow: { layouts: { overview: { viewport: { x: 0, y: 0, zoom: 1 } } } } },
    })
  })
})
