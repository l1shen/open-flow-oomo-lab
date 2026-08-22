// This section represents the output node handles inside a subflow.
// Its handles do not accept values and expose connections on the left.

import type { DisposableStore } from '@wopjs/disposable'
import type { AddEventListener } from '@wopjs/event'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../../localization/common/localization.ts'
import type { GroupDividerDef, HandleName, HandleOutputFrom, OutputHandleDef } from '../../../../../schema/index.ts'
import type { ConditionRowStore } from '../../conditionHandle/conditionRow.store.ts'
import type { Role } from '../../nodeHandle/widgetContext.ts'
import type { GroupedOutputHandleDef, HandleIndex } from '../constants.ts'
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
  toPlainObjectOfTrue,
  toUserTranslateKey,
  updatePartial,
} from '../../../base/trivial.ts'
import { getDefaultSchemaForNewHandle } from '../../../jsonSchema/preset.ts'
import { localize } from '../../designer/l10n.ts'
import { HandleRowStore } from '../../nodeHandle/handleRow.store.ts'
import { WidgetContext } from '../../nodeHandle/widgetContext.ts'
import { isGroupDef, isHandleDef, matchesIndex } from '../constants.ts'
import { cloneLocalesIfNeeded } from './cloneLocales.ts'
import { SUBFLOW_OUTPUT_SECTION_TYPE } from './constants.ts'
import { isConnected, parseFieldCollapsed } from './parse.ts'

export interface SubflowOutputSectionUIState {
  readonly collapsed: FieldCollapsed | undefined
  readonly groupCollapsed: Record<PropertyKey, true> | undefined
}

export type SubflowOutputSectionStore$$ = {
  readonly outputHandleDefs?: Val<GroupedOutputHandleDef[] | undefined>
  readonly handleOutputsFrom?: Val<readonly HandleOutputFrom[] | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
} & {
  readonly [K in keyof SubflowOutputSectionUIState]: Val<SubflowOutputSectionUIState[K]>
}

export type SubflowOutputSectionStore$ = {
  readonly outputHandleDefs: ReadonlyVal<GroupedOutputHandleDef[] | undefined>
  readonly handleOutputsFrom?: ReadonlyVal<readonly HandleOutputFrom[] | undefined>
  readonly handles: ReadonlyVal<(HandleRowStore | string)[]>
  readonly allHandleNames: ReadonlyVal<readonly HandleName[]>
  readonly allGroupNames: ReadonlyVal<readonly string[]>
  readonly connectedHandles: ReadonlyVal<ReadonlySet<HandleName>>
} & {
  readonly [K in keyof SubflowOutputSectionUIState]: ReadonlyVal<SubflowOutputSectionUIState[K]>
}

export type SubflowOutputSectionStoreProps = {
  readonly lang: ReadonlyVal<string>
  readonly userLocales?: LocaleTextStore
  readonly role: Role
  readonly outputHandleDefs: Val<(OutputHandleDef | GroupDividerDef)[] | undefined> | ReadonlyVal<(OutputHandleDef | GroupDividerDef)[] | undefined>
  readonly handleOutputsFrom?: Val<readonly HandleOutputFrom[] | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
  readonly initialUIState?: Record<PropertyKey, unknown>
  // Block and flow modes share this value.
  readonly groupCollapsed?: Val<Record<PropertyKey, true> | undefined>
  readonly createSchemaEditor: (dom: HTMLDivElement, schema$: Val<string> | ReadonlyVal<string>) => (() => void) | void
}

export class SubflowOutputSectionStore implements INodeSectionStore<SubflowOutputSectionUIState | undefined>, IHandleRowDragNDrop {
  public static is(store: INodeSectionStore): store is SubflowOutputSectionStore {
    return store.type === SUBFLOW_OUTPUT_SECTION_TYPE
  }

  public readonly type: SUBFLOW_OUTPUT_SECTION_TYPE = SUBFLOW_OUTPUT_SECTION_TYPE
  public readonly role: Role
  public readonly userLocales?: LocaleTextStore

  public readonly dispose: DisposableStore = disposableStore()
  public readonly onDidHandleIndexChange: AddEventListener<void> = this.dispose.add(event())
  public readonly onDidHandleRename: AddEventListener<[oldName: HandleName, newName: HandleName]> =
    this.dispose.add(event<[oldName: HandleName, newName: HandleName]>())
  public readonly onDidHandleDelete: AddEventListener<HandleName> = this.dispose.add(event<HandleName>())

