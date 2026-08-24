import type { CommandHost, Runtime, ParsedArguments } from './support.ts'

import { ControlClient } from '@oomol-lab/open-flow/control-api'
import { createFlow, deleteFlow, renameFlow } from '@oomol-lab/open-flow/project-authoring'
import { codeCommand, edgeCommand, nodeCommand, inspectFlowCommand, applyFlowCommand } from './authoringCommands.ts'
import { connectorCommand, triggerCommand } from './connectorCommands.ts'
import { createRunCommand, runsCommand, publishCommand, publicationsCommand, rollbackCommand } from './projectCommands.ts'
import { CliError, checkedResourceName, currentProject, exactFlow, requireCount, write, flowText, changeDraft } from './support.ts'

export async function flowCommand(client: ControlClient, host: CommandHost, args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, ...operands] = args.positionals
  const project = await currentProject(client, host, args, runtime)

  switch (operation) {
    case 'apply':
      return await applyFlowCommand(client, project, operands, args, runtime)
    case 'code':
      return await codeCommand(client, project, operands, args, runtime)
    case 'connector':
      return await connectorCommand(client, project, operands, args, runtime)
    case 'connect':
    case 'disconnect':
      return await edgeCommand(client, project, operation, operands, args, runtime)
    case 'node':
      return await nodeCommand(client, project, operands, args, runtime)
    case 'inspect':
      return await inspectFlowCommand(client, project, operands, args, runtime)
    case 'run':
      return await createRunCommand(client, project, operands, args, runtime)
    case 'runs':
      return await runsCommand(client, project, operands, args, runtime)
    case 'publish':
      return await publishCommand(client, project, operands, args, runtime)
    case 'publications':
      return await publicationsCommand(client, project, operands, args, runtime)
    case 'rollback':
      return await rollbackCommand(client, project, operands, args, runtime)
    case 'trigger':
      return await triggerCommand(client, project, operands, args, runtime)
    case 'open':
    case 'workbench': {
      if (operands.length > 1) throw new CliError('cli.invalid-arguments', `Usage: oo flow ${operation} [flow] [--project <project>] [--json]`)
      if (host.getWorkbenchUrl == null) throw new CliError('workbench.unavailable', 'This CLI host cannot provide a Workbench URL.')
      const flow = operands[0] == null ? undefined : exactFlow(await client.listFlows(project.projectId), operands[0]!)
      const url = await host.getWorkbenchUrl(project.projectId, flow?.flowId)
      if (operation == 'open') await runtime.openUrl(url)
      write(runtime, args.json, { ...(flow == null ? {} : { flow }), kind: `flow.${operation}`, project, url, version: 1 }, url)
      return
    }
    case 'list': {
      requireCount(operands, 0, 'oo flow list [--project <project>] [--json]')
      const flows = await client.listFlows(project.projectId)
      write(runtime, args.json, { flows, kind: 'flow.list', project, version: 1 }, flows.map(flowText).join('\n'))
      return
    }
    case 'create': {
      requireCount(operands, 1, 'oo flow create <name> [--project <project>] [--json]')
      const name = checkedResourceName(operands[0]!, 'Flow')
      const flows = await client.listFlows(project.projectId)
      if (flows.some((flow) => flow.draft?.name == name)) throw new CliError('flow.conflict', `Draft Flow ${JSON.stringify(name)} already exists.`)
      const flowId = crypto.randomUUID()
      const target = { flowId, kind: 'flow', name }
      const changed = await changeDraft(client, project.projectId, project.draftRevisionId, target, createFlow(flowId, name))
      write(runtime, args.json, { kind: 'flow.create', revision: changed.revision, target, version: 1 }, `${name}\t${flowId}\t${changed.revision.revisionId}`)
      return
    }
    case 'show': {
      requireCount(operands, 1, 'oo flow show <flow> [--project <project>] [--json]')
      const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!)
      write(runtime, args.json, { flow, kind: 'flow.show', project, version: 1 }, flowText(flow))
      return
    }
    case 'rename': {
      requireCount(operands, 2, 'oo flow rename <flow> <new-name> [--project <project>] [--json]')
      const flows = await client.listFlows(project.projectId)
      const flow = exactFlow(flows, operands[0]!, true)
      const name = checkedResourceName(operands[1]!, 'Flow')
      if (flows.some((candidate) => candidate.flowId != flow.flowId && candidate.draft?.name == name)) {
        throw new CliError('flow.conflict', `Draft Flow ${JSON.stringify(name)} already exists.`)
      }
      const target = { flowId: flow.flowId, kind: 'flow', name }
      const changed = await changeDraft(client, project.projectId, flow.draft!.revisionId, target, renameFlow(flow.flowId, name))
      write(
        runtime,
        args.json,
        { kind: 'flow.rename', revision: changed.revision, target, version: 1 },
        `${name}\t${flow.flowId}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'delete': {
      requireCount(operands, 1, 'oo flow delete <flow> --yes [--project <project>] [--json]')
      if (!args.yes) throw new CliError('flow.confirmation-required', 'Flow deletion requires --yes.')
      const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, true)
      const target = { flowId: flow.flowId, kind: 'flow', name: flow.draft!.name }
      const changed = await changeDraft(client, project.projectId, flow.draft!.revisionId, target, deleteFlow(flow.flowId))
      write(
        runtime,
        args.json,
        { kind: 'flow.delete', revision: changed.revision, target, version: 1 },
        `${target.name}\t${flow.flowId}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'check': {
      requireCount(operands, 1, 'oo flow check <flow> [--project <project>] [--json]')
      const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, true)
      const check = await client.checkFlow(project.projectId, flow.draft!.revisionId, flow.flowId)
      write(
        runtime,
        args.json,
        { check, kind: 'flow.check', scope: 'revision', version: 1 },
        `${check.valid ? 'valid' : 'invalid'}\trevision\t${flow.draft!.name}\t${flow.flowId}`,
      )
      if (!check.valid) throw new CliError('flow.invalid', 'The Flow has diagnostics.', { diagnostics: check.diagnostics })
      return
    }
    default:
      throw new CliError(
        'cli.invalid-arguments',
        'Usage: oo flow <list|create|show|inspect|apply|rename|delete|check|node|connect|disconnect|code|connector|trigger|run|runs|publish|publications|rollback|workbench>',
      )
  }
}
