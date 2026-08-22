import type { DisposableStore } from '@wopjs/disposable'
import type { AddEventListener } from '@wopjs/event'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../../localization/common/localization.ts'
import type { ConditionExpression, ConditionHandleDef, DefaultConditionHandleDef, HandleName, InputHandleDef } from '../../../../../schema/index.ts'
import type { Logical } from '../../conditionHandle/constants.ts'
import type { HandleRowStore } from '../../nodeHandle/handleRow.store.ts'
import type { Role } from '../../nodeHandle/widgetContext.ts'
import type { HandleIndex } from '../constants.ts'
import type { NodeShowSettings } from '../node.store.ts'
import type { IHandleRowDragNDrop, INodeSectionStore } from './interface.ts'
import type { FieldCollapsed } from './parse.ts'

import { disposableStore } from '@wopjs/disposable'
import { event, send } from '@wopjs/event'
import { arrayShallowEqual, attachSetter, combine, compute, derive, isWritable, val } from 'value-enhancer'
import { equalConfig, inferNewItemName, setPartial, toNonEmptyPlainObject, toTrue, toUserTranslateKey, updatePartial } from '../../../base/trivial.ts'
import { ConditionRowStore } from '../../conditionHandle/conditionRow.store.ts'
import { WidgetContext } from '../../conditionHandle/widgetContext.ts'
import { localize } from '../../designer/l10n.ts'
import { CONDITIONS_SECTION_TYPE } from './constants.ts'
import { parseFieldCollapsed } from './parse.ts'

export interface ConditionsSectionUIState {
  /** Field collapsed */
  readonly collapsed: FieldCollapsed | undefined
}

export type ConditionsSectionStore$$ = {
  readonly conditionHandleDefs?: Val<ConditionHandleDef[] | undefined>
  readonly defaultConditionHandleDef?: Val<DefaultConditionHandleDef | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
} & {
  readonly [K in keyof ConditionsSectionUIState]: Val<ConditionsSectionUIState[K]>
}

export type ConditionsSectionStore$ = {
  readonly inputHandleDefs: ReadonlyVal<InputHandleDef[] | undefined>
  readonly conditionHandleDefs: ReadonlyVal<ConditionHandleDef[] | undefined>
  readonly defaultConditionHandleDef: ReadonlyVal<DefaultConditionHandleDef | undefined>
  readonly handles: ReadonlyVal<ConditionRowStore[]>
  readonly allHandleNames: ReadonlyVal<HandleName[]>
  readonly connectedHandles: ReadonlyVal<ReadonlySet<HandleName>>
} & {
  readonly [K in keyof ConditionsSectionUIState]: ReadonlyVal<ConditionsSectionUIState[K]>
}

export interface ConditionsSectionStoreProps {
  readonly lang: ReadonlyVal<string>
  readonly userLocales?: LocaleTextStore
  readonly role: Role
  readonly handleOutputsTo?: ReadonlyVal<HandleName[] | undefined>
  readonly inputHandleDefs: ReadonlyVal<InputHandleDef[] | undefined>
  readonly conditionHandleDefs: Val<ConditionHandleDef[] | undefined> | ReadonlyVal<ConditionHandleDef[] | undefined>
  readonly defaultConditionHandleDef: Val<DefaultConditionHandleDef | undefined> | ReadonlyVal<DefaultConditionHandleDef | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
  readonly initialUIState?: Record<PropertyKey, unknown>
}

export class ConditionsSectionStore implements INodeSectionStore<ConditionsSectionUIState | undefined>, IHandleRowDragNDrop {
  public static readonly TYPE: CONDITIONS_SECTION_TYPE = CONDITIONS_SECTION_TYPE

  public static is(store: INodeSectionStore): store is ConditionsSectionStore {
    return store.type == CONDITIONS_SECTION_TYPE
  }

  public readonly type: CONDITIONS_SECTION_TYPE = CONDITIONS_SECTION_TYPE
  public readonly role: Role

