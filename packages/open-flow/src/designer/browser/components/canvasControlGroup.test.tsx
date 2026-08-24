import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CanvasControlGroup } from './canvasControlGroup.tsx'

describe('CanvasControlGroup', () => {
  it('preserves its required scope markers when callers pass data attributes', () => {
    const markup = renderToStaticMarkup(
      <CanvasControlGroup data-canvas-control-scope={undefined} data-slot="caller-slot" data-theme="dark">
        Controls
      </CanvasControlGroup>,
    )

    expect(markup).toContain('data-canvas-control-scope="true"')
    expect(markup).toContain('data-slot="canvas-control-group"')
    expect(markup).toContain('data-theme="dark"')
  })
})
