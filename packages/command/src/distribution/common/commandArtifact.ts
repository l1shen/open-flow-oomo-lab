import { z } from 'zod'
import { commandArtifactEntryFile, commandArtifactFormat, commandArtifactManifestFile, commandArtifactVersion } from './commandProtocol.ts'

export { commandArtifactEntryFile, commandArtifactFormat, commandArtifactManifestFile, commandArtifactVersion } from './commandProtocol.ts'

export interface CommandArtifactFile {
  readonly digest: string
  readonly length: number
  readonly path: string
}

export interface CommandArtifactManifest {
  readonly bunVersion: string
  readonly entry: typeof commandArtifactEntryFile
  readonly files: readonly CommandArtifactFile[]
  readonly format: typeof commandArtifactFormat
  readonly openFlowVersion: string
  readonly version: typeof commandArtifactVersion
}

const digestPattern = /^[0-9a-f]{64}$/

const fileSchema = z
  .object({
    digest: z.string().regex(digestPattern),
    length: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    path: z.string().refine(normalizedCommandArtifactPath, 'Command artifact file paths must be normalized relative paths.'),
  })
  .strict()

const manifestSchema = z
  .object({
    bunVersion: z.string().min(1),
    entry: z.literal(commandArtifactEntryFile),
    files: z.array(fileSchema),
    format: z.literal(commandArtifactFormat),
    openFlowVersion: z.string().min(1),
    version: z.literal(commandArtifactVersion),
  })
  .strict()
  .superRefine((manifest, context) => {
    let previousPath: string | undefined
    for (const [index, file] of manifest.files.entries()) {
      if (file.path == commandArtifactManifestFile) {
        context.addIssue({
          code: 'custom',
          message: 'The command artifact manifest cannot list itself.',
          path: ['files', index, 'path'],
        })
      }
      if (previousPath != null && compareCommandArtifactPaths(previousPath, file.path) >= 0) {
        context.addIssue({
          code: 'custom',
          message: 'Command artifact files must have unique paths in Unicode code-point order.',
          path: ['files', index, 'path'],
        })
      }
      previousPath = file.path
    }

    if (!manifest.files.some((file) => file.path == commandArtifactEntryFile)) {
      context.addIssue({
        code: 'custom',
        message: `Command artifact is missing required file ${JSON.stringify(commandArtifactEntryFile)}.`,
        path: ['files'],
      })
    }
  })

function nextCodePoint(source: string, index: number): readonly [number, number] {
  const codePoint = source.codePointAt(index)
  if (codePoint == null) return [-1, index]
  return [codePoint, index + (codePoint > 0xffff ? 2 : 1)]
}

export function compareCommandArtifactPaths(left: string, right: string): number {
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const [leftCodePoint, nextLeftIndex] = nextCodePoint(left, leftIndex)
    const [rightCodePoint, nextRightIndex] = nextCodePoint(right, rightIndex)
    if (leftCodePoint != rightCodePoint) return leftCodePoint < rightCodePoint ? -1 : 1
    leftIndex = nextLeftIndex
    rightIndex = nextRightIndex
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0
}

export function normalizedCommandArtifactPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.isWellFormed() &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    !/^[A-Za-z]:\//.test(path) &&
    path.split('/').every((part) => part.length > 0 && part != '.' && part != '..')
  )
}

export function stringifyCanonicalCommandJson(value: unknown): string {
  if (value === null || typeof value == 'boolean' || typeof value == 'string') return JSON.stringify(value)
  if (typeof value == 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Command artifact manifests cannot contain non-finite numbers.')
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (Array.isArray(value)) return `[${value.map(stringifyCanonicalCommandJson).join(',')}]`
  if (typeof value == 'object') {
    return `{${Object.keys(value)
      .toSorted(compareCommandArtifactPaths)
      .map((key) => `${JSON.stringify(key)}:${stringifyCanonicalCommandJson(Reflect.get(value, key))}`)
      .join(',')}}`
  }
  throw new TypeError(`Command artifact manifests cannot contain ${typeof value} values.`)
}

export function encodeCommandArtifactManifest(manifest: CommandArtifactManifest): string {
  return `${stringifyCanonicalCommandJson(manifestSchema.parse(manifest))}\n`
}

export function decodeCommandArtifactManifest(source: string): CommandArtifactManifest {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new TypeError(`Invalid command artifact manifest JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  const result = manifestSchema.safeParse(value)
  if (!result.success) {
    throw new TypeError(`Invalid command artifact manifest: ${result.error.issues.map((issue) => issue.message).join('; ')}`, {
      cause: result.error,
    })
  }
  if (encodeCommandArtifactManifest(result.data) != source) {
    throw new TypeError('Command artifact manifest JSON is not canonical.')
  }
  return result.data
}
