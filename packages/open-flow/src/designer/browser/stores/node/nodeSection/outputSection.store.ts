import type { DisposableStore } from '@wopjs/disposable'
import type { AddEventListener } from '@wopjs/event'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../../localization/common/localization.ts'
import type { GroupDividerDef, HandleName } from '../../../../../schema/index.ts'
import type { Role } from '../../nodeHandle/widgetContext.ts'
import type { GroupedOutputHandleDef, HandleIndex, OutputHandleDef } from '../constants.ts'
import type { NodeShowSettings } from '../node.store.ts'
import type { IHandleRowDragNDrop, INodeSectionStore } from './interface.ts'
import type { FieldCollapsed } from './parse.ts'

import { disposableStore } from '@wopjs/disposable'
import { event, send } from '@wopjs/event'
import { arrayShallowEqual, attachSetter, combine, compute, derive, isWritable, val } from 'value-enhancer'
import {
  arrayFindIndexOrLength,
  asTrue,
  equalConfig,
  inferNewItemName,
  setPartial,
  toNonEmptyPlainObject,
  toNotUserTranslateKey,
  toPlainObjectOfTrue,
  toTrue,
  toUserTranslateKey,
  updatePartial,
} from '../../../base/trivial.ts'
import { getDefaultSchemaForNewHandle } from '../../../jsonSchema/preset.ts'
import { localize } from '../../designer/l10n.ts'
import { HandleRowStore } from '../../nodeHandle/handleRow.store.ts'
import { WidgetContext } from '../../nodeHandle/widgetContext.ts'
import { isGroupDef, isHandleDef, matchesIndex } from '../constants.ts'
import { cloneLocalesIfNeeded } from './cloneLocales.ts'
import { OUTPUT_SECTION_TYPE } from './constants.ts'
import { parseFieldCollapsed } from './parse.ts'

export interface OutputSectionUIState {
  /** Field collapsed. */
  readonly collapsed: FieldCollapsed | undefined
  /** Group collapsed. */
  readonly groupCollapsed: Record<PropertyKey, true> | undefined
}

export type OutputSectionStore$$ = {
  readonly outputHandleDefs?: Val<GroupedOutputHandleDef[] | undefined>
  readonly additionalOutputDefs?: Val<OutputHandleDef[] | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
} & {
  readonly [K in keyof OutputSectionUIState]: Val<OutputSectionUIState[K]>
}

export type OutputSectionStore$ = {
  readonly outputHandleDefs: ReadonlyVal<GroupedOutputHandleDef[] | undefined>
  readonly additionalOutputs?: ReadonlyVal<boolean | OutputHandleDef | undefined>
  readonly additionalOutputDefs?: ReadonlyVal<OutputHandleDef[] | undefined>
  // Strings represent group dividers.
  readonly handles: ReadonlyVal<(HandleRowStore | string)[]>
  readonly allHandleNames: ReadonlyVal<HandleName[]>
  readonly allGroupNames: ReadonlyVal<readonly string[]>
  readonly connectedHandles: ReadonlyVal<ReadonlySet<HandleName>>
  readonly isEmpty: ReadonlyVal<boolean>
} & {
  readonly [K in keyof OutputSectionUIState]: ReadonlyVal<OutputSectionUIState[K]>
}

export type OutputSectionStoreProps = {
  readonly lang: ReadonlyVal<string>
  readonly userLocales?: LocaleTextStore
  readonly role: Role
  readonly handleOutputsTo?: ReadonlyVal<HandleName[] | undefined>
  readonly outputHandleDefs: Val<(OutputHandleDef | GroupDividerDef)[] | undefined> | ReadonlyVal<(OutputHandleDef | GroupDividerDef)[] | undefined>
  readonly additionalOutputs?: ReadonlyVal<boolean | OutputHandleDef | undefined>
  readonly additionalOutputDefs?: Val<OutputHandleDef[] | undefined>
  // Undefined means that no settings panel is open.
  readonly showSettings: Val<NodeShowSettings | undefined>
  readonly initialUIState?: Record<PropertyKey, unknown>
  readonly createSchemaEditor: (dom: HTMLDivElement, schema$: Val<string> | ReadonlyVal<string>) => (() => void) | void
}

export class OutputSectionStore implements INodeSectionStore<OutputSectionUIState | undefined>, IHandleRowDragNDrop {
  public static readonly TYPE: OUTPUT_SECTION_TYPE = OUTPUT_SECTION_TYPE