  public readonly dispose: DisposableStore = disposableStore()
  public readonly onDidHandleIndexChange: AddEventListener<void> = this.dispose.add(event())
  public readonly onDidHandleRename: AddEventListener<[oldName: HandleName, newName: HandleName]> = this.dispose.add(event())
  public readonly onDidHandleDelete: AddEventListener<HandleName> = this.dispose.add(event())

  public readonly $$: ConditionsSectionStore$$
  public readonly $: ConditionsSectionStore$

  public readonly hasError$: ReadonlyVal<boolean>

  public readonly uiState$: ReadonlyVal<ConditionsSectionUIState | undefined>

  public constructor(props: ConditionsSectionStoreProps) {
    this.role = props.role

    const collapsed = this.dispose.add(val(parseFieldCollapsed(props.initialUIState?.collapsed)))

    this.uiState$ = this.dispose.add(
      combine([collapsed], ([nextCollapsed]) =>
        toNonEmptyPlainObject({
          collapsed: toNonEmptyPlainObject(nextCollapsed) as FieldCollapsed | undefined,
        } satisfies ConditionsSectionUIState),
      ),
    )

    this.$$ = {
      collapsed,
      conditionHandleDefs: isWritable(props.conditionHandleDefs) ? this.dispose.add(props.conditionHandleDefs.ref(true)) : undefined,
      defaultConditionHandleDef: isWritable(props.defaultConditionHandleDef) ? this.dispose.add(props.defaultConditionHandleDef.ref(true)) : undefined,
      showSettings: this.dispose.add(props.showSettings.ref(true)),
    }

    const connectedHandles = this.deriveConnectedHandles$(props.handleOutputsTo)
    this.$ = {
      collapsed,
      inputHandleDefs: this.dispose.add(props.inputHandleDefs.ref()),
      conditionHandleDefs: this.dispose.add(props.conditionHandleDefs.ref()),
      defaultConditionHandleDef: this.dispose.add(props.defaultConditionHandleDef.ref()),
      handles: this.dispose.add(this.deriveHandles$(collapsed, props, connectedHandles)),
      allHandleNames: this.dispose.add(this.deriveAllHandleNames$(props)),
      connectedHandles,
    }

    this.hasError$ = this.dispose.add(compute((get) => get(this.$.handles).some((row) => get(row.error$))))

    this.setupHandleIndexChangeEvent()
  }

  private setupHandleIndexChangeEvent(): void {
    const handleIndices = this.dispose.add(
      compute((get) => {
        const a = get(this.$.conditionHandleDefs)?.map((d) => d.handle)
        const b = get(this.$.defaultConditionHandleDef)?.handle
        return (a && b != null ? [...a, b] : a || b) ?? []
      }),
    )
    this.dispose.add(handleIndices.reaction(send.bind(null, this.onDidHandleIndexChange)))
  }

  /**
   * Closes the settings panel when dragging starts.
   * @internal
   */
  public onDragStart(handle: HandleName): void {
    const state = this.$$.showSettings.value
    if (state?.handle === handle) {
      this.$$.showSettings.set(void 0)
    }
  }

  private getConditionHandleDefs$(): Val<ConditionHandleDef[] | undefined> | undefined {
    return toTrue(this.role === 'author') && this.$$.conditionHandleDefs
  }

  private getDefaultConditionHandleDef$(): Val<DefaultConditionHandleDef | undefined> | undefined {
    return toTrue(this.role === 'author') && this.$$.defaultConditionHandleDef
  }

  /**
   * Returns `[0+, defaultDef$ or defs$, fromDefault]` when found.
   * Returns `[-1, defs$, false]` when missing.
   */
  private findHandleForWriting(
    name: HandleName | HandleIndex,
  ):
    | readonly [index: number, conditionDefs$: Val<ConditionHandleDef[] | undefined> | undefined, fromDefault: false]
    | readonly [index: number, defaultDef$: Val<DefaultConditionHandleDef | undefined>, fromDefault: true] {
    const target: HandleIndex = typeof name === 'string' ? { handle: name } : name

    let index: number | undefined
    const conditionDefs$ = this.getConditionHandleDefs$()
    index = conditionDefs$?.value?.findIndex((def) => def.handle === target.handle)
    if (index != null && index >= 0) return [index, conditionDefs$, false]

    const defaultDef$ = this.getDefaultConditionHandleDef$()
    if (defaultDef$ && defaultDef$.value?.handle === target.handle) return [0, defaultDef$, true]

    return [-1, conditionDefs$, false]
  }

