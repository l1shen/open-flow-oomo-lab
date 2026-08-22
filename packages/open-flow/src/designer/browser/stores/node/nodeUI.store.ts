import type { DisposableStore } from '@wopjs/disposable'
import type { AddEventListener } from '@wopjs/event'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { XYPosition } from '../../base/compare.ts'
import type { RFNode } from '../../base/rfHelpers.ts'
import type { ToReadonly$Group } from '../../base/val.ts'
import type { NodeShowSettings } from './node.store.ts'
import type { INodeSectionStore, NodeSectionStoreType } from './nodeSection/interface.ts'
import type { PreviewSectionUIState } from './nodeSection/previewSection.store.ts'

import { isPlainObject } from '@wopjs/cast'
import { disposableStore } from '@wopjs/disposable'
import { event, send } from '@wopjs/event'
import { Option } from '@wopjs/tsur'
import { attachSetter, compute, derive, val } from 'value-enhancer'
import { isSameXYPosition, isXYPosition, toXYPosition } from '../../base/compare.ts'
import { DEFAULT_POSITION } from '../../base/designer.ts'
import { asObject, filterString, toBoolean, toNumber, toPlainObject, updatePartial } from '../../base/trivial.ts'
import { PreviewSectionStore } from './nodeSection/previewSection.store.ts'

export interface NodeUIPersistedData {
  contentWidth?: number
  rfNode?: Partial<RFNode>

  sections?: Record<NodeSectionStoreType, unknown>
  showSettings?: NodeShowSettings

  title?: string // Comment Nodes only.
  content?: string // Comment Nodes only.
}

export type NodeUIStoreData = Omit<NodeUIPersistedData, 'sections'>

function toShallowCopiedPlainObject(x: unknown): Record<PropertyKey, unknown> | undefined {
  if (isPlainObject(x)) {
    return { ...x }
  }
}

const dataParser: {
  [K in keyof Required<Omit<NodeUIStoreData, 'sections' | 'showSettings'>>]: (data: unknown) => NodeUIStoreData[K] | Option<NodeUIStoreData[K]>
} = {
  contentWidth: toNumber,
  rfNode: toShallowCopiedPlainObject,
  title: filterString,
  content: filterString,
}

const dataEqual: {
  [K in keyof NodeUIStoreData]?: false | ((oldValue: NodeUIStoreData[K], newValue: NodeUIStoreData[K]) => boolean)
} = {}

const dataCompressor: {
  [K in keyof NodeUIStoreData]?: (value: NodeUIStoreData[K]) => NodeUIStoreData[K]
} = {
  rfNode: (rfNode) => {
    // Only the position is persisted.
    let result: typeof rfNode | undefined
    if (isXYPosition(rfNode?.position)) {
      ;(result ??= {}).position = rfNode.position
    }
    return result
  },
}

export type NodeUIStore$$ = {
  [K in keyof Required<NodeUIStoreData>]: Val<NodeUIStoreData[K]>
}

export type NodeUIStore$ = ToReadonly$Group<NodeUIStore$$>

