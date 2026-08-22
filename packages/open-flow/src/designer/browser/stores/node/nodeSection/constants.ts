// Task and subflow node inputs.
export const INPUT_SECTION_TYPE = 'inputs'
export type INPUT_SECTION_TYPE = 'inputs'

// Task and subflow node outputs.
export const OUTPUT_SECTION_TYPE = 'outputs'
export type OUTPUT_SECTION_TYPE = 'outputs'

// Value Node output section.
export const VALUE_SECTION_TYPE = 'value'
export type VALUE_SECTION_TYPE = 'value'

// Task preview section.
export const PREVIEW_SECTION_TYPE = 'preview'
export type PREVIEW_SECTION_TYPE = 'preview'

// Inline task source editor section.
export const SCRIPTLET_SECTION_TYPE = 'scriptlet'
export type SCRIPTLET_SECTION_TYPE = 'scriptlet'

// Subflow input pseudo-node section.
export const SUBFLOW_INPUT_SECTION_TYPE = 'subflowInput'
export type SUBFLOW_INPUT_SECTION_TYPE = 'subflowInput'

// Subflow output pseudo-node section.
export const SUBFLOW_OUTPUT_SECTION_TYPE = 'subflowOutput'
export type SUBFLOW_OUTPUT_SECTION_TYPE = 'subflowOutput'

// Condition Node branch section.
export const CONDITIONS_SECTION_TYPE = 'conditions'
export type CONDITIONS_SECTION_TYPE = 'conditions'

// Trigger definition snapshot and configuration.
export const TRIGGER_SECTION_TYPE = 'trigger'
export type TRIGGER_SECTION_TYPE = 'trigger'

// These sections belong only to input and output pseudo-nodes.
export const PSEUDO_SECTION_TYPES: string[] = [SUBFLOW_INPUT_SECTION_TYPE, SUBFLOW_OUTPUT_SECTION_TYPE]

// Connections dragged to the left can only start from these sections.
export const LEFT_FROM_SECTION_TYPES: string[] = [INPUT_SECTION_TYPE, SUBFLOW_OUTPUT_SECTION_TYPE]

// Connections dragged to the right can only start from these sections.
export const RIGHT_FROM_SECTION_TYPES: string[] = [OUTPUT_SECTION_TYPE, VALUE_SECTION_TYPE, SUBFLOW_INPUT_SECTION_TYPE, CONDITIONS_SECTION_TYPE]

// Connections dragged to the left can only create handles in these sections.
export const LEFT_TO_SECTION_TYPES: string[] = [OUTPUT_SECTION_TYPE, VALUE_SECTION_TYPE, SUBFLOW_INPUT_SECTION_TYPE, CONDITIONS_SECTION_TYPE]

// Connections dragged to the right can only create handles in these sections.
export const RIGHT_TO_SECTION_TYPES: string[] = [INPUT_SECTION_TYPE, SUBFLOW_OUTPUT_SECTION_TYPE]
