import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { createYamlSourceValidator } from '../src/manifest/common/sourceValidator.ts'
import { PackageSchema } from '../src/schema/index.ts'

test('accepts the local project descriptor', () => {
  assert.deepEqual(PackageSchema.parse({ name: 'example', displayName: 'Example', description: 'Local workflow', icon: ':carbon:flow:' }), {
    name: 'example',
    displayName: 'Example',
    description: 'Local workflow',
    icon: ':carbon:flow:',
  })
})

test('accepts an empty descriptor and rejects unknown fields', () => {
  assert.deepEqual(PackageSchema.parse({}), {})
  assert.deepEqual(createYamlSourceValidator(PackageSchema)(''), [])
  assert.equal(PackageSchema.safeParse({ name: 'example', unknown: true }).success, false)
})

test('reports deeply nested YAML as a diagnostic', () => {
  const source = `${'['.repeat(1_000)}null${']'.repeat(1_000)}`
  const diagnostics = createYamlSourceValidator(PackageSchema)(source)

  assert.ok(diagnostics.length > 0)
  assert.ok(diagnostics[0].message.length > 0)
})