  public static is(store: INodeSectionStore): store is OutputSectionStore {
    return store.type === OUTPUT_SECTION_TYPE
  }

  public readonly type: OUTPUT_SECTION_TYPE = OUTPUT_SECTION_TYPE
  public readonly role: Role
  public readonly userLocales?: LocaleTextStore

  public readonly dispose: DisposableStore = disposableStore()
  public readonly onDidHandleIndexChange: AddEventListener<void> = this.dispose.add(event())
  public readonly onDidHandleRename: AddEventListener<[oldName: HandleName, newName: HandleName]> = this.dispose.add(event())
  public readonly onDidHandleDelete: AddEventListener<HandleName> = this.dispose.add(event())

  public readonly $$: OutputSectionStore$$
  public readonly $: OutputSectionStore$

  public readonly hasError$: ReadonlyVal<boolean>

  // This state is persisted.
  public readonly uiState$: ReadonlyVal<OutputSectionUIState | undefined>

  public constructor(props: OutputSectionStoreProps) {
    this.role = props.role
    this.userLocales = props.userLocales

    const collapsed = this.dispose.add(val(parseFieldCollapsed(props.initialUIState?.collapsed)))

    const groupCollapsed = this.dispose.add(val(toPlainObjectOfTrue(props.initialUIState?.groupCollapsed)))

    this.uiState$ = this.dispose.add(
      combine([collapsed, groupCollapsed], ([nextCollapsed, nextGroupCollapsed]) =>
        toNonEmptyPlainObject({
          collapsed: toNonEmptyPlainObject(nextCollapsed) as FieldCollapsed | undefined,
          groupCollapsed: toPlainObjectOfTrue(nextGroupCollapsed),
        } satisfies OutputSectionUIState),
      ),
    )

    this.$$ = {
      collapsed,
      groupCollapsed,
      outputHandleDefs: isWritable(props.outputHandleDefs) ? this.dispose.add(props.outputHandleDefs.ref(true)) : undefined,
      additionalOutputDefs: props.additionalOutputDefs && this.dispose.add(props.additionalOutputDefs.ref(true)),
      showSettings: this.dispose.add(props.showSettings.ref(true)),
    }

    const connectedHandles = this.deriveConnectedHandles$(props.handleOutputsTo)
    this.$ = {
      collapsed,
      groupCollapsed,
      outputHandleDefs: this.dispose.add(props.outputHandleDefs.ref()),
      additionalOutputs: props.additionalOutputs && this.dispose.add(props.additionalOutputs.ref()),
      additionalOutputDefs: this.$$.additionalOutputDefs,
      handles: this.dispose.add(this.deriveHandles$(collapsed, props, connectedHandles)),
      allHandleNames: this.dispose.add(this.deriveAllHandleNames$(props)),
      allGroupNames: this.dispose.add(this.deriveAllGroupNames$(props)),
      isEmpty: this.dispose.add(this.deriveIsEmpty$(props)),
      connectedHandles,
    }

    this.hasError$ = this.dispose.add(compute((get) => get(this.$.handles).some((row) => HandleRowStore.is(row) && get(row.error$))))

    this.setupHandleIndexChangeEvent()
  }

  private setupHandleIndexChangeEvent(): void {
    const handleIndices = this.dispose.add(
      compute(
        (get) => {
          const a = get(this.$.outputHandleDefs)?.map((d) => (isGroupDef(d) ? `g:${d.group}` : `h:${d.handle}`))
          const b = get(this.$.additionalOutputDefs)?.map((d) => `h:${d.handle}`)
          return (a && b ? [...a, ...b] : a || b) ?? []
        },
        { equal: arrayShallowEqual },
      ),
    )
    this.dispose.add(handleIndices.reaction(send.bind(null, this.onDidHandleIndexChange)))
  }

  /** Provides writable definitions for group editing operations. */
  private findGroupForWriting(group: string): readonly [index: number, outputDefs$: Val<GroupedOutputHandleDef[] | undefined> | undefined] {
    const outputDefs$ = this.getOutputHandleDefs$()
    const defs = outputDefs$?.value
    if (defs) {
      const index = defs.findIndex((def) => isGroupDef(def) && def.group === group)
      return [index, outputDefs$]
    }
    return [-1, outputDefs$]
  }

