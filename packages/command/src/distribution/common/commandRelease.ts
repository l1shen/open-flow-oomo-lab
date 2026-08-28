import { z } from 'zod'
import { stringifyCanonicalCommandJson } from './commandArtifact.ts'

export const commandReleaseFormat = 'open-flow-command-release'
export const commandReleaseVersion = 1

export interface OpenFlowCommandRelease {
  readonly archive: {
    readonly digest: string
    readonly length: number
    readonly url: string
  }
  readonly bunVersion: string
  readonly format: typeof commandReleaseFormat
  readonly openFlowVersion: string
  readonly version: typeof commandReleaseVersion
}

const releaseSchema = z
  .object({
    archive: z
      .object({
        digest: z.string().regex(/^[0-9a-f]{64}$/),
        length: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        url: z.url(),
      })
      .strict(),
    bunVersion: z.string().min(1),
    format: z.literal(commandReleaseFormat),
    openFlowVersion: z.string().min(1),
    version: z.literal(commandReleaseVersion),
  })
  .strict()
  .superRefine((release, context) => {
    const segments = new URL(release.archive.url).pathname.split('/')
    if (!containsPathToken(segments, release.openFlowVersion) || !containsPathToken(segments, release.archive.digest)) {
      context.addIssue({
        code: 'custom',
        message: 'Command release URL path must contain the Open Flow version and archive digest as delimited components.',
        path: ['archive', 'url'],
      })
    }
  })

function containsPathToken(segments: readonly string[], value: string): boolean {
  const escaped = encodeURIComponent(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|[-._])${escaped}(?:$|[-._])`)
  return segments.some((segment) => pattern.test(segment))
}

export function encodeCommandRelease(release: OpenFlowCommandRelease): string {
  return `${stringifyCanonicalCommandJson(releaseSchema.parse(release))}\n`
}

export function decodeCommandRelease(source: string): OpenFlowCommandRelease {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new TypeError(`Invalid command release JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  const result = releaseSchema.safeParse(value)
  if (!result.success) {
    throw new TypeError(`Invalid command release: ${result.error.issues.map((issue) => issue.message).join('; ')}`, {
      cause: result.error,
    })
  }
  if (encodeCommandRelease(result.data) != source) throw new TypeError('Command release JSON is not canonical.')
  return result.data
}
