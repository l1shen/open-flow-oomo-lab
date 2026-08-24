import type { Project, RunDetails, RunEvent, RunEvents } from '@oomol-lab/open-flow/control-api'
import type { CommandHost, Runtime, ParsedArguments } from './support.ts'

import { ControlClient } from '@oomol-lab/open-flow/control-api'
import {
  CliError,
  checkedResourceName,
  publicationPageLimit,
  runPageLimit,
  allProjects,
  referencedProject,
  currentProject,
  exactFlow,
  requireCount,
  write,
  projectText,
  publicationText,
  runText,
  runSummaryText,
  eventText,
  runInputs,
  publicationById,
  waitForRun,
} from './support.ts'

export async function projectCommand(client: ControlClient, host: CommandHost, args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, ...operands] = args.positionals.slice(1)
  switch (operation) {
    case 'list': {
      requireCount(operands, 0, 'oo flow project list [--json]')
      const projects = await allProjects(client)
      write(runtime, args.json, { kind: 'project.list', projects, version: 1 }, projects.map(projectText).join('\n'))
      return
    }
    case 'create': {
      requireCount(operands, 1, 'oo flow project create <name> [--json]')
      const name = checkedResourceName(operands[0]!, 'Project')
      const project = await client.createProject(name)
      write(runtime, args.json, { kind: 'project.create', project, version: 1 }, projectText(project))
      return
    }
    case 'show': {
      if (operands.length > 1) throw new CliError('cli.invalid-arguments', 'Usage: oo flow project show [project] [--json]')
      const project = operands[0] == null ? await currentProject(client, host, args, runtime) : await referencedProject(client, operands[0])
      write(runtime, args.json, { kind: 'project.show', project, version: 1 }, projectText(project))
      return
    }
    case 'use': {
      requireCount(operands, 1, 'oo flow project use <project> [--json]')
      const project = await referencedProject(client, operands[0]!)
      await host.setProject(project.projectId)
      write(runtime, args.json, { kind: 'project.use', project, version: 1 }, projectText(project))
      return
    }
    case 'current': {
      requireCount(operands, 0, 'oo flow project current [--json]')
      const project = await currentProject(client, host, args, runtime)
      write(runtime, args.json, { kind: 'project.current', project, version: 1 }, projectText(project))
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow project <list|create|show|use|current>')
  }
}

export async function createRunCommand(
  client: ControlClient,
  project: Project,
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  requireCount(operands, 1, 'oo flow run <flow> [--source draft|live] [--input <json|@file|->] [--wait] [--json]')
  const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, args.source == 'draft')
  const inputs = await runInputs(args, runtime)
  let created: RunDetails =
    args.source == 'draft'
      ? await client.createDraftRun(project.projectId, flow.draft!.revisionId, flow.flowId, { inputs })
      : await client.createLiveRun(project.projectId, flow.flowId, { inputs })
  if (args.wait) created = await waitForRun(client, project.projectId, created, runtime)
  write(runtime, args.json, { kind: 'run.create', run: created, version: 1 }, runText(created))
}

