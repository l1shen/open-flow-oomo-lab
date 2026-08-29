import type { DisposableStore } from '@wopjs/disposable'
import type { AddEventListener } from '@wopjs/event'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../../localization/common/localization.ts'
import type { GroupDividerDef, HandleName, InputHandleDef } from '../../../../../schema/index.ts'
import type { ConditionRowStore } from '../../conditionHandle/conditionRow.store.ts'
import type { OverrideSchema, Role } from '../../nodeHandle/widgetContext.ts'
import type { GroupedInputHandleDef, HandleIndex, HandleInputFrom } from '../constants.ts'
import type { NodeShowSettings } from '../node.store.ts'
import type { IHandleRowDragNDrop, INodeSectionStore } from './interface.ts'
import type { FieldCollapsed, FieldHeight } from './parse.ts'

import { isDefined } from '@wopjs/cast'
import { disposableStore } from '@wopjs/disposable'
import { event, send } from '@wopjs/event'
import { arrayShallowEqual, attachSetter, combine, compute, derive, isWritable, val } from 'value-enhancer'
import {
  arrayFindIndexOrLength,
  asTrue,
  equalConfig,
  filterMap,
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
import { llmInputWidget } from '../../../llm/widget.ts'
import { localize } from '../../designer/l10n.ts'
import { FieldPath } from '../../nodeHandle/fieldPath.ts'
import { HandleRowStore } from '../../nodeHandle/handleRow.store.ts'
import { WidgetContext } from '../../nodeHandle/widgetContext.ts'
import { isGroupDef, isHandleDef, matchesIndex } from '../constants.ts'
import { cloneLocalesIfNeeded } from './cloneLocales.ts'
import { INPUT_SECTION_TYPE } from './constants.ts'
import { isConnected, parseFieldCollapsed, parseFieldHeight } from './parse.ts'

export interface InputSectionUIState {
  /** Field collapsed */
  readonly collapsed: FieldCollapsed | undefined
  /** Text widget height */
  readonly height: FieldHeight | undefined
  /** Group collapsed */
  readonly groupCollapsed: Record<PropertyKey, true> | undefined
}

export type InputSectionStore$$ = {
  // The block designer edits values in the definitions.
  readonly handleInputsFrom?: Val<readonly HandleInputFrom[] | undefined>
  // Definitions are read-only in user mode.
  readonly inputHandleDefs?: Val<GroupedInputHandleDef[] | undefined>
  readonly additionalInputDefs?: Val<InputHandleDef[] | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
} & {
  readonly [K in keyof InputSectionUIState]: Val<InputSectionUIState[K]>
}

export type InputSectionStore$ = {
  // The block designer edits values in the definitions.
  readonly handleInputsFrom?: ReadonlyVal<readonly HandleInputFrom[] | undefined>
  readonly inputHandleDefs: ReadonlyVal<GroupedInputHandleDef[] | undefined>
  readonly additionalInputs?: ReadonlyVal<boolean | InputHandleDef | undefined>
  readonly additionalInputDefs?: ReadonlyVal<InputHandleDef[] | undefined>
  // Strings represent group dividers.
  readonly handles: ReadonlyVal<(HandleRowStore | string)[]>
  readonly productHandles: ReadonlyVal<HandleRowStore[]>
  readonly allHandleNames: ReadonlyVal<readonly HandleName[]>
  readonly allGroupNames: ReadonlyVal<readonly string[]>
  readonly connectedHandles: ReadonlyVal<ReadonlySet<HandleName>>
  // This is empty when no handle exists and the user cannot add one.
  readonly isEmpty: ReadonlyVal<boolean>
} & {
  readonly [K in keyof InputSectionUIState]: ReadonlyVal<InputSectionUIState[K]>
}

export type InputSectionStoreProps = {
  readonly lang: ReadonlyVal<string>
  readonly userLocales?: LocaleTextStore
  readonly role: Role
  // Authors edit values in the definitions inside the block designer.
  readonly handleInputsFrom?: Val<readonly HandleInputFrom[] | undefined>
  readonly inputHandleDefs: Val<(InputHandleDef | GroupDividerDef)[] | undefined> | ReadonlyVal<(InputHandleDef | GroupDividerDef)[] | undefined>
  readonly additionalInputs?: ReadonlyVal<boolean | InputHandleDef | undefined>
  readonly additionalInputDefs?: Val<InputHandleDef[] | undefined>
  readonly boundHandles?: ReadonlyVal<ReadonlySet<HandleName>>
  // Undefined means that no settings panel is open.
  readonly showSettings: Val<NodeShowSettings | undefined>
  readonly initialUIState?: Record<PropertyKey, unknown>
  readonly createSchemaEditor: (dom: HTMLDivElement, schema$: Val<string> | ReadonlyVal<string>) => (() => void) | void
}

export class InputSectionStore implements INodeSectionStore<InputSectionUIState | undefined>, IHandleRowDragNDrop {
  public static readonly TYPE: INPUT_SECTION_TYPE = INPUT_SECTION_TYPE

  public static is(store: INodeSectionStore): store is InputSectionStore {
    return store.type === INPUT_SECTION_TYPE
  }

  public readonly type: INPUT_SECTION_TYPE = INPUT_SECTION_TYPE
  public readonly role: Role
  public readonly userLocales?: LocaleTextStore

  public readonly dispose: DisposableStore = disposableStore()
  public readonly onDidHandleIndexChange: AddEventListener<void> = this.dispose.add(event())
  public readonly onDidHandleRename: AddEventListener<[oldName: HandleName, newName: HandleName]> =
    this.dispose.add(event<[oldName: HandleName, newName: HandleName]>())
  public readonly onDidHandleDelete: AddEventListener<HandleName> = this.dispose.add(event<HandleName>())

  public readonly $: InputSectionStore$
  public readonly $$: InputSectionStore$$

  public readonly hasError$: ReadonlyVal<boolean>

  public readonly uiState$: ReadonlyVal<InputSectionUIState | undefined>

  public constructor(props: InputSectionStoreProps) {
    this.role = props.role
    this.userLocales = props.userLocales

    const collapsed = this.dispose.add(val(parseFieldCollapsed(props.initialUIState?.collapsed)))

    const height = this.dispose.add(val(parseFieldHeight(props.initialUIState?.height)))

    const groupCollapsed = this.dispose.add(val(toPlainObjectOfTrue(props.initialUIState?.groupCollapsed)))

    this.uiState$ = this.dispose.add(
      combine([collapsed, height, groupCollapsed], ([nextCollapsed, nextHeight, nextGroupCollapsed]) =>
        toNonEmptyPlainObject({
          collapsed: toNonEmptyPlainObject(nextCollapsed) as FieldCollapsed | undefined,
          height: toNonEmptyPlainObject(nextHeight) as FieldHeight | undefined,
          groupCollapsed: toPlainObjectOfTrue(nextGroupCollapsed),
        } satisfies InputSectionUIState),
      ),
    )

    this.$$ = {
      collapsed,
      height,
      groupCollapsed,
      handleInputsFrom: props.handleInputsFrom && this.dispose.add(props.handleInputsFrom.ref(true)),
      inputHandleDefs: isWritable(props.inputHandleDefs) ? this.dispose.add(props.inputHandleDefs.ref(true)) : undefined,
      additionalInputDefs: props.additionalInputDefs && this.dispose.add(props.additionalInputDefs.ref(true)),
      showSettings: this.dispose.add(props.showSettings.ref(true)),
    }

    const connectedHandles = this.dispose.add(this.deriveConnectedHandles$(this.$$.handleInputsFrom))
    const allHandles = this.dispose.add(this.deriveHandles$(collapsed, height, props, connectedHandles))
    const handles = this.dispose.add(
      compute((get) => get(allHandles).filter((row) => !HandleRowStore.is(row) || llmInputWidget(get(row.schema$)) == null), {
        equal: arrayShallowEqual,
      }),
    )
    const productHandles = this.dispose.add(
      compute((get) => get(allHandles).filter((row): row is HandleRowStore => HandleRowStore.is(row) && llmInputWidget(get(row.schema$)) != null), {
        equal: arrayShallowEqual,
      }),
    )
    this.$ = {
      collapsed,
      height,
      groupCollapsed,
      handleInputsFrom: this.$$.handleInputsFrom,
      inputHandleDefs: this.$$.inputHandleDefs || this.dispose.add(props.inputHandleDefs.ref()),
      additionalInputs: props.additionalInputs && this.dispose.add(props.additionalInputs.ref()),
      additionalInputDefs: this.$$.additionalInputDefs,
      handles,
      productHandles,
      allHandleNames: this.dispose.add(this.deriveAllHandleNames$(props)),
      allGroupNames: this.dispose.add(this.deriveAllGroupNames$(props)),
      isEmpty: this.dispose.add(this.deriveIsEmpty$(props)),
      connectedHandles,
    }

    this.hasError$ = this.dispose.add(compute((get) => get(allHandles).some((row) => HandleRowStore.is(row) && get(row.error$))))

    this.setupHandleIndexChangeEvent()
  }

  private setupHandleIndexChangeEvent(): void {
    const handleIndices = this.dispose.add(
      compute(
        (get) => {
          const a = get(this.$.inputHandleDefs)?.map((d) => (isGroupDef(d) ? `g:${d.group}` : `h:${d.handle}`))
          const b = get(this.$.additionalInputDefs)?.map((d) => `h:${d.handle}`)
          return (a && b ? [...a, ...b] : a || b) ?? []
        },
        { equal: arrayShallowEqual },
      ),
    )
    this.dispose.add(handleIndices.reaction(send.bind(null, this.onDidHandleIndexChange)))
  }

  /** Provides writable definitions for group editing operations. */
  private findGroupForWriting(group: string): readonly [index: number, inputDefs$: Val<GroupedInputHandleDef[] | undefined> | undefined] {
    const inputDefs$ = this.getInputHandleDefs$()
    const defs = inputDefs$?.value
    if (defs) {
      const index = defs.findIndex((def) => isGroupDef(def) && def.group === group)
      return [index, inputDefs$]
    }
    return [-1, inputDefs$]
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
    return this.getInputHandleDefs$() != null
  }

  /**
   * The author role determines whether input definitions are writable.
   */
  private getInputHandleDefs$(): Val<GroupedInputHandleDef[] | undefined> | undefined {
    return toTrue(this.role === 'author') && this.$$.inputHandleDefs
  }

  /**
   * The additionalInputs capability determines whether additional definitions are writable.
   */
  private getAdditionalInputDefs$(): Val<GroupedInputHandleDef[] | undefined> | undefined {
    return this.$.additionalInputs?.value ? (this.$$.additionalInputDefs as any) : void 0
  }

  /**
   * Provides writable definitions for rename, delete, and move operations.
   */
  private findHandleForWriting(
    name: HandleName | HandleIndex,
  ): readonly [index: number, inputDefs$: Val<GroupedInputHandleDef[] | undefined> | undefined, fromAdditional: boolean] {
    const target: HandleIndex = typeof name === 'string' ? { handle: name } : name

    let index: number | undefined
    const inputDefs$ = this.getInputHandleDefs$()
    index = inputDefs$?.value?.findIndex((def) => matchesIndex(def, target))
    if (index != null && index >= 0) return [index, inputDefs$, false]

    const additionalInputDefs$ = this.getAdditionalInputDefs$()
    index = additionalInputDefs$?.value?.findIndex((def) => matchesIndex(def, target))
    if (index != null && index >= 0) return [index, additionalInputDefs$, true]

    if (additionalInputDefs$) {
      return [-1, additionalInputDefs$, true]
    } else {
      return [-1, inputDefs$, false]
    }
  }

  public addNewHandle(forceAdditional = false): void {
    const inputDefs$ = forceAdditional ? this.getAdditionalInputDefs$() : this.getInputHandleDefs$() || this.getAdditionalInputDefs$()
    if (inputDefs$) {
      const names = this.$.allHandleNames.value
      const defs = inputDefs$.value
      const newDef: InputHandleDef = {
        handle: inferNewItemName('input', names) as HandleName,
        json_schema: getDefaultSchemaForNewHandle(defs),
      }
      inputDefs$.set(defs ? defs.toSpliced(arrayFindIndexOrLength(defs, isGroupDef), 0, newDef) : [newDef])
    }
  }

  public renameHandle(name: HandleName, newName: HandleName): boolean {
    if (this.$.allHandleNames.value.includes(newName)) {
      return false
    }
    const [index, inputDefs$] = this.findHandleForWriting(name)
    const defs = inputDefs$?.value
    if (defs && index >= 0) {
      const values = this.$$.handleInputsFrom?.value
      if (values) {
        const connectionIndex = values.findIndex((e) => e.handle === name)
        if (connectionIndex >= 0) {
          this.$$.handleInputsFrom.set(values.toSpliced(connectionIndex, 1, { ...values[connectionIndex], handle: newName }))
        }
      }
      const showSettings = this.$$.showSettings.value
      if (showSettings?.scope === 'input' && showSettings.handle === name) {
        this.$$.showSettings.set({ scope: 'input', handle: newName })
      }
      // Update connections before definitions because the connection list is filtered by the definitions.
      inputDefs$.set(defs.toSpliced(index, 1, { ...defs[index], handle: newName }))
      send(this.onDidHandleRename, [name, newName])
    }
    return true
  }

  public deleteHandle(name: HandleName): void {
    const [index, inputDefs$] = this.findHandleForWriting(name)
    const defs = inputDefs$?.value
    if (defs && index >= 0) {
      const values = this.$$.handleInputsFrom?.value
      if (values) {
        const connectionIndex = values.findIndex((e) => e.handle === name)
        if (connectionIndex >= 0) {
          this.$$.handleInputsFrom.set(values.toSpliced(connectionIndex, 1))
        }
      }
      this.$$.showSettings.set(void 0)
      inputDefs$.set(defs.toSpliced(index, 1))
      send(this.onDidHandleDelete, name)
    }
  }

  public moveHandle(index: HandleIndex, newIndex: number): void {
    const [oldIndex, inputDefs$] = this.findHandleForWriting(index)
    const defs = inputDefs$?.value
    if (defs && oldIndex >= 0) {
      const moving = defs[oldIndex]
      if (isHandleDef(moving) && llmInputWidget(moving.json_schema) != null) {
        const ordinary = defs.filter((def) => !isHandleDef(def) || llmInputWidget(def.json_schema) == null)
        const product = defs.filter((def): def is InputHandleDef => isHandleDef(def) && llmInputWidget(def.json_schema) != null)
        const productIndex = product.findIndex((def) => def.handle == moving.handle)
        if (productIndex >= 0) {
          const spliced = product.splice(productIndex, 1)
          product.splice(newIndex, 0, ...spliced)
          inputDefs$.set(ordinary.concat(product))
        }
      } else {
        const newDefs = defs.slice()
        const spliced = newDefs.splice(oldIndex, 1)
        newDefs.splice(newIndex, 0, ...spliced)
        inputDefs$.set(newDefs)
      }
    }
  }

  /** @internal Assigns the handle type for a connection-created inline task. */
  public assignHandleDef(handle: HandleName, def: InputHandleDef): void {
    const defs = this.$$.inputHandleDefs?.value
    if (defs) {
      const index = defs.findIndex((d) => d.handle === handle)
      if (index >= 0) {
        const oldDef = defs[index] as InputHandleDef
        const newDef: InputHandleDef = {
          ...oldDef,
          description: toNotUserTranslateKey(def.description),
          json_schema: def.json_schema,
          kind: def.kind,
          nullable: def.nullable,
        }
        this.$$.inputHandleDefs.set(defs.toSpliced(index, 1, newDef))
      } else {
        this.$$.inputHandleDefs.set([...defs, def])
      }
    }
  }

  /** @internal Returns the source row when a connection creates a handle. */
  public grabHandleRow(handle: HandleName): HandleRowStore | undefined {
    return (
      this.$.handles.value.find((e): e is HandleRowStore => HandleRowStore.is(e) && e.name === handle) ??
      this.$.productHandles.value.find((e) => e.name === handle)
    )
  }

  /** @internal Inserts a connection-created handle below the target, group, or at the end. */
  public dropHandleRow(handleIndex: HandleIndex | null | undefined, row: HandleRowStore | ConditionRowStore, insertBefore?: boolean): HandleName | undefined {
    const inputDefs$ = this.getInputHandleDefs$() || this.getAdditionalInputDefs$()
    if (inputDefs$) {
      const names = this.$.allHandleNames.value
      const newDef: InputHandleDef = {
        handle: names.includes(row.name) ? (inferNewItemName('input', names) as HandleName) : row.name,
        json_schema: row.schema$?.value,
        kind: row.schemaKind$?.value,
        nullable: row.nullable$?.value,
        description: cloneLocalesIfNeeded(row.description$.value, row.context.userLocales, this.userLocales),
        value: row.value$?.value,
      }
      if (isDefined(newDef.value) && this.$$.handleInputsFrom) {
        const values = this.$$.handleInputsFrom.value
        if (values) {
          this.$$.handleInputsFrom.set([...values, { handle: newDef.handle, value: newDef.value }])
        } else {
          this.$$.handleInputsFrom.set([{ handle: newDef.handle, value: newDef.value }])
        }
        newDef.value = undefined
      }
      const defs = inputDefs$.value
      if (defs) {
        const index = handleIndex ? defs.findIndex((d) => matchesIndex(d, handleIndex)) : -1
        if (index >= 0) {
          inputDefs$.set(defs.toSpliced(index + 1, 0, newDef))
        } else {
          inputDefs$.set(insertBefore ? [newDef, ...defs] : [...defs, newDef])
        }
      } else {
        inputDefs$.set([newDef])
      }
      return newDef.handle
    }
  }

  private deriveHandleIndices$(
    inputHandleDefs: ReadonlyVal<GroupedInputHandleDef[] | undefined> | undefined,
  ): ReadonlyVal<readonly HandleIndex[] | undefined> | undefined {
    if (inputHandleDefs) {
      return derive(inputHandleDefs, (defs) => defs && filterMap(defs, (d) => (isGroupDef(d) ? { group: d.group } : { handle: d.handle })), equalConfig)
    }
  }

  private deriveHandles$(
    collapsed: Val<FieldCollapsed | undefined>,
    height: Val<FieldHeight | undefined>,
    props: InputSectionStoreProps,
    connectedHandles$: ReadonlyVal<ReadonlySet<HandleName>>,
  ): ReadonlyVal<(HandleRowStore | string)[]> {
    const indices$ = this.deriveHandleIndices$(props.inputHandleDefs)
    const boundHandles = props.boundHandles

    let oldHandles: HandleRowStore[] | undefined
    const inputHandleRows$ = compute<(HandleRowStore | string)[]>(
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

          const reference$ = boundHandles
            ? compute((read) => read(connectedHandles$).has(handle) || read(boundHandles).has(handle))
            : derive(connectedHandles$, (set) => set.has(handle))

          const { schema$, defaultValue$, description$, displayDescription$, kind$, nullable$, showSettings$, schemaOverrides$, value$ } =
            this.deriveHandleRowVals$(props, props.inputHandleDefs, handle, props.role, reference$)

          const collapsed$ = attachSetter(
            derive(collapsed, (c) => c?.[handle], equalConfig),
            setPartial(collapsed, handle),
          )

          const height$ = attachSetter(
            derive(height, (h) => h?.[handle], equalConfig),
            setPartial(height, handle),
          )

          const context = new WidgetContext(
            {
              role: props.role,
              inout: 'in',
              userLocales: props.userLocales,
            },
            schema$,
            schemaOverrides$,
            defaultValue$,
            collapsed$,
            height$,
            props.createSchemaEditor,
          )

          const row = new HandleRowStore(handle, description$, displayDescription$, props.lang, kind$, reference$, nullable$, showSettings$, context, value$)

          const clearErrorOnConnected = reference$.subscribe((connected) => {
            if (connected) {
              row.error$.set(void 0)
            } else {
              row.validate(true)
            }
          })

          row.dispose.add([clearErrorOnConnected, schema$, reference$, nullable$, showSettings$, schemaOverrides$, collapsed$, value$])

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

    const additionalIndices$ = this.deriveHandleIndices$(props.additionalInputDefs)

    let oldAdditionalRows: HandleRowStore[] | undefined
    const additionalHandleRows$ = compute<HandleRowStore[]>(
      (get) => {
        const rows: HandleRowStore[] = []
        if (!get(props.additionalInputs) || !props.additionalInputDefs) return rows

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
          const reference$ = boundHandles
            ? compute((read) => read(connectedHandles$).has(handle) || read(boundHandles).has(handle))
            : derive(connectedHandles$, (set) => set.has(handle))

          const { schema$, defaultValue$, description$, displayDescription$, kind$, nullable$, showSettings$, schemaOverrides$, value$ } =
            this.deriveHandleRowVals$(props, props.additionalInputDefs, handle, role, reference$)

          const collapsed$ = attachSetter(
            derive(collapsed, (c) => c?.[handle], equalConfig),
            setPartial(collapsed, handle),
          )

          const height$ = attachSetter(
            derive(height, (h) => h?.[handle], equalConfig),
            setPartial(height, handle),
          )

          const context = new WidgetContext(
            {
              role,
              inout: 'in',
              additional: true,
              restrict: props.additionalInputs,
              userLocales: props.userLocales,
            },
            schema$,
            schemaOverrides$,
            defaultValue$,
            collapsed$,
            height$,
            props.createSchemaEditor,
          )

          const row = new HandleRowStore(handle, description$, displayDescription$, props.lang, kind$, reference$, nullable$, showSettings$, context, value$)

          const clearErrorOnConnected = reference$.subscribe((connected) => {
            if (connected) {
              row.error$.set(void 0)
            } else {
              row.validate(true)
            }
          })

          row.dispose.add([clearErrorOnConnected, schema$, reference$, nullable$, showSettings$, schemaOverrides$, collapsed$, value$])

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

    return combine([inputHandleRows$, additionalHandleRows$], ([input, additional]) => input.concat(additional))
  }

  private deriveHandleRowVals$(
    { showSettings, handleInputsFrom, lang, userLocales }: InputSectionStoreProps,
    inputDefs$: Val<GroupedInputHandleDef[] | undefined> | ReadonlyVal<GroupedInputHandleDef[] | undefined>,
    handle: HandleName,
    role: Role,
    reference$: ReadonlyVal<boolean>,
  ) {
    const def$ = attachSetter(
      derive(inputDefs$, (defs) => defs?.find((e) => e.handle === handle) as InputHandleDef | undefined),
      (def) => {
        if (def && isWritable(inputDefs$)) {
          const defs = inputDefs$.value
          if (defs) {
            const index = defs.findIndex((d) => d.handle === handle)
            const newDefs = defs.slice()
            newDefs[index >= 0 ? index : defs.length] = def
            inputDefs$.set(newDefs)
          } else {
            inputDefs$.set([def])
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
    const defaultValue$ = role === 'user' ? derive(def$, (d) => d?.value) : val()
    const showSettings$ = attachSetter(
      derive(showSettings, (s) => s?.scope === 'input' && s.handle === handle),
      (b) => showSettings.set(b ? { scope: 'input', handle } : undefined),
    )

    let schemaOverrides$: Val<OverrideSchema[] | undefined>
    if (handleInputsFrom) {
      schemaOverrides$ = attachSetter(
        derive(
          handleInputsFrom,
          (f) => f?.find((e) => e.handle === handle)?.schema_overrides?.map<OverrideSchema>((e) => Object.assign({}, e, { path: FieldPath.get(e.path) })),
          equalConfig,
        ),
        (value) => {
          const schema_overrides = value?.map((e) => ({ ...e, path: e.path.toJSON() }))
          if (handleInputsFrom.value) {
            const target = handleInputsFrom.value.slice()
            const index = target.findIndex((e) => e.handle === handle)
            target[index >= 0 ? index : target.length] = { ...target[index], handle, schema_overrides }
            handleInputsFrom.set(target)
          } else {
            handleInputsFrom.set([{ handle, schema_overrides }])
          }
        },
      )
    } else {
      schemaOverrides$ = attachSetter(
        derive(def$, (d) => d?.schema_overrides?.map((e) => ({ ...e, path: FieldPath.get(e.path) }))),
        (value) => {
          if (def$.value) {
            const schema_overrides = value?.map((e) => ({ ...e, path: e.path.toJSON() }))
            def$.set({ ...def$.value, schema_overrides })
          }
        },
      )
    }

    let value$: Val<unknown>
    if (handleInputsFrom) {
      value$ = attachSetter(
        derive(handleInputsFrom, (f) => f?.find((e) => e.handle === handle)?.value, equalConfig),
        (value) => {
          if (!def$.value || reference$.value) return
          const current = handleInputsFrom.value
          if (current) {
            const result = current.findIndex((e) => e.handle === handle)
            const index = result >= 0 ? result : current.length
            if (current[index]?.value !== value) {
              handleInputsFrom.set(current.toSpliced(index, 1, { ...current[index], handle, value }))
            }
          } else if (isDefined(value)) {
            handleInputsFrom.set([{ handle, value }])
          }
        },
      )
    } else {
      value$ = attachSetter(
        derive(def$, (d) => d?.value, equalConfig),
        updatePartial(def$, 'value'),
      )
    }

    return {
      schema$,
      defaultValue$,
      description$,
      displayDescription$,
      kind$,
      nullable$,
      showSettings$,
      schemaOverrides$,
      value$,
    }
  }

  private deriveAllHandleNames$(props: InputSectionStoreProps): ReadonlyVal<HandleName[]> {
    return compute(
      (get) => {
        const a = get(props.inputHandleDefs)
          ?.filter(isHandleDef)
          .map((e) => e.handle)
        const b = get(props.additionalInputDefs)?.map((e) => e.handle)
        return (a || []).concat(b || [])
      },
      { equal: arrayShallowEqual },
    )
  }

  private deriveAllGroupNames$(props: InputSectionStoreProps): ReadonlyVal<string[]> {
    return derive(props.inputHandleDefs, (defs) => defs?.filter(isGroupDef).map((e) => e.group) || [], {
      equal: arrayShallowEqual,
    })
  }

  private deriveConnectedHandles$(handleInputsFrom: InputSectionStore$['handleInputsFrom']): ReadonlyVal<ReadonlySet<HandleName>> {
    return handleInputsFrom
      ? derive(handleInputsFrom, (handles) => {
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

  private deriveIsEmpty$(props: InputSectionStoreProps): ReadonlyVal<boolean> {
    return compute((get) => {
      if (props.role === 'author') return false
      const additionalInputs = get(props.additionalInputs)
      if (props.role === 'user' && additionalInputs && props.additionalInputDefs) return false
      const additionalLength = additionalInputs ? get(props.additionalInputDefs)?.length : 0
      return !get(props.inputHandleDefs)?.length && !additionalLength
    })
  }
}

const emptySet = /*#__PURE__*/ new Set<any>()
