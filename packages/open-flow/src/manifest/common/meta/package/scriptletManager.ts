import type { NodeMeta } from '../nodeMeta.ts'

import { noop } from '@wopjs/cast'
import { join } from '../../../../base/common/posixPath.ts'

export interface ScriptletsManagerContext {
  readScriptletSource(path: string): Promise<string | undefined>
  removeFileDir(fileOrDirPath: string): Promise<void>
  writeScriptletFile(flowLikeDir: string, extname: string, source: string): Promise<string>
  duplicateScriptletFile(flowLikeDir: string, refScriptletFilePath: string): Promise<string>
}

export class ScriptletsManager {
  public readonly dispose: () => void = noop

  public constructor(private readonly ctx: ScriptletsManagerContext) {}

  /** @internal */
  public async clearUnusedScriptlets(toRemoveNodes: readonly NodeMeta[]): Promise<void> {
    // Only top-level scriptlets need explicit cleanup.
    await Promise.all(
      toRemoveNodes
        .map((nodeMeta) => nodeMeta.$.scriptletEntry.value)
        .map(async (entryPath) => {
          if (entryPath?.includes('/scriptlets/')) await this.ctx.removeFileDir(entryPath).catch(console.error)
        }),
    )
  }

  /** Writes a scriptlet and returns its relative entry path. */
  public async writeNewScriptlet(flowLikeDir: string, extname: string, source: string): Promise<string> {
    return this.ctx.writeScriptletFile(flowLikeDir, extname, source)
  }

  /** Removes a scriptlet created by an authoring operation that did not commit. */
  public async removeScriptlet(flowLikeDir: string, entry: string): Promise<void> {
    await this.ctx.removeFileDir(join(flowLikeDir, entry))
  }

  /** Duplicates a scriptlet and returns its relative entry path. */
  public async duplicateScriptlet(flowLikeDir: string, refScriptletFilePath: string): Promise<string> {
    return this.ctx.duplicateScriptletFile(flowLikeDir, refScriptletFilePath)
  }

  public async readScriptletFile(scriptletFilePath: string): Promise<string | undefined> {
    return this.ctx.readScriptletSource(scriptletFilePath)
  }
}
