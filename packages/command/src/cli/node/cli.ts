import type { CommandHost, Runtime, ParsedArguments } from './support.ts'

import { ApiError, ControlClient } from '@oomol-lab/open-flow/control-api'
import { flowCommand } from './flowCommands.ts'
import { projectCommand } from './projectCommands.ts'
import { CliError, localized, parseArguments, allProjects, cloudError } from './support.ts'

interface Choice {
  readonly label: string
  readonly value: string
}

async function choose(runtime: Runtime, title: string, choices: readonly Choice[]): Promise<string> {
  runtime.stdout.write(`\n${title}\n`)
  choices.forEach((choice, index) => runtime.stdout.write(`  ${index + 1}. ${choice.label}\n`))
  while (true) {
    const value = Number((await runtime.question(localized(runtime.language, 'Choose: ', '请选择：'))).trim())
    if (Number.isSafeInteger(value) && value > 0 && value <= choices.length) return choices[value - 1]!.value
    runtime.stderr.write(`${localized(runtime.language, 'Enter one of the listed numbers.', '请输入列表中的数字。')}\n`)
  }
}

async function promptName(runtime: Runtime, english: string, chinese: string): Promise<string | undefined> {
  const value = (await runtime.question(`${localized(runtime.language, english, chinese)}: `)).trim()
  return value.length == 0 ? undefined : value
}

async function interactive(client: ControlClient, host: CommandHost, runtime: Runtime): Promise<void> {
  let projectId: string | undefined
  let flowId: string | undefined
  const preferredProject = runtime.env.OO_FLOW_PROJECT ?? (await host.getProject())

  if (preferredProject != null) {
    const projects = await allProjects(client)
    const byId = projects.find((project) => project.projectId == preferredProject)
    const byName = projects.filter((project) => project.name == preferredProject)
    projectId = byId?.projectId ?? (byName.length == 1 ? byName[0]!.projectId : undefined)
  }

  while (true) {
    if (projectId == null) {
      const projects = await allProjects(client)
      const selected = await choose(runtime, localized(runtime.language, 'Projects', '项目'), [
        ...projects.map((project) => ({ label: project.name, value: project.projectId })),
        { label: localized(runtime.language, 'Create Project', '创建项目'), value: 'create' },
        { label: localized(runtime.language, 'Quit', '退出'), value: 'quit' },
      ])
      if (selected == 'quit') return
      if (selected == 'create') {
        const projectName = await promptName(runtime, 'Project name', '项目名称')
        if (projectName == null) continue
        const before = new Set(projects.map((project) => project.projectId))
        if ((await runCli(['project', 'create', projectName], host, runtime)) == 0) {
          const created = (await allProjects(client)).filter((project) => !before.has(project.projectId))
          if (created.length == 1) projectId = created[0]!.projectId
        }
        continue
      }
      projectId = selected
      continue
    }

    if (flowId == null) {
      const flows = (await client.listFlows(projectId)).filter((flow) => flow.draft != null)
      const selected = await choose(runtime, localized(runtime.language, 'Flows', 'Flow'), [
        ...flows.map((flow) => ({ label: flow.draft!.name, value: flow.flowId })),
        { label: localized(runtime.language, 'Create Flow', '创建 Flow'), value: 'create' },
        { label: localized(runtime.language, 'Choose another Project', '切换项目'), value: 'project' },
        { label: localized(runtime.language, 'Quit', '退出'), value: 'quit' },
      ])
      if (selected == 'quit') return
      if (selected == 'project') {
        projectId = undefined
        continue
      }
      if (selected == 'create') {
        const flowName = await promptName(runtime, 'Flow name', 'Flow 名称')
        if (flowName == null) continue
        const before = new Set(flows.map((flow) => flow.flowId))
        if ((await runCli(['create', flowName, '--project', projectId], host, runtime)) == 0) {
          const created = (await client.listFlows(projectId)).filter((flow) => flow.draft != null && !before.has(flow.flowId))
          if (created.length == 1) flowId = created[0]!.flowId
        }
        continue
      }
      flowId = selected
      continue
    }

    const action = await choose(runtime, localized(runtime.language, 'Actions', '操作'), [
      { label: localized(runtime.language, 'View', '查看'), value: 'show' },
      { label: localized(runtime.language, 'Rename', '重命名'), value: 'rename' },
      { label: localized(runtime.language, 'Check', '检查'), value: 'check' },
      { label: localized(runtime.language, 'Run Draft', '运行草稿'), value: 'run' },
      { label: localized(runtime.language, 'Publish', '发布'), value: 'publish' },
      { label: localized(runtime.language, 'Open Workbench', '打开 Workbench'), value: 'open' },
      { label: localized(runtime.language, 'Choose another Flow', '切换 Flow'), value: 'flow' },
      { label: localized(runtime.language, 'Choose another Project', '切换项目'), value: 'project' },
      { label: localized(runtime.language, 'Quit', '退出'), value: 'quit' },
    ])
    if (action == 'quit') return
    if (action == 'flow') {
      flowId = undefined
      continue
    }
    if (action == 'project') {
      projectId = undefined
      flowId = undefined
      continue
    }
    if (action == 'rename') {
      const nextName = await promptName(runtime, 'New Flow name', '新的 Flow 名称')
      if (nextName != null) await runCli(['rename', flowId, nextName, '--project', projectId], host, runtime)
      continue
    }
    await runCli([action, flowId, '--project', projectId], host, runtime)
  }
}

