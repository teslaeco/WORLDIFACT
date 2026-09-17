import type { StudioJob } from './studioProtocol.ts'

/** Draft editing never changes a submitted job. Only a confirmed terminal
 * result permits a new explicit paid submission while a receipt is selected.
 */
export function canSubmitNewDraft(selectedId: string | undefined, job: Pick<StudioJob, 'id' | 'state'> | null | undefined): boolean {
  return !selectedId || (!!job && job.id === selectedId && ['succeeded', 'failed', 'cancelled'].includes(job.state))
}
