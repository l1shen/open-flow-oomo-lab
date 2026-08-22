import type { BlockPath } from '../../manifest/common/manifestTypes.ts'
import type { BlockMeta } from '../../manifest/common/meta/block/blockMeta.ts'
import type { SharedBlockMeta } from '../../manifest/common/meta/block/shared/sharedBlockMeta.ts'
import type { FlowLikeMeta } from '../../manifest/common/meta/flowLike/flowLikeMeta.ts'
import type { PackageMeta } from '../../manifest/common/meta/package/packageMeta.ts'
import type { HandleFromNode, HandleInputFrom, HandleName, HandleOutputFrom, NodeId } from '../../schema/index.ts'
import type { AddNodeBlockItem, PackageAuthoring } from './packageAuthoring.ts'

import { inertFilterMap } from '@wopjs/cast'
import { TaskBlockMeta } from '../../manifest/common/meta/block/taskBlockMeta.ts'
import { isGroupDividerDef } from '../../manifest/common/model/block/base/blockManifest.ts'

export interface ManifestPackageAuthoringProps {
  readonly packageMeta: PackageMeta
  readonly canRenameSharedBlocks?: boolean
  readonly canWriteScriptlets?: boolean
  readonly resolveTaskEntryPath?: (blockPath: BlockPath, executorEntry: string) => Promise<string | undefined>
}

const nodeIdIndices = new WeakMap<FlowLikeMeta, Map<string, number>>()

export class ManifestPackageAuthoring implements PackageAuthoring {
  public readonly packageMeta: PackageMeta
  public readonly canRenameSharedBlocks: boolean
  public readonly canWriteScriptlets: boolean
  private readonly resolveTaskEntryPathFromHost?: ManifestPackageAuthoringProps['resolveTaskEntryPath']

  public constructor(props: ManifestPackageAuthoringProps) {
    this.packageMeta = props.packageMeta
    this.canRenameSharedBlocks = props.canRenameSharedBlocks ?? true
    this.canWriteScriptlets = props.canWriteScriptlets ?? true
    this.resolveTaskEntryPathFromHost = props.resolveTaskEntryPath
  }

  public getLocalBlock(blockPath: BlockPath): SharedBlockMeta | undefined {
    return this.packageMeta.sharedBlocks.sharedBlocksByPath.get(blockPath)
  }

  public addSharedBlockNode(flowLikeMeta: FlowLikeMeta, blockMeta: SharedBlockMeta): NodeId {
    if (blockMeta.packageMeta !== this.packageMeta) {
      throw new Error(`External package blocks are not supported: ${blockMeta.blockResourceName}`)
    }

    const nodeIdIndex = getNodeIdIndex(flowLikeMeta, blockMeta.blockName)
    const nodeId = `${blockMeta.blockName}#${nodeIdIndex}` as NodeId
    const nodeTitle = blockMeta.$.title.value && `${blockMeta.$.title.value} #${nodeIdIndex}`
    const declaredInputs = inertFilterMap(blockMeta.manifest.$.inputs_def.value, (definition) =>
      isGroupDividerDef(definition) ? undefined : { handle: definition.handle, value: definition.value },
    )
    const additionalInputs = TaskBlockMeta.to(blockMeta)?.manifest.$.additional_inputs_def.value?.map((definition) => ({
      handle: definition.handle,
      value: definition.value,
    }))
    const inputsFrom: HandleInputFrom[] | undefined =
      declaredInputs && additionalInputs ? declaredInputs.concat(additionalInputs) : declaredInputs || additionalInputs

    flowLikeMeta.upsertNodes(
      blockMeta.blockType == 'subflow'
        ? {
            type: 'subflow',
            data: {
              node_id: nodeId,
              title: nodeTitle,
              inputs_from: inputsFrom,
              subflow: blockMeta.blockResourceName,
            },
          }
        : {
            type: 'task',
            data: {
              node_id: nodeId,
              title: nodeTitle,
              inputs_from: inputsFrom,
              task: blockMeta.blockResourceName,
              inputs_def: TaskBlockMeta.to(blockMeta)?.manifest.$.additional_inputs_def.value,
              outputs_def: TaskBlockMeta.to(blockMeta)?.manifest.$.additional_outputs_def.value,
            },
          },
    )

    return nodeId
  }

