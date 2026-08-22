import { describe, expect, it } from 'vitest'
import { parseTaskBlockExecutor } from '../../src/manifest/common/model/block/task/parse.ts'

describe('JavaScript executor manifest model', () => {
  it('loads portable executors and rejects removed executor kinds', () => {
    expect(parseTaskBlockExecutor({ name: 'javascript', options: { entry: 'task.ts', function: 'run' } }).unwrapOr()).toEqual({
      name: 'javascript',
      options: { entry: 'task.ts', function: 'run' },
    })
    expect(parseTaskBlockExecutor({ name: 'javascript', options: {} }).unwrapOr()).toBeUndefined()
    expect(parseTaskBlockExecutor({ name: 'nodejs', options: { entry: 'task.ts' } }).unwrapOr()).toBeUndefined()
  })

  it('requires non-empty string Connector action and connection options', () => {
    expect(parseTaskBlockExecutor({ name: 'connector', options: { action: 'gmail.send_email', connection: 'gmail-work' } }).unwrapOr()).toEqual({
      name: 'connector',
      options: { action: 'gmail.send_email', connection: 'gmail-work' },
    })
    expect(parseTaskBlockExecutor({ name: 'connector', options: { action: 'gmail.send_email', connection: 42 } }).unwrapOr()).toBeUndefined()
    expect(parseTaskBlockExecutor({ name: 'connector', options: { action: 'gmail.send_email', connection: '' } }).unwrapOr()).toBeUndefined()
  })
})
