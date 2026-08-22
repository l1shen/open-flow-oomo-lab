import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CompactValue } from './CompactValue.tsx'
import { DataRender } from './DataRender.tsx'

const renderValue = (value: unknown, stringTruncateLength?: number): string => {
  return renderToStaticMarkup(
    <DataRender value={value} lastElement level={0} shouldExpandNode={() => true} clickToExpandNode stringTruncateLength={stringTruncateLength} />,
  )
}

describe('DataRender', () => {
  it('uses the configured string truncation length', () => {
    const markup = renderValue('abcdef', 3)

    expect(markup).toContain('&quot;ab...')
    expect(markup).not.toContain('&quot;abcdef&quot;')
  })

  it('renders bigint values without invoking the BigInt constructor', () => {
    expect(renderValue(42n)).toContain('42n')
  })

  it('renders useful values in a compact object preview', () => {
    const markup = renderToStaticMarkup(<CompactValue value={{ message: 'Hello, World', ok: true }} />)

    expect(markup).toContain('message: ')
    expect(markup).toContain('&quot;Hello, World&quot;')
    expect(markup).toContain('ok: ')
    expect(markup).toContain('true')
  })
})
