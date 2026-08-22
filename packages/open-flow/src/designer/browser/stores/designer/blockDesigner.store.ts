import type { DesignerStore$, DesignerStore$$, DesignerStoreProps } from './designer.store.ts'

import { DesignerStore } from './designer.store.ts'
import { DESIGNER_TYPE } from './typings.ts'

export interface BlockDesignerStore$ extends DesignerStore$ {}

export interface BlockDesignerStore$$ extends DesignerStore$$ {}

export interface BlockDesignerStoreProps extends DesignerStoreProps {}

export class BlockDesignerStore extends DesignerStore {
  public static is(store: unknown): store is BlockDesignerStore {
    return (store as DesignerStore)?.designerType === DESIGNER_TYPE.Block
  }

  declare public readonly $: BlockDesignerStore$
  declare public readonly $$: BlockDesignerStore$$

  public constructor(props: BlockDesignerStoreProps) {
    super(DESIGNER_TYPE.Block, !props.readonly, props)
  }
}
