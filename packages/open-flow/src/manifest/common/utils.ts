import type { Option } from '@wopjs/tsur'
import type { HandleName, NodeId } from '../../schema/index.ts'

import { isString } from '@wopjs/cast'
import { parseString } from '../../base/common/parse.ts'

export const parseHandleName = parseString as (data: unknown) => Option<HandleName>

export const isHandleName = isString as (data: unknown) => data is HandleName

export const parseNodeId = parseString as (data: unknown) => Option<NodeId>

export const isNodeId = isString as (data: unknown) => data is NodeId
