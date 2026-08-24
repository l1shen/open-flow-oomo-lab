import type { ReactNode } from 'react'
import type { FlowDisplayMode } from '../../../common/flowDisplay.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { val } from 'value-enhancer'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from '../../i18n/index.ts'
import { DisplayModeToggle } from './DisplayModeToggle.tsx'

const captured = vi.hoisted(() => ({
  props: undefined as
    | {
        readonly children?: ReactNode
        readonly onValueChange: (value: FlowDisplayMode[]) => void
        readonly size?: string
        readonly spacing?: number
        readonly value: FlowDisplayMode[]
        readonly variant?: string
      }
    | undefined,
}))

vi.mock('../../../../ui/browser/toggle-group.tsx', () => ({
  ToggleGroup: (props: NonNullable<typeof captured.props>) => {
    captured.props = props
    return <div data-slot="toggle-group">{props.children}</div>
  },
  ToggleGroupItem: ({ children }: { readonly children?: ReactNode }) => <div data-slot="toggle-group-item">{children}</div>,
}))

describe('DisplayModeToggle', () => {
  it('uses the shared ToggleGroup inside a React Flow Panel', () => {
    const displayMode = val<FlowDisplayMode>('overview')
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <DisplayModeToggle displayMode$={displayMode} />
      </I18nProvider>,
    )

    expect(markup).toContain('react-flow__panel bottom center')
    expect(markup).toContain('data-canvas-control-scope="true"')
    expect(markup).toContain('data-slot="toggle-group"')

    expect(captured.props?.value).toEqual(['overview'])
    expect(captured.props?.size).toBeUndefined()
    expect(captured.props?.spacing).toBe(0)
    expect(captured.props?.variant).toBe('outline')
    captured.props?.onValueChange(['detail'])
    expect(displayMode.value).toBe('detail')
  })
})
