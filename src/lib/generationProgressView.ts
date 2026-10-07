import { studioPointsPending, type StudioJob } from './studioProtocol.ts'
import { isAdmissionFailureCode } from './generationAdmission.ts'

/** UI evidence only. No elapsed-time-to-percentage conversion is supported. */
export type ArtifactCompletion = {
  jobId: string
  validated: boolean
  saved: boolean
}
export type GenerationProgressInput = {
  job: StudioJob | null
  artifact?: ArtifactCompletion
  /** Time since request tracking began, including queue/upload. Never worker runtime. */
  trackedSeconds?: number
}
export type GenerationProgressView = {
  title: string
  detail: string
  kind: 'idle' | 'active' | 'review' | 'failed' | 'complete'
  /** Equal confirmed milestones, never a measurement of work or remaining time. */
  percent: 25 | 50 | 75 | 100 | null
  stage: string
  elapsed: string | null
}

export function formatTrackedElapsed(seconds?: number): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > Number.MAX_SAFE_INTEGER) return null
  const value = Math.floor(seconds)
  const minutes = Math.floor(value / 60)
  const remainder = String(value % 60).padStart(2, '0')
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`
}

export function generationProgressView({ job, artifact, trackedSeconds }: GenerationProgressInput): GenerationProgressView {
  const elapsed = formatTrackedElapsed(trackedSeconds)
  const base = { percent: null, elapsed } as const
  if (!job) return { ...base, kind: 'idle', title: 'Your next creation', stage: 'Ready for an idea', detail: 'Describe your model to prepare a new request.' }
  if (studioPointsPending(job)) return { ...base, kind: 'review', title: job.pointSettlementUnconfirmed ? 'Generation failed · settlement unconfirmed' : 'Generation failed · points held', stage: 'Cost review required', detail: job.detail }
  if (job.reconciliationRequired) return { ...base, kind: 'review', title: 'Status review needed', stage: 'Needs attention', detail: job.detail }
  if (job.state === 'failed' && isAdmissionFailureCode(job.failureCode)) return { ...base, kind: 'failed', title: 'Generation was not started', stage: 'Not submitted', detail: job.detail }
  if (job.state === 'failed' && job.failureCode === 'MISSING_SUBMISSION') return { ...base, kind: 'review', title: 'The upload was not confirmed', stage: 'Acceptance unconfirmed', detail: job.detail }
  if (job.state === 'failed' || job.state === 'cancelled') return { ...base, kind: 'failed', title: job.state === 'cancelled' ? 'Request cancelled' : 'Model did not finish', stage: 'Request ended', detail: job.detail }
  if (job.state === 'succeeded') {
    if (artifact?.jobId === job.id && artifact.validated && artifact.saved) return { ...base, percent: 100, kind: 'complete', title: 'Model saved', stage: 'Complete · visual review needed', detail: 'The completed model passed file validation and was saved. Inspect the result before use; manufacturing is not approved.' }
    return { ...base, percent: 75, kind: 'review', title: 'Worker finished', stage: job.downloadAllowed === false ? 'Access required' : 'Checking the result', detail: job.downloadAllowed === false ? 'The saved result is preserved. Model access requires an eligible subscription.' : 'Waiting for the same job’s model to pass file validation and be saved. Completion is not shown yet.' }
  }
  const stages: Record<Exclude<StudioJob['state'], 'succeeded' | 'failed' | 'cancelled'>, [string, string]> = {
    pending: ['Confirming your request', 'Awaiting acceptance'],
    queued: ['Your model is queued', 'Accepted · queued'],
    generating: ['Astra is preparing your model', 'Generating instructions'],
    retrying: ['Reviewing the same model', 'Reviewing or repairing'],
    building: ['Building your 3D model', 'Building or exporting'],
  }
  const [title, stage] = stages[job.state]
  // State is authoritative on every render. A lower/retrying state is never
  // hidden behind a monotonic maximum or an elapsed-time animation.
  const percent = job.state === 'pending' ? null : job.state === 'queued' ? 25 : 50
  return { ...base, percent, kind: 'active', title, stage, detail: job.detail }
}
