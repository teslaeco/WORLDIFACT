import { StudioCoordinator, type ReceiptStore, type SavedStudioJob } from './studioClient.ts'
import type { StudioJob } from './studioProtocol.ts'

export const SHOP_WORLD_ARTIFACT_FORMATS = ['model', 'pbr', 'fbx', 'blend'] as const
export type ShopWorldArtifactFormat = typeof SHOP_WORLD_ARTIFACT_FORMATS[number]
export type ShopWorldArtifactResult = {
  format: ShopWorldArtifactFormat
  ok: boolean
  bytes: number
  blob?: Blob
  error?: string
}
export type ShopWorldArtifactAudit = {
  saved: SavedStudioJob
  job: StudioJob
  results: ShopWorldArtifactResult[]
}

export async function fetchExistingShopArtifacts(store: ReceiptStore, fetcher: typeof fetch = fetch): Promise<ShopWorldArtifactAudit> {
  const client = new StudioCoordinator(store, fetcher)
  const saved = client.restore()
  if (!saved) throw new Error('No saved AI Shop model receipt is available on this device.')
  const job = await client.poll(saved)
  if (job.state !== 'succeeded') throw new Error(`The saved AI Shop job is ${job.state}; no replacement generation was sent.`)

  const results: ShopWorldArtifactResult[] = []
  for (const format of SHOP_WORLD_ARTIFACT_FORMATS) {
    try {
      const blob = await client.artifact(format, saved)
      results.push({ format, ok: true, bytes: blob.size, blob })
    } catch (error) {
      results.push({ format, ok: false, bytes: 0, error: error instanceof Error ? error.message : 'Artifact unavailable.' })
    }
  }
  return { saved, job, results }
}

export function shopArtifactSummary(results: ShopWorldArtifactResult[]) {
  return results.map(result => result.ok
    ? `${result.format.toUpperCase()} ✓ ${(result.bytes / 1048576).toFixed(1)} MB`
    : `${result.format.toUpperCase()} ✕ ${result.error ?? 'unavailable'}`).join(' · ')
}
