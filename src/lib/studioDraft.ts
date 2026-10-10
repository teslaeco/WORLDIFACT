import type { StudioJob } from './studioProtocol.ts'

/** Draft editing never changes a submitted job. Only a confirmed terminal
 * result permits a new explicit paid submission while a receipt is selected.
 */
export function canSubmitNewDraft(selectedId: string | undefined, job: Pick<StudioJob, 'id' | 'state'> | null | undefined): boolean {
  return !selectedId || (!!job && job.id === selectedId && ['succeeded', 'failed', 'cancelled'].includes(job.state))
}

/** Only composer fields, never a receipt, price authorization or model result. */
export type ShopDraftSnapshot = Readonly<{
  prompt: string; purpose: string; textureLimit: number; profile: string;
  cheapModel: string; budgetTier: string; deliverable: string; creationMode: string;
  photos: readonly Readonly<{ name: string; view: string; dataUrl: string; textureMaxSize: number }>[];
  dimensions: Readonly<{ xMm: number; yMm: number; zMm: number }>;
  dimensionsEnabled: boolean;
}>

/** A late result may clear only the still-unchanged submitted composer. A new
 * prompt, reference, mode or dimensions must survive that old response. */
export function sameShopDraft(a: ShopDraftSnapshot, b: ShopDraftSnapshot): boolean {
  return a.prompt === b.prompt && a.purpose === b.purpose && a.textureLimit === b.textureLimit &&
    a.profile === b.profile && a.cheapModel === b.cheapModel && a.budgetTier === b.budgetTier &&
    a.deliverable === b.deliverable && a.creationMode === b.creationMode &&
    a.dimensionsEnabled === b.dimensionsEnabled && a.dimensions.xMm === b.dimensions.xMm &&
    a.dimensions.yMm === b.dimensions.yMm && a.dimensions.zMm === b.dimensions.zMm &&
    a.photos.length === b.photos.length && a.photos.every((photo, index) => {
      const other = b.photos[index]
      return photo.name === other.name && photo.view === other.view &&
        photo.dataUrl === other.dataUrl && photo.textureMaxSize === other.textureMaxSize
    })
}
