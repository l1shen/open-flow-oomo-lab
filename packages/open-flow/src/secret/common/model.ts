import { z } from 'zod'
import { isSecretFieldKey, isSecretId } from './validation.ts'

export interface SecretIdentity {
  readonly secretId: string
}

export interface SecretFieldDescriptor {
  readonly key: string
}

export interface SecretDescriptor extends SecretIdentity {
  readonly version: 1
  readonly name: string
  readonly revision: string
  readonly fields: readonly SecretFieldDescriptor[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SecretField extends SecretFieldDescriptor {
  readonly value: string
}

export interface SecretData extends SecretIdentity {
  readonly version: 1
  readonly name: string
  readonly revision: string
  readonly fields: readonly SecretField[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SecretWrite {
  readonly secretId?: string
  readonly name: string
  readonly fields: readonly SecretField[]
}

const secretIdSchema = z.string().refine(isSecretId, { message: 'Secret ID must use the canonical secret_<32 lowercase hexadecimal> format.' })
const secretNameSchema = z.string().superRefine((name, context) => {
  const length = new TextEncoder().encode(name.trim()).byteLength
  if (length < 1 || length > 256) context.addIssue({ code: 'custom', message: 'Secret name must contain 1 to 256 UTF-8 bytes after trimming.' })
  if (hasUnpairedSurrogate(name)) context.addIssue({ code: 'custom', message: 'Secret name must contain valid Unicode.' })
})
const revisionSchema = z.string().min(1)
const timestampSchema = z.string().datetime({ offset: true })
const secretIdentitySchema = z.strictObject({ secretId: secretIdSchema })
const secretFieldDescriptorSchema = z.strictObject({
  key: z.string().refine(isSecretFieldKey, { message: 'Secret field keys must match ^[A-Za-z_][A-Za-z0-9_.-]{0,127}$.' }),
})
const secretFieldSchema = secretFieldDescriptorSchema.extend({ value: z.string() })
const descriptorFieldsSchema = z.array(secretFieldDescriptorSchema).min(1).max(64)
const dataFieldsSchema = z.array(secretFieldSchema).min(1).max(64)
const secretDescriptorSchema = z
  .strictObject({
    version: z.literal(1),
    secretId: secretIdSchema,
    name: secretNameSchema,
    revision: revisionSchema,
    fields: descriptorFieldsSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((descriptor, context) => validateUniqueKeys(descriptor.fields, context))
const secretDataSchema = z
  .strictObject({
    version: z.literal(1),
    secretId: secretIdSchema,
    name: secretNameSchema,
    revision: revisionSchema,
    fields: dataFieldsSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((secret, context) => validateDataFields(secret.fields, context))
const secretWriteSchema = z
  .strictObject({
    secretId: secretIdSchema.optional(),
    name: secretNameSchema,
    fields: dataFieldsSchema,
  })
  .superRefine((secret, context) => validateDataFields(secret.fields, context))

export function secretIdentityKey(identity: SecretIdentity): string {
  if (!isSecretId(identity.secretId)) throw new TypeError('Invalid secret identity: Secret ID must use the canonical secret_<32 lowercase hexadecimal> format.')
  return identity.secretId
}

export function parseSecretIdentity(value: unknown): SecretIdentity {
  return parseSecretValue(secretIdentitySchema, value, 'identity')
}

export function parseSecretDescriptor(value: unknown): SecretDescriptor {
  return parseSecretValue(secretDescriptorSchema, value, 'descriptor')
}

export function parseSecretFieldDescriptor(value: unknown): SecretFieldDescriptor {
  return parseSecretValue(secretFieldDescriptorSchema, value, 'field')
}

export function parseSecretData(value: unknown): SecretData {
  return parseSecretValue(secretDataSchema, value, 'data')
}

export function parseSecretWrite(value: unknown): SecretWrite {
  return parseSecretValue(secretWriteSchema, value, 'write')
}

function parseSecretValue<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new TypeError(`Invalid secret ${label}: ${result.error.issues.map((issue) => issue.message).join(' ')}`)
}

function validateUniqueKeys(fields: readonly SecretFieldDescriptor[], context: z.RefinementCtx): void {
  const keys = new Set<string>()
  for (const [index, field] of fields.entries()) {
    if (keys.has(field.key)) {
      context.addIssue({ code: 'custom', message: `Duplicate secret field key "${field.key}".`, path: ['fields', index, 'key'] })
    } else {
      keys.add(field.key)
    }
  }
}

function validateDataFields(fields: readonly SecretField[], context: z.RefinementCtx): void {
  validateUniqueKeys(fields, context)
  const encoder = new TextEncoder()
  let totalBytes = 0
  for (const [index, field] of fields.entries()) {
    const valueBytes = encoder.encode(field.value).byteLength
    totalBytes += encoder.encode(field.key).byteLength + valueBytes
    if (hasUnpairedSurrogate(field.value)) {
      context.addIssue({ code: 'custom', message: 'Secret field values must contain valid Unicode.', path: ['fields', index, 'value'] })
    }
    if (valueBytes > 64 * 1024) {
      context.addIssue({ code: 'custom', message: 'Secret field values must not exceed 64 KiB.', path: ['fields', index, 'value'] })
    }
  }
  if (totalBytes > 64 * 1024) context.addIssue({ code: 'custom', message: 'Secret plaintext must not exceed 64 KiB.', path: ['fields'] })
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}