export class NodeUIStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly onChanged: AddEventListener<NodeUIStore> = this.dispose.add(event<NodeUIStore>())

  public readonly $: NodeUIStore$
  public readonly $$: NodeUIStore$$

  public readonly position$: Val<XYPosition>

  public readonly uiData$: ReadonlyVal<NodeUIPersistedData>

  readonly #previewSectionStates$: Val<Record<string, PreviewSectionUIState>>
  #observedPreviewSections: PreviewSectionStore[] = []

  /** The convenience overload still validates data as an unknown value. */
  public constructor(sections$: ReadonlyVal<INodeSectionStore[] | undefined>, data?: NodeUIPersistedData)
  public constructor(sections$: ReadonlyVal<INodeSectionStore[] | undefined>, data?: unknown)
  public constructor(sections$: ReadonlyVal<INodeSectionStore[] | undefined>, data?: unknown) {
    const $$ = parseData(data)
    this.#previewSectionStates$ = this.dispose.add(val(parsePreviewSectionStates(data)))

    this.$ = this.$$ = $$
    this.dispose.add(Object.values(this.$))

    this.position$ = this.dispose.add(
      attachSetter(
        derive(this.$$.rfNode, (rfNode) => toXYPosition(rfNode?.position) ?? DEFAULT_POSITION, {
          equal: isSameXYPosition,
        }),
        updatePartial(this.$$.rfNode, 'position', isSameXYPosition),
      ),
    )

    // Separate reactions defer uiData computation until a subscriber reads it.
    const onChange = () => send(this.onChanged, this)
    /* disposed by class */ this.position$.reaction(onChange)
    for (const [k, v] of Object.entries(this.$)) {
      if (k !== 'rfNode') {
        // The position reaction covers the only persisted RFNode field.
        /* disposed by class */ v.reaction(onChange)
      }
    }

    {
      // Track each section's persisted UI state.
      const disposes = this.dispose.add(disposableStore())
      this.dispose.add(
        sections$.subscribe((sections) => {
          for (const section of this.#observedPreviewSections) this.#updatePreviewSectionState(section)
          disposes.flush()
          this.#observedPreviewSections = []
          if (sections) {
            for (const section of sections) {
              if (PreviewSectionStore.is(section)) {
                this.#observedPreviewSections.push(section)
                this.#updatePreviewSectionState(section)
                disposes.add(
                  section.uiState$.reaction(() => {
                    this.#updatePreviewSectionState(section)
                    onChange()
                  }),
                )
              } else {
                disposes.add(section.uiState$.reaction(onChange))
              }
            }
          }
        }),
      )
    }

    const sectionStates$ = compute((get) => {
      let sectionStates: Record<NodeSectionStoreType, unknown> | undefined
      const previewSectionStates = { ...get(this.#previewSectionStates$) }
      const sections = get(sections$)
      if (sections) {
        for (const section of sections) {
          if (PreviewSectionStore.is(section)) {
            const sectionState = get(section.uiState$)
            if (sectionState == null) delete previewSectionStates[section.id]
            else previewSectionStates[section.id] = sectionState
          } else {
            const sectionState = get(section.uiState$)
            if (sectionState) (sectionStates ??= {})[section.type] = sectionState
          }
        }
      }
      if (Object.keys(previewSectionStates).length > 0) (sectionStates ??= {}).preview = previewSectionStates
      return sectionStates
    })

    this.uiData$ = this.dispose.add(
      compute((get) => {
        const result = Object.fromEntries(
          Object.keys(dataParser).map((k) => [k, (dataCompressor as any)[k] ? (dataCompressor as any)[k](get((this.$ as any)[k])) : get((this.$ as any)[k])]),
        ) as any
        result.sections = get(sectionStates$)
        return result
      }),
    )
  }

  public toUIData(): NodeUIPersistedData {
    for (const section of this.#observedPreviewSections) this.#updatePreviewSectionState(section)
    return this.uiData$.value
  }

  public getPreviewSectionUIState(id: string): PreviewSectionUIState | undefined {
    return this.#previewSectionStates$.value[id]
  }

  /**
   * DesignerUIStore callers should use `designerUIStore.setNodeUIData()`.
   * @internal
   */
  public setUIData(data: NodeUIPersistedData): void {
    parseData(data, this.$$)
    this.#previewSectionStates$.set(parsePreviewSectionStates(data))
  }

  #updatePreviewSectionState(section: PreviewSectionStore): void {
    const state = section.uiState$.value
    const previous = this.#previewSectionStates$.value[section.id]
    if (state == null && previous == null) return
    if (state != null && previous?.cardCollapsed == state.cardCollapsed && previous.previewHeight == state.previewHeight) return
    const states = { ...this.#previewSectionStates$.value }
    if (state == null) {
      delete states[section.id]
    } else {
      states[section.id] = state
    }
    this.#previewSectionStates$.set(states)
  }
}

function parsePreviewSectionStates(data: unknown): Record<string, PreviewSectionUIState> {
  const previewStates = toPlainObject(toPlainObject(toPlainObject(data)?.sections)?.preview)
  if (!previewStates) return {}
  const result: Record<string, PreviewSectionUIState> = {}
  for (const [id, value] of Object.entries(previewStates)) {
    const state = toPlainObject(value)
    if (state) {
      const cardCollapsed = toBoolean(state.cardCollapsed)
      const previewHeight = toNumber(state.previewHeight)
      if (cardCollapsed != null || previewHeight != null) result[id] = { cardCollapsed, previewHeight }
    }
  }
  return result
}

function parseData(data: unknown, $$?: NodeUIStore$$): NodeUIStore$$ {
  const d = asObject(data)

  if (!$$) {
    $$ = Object.fromEntries(
      Object.keys(dataParser).map((k) => [
        k,
        val(Option.unwrapOr((dataParser as any)[k](d[k])), (dataEqual as any)[k] ? { equal: (dataEqual as any)[k] } : undefined) as Val<any>,
      ]),
    ) as NodeUIStore$$
  } else {
    for (const k of Object.keys(dataParser)) {
      ;($$ as any)[k].set(Option.unwrapOr((dataParser as any)[k](d[k])))
    }
  }
  return $$
}
