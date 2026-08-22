import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../../localization/common/localization.ts'
import type { HandleName, TriggerDefinition, TriggerDescriptor, TriggerPollTime, ValueHandleDef } from '../../../../../schema/index.ts'
import type { TriggerCatalogDescriptor } from '../../../../../trigger/common/catalog.ts'
import type { HandleRowStore } from '../../nodeHandle/handleRow.store.ts'
import type { NodeShowSettings } from '../node.store.ts'
import type { INodeSectionStore } from './interface.ts'
import type { ValueSectionUIState } from './valueSection.store.ts'

import { disposableStore } from '@wopjs/disposable'
import { isEqual } from 'radash'
import { attachSetter, combine, compute } from 'value-enhancer'
import { isJsonObject } from '../../../../../base/common/json.ts'
import { toPlainObject } from '../../../base/trivial.ts'
import { TRIGGER_SECTION_TYPE } from './constants.ts'
import { ValueSectionStore } from './valueSection.store.ts'

export interface TriggerSectionStoreProps {
  readonly createSchemaEditor: (dom: HTMLDivElement, schema$: Val<string> | ReadonlyVal<string>) => (() => void) | void
  readonly definition: ReadonlyVal<TriggerDefinition | undefined>
  readonly initialUIState?: Record<PropertyKey, unknown>
  readonly lang: ReadonlyVal<string>
  readonly showSettings: Val<NodeShowSettings | undefined>
  readonly trigger: Val<TriggerDescriptor | undefined>
  readonly userLocales?: LocaleTextStore
}

export class TriggerSectionStore implements INodeSectionStore<ValueSectionUIState | undefined> {
  public static readonly TYPE = TRIGGER_SECTION_TYPE
  public readonly type = TRIGGER_SECTION_TYPE
  public readonly dispose: DisposableStore = disposableStore()
  public readonly config: ValueSectionStore
  public readonly configEditor$: ReadonlyVal<HandleRowStore | undefined>
  public readonly hasError$: ReadonlyVal<boolean>
  public readonly pollTime$: ReadonlyVal<TriggerPollTime | undefined>
  public readonly trigger$: ReadonlyVal<TriggerCatalogDescriptor | undefined>
  public readonly uiState$: ReadonlyVal<ValueSectionUIState | undefined>
  readonly #trigger: Val<TriggerDescriptor | undefined>

  public constructor(props: TriggerSectionStoreProps) {
    this.#trigger = props.trigger
    this.trigger$ = this.dispose.add(
      combine([props.trigger, props.definition], ([trigger, definition]) => (trigger == null || definition == null ? undefined : { ...trigger, definition }), {
        equal: isEqual,
      }),
    )
    this.pollTime$ = this.dispose.add(
      combine(
        [props.trigger, props.definition],
        ([trigger, definition]) => (trigger != null && definition?.provisioning.kind == 'poll' ? trigger.poll_times?.[0] : undefined),
        { equal: isEqual },
      ),
    )
    const configDefs$ = this.dispose.add(
      attachSetter(
        combine(
          [props.trigger, props.definition],
          ([trigger, definition]): readonly ValueHandleDef[] | undefined => {
            if (trigger == null || definition == null) return
            return [
              {
                handle: 'config' as HandleName,
                json_schema: definition.config_schema,
                value: trigger.config,
              },
            ]
          },
          { equal: isEqual },
        ),
        (defs) => {
          const trigger = props.trigger.value
          const config = defs?.find((item) => item.handle == 'config')?.value
          if (trigger != null && isJsonObject(config)) props.trigger.set({ ...trigger, config })
        },
      ),
    )
    this.config = this.dispose.add(
      new ValueSectionStore({
        createSchemaEditor: props.createSchemaEditor,
        initialUIState: props.initialUIState,
        lang: props.lang,
        role: 'user',
        showSettings: props.showSettings,
        userLocales: props.userLocales,
        valueHandleDefs: configDefs$,
      }),
    )
    this.configEditor$ = this.dispose.add(
      compute((get) => {
        const config = get(this.config.$.handles)[0]
        if (config == null) return
        const schema = toPlainObject(get(config.schema$))
        if (schema?.type != 'object') return config
        const properties = toPlainObject(schema.properties)
        return (properties != null && Object.keys(properties).length > 0) || schema.additionalProperties !== false ? config : undefined
      }),
    )
    this.hasError$ = this.config.hasError$
    this.uiState$ = this.config.uiState$
  }

  public setPollTime(pollTime: TriggerPollTime): void {
    const trigger = this.#trigger.value
    if (trigger != null) this.#trigger.set({ ...trigger, poll_times: [pollTime] })
  }

  public setConnection(connection: string): void {
    const trigger = this.#trigger.value
    if (trigger != null && trigger.connection != connection) this.#trigger.set({ ...trigger, connection })
  }
}
