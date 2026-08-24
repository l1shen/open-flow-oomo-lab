import styles from './NodeDescriptionPopup.module.scss'
import type { ReadonlyVal, Val } from 'value-enhancer'

import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { NODE_HANDLE_CLASSNAME } from '../../../base/designer.ts'
import { TranslationInput } from '../../../components/input2.tsx'
import { DEFAULT_NODE_WIDTH } from '../../../stores/node/constants.ts'
import { useNodeStore } from '../NodeStoreContext.tsx'

export type NodeDescriptionProps = {
  editable: boolean
  rawValue$: Val<string | undefined>
  displayValue$: ReadonlyVal<string | undefined>
}

export const NodeDescriptionPopup: React.FC<NodeDescriptionProps> = /* @__PURE__ */ memo<NodeDescriptionProps>(({ editable, rawValue$, displayValue$ }) => {
  const t = useTranslate()
  const nodeStore = useNodeStore()
  const width = useVal(nodeStore.uiStore.$$.contentWidth) || DEFAULT_NODE_WIDTH

  return (
    <TranslationInput
      multiline
      disabled={!editable}
      doubleClickToSelect
      className={`${NODE_HANDLE_CLASSNAME} ${styles.container}`}
      style={{ width }}
      placeholder={t('nodeContent.addDescription')}
      rawValue$={rawValue$}
      displayValue$={displayValue$}
    />
  )
})