  public addGroup(handle: HandleName): void {
    const [oldIndex, inputDefs$] = this.findHandleForWriting(handle)
    const defs = inputDefs$?.value
    if (defs && oldIndex >= 0) {
      const newDefs = defs.slice()
      const spliced = newDefs.splice(oldIndex, 1)
      const group = inferNewItemName('Group', this.$.allGroupNames.value).trim()
      newDefs.splice(999, 0, { group }, ...spliced)
      inputDefs$.set(newDefs)
    }
  }

  public deleteGroup(group: string): void {
    const [index, inputDefs$] = this.findGroupForWriting(group)
    const defs = inputDefs$?.value
    if (defs && index >= 0) {
      this.deleteGroupCollapsed(group)
      inputDefs$.set(defs.toSpliced(index, 1))
    }
  }

  public renameGroup(group: string, newName: string): void {
    const [index, inputDefs$] = this.findGroupForWriting(group)
    const defs = inputDefs$?.value
    if (defs && index >= 0) {
      const def = defs[index] as GroupDividerDef
      this.renameGroupCollapsed(group, newName)
      inputDefs$.set(defs.toSpliced(index, 1, { ...def, group: newName }))
    }
  }

  public toggleGroup(group: string): void {
    const [index, inputDefs$] = this.findGroupForWriting(group)
    const defs = inputDefs$?.value
    if (defs && index >= 0) {
      const def = defs[index] as GroupDividerDef
      const collapsed = this.toggleGroupCollapsed(def.group)
      inputDefs$.set(defs.toSpliced(index, 1, { ...def, collapsed }))
    } else if (this.$.allGroupNames.value.includes(group)) {
      this.toggleGroupCollapsed(group)
    }
  }

  private toggleGroupCollapsed(group: string): boolean {
    const groupCollapsed = this.$$.groupCollapsed.value
    if (groupCollapsed) {
      if (Object.hasOwn(groupCollapsed, group) && groupCollapsed[group]) {
        const { [group]: _, ...newGroupCollapsed } = groupCollapsed
        this.$$.groupCollapsed.set(newGroupCollapsed)
        return false
      } else {
        this.$$.groupCollapsed.set({ ...groupCollapsed, [group]: true })
        return true
      }
    } else {
      this.$$.groupCollapsed.set({ [group]: true })
      return true
    }
  }

  private deleteGroupCollapsed(group: string): void {
    const groupCollapsed = this.$$.groupCollapsed.value
    if (groupCollapsed && Object.hasOwn(groupCollapsed, group) && groupCollapsed[group]) {
      const { [group]: _, ...newGroupCollapsed } = groupCollapsed
      this.$$.groupCollapsed.set(newGroupCollapsed)
    }
  }

