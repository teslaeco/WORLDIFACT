import { MODEL_CATALOG } from './modelCatalog.ts'
import { isStudioExecution, type StudioExecution } from './studioExecution.ts'

/** Oracle's immutable terminal budget receipt is a server-side model-binding
 * attestation, not an OpenAI-signed certificate of 3D visual quality.
 * Selection alone must never be shown as verified execution. */
export const STUDIO_PROVIDER_EVIDENCE_REVISION = 'studio-provider-evidence-v1' as const

export type StudioProviderEvidence = {
  revision: typeof STUDIO_PROVIDER_EVIDENCE_REVISION
  model: (typeof MODEL_CATALOG)[keyof typeof MODEL_CATALOG]['model']
  mode: StudioExecution['mode']
  source: 'oracle-terminal-budget'
}

export function isStudioProviderEvidence(value: unknown, selected: unknown): value is StudioProviderEvidence {
  if (!isStudioExecution(selected) || !value || typeof value !== 'object' || Array.isArray(value)) return false
  const evidence = value as Record<string, unknown>
  return Object.keys(evidence).sort().join(',') === 'mode,model,revision,source' &&
    evidence.revision === STUDIO_PROVIDER_EVIDENCE_REVISION &&
    evidence.source === 'oracle-terminal-budget' &&
    evidence.model === MODEL_CATALOG[selected.model].model &&
    evidence.mode === selected.mode
}
