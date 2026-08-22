import styles from './PreviewSection.module.scss'
import type { PreviewSectionStore } from '../../stores/node/nodeSection/previewSection.store.ts'

import { memo, useEffect, useRef } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { createResizeHandle } from '../../preview/resizeHandle.ts'
import { MIN_NODE_WIDTH } from '../../stores/node/constants.ts'
import { PREVIEW_SECTION_TYPE } from '../../stores/node/nodeSection/constants.ts'
import { Card } from './card.tsx'
import { WIDGET_ACTION_ICON } from './constants.ts'

export interface PreviewSectionProps {
  section: PreviewSectionStore
}

export const PreviewSection: React.FC<PreviewSectionProps> = /* @__PURE__ */ memo(({ section }) => {
  const t = useTranslate()
  const preview = useVal(section.$.preview)
  const actions = useVal(section.$.actions)
  const widgetType = useVal(section.$.widgetType)
  const previewType = widgetType ? `oo-preview-${widgetType}` : ''
  const title = useVal(section.$.title)
  const previewHeight = useVal(section.$.previewHeight)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = previewRef.current
    const nodeContentWidth$ = section.$.nodeContentWidth
    const viewport$ = section.$.viewport
    if (!container || !nodeContentWidth$ || !viewport$) return
    let startWidth = 0
    let startHeight = 0
    return createResizeHandle({
      container,
      onResizeStart: () => {
        startWidth = nodeContentWidth$.value || MIN_NODE_WIDTH
        startHeight = section.$$.previewHeight.value || container.offsetHeight
      },
      onResize: (offsetX, offsetY) => {
        const zoom = viewport$.value?.zoom || 1
        nodeContentWidth$.set(Math.max(MIN_NODE_WIDTH, startWidth + offsetX / zoom))
        section.$$.previewHeight.set(Math.max(100, startHeight + offsetY / zoom))
      },
    })
  }, [section])

  return (
    preview && (
      <Card
        name={PREVIEW_SECTION_TYPE}
        icon="i-codicon:chevron-down"
        collapsedIcon="i-codicon:chevron-right"
        title={
          <>
            {t('preview.title')} {title}
          </>
        }
        contentClassName={`${styles.content} ${previewType}`}
        actions={actions?.map((action) => ({
          icon: WIDGET_ACTION_ICON[action.type],
          title: action.title || t(`widgetAction.${action.type}`),
          onClick: action.onClick,
        }))}
        collapsed$={section.$$.cardCollapsed}
      >
        <div ref={previewRef} className={styles.resizable} style={previewHeight == null ? undefined : { height: Math.max(100, previewHeight) }}>
          {preview}
        </div>
      </Card>
    )
  )
})
