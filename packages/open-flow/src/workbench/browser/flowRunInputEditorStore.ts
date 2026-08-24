import type { ReadonlyVal, Val } from 'value-enhancer'
import type { HandleName, InputHandleDef } from '../../schema/index.ts'

import { compute, val } from 'value-enhancer'
import { WorkbenchRunInputs } from './runInputs.ts'

export interface FlowRunInputDefinition {
  readonly description?: string
  readonly handle: string
  readonly jsonSchema: unknown
  readonly nullable: boolean
}

export interface FlowRunInputEditorState {
  readonly definitions: readonly FlowRunInputDefinition[]
  readonly definitions$: Val<InputHandleDef[]>
  readonly inputs: WorkbenchRunInputs
  readonly language: ReadonlyVal<string>
  readonly panelWidth$: Val<number | undefined>
}

const internals = new WeakMap<FlowRunInputEditorStore, FlowRunInputEditorState>()

export class FlowRunInputEditorStore {
  public readonly valid$: ReadonlyVal<boolean>

  public constructor(definitions: readonly FlowRunInputDefinition[], language: ReadonlyVal<string>) {
    const definitions$ = val<InputHandleDef[]>(
      definitions.map((definition) => ({
        ...(definition.description == null ? {} : { description: definition.description }),
        handle: definition.handle as HandleName,
        json_schema: definition.jsonSchema,
        nullable: definition.nullable,
      })),
    )
    const inputs = new WorkbenchRunInputs(definitions$, language)
    this.valid$ = compute((get) => {
      const present = new Set((get(inputs.inputValues$) ?? []).flatMap((input) => (input.value === undefined ? [] : [input.handle])))
      return definitions.every((definition) => present.has(definition.handle as HandleName)) && !get(inputs.section.hasError$)
    })
    internals.set(this, { definitions, definitions$, inputs, language, panelWidth$: val() })
  }

  public dispose(): void {
    const state = flowRunInputEditorState(this)
    this.valid$.dispose()
    state.inputs.dispose()
    state.definitions$.dispose()
    state.panelWidth$.dispose()
  }

  public values(): Readonly<Record<string, unknown>> {
    return flowRunInputEditorState(this).inputs.values()
  }

  public replaceValues(value: unknown): boolean {
    return flowRunInputEditorState(this).inputs.replaceValues(value)
  }
}

export function flowRunInputEditorState(store: FlowRunInputEditorStore): FlowRunInputEditorState {
  const state = internals.get(store)
  if (state == null) throw new Error('Flow Run input editor store is unavailable.')
  return state
}
