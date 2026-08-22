import type { JSX } from 'react/jsx-runtime'
import type { DesignerStore } from '../../../stores/designer/designer.store.ts'
import type { CommentNodeStore } from '../../../stores/node/commentNode.store.ts'

import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { Button } from '../../../components/button.tsx'

interface CommentNodeActionsProps {
  readonly designerStore: DesignerStore
  readonly nodeStore: CommentNodeStore
}

export function CommentNodeActions({ designerStore, nodeStore }: CommentNodeActionsProps): JSX.Element | null {
  const t = useTranslate()
  const editable = useVal(designerStore.$.editable)
  const sourceCode = useVal(nodeStore.$.sourceCode)

  if (!editable) return null

  return (
    <Button onClick={nodeStore.togglePreview} disabled={!editable} title={sourceCode ? t('comment.preview') : t('comment.source')} titlePlacement="bottom">
      <i className={sourceCode ? 'i-codicon:wand' : 'i-codicon:go-to-file'} />
    </Button>
  )
}
