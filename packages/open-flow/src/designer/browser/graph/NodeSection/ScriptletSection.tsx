import styles from './ScriptletSection.module.scss'
import type { ScriptletSectionStore } from '../../stores/node/nodeSection/scriptletSection.store.ts'

import { clsx } from 'clsx'
import { memo, useEffect, useLayoutEffect, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { createResizeHandle } from '../../preview/resizeHandle.ts'
import { MIN_NODE_WIDTH } from '../../stores/node/constants.ts'
import { SCRIPTLET_SECTION_TYPE } from '../../stores/node/nodeSection/constants.ts'
import { useNodeStore } from '../Nodes/NodeStoreContext.tsx'
import { Card } from './card.tsx'

export interface ScriptletSectionProps {
  readonly section: ScriptletSectionStore
}

export const ScriptletSection: React.FC<ScriptletSectionProps> = /* @__PURE__ */ memo(({ section }) => {
  const t = useTranslate()
  const nodeStore = useNodeStore()
  if (!('designerUIStore' in nodeStore)) throw new Error('Scriptlet sections require a manifest node store.')
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [focused, setFocused] = useState(false)
  const manualHeight = useVal(section.manualHeight$)

  useLayoutEffect(() => {
    if (container) return section.mount(container)
  }, [container, section])

  useEffect(() => {
    if (!container) return
    let startWidth = 0
    let startHeight = 0
    return createResizeHandle({
      container,
      onResizeStart: () => {
        startWidth = nodeStore.uiStore.$.contentWidth.value || MIN_NODE_WIDTH
        startHeight = section.manualHeight$.value || container.offsetHeight
      },
      onResize: (offsetX, offsetY) => {
        const zoom = nodeStore.designerUIStore.viewport$.value?.zoom || 1
        nodeStore.uiStore.$$.contentWidth.set(Math.max(MIN_NODE_WIDTH, startWidth + offsetX / zoom))
        section.manualHeight$.set(Math.max(160, startHeight + offsetY / zoom))
      },
    })
  }, [container, nodeStore, section])

  return (
    <Card
      name={SCRIPTLET_SECTION_TYPE}
      icon="i-codicon:chevron-down"
      collapsedIcon="i-codicon:chevron-right"
      title={t('scriptlet')}
      collapsed$={section.cardCollapsed$}
      contentClassName={styles.content}
    >
      <div
        ref={setContainer}
        tabIndex={-1}
        className={clsx(styles.resizable, 'nodrag', focused && 'nowheel', focused && 'oo-active')}
        style={manualHeight == null ? undefined : { height: Math.max(160, manualHeight) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </Card>
  )
})
