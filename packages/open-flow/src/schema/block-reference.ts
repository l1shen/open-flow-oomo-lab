export const LOCAL_BLOCK_REFERENCE_PATTERN = /^self::[a-zA-Z0-9_-]+$/

export function isLocalBlockReference(value: unknown): value is string {
  return typeof value == 'string' && LOCAL_BLOCK_REFERENCE_PATTERN.test(value)
}