  private renameGroupCollapsed(oldName: string, newName: string): void {
    const groupCollapsed = this.$$.groupCollapsed.value
    if (groupCollapsed && Object.hasOwn(groupCollapsed, oldName) && groupCollapsed[oldName]) {
      const { [oldName]: _, ...newGroupCollapsed } = groupCollapsed
      newGroupCollapsed[newName] = true
      this.$$.groupCollapsed.set(newGroupCollapsed)
    }
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

  public get canEditGroups(): boolean {
    return this.getOutputHandleDefs$() != null
  }

  private getOutputHandleDefs$(): Val<GroupedOutputHandleDef[] | undefined> | undefined {
    return toTrue(this.role === 'author') && this.$$.outputHandleDefs
  }

  private getAdditionalOutputDefs$(): Val<GroupedOutputHandleDef[] | undefined> | undefined {
    return this.$.additionalOutputs?.value ? (this.$$.additionalOutputDefs as any) : void 0
  }

  private findHandleForWriting(
    name: HandleName | HandleIndex,
  ): readonly [index: number, inputDefs$: Val<GroupedOutputHandleDef[] | undefined> | undefined, fromAdditional: boolean] {
    const target: HandleIndex = typeof name === 'string' ? { handle: name } : name

    let index: number | undefined
    const outputDefs$ = this.getOutputHandleDefs$()
    index = outputDefs$?.value?.findIndex((def) => matchesIndex(def, target))
    if (index != null && index >= 0) return [index, outputDefs$, false]

    const additionalInputDefs$ = this.getAdditionalOutputDefs$()
    index = additionalInputDefs$?.value?.findIndex((def) => matchesIndex(def, target))
    if (index != null && index >= 0) return [index, additionalInputDefs$, true]

    if (additionalInputDefs$) {
      return [-1, additionalInputDefs$, true]
    } else {
      return [-1, outputDefs$, false]
    }
  }

  public addNewHandle(forceAdditional = false): void {
    const outputDefs$ = forceAdditional ? this.getAdditionalOutputDefs$() : this.getOutputHandleDefs$() || this.getAdditionalOutputDefs$()
    if (outputDefs$) {
      const names = this.$.allHandleNames.value
      const defs = outputDefs$.value
      const newDef: OutputHandleDef = {
        handle: inferNewItemName('output', names) as HandleName,
        json_schema: getDefaultSchemaForNewHandle(defs),
      }
      outputDefs$.set(defs ? defs.toSpliced(arrayFindIndexOrLength(defs, isGroupDef), 0, newDef) : [newDef])
    }
  }

  public renameHandle(name: HandleName, newName: HandleName): boolean {
    if (this.$.allHandleNames.value.includes(newName)) {
      return false
    }
    const [index, outputDefs$] = this.findHandleForWriting(name)
    const defs = outputDefs$?.value
    if (defs && index >= 0) {
      const showSettings = this.$$.showSettings.value
      if (showSettings?.scope === 'output' && showSettings.handle === name) {
        this.$$.showSettings.set({ scope: 'output', handle: newName })
      }
      outputDefs$.set(defs.toSpliced(index, 1, { ...defs[index], handle: newName }))
      send(this.onDidHandleRename, [name, newName])
      return true
    }
    return false
  }

  public deleteHandle(name: HandleName): void {
    const [index, outputDefs$] = this.findHandleForWriting(name)
    const defs = outputDefs$?.value
    if (defs && index >= 0) {
      this.$$.showSettings.set(void 0)
      outputDefs$.set(defs.toSpliced(index, 1))
      send(this.onDidHandleDelete, name)
    }
  }

  public moveHandle(index: HandleIndex, newIndex: number): void {
    const [oldIndex, outputDefs$] = this.findHandleForWriting(index)
    const defs = outputDefs$?.value
    if (defs && oldIndex >= 0) {
      const newDefs = defs.slice()
      const spliced = newDefs.splice(oldIndex, 1)
      newDefs.splice(newIndex, 0, ...spliced)
      outputDefs$.set(newDefs)
    }
  }

  /** @internal Assigns the handle type for a connection-created inline task. */
  public assignHandleDef(handle: HandleName, def: OutputHandleDef): void {
    const defs = this.$$.outputHandleDefs?.value
    if (defs) {
      const index = defs.findIndex((d) => d.handle === handle)
      if (index >= 0) {
        const oldDef = defs[index] as OutputHandleDef
        const newDef: OutputHandleDef = {
          ...oldDef,
          description: toNotUserTranslateKey(def.description),
          json_schema: def.json_schema,
          kind: def.kind,
          nullable: def.nullable,
        }
        this.$$.outputHandleDefs.set(defs.toSpliced(index, 1, newDef))
      } else {
        const newDef: OutputHandleDef = {
          handle,
          json_schema: def.json_schema,
          kind: def.kind,
          nullable: def.nullable,
        }
        this.$$.outputHandleDefs.set([...defs, newDef])
      }
    }
  }

  /** @internal Returns the source row when a connection creates a handle. */
  public grabHandleRow(handle: HandleName): HandleRowStore | undefined {
    return this.$.handles.value.find((e): e is HandleRowStore => HandleRowStore.is(e) && e.name === handle)
  }

  /** @internal Inserts a connection-created handle below the target or at the end. */
  public dropHandleRow(handleIndex: HandleIndex | null | undefined, row: HandleRowStore, insertBefore?: boolean): HandleName | undefined {
    const outputDefs$ = this.getOutputHandleDefs$() || this.getAdditionalOutputDefs$()
    if (outputDefs$) {
      const names = this.$.allHandleNames.value
      const newDef: OutputHandleDef = {
        handle: names.includes(row.name) ? (inferNewItemName('output', names) as HandleName) : row.name,
        json_schema: row.schema$.value,
        kind: row.schemaKind$.value,
        nullable: row.nullable$.value,
        description: cloneLocalesIfNeeded(row.description$.value, row.context.userLocales, this.userLocales),
      }
      const defs = outputDefs$.value
      if (defs) {
        const index = handleIndex ? defs.findIndex((d) => matchesIndex(d, handleIndex)) : -1
        if (index >= 0) {
          outputDefs$.set(defs.toSpliced(index + 1, 0, newDef))
        } else {
          outputDefs$.set(insertBefore ? [newDef, ...defs] : [...defs, newDef])
        }
      } else {
        outputDefs$.set([newDef])
      }
      return newDef.handle
    }
  }

  private deriveHandleIndices$(
    outputHandleDefs: ReadonlyVal<GroupedOutputHandleDef[] | undefined> | undefined,
  ): ReadonlyVal<readonly HandleIndex[] | undefined> | undefined {
    if (outputHandleDefs) {
      return derive(outputHandleDefs, (defs) => defs?.map((d) => (isGroupDef(d) ? { group: d.group } : { handle: d.handle })), equalConfig)
    }
  }

  private deriveHandles$(
    collapsed: Val<FieldCollapsed | undefined>,
    props: OutputSectionStoreProps,
    connectedHandles$: ReadonlyVal<ReadonlySet<HandleName>>,
  ): ReadonlyVal<(HandleRowStore | string)[]> {
    const indices$ = this.deriveHandleIndices$(props.outputHandleDefs)

    let oldHandles: HandleRowStore[] | undefined
    const outputHandleRows$ = compute<(HandleRowStore | string)[]>(
      (get) => {
        const rows: (HandleRowStore | string)[] = []
        const indices = get(indices$)
        if (!indices?.length) {
          oldHandles?.forEach((e) => e.dispose())
          oldHandles = undefined
          return rows
        }

        for (const index of indices) {
          if (index.handle == null) {
            rows.push(index.group)
            continue
          }

          const handle = index.handle
          const r = oldHandles?.find((e) => e.name === handle)
          if (r) {
            rows.push(r)
            continue
          }

          const { schema$, description$, displayDescription$, kind$, nullable$, showSettings$ } = this.deriveHandleRowVals$(
            props,
            props.outputHandleDefs,
            handle,
          )

          const collapsed$ = attachSetter(
            derive(collapsed, (c) => c?.[handle], equalConfig),
            setPartial(collapsed, handle),
          )

          const reference$ = derive(connectedHandles$, (set) => set.has(handle))

          // Output handles do not expose the following input-only features.
          const schemaOverrides$ = val()
          const value$ = val()
          const height$ = val()

          const context = new WidgetContext(
            {
              role: props.role,
              inout: 'out',
              userLocales: props.userLocales,
            },
            schema$,
            schemaOverrides$,
            value$,
            collapsed$,
            height$,
            props.createSchemaEditor,
          )

          const row = new HandleRowStore(handle, description$, displayDescription$, props.lang, kind$, reference$, nullable$, showSettings$, context)
          row.dispose.add([schema$, nullable$, showSettings$, collapsed$])

          rows.push(row)
        }

        if (oldHandles) {
          for (const r of oldHandles) {
            if (!rows.some((e) => HandleRowStore.is(e) && e.name === r.name)) r.dispose()
          }
        }
        oldHandles = rows.filter(HandleRowStore.is)

        return rows
      },
      { equal: arrayShallowEqual },
    )

    const additionalIndices$ = this.deriveHandleIndices$(props.additionalOutputDefs)

    let oldAdditionalRows: HandleRowStore[] | undefined
    const additionalHandleRows$ = compute<HandleRowStore[]>(
      (get) => {
        const rows: HandleRowStore[] = []
        if (!get(props.additionalOutputs)) return rows

        const indices = get(additionalIndices$) || []
        for (const { handle } of indices) {
          if (handle == null) {
            continue
          }

          const r = oldAdditionalRows?.find((e) => e.name === handle)
          if (r) {
            rows.push(r)
            continue
          }

          const role = props.role === 'user' ? 'author' : props.role
          const { schema$, description$, displayDescription$, kind$, nullable$, showSettings$ } = this.deriveHandleRowVals$(
            props,
            props.additionalOutputDefs!,
            handle,
          )

          const collapsed$ = attachSetter(
            derive(collapsed, (c) => c?.[handle], equalConfig),
            setPartial(collapsed, handle),
          )

          const reference$ = derive(connectedHandles$, (set) => set.has(handle))

          // Output handles do not expose the following input-only features.
          const schemaOverrides$ = val()
          const value$ = val()
          const height$ = val()

          const context = new WidgetContext(
            { role, inout: 'out', additional: true, restrict: props.additionalOutputs, userLocales: props.userLocales },
            schema$,
            schemaOverrides$,
            value$,
            collapsed$,
            height$,
            props.createSchemaEditor,
          )

          const row = new HandleRowStore(handle, description$, displayDescription$, props.lang, kind$, reference$, nullable$, showSettings$, context)
          row.dispose.add([schema$, nullable$, showSettings$, collapsed$])

          rows.push(row)
        }

        if (oldAdditionalRows) {
          for (const r of oldAdditionalRows) {
            if (!rows.some((e) => e.name === r.name)) r.dispose()
          }
        }
        oldAdditionalRows = rows

        return rows
      },
      { equal: arrayShallowEqual },
    )

    return combine([outputHandleRows$, additionalHandleRows$], ([output, additional]) => output.concat(additional))
  }

  private deriveHandleRowVals$(
    { showSettings, userLocales, lang }: OutputSectionStoreProps,
    outputDefs$: Val<GroupedOutputHandleDef[] | undefined> | ReadonlyVal<GroupedOutputHandleDef[] | undefined>,
    handle: HandleName,
  ) {
    const def$ = attachSetter(
      derive(outputDefs$, (defs) => defs?.find((def) => def.handle === handle) as OutputHandleDef | undefined),
      (def) => {
        if (def && isWritable(outputDefs$)) {
          const defs = outputDefs$.value
          if (defs) {
            const index = defs.findIndex((d) => d.handle === handle)
            const newDefs = defs.slice()
            newDefs[index >= 0 ? index : defs.length] = def
            outputDefs$.set(newDefs)
          } else {
            outputDefs$.set([def])
          }
        }
      },
    )

    const description$ = attachSetter(
      derive(def$, (d) => d?.description),
      updatePartial(def$, 'description'),
    )
    const displayDescription$ = compute((get) => {
      const raw = get(description$)
      const translateKey = toUserTranslateKey(raw)
      if (translateKey != null && userLocales) {
        return localize(userLocales, lang, get, translateKey, raw)
      }
      return raw
    })
    const schema$ = attachSetter(
      derive(def$, (d) => d?.json_schema, equalConfig),
      updatePartial(def$, 'json_schema'),
    )
    const nullable$ = attachSetter(
      derive(def$, (d) => asTrue(d?.nullable)),
      updatePartial(def$, 'nullable'),
    )
    const kind$ = attachSetter(
      derive(def$, (d) => d?.kind),
      updatePartial(def$, 'kind'),
    )
    const showSettings$ = attachSetter(
      derive(showSettings, (s) => s?.scope === 'output' && s.handle === handle),
      (b) => showSettings.set(b ? { scope: 'output', handle } : undefined),
    )

    return { schema$, description$, displayDescription$, kind$, nullable$, showSettings$ }
  }

  private deriveAllHandleNames$(props: OutputSectionStoreProps): ReadonlyVal<HandleName[]> {
    return compute(
      (get) => {
        const a = get(props.outputHandleDefs)
          ?.filter(isHandleDef)
          ?.map((e) => e.handle)
        const b = get(props.additionalOutputDefs)?.map((e) => e.handle)
        return (a || []).concat(b || [])
      },
      { equal: arrayShallowEqual },
    )
  }

  private deriveAllGroupNames$(props: OutputSectionStoreProps): ReadonlyVal<readonly string[]> {
    return derive(props.outputHandleDefs, (defs) => defs?.filter(isGroupDef).map((e) => e.group) || [], {
      equal: arrayShallowEqual,
    })
  }

  private deriveConnectedHandles$(handleOutputsTo: ReadonlyVal<HandleName[] | undefined> | undefined): ReadonlyVal<ReadonlySet<HandleName>> {
    return handleOutputsTo
      ? derive(handleOutputsTo, (handles) => {
          if (!handles || handles.length === 0) return emptySet
          return new Set(handles)
        })
      : val(emptySet)
  }

  private deriveIsEmpty$(props: OutputSectionStoreProps): ReadonlyVal<boolean> {
    return compute((get) => {
      if (props.role === 'author') return false
      const additionalOutputs = get(props.additionalOutputs)
      if (props.role === 'user' && additionalOutputs && props.additionalOutputDefs) return false
      const additionalLength = additionalOutputs ? get(props.additionalOutputDefs)?.length : 0
      return !get(props.outputHandleDefs)?.length && !additionalLength
    })
  }
}

const emptySet = /*#__PURE__*/ new Set<any>()
