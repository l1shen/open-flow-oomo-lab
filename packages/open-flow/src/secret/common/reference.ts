import { isSecretFieldKey, isSecretId } from './validation.ts'

export interface SecretReference {
  readonly secretId: string
  readonly key: string
}

const SECRET_REFERENCE_PREFIX = '${{OO_SECRET:'
const SECRET_REFERENCE_SUFFIX = '}}'

export function parseSecretReference(value: unknown): SecretReference | undefined {
  if (typeof value != 'string' || !value.startsWith(SECRET_REFERENCE_PREFIX) || !value.endsWith(SECRET_REFERENCE_SUFFIX)) return

  const parts = value.slice(SECRET_REFERENCE_PREFIX.length, -SECRET_REFERENCE_SUFFIX.length).split(',')
  if (parts.length != 2 || !isSecretId(parts[0]) || !isSecretFieldKey(parts[1])) return
  return { secretId: parts[0], key: parts[1] }
}

export function formatSecretReference(reference: SecretReference): string {
  if (!isSecretId(reference.secretId) || !isSecretFieldKey(reference.key)) throw new TypeError('Secret references require a canonical Secret ID and field key.')
  return `${SECRET_REFERENCE_PREFIX}${reference.secretId},${reference.key}${SECRET_REFERENCE_SUFFIX}`
}
