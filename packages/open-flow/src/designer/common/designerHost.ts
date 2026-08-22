import type { CompareResult, CompareSchemaInfo } from '../../manifest/common/schemaCompare.ts'

export interface UIFileContentSnapshot {
  readonly source: string | null
  readonly revision: string | undefined
}

export interface UIFileSnapshot extends UIFileContentSnapshot {
  readonly path: string
}

export interface UIFileSaveCandidate {
  readonly source: string | null
  readonly expectedRevision: string | undefined
}

export interface UIFileSaved {
  readonly status: 'saved'
  readonly snapshot: UIFileContentSnapshot
}

export interface UIFileSaveConflict {
  readonly status: 'conflict'
  readonly snapshot: UIFileContentSnapshot
}

export type UIFileSaveResult = UIFileSaved | UIFileSaveConflict

export interface DesignerHost {
  writeUIFile(path: string, candidate: UIFileSaveCandidate): Promise<UIFileSaveResult>
  locateAndReadUIFile(manifestPath: string): Promise<UIFileSnapshot>
  compareJSONSchema(fromSchema: CompareSchemaInfo, toSchema: CompareSchemaInfo): Promise<CompareResult>
}