  public propagateHandleRename(blockMeta: BlockMeta, section: 'input' | 'output', [oldName, newName]: [oldName: HandleName, newName: HandleName]): void {
    if (section == 'input') {
      this.linkEditInputHandleRename(blockMeta, this.packageMeta.flows.flowsByName.values(), oldName, newName)
      this.linkEditInputHandleRename(blockMeta, this.packageMeta.sharedBlocks.subflowBlocksByName.values(), oldName, newName)
    } else {
      this.linkEditOutputHandleRename(blockMeta, this.packageMeta.flows.flowsByName.values(), oldName, newName)
      this.linkEditOutputHandleRename(blockMeta, this.packageMeta.sharedBlocks.subflowBlocksByName.values(), oldName, newName)
    }
  }

  private linkEditInputHandleRename(blockMeta: BlockMeta, flows: Iterable<FlowLikeMeta>, oldName: HandleName, newName: HandleName): void {
    for (const flowLikeMeta of flows) {
      this.updateInputHandleReferences(flowLikeMeta, blockMeta, oldName, newName, Object.is(flowLikeMeta, blockMeta))
    }
  }

  private updateInputHandleReferences(
    flowLikeMeta: FlowLikeMeta,
    blockMeta: BlockMeta,
    oldName: HandleName,
    newName: HandleName,
    updateFromFlow: boolean,
  ): void {
    const matchesBlockInstance = (fromNode: HandleFromNode): boolean => {
      const upstream = flowLikeMeta.nodes.get(fromNode.node_id)
      return upstream?.$.blockMeta.value === blockMeta
    }

    if (updateFromFlow) {
      const outputsFrom$ = flowLikeMeta.manifest.$$.outputs_from
      if (outputsFrom$.value) {
        outputsFrom$.set(inertFilterMap(outputsFrom$.value, (output) => mapOutputsFrom(output, oldName, newName)))
      }
    }

    for (const nodeMeta of flowLikeMeta.nodes.values()) {
      const inputsFrom$ = nodeMeta.manifest.$$.inputs_from
      if (inputsFrom$.value) {
        inputsFrom$.set(
          inertFilterMap(inputsFrom$.value, (input) =>
            mapInputsFrom(input, oldName, newName, updateFromFlow, nodeMeta.$.blockMeta.value === blockMeta ? undefined : matchesBlockInstance),
          ),
        )
      }
    }
  }

  private linkEditOutputHandleRename(blockMeta: BlockMeta, flows: Iterable<FlowLikeMeta>, oldName: HandleName, newName: HandleName): void {
    for (const flowLikeMeta of flows) {
      const matchesBlockInstance = (fromNode: HandleFromNode): boolean => {
        const upstream = flowLikeMeta.nodes.get(fromNode.node_id)
        return upstream?.$.blockMeta.value === blockMeta
      }
      const instanceNodeIds = new Set<NodeId>()
      for (const nodeMeta of flowLikeMeta.nodes.values()) {
        if (nodeMeta.$.blockMeta.value === blockMeta) {
          instanceNodeIds.add(nodeMeta.nodeId)
        }
        const inputsFrom$ = nodeMeta.manifest.$$.inputs_from
        if (inputsFrom$.value) {
          inputsFrom$.set(inertFilterMap(inputsFrom$.value, (input) => mapInputsFrom(input, oldName, newName, false, matchesBlockInstance)))
        }
      }
      if (instanceNodeIds.size > 0) {
        const outputsFrom$ = flowLikeMeta.manifest.$$.outputs_from
        if (outputsFrom$.value) {
          outputsFrom$.set(inertFilterMap(outputsFrom$.value, (output) => mapOutputsFrom(output, oldName, newName, instanceNodeIds)))
        }
      }
    }
  }

