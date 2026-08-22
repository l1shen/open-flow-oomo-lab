import type { Option } from '@wopjs/tsur'
import type { Document, ToStringOptions } from 'yaml'

import { isArray, isDefined } from '@wopjs/cast'
import { None, Some } from '@wopjs/tsur'
import { Pair, YAMLMap, YAMLSeq, isPair, Scalar, parseDocument, isCollection, isMap, isSeq, isScalar, isDocument, isNode, Alias, isAlias } from 'yaml'
import { isUnknownRecord } from '../../base/common/type.ts'

export { stringify, parse as parseYaml } from 'yaml'

/** Remove undefined node */
export const TO_STRING_OPTIONS: ToStringOptions = {
  nullStr: '',
  collectionStyle: 'block',
}

export type YamlKey = string | number

export type YamlDoc = Document
export const isYamlDoc = isDocument as (node: unknown) => node is YamlDoc
export const parseYamlDoc: (source: string) => YamlDoc = (source) => {
  const doc = parseDocument(source)
  doc.errors.length = 0
  return doc
}

export type YamlAlias = Alias
export const isYamlAlias = isAlias as (node: unknown) => node is YamlAlias
export const YamlAlias: typeof Alias = Alias

export type YamlScalar<V = unknown> = Pick<Scalar<V>, 'type' | 'value' | 'toJSON' | 'toString'>
export const isYamlScalar = isScalar as <T = any>(node: unknown) => node is YamlScalar<T>
export const YamlScalar = Scalar as {
  new <V = unknown>(value: V): YamlScalar<V>
}

export type YamlMap<K = unknown, V = unknown> = Pick<YAMLMap<K, V>, 'items' | 'toJSON' | 'toString'> & {
  clone(): YamlMap<K, V>
}
export const isYamlMap = isMap as <K = any, V = any>(node: unknown) => node is YamlMap<K, V>
export const YamlMap = YAMLMap as {
  new <K = unknown, V = unknown>(): YamlMap<K, V>
}

export type YamlSeq<V = unknown> = Pick<YAMLSeq<V>, 'items' | 'toJSON' | 'toString'> & {
  clone(): YamlSeq<V>
}
export const isYamlSeq = isSeq as <T = any>(node: unknown) => node is YamlSeq<T>
export const YamlSeq = YAMLSeq as {
  new <V = unknown>(): YAMLSeq<V>
}

export const isYamlCollection = isCollection as <K = any, V = any>(node: unknown) => node is YamlMap<K, V> | YamlSeq<V>

export type YamlParent<V = unknown> = YamlDoc | YamlMap<unknown, V> | YamlSeq<V>
export const isYamlParent = <T = any>(node: unknown): node is YamlParent<T> => isYamlDoc(node) || isYamlCollection(node)

export type YamlNode<V = unknown> = YamlAlias | YamlScalar<V> | YamlMap<unknown, V> | YamlSeq<V>
export const isYamlNode = isNode as <T = any>(node: unknown) => node is YamlNode<T>

export const getYamlNode = (node: YamlParent, key: YamlKey): Option<YamlNode> => {
  const child = (node as Document | YAMLMap | YAMLSeq).get(key, true)
  return isScalar(child) || isCollection(child) ? Some(child) : None
}

const getValue = (node: YamlNode) => node.toJSON()

export const getYamlNodeValue = (parent: YamlParent, key: YamlKey): Option<unknown> => getYamlNode(parent, key).map(getValue)

export const setYamlNodeValue = <TValue = unknown>(parent: YamlParent, key: YamlKey, value: TValue): TValue => {
  ;(parent as Document | YAMLMap | YAMLSeq).set(key, isNode(value) ? value : new Scalar(value))
  return value
}

export const deleteYamlNode = (node: YamlParent, key: YamlKey): void => {
  ;(node as Document | YAMLMap | YAMLSeq).delete(key)
}

/**
 * Mutate the provide node if it's type matches the value, otherwise create a new node.
 */
export function writeYamlNode<TValue>(node: unknown, value: TValue): YamlNode | undefined {
  if (!isDefined(value)) {
    return
  }

  if (isYamlNode(value)) {
    return value
  }
  if (isArray(value)) {
    return writeYamlSeq(node, value)
  }
  if (isUnknownRecord(value)) {
    return writeYamlMap(node, value)
  }
  return writeYamlScalar(node, value)
}

/**
 * Mutate the provide node if it is a seq node, otherwise create a seq node.
 */
export function writeYamlSeq<TArr extends readonly any[]>(node: unknown, arr: TArr): YamlSeq {
  const seq = node && isSeq(node) ? node : new YAMLSeq()
  let length = 0
  for (let i = 0; i < arr.length; i++) {
    const itemNode = writeYamlNode(seq.items[i], arr[i])
    if (itemNode) {
      seq.items[length] = itemNode
      length += 1
    }
  }
  seq.items.length = length
  return seq
}

/**
 * Mutate the provide node if it is a map node, otherwise create a map node.
 */
export function writeYamlMap<TObj extends {}>(node: unknown, obj: TObj): YamlMap {
  const map = node && isMap(node) ? node : new YAMLMap()
  const entries = Object.entries(obj)
  let length = 0
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i]
    if (isPair(map.items[i])) {
      const newKey = writeYamlScalar(map.items[i].key, key)
      const newValue = writeYamlNode(map.items[i].value, value)
      if (newKey && newValue) {
        map.items[length].key = newKey
        map.items[length].value = newValue
        length += 1
      }
    } else {
      const newValue = writeYamlNode(map.items[i]?.value, value)
      if (key && newValue) {
        map.items[length] = new Pair(key, newValue)
        length += 1
      }
    }
  }
  map.items.length = length
  return map as YamlMap
}

/**
 * Mutate the provide node if it is a scalar node, otherwise create a new scalar node.
 */
export function writeYamlScalar<TValue>(node: unknown, value: TValue): YamlScalar | undefined {
  if (!isDefined(value)) {
    return
  }
  if (node && isScalar(node)) {
    node.value = value
    return node
  }
  return new Scalar(value)
}

export function writeMultilineStringYamlScalar(node: unknown, value: string | undefined): YamlScalar | undefined {
  const scalar = writeYamlScalar(node, value)
  if (scalar) {
    scalar.type = value?.includes('\n') ? 'BLOCK_LITERAL' : 'PLAIN'
  }
  return scalar
}
