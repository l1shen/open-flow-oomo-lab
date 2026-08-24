import assert from 'node:assert/strict'
import { test } from 'vitest'
import { formatSecretReference, parseSecretReference } from '../src/secret/common/reference.ts'

test('round-trips strict tagged secret references', () => {
  const reference = { secretId: 'secret_019f63cb8ba273918e62778991d283ab', key: 'OPENAI_API_KEY' }
  const value = formatSecretReference(reference)

  assert.equal(value, '${{OO_SECRET:secret_019f63cb8ba273918e62778991d283ab,OPENAI_API_KEY}}')
  assert.deepEqual(parseSecretReference(value), reference)
  assert.equal(parseSecretReference('secret_019f63cb8ba273918e62778991d283ab,OPENAI_API_KEY'), undefined)
  assert.equal(parseSecretReference('${{OO_SECRET:secret_019f63cb8ba273918e62778991d283ab,OPENAI_API_KEY,extra}}'), undefined)
  assert.equal(parseSecretReference('${{OO_SECRET:Custom,personal,OPENAI_API_KEY}}'), undefined)
  assert.throws(() => formatSecretReference({ ...reference, key: 'personal,work' }), TypeError)
})
