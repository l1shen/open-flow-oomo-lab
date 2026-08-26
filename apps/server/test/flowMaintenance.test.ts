import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { ServerService } from '../node/service.ts'

it('physically deletes a retired Flow without retaining its authoring history', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-retirement-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  try {
    const created = await service.control.createFlow('operator', 'Retirement', 'retirement-flow')
    service.control.retireFlow(created.flow.flowId)

    await service.tickMaintenance()
    await service.tickMaintenance()

    expect(() => service.control.getFlow(created.flow.flowId)).toThrow(expect.objectContaining({ code: 'flow.not-found' }))
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})
