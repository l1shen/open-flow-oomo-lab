import type { CompareResult, CompareSchemaInfo } from '../../manifest/common/schemaCompare.ts'
import type { DesignerHost, UIFileContentSnapshot, UIFileSaveCandidate, UIFileSaveResult, UIFileSnapshot } from './designerHost.ts'

import { basename, dirname, join } from '../../base/common/posixPath.ts'

export type DesignerFileKind = 'file' | 'directory'

export interface DesignerFileHost {
  getKind(path: string): Promise<DesignerFileKind | undefined>
  readUIFile(path: string): Promise<UIFileContentSnapshot>
  writeUIFile(path: string, candidate: UIFileSaveCandidate): Promise<UIFileSaveResult>
}

export interface FileBackedDesignerHostProps {
  readonly files: DesignerFileHost
  readonly compareJSONSchema: (fromSchema: CompareSchemaInfo, toSchema: CompareSchemaInfo) => CompareResult | Promise<CompareResult>
}

export class FileBackedDesignerHost implements DesignerHost {
  private readonly files: DesignerFileHost
  private readonly compare: FileBackedDesignerHostProps['compareJSONSchema']

  public constructor(props: FileBackedDesignerHostProps) {
    this.files = props.files
    this.compare = props.compareJSONSchema
  }

  public writeUIFile(path: string, candidate: UIFileSaveCandidate): Promise<UIFileSaveResult> {
    return this.files.writeUIFile(path, candidate)
  }

  public async locateAndReadUIFile(manifestPath: string): Promise<UIFileSnapshot> {
    const kind = await this.files.getKind(manifestPath)
    let path: string
    if (kind == 'file') {
      const name = basename(manifestPath).replace(/\.oo\.ya?ml$/, '')
      path = join(dirname(manifestPath), `.${name}.ui.oo.json`)
    } else if (kind == 'directory') {
      path = join(manifestPath, '.ui.oo.json')
    } else {
      throw new Error(`Invalid manifest path ${manifestPath}`)
    }
    return { path, ...(await this.files.readUIFile(path)) }
  }

  public async compareJSONSchema(fromSchema: CompareSchemaInfo, toSchema: CompareSchemaInfo): Promise<CompareResult> {
    return await this.compare(fromSchema, toSchema)
  }
}
