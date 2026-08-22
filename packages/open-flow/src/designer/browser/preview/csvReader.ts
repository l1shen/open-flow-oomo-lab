import type { GetProp, TablePaginationConfig, TableProps } from 'antd'
import type { SorterResult } from 'antd/es/table/interface'

export interface CsvReadParams {
  pagination?: TablePaginationConfig
  sortField?: SorterResult<any>['field']
  sortOrder?: SorterResult<any>['order']
  filters?: Parameters<GetProp<TableProps, 'onChange'>>[1]
}

export interface CsvData {
  columns: readonly (string | number)[]
  rows: readonly (readonly (string | number | boolean)[])[]
}

export interface CsvReadResult {
  current: number
  total: number
  data: CsvData
}

export interface CsvReader {
  (path: string, params: CsvReadParams): Promise<CsvReadResult | undefined>
}
