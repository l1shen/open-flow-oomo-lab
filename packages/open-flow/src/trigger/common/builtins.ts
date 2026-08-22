import type { TriggerCatalogCompatibleItem, TriggerCatalogIdentity } from './catalog.ts'

export const BUILT_IN_TRIGGER_NAMESPACE = 'open-flow.'
export const WEBHOOK_TYPE = 'open-flow.webhook'
export const WEBHOOK_REVISION = '1'

export const webhookTrigger: TriggerCatalogCompatibleItem = {
  compatible: true,
  definitionDigest: 'sha256:7012e189e7b95977c347af49bba04f523e45ccdcbfcfe45d295efa2e7a7051e8',
  icon: ':carbon:webhook:',
  revision: WEBHOOK_REVISION,
  trigger: {
    config: {},
    definition: {
      config_schema: {
        additionalProperties: false,
        type: 'object',
      },
      name: 'Webhook',
      provisioning: { kind: 'webhook' },
      payload_schema: {
        additionalProperties: true,
        type: 'object',
      },
      service_id: 'open-flow',
      service_name: 'Open Flow',
    },
    revision: WEBHOOK_REVISION,
    type: WEBHOOK_TYPE,
  },
  type: WEBHOOK_TYPE,
}

export const builtInTriggers: readonly TriggerCatalogCompatibleItem[] = [webhookTrigger]

export function isBuiltInTriggerType(type: string): boolean {
  return type.startsWith(BUILT_IN_TRIGGER_NAMESPACE)
}

export function findBuiltInTrigger(identity: TriggerCatalogIdentity): TriggerCatalogCompatibleItem | undefined {
  return builtInTriggers.find((item) => item.type === identity.type && item.revision === identity.revision)
}
