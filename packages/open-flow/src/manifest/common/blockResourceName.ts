import type { Option } from '@wopjs/tsur'
import type { BlockName, BlockResourceName } from './manifestTypes.ts'

import { Option as Optional } from '@wopjs/tsur'
import { isLocalBlockReference } from '../../schema/block-reference.ts'
import { WORKSPACE_PACKAGE_NAME } from './constants.ts'

export const encodeBlockResourceName = (blockName: BlockName): BlockResourceName => `${WORKSPACE_PACKAGE_NAME}::${blockName}` as BlockResourceName

export const parseBlockResourceName = (value: unknown): Option<BlockResourceName> =>
  Optional.from(value, isLocalBlockReference).map((reference) => reference as BlockResourceName)

export interface DecodedBlockResourceInfo {
  blockName: BlockName
}

export const decodeBlockResourceName = (name: BlockResourceName): DecodedBlockResourceInfo => {
  return {
    blockName: name.slice(`${WORKSPACE_PACKAGE_NAME}::`.length) as BlockName,
  }
}