  public addNewHandle(after?: HandleName): void {
    const conditionDefs$ = this.getConditionHandleDefs$()
    if (conditionDefs$) {
      const names = this.$.allHandleNames.value
      const defs = conditionDefs$.value
      const newDef: ConditionHandleDef = {
        handle: inferNewItemName('case', names) as HandleName,
      }
      const index = defs?.findIndex((d) => d.handle === after) ?? -1
      if (defs && index >= 0) {
        conditionDefs$.set(defs.toSpliced(index + 1, 0, newDef))
      } else {
        conditionDefs$.set(defs ? [...defs, newDef] : [newDef])
      }
    }
  }

  public renameHandle(name: HandleName, newName: HandleName): boolean {
    if (this.$.allHandleNames.value.includes(newName)) {
      return false
    }
    const [index, maybeDefs$, fromDefault] = this.findHandleForWriting(name)
    const maybeDefs = maybeDefs$?.value
    if (maybeDefs && index >= 0) {
      const showSettings = this.$$.showSettings.value
      if (showSettings?.scope === 'condition' && showSettings.handle === name) {
        this.$$.showSettings.set({ scope: 'condition', handle: newName })
      }
      if (fromDefault) {
        maybeDefs$.set({ ...maybeDefs, handle: newName })
      } else {
        const defs = maybeDefs as ConditionHandleDef[]
        maybeDefs$.set(defs.toSpliced(index, 1, { ...defs[index], handle: newName }))
      }
      send(this.onDidHandleRename, [name, newName])
      return true
    }
    return false
  }

  public deleteHandle(name: HandleName): void {
    const [index, maybeDefs$, fromDefault] = this.findHandleForWriting(name)
    const maybeDefs = maybeDefs$?.value
    if (maybeDefs && index >= 0) {
      this.$$.showSettings.set(void 0)
      if (fromDefault) {
        maybeDefs$.set(void 0)
      } else {
        const defs = maybeDefs as ConditionHandleDef[]
        maybeDefs$.set(defs.toSpliced(index, 1))
      }
      send(this.onDidHandleDelete, name)
    }
  }

  public moveHandle(index: HandleIndex, newIndex: number): void {
    const [oldIndex, maybeDefs$, fromDefault] = this.findHandleForWriting(index)
    const maybeDefs = maybeDefs$?.value
    if (maybeDefs && oldIndex >= 0 && !fromDefault) {
      const newDefs = (maybeDefs as ConditionHandleDef[]).slice()
      const spliced = newDefs.splice(oldIndex, 1)
      newDefs.splice(newIndex, 0, ...spliced)
      maybeDefs$.set(newDefs)
    }
  }

  public toggleDefaultHandle(): void {
    const def$ = this.getDefaultConditionHandleDef$()
    if (def$) {
      if (def$.value) {
        def$.set(void 0)
      } else {
        def$.set({ handle: inferNewItemName('default', this.$.allHandleNames.value) as HandleName })
      }
    }
  }

  /** @internal Returns the source row when a connection creates a handle. */
  public grabHandleRow(handle: HandleName): ConditionRowStore | undefined {
    return this.$.handles.value.find((e) => e.name === handle)
  }

