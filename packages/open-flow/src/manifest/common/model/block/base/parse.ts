import type { BlockUI, GroupDividerDef, HandleName, InputHandleDef, OutputHandleDef } from '../../../../../schema/index.ts'

import { Option, Some } from '@wopjs/tsur'
import { parseArray, parseBoolean, parseNumber, parseString } from '../../../../../base/common/parse.ts'
import { isUnknownRecord } from '../../../../../base/common/type.ts'
import { parseHandleSchemaOverrides } from '../../../schemaOverrides.ts'

export function parseBlockUI(data: unknown): Option<BlockUI> {
  return Option.from(data, isUnknownRecord).andThen((record) => {
    return Some({
      default_width: parseNumber(record.default_width).unwrapOr(),
    })
  })
}

export function parseGroupedInputsDef(data: unknown): Option<(InputHandleDef | GroupDividerDef)[]> {
  return parseArray(data, (item) => parseInputDef(item).orElse(() => parseGroupDividerDef(item)))
}

export function parseInputsDef(data: unknown): Option<InputHandleDef[]> {
  return parseArray(data, parseInputDef)
}

function parseGroupDividerDef(data: unknown): Option<GroupDividerDef> {
  return Option.from(data, isUnknownRecord).andThen((record) =>
    parseString(record.group).map((group) => ({
      group,
      collapsed: parseBoolean(record.collapsed).unwrapOr(),
    })),
  )
}

function parseInputDef(data: unknown): Option<InputHandleDef> {
  return Option.from(data, isUnknownRecord).andThen((record) =>
    parseString(record.handle).map((handle) => ({
      handle: handle as HandleName,
      description: parseString(record.description).unwrapOr(),
      json_schema: record.json_schema,
      kind: parseString(record.kind).unwrapOr(),
      value: record.value,
      nullable: parseBoolean(record.nullable).unwrapOr(),
      schema_overrides: parseHandleSchemaOverrides(record.schema_overrides),
    })),
  )
}

export function parseAdditionalInputs(data: unknown): Option<boolean | InputHandleDef> {
  return parseBoolean(data).orElse(() => parseInputDef(data))
}

export function parseGroupedOutputsDef(data: unknown): Option<(OutputHandleDef | GroupDividerDef)[]> {
  return parseArray(data, (item) => parseOutputDef(item).orElse(() => parseGroupDividerDef(item)))
}

export function parseOutputsDef(data: unknown): Option<OutputHandleDef[]> {
  return parseArray(data, parseOutputDef)
}

function parseOutputDef(data: unknown): Option<OutputHandleDef> {
  return Option.from(data, isUnknownRecord).andThen((record) =>
    (parseString as (data: unknown) => Option<HandleName>)(record.handle).map((handle) => ({
      handle: handle,
      description: parseString(record.description).unwrapOr(),
      json_schema: record.json_schema,
      kind: parseString(record.kind).unwrapOr(),
      nullable: parseBoolean(record.nullable).unwrapOr(),
    })),
  )
}

export function parseAdditionalOutputs(data: unknown): Option<boolean | OutputHandleDef> {
  return parseBoolean(data).orElse(() => parseOutputDef(data))
}
