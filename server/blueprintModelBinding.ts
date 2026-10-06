import type { GenerationModel } from '../src/lib/modelCatalog.ts'

// Immutable provider identities for the historical and Sol 6.1 blueprint writers.
// Never derive an old job's identity from the mutable current catalogue.
const HISTORICAL_PROVIDER_MODELS = Object.freeze({ luna: 'gpt-6-luna', sol: 'gpt-6-sol', astra: 'gpt-6-astra' })
export function boundBlueprintProviderModel(job: { model?: GenerationModel; profile: 'fast' | 'slow'; blueprintProviderModel?: unknown }): string | null {
  const model = job.model ?? (job.profile === 'fast' ? 'sol' : 'astra')
  if (!Object.hasOwn(HISTORICAL_PROVIDER_MODELS, model) || (model === 'astra') !== (job.profile === 'slow')) return null
  const historical = HISTORICAL_PROVIDER_MODELS[model]
  if (!Object.hasOwn(job, 'blueprintProviderModel')) return historical
  return job.blueprintProviderModel === historical || model === 'sol' && job.blueprintProviderModel === 'gpt-6.1-sol'
    ? job.blueprintProviderModel as string : null
}
