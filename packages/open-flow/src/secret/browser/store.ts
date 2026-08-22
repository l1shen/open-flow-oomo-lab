import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { ReactiveMap, ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { SecretData, SecretDescriptor, SecretIdentity, SecretWrite } from '../common/model.ts'

import { disposableStore } from '@wopjs/disposable'
import { val } from 'value-enhancer'
import { reactiveMap } from 'value-enhancer/collections'
import { parseSecretData, parseSecretDescriptor, parseSecretIdentity, parseSecretWrite, secretIdentityKey } from '../common/model.ts'

export type { SecretDescriptor, SecretFieldDescriptor } from '../common/model.ts'
export { SecretTemplateName, secretTemplateNames, secretTemplates } from '../common/templates.ts'

export interface SecretStore {
  readonly items$: ReadonlyReactiveMap<string, SecretDescriptor>
  readonly loading$: ReadonlyVal<boolean>
}

export interface SecretTransport {
  list(signal: AbortSignal): Promise<readonly SecretDescriptor[]>
  get(identity: SecretIdentity, signal: AbortSignal): Promise<SecretData | undefined>
  save(secret: SecretWrite, signal: AbortSignal): Promise<SecretDescriptor>
  delete(identity: SecretIdentity, signal: AbortSignal): Promise<boolean>
}

export class RemoteSecretStore implements SecretStore {
  public readonly dispose: DisposableStore = disposableStore()
  public readonly items$: ReadonlyReactiveMap<string, SecretDescriptor>
  public readonly loading$: ReadonlyVal<boolean>

  readonly #items: ReactiveMap<string, SecretDescriptor>
  readonly #loading: Val<boolean>
  readonly #transport: SecretTransport

  public constructor(transport: SecretTransport) {
    this.#transport = transport
    this.items$ = this.#items = this.dispose.add(reactiveMap())
    this.loading$ = this.#loading = this.dispose.add(val(false))
  }

  public async refresh(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    this.#loading.set(true)
    try {
      const descriptors = await this.#transport.list(signal)
      signal.throwIfAborted()
      this.#items.replace(
        descriptors.map((descriptor) => {
          const parsed = parseSecretDescriptor(descriptor)
          return [secretIdentityKey(parsed), parsed]
        }),
      )
    } finally {
      this.#loading.set(false)
    }
  }

  public async get(identity: SecretIdentity, signal: AbortSignal): Promise<SecretData | undefined> {
    signal.throwIfAborted()
    const secret = await this.#transport.get(parseSecretIdentity({ secretId: identity.secretId }), signal)
    signal.throwIfAborted()
    return secret == null ? undefined : parseSecretData(secret)
  }

  public async save(secret: SecretWrite, signal: AbortSignal): Promise<SecretDescriptor> {
    signal.throwIfAborted()
    const descriptor = parseSecretDescriptor(await this.#transport.save(parseSecretWrite(secret), signal))
    signal.throwIfAborted()
    this.#items.set(secretIdentityKey(descriptor), descriptor)
    return descriptor
  }

  public async delete(identity: SecretIdentity, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    const parsed = parseSecretIdentity({ secretId: identity.secretId })
    const deleted = await this.#transport.delete(parsed, signal)
    signal.throwIfAborted()
    if (deleted) this.#items.delete(secretIdentityKey(parsed))
    return deleted
  }
}
