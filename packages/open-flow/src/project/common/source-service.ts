import type { Revision } from '../../base/common/revision.ts'

export interface SourceSnapshot {
  readonly source: string
  readonly revision: Revision
}

export interface SaveCandidate {
  readonly source: string
  readonly expectedRevision: Revision | AbsentSourceRevision
}

export type AbsentSourceRevision = 'absent'
export const absentSourceRevision: AbsentSourceRevision = 'absent'

export interface ProjectSourceSnapshot extends SourceSnapshot {
  readonly path: string
}

export interface ProjectSourceDeleted {
  readonly path: string
  readonly status: 'deleted'
}

export type ProjectSourceChange = ProjectSourceSnapshot | ProjectSourceDeleted

export interface ProjectSourceSaveRequest extends SaveCandidate {
  readonly path: string
  readonly overwrite?: boolean
}

export interface ProjectSourceSaveConflict {
  readonly path: string
  readonly kind: 'created' | 'deleted' | 'revision-changed'
  readonly disk: ProjectSourceSnapshot | undefined
  readonly source: string
}

export interface ProjectSourceSaved {
  readonly status: 'saved' | 'unchanged'
  readonly snapshot: ProjectSourceSnapshot
}

export interface ProjectSourceSaveRejected {
  readonly status: 'conflict'
  readonly conflict: ProjectSourceSaveConflict
}

export type ProjectSourceSaveResult = ProjectSourceSaved | ProjectSourceSaveRejected

export interface ProjectSourceService {
  readonly rootPath: string
  read(filePath: string): Promise<ProjectSourceSnapshot | undefined>
  save(request: ProjectSourceSaveRequest): Promise<ProjectSourceSaveResult>
  watch(filePath: string, listener: (change: ProjectSourceChange) => void): () => void
}