function help(runtime: Runtime): string {
  return localized(
    runtime.language,
    [
      'Open Flow commands',
      '',
      '  oo flow project <list|create|show|use|current>',
      '  oo flow list',
      '  oo flow create <name>',
      '  oo flow show <flow>',
      '  oo flow inspect <flow> [--summary]',
      '  oo flow apply <flow> --file <path|-> [--expected-revision <revision>]',
      '  oo flow rename <flow> <new-name>',
      '  oo flow delete <flow> --yes',
      '  oo flow check <flow>',
      '  oo flow node <list|show|add|set|remove> <flow>',
      '  oo flow node add <flow> code <name> [--code <javascript|@file|->]',
      '  oo flow connect <flow> <source> <source-output> <target-node> <target-input>',
      '  oo flow disconnect <flow> <source> <source-output> <target-node> <target-input>',
      '  oo flow code <list|show|edit|set>',
      '  oo flow connector <list|search|show|connections|add|set>',
      '  oo flow trigger <search|show|list|add|set|remove>',
      '  oo flow run <flow> [--source draft|live] [--input <json|@file|->] [--wait]',
      '  oo flow runs <list|show|events|result|cancel>',
      '  oo flow publish <flow>',
      '  oo flow publications <list|show> <flow>',
      '  oo flow rollback <flow> <publication>',
      '  oo flow open [flow]',
      '  oo flow workbench [flow]',
      '',
      'Options: --project <project>, --json, --cursor <cursor>, --limit <count>',
    ].join('\n'),
    [
      'Open Flow 命令',
      '',
      '  oo flow project <list|create|show|use|current>',
      '  oo flow <list|create|show|inspect|apply|rename|delete|check|node|connect|disconnect|code|connector|trigger|run|runs|publish|publications|rollback|open|workbench>',
      '',
      '选项：--project <project>、--json、--cursor <cursor>、--limit <count>',
    ].join('\n'),
  )
}

export async function runCli(args: readonly string[], host: CommandHost, runtime: Runtime): Promise<number> {
  let parsed: ParsedArguments | undefined
  try {
    if (args.length == 0 && runtime.interactive) {
      await interactive(new ControlClient(host.request), host, runtime)
      return 0
    }
    if (args.length == 0 || args.includes('--help') || args.includes('-h')) {
      runtime.stdout.write(`${help(runtime)}\n`)
      return 0
    }
    parsed = parseArguments(args)
    const client = new ControlClient(host.request)
    if (parsed.positionals[0] == 'project') await projectCommand(client, host, parsed, runtime)
    else await flowCommand(client, host, parsed, runtime)
    return 0
  } catch (error) {
    let value: CliError
    if (error instanceof CliError) value = error
    else if (error instanceof ApiError) value = cloudError(error)
    else value = new CliError('flow.unexpected', error instanceof Error ? error.message : String(error))
    if (parsed?.json == true) {
      runtime.stderr.write(
        `${JSON.stringify({ error: { code: value.code, ...(value.details == null ? {} : { details: value.details }), message: value.message }, version: 1 })}\n`,
      )
    } else {
      runtime.stderr.write(`${value.code}: ${value.message}\n`)
    }
    return 1
  }
}
