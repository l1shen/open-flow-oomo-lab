import type { ConditionExpression, InputHandleDef } from '../../../../schema/index.ts'
import type { IBasicOption } from '../../components/select.tsx'
import type { PrimitiveType } from '../../jsonSchema/preset.ts'

import { returnsTrue } from '@wopjs/cast'
import { filterMap, Negative } from '../../base/trivial.ts'
import { asPrimitiveType, typeOfSchema } from '../../jsonSchema/preset.ts'

/** Returns whether the operator accepts a right-hand value. */
export function doesOperatorHasValue(operator: ConditionOperator | undefined): boolean {
  return !operator?.startsWith('is ')
}

export type Logical = 'AND' | 'OR'

const defaultLogical: Logical = 'OR'

export interface LogicalOption extends IBasicOption {
  label: string
  readonly value: Logical
}

const LOGICAL_OPTIONS: Record<Logical, LogicalOption> = {
  AND: { label: 'AND', value: 'AND' },
  OR: { label: 'OR', value: 'OR' },
}

export const logicalSelectOptions = (t: (key: string) => string): LogicalOption[] =>
  [LOGICAL_OPTIONS.AND, LOGICAL_OPTIONS.OR].map((option) => Object.assign({}, option, { label: t(`condition.logical.${option.value}`) }))

export function optionOfLogical(t: (key: string) => string, logical: Logical | undefined): LogicalOption {
  const opt = LOGICAL_OPTIONS[logical || defaultLogical]
  return { ...opt, label: t(`condition.logical.${opt.value}`) }
}

export type ConditionOperator = ConditionExpression['operator']

export interface ConditionOperatorOption extends IBasicOption {
  label: string
  readonly value: ConditionOperator
}

const CONDITION_OPERATOR_OPTIONS: ConditionOperatorOption[] = [
  { label: '=', value: '==' },
  { label: '≠', value: '!=' },
  { label: '<', value: '<' },
  { label: '≤', value: '<=' },
  { label: '>', value: '>' },
  { label: '≥', value: '>=' },
  { label: 'is null', value: 'is null' },
  { label: 'is not null', value: 'is not null' },
  { label: 'is true', value: 'is true' },
  { label: 'is false', value: 'is false' },
  { label: 'contains', value: 'contains' },
  { label: 'not contains', value: 'not contains' },
  { label: 'is empty', value: 'is empty' },
  { label: 'is not empty', value: 'is not empty' },
  { label: 'has key', value: 'has key' },
  { label: 'not has key', value: 'not has key' },
  { label: 'has value', value: 'has value' },
  { label: 'not has value', value: 'not has value' },
  { label: 'starts with', value: 'starts with' },
  { label: 'ends with', value: 'ends with' },
]

export const operatorSelectOptions = (t: (key: string) => string, predicate: (operator: ConditionOperator) => boolean): ConditionOperatorOption[] =>
  filterMap(CONDITION_OPERATOR_OPTIONS, (option) => {
    if (predicate(option.value)) {
      return Object.assign({}, option, { label: t(`condition.operator.${option.value.replace(/\s+/g, '_')}`) })
    }
    return Negative
  })

export const optionOfOperator = (t: (key: string) => string, operator: ConditionOperator | undefined): ConditionOperatorOption => {
  const opt = CONDITION_OPERATOR_OPTIONS.find((o) => o.value === operator) || CONDITION_OPERATOR_OPTIONS[0]
  return { ...opt, label: t(`condition.operator.${opt.value.replace(/\s+/g, '_')}`) }
}

export function getFirstOperatorOfType(def: InputHandleDef | undefined): ConditionOperator {
  if (!def) return '=='

  const nullable = def.nullable
  const primitiveType = asPrimitiveType(typeOfSchema(def.json_schema))
  switch (primitiveType) {
    case 'string':
      return '=='
    case 'number':
      return '=='
    case 'boolean':
      return 'is true'
    case 'object':
      return 'has key'
    case 'array':
      return 'contains'
    case 'null':
      return 'is null'
    default:
      if (nullable) {
        return 'is null'
      }
      return '=='
  }
}

