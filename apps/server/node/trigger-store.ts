import type { JsonValue } from '@oomol-lab/open-flow/flow-change'
import type { RunAcceptance } from '@oomol-lab/open-flow/run-lifecycle'
import type { DatabaseSync } from 'node:sqlite'

import { randomUUID } from 'node:crypto'

export type TriggerActivityKind =
  | 'delivery.failed'
  | 'health.failed'
  | 'health.needs_reauth'
  | 'health.recovered'
  | 'health.suspended'
  | 'operator.paused'
  | 'operator.resumed'

export interface StoredTriggerActivity {
  readonly activityId: string
  readonly createdAt: number
  readonly errorCode: string | null
  readonly errorMessage: string | null
  readonly kind: TriggerActivityKind
}

export interface StoredTriggerBinding {
  readonly bindingId: string
  readonly currentPublicationId: string | null
  readonly currentRevisionId: string | null
  readonly endpointId: string | null
  readonly flowId: string
  readonly health: 'failed' | 'healthy' | 'initializing' | 'needs_reauth'
  readonly kind: 'cron' | 'integration' | 'poll' | 'webhook'
  readonly lastErrorCode: string | null
  readonly operatorState: 'active' | 'paused'
  readonly runtimeVersion: number
  readonly triggerNodeId: string
  readonly updatedAt: number
}

interface StoredWebhookTarget {
  readonly closureDigest: string
  readonly content: string
  readonly endpointId: string
  readonly engineContract: string
  readonly flowId: string
  readonly publicationId: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly runtimeVersion: number
  readonly triggerJson: string
  readonly triggerNodeId: string
}

export interface StoredCronTarget {
  readonly bindingId: string
  readonly closureDigest: string
  readonly content: string
  readonly engineContract: string
  readonly flowId: string
  readonly modelVersion: number
  readonly nextAt: number
  readonly publicationId: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly runtimeVersion: number
  readonly scheduleJson: string
  readonly triggerJson: string
  readonly triggerNodeId: string
}

export type PollHealth = 'failed' | 'healthy' | 'initializing' | 'needs_reauth'

export type RunAdmission = RunAcceptance | { readonly kind: 'overloaded' }

export interface StoredPollTarget {
  readonly bindingId: string
  readonly checkpoint: JsonValue
  readonly closureDigest: string
  readonly connectionId: string
  readonly content: string
  readonly continuationPage: number
  readonly continuationRootId: string | null
  readonly engineContract: string
  readonly flowId: string
  readonly health: Extract<PollHealth, 'healthy' | 'initializing'>
  readonly modelVersion: number
  readonly nextAt: number
  readonly publicationId: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly runtimeVersion: number
  readonly scheduleJson: string
  readonly triggerJson: string
  readonly triggerNodeId: string
}

export interface StoredPollTestTarget {
  readonly bindingId: string
  readonly checkpoint: JsonValue
  readonly closureDigest: string
  readonly connectionId: string
  readonly content: string
  readonly flowId: string
  readonly publicationId: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly runtimeVersion: number
  readonly triggerJson: string
  readonly triggerNodeId: string
}

export type PollClaim = { readonly kind: 'acquired'; readonly leaseToken: string } | { readonly kind: 'busy' | 'completed' | 'unavailable' }

export type PollCompletion = { readonly accepted?: RunAcceptance; readonly kind: 'completed' } | { readonly kind: 'ignored' | 'overloaded' }

export interface PollState {
  readonly bindingId: string
  readonly checkpoint: JsonValue
  readonly health: PollHealth
  readonly runtimeVersion: number
}

export type IntegrationHealth = 'failed' | 'healthy' | 'initializing' | 'needs_reauth'

export interface StoredIntegrationState {
  readonly bindingId: string
  readonly checkpointJson: string
  readonly connectionId: string
  readonly reconcileAt: number | null
  readonly runtimeVersion: number
  readonly subscriptionJson: string
  readonly triggerJson: string
  readonly updatedAt: number
}

export interface StoredIntegrationBinding {
  readonly bindingId: string
  readonly connectionId: string
  readonly currentPublicationId: string | null
  readonly endpointId: string
  readonly flowId: string
  readonly health: IntegrationHealth
  readonly runtimeVersion: number
  readonly triggerJson: string
  readonly triggerNodeId: string
}

export interface StoredIntegrationTarget extends StoredIntegrationBinding {
  readonly closureDigest: string
  readonly content: string
  readonly currentPublicationId: string
  readonly engineContract: string
  readonly modelVersion: number
  readonly revisionDigest: string
  readonly revisionId: string
  readonly state?: StoredIntegrationState
}

interface TriggerOccurrence {
  readonly content: string
  readonly flowId: string
  readonly occurrenceId: string
  readonly payload: JsonValue
  readonly requestDigest: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly triggerNodeId: string
}

export type TriggerOccurrenceInput = TriggerOccurrence & {
  readonly closureDigest: string
  readonly modelVersion: number
  readonly publicationId: string
  readonly source: 'trigger'
}

const triggerActivityRetentionMs = 30 * 24 * 60 * 60 * 1000

export class TriggerStore {
  readonly #acceptTriggerOccurrence: (input: TriggerOccurrenceInput) => RunAdmission
  readonly #database: DatabaseSync
  readonly #transaction: <Value>(operation: () => Value) => Value

  constructor(
    database: DatabaseSync,
    transaction: <Value>(operation: () => Value) => Value,
    acceptTriggerOccurrence: (input: TriggerOccurrenceInput) => RunAdmission,
  ) {
    this.#acceptTriggerOccurrence = acceptTriggerOccurrence
    this.#database = database
    this.#transaction = transaction
  }

