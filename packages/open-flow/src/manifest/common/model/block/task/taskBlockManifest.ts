import type { ReadonlyVal } from 'value-enhancer'
import type { Executor, InputHandleDef, OutputHandleDef } from '../../../../../schema/index.ts'
import type { SharedBlockManifest, SharedBlockManifest$ } from '../sharedBlockManifest.ts'

import { TaskBlockManifestKind } from '../internal.ts'

export interface TaskBlockManifest$ extends SharedBlockManifest$ {
  readonly executor: ReadonlyVal<Executor | undefined>
  readonly additional_inputs: ReadonlyVal<boolean | InputHandleDef | undefined>
  readonly additional_inputs_def: ReadonlyVal<InputHandleDef[] | undefined>
  readonly additional_outputs: ReadonlyVal<boolean | OutputHandleDef | undefined>
  readonly additional_outputs_def: ReadonlyVal<OutputHandleDef[] | undefined>
}

export interface TaskBlockManifest extends SharedBlockManifest {
  readonly KIND: Record<TaskBlockManifestKind, boolean> & SharedBlockManifest['KIND']

  readonly $: TaskBlockManifest$
}

export const isTaskBlockManifest = (block: any): block is TaskBlockManifest => block?.KIND?.[TaskBlockManifestKind] === true

export const toTaskBlockManifest = (block: unknown): TaskBlockManifest | undefined => {
  if (isTaskBlockManifest(block)) {
    return block
  }
}
