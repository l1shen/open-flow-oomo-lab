import styles from './tablePreview.module.scss'
import type { FC } from 'react'
import type { ReadonlyVal } from 'value-enhancer'

import { listen } from '@wopjs/dom'
import { Table } from 'antd'
import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { useTranslate } from 'val-i18n-react'
import { enforceString } from '../../../base/common/parse.ts'

export interface TablePreviewProps {
  readonly columns: readonly (string | number)[]
  readonly rows: readonly (readonly (string | number | boolean)[])[]
  readonly rowCount?: number
  readonly nodeSelected$?: ReadonlyVal<boolean | undefined>
}

export const TablePreview: FC<TablePreviewProps> = ({ columns, rows, rowCount = rows.length, nodeSelected$ }) => {
  const t = useTranslate()
  const [focus, setFocus] = useState(false)

  useEffect(() => nodeSelected$?.subscribe((selected) => !selected && setFocus(false)), [nodeSelected$])

  useEffect(() => listen(window, 'pointerup', () => setFocus(false), true), [])

  const cols = columns.map((title, i) => ({
    title: enforceString(title),
    dataIndex: i,
    key: i,
    fixed: i === 0 ? ('left' as const) : i === columns.length - 1 ? ('right' as const) : undefined,
  }))

  const dataSource = rows.slice(0, 50).map((row, i) => {
    const data: any = row.map(enforceString)
    data.key = i
    return data
  })

  return (
    <div className={clsx(styles.container, focus && 'designer-preview-active', focus && 'nowheel')} onClick={() => setFocus(true)}>
      <Table bordered dataSource={dataSource} columns={cols} size="small" pagination={false} scroll={{ x: 'max-content' }} />
      <div className={styles.footer}>
        {t('preview.table.footer', {
          columns: columns.length,
          rows: rowCount,
        })}
      </div>
    </div>
  )
}