  listTriggerBindings(flowId: string): readonly StoredTriggerBinding[] {
    return this.#database
      .prepare(
        `SELECT * FROM (
           SELECT bindings.endpoint_id AS bindingId,
                  bindings.current_publication_id AS currentPublicationId,
                  publications.revision_id AS currentRevisionId,
                  bindings.endpoint_id AS endpointId,
                  bindings.flow_id AS flowId,
                  'healthy' AS health,
                  'webhook' AS kind,
                  NULL AS lastErrorCode,
                  bindings.operator_state AS operatorState,
                  bindings.runtime_version AS runtimeVersion,
                  bindings.trigger_node_id AS triggerNodeId,
                  bindings.updated_at AS updatedAt
           FROM webhook_bindings AS bindings
           LEFT JOIN publications ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.flow_id = ?
           UNION ALL
           SELECT bindings.binding_id, bindings.current_publication_id, publications.revision_id,
                  NULL, bindings.flow_id, 'healthy', 'cron', NULL, bindings.operator_state,
                  bindings.runtime_version, bindings.trigger_node_id, bindings.updated_at
           FROM cron_bindings AS bindings
           LEFT JOIN publications ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.flow_id = ?
           UNION ALL
           SELECT bindings.binding_id, bindings.current_publication_id, publications.revision_id,
                  NULL, bindings.flow_id, bindings.health, 'poll', bindings.last_error_code, bindings.operator_state,
                  bindings.runtime_version, bindings.trigger_node_id, bindings.updated_at
           FROM poll_bindings AS bindings
           LEFT JOIN publications ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.flow_id = ?
           UNION ALL
           SELECT bindings.binding_id, bindings.current_publication_id, publications.revision_id,
                  NULL, bindings.flow_id, bindings.health, 'integration', bindings.last_error_code, bindings.operator_state,
                  bindings.runtime_version, bindings.trigger_node_id, bindings.updated_at
           FROM integration_bindings AS bindings
           LEFT JOIN publications ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.flow_id = ?
         ) ORDER BY triggerNodeId`,
      )
      .all(flowId, flowId, flowId, flowId) as unknown as readonly StoredTriggerBinding[]
  }

  triggerBinding(flowId: string, triggerNodeId: string): StoredTriggerBinding | undefined {
    return this.listTriggerBindings(flowId).find((binding) => binding.triggerNodeId == triggerNodeId)
  }

