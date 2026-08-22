export type DesignerType = `${DESIGNER_TYPE}`
export enum DESIGNER_TYPE {
  Flow = 'flow',
  Block = 'block',
  Subflow = 'subflow',
}

export type FlowRunStatus = `${FLOW_RUN_STATUS}`
export enum FLOW_RUN_STATUS {
  Idle = 'idle',
  Running = 'running',
}
