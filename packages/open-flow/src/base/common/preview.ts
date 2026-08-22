import type { PreviewPayload, TablePreviewData, TextPreviewPayload } from '../../types/index.ts'

export type {
  CsvPreviewPayload,
  ImagePreviewPayload,
  MediaPreviewPayload,
  PreviewPayload,
  PreviewType,
  TablePreviewData,
  TablePreviewPayload,
  TextPreviewPayload,
} from '../../types/index.ts'

function invalid(path: string, expected: string): never {
  throw new TypeError(`Invalid preview payload at "${path}": expected ${expected}.`)
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value != null && typeof value == 'object' && !Array.isArray(value)
}

function stringData(payload: Record<PropertyKey, unknown>): string {
  if (typeof payload.data != 'string') invalid('data', 'a string')
  return payload.data
}

function isTextPreviewType(type: string): type is TextPreviewPayload['type'] {
  return type == 'json' || type == 'text' || type.startsWith('text/')
}

function normalizeImageData(data: unknown): string | readonly string[] {
  if (typeof data == 'string') return data
  if (!Array.isArray(data) || data.length == 0) invalid('data', 'a string or a non-empty array of strings')
  if (!data.every((source) => typeof source == 'string')) invalid('data', 'a string or a non-empty array of strings')
  return [...data]
}

function normalizeTableData(data: unknown): TablePreviewData | string {
  if (typeof data == 'string') return data
  if (!isRecord(data)) invalid('data', 'a CSV path or a table object')
  if (!Array.isArray(data.columns) || !data.columns.every((column) => typeof column == 'string' || typeof column == 'number')) {
    invalid('data.columns', 'an array of strings or numbers')
  }
  if (!Array.isArray(data.rows)) invalid('data.rows', 'an array of rows')
  const rows = data.rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) invalid(`data.rows[${rowIndex}]`, 'an array')
    if (!row.every((cell) => typeof cell == 'string' || typeof cell == 'number' || typeof cell == 'boolean')) {
      invalid(`data.rows[${rowIndex}]`, 'an array of strings, numbers, or booleans')
    }
    return [...row]
  })
  const rowCount = data.row_count
  let normalizedRowCount: number | undefined
  if (rowCount != null) {
    if (typeof rowCount != 'number' || !Number.isSafeInteger(rowCount) || rowCount < rows.length) {
      invalid('data.row_count', `an integer greater than or equal to the ${rows.length} provided rows`)
    }
    normalizedRowCount = rowCount
  }
  return {
    columns: [...data.columns],
    rows,
    row_count: normalizedRowCount,
  }
}

/** Validates data from JavaScript Tasks and copies mutable preview collections. */
export function normalizePreviewPayload(payload: unknown): PreviewPayload {
  if (!isRecord(payload)) invalid('payload', 'an object')
  if (typeof payload.type != 'string') invalid('type', 'a supported preview type')
  const type = payload.type
  if (type == 'image') return { type, data: normalizeImageData(payload.data) }
  if (type == 'video' || type == 'audio' || type == 'markdown' || type == 'iframe' || type == 'html') {
    return { type, data: stringData(payload) }
  }
  if (isTextPreviewType(type)) return { type, data: payload.data }
  if (type == 'table') return { type, data: normalizeTableData(payload.data) }
  if (type == 'csv') return { type, data: stringData(payload) }
  invalid('type', 'image, video, audio, markdown, iframe, html, json, text, text/*, table, or csv')
}

export function normalizePreviewId(id: unknown): string | undefined {
  if (id == null) return undefined
  if (typeof id != 'string') throw new TypeError('Invalid preview id: expected a string or undefined.')
  return id
}
