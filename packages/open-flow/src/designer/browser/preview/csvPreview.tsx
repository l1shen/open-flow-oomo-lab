import styles from './csvPreview.module.scss'
import type { TableProps } from 'antd'
import type { FC } from 'react'
import type { ReadonlyVal } from 'value-enhancer'
import type { CsvReadParams } from './csvReader.ts'

import { listen } from '@wopjs/dom'
import { Table } from 'antd'
import { clsx } from 'clsx'
import { useContext, useEffect, useState } from 'react'
import { useTranslate } from 'val-i18n-react'
import { enforceString } from '../../../base/common/parse.ts'
import { CsvReaderContext } from './csvReaderContext.tsx'

export interface CsvPreviewProps {
  path: string
  nodeSelected$?: ReadonlyVal<boolean | undefined>
}

export const CsvPreview: FC<CsvPreviewProps> = ({ path, nodeSelected$ }) => {
  const readCsv = useContext(CsvReaderContext)
  const t = useTranslate()
  const [columns, setColumns] = useState<TableProps['columns']>()
  const [dataSource, setDataSource] = useState<TableProps['dataSource']>()
  const [focus, setFocus] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tableParams, setTableParams] = useState<CsvReadParams>({
    pagination: {
      current: 1,
      pageSize: 100,
      simple: true,
      showLessItems: true,
      hideOnSinglePage: true,
      showQuickJumper: false,
      showSizeChanger: false,
    },
  })

  useEffect(() => {
    if (!readCsv) {
      console.error(new Error('Missing CSV reader context.'))
      return
    }

    let isMounted = true
    const loadingTicket = setTimeout(() => {
      if (isMounted) {
        setLoading(true)
      }
    }, 1000)

    const finishLoading = (): boolean => {
      if (!isMounted) return false
      clearTimeout(loadingTicket)
      setLoading(false)
      return true
    }

    readCsv(path, tableParams).then(
      (result) => {
        if (!finishLoading()) return

        if (!result || !result.data?.columns?.length) {
          setColumns(undefined)
          setDataSource(undefined)
          setTableParams((prev) => ({
            ...prev,
            pagination: {
              ...prev.pagination,
              current: 1,
              total: 0,
            },
          }))
          return
        }

        const { current, total, data } = result
        setTableParams((prev) => ({
          ...prev,
          pagination: {
            ...prev.pagination,
            current,
            total,
          },
        }))

        setColumns(
          data.columns.map((title, i) => ({
            title: enforceString(title),
            dataIndex: i,
            key: i,
            minWidth: 100,
            fixed:
              i === 0
                ? ('left' as const)
                : // : i === data.columns.length - 1
                  //   ? ("right" as const)
                  undefined,
          })),
        )

        setDataSource(
          data.rows.map((row, i) => {
            const rowData: any = row.map(enforceString)
            rowData.key = (current - 1) * (tableParams.pagination?.pageSize ?? 100) + i
            return rowData
          }),
        )
      },
      (error) => {
        if (finishLoading()) console.error('Failed to read CSV preview.', error)
      },
    )

    return () => {
      clearTimeout(loadingTicket)
      setLoading(false)
      isMounted = false
    }
  }, [
    path,
    readCsv,
    tableParams.pagination?.current,
    tableParams.pagination?.pageSize,
    tableParams?.sortOrder,
    tableParams?.sortField,
    JSON.stringify(tableParams.filters),
  ])

  useEffect(() => nodeSelected$?.subscribe((selected) => !selected && setFocus(false)), [nodeSelected$])

  useEffect(() => listen(window, 'pointerup', () => setFocus(false), true), [])

  return (
    <div className={clsx(styles.container, focus && 'designer-preview-active', focus && 'nowheel')} onClick={() => setFocus(true)}>
      <Table
        tableLayout="auto"
        bordered
        dataSource={dataSource}
        columns={columns}
        size="small"
        pagination={{
          ...tableParams.pagination,
          showTotal: (total) => {
            return t('preview.table.footer', {
              columns: columns?.length || 0,
              rows: total,
            })
          },
        }}
        loading={loading}
        scroll={{ x: 'max-content', y: 400 }}
        onChange={(pagination, filters, sorter) => {
          setTableParams((prev) => ({
            pagination: {
              ...prev.pagination,
              ...pagination,
            },
            filters,
            sortOrder: Array.isArray(sorter) ? undefined : sorter.order,
            sortField: Array.isArray(sorter) ? undefined : sorter.field,
          }))
        }}
      />
    </div>
  )
}
