import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { PreviewType } from '../../../../../base/common/preview.ts'
import type { Viewport } from '../../../base/compare.ts'
import type { WidgetAction } from '../constants.ts'
import type { INodeSectionStore } from './interface.ts'

import { disposableStore } from '@wopjs/disposable'
import { combine, val } from 'value-enhancer'
import { toBoolean, toNonEmptyPlainObject, toNumber, toTrue } from '../../../base/trivial.ts'
import { PREVIEW_SECTION_TYPE } from './constants.ts'

export interface PreviewSectionUIState {
  readonly cardCollapsed: boolean | undefined
  readonly previewHeight: number | undefined
}

export type PreviewSectionStore$ = {
  readonly title?: ReadonlyVal<React.ReactNode>
  readonly preview: ReadonlyVal<React.ReactNode>
  readonly actions: ReadonlyVal<WidgetAction[] | undefined>
  readonly widgetType: ReadonlyVal<PreviewType | undefined>
  readonly nodeContentWidth?: Val<number | undefined>
  readonly viewport?: ReadonlyVal<Viewport | undefined>
} & {
  readonly [K in keyof PreviewSectionUIState]: ReadonlyVal<PreviewSectionUIState[K]>
}

export type PreviewSectionStore$$ = {
  readonly [K in keyof PreviewSectionUIState]: Val<PreviewSectionUIState[K]>
}

export interface PreviewSectionStoreProps extends Omit<PreviewSectionStore$, keyof PreviewSectionUIState> {
  readonly id: string
  readonly initialUIState?: PreviewSectionUIState | Record<PropertyKey, unknown>
}

export class PreviewSectionStore implements INodeSectionStore<PreviewSectionUIState | undefined> {
  public static is(store: INodeSectionStore): store is PreviewSectionStore {
    return store.type === PREVIEW_SECTION_TYPE
  }

  public readonly type: PREVIEW_SECTION_TYPE = PREVIEW_SECTION_TYPE
  public readonly id: string
  public readonly dispose: DisposableStore = disposableStore()
  public readonly $: PreviewSectionStore$
  public readonly $$: PreviewSectionStore$$
  public readonly hasError$: Val<boolean> = val(false)
  public readonly uiState$: ReadonlyVal<PreviewSectionUIState | undefined>

  public constructor(props: PreviewSectionStoreProps) {
    this.id = props.id
    const cardCollapsed = this.dispose.add(val(toBoolean(props.initialUIState?.cardCollapsed)))
    const previewHeight = this.dispose.add(val(toNumber(props.initialUIState?.previewHeight)))
    this.$$ = { cardCollapsed, previewHeight }
    this.$ = {
      ...this.$$,
      title: props.title && this.dispose.add(props.title.ref()),
      preview: this.dispose.add(props.preview.ref()),
      actions: this.dispose.add(props.actions.ref()),
      widgetType: this.dispose.add(props.widgetType.ref()),
      nodeContentWidth: props.nodeContentWidth,
      viewport: props.viewport,
    }
    this.uiState$ = this.dispose.add(
      combine([cardCollapsed, previewHeight], ([collapsed, height]) =>
        toNonEmptyPlainObject({
          cardCollapsed: toTrue(collapsed),
          previewHeight: height,
        }),
      ),
    )
  }
}