  public readonly $: SubflowOutputSectionStore$
  public readonly $$: SubflowOutputSectionStore$$

  public readonly hasError$: ReadonlyVal<boolean>

  public readonly uiState$: ReadonlyVal<SubflowOutputSectionUIState | undefined>

  public constructor(props: SubflowOutputSectionStoreProps) {
    this.role = props.role
    this.userLocales = props.userLocales

    const collapsed = this.dispose.add(val(parseFieldCollapsed(props.initialUIState?.collapsed)))

    const groupCollapsed = this.dispose.add(props.groupCollapsed?.ref(true) ?? val(toPlainObjectOfTrue(props.initialUIState?.groupCollapsed)))

    this.uiState$ = this.dispose.add(
      combine([collapsed, groupCollapsed], ([nextCollapsed, nextGroupCollapsed]) =>
        toNonEmptyPlainObject({
          collapsed: toNonEmptyPlainObject(nextCollapsed) as FieldCollapsed | undefined,
          groupCollapsed: toPlainObjectOfTrue(nextGroupCollapsed),
        } satisfies SubflowOutputSectionUIState),
      ),
    )

    this.$$ = {
      collapsed,
      groupCollapsed,
      handleOutputsFrom: props.handleOutputsFrom && this.dispose.add(props.handleOutputsFrom.ref(true)),
      outputHandleDefs: isWritable(props.outputHandleDefs) ? this.dispose.add(props.outputHandleDefs.ref(true)) : undefined,
      showSettings: this.dispose.add(props.showSettings.ref(true)),
    }

    const connectedHandles = this.dispose.add(this.deriveConnectedHandles$(this.$$.handleOutputsFrom))
    this.$ = {
      collapsed,
      groupCollapsed,
      handleOutputsFrom: this.$$.handleOutputsFrom,
      outputHandleDefs: this.$$.outputHandleDefs || this.dispose.add(props.outputHandleDefs.ref()),
      handles: this.dispose.add(this.deriveHandles$(collapsed, props, connectedHandles)),
      allHandleNames: this.dispose.add(this.deriveAllHandleNames$(props)),
      allGroupNames: this.dispose.add(this.deriveAllGroupNames$(props)),
      connectedHandles,
    }

    this.hasError$ = this.dispose.add(compute((get) => get(this.$.handles).some((row) => HandleRowStore.is(row) && get(row.error$))))

    this.setupHandleIndexChangeEvent()
  }

  private setupHandleIndexChangeEvent(): void {
    const handleIndices = this.dispose.add(
      derive(this.$.outputHandleDefs, (defs) => defs?.map((d) => (isGroupDef(d) ? `g:${d.group}` : `h:${d.handle}`)), {
        equal: arrayShallowEqual,
      }),
    )
    this.dispose.add(handleIndices.reaction(send.bind(null, this.onDidHandleIndexChange)))
  }

  private findGroupForWriting(group: string): readonly [index: number, outputDefs$: Val<GroupedOutputHandleDef[] | undefined> | undefined] {
    const outputDefs$ = this.$$.outputHandleDefs
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
    return this.$$.outputHandleDefs
  }

  private findHandleForWriting(name: HandleName | HandleIndex): readonly [index: number, inputDefs$: Val<GroupedOutputHandleDef[] | undefined> | undefined] {
    const target: HandleIndex = typeof name === 'string' ? { handle: name } : name

    let index: number | undefined
    const outputDefs$ = this.getOutputHandleDefs$()
    index = outputDefs$?.value?.findIndex((def) => matchesIndex(def, target))
    if (index != null && index >= 0) return [index, outputDefs$]

    return [-1, outputDefs$]
  }

