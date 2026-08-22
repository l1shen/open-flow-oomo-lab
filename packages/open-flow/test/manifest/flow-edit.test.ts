import { describe, expect, it } from 'vitest'
import { FlowEditError, FlowEditOperationsSchema, planFlowEdit } from '../../src/manifest/common/flowEdit.ts'

const source = `title: Example # Keep this comment.
nodes:
  - node_id: source
    values:
      - handle: result
        value: 1
  - node_id: sink
    task:
      inputs_def:
        - handle: input
      outputs_def:
        - handle: result
      executor:
        name: connector
        options:
          action: test.echo
          connection: test-connection
    inputs_from:
      - handle: input
        from_node:
          - node_id: source
            output_handle: result
`

function operations(input: unknown) {
  return FlowEditOperationsSchema.parse(input)
}

describe('Flow edit planning', () => {
  it('applies ordered node and connection operations while preserving unrelated source', () => {
    const planned = planFlowEdit(
      source,
      operations([
        {
          type: 'add-node',
          node: {
            node_id: 'second-source',
            values: [{ handle: 'result', value: 2 }],
          },
        },
        {
          type: 'connect',
          connection: {
            from: { nodeId: 'second-source', handle: 'result' },
            to: { nodeId: 'sink', handle: 'input' },
          },
        },
      ]),
    )

    expect(planned.flow.nodes.map((node) => node.node_id)).toEqual(['source', 'sink', 'second-source'])
    expect(planned.source).toContain('title: Example # Keep this comment.')
    expect(planned.source).toContain('node_id: second-source')
    expect(planned.source).toContain('node_id: source')
  })

  it('rejects removing a referenced node without mutating the source', () => {
    try {
      planFlowEdit(source, operations([{ type: 'remove-node', nodeId: 'source' }]))
      throw new Error('Expected the edit to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(FlowEditError)
      expect((error as FlowEditError).issues).toEqual([
        {
          code: 'node.referenced',
          message: 'Node "source" is still connected to "sink" input "input". Disconnect it before removing the node.',
          path: '#/operations/0',
        },
      ])
    }
    expect(source).toContain('# Keep this comment.')
  })

  it('disconnects and removes a node in one ordered edit', () => {
    const planned = planFlowEdit(
      source,
      operations([
        {
          type: 'disconnect',
          connection: {
            from: { nodeId: 'source', handle: 'result' },
            to: { nodeId: 'sink', handle: 'input' },
          },
        },
        { type: 'remove-node', nodeId: 'source' },
      ]),
    )

    expect(planned.flow.nodes.map((node) => node.node_id)).toEqual(['sink'])
    expect(planned.source).not.toContain('node_id: source')
    expect(planned.source).not.toContain('inputs_from:')
  })

  it('replaces a static input value when connecting a node output', () => {
    const planned = planFlowEdit(
      source.replace(
        `        from_node:
          - node_id: source
            output_handle: result`,
        '        value: fallback',
      ),
      operations([
        {
          type: 'connect',
          connection: {
            from: { nodeId: 'source', handle: 'result' },
            to: { nodeId: 'sink', handle: 'input' },
          },
        },
      ]),
    )

    const sink = planned.flow.nodes.find((node) => node.node_id == 'sink')
    expect(sink).toMatchObject({
      inputs_from: [
        {
          handle: 'input',
          from_node: [{ node_id: 'source', output_handle: 'result' }],
        },
      ],
    })
    if (sink == null || !('inputs_from' in sink)) throw new Error('Expected a node with inputs.')
    expect(sink.inputs_from?.[0]).not.toHaveProperty('value')
  })

  it('rejects duplicate nodes, missing replacements, and duplicate connections', () => {
    expect(() =>
      planFlowEdit(
        source,
        operations([
          {
            type: 'add-node',
            node: { node_id: 'source', values: [{ handle: 'result', value: 2 }] },
          },
        ]),
      ),
    ).toThrow('Node "source" already exists.')

    expect(() =>
      planFlowEdit(
        source,
        operations([
          {
            type: 'replace-node',
            node: { node_id: 'missing', values: [{ handle: 'result', value: 2 }] },
          },
        ]),
      ),
    ).toThrow('Node "missing" does not exist.')

    expect(() =>
      planFlowEdit(
        source,
        operations([
          {
            type: 'connect',
            connection: {
              from: { nodeId: 'source', handle: 'result' },
              to: { nodeId: 'sink', handle: 'input' },
            },
          },
        ]),
      ),
    ).toThrow('The connection already exists.')
  })

  it('rejects malformed operation input at the boundary', () => {
    expect(() => planFlowEdit(source, [{ type: 'remove-node' }] as never)).toThrow(FlowEditError)
    expect(() =>
      planFlowEdit(source, [
        {
          type: 'add-node',
          node: { node_id: 'unsafe', values: [{ handle: 'result', value: 1n }] },
        },
      ] as never),
    ).toThrow('Expected a JSON-safe operation.')
  })
})
