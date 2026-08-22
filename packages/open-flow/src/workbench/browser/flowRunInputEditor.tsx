import lightTheme from '../../designer/browser/styles/light.module.scss'
import styles from './flowRunInputEditor.module.scss'
import type { ReactElement } from 'react'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { HandleName, InputHandleDef } from '../../schema/index.ts'

import { useEffect, useMemo, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { I18nProvider } from 'val-i18n-react'
import { compute, val } from 'value-enhancer'
import { GetPopupContainerContext } from '../../designer/browser/graph/ReactFlowContainer/useGetPopupContainer.ts'
import { createI18n } from '../../designer/browser/i18n/i18n-loader.ts'
import { HandleEditor } from '../../designer/browser/jsonSchema/handleEditor.tsx'
import { HandleEditorProvider } from '../../designer/browser/jsonSchema/handleEditorContext.ts'
import { HandleRowStore } from '../../designer/browser/stores/nodeHandle/handleRow.store.ts'
import { ThemeProvider } from '../../designer/browser/theme/ThemeProvider.tsx'
import { WorkbenchRunInputs } from './runInputs.ts'

export interface FlowRunInputDefinition {
  readonly description?: string
  readonly handle: string
  readonly jsonSchema: unknown
  readonly nullable: boolean
}

interface Internals {
  readonly definitions: readonly FlowRunInputDefinition[]
  readonly definitions$: Val<InputHandleDef[]>
  readonly inputs: WorkbenchRunInputs
  readonly language: ReadonlyVal<string>
  readonly panelWidth$: Val<number | undefined>
}

const internals = new WeakMap<FlowRunInputEditorStore, Internals>()

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
    const values$ = inputs.section.$.handleInputsFrom!
    this.valid$ = compute((get) => {
      const present = new Set((get(values$) ?? []).flatMap((input) => (input.value === undefined ? [] : [input.handle])))
      return definitions.every((definition) => present.has(definition.handle as HandleName)) && !get(inputs.section.hasError$)
    })
    internals.set(this, { definitions, definitions$, inputs, language, panelWidth$: val() })
  }

  public dispose(): void {
    const state = internals.get(this)!
    this.valid$.dispose()
    state.inputs.dispose()
    state.definitions$.dispose()
    state.panelWidth$.dispose()
  }

  public values(): Readonly<Record<string, unknown>> {
    return internals.get(this)!.inputs.values()
  }

  public replaceValues(value: unknown): boolean {
    return internals.get(this)!.inputs.replaceValues(value)
  }
}

export function FlowRunInputEditor({ store }: { readonly store: FlowRunInputEditorStore }): ReactElement {
  const state = internals.get(store)!
  const handles = useVal(state.inputs.section.$.handles)
  const language = useVal(state.language)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const i18n = useMemo(() => createI18n(language), [language])
  const popupContainers = useMemo(
    () => ({
      default: () => root ?? document.body,
      static: () => root ?? document.body,
    }),
    [root],
  )

  useEffect(() => () => i18n.dispose(), [i18n])

  return (
    <div className={`oo-designer-root ${lightTheme.theme} ${styles.root}`} ref={setRoot}>
      <GetPopupContainerContext.Provider value={popupContainers}>
        <I18nProvider i18n={i18n}>
          <ThemeProvider dark={false} getPopupContainer={popupContainers.static}>
            <HandleEditorProvider value={{}}>
              {handles.flatMap((handle) => {
                if (!HandleRowStore.is(handle)) return []
                const definition = state.definitions.find((candidate) => candidate.handle == handle.name)!
                return [
                  <fieldset className={styles.field} key={handle.name}>
                    <legend className={styles.legend}>
                      <span>{handle.name}</span>
                      {definition.nullable && <span className={styles.optional}>null</span>}
                    </legend>
                    {definition.description != null && <p className={styles.description}>{definition.description}</p>}
                    <div className={styles.value}>
                      <HandleEditor panelWidth$={state.panelWidth$} presentation="form" showSchemaSettings={false} store={handle} />
                    </div>
                  </fieldset>,
                ]
              })}
            </HandleEditorProvider>
          </ThemeProvider>
        </I18nProvider>
      </GetPopupContainerContext.Provider>
    </div>
  )
}
