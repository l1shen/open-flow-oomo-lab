#!/usr/bin/env bun

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { commandArtifactVersion } from '../../distribution/common/commandProtocol.ts'
import { runCli } from './cli.ts'

export { commandArtifactVersion }

declare const openFlowVersionBuildConstant: string

export interface OpenFlowCommandHost {
  readonly cloudRequest?: (path: string, init?: RequestInit) => Promise<Response>
  getWorkbenchUrl?(projectId: string, flowId?: string): Promise<string>
  getProject?(): Promise<string | undefined>
  readonly language?: string
  setProject?(projectId: string): Promise<void>
}

async function openExternalUrl(url: string): Promise<void> {
  const command =
    process.platform == 'darwin' ? ['open', url] : process.platform == 'win32' ? ['rundll32', 'url.dll,FileProtocolHandler', url] : ['xdg-open', url]
  const subprocess = spawn(command[0]!, command.slice(1), { stdio: 'ignore' })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    subprocess.once('error', reject)
    subprocess.once('exit', resolve)
  })
  if (exitCode != 0) throw new Error('The system browser could not be opened.')
}

export async function runOpenFlowCommand(args: readonly string[], host: OpenFlowCommandHost = {}): Promise<number> {
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(args.includes('--json') ? `${JSON.stringify({ version: openFlowVersionBuildConstant })}\n` : `${openFlowVersionBuildConstant}\n`)
    return 0
  }
  if (host.cloudRequest == null || host.getProject == null || host.getWorkbenchUrl == null || host.setProject == null) {
    process.stderr.write('Open Flow Control API is not configured in this CLI host.\n')
    return 1
  }
  return await runCli(
    args,
    {
      request: host.cloudRequest,
      getProject: host.getProject,
      getWorkbenchUrl: host.getWorkbenchUrl,
      setProject: host.setProject,
    },
    {
      env: process.env,
      language: host.language == 'zh-CN' ? 'zh-CN' : 'en',
      openUrl: openExternalUrl,
      readFile: async (path) => await readFile(path, 'utf8'),
      readStdin: async () => {
        let value = ''
        for await (const chunk of process.stdin) value += String(chunk)
        return value
      },
      stderr: process.stderr,
      stdout: process.stdout,
      wait: async (milliseconds) => await setTimeout(milliseconds),
    },
  )
}

if (import.meta.main) process.exitCode = await runOpenFlowCommand(process.argv.slice(2))
