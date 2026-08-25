import type { CommandHost, Runtime, ParsedArguments } from './support.ts'

import { ApiError, ControlClient } from '@oomol-lab/open-flow/control-api'
import { flowCommand } from './flowCommands.ts'
import { projectCommand } from './projectCommands.ts'
import { CliError, localized, parseArguments, cloudError } from './support.ts'

function help(runtime: Runtime, args: readonly string[]): string {
  if (args[0] == 'code') {
    const usage =
      args[1] == 'list'
        ? 'oo flow code list [--project <project>] [--json]'
        : args[1] == 'show'
          ? 'oo flow code show <module> [--project <project>] [--json]'
          : args[1] == 'edit'
            ? 'oo flow code edit <module> --code <javascript|@file|-> [--project <project>] [--json]'
            : args[1] == 'set'
              ? 'oo flow code set <module> --name <name> [--project <project>] [--json]'
              : 'oo flow code <list|show|edit|set>'
    return localized(runtime.language, `Usage: ${usage}`, `用法：${usage}`)
  }
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
    if (args.length == 0 || args.includes('--help') || args.includes('-h')) {
      runtime.stdout.write(`${help(runtime, args)}\n`)
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
