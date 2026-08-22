export type FlowDisplayMode = 'overview' | 'detail'

export const FLOW_DISPLAY_MODES = ['overview', 'detail'] as const satisfies readonly FlowDisplayMode[]

export function isFlowDisplayMode(value: unknown): value is FlowDisplayMode {
  return FLOW_DISPLAY_MODES.some((mode) => mode === value)
}
