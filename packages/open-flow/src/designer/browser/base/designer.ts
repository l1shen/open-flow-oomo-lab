import type { XYPosition } from '@xyflow/react'

export const DESIGNER_CLASSNAME = 'oo-designer'

/** Marks an area that React Flow can drag. */
export const NODE_HANDLE_CLASSNAME = 'oo-designer-node-handle'

/** Marks one handle row. */
export const HANDLE_ROW_CLASSNAME = 'oo-designer-handle-row'
export const HANDLE_ROW_EXPANDED_CLASSNAME = 'oo-designer-handle-row-expanded'

export const DEFAULT_POSITION: XYPosition = /* @__PURE__ */ Object.freeze({ x: 0, y: 0 })