  public addNewHandle(): void {
    const outputDefs$ = this.getOutputHandleDefs$()
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
      const values = this.$$.handleOutputsFrom?.value
      if (values) {
        const connectionIndex = values.findIndex((e) => e.handle === name)
        if (connectionIndex >= 0) {
          this.$$.handleOutputsFrom?.set(values.toSpliced(connectionIndex, 1, { ...values[connectionIndex], handle: newName }))
        }
      }
      const showSettings = this.$$.showSettings.value
      if (showSettings?.scope === 'output' && showSettings.handle === name) {
        this.$$.showSettings.set({ scope: 'output', handle: newName })
      }
      outputDefs$.set(defs.toSpliced(index, 1, { ...defs[index], handle: newName }))
      send(this.onDidHandleRename, [name, newName])
    }
    return true
  }

  public deleteHandle(name: HandleName): void {
    const [index, outputDefs$] = this.findHandleForWriting(name)
    const defs = outputDefs$?.value
    if (defs && index >= 0) {
      const values = this.$$.handleOutputsFrom?.value
      if (values) {
        const connectionIndex = values.findIndex((e) => e.handle === name)
        if (connectionIndex >= 0) {
          this.$$.handleOutputsFrom?.set(values.toSpliced(connectionIndex, 1))
        }
      }
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

  /** @internal Returns the source row when a connection creates a handle. */
  public grabHandleRow(handle: HandleName): HandleRowStore | undefined {
    return this.$.handles.value.find((e): e is HandleRowStore => HandleRowStore.is(e) && e.name === handle)
  }

  /** @internal Inserts a connection-created handle below the target or at the end. */
  public dropHandleRow(handleIndex: HandleIndex | null | undefined, row: HandleRowStore | ConditionRowStore, insertBefore?: boolean): HandleName | undefined {
    const outputDefs$ = this.$$.outputHandleDefs
    if (outputDefs$) {
      const names = this.$.allHandleNames.value
      const newDef: OutputHandleDef = {
        handle: names.includes(row.name) ? (inferNewItemName('output', names) as HandleName) : row.name,
        json_schema: row.schema$?.value,
        kind: row.schemaKind$?.value,
        nullable: row.nullable$?.value,
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
    props: SubflowOutputSectionStoreProps,
    connectedHandles$: ReadonlyVal<ReadonlySet<HandleName>>,
  ): ReadonlyVal<(HandleRowStore | string)[]> {
    const indices$ = this.deriveHandleIndices$(props.outputHandleDefs)

    let oldHandles: HandleRowStore[] | undefined
    return compute<(HandleRowStore | string)[]>(
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

          const def$ = attachSetter(
            derive(
              props.outputHandleDefs,
              (defs: GroupedOutputHandleDef[] | undefined) => defs?.find((e) => e.handle === handle) as OutputHandleDef | undefined,
            ),
            (def) => {
              if (def && isWritable(props.outputHandleDefs)) {
                const defs: GroupedOutputHandleDef[] | undefined = props.outputHandleDefs.value
                if (defs) {
                  const definitionIndex = defs.findIndex((e) => e.handle === handle)
                  const newDefs = defs.slice()
                  newDefs[definitionIndex >= 0 ? definitionIndex : defs.length] = def
                  props.outputHandleDefs.set(newDefs)
                } else {
                  props.outputHandleDefs.set([def])
                }
              }
            },
          )

          const description$ = attachSetter(
            derive(def$, (d) => d?.description),
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
            derive(props.showSettings, (s) => s?.handle === handle),
            (b) => props.showSettings.set(b ? { scope: 'value', handle } : undefined),
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
              handlePosition: 'in',
              enableAny: true,
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

          row.dispose.add([schema$, reference$, nullable$, showSettings$, schemaOverrides$, collapsed$])

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
  }

  private deriveAllHandleNames$(props: SubflowOutputSectionStoreProps): ReadonlyVal<HandleName[]> {
    return derive(props.outputHandleDefs, (defs) => defs?.filter(isHandleDef)?.map((e) => e.handle) || [], {
      equal: arrayShallowEqual,
    })
  }

  private deriveAllGroupNames$(props: SubflowOutputSectionStoreProps): ReadonlyVal<readonly string[]> {
    return derive(props.outputHandleDefs, (defs) => defs?.filter(isGroupDef).map((e) => e.group) || [], {
      equal: arrayShallowEqual,
    })
  }

  private deriveConnectedHandles$(handleOutputsfrom: ReadonlyVal<readonly HandleOutputFrom[] | undefined> | undefined): ReadonlyVal<ReadonlySet<HandleName>> {
    return handleOutputsfrom
      ? derive(handleOutputsfrom, (handles) => {
          if (!handles || handles.length === 0) return emptySet
          return handles.reduce((result, handle) => {
            if (isConnected(handle)) {
              result.add(handle.handle)
            }
            return result
          }, new Set<HandleName>())
        })
      : val(emptySet)
  }
}

const emptySet = /*#__PURE__*/ new Set<any>()