  public getAddNodeItems(): readonly AddNodeBlockItem[] {
    const blocks: AddNodeBlockItem[] = []

    for (const block of this.packageMeta.sharedBlocks.sharedBlocksByPath.values()) {
      const inputHandles = inertFilterMap(block.$.displayInputHandleDefs.value, (definition) =>
        isGroupDividerDef(definition)
          ? undefined
          : {
              name: definition.handle,
              json_schema: definition.json_schema,
              description: definition.description,
            },
      )
      const outputHandles = inertFilterMap(block.$.displayOutputHandleDefs.value, (definition) =>
        isGroupDividerDef(definition)
          ? undefined
          : {
              name: definition.handle,
              json_schema: definition.json_schema,
              description: definition.description,
            },
      )
      blocks.push({
        name: block.blockName,
        path: block.blockPath,
        icon: block.$.icon.value,
        title: block.$.title.value,
        detail: block.$.detail.value,
        description: block.$.description.value,
        input_handles: inputHandles,
        output_handles: outputHandles,
      })
    }

    return blocks
  }

  public async resolveTaskEntryPath(blockPath: BlockPath, executorEntry: string): Promise<string | undefined> {
    return this.resolveTaskEntryPathFromHost?.(blockPath, executorEntry)
  }
}

function getNodeIdIndex(flowLikeMeta: FlowLikeMeta, blockName: string): number {
  let indices = nodeIdIndices.get(flowLikeMeta)
  if (!indices) {
    indices = new Map()
    nodeIdIndices.set(flowLikeMeta, indices)
  }

  let index = indices.get(blockName) || 0
  let nodeId: NodeId
  do {
    nodeId = `${blockName}#${++index}` as NodeId
  } while (flowLikeMeta.nodes.has(nodeId))
  indices.set(blockName, index)
  return index
}

function mapOutputsFrom(output: HandleOutputFrom, oldName: HandleName, newName: HandleName, instanceNodeIds?: ReadonlySet<NodeId>): HandleOutputFrom {
  let nextOutput = output
  if (instanceNodeIds?.size && output.from_node) {
    const fromNode = inertFilterMap(output.from_node, (source) =>
      instanceNodeIds.has(source.node_id) && source.output_handle === oldName ? { ...source, output_handle: newName } : source,
    )
    if (fromNode !== output.from_node) {
      nextOutput = { ...output, from_node: fromNode }
    }
  }
  if (nextOutput.from_flow) {
    const fromFlow = inertFilterMap(nextOutput.from_flow, (source) => (source.input_handle === oldName ? { ...source, input_handle: newName } : source))
    if (fromFlow !== nextOutput.from_flow) {
      return { ...nextOutput, from_flow: fromFlow }
    }
  }
  return nextOutput
}

function mapInputsFrom(
  input: HandleInputFrom,
  oldName: HandleName,
  newName: HandleName,
  updateFromFlow: boolean,
  matchesBlockInstance?: (fromNode: HandleFromNode) => boolean,
): HandleInputFrom {
  let nextInput = input
  if (matchesBlockInstance) {
    if (input.from_node) {
      const fromNode = inertFilterMap(input.from_node, (source) =>
        matchesBlockInstance(source) && source.output_handle === oldName ? { ...source, output_handle: newName } : source,
      )
      if (fromNode !== input.from_node) {
        nextInput = { ...input, from_node: fromNode }
      }
    }
  } else if (input.handle === oldName) {
    nextInput = { ...input, handle: newName }
  }
  if (updateFromFlow && nextInput.from_flow) {
    const fromFlow = inertFilterMap(nextInput.from_flow, (source) => (source.input_handle === oldName ? { ...source, input_handle: newName } : source))
    if (fromFlow !== nextInput.from_flow) {
      return { ...nextInput, from_flow: fromFlow }
    }
  }
  return nextInput
}
