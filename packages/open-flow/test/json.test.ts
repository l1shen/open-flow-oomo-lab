import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { isJsonObject, isJsonValue } from '../src/base/common/json.ts'

test('accepts the strict JSON value set', () => {
  const shared = { value: 1 }
  const nullPrototype = Object.assign(Object.create(null), { value: 'plain' })

  for (const value of [null, true, false, 0, -0, 1.5, '', 'value', [], {}, [shared, shared], nullPrototype]) {
    assert.equal(isJsonValue(value), true)
  }

  assert.equal(isJsonObject({ value: [null, true, 1, 'value'] }), true)
  assert.equal(isJsonObject(nullPrototype), true)
  assert.equal(isJsonObject([]), false)
  assert.equal(isJsonObject(null), false)
})

const cyclic: { self?: unknown } = {}
cyclic.self = cyclic

const sparse: unknown[] = []
sparse.length = 1

const arrayProperty: unknown[] & { extra?: number } = []
arrayProperty.extra = 1

let getterCalled = false
const accessor = {}
Object.defineProperty(accessor, 'value', {
  enumerable: true,
  get() {
    getterCalled = true
    return 1
  },
})

const hidden = {}
Object.defineProperty(hidden, 'value', { enumerable: false, value: 1 })

const symbolKey = { value: 1 }
Object.defineProperty(symbolKey, Symbol('hidden'), { enumerable: true, value: 2 })

class CustomValue {
  readonly value = 1
}

const revoked = Proxy.revocable({ value: 1 }, {})
revoked.revoke()

const invalid: readonly (readonly [string, unknown])[] = [
  ['undefined', undefined],
  ['NaN', Number.NaN],
  ['positive infinity', Number.POSITIVE_INFINITY],
  ['negative infinity', Number.NEGATIVE_INFINITY],
  ['bigint', 1n],
  ['symbol', Symbol('value')],
  ['function', () => undefined],
  ['cyclic object', cyclic],
  ['sparse array', sparse],
  ['array property', arrayProperty],
  ['accessor', accessor],
  ['non-enumerable property', hidden],
  ['symbol key', symbolKey],
  ['Date', new Date(0)],
  ['Map', new Map()],
  ['Set', new Set()],
  ['custom class', new CustomValue()],
  ['revoked Proxy', revoked.proxy],
]

for (const [name, value] of invalid) {
  test(`rejects ${name} from canonical JSON`, () => {
    assert.equal(isJsonValue(value), false)
    assert.equal(isJsonObject(value), false)
    if (name == 'accessor') assert.equal(getterCalled, false)
  })
}

test('rejects arrays as objects without traversing them', () => {
  let traversed = false
  const value = new Proxy([], {
    ownKeys(target) {
      traversed = true
      return Reflect.ownKeys(target)
    },
  })

  assert.equal(isJsonObject(value), false)
  assert.equal(traversed, false)
})

test('stops after the first invalid property value', () => {
  let descriptorReads = 0
  const value = new Proxy(
    { invalid: undefined, trailing: 1 },
    {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads++
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    },
  )

  assert.equal(isJsonValue(value), false)
  assert.equal(descriptorReads, 1)
})

test('accepts deeply nested objects without using the call stack', () => {
  let value: unknown = null
  for (let index = 0; index < 20_000; index++) value = { value }

  assert.equal(isJsonValue(value), true)
})