export async function runsCommand(
  client: ControlClient,
  project: Project,
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  const [operation, ...references] = operands
  switch (operation) {
    case 'list': {
      requireCount(references, 0, 'oo flow runs list [--flow <flow>] [--status <status>] [--cursor <cursor>] [--limit <count>] [--json]')
      const flow = args.flow == null ? undefined : exactFlow(await client.listFlows(project.projectId), args.flow)
      const page = await client.listRuns(project.projectId, {
        ...(args.cursor == null ? {} : { cursor: args.cursor }),
        ...(flow == null ? {} : { flowId: flow.flowId }),
        limit: args.limit ?? runPageLimit,
        ...(args.status == null ? {} : { status: args.status }),
      })
      write(runtime, args.json, { kind: 'run.list', ...page, version: 1 }, page.runs.map(runSummaryText).join('\n'))
      return
    }
    case 'show': {
      requireCount(references, 1, 'oo flow runs show <run> [--json]')
      const run = await client.getRun(project.projectId, references[0]!)
      write(runtime, args.json, { kind: 'run.show', run, version: 1 }, runText(run))
      return
    }
    case 'events': {
      requireCount(references, 1, 'oo flow runs events <run> [--after <sequence>] [--limit <count>] [--follow] [--json]')
      let after = args.after ?? 0
      const events: RunEvent[] = []
      let page: RunEvents
      do {
        page = await client.getRunEvents(project.projectId, references[0]!, { after, limit: args.limit ?? runPageLimit })
        events.push(...page.events)
        after = page.nextAfter
        if (args.follow && !page.done && page.events.length == 0) await runtime.wait(1_000)
      } while (args.follow && !page.done)
      write(runtime, args.json, { ...page, events, kind: 'run.events', version: 1 }, events.map(eventText).join('\n'))
      return
    }
    case 'result': {
      requireCount(references, 1, 'oo flow runs result <run> [--json]')
      const result = await client.getRunResult(project.projectId, references[0]!)
      write(runtime, args.json, { kind: 'run.result', result, version: 1 }, JSON.stringify(result))
      return
    }
    case 'cancel': {
      requireCount(references, 1, 'oo flow runs cancel <run> [--json]')
      const cancellation = await client.cancelRun(project.projectId, references[0]!)
      write(
        runtime,
        args.json,
        { cancellation, kind: 'run.cancel', version: 1 },
        `${cancellation.status}\t${cancellation.runId}\t${cancellation.cancelAccepted ? 'accepted' : 'already-terminal'}`,
      )
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow runs <list|show|events|result|cancel>')
  }
}

export async function publishCommand(
  client: ControlClient,
  project: Project,
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  requireCount(operands, 1, 'oo flow publish <flow> [--json]')
  const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, true)
  const live = await client.getLive(project.projectId, flow.flowId)
  const published = await client.publishFlow(project.projectId, flow.draft!.revisionId, flow.flowId, live.publication?.publicationId ?? null)
  write(runtime, args.json, { kind: 'publication.publish', publication: published, version: 1 }, publicationText(published))
}

export async function publicationsCommand(
  client: ControlClient,
  project: Project,
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  const [operation, flowReference, publicationId, ...extra] = operands
  if (flowReference == null || extra.length > 0) {
    throw new CliError('cli.invalid-arguments', 'Usage: oo flow publications <list|show> <flow> [publication]')
  }
  const flow = exactFlow(await client.listFlows(project.projectId), flowReference)
  if (operation == 'list') {
    if (publicationId != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow publications list <flow> [--cursor <cursor>] [--limit <count>]')
    const page = await client.listPublications(project.projectId, flow.flowId, {
      ...(args.cursor == null ? {} : { cursor: args.cursor }),
      limit: args.limit ?? publicationPageLimit,
    })
    write(runtime, args.json, { flow, kind: 'publication.list', project, ...page, version: 1 }, page.publications.map(publicationText).join('\n'))
    return
  }
  if (operation == 'show' && publicationId != null) {
    const publication = await publicationById(client, project.projectId, flow.flowId, publicationId)
    write(runtime, args.json, { kind: 'publication.show', publication, version: 1 }, publicationText(publication))
    return
  }
  throw new CliError('cli.invalid-arguments', 'Usage: oo flow publications <list|show> <flow> [publication]')
}

export async function rollbackCommand(
  client: ControlClient,
  project: Project,
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  requireCount(operands, 2, 'oo flow rollback <flow> <publication> [--json]')
  const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!)
  const source = await publicationById(client, project.projectId, flow.flowId, operands[1]!)
  const live = await client.getLive(project.projectId, flow.flowId)
  if (live.publication == null) throw new CliError('live.not-found', `Flow ${JSON.stringify(operands[0])} has no Live Publication.`)
  const rolledBack = await client.rollbackFlow(project.projectId, flow.flowId, source.publicationId, live.publication.publicationId)
  write(runtime, args.json, { kind: 'publication.rollback', publication: rolledBack, version: 1 }, publicationText(rolledBack))
}
