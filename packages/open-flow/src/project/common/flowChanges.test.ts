import { describe, expect, it } from 'vitest'
import { createFlow, deleteFlow, renameFlow } from './flowChanges.ts'

describe('Flow changes', () => {
  it('creates, renames, and deletes a Flow through typed operations', () => {
    expect(createFlow('flow-1', 'Main')).toEqual([{ flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'flow-1', kind: 'flow.create' }])
    expect(renameFlow('flow-1', 'Renamed')).toEqual([{ flowId: 'flow-1', kind: 'flow.rename', name: 'Renamed' }])
    expect(deleteFlow('flow-1')).toEqual([{ flowId: 'flow-1', kind: 'flow.delete' }])
  })
})
