import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { CreateScriptletEditorFn } from '../../../services/designerService.ts'
import type { INodeSectionStore } from './interface.ts'

import { disposableStore } from '@wopjs/disposable'
import { combine, val } from 'value-enhancer'
import { toBoolean, toNonEmptyPlainObject, toNumber, toTrue } from '../../../base/trivial.ts'
import { SCRIPTLET_SECTION_TYPE } from './constants.ts'

export interface ScriptletSectionUIState {
  readonly cardCollapsed: boolean | undefined
  readonly manualHeight: number | undefined
}

export interface ScriptletSectionStoreProps {
  readonly createEditor: CreateScriptletEditorFn
  readonly entryPath: string
  readonly initialUIState?: Record<PropertyKey, unknown>
  readonly readonly: boolean
  readonly typing: ReadonlyVal<readonly [language: string, content: string] | undefined>
}

export class ScriptletSectionStore implements INodeSectionStore<ScriptletSectionUIState | undefined> {
  public static readonly TYPE: SCRIPTLET_SECTION_TYPE = SCRIPTLET_SECTION_TYPE
  public readonly type: SCRIPTLET_SECTION_TYPE = SCRIPTLET_SECTION_TYPE
  public readonly dispose: DisposableStore = disposableStore()
  public readonly hasError$: Val<boolean> = val(false)
  public readonly cardCollapsed$: Val<boolean | undefined>
  public readonly manualHeight$: Val<number | undefined>
  public readonly uiState$: ReadonlyVal<ScriptletSectionUIState | undefined>

  readonly #createEditor: CreateScriptletEditorFn
  readonly #entryPath: string
  readonly #readonly: boolean
  readonly #typing: ReadonlyVal<readonly [language: string, content: string] | undefined>

  public constructor(props: ScriptletSectionStoreProps) {
    this.#createEditor = props.createEditor
    this.#entryPath = props.entryPath
    this.#readonly = props.readonly
    this.#typing = props.typing
    this.cardCollapsed$ = this.dispose.add(val(toBoolean(props.initialUIState?.cardCollapsed)))
    this.manualHeight$ = this.dispose.add(val(toNumber(props.initialUIState?.manualHeight)))
    this.uiState$ = this.dispose.add(
      combine([this.cardCollapsed$, this.manualHeight$], ([cardCollapsed, manualHeight]) =>
        toNonEmptyPlainObject({ cardCollapsed: toTrue(cardCollapsed), manualHeight }),
      ),
    )
  }

  public mount(element: HTMLDivElement): (() => void) | void {
    return this.#createEditor(element, { path: this.#entryPath, readonly: this.#readonly, typing: this.#typing })
  }
}
