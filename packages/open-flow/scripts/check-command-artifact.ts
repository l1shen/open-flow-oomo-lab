import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { commandArtifactEntryFile, commandArtifactManifestFile, commandArtifactVersion } from '../src/distribution/common/commandArtifact.ts'
import { decodeCommandArchive, extractCommandArchive } from '../src/distribution/node/commandArchive.ts'

const execFileAsync = promisify(execFile)
const rootPath = path.resolve(import.meta.dirname, '..')
const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-command-'))

try {
  const firstArchive = await buildCommandArchive()
  const secondArchive = await buildCommandArchive()
  assert.deepEqual(secondArchive, firstArchive, 'Command archive bytes changed between builds.')

  const decoded = await decodeCommandArchive(firstArchive)
  assert.equal(decoded.manifest.version, commandArtifactVersion)
  assert.deepEqual(
    decoded.files.map((file) => file.path).toSorted(),
    ['LICENSE', 'LICENSE.md', 'NOTICE', commandArtifactEntryFile, commandArtifactManifestFile].toSorted(),
  )
  assert.equal(decoded.files.find((file) => file.path == commandArtifactEntryFile)?.mode, 0o755)

  const extractedRoot = path.join(directory, 'open-flow-command')
  await extractCommandArchive(firstArchive, async (entry) => {
    const outputPath = path.join(extractedRoot, entry.path)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, entry.bytes, { mode: entry.mode })
  })

  const entryPath = path.join(extractedRoot, commandArtifactEntryFile)
  assert.ok(((await stat(entryPath)).mode & 0o111) != 0)
  const entrySource = await readFile(entryPath, 'utf8')
  assert.doesNotMatch(entrySource, /src\/(?:compiler|project\/node|runtime|workbench)\//)
  const version = await execFileAsync(process.execPath, [entryPath, '--version', '--json'])
  assert.equal(version.stderr, '')
  assert.deepEqual(JSON.parse(version.stdout), { version: decoded.manifest.openFlowVersion })

  const firstCwd = path.join(directory, 'first-cwd')
  const secondCwd = path.join(directory, 'second-cwd')
  await Promise.all([mkdir(firstCwd), mkdir(secondCwd)])

  const first = await runSmoke(entryPath, firstCwd, false)
  assert.equal(first.stderr, '')
  assert.deepEqual(
    first.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).kind),
    ['project.list', 'project.use', 'flow.create', 'flow.check'],
  )

  const second = await runSmoke(entryPath, secondCwd, true)
  assert.equal(second.stderr, '')
  assert.deepEqual(JSON.parse(second.stdout), {
    flows: [
      {
        draft: {
          closureDigest: 'closure-2',
          name: 'Main',
          revisionDigest: 'digest-revision-2',
          revisionId: 'revision-2',
        },
        flowId: 'flow-1',
        hasUnpublishedChanges: true,
        live: null,
      },
    ],
    kind: 'flow.list',
    project: project('revision-2'),
    version: 1,
  })

  console.log('Verified deterministic Command Artifact v2 and Control API CLI smoke tests from two working directories.')
} finally {
  await rm(directory, { force: true, recursive: true })
}

async function buildCommandArchive(): Promise<Uint8Array> {
  await execFileAsync(process.execPath, [path.join(rootPath, 'scripts/build.ts'), '--command-only', '--quiet'], { cwd: rootPath })
  const archives = (await readdir(path.join(rootPath, 'dist/release'))).filter((file) => file.endsWith('.tar.gz'))
  assert.equal(archives.length, 1)
  return await readFile(path.join(rootPath, 'dist/release', archives[0]!))
}

async function runSmoke(entryPath: string, cwd: string, readOnly: boolean): Promise<{ readonly stderr: string; readonly stdout: string }> {
  const script = smokeScript(pathToFileURL(entryPath).href, readOnly)
  return await execFileAsync(process.execPath, ['-e', script], {
    cwd,
    env: { ...process.env, BUN_CONFIG_NO_INSTALL: '1' },
  })
}