  setTriggerOperatorState(
    flowId: string,
    triggerNodeId: string,
    operatorState: StoredTriggerBinding['operatorState'],
    updatedAt: number,
  ): StoredTriggerBinding | undefined {
    return this.#transaction(() => {
      const current = this.triggerBinding(flowId, triggerNodeId)
      if (current?.currentPublicationId == null) return
      if (current.operatorState == operatorState) return current
      switch (current.kind) {
        case 'webhook':
          this.#database
            .prepare(
              `UPDATE webhook_bindings
               SET operator_state = ?, runtime_version = runtime_version + 1, updated_at = ?
               WHERE endpoint_id = ? AND current_publication_id IS NOT NULL`,
            )
            .run(operatorState, updatedAt, current.bindingId)
          break
        case 'cron':
          this.#database
            .prepare(
              `UPDATE cron_bindings
               SET operator_state = ?, runtime_version = runtime_version + 1, updated_at = ?
               WHERE binding_id = ? AND current_publication_id IS NOT NULL`,
            )
            .run(operatorState, updatedAt, current.bindingId)
          break
        case 'poll':
          this.#database
            .prepare(
              `UPDATE poll_bindings
               SET operator_state = ?, runtime_version = runtime_version + 1, updated_at = ?,
                   active_claim_id = NULL, active_lease_token = NULL, active_lease_expires_at = NULL
               WHERE binding_id = ? AND current_publication_id IS NOT NULL`,
            )
            .run(operatorState, updatedAt, current.bindingId)
          break
        case 'integration':
          this.#database
            .prepare(
              `UPDATE integration_bindings
               SET operator_state = ?, runtime_version = runtime_version + 1, updated_at = ?,
                   reconcile_at = CASE WHEN ? = 'active' THEN ? ELSE reconcile_at END
               WHERE binding_id = ? AND current_publication_id IS NOT NULL`,
            )
            .run(operatorState, updatedAt, operatorState, updatedAt, current.bindingId)
          break
      }
      this.#insertTriggerActivity(current.bindingId, operatorState == 'paused' ? 'operator.paused' : 'operator.resumed', updatedAt)
      this.#pruneTriggerActivities(updatedAt, 100)
      return this.triggerBinding(flowId, triggerNodeId)
    })
  }

  listTriggerActivities(
    bindingId: string,
    limit: number,
    now: number,
    after?: { readonly activityId: string; readonly createdAt: number },
  ): readonly StoredTriggerActivity[] {
    return (after == null
      ? this.#database
          .prepare(
            `SELECT activity_id AS activityId, created_at AS createdAt, error_code AS errorCode,
                    error_message AS errorMessage, kind
             FROM trigger_activities
             WHERE binding_id = ? AND expires_at > ?
             ORDER BY created_at DESC, activity_id DESC
             LIMIT ?`,
          )
          .all(bindingId, now, limit)
      : this.#database
          .prepare(
            `SELECT activity_id AS activityId, created_at AS createdAt, error_code AS errorCode,
                    error_message AS errorMessage, kind
             FROM trigger_activities
             WHERE binding_id = ? AND expires_at > ?
               AND (created_at < ? OR (created_at = ? AND activity_id < ?))
             ORDER BY created_at DESC, activity_id DESC
             LIMIT ?`,
          )
          .all(bindingId, now, after.createdAt, after.createdAt, after.activityId, limit)) as unknown as readonly StoredTriggerActivity[]
  }

  acceptWebhookTarget(input: {
    readonly closureDigest: string
    readonly content: string
    readonly endpointId: string
    readonly engineContract: string
    readonly flowId: string
    readonly modelVersion: number
    readonly occurrenceId: string
    readonly payload: JsonValue
    readonly publicationId: string
    readonly requestDigest: string
    readonly revisionDigest: string
    readonly revisionId: string
    readonly runtimeVersion: number
    readonly triggerJson: string
    readonly triggerNodeId: string
  }): RunAdmission | undefined {
    return this.#transaction(() => {
      const current = this.#database
        .prepare(
          `SELECT 1 AS current
           FROM webhook_bindings AS bindings
           JOIN flow_live
             ON flow_live.flow_id = bindings.flow_id
            AND flow_live.publication_id = bindings.current_publication_id
           JOIN publications
             ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.endpoint_id = ?
             AND bindings.flow_id = ?
             AND bindings.trigger_node_id = ?
             AND bindings.current_publication_id = ?
             AND bindings.runtime_version = ?
             AND bindings.operator_state = 'active'
             AND bindings.trigger_json = ?
             AND publications.revision_id = ?
             AND publications.revision_digest = ?
             AND publications.closure_digest = ?
             AND publications.engine_contract = ?
             AND publications.model_version = ?`,
        )
        .get(
          input.endpointId,
          input.flowId,
          input.triggerNodeId,
          input.publicationId,
          input.runtimeVersion,
          input.triggerJson,
          input.revisionId,
          input.revisionDigest,
          input.closureDigest,
          input.engineContract,
          input.modelVersion,
        )
      if (current == null) return

      const accepted = this.#acceptTriggerOccurrence({ ...input, source: 'trigger' })
      if (accepted.kind == 'overloaded') return accepted
      if (accepted.kind == 'accepted' && accepted.created) {
        this.#database
          .prepare('INSERT INTO webhook_admissions (run_id, endpoint_id, runtime_version, publication_id) VALUES (?, ?, ?, ?)')
          .run(accepted.runId, input.endpointId, input.runtimeVersion, input.publicationId)
      }
      return accepted
    })
  }

  acceptCronTarget(
    input: StoredCronTarget & { readonly nextScheduledAt: number; readonly occurrenceId: string; readonly requestDigest: string },
  ): RunAdmission | undefined {
    return this.#transaction(() => {
      const current = this.#database
        .prepare(
          `SELECT 1 AS current
           FROM cron_bindings AS bindings
           JOIN flow_live
             ON flow_live.flow_id = bindings.flow_id
            AND flow_live.publication_id = bindings.current_publication_id
           JOIN publications
             ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.binding_id = ?
             AND bindings.flow_id = ?
             AND bindings.trigger_node_id = ?
             AND bindings.current_publication_id = ?
             AND bindings.runtime_version = ?
             AND bindings.operator_state = 'active'
             AND bindings.trigger_json = ?
             AND bindings.schedule_json = ?
             AND bindings.next_at = ?
             AND publications.revision_id = ?
             AND publications.revision_digest = ?
             AND publications.closure_digest = ?
             AND publications.engine_contract = ?
             AND publications.model_version = ?`,
        )
        .get(
          input.bindingId,
          input.flowId,
          input.triggerNodeId,
          input.publicationId,
          input.runtimeVersion,
          input.triggerJson,
          input.scheduleJson,
          input.nextAt,
          input.revisionId,
          input.revisionDigest,
          input.closureDigest,
          input.engineContract,
          input.modelVersion,
        )
      if (current == null) return

      const scheduledAt = new Date(input.nextAt).toISOString()
      const accepted = this.#acceptTriggerOccurrence({
        content: input.content,
        closureDigest: input.closureDigest,
        flowId: input.flowId,
        modelVersion: input.modelVersion,
        occurrenceId: input.occurrenceId,
        payload: { scheduledAt },
        publicationId: input.publicationId,
        requestDigest: input.requestDigest,
        revisionDigest: input.revisionDigest,
        revisionId: input.revisionId,
        source: 'trigger',
        triggerNodeId: input.triggerNodeId,
      })
      if (accepted.kind == 'overloaded') return accepted
      if (accepted.kind == 'accepted' && accepted.created) {
        this.#database
          .prepare('INSERT INTO cron_admissions (run_id, binding_id, runtime_version, publication_id, scheduled_at) VALUES (?, ?, ?, ?, ?)')
          .run(accepted.runId, input.bindingId, input.runtimeVersion, input.publicationId, scheduledAt)
      }
      this.#database.prepare('UPDATE cron_bindings SET next_at = ? WHERE binding_id = ?').run(input.nextScheduledAt, input.bindingId)
      return accepted
    })
  }

  acceptIntegrationTarget(
    input: StoredIntegrationTarget & { readonly occurrenceId: string; readonly payload: JsonValue; readonly requestDigest: string },
  ): RunAdmission | undefined {
    return this.#transaction(() => {
      const current = this.#database
        .prepare(
          `SELECT 1
           FROM integration_bindings AS bindings
           JOIN flow_live
             ON flow_live.flow_id = bindings.flow_id
            AND flow_live.publication_id = bindings.current_publication_id
           JOIN publications
             ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.binding_id = ?
             AND bindings.endpoint_id = ?
             AND bindings.flow_id = ?
             AND bindings.trigger_node_id = ?
             AND bindings.current_publication_id = ?
             AND bindings.runtime_version = ?
             AND bindings.trigger_json = ?
             AND bindings.connection_id = ?
             AND bindings.health = 'healthy'
             AND bindings.operator_state = 'active'
             AND publications.revision_id = ?
             AND publications.revision_digest = ?
             AND publications.closure_digest = ?
             AND publications.engine_contract = ?
             AND publications.model_version = ?`,
        )
        .get(
          input.bindingId,
          input.endpointId,
          input.flowId,
          input.triggerNodeId,
          input.currentPublicationId,
          input.runtimeVersion,
          input.triggerJson,
          input.connectionId,
          input.revisionId,
          input.revisionDigest,
          input.closureDigest,
          input.engineContract,
          input.modelVersion,
        )
      if (current == null) return

      const accepted = this.#acceptTriggerOccurrence({
        content: input.content,
        closureDigest: input.closureDigest,
        flowId: input.flowId,
        modelVersion: input.modelVersion,
        occurrenceId: input.occurrenceId,
        payload: input.payload,
        publicationId: input.currentPublicationId,
        requestDigest: input.requestDigest,
        revisionDigest: input.revisionDigest,
        revisionId: input.revisionId,
        source: 'trigger',
        triggerNodeId: input.triggerNodeId,
      })
      if (accepted.kind == 'overloaded') return accepted
      if (accepted.kind == 'accepted' && accepted.created) {
        this.#database
          .prepare('INSERT INTO integration_admissions (run_id, binding_id, runtime_version, publication_id) VALUES (?, ?, ?, ?)')
          .run(accepted.runId, input.bindingId, input.runtimeVersion, input.currentPublicationId)
      }
      return accepted
    })
  }

  createIntegrationState(
    binding: Pick<StoredIntegrationBinding, 'bindingId' | 'connectionId' | 'runtimeVersion' | 'triggerJson'>,
    checkpoint: JsonValue,
    subscription: Readonly<Record<string, JsonValue>>,
    now: number,
  ): boolean {
    return (
      this.#database
        .prepare(
          `INSERT OR IGNORE INTO integration_states (
             binding_id, runtime_version, trigger_json, connection_id,
             checkpoint_json, subscription_json, reconcile_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          binding.bindingId,
          binding.runtimeVersion,
          binding.triggerJson,
          binding.connectionId,
          JSON.stringify(checkpoint),
          JSON.stringify(subscription),
          now,
          now,
        ).changes == 1
    )
  }

  deleteIntegrationState(bindingId: string, runtimeVersion: number): boolean {
    return this.#database.prepare('DELETE FROM integration_states WHERE binding_id = ? AND runtime_version = ?').run(bindingId, runtimeVersion).changes == 1
  }

  dueIntegrations(now: number, limit: number): readonly StoredIntegrationBinding[] {
    return this.#database
      .prepare(
        `SELECT binding_id AS bindingId, endpoint_id AS endpointId, flow_id AS flowId, trigger_node_id AS triggerNodeId,
                current_publication_id AS currentPublicationId, runtime_version AS runtimeVersion,
                trigger_json AS triggerJson, connection_id AS connectionId, health
         FROM integration_bindings AS bindings
         WHERE bindings.operator_state = 'active'
           AND (bindings.retry_at <= ?
            OR (
              bindings.retry_at IS NULL AND (
                bindings.reconcile_at <= ? OR EXISTS (
                  SELECT 1 FROM integration_states AS states
                  WHERE states.binding_id = bindings.binding_id AND states.reconcile_at <= ?
                )
              )
            ))
         ORDER BY COALESCE(bindings.retry_at, bindings.reconcile_at), bindings.binding_id
         LIMIT ?`,
      )
      .all(now, now, now, limit) as unknown as readonly StoredIntegrationBinding[]
  }

  failIntegration(
    bindingId: string,
    runtimeVersion: number,
    outcome:
      | {
          readonly errorCode: string
          readonly health: Extract<IntegrationHealth, 'failed' | 'needs_reauth'>
          readonly now: number
        }
      | { readonly retryAt: number },
  ): void {
    if ('retryAt' in outcome) {
      this.#database
        .prepare('UPDATE integration_bindings SET retry_at = ?, reconcile_at = NULL WHERE binding_id = ? AND runtime_version = ?')
        .run(outcome.retryAt, bindingId, runtimeVersion)
      return
    }
    this.#transaction(() => {
      const current = this.#database
        .prepare('SELECT health, last_error_code AS lastErrorCode FROM integration_bindings WHERE binding_id = ? AND runtime_version = ?')
        .get(bindingId, runtimeVersion) as { readonly health: IntegrationHealth; readonly lastErrorCode: string | null } | undefined
      const changed = this.#database
        .prepare(
          `UPDATE integration_bindings
           SET health = ?, last_error_code = ?, retry_at = NULL, reconcile_at = NULL, updated_at = ?
           WHERE binding_id = ? AND runtime_version = ?`,
        )
        .run(outcome.health, outcome.errorCode, outcome.now, bindingId, runtimeVersion)
      if (changed.changes == 1 && current?.health != outcome.health) {
        this.#insertTriggerActivity(bindingId, outcome.health == 'needs_reauth' ? 'health.needs_reauth' : 'health.failed', outcome.now, outcome.errorCode)
      }
      this.#database.prepare('UPDATE integration_states SET reconcile_at = NULL WHERE binding_id = ?').run(bindingId)
      this.#pruneTriggerActivities(outcome.now, 100)
    })
  }

  integrationBinding(flowId: string, triggerNodeId: string): StoredIntegrationBinding | undefined {
    return this.#database
      .prepare(
        `SELECT binding_id AS bindingId, endpoint_id AS endpointId, flow_id AS flowId, trigger_node_id AS triggerNodeId,
                current_publication_id AS currentPublicationId, runtime_version AS runtimeVersion,
                trigger_json AS triggerJson, connection_id AS connectionId, health
         FROM integration_bindings WHERE flow_id = ? AND trigger_node_id = ?`,
      )
      .get(flowId, triggerNodeId) as StoredIntegrationBinding | undefined
  }

  integrationState(bindingId: string): StoredIntegrationState | undefined {
    return this.#database
      .prepare(
        `SELECT binding_id AS bindingId, runtime_version AS runtimeVersion,
                trigger_json AS triggerJson, connection_id AS connectionId,
                checkpoint_json AS checkpointJson, subscription_json AS subscriptionJson,
                reconcile_at AS reconcileAt, updated_at AS updatedAt
         FROM integration_states WHERE binding_id = ?`,
      )
      .get(bindingId) as StoredIntegrationState | undefined
  }

  integrationTarget(endpointId: string): StoredIntegrationTarget | undefined {
    const row = this.#database
      .prepare(
        `SELECT bindings.binding_id AS bindingId, bindings.endpoint_id AS endpointId, bindings.flow_id AS flowId,
                bindings.trigger_node_id AS triggerNodeId,
                bindings.current_publication_id AS currentPublicationId,
                bindings.runtime_version AS runtimeVersion, bindings.trigger_json AS triggerJson,
                bindings.connection_id AS connectionId, bindings.health,
                publications.revision_id AS revisionId, publications.revision_digest AS revisionDigest,
                publications.closure_digest AS closureDigest, publications.engine_contract AS engineContract,
                publications.model_version AS modelVersion,
                revisions.content,
                states.binding_id AS stateBindingId, states.runtime_version AS stateRuntimeVersion,
                states.trigger_json AS stateTriggerJson, states.connection_id AS stateConnectionId,
                states.checkpoint_json AS stateCheckpointJson, states.subscription_json AS stateSubscriptionJson,
                states.reconcile_at AS stateReconcileAt, states.updated_at AS stateUpdatedAt
         FROM integration_bindings AS bindings
         JOIN flow_live
           ON flow_live.flow_id = bindings.flow_id
          AND flow_live.publication_id = bindings.current_publication_id
         JOIN publications ON publications.publication_id = bindings.current_publication_id
         JOIN revisions ON revisions.revision_id = publications.revision_id
         LEFT JOIN integration_states AS states ON states.binding_id = bindings.binding_id
         WHERE bindings.endpoint_id = ?
           AND bindings.operator_state = 'active'`,
      )
      .get(endpointId) as
      | (Omit<StoredIntegrationTarget, 'state'> & {
          readonly stateBindingId: string | null
          readonly stateCheckpointJson: string | null
          readonly stateConnectionId: string | null
          readonly stateReconcileAt: number | null
          readonly stateRuntimeVersion: number | null
          readonly stateSubscriptionJson: string | null
          readonly stateTriggerJson: string | null
          readonly stateUpdatedAt: number | null
        })
      | undefined
    if (row == null) return
    const {
      stateBindingId,
      stateCheckpointJson,
      stateConnectionId,
      stateReconcileAt,
      stateRuntimeVersion,
      stateSubscriptionJson,
      stateTriggerJson,
      stateUpdatedAt,
      ...target
    } = row
    if (
      stateBindingId == null ||
      stateCheckpointJson == null ||
      stateConnectionId == null ||
      stateRuntimeVersion == null ||
      stateSubscriptionJson == null ||
      stateTriggerJson == null ||
      stateUpdatedAt == null
    ) {
      return target
    }
    return {
      ...target,
      state: {
        bindingId: stateBindingId,
        checkpointJson: stateCheckpointJson,
        connectionId: stateConnectionId,
        reconcileAt: stateReconcileAt,
        runtimeVersion: stateRuntimeVersion,
        subscriptionJson: stateSubscriptionJson,
        triggerJson: stateTriggerJson,
        updatedAt: stateUpdatedAt,
      },
    }
  }

  markIntegrationSynced(bindingId: string, runtimeVersion: number, active: boolean, now: number): boolean {
    return this.#transaction(() => {
      const current = this.#database
        .prepare('SELECT health, last_error_code AS lastErrorCode FROM integration_bindings WHERE binding_id = ? AND runtime_version = ?')
        .get(bindingId, runtimeVersion) as { readonly health: IntegrationHealth; readonly lastErrorCode: string | null } | undefined
      const changed = this.#database
        .prepare(
          `UPDATE integration_bindings
           SET reconcile_at = NULL, retry_at = NULL,
               health = CASE WHEN ? = 1 THEN 'healthy' ELSE health END,
               last_error_code = CASE WHEN ? = 1 THEN NULL ELSE last_error_code END,
               updated_at = ?
           WHERE binding_id = ? AND runtime_version = ?`,
        )
        .run(active ? 1 : 0, active ? 1 : 0, now, bindingId, runtimeVersion).changes
      if (changed == 1 && active && current?.lastErrorCode != null) {
        this.#insertTriggerActivity(bindingId, 'health.recovered', now)
      }
      this.#database
        .prepare(
          `UPDATE integration_states SET reconcile_at = NULL
           WHERE binding_id = ? AND runtime_version = ? AND reconcile_at <= ?`,
        )
        .run(bindingId, runtimeVersion, now)
      this.#pruneTriggerActivities(now, 100)
      return changed == 1
    })
  }

  nextIntegrationAt(): number | undefined {
    const row = this.#database
      .prepare(
        `SELECT MIN(next_at) AS nextAt FROM (
           SELECT retry_at AS next_at FROM integration_bindings WHERE operator_state = 'active' AND retry_at IS NOT NULL
           UNION ALL
           SELECT reconcile_at AS next_at FROM integration_bindings WHERE operator_state = 'active' AND retry_at IS NULL
           UNION ALL
           SELECT states.reconcile_at AS next_at
           FROM integration_states AS states
           JOIN integration_bindings AS bindings USING (binding_id)
           WHERE bindings.operator_state = 'active' AND bindings.retry_at IS NULL
         )`,
      )
      .get() as { readonly nextAt: number | null }
    return row.nextAt ?? undefined
  }

  updateIntegrationCheckpoint(bindingId: string, runtimeVersion: number, expected: string, checkpoint: string, now: number): boolean {
    return (
      this.#database
        .prepare(
          `UPDATE integration_states SET checkpoint_json = ?, updated_at = ?
           WHERE binding_id = ? AND runtime_version = ? AND checkpoint_json = ?`,
        )
        .run(checkpoint, now, bindingId, runtimeVersion, expected).changes == 1
    )
  }

  updateIntegrationSubscription(bindingId: string, runtimeVersion: number, expected: string, subscription: string, reconcileAt: number, now: number): boolean {
    return (
      this.#database
        .prepare(
          `UPDATE integration_states SET subscription_json = ?, reconcile_at = ?, updated_at = ?
           WHERE binding_id = ? AND runtime_version = ? AND subscription_json = ?`,
        )
        .run(subscription, reconcileAt, now, bindingId, runtimeVersion, expected).changes == 1
    )
  }

  claimPoll(target: StoredPollTarget, claimId: string, now: number, leaseExpiresAt: number): PollClaim {
    return this.#transaction(() => {
      const completed = this.#database.prepare('SELECT 1 FROM poll_claims WHERE binding_id = ? AND claim_id = ?').get(target.bindingId, claimId)
      if (completed != null) return { kind: 'completed' }
      const leaseToken = randomUUID()
      const changed = this.#database
        .prepare(
          `UPDATE poll_bindings
           SET active_claim_id = ?, active_lease_token = ?, active_lease_expires_at = ?
           WHERE binding_id = ?
             AND runtime_version = ?
             AND current_publication_id = ?
             AND trigger_json = ?
             AND connection_id = ?
             AND schedule_json = ?
             AND next_at = ?
             AND health IN ('healthy', 'initializing')
             AND operator_state = 'active'
             AND ((? IS NULL AND continuation_root_id IS NULL AND continuation_page = 0)
               OR (continuation_root_id = ? AND continuation_page = ?))
             AND (active_claim_id IS NULL OR active_lease_expires_at <= ?)
             AND EXISTS (
               SELECT 1 FROM flow_live
               WHERE flow_id = poll_bindings.flow_id
                 AND publication_id = poll_bindings.current_publication_id
             )`,
        )
        .run(
          claimId,
          leaseToken,
          leaseExpiresAt,
          target.bindingId,
          target.runtimeVersion,
          target.publicationId,
          target.triggerJson,
          target.connectionId,
          target.scheduleJson,
          target.nextAt,
          target.continuationRootId,
          target.continuationRootId,
          target.continuationPage,
          now,
        )
      if (changed.changes == 1) return { kind: 'acquired', leaseToken }
      if (this.#database.prepare('SELECT 1 FROM poll_claims WHERE binding_id = ? AND claim_id = ?').get(target.bindingId, claimId) != null) {
        return { kind: 'completed' }
      }
      const active = this.#database
        .prepare('SELECT active_lease_expires_at AS leaseExpiresAt FROM poll_bindings WHERE binding_id = ? AND runtime_version = ?')
        .get(target.bindingId, target.runtimeVersion) as { readonly leaseExpiresAt: number | null } | undefined
      return active?.leaseExpiresAt != null && active.leaseExpiresAt > now ? { kind: 'busy' } : { kind: 'unavailable' }
    })
  }

  completePollPage(input: {
    readonly activate: boolean
    readonly checkpointJson: string
    readonly claimExpiresAt: number
    readonly claimId: string
    readonly completedAt: number
    readonly leaseToken: string
    readonly nextAt: number
    readonly nextContinuationPage: number
    readonly nextContinuationRootId: string | null
    readonly page: number
    readonly payload: JsonValue | null
    readonly providerEventIds: readonly string[]
    readonly requestDigest: string | null
    readonly rootOccurrenceId: string
    readonly target: StoredPollTarget
  }): PollCompletion {
    return this.#transaction(() => {
      const current = this.#database
        .prepare(
          `SELECT bindings.last_error_code AS lastErrorCode
           FROM poll_bindings AS bindings
           JOIN flow_live
             ON flow_live.flow_id = bindings.flow_id
            AND flow_live.publication_id = bindings.current_publication_id
           JOIN publications
             ON publications.publication_id = bindings.current_publication_id
           WHERE bindings.binding_id = ?
             AND bindings.runtime_version = ?
             AND bindings.current_publication_id = ?
             AND bindings.trigger_json = ?
             AND bindings.connection_id = ?
             AND bindings.schedule_json = ?
             AND bindings.next_at = ?
             AND bindings.health IN ('healthy', 'initializing')
             AND bindings.operator_state = 'active'
             AND bindings.active_claim_id = ?
             AND bindings.active_lease_token = ?
             AND publications.revision_id = ?
             AND publications.revision_digest = ?
             AND publications.closure_digest = ?
             AND publications.engine_contract = ?
             AND publications.model_version = ?`,
        )
        .get(
          input.target.bindingId,
          input.target.runtimeVersion,
          input.target.publicationId,
          input.target.triggerJson,
          input.target.connectionId,
          input.target.scheduleJson,
          input.target.nextAt,
          input.claimId,
          input.leaseToken,
          input.target.revisionId,
          input.target.revisionDigest,
          input.target.closureDigest,
          input.target.engineContract,
          input.target.modelVersion,
        ) as { readonly lastErrorCode: string | null } | undefined
      if (current == null) return { kind: 'ignored' }

      let accepted: RunAcceptance | undefined
      if (input.payload != null && input.requestDigest != null) {
        const admission = this.#acceptTriggerOccurrence({
          content: input.target.content,
          closureDigest: input.target.closureDigest,
          flowId: input.target.flowId,
          modelVersion: input.target.modelVersion,
          occurrenceId: input.claimId,
          payload: input.payload,
          publicationId: input.target.publicationId,
          requestDigest: input.requestDigest,
          revisionDigest: input.target.revisionDigest,
          revisionId: input.target.revisionId,
          source: 'trigger',
          triggerNodeId: input.target.triggerNodeId,
        })
        if (admission.kind == 'overloaded') return admission
        accepted = admission
        if (accepted.kind == 'conflict') throw new Error('Poll page identity already refers to a different invocation.')
        if (accepted.created) {
          this.#database
            .prepare(
              `INSERT INTO poll_admissions (
                 run_id, binding_id, runtime_version, publication_id, root_occurrence_id, page
               ) VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(accepted.runId, input.target.bindingId, input.target.runtimeVersion, input.target.publicationId, input.rootOccurrenceId, input.page)
          for (const providerEventId of input.providerEventIds) {
            this.#database
              .prepare(
                `INSERT INTO poll_event_dedupe (
                   binding_id, provider_event_id, run_id, created_at, expires_at
                 ) VALUES (?, ?, ?, ?, ?)`,
              )
              .run(input.target.bindingId, providerEventId, accepted.runId, input.completedAt, input.claimExpiresAt)
          }
        }
      } else if (input.payload != null || input.requestDigest != null || input.providerEventIds.length != 0) {
        throw new TypeError('Poll page Run input is incomplete.')
      }

      this.#database
        .prepare(
          `INSERT INTO poll_claims (
             binding_id, claim_id, root_occurrence_id, page, runtime_version, run_id, completed_at, expires_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.target.bindingId,
          input.claimId,
          input.rootOccurrenceId,
          input.page,
          input.target.runtimeVersion,
          accepted?.kind == 'accepted' ? accepted.runId : null,
          input.completedAt,
          input.claimExpiresAt,
        )
      this.#database
        .prepare(
          `UPDATE poll_bindings
           SET checkpoint_json = ?, continuation_root_id = ?, continuation_page = ?,
               active_claim_id = NULL, active_lease_token = NULL, active_lease_expires_at = NULL,
               retry_at = NULL, next_at = ?,
               health = CASE WHEN ? = 1 THEN 'healthy' ELSE health END,
               last_error_code = CASE WHEN ? = 1 THEN NULL ELSE last_error_code END,
               updated_at = CASE WHEN ? = 1 THEN ? ELSE updated_at END
           WHERE binding_id = ? AND runtime_version = ? AND active_claim_id = ? AND active_lease_token = ?`,
        )
        .run(
          input.checkpointJson,
          input.nextContinuationRootId,
          input.nextContinuationPage,
          input.nextAt,
          input.activate ? 1 : 0,
          input.activate ? 1 : 0,
          input.activate ? 1 : 0,
          input.completedAt,
          input.target.bindingId,
          input.target.runtimeVersion,
          input.claimId,
          input.leaseToken,
        )
      if (input.activate && current.lastErrorCode != null) {
        this.#insertTriggerActivity(input.target.bindingId, 'health.recovered', input.completedAt)
        this.#pruneTriggerActivities(input.completedAt, 100)
      }
      return { ...(accepted == null ? {} : { accepted }), kind: 'completed' }
    })
  }

  duePoll(now: number, limit: number): readonly StoredPollTarget[] {
    return this.#pollTargets(
      `AND COALESCE(bindings.retry_at, bindings.next_at) <= ?
       AND (bindings.active_claim_id IS NULL OR bindings.active_lease_expires_at <= ?)
       ORDER BY COALESCE(bindings.retry_at, bindings.next_at), bindings.binding_id
       LIMIT ?`,
      now,
      now,
      limit,
    )
  }

  failPollClaim(
    bindingId: string,
    runtimeVersion: number,
    leaseToken: string,
    outcome:
      | { readonly errorCode: string; readonly health: Extract<PollHealth, 'failed' | 'needs_reauth'>; readonly now: number }
      | { readonly retryAt: number },
  ): void {
    if ('retryAt' in outcome) {
      this.#database
        .prepare(
          `UPDATE poll_bindings
           SET active_claim_id = NULL, active_lease_token = NULL, active_lease_expires_at = NULL, retry_at = ?
           WHERE binding_id = ? AND runtime_version = ? AND active_lease_token = ?`,
        )
        .run(outcome.retryAt, bindingId, runtimeVersion, leaseToken)
      return
    }
    this.#transaction(() => {
      const current = this.#database
        .prepare('SELECT health FROM poll_bindings WHERE binding_id = ? AND runtime_version = ? AND active_lease_token = ?')
        .get(bindingId, runtimeVersion, leaseToken) as { readonly health: PollHealth } | undefined
      const changed = this.#database
        .prepare(
          `UPDATE poll_bindings
           SET active_claim_id = NULL, active_lease_token = NULL, active_lease_expires_at = NULL,
               retry_at = NULL, next_at = NULL, health = ?, last_error_code = ?, updated_at = ?
           WHERE binding_id = ? AND runtime_version = ? AND active_lease_token = ?`,
        )
        .run(outcome.health, outcome.errorCode, outcome.now, bindingId, runtimeVersion, leaseToken)
      if (changed.changes == 1 && current?.health != outcome.health) {
        this.#insertTriggerActivity(bindingId, outcome.health == 'needs_reauth' ? 'health.needs_reauth' : 'health.failed', outcome.now, outcome.errorCode)
      }
      this.#pruneTriggerActivities(outcome.now, 100)
    })
  }

  knownPollEvents(bindingId: string, providerEventIds: readonly string[]): ReadonlySet<string> {
    if (providerEventIds.length == 0) return new Set()
    const parameters = providerEventIds.map(() => '?').join(', ')
    const rows = this.#database
      .prepare(`SELECT provider_event_id AS providerEventId FROM poll_event_dedupe WHERE binding_id = ? AND provider_event_id IN (${parameters})`)
      .all(bindingId, ...providerEventIds) as { readonly providerEventId: string }[]
    return new Set(rows.map((row) => row.providerEventId))
  }

  nextPollAt(): number | undefined {
    const row = this.#database
      .prepare(
        `SELECT MIN(
           CASE WHEN bindings.active_claim_id IS NULL
             THEN COALESCE(bindings.retry_at, bindings.next_at)
             ELSE bindings.active_lease_expires_at
           END
         ) AS nextAt
         FROM poll_bindings AS bindings
         JOIN flow_live
           ON flow_live.flow_id = bindings.flow_id
          AND flow_live.publication_id = bindings.current_publication_id
         WHERE bindings.health IN ('healthy', 'initializing')
           AND bindings.operator_state = 'active'`,
      )
      .get() as { readonly nextAt: number | null }
    return row.nextAt ?? undefined
  }

  pollState(flowId: string, triggerNodeId: string): PollState | undefined {
    const row = this.#database
      .prepare(
        `SELECT binding_id AS bindingId, checkpoint_json AS checkpointJson, health, runtime_version AS runtimeVersion
         FROM poll_bindings WHERE flow_id = ? AND trigger_node_id = ?`,
      )
      .get(flowId, triggerNodeId) as
      | { readonly bindingId: string; readonly checkpointJson: string; readonly health: PollHealth; readonly runtimeVersion: number }
      | undefined
    return row == null
      ? undefined
      : { bindingId: row.bindingId, checkpoint: JSON.parse(row.checkpointJson) as JsonValue, health: row.health, runtimeVersion: row.runtimeVersion }
  }

  pollTarget(bindingId: string, runtimeVersion: number): StoredPollTarget | undefined {
    return this.#pollTargets('AND bindings.binding_id = ? AND bindings.runtime_version = ?', bindingId, runtimeVersion)[0]
  }

  pollTestTarget(flowId: string, triggerNodeId: string): StoredPollTestTarget | undefined {
    const row = this.#database
      .prepare(
        `SELECT bindings.binding_id AS bindingId,
                bindings.flow_id AS flowId,
                bindings.trigger_node_id AS triggerNodeId,
                bindings.runtime_version AS runtimeVersion,
                bindings.trigger_json AS triggerJson,
                bindings.connection_id AS connectionId,
                bindings.checkpoint_json AS checkpointJson,
                publications.publication_id AS publicationId,
                publications.revision_id AS revisionId,
                publications.revision_digest AS revisionDigest,
                publications.closure_digest AS closureDigest,
                revisions.content
         FROM poll_bindings AS bindings
         JOIN flow_live
           ON flow_live.flow_id = bindings.flow_id
          AND flow_live.publication_id = bindings.current_publication_id
         JOIN publications ON publications.publication_id = bindings.current_publication_id
         JOIN revisions ON revisions.revision_id = publications.revision_id
         WHERE bindings.flow_id = ? AND bindings.trigger_node_id = ?
           AND bindings.trigger_json IS NOT NULL AND bindings.connection_id IS NOT NULL`,
      )
      .get(flowId, triggerNodeId) as (Omit<StoredPollTestTarget, 'checkpoint'> & { readonly checkpointJson: string }) | undefined
    if (row == null) return
    const { checkpointJson, ...target } = row
    return { ...target, checkpoint: JSON.parse(checkpointJson) as JsonValue }
  }

  prunePoll(now: number, limit: number): number {
    return this.#transaction(() => {
      const claims = this.#database
        .prepare(
          `DELETE FROM poll_claims WHERE rowid IN (
             SELECT rowid FROM poll_claims ORDER BY expires_at, binding_id, claim_id LIMIT ?
           ) AND expires_at <= ?`,
        )
        .run(limit, now).changes
      const events = this.#database
        .prepare(
          `DELETE FROM poll_event_dedupe WHERE rowid IN (
             SELECT rowid FROM poll_event_dedupe ORDER BY expires_at, binding_id, provider_event_id LIMIT ?
           ) AND expires_at <= ?`,
        )
        .run(limit, now).changes
      return Number(claims) + Number(events)
    })
  }

  dueCron(now: number, limit: number): readonly StoredCronTarget[] {
    return this.#database
      .prepare(
        `SELECT
           bindings.binding_id AS bindingId,
           bindings.flow_id AS flowId,
           bindings.trigger_node_id AS triggerNodeId,
           bindings.runtime_version AS runtimeVersion,
           bindings.trigger_json AS triggerJson,
           bindings.schedule_json AS scheduleJson,
           bindings.next_at AS nextAt,
           publications.publication_id AS publicationId,
           publications.revision_id AS revisionId,
           publications.revision_digest AS revisionDigest,
           publications.closure_digest AS closureDigest,
           publications.engine_contract AS engineContract,
           publications.model_version AS modelVersion,
           revisions.content
         FROM cron_bindings AS bindings
         JOIN flow_live
           ON flow_live.flow_id = bindings.flow_id
          AND flow_live.publication_id = bindings.current_publication_id
         JOIN publications
           ON publications.publication_id = bindings.current_publication_id
         JOIN revisions
           ON revisions.revision_id = publications.revision_id
         WHERE bindings.trigger_json IS NOT NULL
           AND bindings.schedule_json IS NOT NULL
           AND bindings.operator_state = 'active'
           AND bindings.next_at <= ?
         ORDER BY bindings.next_at, bindings.binding_id
         LIMIT ?`,
      )
      .all(now, limit) as unknown as readonly StoredCronTarget[]
  }

  nextCronAt(): number | undefined {
    const row = this.#database
      .prepare(
        `SELECT MIN(bindings.next_at) AS nextAt
         FROM cron_bindings AS bindings
         JOIN flow_live
           ON flow_live.flow_id = bindings.flow_id
          AND flow_live.publication_id = bindings.current_publication_id
         WHERE bindings.trigger_json IS NOT NULL
           AND bindings.schedule_json IS NOT NULL
           AND bindings.operator_state = 'active'`,
      )
      .get() as { readonly nextAt: number | null }
    return row.nextAt ?? undefined
  }

  webhookTarget(endpointId: string): StoredWebhookTarget | undefined {
    return this.#database
      .prepare(
        `SELECT
           bindings.endpoint_id AS endpointId,
           bindings.flow_id AS flowId,
           bindings.trigger_node_id AS triggerNodeId,
           bindings.runtime_version AS runtimeVersion,
           bindings.trigger_json AS triggerJson,
           publications.publication_id AS publicationId,
           publications.revision_id AS revisionId,
           publications.revision_digest AS revisionDigest,
           publications.closure_digest AS closureDigest,
           publications.engine_contract AS engineContract,
           revisions.content
         FROM webhook_bindings AS bindings
         JOIN flow_live
           ON flow_live.flow_id = bindings.flow_id
          AND flow_live.publication_id = bindings.current_publication_id
         JOIN publications
           ON publications.publication_id = bindings.current_publication_id
         JOIN revisions
           ON revisions.revision_id = publications.revision_id
         WHERE bindings.endpoint_id = ?
           AND bindings.trigger_json IS NOT NULL
           AND bindings.operator_state = 'active'`,
      )
      .get(endpointId) as StoredWebhookTarget | undefined
  }

  webhookEndpoint(flowId: string, triggerNodeId: string): string | undefined {
    return (
      this.#database
        .prepare(
          `SELECT bindings.endpoint_id AS endpointId
           FROM webhook_bindings AS bindings
           JOIN flow_live
             ON flow_live.flow_id = bindings.flow_id
            AND flow_live.publication_id = bindings.current_publication_id
           WHERE bindings.flow_id = ? AND bindings.trigger_node_id = ?`,
        )
        .get(flowId, triggerNodeId) as { readonly endpointId: string } | undefined
    )?.endpointId
  }

  #pollTargets(condition: string, ...parameters: readonly (number | string)[]): readonly StoredPollTarget[] {
    const rows = this.#database
      .prepare(
        `SELECT
           bindings.binding_id AS bindingId,
           bindings.flow_id AS flowId,
           bindings.trigger_node_id AS triggerNodeId,
           bindings.runtime_version AS runtimeVersion,
           bindings.trigger_json AS triggerJson,
           bindings.connection_id AS connectionId,
           bindings.schedule_json AS scheduleJson,
           bindings.next_at AS nextAt,
           bindings.health,
           bindings.checkpoint_json AS checkpointJson,
           bindings.continuation_root_id AS continuationRootId,
           bindings.continuation_page AS continuationPage,
           publications.publication_id AS publicationId,
           publications.revision_id AS revisionId,
           publications.revision_digest AS revisionDigest,
           publications.closure_digest AS closureDigest,
           publications.engine_contract AS engineContract,
           publications.model_version AS modelVersion,
           revisions.content
         FROM poll_bindings AS bindings
         JOIN flow_live
           ON flow_live.flow_id = bindings.flow_id
          AND flow_live.publication_id = bindings.current_publication_id
         JOIN publications
           ON publications.publication_id = bindings.current_publication_id
         JOIN revisions
           ON revisions.revision_id = publications.revision_id
         WHERE bindings.trigger_json IS NOT NULL
           AND bindings.connection_id IS NOT NULL
           AND bindings.schedule_json IS NOT NULL
           AND bindings.next_at IS NOT NULL
           AND bindings.health IN ('healthy', 'initializing')
           AND bindings.operator_state = 'active'
           ${condition}`,
      )
      .all(...parameters) as unknown as readonly (Omit<StoredPollTarget, 'checkpoint'> & { readonly checkpointJson: string })[]
    const targets: StoredPollTarget[] = []
    for (const { checkpointJson, ...row } of rows) {
      targets.push({ ...row, checkpoint: JSON.parse(checkpointJson) as JsonValue })
    }
    return targets
  }

  #insertTriggerActivity(bindingId: string, kind: TriggerActivityKind, createdAt: number, errorCode?: string, errorMessage?: string): void {
    this.#database
      .prepare(
        `INSERT INTO trigger_activities (
           activity_id, binding_id, kind, error_code, error_message, created_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `activity_${randomUUID().replaceAll('-', '')}`,
        bindingId,
        kind,
        errorCode ?? null,
        errorMessage?.slice(0, 512) ?? null,
        createdAt,
        createdAt + triggerActivityRetentionMs,
      )
  }

  #pruneTriggerActivities(now: number, limit: number): void {
    this.#database
      .prepare(
        `DELETE FROM trigger_activities
         WHERE rowid IN (
           SELECT rowid FROM trigger_activities
           WHERE expires_at <= ?
           ORDER BY expires_at, activity_id
           LIMIT ?
         )`,
      )
      .run(now, limit)
  }
}
