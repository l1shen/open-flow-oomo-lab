import type { DisposableStore } from '@wopjs/disposable'
import type { AddEventListener } from '@wopjs/event'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../../localization/common/localization.ts'
import type { HandleName, InputHandleDef, ValueHandleDef } from '../../../../../schema/index.ts'
import type { Role } from '../../nodeHandle/widgetContext.ts'
import type { HandleIndex } from '../constants.ts'
// Value nodes follow the same handle model as inline task inputs.
import type { NodeShowSettings } from '../node.store.ts'
import type { IHandleRowDragNDrop, INodeSectionStore } from './interface.ts'
import type { FieldCollapsed, FieldHeight } from './parse.ts'

import { isDefined } from '@wopjs/cast'
import { disposableStore } from '@wopjs/disposable'
import { event, send } from '@wopjs/event'
import { arrayShallowEqual, attachSetter, combine, compute, derive, isWritable, val } from 'value-enhancer'
import {
  asTrue,
  equalConfig,
  inferNewItemName,
  setPartial,
  toNonEmptyPlainObject,
  toNotUserTranslateKey,
  toUserTranslateKey,
  updatePartial,
} from '../../../base/trivial.ts'
import { getDefaultSchemaForNewHandle, isPrimitive, typeOfSchema } from '../../../jsonSchema/preset.ts'
import { localize } from '../../designer/l10n.ts'
import { HandleRowStore } from '../../nodeHandle/handleRow.store.ts'
import { WidgetContext } from '../../nodeHandle/widgetContext.ts'
import { matchesIndex } from '../constants.ts'
import { cloneLocalesIfNeeded } from './cloneLocales.ts'
import { VALUE_SECTION_TYPE } from './constants.ts'
import { parseFieldCollapsed, parseFieldHeight } from './parse.ts'

export interface ValueSectionUIState {
  readonly collapsed: FieldCollapsed | undefined
  readonly height: FieldHeight | undefined
}

export type ValueSectionStore$$ = {
  readonly valueHandleDefs?: Val<readonly ValueHandleDef[] | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
} & {
  readonly [K in keyof ValueSectionUIState]: Val<ValueSectionUIState[K]>
}

export type ValueSectionStore$ = {
  readonly valueHandleDefs: ReadonlyVal<readonly ValueHandleDef[] | undefined>
  readonly handles: ReadonlyVal<HandleRowStore[]>
  readonly allHandleNames: ReadonlyVal<readonly HandleName[]>
} & {
  readonly [K in keyof ValueSectionUIState]: ReadonlyVal<ValueSectionUIState[K]>
}

export type ValueSectionStoreProps = {
  readonly lang: ReadonlyVal<string>
  readonly userLocales?: LocaleTextStore
  readonly role: Role
  readonly handleOutputsTo?: ReadonlyVal<HandleName[] | undefined>
  readonly valueHandleDefs: Val<readonly ValueHandleDef[] | undefined> | ReadonlyVal<readonly ValueHandleDef[] | undefined>
  readonly showSettings: Val<NodeShowSettings | undefined>
  readonly initialUIState?: Record<PropertyKey, unknown>
  readonly createSchemaEditor: (dom: HTMLDivElement, schema$: Val<string> | ReadonlyVal<string>) => (() => void) | void
}

export class ValueSectionStore implements INodeSectionStore<ValueSectionUIState | undefined>, IHandleRowDragNDrop {
  public static readonly TYPE: VALUE_SECTION_TYPE = VALUE_SECTION_TYPE

  public static is(store: INodeSectionStore): store is ValueSectionStore {
    return store.type === VALUE_SECTION_TYPE
  }

  public readonly type: VALUE_SECTION_TYPE = VALUE_SECTION_TYPE
  public readonly role: Role
  public readonly userLocales?: LocaleTextStore

  public readonly dispose: DisposableStore = disposableStore()
  public readonly onDidHandleNameChange: AddEventListener<void> = this.dispose.add(event())
  public readonly onDidHandleRename: AddEventListener<[oldName: HandleName, newName: HandleName]> =
    this.dispose.add(event<[oldName: HandleName, newName: HandleName]>())
  public readonly onDidHandleDelete: AddEventListener<HandleName> = this.dispose.add(event<HandleName>())

  public readonly $: ValueSectionStore$
  public readonly $$: ValueSectionStore$$

  public readonly hasError$: ReadonlyVal<boolean>

  public readonly uiState$: ReadonlyVal<ValueSectionUIState | undefined>

