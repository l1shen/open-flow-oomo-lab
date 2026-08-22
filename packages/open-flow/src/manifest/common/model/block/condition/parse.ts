import type { ConditionExpression, ConditionHandleDef, DefaultConditionHandleDef, HandleName } from '../../../../../schema/index.ts'

import { None, Option, Some } from '@wopjs/tsur'
import { parseArray, parseString } from '../../../../../base/common/parse.ts'
import { isUnknownRecord } from '../../../../../base/common/type.ts'

/** `default` */
export function parseDefaultConditionHandleDef(data: unknown): Option<DefaultConditionHandleDef> {
  return Option.from(data, isUnknownRecord).andThen((record) =>
    parseString(record.handle).map((handle) => ({
      handle: handle as HandleName,
      description: parseString(record.description).unwrapOr(),
    })),
  )
}

/** `cases` */
export function parseConditionsDef(data: unknown): Option<ConditionHandleDef[]> {
  return parseArray(data, parseConditionDef)
}

function parseConditionDef(data: unknown): Option<ConditionHandleDef> {
  return Option.from(data, isUnknownRecord).andThen((record) =>
    parseString(record.handle).map((handle) => ({
      handle: handle as HandleName,
      description: parseString(record.description).unwrapOr(),
      logical: parseLogical(record.logical),
      expressions: parseExpressions(record.expressions).unwrapOr(),
    })),
  )
}

function parseExpressions(data: unknown): Option<ConditionExpression[]> {
  return parseArray(data, parseExpression)
}

function parseExpression(data: unknown): Option<ConditionExpression> {
  return Option.from(data, isUnknownRecord).andThen((record) => {
    const input_handle = parseString(record.input_handle).unwrapOr() as HandleName | undefined
    const operator = parseOperator(record.operator)
    if (input_handle && operator) {
      return Some({
        input_handle,
        operator,
        value: record.value,
      })
    }
    return None
  })
}

const OPERATORS: ReadonlySet<string> = new Set([
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'is null',
  'is not null',
  'is true',
  'is false',
  'contains',
  'not contains',
  'is empty',
  'is not empty',
  'has key',
  'not has key',
  'has value',
  'not has value',
  'starts with',
  'ends with',
])

function isOperator(data: unknown): data is ConditionExpression['operator'] {
  return typeof data == 'string' && OPERATORS.has(data)
}

function parseOperator(data: unknown): ConditionExpression['operator'] | undefined {
  return isOperator(data) ? data : undefined
}

function parseLogical(data: unknown): 'AND' | 'OR' | undefined {
  return data === 'AND' ? 'AND' : data === 'OR' ? 'OR' : undefined
}
