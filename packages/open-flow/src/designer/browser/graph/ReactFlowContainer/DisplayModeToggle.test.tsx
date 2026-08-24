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
        readonly onValueChange: (value: string | null) => void
        readonly value: FlowDisplayMode
      }
    | undefined,
}))

vi.mock('../../../../ui/browser/tabs.tsx', () => ({
  Tabs: (props: NonNullable<typeof captured.props>) => {
    captured.props = props
    return null
  },
  TabsList: () => null,
  TabsTrigger: () => null,
}))

describe('DisplayModeToggle', () => {
  it('uses the shared Tabs control for overview and detail', () => {
    const displayMode = val<FlowDisplayMode>('overview')
    renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <DisplayModeToggle displayMode$={displayMode} />
      </I18nProvider>,
    )

    expect(captured.props?.value).toBe('overview')
    captured.props?.onValueChange('detail')
    expect(displayMode.value).toBe('detail')
  })
})
