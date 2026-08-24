import type { PlatformOwner } from '../scripts/check-platform-boundaries.ts'

import assert from 'node:assert/strict'
import { test } from 'vitest'
import { isForbiddenPlatformImport, isNonPortablePackageImport } from '../scripts/check-platform-boundaries.ts'

const owners: readonly PlatformOwner[] = ['common', 'browser', 'node', 'worker']
const allowed: Readonly<Record<PlatformOwner, readonly PlatformOwner[]>> = {
  common: ['common'],
  browser: ['common', 'browser'],
  node: ['common', 'node'],
  worker: ['common', 'worker'],
}

test('enforces the complete platform owner import matrix', () => {
  for (const source of owners) {
    for (const target of owners) assert.equal(isForbiddenPlatformImport(source, target), !allowed[source].includes(target), `${source} -> ${target}`)
  }
})

test('rejects deployment-owned imports from the portable package', () => {
  assert.equal(isNonPortablePackageImport('cloudflare:workers'), true)
  assert.equal(isNonPortablePackageImport('@cloudflare/vitest-pool-workers'), true)
  assert.equal(isNonPortablePackageImport('@oomol/private-service'), true)
  assert.equal(isNonPortablePackageImport('@oomol-lab/open-flow/run-lifecycle'), false)
  assert.equal(isNonPortablePackageImport('react'), false)
})
