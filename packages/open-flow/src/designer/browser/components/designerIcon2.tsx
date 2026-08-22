import styles from './designerIcon2.module.scss'
import type { ReadonlyVal, Val } from 'value-enhancer'

import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useOpenIconPicker } from '../graph/iconPicker.tsx'
import { DesignerIcon } from '../icons/DesignerIcon.tsx'
import { Button } from './button.tsx'

export interface DesignerIcon2Props {
  className?: string
  rawIcon$?: Val<string | undefined>
  displayIcon$: ReadonlyVal<string | undefined>
  fallback?: React.ReactNode
}

export const DesignerIcon2: React.FC<DesignerIcon2Props> = /* @__PURE__ */ memo((props) => {
  const { className, rawIcon$, displayIcon$, fallback } = props
  const openIconPicker = useOpenIconPicker()

  const icon = useVal(displayIcon$)

  return (
    <Button disabled={!rawIcon$} className={clsx(styles.btn, className)} onClick={() => rawIcon$ && openIconPicker(rawIcon$.set)}>
      <DesignerIcon src={icon} className="pointer-events-none" fallback={fallback} />
    </Button>
  )
})
