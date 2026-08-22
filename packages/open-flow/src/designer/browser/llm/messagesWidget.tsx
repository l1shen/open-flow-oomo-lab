import styles from './messagesWidget.module.scss'
import type { TFunction } from 'val-i18n'
import type { IBasicOption } from '../components/select.tsx'
import type { ProductInputWidgetRendererProps } from './llmHandleEditor.tsx'

import { useCallback } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { isUnknownRecord } from '../../../base/common/type.ts'
import { Button } from '../components/button.tsx'
import { Select } from '../components/select.tsx'
import { SimpleCodeEditor } from '../components/simpleCodeEditor.ts'
import { highlightTemplateText } from './templateHighlight.ts'

type MessageRole = 'system' | 'user' | 'assistant'

interface MessageValue {
  readonly role: MessageRole
  readonly content: string
}

export function MessagesWidget({ handleNames, store }: ProductInputWidgetRendererProps): React.ReactElement | null {
  const t = useTranslate()
  const value = useVal(store.value$)
  const schema = useVal(store.schema$)
  const messages = messageValues(value)
  const highlight = useCallback((content: string) => highlightTemplateText(content, handleNames), [handleNames])
  if (messages == null) return null

  const editable = store.context.canEditValue && store.value$ != null
  const minimum = isUnknownRecord(schema) && typeof schema.minItems == 'number' ? Math.max(0, schema.minItems) : 0
  const options = roleOptions(t)
  const setMessages = (next: readonly MessageValue[]): void => store.value$?.set(next)
  const updateMessage = (index: number, next: MessageValue): void => setMessages(messages.toSpliced(index, 1, next))
  const addRole: MessageRole = messages.length == 0 ? (minimum > 0 ? 'user' : 'system') : messages.at(-1)?.role == 'user' ? 'assistant' : 'user'

  return (
    <div className={`${styles.panel} nodrag nowheel`}>
      {messages.map((message, index) => (
        <div className={styles.message} key={index}>
          <div className={styles.messageHeader}>
            <Select
              className={styles.role}
              value={options.find((option) => option.value == message.role)}
              disabled={!editable}
              options={options}
              onChange={(option) => updateMessage(index, { ...message, role: messageRole(option?.value) })}
            />
            <Button
              ariaLabel={t('llmEditor.deleteMessage')}
              title={t('llmEditor.deleteMessage')}
              disabled={!editable || messages.length <= minimum}
              onClick={() => setMessages(messages.toSpliced(index, 1))}
            >
              <i className="i-codicon:trash" />
            </Button>
          </div>
          <SimpleCodeEditor
            className={styles.messageContent}
            value={message.content}
            readOnly={!editable}
            placeholder={t('llmEditor.messagePlaceholder')}
            padding={5}
            highlight={highlight}
            style={{ minHeight: 100, resize: 'vertical' }}
            onValueChange={(content) => updateMessage(index, { ...message, content })}
          />
        </div>
      ))}
      <Button
        htmlType="button"
        className={styles.addMessage}
        wrapperClassName={styles.addMessageWrapper}
        disabled={!editable}
        prefix={<i className="i-codicon:add" />}
        onClick={() => setMessages([...messages, { role: addRole, content: '' }])}
      >
        {t('llmEditor.addMessage')}
      </Button>
    </div>
  )
}

const messageRoles: readonly MessageRole[] = ['system', 'user', 'assistant']

function roleOptions(t: TFunction): IBasicOption[] {
  const icons: Record<MessageRole, string> = {
    assistant: 'i-carbon:chat-bot',
    system: 'i-carbon:application-web',
    user: 'i-carbon:user-avatar',
  }
  return messageRoles.map((role) => ({ icon: icons[role], label: t(`llmEditor.role.${role}`), value: role }))
}

function messageRole(value: string | undefined): MessageRole {
  return isMessageRole(value) ? value : 'user'
}

function messageValues(value: unknown): MessageValue[] | undefined {
  if (value == null) return []
  if (!Array.isArray(value)) return undefined
  const result: MessageValue[] = []
  for (const item of value) {
    if (!isUnknownRecord(item) || !isMessageRole(item.role) || typeof item.content != 'string') return undefined
    result.push({ role: item.role, content: item.content })
  }
  return result
}

function isMessageRole(value: unknown): value is MessageRole {
  return value == 'system' || value == 'user' || value == 'assistant'
}
