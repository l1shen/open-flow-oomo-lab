import type { DisposableStore, IDisposable } from '@wopjs/disposable'
import type { EventReceiver } from 'remitter'
import type { ReadonlyVal, Val, ValConfig, ValDisposer } from 'value-enhancer'
import type { ReactiveMap, ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { Revision } from '../../base/common/revision.ts'
import type { FileManifest } from './manifestTypes.ts'
import type { ManifestSource } from './source.ts'
import type { YamlDoc, YamlKey, YamlNode, YamlParent, YamlSeq } from './yaml.ts'

import { isDefined, isString, noop } from '@wopjs/cast'
import { disposableStore, dispose } from '@wopjs/disposable'
import { Option } from '@wopjs/tsur'
import { Remitter } from 'remitter'
import { val } from 'value-enhancer'
import { reactiveMap } from 'value-enhancer/collections'
import { Document } from 'yaml'
import { TO_STRING_OPTIONS, deleteYamlNode, getYamlNode, isYamlNode, isYamlSeq, parseYamlDoc, setYamlNodeValue, writeYamlNode, writeYamlSeq } from './yaml.ts'

type InvokerCallback<TArgs extends unknown[]> = (...args: TArgs) => void

interface Invoker<TArgs extends unknown[]> {
  (...args: TArgs): void
  add(callback: InvokerCallback<TArgs>): Invoker<TArgs>
}

function createInvoker<TArgs extends unknown[]>(...callbacks: InvokerCallback<TArgs>[]): Invoker<TArgs> {
  const invoker: Invoker<TArgs> = (...args: TArgs) => {
    for (const callback of callbacks) {
      try {
        callback(...args)
      } catch (error) {
        console.error(error)
      }
    }
  }
  invoker.add = (callback) => {
    callbacks.push(callback)
    return invoker
  }
  return invoker
}

export interface WritableFileManifestEvents {
  /** Fires when the YAML source is updated. */
  sourceUpdated: void
  /** Fires when the manifest content changes. */
  changed: void
}

export abstract class WritableFileManifest implements FileManifest {
  public readonly dispose: DisposableStore = disposableStore()

  #error$ = val<Error | undefined>(undefined)
  public readonly error$: ReadonlyVal<Error | undefined> = this.#error$

  public readonly events: EventReceiver<WritableFileManifestEvents>
  protected readonly eventEmitter: Remitter<WritableFileManifestEvents>

  public yamlParent: YamlDoc

  public onYamlParentUpdated: OnYamlParentUpdated = noop

  public revision?: Revision

  protected lastSaveFileString: string = ''
  protected dirty: boolean = false

  public constructor(sourceOrDoc: YamlDoc | string = '', revision?: Revision) {
    if (isString(sourceOrDoc)) {
      try {
        this.yamlParent = parseYamlDoc(sourceOrDoc)
        if (revision != null) {
          this.lastSaveFileString = sourceOrDoc
        }
      } catch (e) {
        this.yamlParent = new Document()
        this.#error$.set(e as Error)
      }
    } else {
      this.yamlParent = sourceOrDoc
      if (this.yamlParent.errors.length > 0) {
        this.#error$.set(this.yamlParent.errors.at(0))
      }
    }
    this.revision = revision
    this.events = this.eventEmitter = this.dispose.add(new Remitter())

    this.dispose.add(
      this.events.on('changed', () => {
        this.revision = undefined
        this.dirty = true
      }),
    )
  }

  public toJSON(): object {
    return this.yamlParent.toJSON()
  }

  /**
   * @internal
   */
  public _toSaveFileString(): string {
    if (this.dirty) {
      this.lastSaveFileString = this.yamlParent.toString(TO_STRING_OPTIONS)
      this.dirty = false
    }
    return this.lastSaveFileString
  }

  public updateSourceText(source: string): void {
    if (this.dirty) return

    if (!this.#error$.value) {
      if (this.lastSaveFileString === source) {
        return
      }
    }

    try {
      this.yamlParent = parseYamlDoc(source)
      this.#error$.set(undefined)
      this.lastSaveFileString = source
    } catch (e) {
      this.yamlParent = new Document()
      this.#error$.set(e as Error)
      this.lastSaveFileString = ''
    }
    this.revision = undefined
    this.onYamlParentUpdated(this.yamlParent)
    this.eventEmitter.emit('sourceUpdated')
  }

  public updateSource(snapshot: ManifestSource): void {
    if (this.dirty) return

    if (!this.#error$.value) {
      if (this.revision == snapshot.revision) {
        return
      }
      if (this.lastSaveFileString === snapshot.source) {
        this.revision = snapshot.revision
        return
      }
    }

    try {
      this.yamlParent = parseYamlDoc(snapshot.source)
      this.#error$.set(undefined)
      this.lastSaveFileString = snapshot.source
      this.revision = snapshot.revision
    } catch (e) {
      this.yamlParent = new Document()
      this.#error$.set(e as Error)
      this.lastSaveFileString = ''
      this.revision = undefined
    }
    this.onYamlParentUpdated(this.yamlParent)
    this.eventEmitter.emit('sourceUpdated')
  }
}

export type OnYamlParentUpdated = (yamlParent: YamlParent) => void
export type OnYamlSeqUpdated = (yamlSeq: YamlSeq) => void

export type BindWritableFileManifestValParser<TValue> = (data: unknown) => TValue | undefined | Option<TValue>

export const bindWritableSeq = <TValue>(
  yamlSeq: YamlSeq,
  parser: BindWritableFileManifestValParser<TValue>,
  config?: ValConfig<TValue | undefined>,
): [Val<TValue | undefined>, OnYamlSeqUpdated] => {
  const v = val<TValue | undefined>(undefined, config)

  let disposer: ValDisposer | undefined

  const onYamlSeqUpdated: OnYamlSeqUpdated = (nextYamlSeq: YamlSeq | undefined) => {
    disposer?.()

    const result = parser(nextYamlSeq?.toJSON())
    v.set(Option.unwrapOr(result))

    // The reaction shares the value lifecycle and is released by v.dispose.
    disposer = v.reaction((value) => {
      if (isDefined(value)) {
        writeYamlNode(nextYamlSeq, value)
      }
    }, true)
  }

  onYamlSeqUpdated(yamlSeq)

  return [v, onYamlSeqUpdated]
}

/**
 * Binds a YAML sequence to a ReactiveMap.
 */
export const bindWritableSeqMap = <K, V extends IDisposable>(
  yamlParent: YamlParent,
  seqKey: string,
  parseEntry: (valueYaml: YamlNode | unknown, values: ReadonlyReactiveMap<K, V>) => [K, V] | undefined,
  getValueYaml: (value: V) => YamlNode | YamlParent,
): [ReactiveMap<K, V>, OnYamlParentUpdated] => {
  const values = reactiveMap<K, V>(null, {
    onDeleted: dispose,
  })

  let disposer: ValDisposer | undefined
  let valuesYaml: YamlSeq | undefined

  const onYamlParentUpdated: OnYamlParentUpdated = (nextYamlParent) => {
    disposer?.()

    const newValues: [K, V][] = []
    valuesYaml = getYamlNode(nextYamlParent, seqKey).filter(isYamlSeq).unwrapOr()
    if (valuesYaml) {
      for (const valueYaml of valuesYaml.items) {
        const result = parseEntry(valueYaml, values)
        if (result) {
          newValues.push(result)
        }
      }
      values.replace(newValues)
    } else {
      values.clear()
    }

    disposer = values.$.reaction((nodes) => {
      const yamlSeq = writeYamlSeq(
        valuesYaml,
        [...nodes.values()].map((node) => getValueYaml(node)),
      )

      if (valuesYaml !== yamlSeq) {
        valuesYaml = yamlSeq
        setYamlNodeValue(nextYamlParent, seqKey, valuesYaml)
      }
    }, true)
  }

  onYamlParentUpdated(yamlParent)

  return [values, onYamlParentUpdated]
}

/**
 * Two-way binding of a readonly val with a yaml node under a key in a parent node.
 *
 * Setting the Val will update the node(not the source code string).
 * Updating the source code string will refresh the yaml node tree, and update the val accordingly.
 *
 * @param yamlParent - The parent node.
 * @param key - The key to the node under the parent node.
 * @param parser - The parser to parse the node.
 * @param config - Optional val config.
 * @returns A writable val and a function to update the parent yaml node.
 *
 * @example
 * ```ts
 * const doc = YAML.parseDocument(YAML.stringify({ title: "Hello" }));
 *
 * const [title$, onYamlParentUpdated] = bindWritableVal(doc, "title", parseString);
 *
 * onYamlParentUpdated(YAML.parseDocument(YAML.stringify({ title: "World" })));
 * ```
 */
export const bindWritableVal = <TValue>(
  yamlParent: YamlParent,
  key: YamlKey,
  parser: BindWritableFileManifestValParser<TValue>,
  config?: ValConfig<TValue | undefined>,
  writeYamlValue: (node: unknown, value: TValue) => YamlNode | undefined = writeYamlNode,
): [Val<TValue | undefined>, OnYamlParentUpdated] => {
  const v = val<TValue | undefined>(undefined, config)

  let disposer: ValDisposer | undefined

  const onYamlParentUpdated: OnYamlParentUpdated = (nextYamlParent: YamlParent) => {
    disposer?.()

    let yamlNode = getYamlNode(nextYamlParent, key).filter(isYamlNode).unwrapOr()
    const result = parser(yamlNode?.toJSON())
    v.set(Option.unwrapOr(result))

    // The reaction shares the value lifecycle and is released by v.dispose.
    disposer = v.reaction((value) => {
      if (isDefined(value)) {
        const node = writeYamlValue(yamlNode, value)
        if (node !== yamlNode) {
          yamlNode = node
          setYamlNodeValue(nextYamlParent, key, node)
        }
      } else if (isDefined(yamlNode)) {
        deleteYamlNode(nextYamlParent, key)
        yamlNode = undefined
      }
    }, true)
  }

  onYamlParentUpdated(yamlParent)

  return [v, onYamlParentUpdated]
}

export interface BindWritableFileManifestValGroupOptions<TValue> {
  parser: (data: unknown) => TValue | undefined | Option<TValue>
  config?: ValConfig<TValue | undefined>
  writeYamlValue?: (node: unknown, value: TValue) => YamlNode | undefined
}

/**
 * A group form of `bindWritableVal`.
 *
 * @example
 * ```ts
 * const doc = YAML.parseDocument(YAML.stringify({
 *   title: "Hello",
 *   description: "World",
 *   payload: { name: "John" },
 * }));
 *
 * const [vals$, onYamlParentUpdated] = bindWritableValGroup(doc, {
 *   title: parseString,
 *   description: parseString,
 *   payload: { parser: parseObject, config: { equal: deepEqual } },
 * });
 *
 * onYamlParentUpdated(YAML.parseDocument(YAML.stringify({
 *   title: "Hello2",
 *   description: "World2",
 *   payload: { name: "John2" },
 * })));
 * ```
 */
export const bindWritableValGroup = <TValues extends {}>(
  yamlParent: YamlParent,
  group: {
    [K in keyof TValues]: BindWritableFileManifestValParser<TValues[K]> | BindWritableFileManifestValGroupOptions<TValues[K]>
  },
): [
  {
    [K in keyof TValues]: Val<TValues[K] | undefined>
  },
  Invoker<[YamlParent]>,
] => {
  const result = {} as {
    [K in keyof TValues]: Val<TValues[K] | undefined>
  }

  const invoker = createInvoker<[YamlParent]>()

  for (const key in group) {
    if (!Object.hasOwn(group, key)) continue

    const bindConfig = group[key]
    if (typeof bindConfig == 'function') {
      const [v, onYamlParentUpdated] = bindWritableVal(yamlParent, key, bindConfig)
      result[key] = v
      invoker.add(onYamlParentUpdated)
    } else {
      const { parser, config, writeYamlValue } = bindConfig
      const [v, onYamlParentUpdated] = bindWritableVal(yamlParent, key, parser, config, writeYamlValue)
      result[key] = v
      invoker.add(onYamlParentUpdated)
    }
  }

  return [result, invoker]
}
