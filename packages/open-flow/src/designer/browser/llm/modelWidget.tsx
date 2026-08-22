import styles from './modelWidget.module.scss'
import type { TFunction } from 'val-i18n'
import type { IBasicOption } from '../components/select.tsx'
import type { ProductInputWidgetRendererProps } from './llmHandleEditor.tsx'

import { useEffect, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { isUnknownRecord } from '../../../base/common/type.ts'
import { defaultLlmMaxTokens, defaultLlmTemperature, defaultLlmTopP, maximumLlmOutputTokens } from '../../../llm/common/model.ts'
import { Button } from '../components/button.tsx'
import { Input } from '../components/input.tsx'
import { Range } from '../components/range.tsx'
import { Select } from '../components/select.tsx'
import { useLlmModelCatalog } from './modelCatalog.tsx'
import { ModelMark } from './modelMark.tsx'

interface ModelValue {
  readonly model?: string
  readonly temperature?: number
  readonly top_p?: number
  readonly max_tokens?: number
  readonly [key: string]: unknown
}

interface ModelOption extends IBasicOption {
  readonly custom?: boolean
}

interface ModelCatalogState {
  readonly available: boolean
  readonly loading: boolean
  readonly models: readonly string[]
}

export function ModelWidget({ store }: ProductInputWidgetRendererProps): React.ReactElement | null {
  const t = useTranslate()
  const catalog = useLlmModelCatalog()
  const [expanded, setExpanded] = useState(false)
  const [customModel, setCustomModel] = useState(false)
  const [catalogState, setCatalogState] = useState<ModelCatalogState>({ available: false, loading: catalog != null, models: [] })
  const rawValue = useVal(store.value$)

  useEffect(() => {
    const controller = new AbortController()
    setCatalogState({ available: false, loading: catalog != null, models: [] })
    if (catalog != null) {
      void (async () => {
        try {
          const result = await catalog.listLlmModels(controller.signal)
          if (!controller.signal.aborted) setCatalogState({ available: result.available, loading: false, models: result.models })
        } catch {
          if (!controller.signal.aborted) setCatalogState({ available: false, loading: false, models: [] })
        }
      })()
    }
    return () => controller.abort()
  }, [catalog])

  if (rawValue != null && !isUnknownRecord(rawValue)) return null

  const value: ModelValue = rawValue ?? {}
  const editable = store.context.canEditValue && store.value$ != null
  const update = (field: keyof ModelValue, next: string | number | undefined): void => {
    store.value$?.set({ ...value, [field]: next })
  }
  const model = typeof value.model == 'string' ? value.model : ''
  const options = modelOptions(catalogState.models, model, t)
  const useCustomInput = customModel || (!catalogState.loading && (!catalogState.available || catalogState.models.length == 0))

  return (
    <div className={`${styles.panel} nodrag nowheel`}>
      <div className={styles.modelControl}>
        {useCustomInput ? (
          <Input
            className={styles.modelInput}
            value={model}
            disabled={!editable}
            prefix={
              <span className={styles.modelInputMark}>
                <ModelMark model={model} />
              </span>
            }
            placeholder={t('llmEditor.defaultModel')}
            onChange={(next) => update('model', next || undefined)}
          />
        ) : (
          <Select<ModelOption>
            className={styles.modelSelect}
            value={options.find((option) => !option.custom && option.value == model)}
            disabled={!editable}
            options={options}
            labelInMenu={catalogState.loading ? t('llmEditor.loadingModels') : undefined}
            onChange={(option) => {
              if (option?.custom == true) setCustomModel(true)
              else if (option?.value != null) update('model', option.value)
            }}
          />
        )}
        {useCustomInput && catalogState.available && catalogState.models.length > 0 && (
          <Button ariaLabel={t('llmEditor.chooseModel')} title={t('llmEditor.chooseModel')} onClick={() => setCustomModel(false)}>
            <i className="i-carbon:list" />
          </Button>
        )}
        <Button
          active={expanded}
          ariaLabel={t('llmEditor.modelOptions')}
          title={t('llmEditor.modelOptions')}
          onClick={() => setExpanded((current) => !current)}
        >
          <i className="i-carbon:settings-adjust" />
        </Button>
      </div>
      {expanded && (
        <div className={styles.modelPanel}>
          <Range
            label={t('llmEditor.temperature')}
            value={numberValue(value.temperature) ?? defaultLlmTemperature}
            min={0}
            max={2}
            step={0.1}
            disabled={!editable}
            onChange={(next) => update('temperature', next)}
          />
          <Range
            label={t('llmEditor.topP')}
            value={numberValue(value.top_p) ?? defaultLlmTopP}
            min={0}
            max={1}
            step={0.1}
            disabled={!editable}
            onChange={(next) => update('top_p', next)}
          />
          <Range
            label={t('llmEditor.maxTokens')}
            value={numberValue(value.max_tokens) ?? defaultLlmMaxTokens}
            min={1}
            max={maximumLlmOutputTokens}
            step={1}
            disabled={!editable}
            onChange={(next) => update('max_tokens', next)}
          />
        </div>
      )}
    </div>
  )
}

function modelOptions(models: readonly string[], current: string, t: TFunction): ModelOption[] {
  const values = new Set(models)
  if (current.length > 0) values.add(current)
  const options: ModelOption[] = [...values].map((model) => ({ icon: <ModelMark model={model} />, label: model, value: model }))
  options.push({ custom: true, icon: 'i-carbon:edit', label: t('llmEditor.customModel'), value: '' })
  return options
}

function numberValue(value: unknown): number | undefined {
  return typeof value == 'number' && Number.isFinite(value) ? value : undefined
}