function smokeScript(entryUrl: string, readOnly: boolean): string {
  return `
import assert from 'node:assert/strict'

const entry = await import(${JSON.stringify(entryUrl)})
assert.equal('requiredBunVersion' in entry, false)
const project = ${JSON.stringify(project(readOnly ? 'revision-2' : 'revision-1'))}
const revision = ${JSON.stringify(revision())}
let selectedProject = ${readOnly ? JSON.stringify('project-1') : 'undefined'}
let flow = ${readOnly ? JSON.stringify(flow()) : 'undefined'}
const requests = []
const host = {
  async request(path, init = {}) {
    requests.push({ path, init })
    if (path === '/v1/projects?limit=100') {
      return Response.json({ projects: [project], version: 1 })
    }
    if (path === '/v1/projects/project-1') return Response.json(project)
    if (path === '/v1/projects/project-1/flows') {
      return Response.json({ flows: flow == null ? [] : [flow], projectId: 'project-1', version: 1 })
    }
    if (path === '/v1/projects/project-1/draft/changes') {
      const body = JSON.parse(String(init.body))
      assert.equal(body.expectedRevisionId, 'revision-1')
      assert.equal(body.operations.length, 1)
      assert.equal(body.operations[0].kind, 'flow.create')
      flow = {
        draft: {
          closureDigest: 'closure-2',
          name: body.operations[0].flow.name,
          revisionDigest: 'digest-revision-2',
          revisionId: 'revision-2',
        },
        flowId: body.operations[0].flowId,
        hasUnpublishedChanges: true,
        live: null,
      }
      return Response.json({
        draftFlows: [{ closureDigest: 'closure-2', flowId: flow.flowId, name: flow.draft.name }],
        revision,
        version: 1,
      })
    }
    if (path.startsWith('/v1/projects/project-1/revisions/revision-2/flows/') && path.endsWith('/check')) {
      return Response.json({
        closureDigest: 'closure-2',
        diagnostics: [],
        engineContract: 'open-flow-engine/v1',
        flowId: flow.flowId,
        modelVersion: 1,
        projectId: 'project-1',
        revisionDigest: 'digest-revision-2',
        revisionId: 'revision-2',
        valid: true,
        version: 1,
      })
    }
    throw new Error(\`Unexpected Control API request: \${init.method ?? 'GET'} \${path}\`)
  },
  async getProject() {
    return selectedProject
  },
  async getWorkbenchUrl(projectId, flowId) {
    return 'https://console.example/team/example/flows/' + encodeURIComponent(projectId)
      + (flowId == null ? '' : '/flows/' + encodeURIComponent(flowId) + '/design')
  },
  async setProject(projectId) {
    selectedProject = projectId
  },
}

const commands = ${JSON.stringify(
    readOnly
      ? [['list', '--json']]
      : [
          ['project', 'list', '--json'],
          ['project', 'use', 'project-1', '--json'],
          ['create', 'Main', '--json'],
          ['check', 'Main', '--json'],
        ],
  )}
for (const args of commands) assert.equal(await entry.runOpenFlowCommand(args, host), 0)
assert.equal(selectedProject, 'project-1')
const changes = requests.filter(({ path }) => path.endsWith('/draft/changes'))
assert.equal(changes.length, ${readOnly ? 0 : 1})
if (changes.length === 1) assert.equal(new Headers(changes[0].init.headers).has('idempotency-key'), false)
`
}

function project(revisionId: string) {
  return {
    createdAt: '2026-08-14T00:00:00.000Z',
    draftRevisionId: revisionId,
    name: 'Example',
    projectId: 'project-1',
    status: 'active',
    updatedAt: '2026-08-14T00:00:00.000Z',
    version: 1,
  }
}

function revision() {
  return {
    actorId: 'actor-1',
    createdAt: '2026-08-14T00:00:01.000Z',
    digest: 'digest-revision-2',
    modelVersion: 1,
    parentRevisionId: 'revision-1',
    projectId: 'project-1',
    revisionId: 'revision-2',
    version: 1,
  }
}

function flow() {
  return {
    draft: {
      closureDigest: 'closure-2',
      name: 'Main',
      revisionDigest: 'digest-revision-2',
      revisionId: 'revision-2',
    },
    flowId: 'flow-1',
    hasUnpublishedChanges: true,
    live: null,
  }
}
