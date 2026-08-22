const SECRET_ID = /^secret_[0-9a-f]{32}$/
const SECRET_FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/

export function isSecretId(value: unknown): value is string {
  return typeof value == 'string' && SECRET_ID.test(value)
}

export function isSecretFieldKey(value: unknown): value is string {
  return typeof value == 'string' && SECRET_FIELD_KEY.test(value)
}
