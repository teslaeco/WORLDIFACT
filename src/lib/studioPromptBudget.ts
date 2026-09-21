import { oracleStudioPayload, type StudioInput } from './studioProtocol.ts'

export type StudioPromptBudget = {
  used: number
  overhead: number
  total: number
  limit: number | null
  valid: boolean
  message: string
}

/** Match the server's normalized draft plus its actual export instructions.
 * Never truncate the owner's design or remove the manufacturing rules to fit.
 * FAST in the Shop uses /api/blueprint and its separate 2000-character limit.
 */
export function studioPromptBudget(
  input: Pick<StudioInput, 'prompt' | 'purpose' | 'textureMaxSize' | 'generationProfile'>,
  workerLimit: unknown,
): StudioPromptBudget {
  const used = input.prompt.trim().length
  const overhead = oracleStudioPayload('', {
    ...input, worldId: 'enchanted-ai-shop', prompt: '', photos: [],
  }).prompt.length
  const total = used + overhead
  if (typeof workerLimit !== 'number' || !Number.isSafeInteger(workerLimit) || workerLimit <= 0) {
    return { used, overhead, total, limit: null, valid: false,
      message: 'Refresh availability to read the worker description limit before submitting.' }
  }
  const limit = Math.max(0, Math.min(4000, workerLimit - overhead))
  const message = limit < 3
    ? 'The worker limit is too small for the required export instructions. Generation is blocked; your draft is unchanged.'
    : input.prompt.length > 4000
      ? 'The draft exceeds the 4000-character input limit. Shorten it without losing design requirements.'
      : used > limit
        ? `Description too long: ${used} / ${limit} characters. Remove at least ${used - limit} characters. The app also adds ${overhead} characters of export instructions.`
        : used < 3
          ? 'Enter at least 3 non-whitespace characters.'
          : `${used} / ${limit} description characters. Export instructions use ${overhead} more (${total} / ${workerLimit} total).`
  return { used, overhead, total, limit,
    valid: limit >= 3 && used >= 3 && used <= limit && input.prompt.length <= 4000, message }
}

/** Only fixed, user-actionable messages reach the UI; never echo arbitrary
 * provider text, URLs, receipts or credentials from a thrown exception.
 */
export function studioRequestErrorMessage(error: string): string {
  const length = /^Shorten the description: the worker accepts (2000|5000) characters including export instructions\.$/.exec(error)
  if (length) return `The description plus export instructions exceeds the worker's ${length[1]}-character limit. Shorten the description using the counter above, then submit once.`
  if (error === 'Enter a 3–4000 character description, a supported purpose and a texture-size limit.')
    return 'Check the description length and generation settings. No model was submitted by this validation step.'
  if (error === 'A job is already selected. Recover it instead of sending another paid request.')
    return 'An earlier job still needs confirmation. Use Recover this job instead of starting another generation.'
  if (error === 'Please wait before checking or submitting again.')
    return 'Too many requests. Wait a minute before refreshing availability or recovering the existing job.'
  if (['This worker has not confirmed photo input. Nothing was submitted.', 'Invalid reference photo description.', 'Use at most three views of the same object.'].includes(error))
    return 'Reference images could not be accepted. Check the images and SLOW availability before submitting again.'
  if (['Model generation is disabled or its allowance has expired.', 'The existing Astra/Blender worker is not ready.', 'The existing worker did not confirm readiness.', 'Generation services are temporarily unavailable. Your draft is preserved.'].includes(error))
    return 'Detailed generation is not currently ready. Refresh availability; keep the current model and do not submit repeatedly.'
  if (error === 'This generation window requires owner access.')
    return 'Generation currently requires owner access. The operator must review access settings; do not enter an API key.'
  if (['The browser could not retain your receipt. No paid request was submitted.', 'The previous receipt could not be retained. No new model was submitted.'].includes(error))
    return 'Browser recovery storage could not save the receipt. No new model was submitted. Keep this tab open and do not clear browser data.'
  if (/^(FAST generation timed out\.|The operation was aborted|The operation was aborted due to timeout|signal timed out)/i.test(error))
    return 'The request timed out. Keep this tab open; recover an existing job instead of submitting repeated generation requests.'
  return 'We could not complete that step. Refresh availability or recover the existing job. Do not clear browser data or submit repeatedly.'
}
