import type { JsonValue, RevisionContent } from '../src/project/common/change.ts'

import { describe, expect, it } from 'vitest'
import { canonicalJsonBytes, digestBytes, encodeRevision } from '../src/project/common/encoding.ts'

const decoder = new TextDecoder()
const port = { jsonSchema: { type: 'number' }, nullable: false } as const

function revision(reverse = false): RevisionContent {
  const nodes = {
    condition: {
      cases: [
        {
          expressions: [
            { input: 'value', operator: '>=' as const, value: 10 },
            { input: 'value', operator: '<' as const, value: 20 },
          ],
          output: 'match',
          relation: 'all' as const,
        },
      ],
      concurrency: 1,
      defaultOutput: 'other',
      input: { ...port, handle: 'value' },
      inputs: { value: { kind: 'sources' as const, sources: [{ kind: 'node' as const, nodeId: 'value', output: 'value' }] } },
      kind: 'condition' as const,
    },
    value: { concurrency: 1, inputs: {}, kind: 'value' as const, values: { value: { ...port, value: 12 } } },
  }
  const modules = {
    helper: { imports: [], name: 'Helper', source: 'export const value = 1' },
    main: { imports: ['helper'], name: 'Main', source: 'export default () => value' },
  }
  return {
    document: {
      bindings: { secret: { kind: 'secret', target: 'secret-main' } },
      flows: { main: { graph: { nodes: reverse ? { value: nodes.value, condition: nodes.condition } : nodes }, name: 'Main' } },
      subflows: {
        child: {
          graph: { nodes: {} },
          inputs: { input: port },
          name: 'Child',
          outputs: { output: { ...port, sources: [{ input: 'input', kind: 'flow' }] } },
        },
      },
      tasks: {
        managed: { executor: { kind: 'llm', mode: 'json' }, inputs: { prompt: { jsonSchema: { type: 'string' }, nullable: false } }, name: 'LLM', outputs: {} },
      },
    },
    modelVersion: 1,
    modules: reverse ? { main: modules.main, helper: modules.helper } : modules,
  }
}

describe('canonical JSON', () => {
  it('sorts every object lexicographically and preserves JSON encoding', () => {
    const value: JsonValue = {
      z: { b: 'β', a: '雪' },
      2: 'two',
      10: 'ten',
      a: ['line\nbreak', 'quote"', null, true, false, 1.25],
    }

    expect(decoder.decode(canonicalJsonBytes(value))).toBe(
      '{"10":"ten","2":"two","a":["line\\nbreak","quote\\\"",null,true,false,1.25],"z":{"a":"雪","b":"β"}}',
    )
  })

  it('produces the same bytes and digest regardless of insertion order', async () => {
    const first: JsonValue = { nested: { right: 2, left: 1 }, values: ['a', 'b'] }
    const second: JsonValue = { values: ['a', 'b'], nested: { left: 1, right: 2 } }

    const firstBytes = canonicalJsonBytes(first)
    const secondBytes = canonicalJsonBytes(second)

    expect(secondBytes).toEqual(firstBytes)
    await expect(digestBytes(secondBytes)).resolves.toBe('sha256:e82abf7fb412ce524b010b8808597b09110d289e17ddcf0b3e989b7001087f12')
  })
})

describe('Project Revision encoding', () => {
  it('encodes a complete Revision independently of record insertion order', async () => {
    const first = encodeRevision(revision())
    const second = encodeRevision(revision(true))

    expect(second).toEqual(first)
    expect(JSON.parse(decoder.decode(first))).toMatchObject({
      document: {
        bindings: { secret: { kind: 'secret', target: 'secret-main' } },
        flows: { main: { graph: { nodes: { condition: {}, value: {} } }, name: 'Main' } },
        subflows: { child: { name: 'Child' } },
        tasks: { managed: { executor: { kind: 'llm', mode: 'json' }, name: 'LLM' } },
      },
      kind: 'open-flow-project-revision',
      modelVersion: 1,
      modules: { helper: { imports: [] }, main: { imports: ['helper'] } },
      version: 1,
    })
    await expect(digestBytes(first)).resolves.toBe('sha256:a0f33bbdc2c1d4c46d6dfd9e94c94ccd761cd373b46adffa0290455c4af0a377')
  })

  it('changes the encoded Revision when workflow semantics change', () => {
    const source = revision()
    const changed: RevisionContent = {
      ...source,
      document: {
        ...source.document,
        flows: { ...source.document.flows, main: { ...source.document.flows.main!, name: 'Renamed' } },
      },
    }

    expect(encodeRevision(changed)).not.toEqual(encodeRevision(source))
  })
})
