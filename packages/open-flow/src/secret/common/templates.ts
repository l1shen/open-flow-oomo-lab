import type { SecretFieldDescriptor } from './model.ts'

export type SecretTemplateName =
  | 'Custom'
  | 'AWS'
  | 'AliCloud'
  | 'Discord'
  | 'GitHub'
  | 'GoogleCloud'
  | 'HuggingFace'
  | 'OpenAI'
  | 'Reddit'
  | 'Slack'
  | 'SiliconFlow'

export const SecretTemplateName: Readonly<Record<SecretTemplateName, SecretTemplateName>> = Object.freeze({
  Custom: 'Custom',
  AWS: 'AWS',
  AliCloud: 'AliCloud',
  Discord: 'Discord',
  GitHub: 'GitHub',
  GoogleCloud: 'GoogleCloud',
  HuggingFace: 'HuggingFace',
  OpenAI: 'OpenAI',
  Reddit: 'Reddit',
  Slack: 'Slack',
  SiliconFlow: 'SiliconFlow',
})

export const secretTemplateNames: readonly SecretTemplateName[] = Object.values(SecretTemplateName)

export const secretTemplates: Readonly<Record<SecretTemplateName, { readonly name: string; readonly fields: readonly SecretFieldDescriptor[] }>> =
  Object.freeze({
    Custom: { name: '', fields: [{ key: '' }] },
    OpenAI: { name: 'OpenAI', fields: [{ key: 'OPENAI_API_KEY' }] },
    AWS: { name: 'AWS', fields: [{ key: 'AWS_ACCESS_KEY_ID' }, { key: 'AWS_SECRET_ACCESS_KEY' }, { key: 'AWS_REGION' }] },
    AliCloud: { name: 'AliCloud', fields: [{ key: 'ACCESSKEY_ID' }, { key: 'ACCESSKEY_SECRET' }] },
    Discord: { name: 'Discord', fields: [{ key: 'DISCORD_PUBLIC_KEY' }, { key: 'DISCORD_BOT_TOKEN' }] },
    GitHub: { name: 'GitHub', fields: [{ key: 'GITHUB_TOKEN' }] },
    GoogleCloud: { name: 'GoogleCloud', fields: [{ key: 'SERVICE_ACCOUNT_JSON' }] },
    HuggingFace: { name: 'HuggingFace', fields: [{ key: 'HF_TOKEN' }] },
    Reddit: { name: 'Reddit', fields: [{ key: 'REDDIT_APP_ID' }, { key: 'REDDIT_APP_SECRET' }] },
    Slack: { name: 'Slack', fields: [{ key: 'SLACK_BOT_TOKEN' }] },
    SiliconFlow: { name: 'SiliconFlow', fields: [{ key: 'SILICON_FLOW_TOKEN' }] },
  })
