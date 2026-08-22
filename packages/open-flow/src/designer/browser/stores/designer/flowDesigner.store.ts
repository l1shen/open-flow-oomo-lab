import type { ReadonlyVal, Val } from 'value-enhancer'
import type { DesignerStoreProps } from './designer.store.ts'

import { DesignerStore } from './designer.store.ts'
import { DESIGNER_TYPE } from './typings.ts'

export interface FlowDesignerStoreManifest$ {
  readonly icon?: Val<string | undefined>
  readonly title: Val<string | undefined>
  readonly description: Val<string | undefined>
}

export interface FlowDesignerStoreDisplay$ {
  readonly icon: ReadonlyVal<string | undefined>
  readonly title: ReadonlyVal<string | undefined>
  readonly description: ReadonlyVal<string | undefined>
}

export interface FlowDesignerStoreProps extends DesignerStoreProps {
  readonly manifest$?: FlowDesignerStoreManifest$
  readonly display$: FlowDesignerStoreDisplay$
}

export class FlowDesignerStore extends DesignerStore {
  public static is(store: unknown): store is FlowDesignerStore {
    return (store as DesignerStore)?.designerType === DESIGNER_TYPE.Flow
  }

  public readonly manifest$?: FlowDesignerStoreManifest$
  public readonly display$: FlowDesignerStoreDisplay$

  public constructor(props: FlowDesignerStoreProps) {
    super(DESIGNER_TYPE.Flow, !props.readonly, props)
    this.manifest$ = props.manifest$
    this.display$ = props.display$
  }
}
