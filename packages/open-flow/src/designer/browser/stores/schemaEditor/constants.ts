import type { IBasicOption } from '../../components/select.tsx'
import type { WidgetType } from '../../jsonSchema/preset.ts'

export const typeHasSubpanel: Set<WidgetType> = /*#__PURE__*/ new Set([
  'string',
  'integer',
  'number',
  'color',
  'date',
  'select',
  'multiSelect',
  'array',
  'object',
  'anyOf',
])

export const StringFormats = ['email', 'uri'] as const

export type StringFormat = (typeof StringFormats)[number]

export interface StringFormatOption extends IBasicOption {
  value: StringFormat | ''
}

export const stringFormatOptions = (unset: string): StringFormatOption[] => [
  { label: 'Email', value: 'email' },
  { label: 'URI', value: 'uri' },
  { label: unset, value: '' },
]

export function optionOfStringFormat(format: StringFormat | undefined, unset: string): StringFormatOption {
  const value: StringFormat | '' = format || ''
  return stringFormatOptions(unset).find((option) => option.value === value)!
}
