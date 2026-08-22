import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Range } from './range.tsx'

describe('Range', () => {
  it('formats integer steps without decimal places', () => {
    expect(renderToStaticMarkup(<Range value={1_048_576} step={1} />)).toContain('>1048576</span>')
  })

  it('retains the precision of fractional steps', () => {
    expect(renderToStaticMarkup(<Range value={0.5} step={0.1} />)).toContain('>0.5</span>')
  })
})
