import type { PreviewType } from '../../../../base/common/preview.ts'

import { val } from 'value-enhancer'
import { describe, expect, it } from 'vitest'
import { PreviewSectionStore } from './nodeSection/previewSection.store.ts'
import { NodeUIStore } from './nodeUI.store.ts'

describe('NodeUIStore', () => {
  it('retains preview layout after a runtime preview disappears', async () => {
    const sections = val([])
    const store = new NodeUIStore(sections, {
      sections: { preview: { result: { cardCollapsed: true, previewHeight: 180 } } },
    })
    expect(store.getPreviewSectionUIState('result')).toEqual({ cardCollapsed: true, previewHeight: 180 })

    const preview = new PreviewSectionStore({
      actions: val(),
      id: 'result',
      initialUIState: store.getPreviewSectionUIState('result'),
      preview: val(null),
      widgetType: val<PreviewType | undefined>('json'),
    })
    sections.set([preview])
    await Promise.resolve()
    preview.$$.previewHeight.set(260)
    expect(store.toUIData().sections).toEqual({ preview: { result: { cardCollapsed: true, previewHeight: 260 } } })

    sections.set([])
    await Promise.resolve()
    expect(store.toUIData().sections).toEqual({ preview: { result: { cardCollapsed: true, previewHeight: 260 } } })
    preview.dispose()
    store.dispose()
  })
})
