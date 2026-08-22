import type { BlockUI, InputHandleDef, GroupDividerDef, OutputHandleDef } from '../../../../schema/index.ts'
import type { YamlParent } from '../../yaml.ts'

import { isEqual } from 'radash'
import { parseBoolean, parseString } from '../../../../base/common/parse.ts'
import {
  parseAdditionalInputs,
  parseAdditionalOutputs,
  parseBlockUI,
  parseGroupedInputsDef,
  parseGroupedOutputsDef,
  parseInputsDef,
  parseOutputsDef,
} from '../../model/block/base/parse.ts'
import { bindWritableValGroup } from '../../writableFileManifest.ts'
import { writeMultilineStringYamlScalar } from '../../yaml.ts'

interface WritableSharedBlockValGroupConfig {
  title: string
  description: string
  icon: string
  ui: BlockUI
  inputs_def: (InputHandleDef | GroupDividerDef)[]
  outputs_def: (OutputHandleDef | GroupDividerDef)[]
  additional_inputs: boolean | InputHandleDef
  additional_inputs_def: InputHandleDef[]
  additional_outputs: boolean | OutputHandleDef
  additional_outputs_def: OutputHandleDef[]
  private: boolean
}

export const bindSharedWritableBlockValGroup = (yamlParent: YamlParent): ReturnType<typeof bindWritableValGroup<WritableSharedBlockValGroupConfig>> =>
  bindWritableValGroup(yamlParent, {
    title: parseString,
    description: {
      parser: parseString,
      writeYamlValue: writeMultilineStringYamlScalar,
    },
    icon: parseString,
    ui: { parser: parseBlockUI, config: { equal: isEqual } },
    inputs_def: { parser: parseGroupedInputsDef, config: { equal: isEqual } },
    outputs_def: { parser: parseGroupedOutputsDef, config: { equal: isEqual } },
    additional_inputs: { parser: parseAdditionalInputs, config: { equal: isEqual } },
    additional_inputs_def: { parser: parseInputsDef, config: { equal: isEqual } },
    additional_outputs: { parser: parseAdditionalOutputs, config: { equal: isEqual } },
    additional_outputs_def: { parser: parseOutputsDef, config: { equal: isEqual } },
    private: parseBoolean,
  })

interface WritableInlineBlockValGroupConfig {
  inputs_def: (InputHandleDef | GroupDividerDef)[]
  outputs_def: (GroupDividerDef | OutputHandleDef)[]
  additional_inputs: boolean
  additional_outputs: boolean
}

export const bindInlineWritableBlockValGroup = (yamlParent: YamlParent): ReturnType<typeof bindWritableValGroup<WritableInlineBlockValGroupConfig>> =>
  bindWritableValGroup(yamlParent, {
    inputs_def: { parser: parseGroupedInputsDef, config: { equal: isEqual } },
    outputs_def: { parser: parseGroupedOutputsDef, config: { equal: isEqual } },
    additional_inputs: parseBoolean,
    additional_outputs: parseBoolean,
  })