  /** @internal Inserts a connection-created handle below the target or at the end. */
  public dropHandleRow(handleIndex: HandleIndex | null | undefined, row: HandleRowStore, insertBefore?: boolean): HandleName | undefined {
    const conditionDefs$ = this.getConditionHandleDefs$()
    if (conditionDefs$) {
      const names = this.$.allHandleNames.value
      const newDef: ConditionHandleDef = {
        handle: names.includes(row.name) ? (inferNewItemName('case', names) as HandleName) : row.name,
      }
      const defs = conditionDefs$.value
      if (defs) {
        const index = handleIndex ? defs.findIndex((d) => d.handle === handleIndex.handle) : -1
        if (index >= 0) {
          conditionDefs$.set(defs.toSpliced(index + 1, 0, newDef))
        } else {
          conditionDefs$.set(insertBefore ? [newDef, ...defs] : [...defs, newDef])
        }
      } else {
        conditionDefs$.set([newDef])
      }
      return newDef.handle
    }
  }

  private deriveHandleNames$(conditionDefs$: ReadonlyVal<ConditionHandleDef[] | undefined>): ReadonlyVal<HandleName[] | undefined> | undefined {
    return derive(conditionDefs$, (defs) => defs && defs.map((d) => d.handle), { equal: arrayShallowEqual })
  }

  private deriveHandleName$(defaultDef$: ReadonlyVal<DefaultConditionHandleDef | undefined>): ReadonlyVal<HandleName | undefined> {
    return derive(defaultDef$, (def) => def?.handle)
  }

  private deriveHandles$(
    collapsed: Val<FieldCollapsed | undefined>,
    props: ConditionsSectionStoreProps,
    connectedHandles$: ReadonlyVal<ReadonlySet<HandleName>>,
  ): ReadonlyVal<ConditionRowStore[]> {
    const conditionHandles$ = this.deriveHandleNames$(props.conditionHandleDefs)

    let oldHandles: ConditionRowStore[] | undefined
    const conditionHandleRows$ = compute<ConditionRowStore[]>(
      (get) => {
        const rows: ConditionRowStore[] = []
        const conditionHandles = get(conditionHandles$) ?? []
        if (!conditionHandles.length) {
          oldHandles?.forEach((r) => r.dispose())
          oldHandles = undefined
          return rows
        }

        for (const handle of conditionHandles) {
          const r = oldHandles?.find((e) => e.name === handle)
          if (r) {
            rows.push(r)
            continue
          }

          const { logical$, expressions$, description$, displayDescription$, showSettings$ } = this.deriveHandleRowVals$(
            props,
            props.conditionHandleDefs,
            handle,
          )

          const collapsed$ = attachSetter(
            derive(collapsed, (c) => c?.[handle], equalConfig),
            setPartial(collapsed, handle),
          )

          const reference$ = derive(connectedHandles$, (set) => set.has(handle))

          const context = new WidgetContext({ role: props.role, userLocales: props.userLocales }, props.inputHandleDefs, logical$, expressions$, collapsed$)

          const row = new ConditionRowStore(handle, description$, displayDescription$, reference$, showSettings$, context)
          row.dispose.add([logical$, expressions$, showSettings$, collapsed$])

          rows.push(row)
        }

        if (oldHandles) {
          for (const r of oldHandles) {
            if (!rows.some((e) => e.name === r.name)) r.dispose()
          }
        }
        oldHandles = rows

        return rows
      },
      { equal: arrayShallowEqual },
    )

    const defaultHandle$ = this.deriveHandleName$(props.defaultConditionHandleDef)

    let oldDefaultRow: ConditionRowStore | undefined
    const defaultHandleRow$ = compute<ConditionRowStore | undefined>((get) => {
      const handle = get(defaultHandle$)
      if (!handle) {
        oldDefaultRow?.dispose()
        oldDefaultRow = undefined
        return undefined
      }

      if (oldDefaultRow?.name === handle) {
        return oldDefaultRow
      }

      const def$ = attachSetter(
        derive(props.defaultConditionHandleDef, (def) => (def?.handle === handle ? def : undefined)),
        (def) => {
          if (def && isWritable(props.defaultConditionHandleDef)) {
            props.defaultConditionHandleDef.set(def)
          }
        },
      )

      const description$ = attachSetter(
        derive(def$, (def) => def?.description),
        updatePartial(def$, 'description'),
      )
      const displayDescription$ = compute((read) => {
        const raw = read(description$)
        const translateKey = toUserTranslateKey(raw)
        if (translateKey != null && props.userLocales) {
          return localize(props.userLocales, props.lang, read, translateKey, raw)
        }
        return raw
      })
      const showSettings$ = attachSetter(
        derive(this.$$.showSettings, (s) => s?.scope === 'condition' && s.handle === handle),
        (b) => this.$$.showSettings.set(b ? { scope: 'condition', handle } : undefined),
      )

      // The default handle has no logical operator or expressions.
      const logical$ = val<Logical | undefined>()
      const expressions$ = val<ConditionExpression[] | undefined>()

      const collapsed$ = attachSetter(
        derive(collapsed, (c) => c?.[handle], equalConfig),
        setPartial(collapsed, handle),
      )

      const reference$ = derive(connectedHandles$, (set) => set.has(handle))

      const context = new WidgetContext(
        { role: props.role, isDefault: true, userLocales: props.userLocales },
        props.inputHandleDefs,
        logical$,
        expressions$,
        collapsed$,
      )
      const row = new ConditionRowStore(handle, description$, displayDescription$, reference$, showSettings$, context)
      row.dispose.add([description$, displayDescription$, showSettings$, collapsed$, def$, logical$, expressions$])

      oldDefaultRow?.dispose()
      oldDefaultRow = row
      return row
    })

    return combine([conditionHandleRows$, defaultHandleRow$], ([cases, fallback]) => (fallback ? cases.concat(fallback) : cases))
  }