  public constructor(props: ValueSectionStoreProps) {
    this.role = props.role
    this.userLocales = props.userLocales

    const collapsed = this.dispose.add(val(parseFieldCollapsed(props.initialUIState?.collapsed)))

    const height = this.dispose.add(val(parseFieldHeight(props.initialUIState?.height)))

    this.uiState$ = this.dispose.add(
      combine([collapsed, height], ([nextCollapsed, nextHeight]) =>
        toNonEmptyPlainObject({
          collapsed: toNonEmptyPlainObject(nextCollapsed) as FieldCollapsed | undefined,
          height: toNonEmptyPlainObject(nextHeight) as FieldHeight | undefined,
        } satisfies ValueSectionUIState),
      ),
    )

    this.$$ = {
      collapsed,
      height,
      valueHandleDefs: isWritable(props.valueHandleDefs) ? this.dispose.add(props.valueHandleDefs.ref(true)) : undefined,
      showSettings: this.dispose.add(props.showSettings.ref(true)),
    }

    const allHandleNames$: ReadonlyVal<HandleName[]> = this.dispose.add(
      derive(props.valueHandleDefs, (defs) => defs?.map((def) => def.handle) ?? [], {
        equal: arrayShallowEqual,
      }),
    )
    const connectedHandles = this.dispose.add(this.deriveConnectedHandles$(props.handleOutputsTo))
    this.$ = {
      collapsed,
      height,
      valueHandleDefs: this.$$.valueHandleDefs || this.dispose.add(props.valueHandleDefs.ref()),
      handles: this.dispose.add(this.deriveHandles$(collapsed, height, props, allHandleNames$, connectedHandles)),
      allHandleNames: allHandleNames$,
    }

    this.hasError$ = this.dispose.add(compute((get) => get(this.$.handles).some((row) => get(row.error$))))

    this.dispose.add(this.$.allHandleNames.reaction(send.bind(null, this.onDidHandleNameChange)))
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

  public addNewHandle(): void {
    if (this.$$.valueHandleDefs) {
      const names = this.$.handles.value.map((e) => e.name)
      const defs = this.$$.valueHandleDefs.value
      const newDef: ValueHandleDef = {
        handle: inferNewItemName('value', names) as HandleName,
        json_schema: getDefaultSchemaForNewHandle(defs),
      }
      this.$$.valueHandleDefs.set(defs ? [...defs, newDef] : [newDef])
    }
  }

  /** @internal */
  public addNewHandleFromInputDef(def: InputHandleDef, value: unknown): void {
    if (this.$$.valueHandleDefs) {
      const names = this.$.handles.value.map((e) => e.name)
      const newDef: ValueHandleDef = {
        handle: names.includes(def.handle) ? (inferNewItemName('value', names) as HandleName) : def.handle,
        json_schema: isPrimitive(typeOfSchema(def.json_schema)) ? def.json_schema : getDefaultSchemaForNewHandle(),
        value: isDefined(value) ? value : def.value,
        kind: def.kind,
        description: toNotUserTranslateKey(def.description),
        nullable: def.nullable,
      }
      const defs = this.$$.valueHandleDefs.value
      this.$$.valueHandleDefs.set(defs ? [...defs, newDef] : [newDef])
    }
  }

  public renameHandle(name: HandleName, newName: HandleName): boolean {
    const defs = this.$$.valueHandleDefs?.value
    if (defs) {
      if (defs.some((def) => def.handle === newName)) {
        return false
      }
      const index = defs.findIndex((def) => def.handle === name)
      if (index >= 0) {
        const showSettings = this.$$.showSettings.value
        if (showSettings?.scope === 'value' && showSettings.handle === name) {
          this.$$.showSettings.set({ scope: 'value', handle: newName })
        }
        this.$$.valueHandleDefs.set(defs.toSpliced(index, 1, { ...defs[index], handle: newName }))
        send(this.onDidHandleRename, [name, newName])
      }
    }
    return true
  }

  public deleteHandle(name: HandleName): void {
    const defs = this.$$.valueHandleDefs?.value
    if (defs) {
      const index = defs.findIndex((def) => def.handle === name)
      if (index >= 0) {
        this.$$.showSettings.set(void 0)
        this.$$.valueHandleDefs.set(defs.toSpliced(index, 1))
        send(this.onDidHandleDelete, name)
      }
    }
  }

  public moveHandle(index: HandleIndex, newIndex: number): void {
    const defs = this.$$.valueHandleDefs?.value
    if (defs) {
      const oldIndex = defs.findIndex((def) => matchesIndex(def, index))
      if (oldIndex >= 0) {
        const newDefs = defs.slice()
        const spliced = newDefs.splice(oldIndex, 1)
        newDefs.splice(newIndex, 0, ...spliced)
        this.$$.valueHandleDefs.set(newDefs)
      }
    }
  }

  /** @internal Returns the source row when a connection creates a handle. */
  public grabHandleRow(handle: HandleName): HandleRowStore | undefined {
    return this.$.handles.value.find((e) => e.name === handle)
  }

  /** @internal Inserts a connection-created handle below the target or at the end. */
  public dropHandleRow(handleIndex: HandleIndex | null | undefined, row: HandleRowStore, insertBefore?: boolean): HandleName | undefined {
    const valueDefs$ = this.$$.valueHandleDefs
    if (valueDefs$) {
      const names = this.$.allHandleNames.value
      const newDef: ValueHandleDef = {
        handle: names.includes(row.name) ? (inferNewItemName('value', names) as HandleName) : row.name,
        json_schema: row.schema$.value,
        kind: row.schemaKind$.value,
        nullable: row.nullable$.value,
        description: cloneLocalesIfNeeded(row.description$.value, row.context.userLocales, this.userLocales),
        value: row.value$?.value,
      }
      const defs = valueDefs$.value
      if (defs) {
        const index = handleIndex ? defs.findIndex((d) => matchesIndex(d, handleIndex)) : -1
        if (index >= 0) {
          valueDefs$.set(defs.toSpliced(index + 1, 0, newDef))
        } else {
          valueDefs$.set(insertBefore ? [newDef, ...defs] : [...defs, newDef])
        }
      } else {
        valueDefs$.set([newDef])
      }
      return newDef.handle
    }
  }

  private deriveHandles$(
    collapsed: Val<FieldCollapsed | undefined>,
    height: Val<FieldHeight | undefined>,
    props: ValueSectionStoreProps,
    valueHandles$: ReadonlyVal<HandleName[]>,
    connectedHandles$: ReadonlyVal<ReadonlySet<HandleName>>,
  ): ReadonlyVal<HandleRowStore[]> {
    let oldHandles: HandleRowStore[] | undefined
    return compute<HandleRowStore[]>(
      (get) => {
        const rows: HandleRowStore[] = []
        const valueHandles = get(valueHandles$)
        if (!valueHandles?.length) {
          oldHandles?.forEach((e) => e.dispose())
          oldHandles = undefined
          return rows
        }

        for (const handle of valueHandles) {
          const r = oldHandles?.find((e) => e.name === handle)
          if (r) {
            rows.push(r)
            continue
          }

          const def$ = attachSetter(
            derive(props.valueHandleDefs, (defs) => defs?.find((e) => e.handle === handle)),
            (def) => {
              if (def && isWritable(props.valueHandleDefs)) {
                const defs = props.valueHandleDefs.value
                if (defs) {
                  const index = defs.findIndex((e) => e.handle === handle)
                  const newDefs = defs.slice()
                  newDefs[index >= 0 ? index : defs.length] = def
                  props.valueHandleDefs.set(newDefs)
                } else {
                  props.valueHandleDefs.set([def])
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
          const defaultValue$ = val()
          const showSettings$ = attachSetter(
            derive(props.showSettings, (s) => s?.handle === handle),
            (b) => props.showSettings.set(b ? { scope: 'value', handle } : undefined),
          )
          const schemaOverrides$ = val()

          const collapsed$ = attachSetter(
            derive(collapsed, (c) => c?.[handle], equalConfig),
            setPartial(collapsed, handle),
          )
          const height$ = attachSetter(
            derive(height, (c) => c?.[handle], equalConfig),
            setPartial(height, handle),
          )

          const value$ = attachSetter(
            derive(def$, (d) => d?.value, equalConfig),
            updatePartial(def$, 'value'),
          )

          const reference$ = derive(connectedHandles$, (set) => set.has(handle))

          const context = new WidgetContext(
            {
              role: props.role,
              inout: 'in',
              handlePosition: 'out',
              enableAny: false,
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

          row.dispose.add([schema$, reference$, nullable$, showSettings$, schemaOverrides$, collapsed$, value$])

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
  }

  private deriveConnectedHandles$(handleOutputsTo: ReadonlyVal<HandleName[] | undefined> | undefined): ReadonlyVal<ReadonlySet<HandleName>> {
    return handleOutputsTo
      ? derive(handleOutputsTo, (handles) => {
          if (!handles || handles.length == 0) return emptySet
          return new Set(handles)
        })
      : val(emptySet)
  }
}

const emptySet: ReadonlySet<HandleName> = /*#__PURE__*/ new Set()
