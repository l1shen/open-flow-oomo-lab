import type { RuntimeHarness, RuntimeProgram } from '@oomol-lab/open-flow/runtime-contract'

import { runtimeConformanceCases } from '@oomol-lab/open-flow/runtime-contract'
import { describe, expect, it } from 'vitest'
import { invokeIsolatedVm, isolatedVmEngineDigest, isolatedVmLimits, IsolatedVmError } from '../src/isolated-vm.ts'

const harness: RuntimeHarness = {
  engineDigest: isolatedVmEngineDigest,
  invoke: invokeIsolatedVm,
}

function program(source: string): RuntimeProgram {
  return {
    engineContract: 'open-flow-engine/v1',
    engineDigest: isolatedVmEngineDigest,
    entryModuleId: 'main',
    modules: { main: { imports: [], source } },
  }
}

function invoke(source: string, limits = isolatedVmLimits) {
  return invokeIsolatedVm(
    {
      capability: async () => ({ body: null, status: 200 }),
      input: null,
      invocationId: 'isolated-runtime-test',
      program: program(source),
    },
    limits,
  )
}

describe('isolated-vm runtime conformance', () => {
  for (const conformance of runtimeConformanceCases) {
    it(conformance.name, async () => await conformance.verify(harness))
  }

  it('does not expose Node or network globals to the user realm', async () => {
    await expect(
      invoke(`export default () => ({
        fetch: typeof fetch,
        process: typeof process,
        require: typeof require,
      })`),
    ).resolves.toEqual({ fetch: 'undefined', process: 'undefined', require: 'undefined' })
  })

  it('terminates synchronous user code at the CPU limit and keeps the parent alive', async () => {
    await expect(invoke('export default () => { while (true) {} }', { ...isolatedVmLimits, cpuMs: 20, wallMs: 2_000 })).rejects.toMatchObject({
      code: 'limit-exceeded',
    })
    await expect(invoke('export default () => "still-alive"')).resolves.toBe('still-alive')
  })

  it('rejects oversized results without returning partial data', async () => {
    await expect(invoke('export default () => "x".repeat(2048)', { ...isolatedVmLimits, maxResultBytes: 256 })).rejects.toMatchObject({
      code: 'limit-exceeded',
    })
  })

  it('rejects an Engine digest not owned by this Executor before spawning user code', async () => {
    await expect(
      invokeIsolatedVm({
        capability: async () => ({ body: null, status: 200 }),
        input: null,
        invocationId: 'wrong-engine',
        program: { ...program('export default () => true'), engineDigest: 'sha256:other' },
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<IsolatedVmError>>({ code: 'invalid-program' }))
  })
})