  private deriveHandleRowVals$(
    { showSettings, userLocales, lang }: ConditionsSectionStoreProps,
    conditionDefs$: Val<ConditionHandleDef[] | undefined> | ReadonlyVal<ConditionHandleDef[] | undefined>,
    handle: HandleName,
  ) {
    const def$ = attachSetter(
      derive(conditionDefs$, (defs) => defs?.find((d) => d.handle === handle)),
      (def) => {
        if (def && isWritable(conditionDefs$)) {
          const defs = conditionDefs$.value
          if (defs) {
            const index = defs.findIndex((d) => d.handle === handle)
            const newDefs = defs.slice()
            newDefs[index >= 0 ? index : defs.length] = def
            conditionDefs$.set(newDefs)
          } else {
            conditionDefs$.set([def])
          }
        }
      },
    )

    const logical$ = attachSetter(
      derive(def$, (def) => def?.logical),
      updatePartial(def$, 'logical'),
    )
    const expressions$ = attachSetter(
      derive(def$, (def) => def?.expressions),
      updatePartial(def$, 'expressions'),
    )
    const description$ = attachSetter(
      derive(def$, (def) => def?.description),
      updatePartial(def$, 'description'),
    )
    const displayDescription$ = compute((read) => {
      const raw = read(description$)
      const translateKey = toUserTranslateKey(raw)
      if (translateKey != null && userLocales) {
        return localize(userLocales, lang, read, translateKey, raw)
      }
      return raw
    })
    const showSettings$ = attachSetter(
      derive(showSettings, (s) => s?.scope === 'condition' && s.handle === handle),
      (b) => showSettings.set(b ? { scope: 'condition', handle } : undefined),
    )

    return { logical$, expressions$, description$, displayDescription$, showSettings$ }
  }

  private deriveAllHandleNames$(props: ConditionsSectionStoreProps): ReadonlyVal<HandleName[]> {
    return compute(
      (get) => {
        const a = get(props.conditionHandleDefs)?.map((e) => e.handle)
        const b = get(props.defaultConditionHandleDef)?.handle
        return a ? (b ? [...a, b] : a) : b ? [b] : []
      },
      { equal: arrayShallowEqual },
    )
  }

  private deriveConnectedHandles$(handleOutputsTo: ReadonlyVal<HandleName[] | undefined> | undefined): ReadonlyVal<ReadonlySet<HandleName>> {
    return handleOutputsTo
      ? derive(handleOutputsTo, (handles) => {
          if (!handles || handles.length === 0) return emptySet
          return new Set(handles)
        })
      : val(emptySet)
  }
}

const emptySet = /*#__PURE__*/ new Set<any>()
