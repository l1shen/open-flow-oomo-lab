import type { FlowPath, FlowName, BlockPath, BlockName, PackagePath, PackageName } from './manifestTypes.ts'

const MANIFEST_DIR_TYPE_MATCHER = /(?:([^\\/]+)[\\/])?([^\\/]+)\.oo\.ya?ml$/i
const MANIFEST_FILE_TYPE_MATCHER = /([^\\/]+?)(?:\.[^\\/.]*)?$/

/**
 * @param path - manifest path, e.g. `flow1/flow.oo.yaml`, `flow1.oo.yaml` or `task1/task.oo.yaml`
 * @param prefix - prefix of the manifest path, e.g. `flow` or `task`
 * @return name part of the manifest path `[name]/[prefix].oo.yaml` or `[name].oo.yaml` or `[name].xx`
 */
export const getManifestName = (path: string, prefix?: string | null): string => {
  const matchOOName = MANIFEST_DIR_TYPE_MATCHER.exec(path)
  if (matchOOName) {
    const [, dir, filename] = matchOOName
    const name = !prefix || filename === prefix ? dir : filename
    if (name) {
      return name
    }
  }
  const matchFilename = MANIFEST_FILE_TYPE_MATCHER.exec(path)
  return (matchFilename && matchFilename[1]) || path
}

export const getFlowManifestName = (flowPath: FlowPath): FlowName => getManifestName(flowPath, 'flow') as FlowName

export const getTaskBlockManifestName = (blockPath: BlockPath): BlockName => getManifestName(blockPath, 'task') as BlockName

export const getPackageManifestName = (packagePath: PackagePath): PackageName => getManifestName(packagePath, 'package') as PackageName
