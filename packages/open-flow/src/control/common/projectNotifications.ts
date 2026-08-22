export type ProjectChangeEvent =
  | {
      readonly kind: 'draft.changed'
      readonly projectId: string
      readonly revisionId: string
      readonly version: 1
    }
  | {
      readonly flowId: string
      readonly kind: 'run.created'
      readonly projectId: string
      readonly runId: string
      readonly version: 1
    }
