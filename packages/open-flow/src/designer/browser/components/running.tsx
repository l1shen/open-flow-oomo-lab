import styles from './running.module.scss'
import type { ReadonlyVal } from 'value-enhancer'
import type { NodeStatus } from '../stores/node/constants.ts'

import { clsx } from 'clsx'
import { memo, useEffect, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useDebouncedValue } from '../base/react.ts'

export interface RunningProps {
  variant?: 'default' | 'gradient'
  status$?: ReadonlyVal<NodeStatus>
  scale$?: ReadonlyVal<number>
}

interface ISize {
  readonly width: number
  readonly height: number
}

const emptySize: ISize = { width: 0, height: 0 }

const lineStyle = {
  rx: 'var(--node-effect-radius-number)',
  ry: 'var(--node-effect-radius-number)',
} as React.CSSProperties

// Make sure to put this element inside a `position: absolute` container.
export const Running: React.FC<RunningProps> = /*#__PURE__*/ memo(function Running(props: RunningProps) {
  const scale = useVal(props.scale$) ?? 1

  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState<ISize>(emptySize)
  const status = useVal(props.status$)
  const isRunning = useDebouncedValue(status === 'running', 100)

  useEffect(() => {
    if (wrapper) {
      let timer = 0
      const observer = new ResizeObserver((entries) => {
        clearTimeout(timer)
        timer = window.setTimeout(() => setSize(entries[0].contentRect))
      })
      observer.observe(wrapper)
      return () => {
        clearTimeout(timer)
        observer.disconnect()
      }
    }
  }, [wrapper])

  if (isRunning) {
    if (props.variant === 'gradient') {
      const backgroundSize = Math.hypot(size.width, size.height) + 10

      return (
        <div className={clsx(styles.wrapper, styles.gradientWrapper)} style={{ inset: `${-Math.max(2, scale + 1)}px` }} ref={setWrapper}>
          <div className={styles.gradient} style={{ width: backgroundSize, height: backgroundSize }} />
        </div>
      )
    } else {
      const viewBox = `0 0 ${size.width} ${size.height}`

      return (
        <div className={styles.wrapper} ref={setWrapper}>
          <svg className={styles.line} viewBox={viewBox}>
            <rect x="0" y="0" width="100%" height="100%" pathLength={10} style={lineStyle} />
          </svg>
          <svg className={styles.line} viewBox={viewBox}>
            <rect x="0" y="0" width="100%" height="100%" pathLength={10} style={lineStyle} />
          </svg>
        </div>
      )
    }
  }

  return null
})