const nullableOperators: ConditionOperator[] = ['is null', 'is not null']
const predicate = (operators: ConditionOperator[], nullable: boolean | undefined, operator: ConditionOperator) => {
  if (nullable && nullableOperators.includes(operator)) return true
  return operators.includes(operator)
}

const stringOperators: ConditionOperator[] = ['==', '!=', 'contains', 'not contains', 'starts with', 'ends with', 'is empty', 'is not empty']

const numberOperators: ConditionOperator[] = ['==', '!=', '<', '<=', '>', '>=']

const booleanOperators: ConditionOperator[] = ['==', '!=', 'is true', 'is false']

const objectOperators: ConditionOperator[] = ['has key', 'not has key', 'has value', 'not has value', 'is empty', 'is not empty']

const arrayOperators: ConditionOperator[] = ['contains', 'not contains', 'is empty', 'is not empty']

/** Selects the operators supported by the left-hand input type. */
export function predicateOperator(def: InputHandleDef | undefined): (operator: ConditionOperator) => boolean {
  if (!def) return returnsTrue

  const nullable = def.nullable
  const primitiveType = asPrimitiveType(typeOfSchema(def.json_schema))
  switch (primitiveType) {
    case 'string':
      return predicate.bind(null, stringOperators, nullable)
    case 'number':
      return predicate.bind(null, numberOperators, nullable)
    case 'boolean':
      return predicate.bind(null, booleanOperators, nullable)
    case 'object':
      return predicate.bind(null, objectOperators, nullable)
    case 'array':
      return predicate.bind(null, arrayOperators, nullable)
    case 'null':
      return predicate.bind(null, nullableOperators, nullable)
    default:
      return returnsTrue
  }
}

const stringValues: ReadonlySet<ConditionOperator> = new Set(['==', '!=', 'contains', 'not contains', 'starts with', 'ends with'])
const comparators: ReadonlySet<ConditionOperator> = new Set(['<', '<=', '>', '>='])
const stringParams: ReadonlySet<ConditionOperator> = new Set(['contains', 'not contains', 'starts with', 'ends with'])

/** Selects the right-hand value type, or `undefined` when it is unrestricted or unused. */
export function predicateValueType(def: InputHandleDef | undefined, operator: ConditionOperator | undefined): 'string' | 'number' | 'boolean' | undefined {
  if (!operator || !doesOperatorHasValue(operator)) return undefined

  const handleType = def && asPrimitiveType(typeOfSchema(def.json_schema))
  if (handleType === 'string') {
    return stringValues.has(operator) ? 'string' : undefined
  }

  if (handleType === 'number') {
    return numberOperators.includes(operator) ? 'number' : undefined
  }

  if (handleType === 'boolean') {
    if (operator === '==' || operator === '!=') {
      return 'boolean'
    } else {
      return undefined
    }
  }

  if (handleType === 'object') {
    if (operator === 'has key' || operator === 'not has key') {
      return 'string'
    } else {
      return undefined
    }
  }

  if (handleType === 'array') {
    return undefined
  }

  // These operators constrain an otherwise unknown input type.
  if (comparators.has(operator)) {
    return 'number'
  }
  if (stringParams.has(operator)) {
    return 'string'
  }
  return undefined
}

export interface ConditionValueTypeOption extends IBasicOption {
  label: string
  readonly value: 'string' | 'number' | 'boolean'
}

const CONDITION_VALUE_TYPE_OPTIONS: ConditionValueTypeOption[] = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
]

export const valueTypeSelectOptions = (t: (key: string) => string): ConditionValueTypeOption[] =>
  CONDITION_VALUE_TYPE_OPTIONS.map((option) => Object.assign({}, option, { label: t(`preset.${option.value}`) }))

export const optionOfValueType = (t: (key: string) => string, valueType: PrimitiveType | undefined): ConditionValueTypeOption => {
  const opt = CONDITION_VALUE_TYPE_OPTIONS.find((o) => o.value === valueType) || CONDITION_VALUE_TYPE_OPTIONS[0]
  return { ...opt, label: t(`preset.${opt.value}`) }
}

export function getDefaultValueOfType(def: InputHandleDef | undefined, operator: ConditionOperator): unknown {
  switch (predicateValueType(def, operator)) {
    case 'string':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return true
  }
}
