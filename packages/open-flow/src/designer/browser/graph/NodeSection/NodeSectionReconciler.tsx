import type { ConditionsSectionStore } from '../../stores/node/nodeSection/conditionsSection.store.ts'
import type { InputSectionStore } from '../../stores/node/nodeSection/inputSection.store.ts'
import type { INodeSectionStore } from '../../stores/node/nodeSection/interface.ts'
import type { OutputSectionStore } from '../../stores/node/nodeSection/outputSection.store.ts'
import type { PreviewSectionStore } from '../../stores/node/nodeSection/previewSection.store.ts'
import type { ScriptletSectionStore } from '../../stores/node/nodeSection/scriptletSection.store.ts'
import type { SubflowInputSectionStore } from '../../stores/node/nodeSection/subflowInputSection.store.ts'
import type { SubflowOutputSectionStore } from '../../stores/node/nodeSection/subflowOutputSection.store.ts'
import type { TriggerSectionStore } from '../../stores/node/nodeSection/triggerSection.store.ts'
import type { ValueSectionStore } from '../../stores/node/nodeSection/valueSection.store.ts'

import { memo } from 'react'
import {
  CONDITIONS_SECTION_TYPE,
  INPUT_SECTION_TYPE,
  OUTPUT_SECTION_TYPE,
  PREVIEW_SECTION_TYPE,
  SCRIPTLET_SECTION_TYPE,
  SUBFLOW_INPUT_SECTION_TYPE,
  SUBFLOW_OUTPUT_SECTION_TYPE,
  TRIGGER_SECTION_TYPE,
  VALUE_SECTION_TYPE,
} from '../../stores/node/nodeSection/constants.ts'
import { ConditionsSection } from './ConditionsSection.tsx'
import { InputSection } from './InputSection.tsx'
import { OutputSection } from './OutputSection.tsx'
import { PreviewSection } from './PreviewSection.tsx'
import { ScriptletSection } from './ScriptletSection.tsx'
import { SubflowInputSection } from './SubflowInputSection.tsx'
import { SubflowOutputSection } from './SubflowOutputSection.tsx'
import { TriggerSection } from './TriggerSection.tsx'
import { ValueSection } from './ValueSection.tsx'

export interface NodeSectionReconcilerProps {
  section: INodeSectionStore
}

export const NodeSectionReconciler: React.FC<NodeSectionReconcilerProps> = /* @__PURE__ */ memo(({ section }) => {
  switch (section.type) {
    case INPUT_SECTION_TYPE:
      return <InputSection section={section as InputSectionStore} />
    case OUTPUT_SECTION_TYPE:
      return <OutputSection section={section as OutputSectionStore} />
    case VALUE_SECTION_TYPE:
      return <ValueSection section={section as ValueSectionStore} />
    case PREVIEW_SECTION_TYPE:
      return <PreviewSection section={section as PreviewSectionStore} />
    case SCRIPTLET_SECTION_TYPE:
      return <ScriptletSection section={section as ScriptletSectionStore} />
    case SUBFLOW_INPUT_SECTION_TYPE:
      return <SubflowInputSection section={section as SubflowInputSectionStore} />
    case SUBFLOW_OUTPUT_SECTION_TYPE:
      return <SubflowOutputSection section={section as SubflowOutputSectionStore} />
    case CONDITIONS_SECTION_TYPE:
      return <ConditionsSection section={section as ConditionsSectionStore} />
    case TRIGGER_SECTION_TYPE:
      return <TriggerSection section={section as TriggerSectionStore} />
    default:
      return null
  }
})
