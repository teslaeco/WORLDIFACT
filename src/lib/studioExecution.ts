import { MODEL_CATALOG, type GenerationModel } from './modelCatalog.ts'

export const STUDIO_EXECUTION_REVISION = 'studio-execution-v1' as const
export type StudioExecution = { revision: typeof STUDIO_EXECUTION_REVISION; model: GenerationModel; mode: 'standard' | 'fast' }
export function isStudioExecution(value: unknown): value is StudioExecution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).sort().join(',') === 'mode,model,revision' && item.revision === STUDIO_EXECUTION_REVISION &&
    typeof item.model === 'string' && Object.hasOwn(MODEL_CATALOG, item.model) && (item.mode === 'standard' || item.mode === 'fast')
}
export function studioExecution(value: unknown): StudioExecution | undefined {
  if (value === undefined) return undefined
  if (!isStudioExecution(value)) throw new Error('Choose a supported model and execution mode.')
  return { revision: STUDIO_EXECUTION_REVISION, model: value.model, mode: value.mode }
}
export function sameStudioExecution(a: StudioExecution | undefined, b: StudioExecution | undefined): boolean {
  return a === undefined && b === undefined || isStudioExecution(a) && isStudioExecution(b) && a.model === b.model && a.mode === b.mode
}
