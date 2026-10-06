import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_COMMIT, HISTORICAL_COMMIT, HISTORICAL_TREE, RELEASE_MARKER, checkFullMccSource } from './check-full-mcc-source.mjs'

const check = (value, message) => { if (!value) throw new Error(message) }
const evidence = value => typeof value === 'string' && value.length >= 12 && value.length <= 1000 && !/pending|placeholder|example|tbd|unknown/i.test(value)
const sha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
export function validateFullMccCutover(marker, proof, now = Date.now()) {
  check(marker?.release === 'full-mcc-historical-restoration-20261006' && marker.status === 'reviewed-approved', 'Explicit reviewed cutover marker is absent or still blocked.')
  check(marker.baseCommit === BASE_COMMIT && marker.historicalCommit === HISTORICAL_COMMIT && marker.historicalTree === HISTORICAL_TREE, 'Cutover source pins changed.')
  check(proof.scope === 'committed-tree' && /^[0-9a-f]{40}$/.test(proof.candidateCommit ?? ''), 'Only a clean committed candidate can be approved for publication.')
  check(proof.violations.length === 0 && sha256(marker.review?.sourceSnapshotSha256) && marker.review.sourceSnapshotSha256 === proof.sourceSnapshotSha256, 'Reviewed whole-source fingerprint does not match this candidate.')
  check(evidence(marker.review?.reviewer) && evidence(marker.review?.evidenceRef), 'Independent source and cutover review evidence is missing.')
  const approvedAt = Date.parse(marker.review.approvedAt), expiresAt = Date.parse(marker.review.expiresAt)
  check(Number.isFinite(approvedAt) && approvedAt <= now && expiresAt > now && expiresAt > approvedAt && expiresAt - approvedAt <= 24 * 60 * 60 * 1000, 'Cutover review is missing, future-dated, expired or exceeds 24 hours.')
  check(marker.sourceBackup?.ref === 'backup/pre-full-mcc-restore-20261006-1507' && marker.sourceBackup.commit === BASE_COMMIT && marker.sourceBackup.verified === true && evidence(marker.sourceBackup.evidenceRef), 'Verified pre-rollback source backup is required.')
  const backup = marker.protectedStateBackup
  check(backup?.verifiedRestorable === true && evidence(backup.evidenceRef) && sha256(backup.manifestSha256), 'Protected runtime data backup/restore evidence is missing.')
  const backupAt = Date.parse(backup.completedAt)
  check(Number.isFinite(backupAt) && backupAt <= approvedAt, 'Runtime data backup timing is unverified.')
  const pause = marker.quiescence
  check(pause?.allMutatingIngressPaused === true && pause.studioInFlightReconciled === true && pause.billingEventsDrained === true && evidence(pause.evidenceRef), 'Mutating ingress, active jobs or billing delivery are not safely quiesced.')
  const pausedAt = Date.parse(pause.startedAt)
  check(Number.isFinite(pausedAt) && pausedAt <= backupAt && Date.parse(pause.validUntil) > now, 'State snapshot must follow quiescence, which must still be valid.')
  const runtime = marker.runtimeReview
  check(runtime?.fastModel === 'gpt-6-sol' && runtime.preserveOtherRemoteVars === true && runtime.keepVars === true && sha256(runtime.remoteNonSecretSnapshotSha256) && evidence(runtime.evidenceRef), 'Exact remote runtime selection is unresolved.')
  check(runtime.paidGenerationFlagsReviewed === true && runtime.currentPaymentSettingsPreserved === true && runtime.newAstraPlanPolicyReviewed === true && runtime.historical175CentGateAcknowledged === true, 'Paid-generation, current-payment or historical 175-cent policy review is unresolved.')
  const state = marker.protectedStateReview
  check(state?.usersAndSupabaseUntouched === true && state.authIdentityAndSessionsPreserved === true && state.invoiceBridgePreserved === true && state.bindingsAndMigrationsUnchanged === true && state.financialBoundaryReviewed === true && evidence(state.evidenceRef), 'Users/authentication/invoice bridge or financial-state protection remains unverified.')
  check(marker.prohibitedActions?.secretSynchronization === false && marker.prohibitedActions.paymentSetup === false && marker.prohibitedActions.paidTests === false && marker.prohibitedActions.permanentDeletion === false, 'Cutover permits an out-of-scope action.')
  return { ready: true, sourceSnapshotSha256: proof.sourceSnapshotSha256, expiresAt: marker.review.expiresAt }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Arguments are not accepted.')
    const proof = await checkFullMccSource({ committed: true })
    console.log(JSON.stringify(validateFullMccCutover(JSON.parse(await readFile(RELEASE_MARKER, 'utf8')), proof), null, 2))
  } catch (error) { console.error(`FULL_MCC_PUBLICATION_BLOCKED: ${error.message}`); process.exitCode = 1 }
}
