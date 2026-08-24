import styles from './NodeSection.module.scss'
import type { HandleName } from '../../../../schema/index.ts'
import type { SubflowInputSectionStore } from '../../stores/node/nodeSection/subflowInputSection.store.ts'
import type { HandleRowStore } from '../../stores/nodeHandle/handleRow.store.ts'
import type { ICardAction } from './card.tsx'

import { useStoreApi, useUpdateNodeInternals } from '@xyflow/react'
import { memo, useCallback, useEffect } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { NODE_HANDLE_CLASSNAME } from '../../base/designer.ts'
import { isBannedName, toTrue } from '../../base/trivial.ts'
import { CssWrapper } from '../../components/cssWrapper.tsx'
import { HandleIcon } from '../../components/handleIcon.tsx'
import { HandleEditor } from '../../jsonSchema/handleEditor.tsx'
import { SUBFLOW_INPUT_SECTION_TYPE } from '../../stores/node/nodeSection/constants.ts'
import { useDesignerStore } from '../DesignerStoreContext.tsx'
import { useNodeStore } from '../Nodes/NodeStoreContext.tsx'
import { Card } from './card.tsx'
import { INPUT_FACTORS } from './constants.ts'
import { useDragAndDrop } from './dragNDrop.ts'
import { GroupedHandles } from './GroupedHandles.tsx'

export interface SubflowInputSectionProps {
  section: SubflowInputSectionStore
}

export const SubflowInputSection: React.FC<SubflowInputSectionProps> = /*#__PURE__*/ memo(({ section }) => {
  const t = useTranslate()
  const nodeStore = useNodeStore()
  const designerStore = useDesignerStore()
  const handles = useVal(section.$.handles)
  const allHandleNames = useVal(section.$.allHandleNames)
  const canEditSchema = section.role === 'author' || (section.role === 'user' && !!section.$$.additionalInputDefs)
  const update = useUpdateNodeInternals()
  const reactFlowStore = useStoreApi()
  const dnd = useDragAndDrop(handles, section)

  useEffect(() => section.onDidHandleIndexChange(() => update(nodeStore.rfNodeId)), [nodeStore])

  const validateName = useCallback(
    (name: string, oldName: string): string | undefined => {
      if (!name) return t('handleEditor.renaming.empty')
      if (name === oldName) return
      if (isBannedName(name)) {
        return t('handleEditor.renaming.banned', { name })
      }
      if (allHandleNames.includes(name as HandleName)) {
        return t('handleEditor.renaming.duplicate')
      }
    },
    [allHandleNames, t],
  )

  const actionAdd: ICardAction | undefined = toTrue(canEditSchema) && {
    icon: 'i-codicon:add',
    title: t('inputHandleEditor.addInput'),
    onClick: () => section.addNewHandle(),
  }

  const renderHandle = (handle: HandleRowStore) => (
    <HandleEditor
      key={handle.name}
      store={handle}
      panelWidth$={designerStore.$$.settingsPanelWidth}
      reactFlowStore={reactFlowStore}
      validate={validateName}
      dragTarget={dnd.dragTarget}
      dragPosition={dnd.dragPosition}
      onRename={(newName) => section.renameHandle(handle.name, newName as HandleName)}
      onDelete={() => section.deleteHandle(handle.name)}
      onDragStart={(ev) => dnd.onDragStart(ev, handle)}
      onDragOver={(ev) => dnd.onDragOver(ev, handle)}
    />
  )

  return (
    <Card
      name={SUBFLOW_INPUT_SECTION_TYPE}
      icon="i-carbon:port-input"
      title={t('inputHandleEditor.title')}
      contentClassName={styles.inoutSectionCard}
      actions={actionAdd}
      onDrop={dnd.onDrop}
      onDragEnd={dnd.onDragEnd}
    >
      {handles.length > 0 && (
        <CssWrapper css={INPUT_FACTORS}>
          <div className={`${NODE_HANDLE_CLASSNAME} ${styles.inputHeader}`}>
            <span>{t('inputHandleEditor.handleKeyTitle')}</span>
            <span>
              <span className={styles.type}>{t('inputHandleEditor.handleTypeTitle')}</span>
              <span className={styles.value}>{t('inputHandleEditor.handleValueTitle')}</span>
            </span>
            <span>
              <span className={styles.nullable}>{t('inputHandleEditor.nullable')}</span>
            </span>
          </div>
          <GroupedHandles section={section} handles={handles} renderHandle={renderHandle} dnd={dnd} />
        </CssWrapper>
      )}
      {canEditSchema && handles.length === 0 && (
        <button data-drop-or-click="true" className={styles.dropTip} onClick={actionAdd?.onClick} type="button">
          <HandleIcon />
          <span className={styles.dropOr}>{t('handleEditor.dropOr')}</span>
          <i className="i-codicon:add" />
          <span className={styles.click}>{t('handleEditor.click')}</span>
        </button>
      )}
    </Card>
  )
})
