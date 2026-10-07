import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASE_COMMIT = '8a25c1bec57e93a4cdbcf6b1f9cfb09f9ca083dc'
export const MARKER_PATH = 'ops/PIPELINE_ONLY_RELEASE_20261004.json'
export const MARKER_CONTENT = JSON.stringify({
  release: 'generation-pipeline-recovery-20261004',
  baseCommit: BASE_COMMIT,
  preserveBilling: true,
}, null, 2) + '\n'
export const REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/STUDIO_GENERATION_LIFECYCLE.md',
  MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/studio.ts',
  'src/lib/studioClient.ts',
  'src/lib/studioProtocol.ts',
  'tests/character-studio-lifecycle.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/studio-client.test.ts',
  'tests/studio-priced-submission.test.ts',
].sort())

export const FUNDING_BASE_COMMIT = '72c5ddf9d00f4049f79c55d503a6b6833ccaa1da'
export const FUNDING_MARKER_PATH = 'ops/FUNDING_INSPECTION_RELEASE_20261004.json'
export const FUNDING_MARKER_CONTENT = JSON.stringify({
  release: 'generation-funding-inspection-20261004',
  baseCommit: FUNDING_BASE_COMMIT,
  preserveBilling: true,
}, null, 2) + '\n'
export const FUNDING_REVIEWED_PATHS = Object.freeze([
  'docs/GENERATOR_UI_RESTORATION_20261004.md',
  FUNDING_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'src/components/GenerationCostNotice.tsx',
  'src/lib/generationFunding.ts',
  'src/lib/loadGenerationFunding.ts',
  'src/main.tsx',
  'src/pages/GenerationFundingPage.css',
  'src/pages/GenerationFundingPage.tsx',
  'src/pages/ShopPage.tsx',
  'tests/generation-funding-page.test.mjs',
  'tests/generation-funding.test.ts',
  'tests/pipeline-only-release.test.mjs',
  'tests/prompt-model-ui.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/shop-render-helper.mjs',
].sort())
export const READONLY_QUOTE_BASE_COMMIT = '177c71098e9ccca3e18bedb505f2dd9932a9aab8'
export const READONLY_QUOTE_MARKER_PATH = 'ops/READONLY_QUOTE_RELEASE_20261005.json'
export const READONLY_QUOTE_MARKER_CONTENT = JSON.stringify({
  release: 'generation-readonly-quote-20261005',
  baseCommit: READONLY_QUOTE_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const READONLY_QUOTE_REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/CONTEST_STATUS.md',
  READONLY_QUOTE_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'src/components/GenerationCostNotice.tsx',
  'src/lib/useGenerationQuote.ts',
  'tests/generation-cost-notice.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/portal-generation-lifecycle.test.mjs',
  'tests/prompt-model-ui.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
].sort())
export const MCC_ONE_ATTEMPT_BASE_COMMIT = 'c6422e9d22185d22ee4eae23dc61f4045dd6ca6f'
export const MCC_ONE_ATTEMPT_MARKER_PATH = 'ops/MCC_ONE_ATTEMPT_RELEASE_20261005.json'
export const MCC_ONE_ATTEMPT_MARKER_CONTENT = JSON.stringify({
  release: 'mcc-one-attempt-allowance-20261005',
  baseCommit: MCC_ONE_ATTEMPT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const MCC_ONE_ATTEMPT_REVIEWED_PATHS = Object.freeze([
  'docs/ASTRA_REPAIRED_MCC_GRANT.md',
  'docs/CONTEST_STATUS.md',
  MCC_ONE_ATTEMPT_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/astraRepairedMccGrant.ts',
  'server/entitlements.ts',
  'server/studio.ts',
  'tests/astra-repaired-mcc-grant.test.ts',
  'tests/pipeline-only-release.test.mjs',
  'tests/studio-repaired-mcc.test.ts',
].sort())
export const ACCOUNT_MODEL_LIBRARY_BASE_COMMIT = '1b8da59e2b5c3bb9856fe63e34bfd8c2793a05f1'
export const ACCOUNT_MODEL_LIBRARY_MARKER_PATH = 'ops/ACCOUNT_MODEL_LIBRARY_RELEASE_20261005.json'
export const ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT = JSON.stringify({
  release: 'private-account-model-library-20261005',
  baseCommit: ACCOUNT_MODEL_LIBRARY_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS = Object.freeze([
  'docs/CONTEST_STATUS.md',
  ACCOUNT_MODEL_LIBRARY_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'server/studio.ts',
  'src/components/StudioGallery.tsx',
  'src/lib/account.tsx',
  'src/lib/studioLibrary.ts',
  'src/lib/studioProtocol.ts',
  'src/pages/ModelsPage.tsx',
  'tests/account-provider-lifecycle.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/studio-gallery.test.mjs',
  'tests/studio-library-gallery.test.mjs',
  'tests/studio-library.test.ts',
].sort())
export const PROJECT_MCC_ATTEMPT_BASE_COMMIT = '77487a20cfba34e3694fa660f7aec8051353085a'
export const PROJECT_MCC_ATTEMPT_MARKER_PATH = 'ops/PROJECT_MCC_ATTEMPT_RELEASE_20261005.json'
export const PROJECT_MCC_ATTEMPT_MARKER_CONTENT = JSON.stringify({
  release: 'project-funded-mcc-one-attempt-20261005',
  baseCommit: PROJECT_MCC_ATTEMPT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const PROJECT_MCC_ATTEMPT_REVIEWED_PATHS = Object.freeze([
  'docs/ASTRA_PROJECT_BUDGET.md',
  'docs/CONTEST_STATUS.md',
  PROJECT_MCC_ATTEMPT_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/astraProjectBudget.ts',
  'server/entitlements.ts',
  'server/studio.ts',
  'tests/astra-project-budget.test.ts',
  'tests/pipeline-only-release.test.mjs',
  'tests/studio-project-budget.test.ts',
].sort())
export const CABINET_CONTEXT_BASE_COMMIT = 'e36797e7b955ed3636a861caed842e576ed609c2'
export const CABINET_CONTEXT_MARKER_PATH = 'ops/CABINET_CONTEXT_RELEASE_20261005.json'
export const CABINET_CONTEXT_MARKER_CONTENT = JSON.stringify({
  release: 'cabinet-prompt-and-attempt-context-20261005',
  baseCommit: CABINET_CONTEXT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const CABINET_CONTEXT_REVIEWED_PATHS = Object.freeze([
  'docs/CONTEST_STATUS.md',
  CABINET_CONTEXT_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'src/components/GenerationCostNotice.tsx',
  'src/lib/studioProtocol.ts',
  'src/pages/ShopPage.tsx',
  'tests/generation-cost-notice.test.mjs',
  'tests/pipeline-only-release.test.mjs',
  'tests/portal-generation-lifecycle.test.mjs',
  'tests/prompt-model-ui.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/shop-external.test.mjs',
  'tests/studio-priced-submission.test.ts',
  'tests/studio-pricing.test.ts',
  'tests/studio-protocol-contract.test.ts',
].sort())
export const GENERATION_RECOVERY_BASE_COMMIT = 'ee107329fdd73d3ebe7678643dc01971b1bd6930'
export const GENERATION_RECOVERY_MARKER_PATH = 'ops/GENERATION_RECOVERY_RELEASE_20261005.json'
export const GENERATION_RECOVERY_MARKER_CONTENT = JSON.stringify({
  release: 'generation-evidence-and-fair-usage-20261005',
  baseCommit: GENERATION_RECOVERY_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const GENERATION_RECOVERY_REVIEWED_PATHS = Object.freeze([
  '.dev.vars.example',
  'docs/CONTEST_STATUS.md',
  'docs/SOL61_BLUEPRINT_MIGRATION.md',
  GENERATION_RECOVERY_MARKER_PATH,
  'scripts/release-check.ts',
  'scripts/select-pipeline-only-release.mjs',
  'server/blueprintModelBinding.ts',
  'server/blueprintTerminalUsage.ts',
  'server/entitlements.ts',
  'server/studio.ts',
  'server/worker.ts',
  'src/components/GenerationProgressOrb.css',
  'src/components/GenerationProgressOrb.tsx',
  'src/components/GenerationSculpture.tsx',
  'src/components/StudioGallery.tsx',
  'src/lib/blueprint.ts',
  'src/lib/blueprintClient.ts',
  'src/lib/generationFunding.ts',
  'src/lib/generationProgressView.ts',
  'src/lib/modelCatalog.ts',
  'src/lib/studioClient.ts',
  'src/lib/studioLibrary.ts',
  'src/lib/studioProtocol.ts',
  'src/pages/GenerationFundingPage.tsx',
  'src/pages/InfoPage.tsx',
  'src/pages/PrivateGameLab.tsx',
  'src/pages/ShopPage.css',
  'src/pages/ShopPage.tsx',
  'tests/affordable-models.test.ts',
  'tests/blueprint-accounts.test.ts',
  'tests/blueprint-completed-provider-reconciliation.test.ts',
  'tests/blueprint-failed-provider-reconciliation.test.ts',
  'tests/blueprint-failed-reconciliation-native.test.mjs',
  'tests/blueprint-model-archive.test.mjs',
  'tests/blueprint-output-adjustment-preview.test.ts',
  'tests/blueprint-provider-reservation.test.ts',
  'tests/blueprint-repair.test.ts',
  'tests/budget.test.ts',
  'tests/contest-finish.test.mjs',
  'tests/core.test.ts',
  'tests/fixtures/sol61-legacy-client.ts',
  'tests/fixtures/sol61-legacy-worker.ts',
  'tests/game-lab-blueprint-recovery.test.mjs',
  'tests/generation-economics.test.ts',
  'tests/generation-funding-page.test.mjs',
  'tests/generation-profile-client.test.mjs',
  'tests/generation-progress-orb.test.mjs',
  'tests/generation-progress-view.test.ts',
  'tests/generation-sculpture-lifecycle.test.mjs',
  'tests/p0-astra.test.ts',
  'tests/pipeline-only-release.test.mjs',
  'tests/portal-generation-lifecycle.test.mjs',
  'tests/pricing-release-health.test.ts',
  'tests/prompt-model-ui.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/shop-external.test.mjs',
  'tests/shop-render-helper.mjs',
  'tests/sol61-blueprint-migration.test.ts',
  'tests/sol61-mixed-deployment.test.ts',
  'tests/studio-accounts.test.ts',
  'tests/studio-generation-timing.test.ts',
  'tests/studio-library-gallery.test.mjs',
  'tests/studio-library.test.ts',
  'wrangler.jsonc',
].sort())
export const ONE_TIME_TEST_BASE_COMMIT = 'd229a3e37f37bd85476dc3d8d969dd49fdae488d'
export const ONE_TIME_TEST_MARKER_PATH = 'ops/ONE_TIME_TEST_RELEASE_20261006.json'
export const ONE_TIME_TEST_MARKER_CONTENT = JSON.stringify({
  release: 'one-time-api-tests-20261006-044444',
  baseCommit: ONE_TIME_TEST_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const ONE_TIME_TEST_REVIEWED_PATHS = Object.freeze([
  'docs/ONE_TIME_API_TESTS_20261006.md',
  ONE_TIME_TEST_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'server/overnightTestBudget.ts',
  'server/studio.ts',
  'server/worker.ts',
  'src/App.tsx',
  'src/lib/overnightTestClient.ts',
  'src/pages/OvernightTestsPage.css',
  'src/pages/OvernightTestsPage.tsx',
  'tests/one-time-test-release.test.mjs',
  'tests/one-time-test-renewal.test.ts',
  'tests/overnight-test-admission.test.ts',
  'tests/overnight-test-budget-native.test.mjs',
  'tests/overnight-test-budget.test.ts',
  'tests/overnight-test-client.test.ts',
  'tests/overnight-test-namespace-native.test.mjs',
  'tests/overnight-test-page.test.mjs',
].sort())
export const TEST_STATUS_REPAIR_BASE_COMMIT = '2cc6b9f2071e4cec1e4d92edd69371f518d643de'
export const TEST_STATUS_REPAIR_MARKER_PATH = 'ops/TEST_STATUS_REPAIR_RELEASE_20261006.json'
export const TEST_STATUS_REPAIR_MARKER_CONTENT = JSON.stringify({
  release: 'test-budget-status-native-fetch-repair-20261006',
  baseCommit: TEST_STATUS_REPAIR_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const TEST_STATUS_REPAIR_REVIEWED_PATHS = Object.freeze([
  'docs/ONE_TIME_API_TESTS_20261006.md',
  TEST_STATUS_REPAIR_MARKER_PATH,
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'server/overnightTestBudget.ts',
  'src/lib/overnightTestClient.ts',
  'src/lib/overnightTestDiagnostics.ts',
  'src/pages/OvernightTestsPage.tsx',
  'tests/overnight-status-diagnostics.test.ts',
  'tests/overnight-test-namespace-native.test.mjs',
  'tests/overnight-test-page.test.mjs',
  'tests/studio-native-fetch-browser.test.mjs',
  'tests/test-status-release.test.mjs',
].sort())
export const SHOP_TEST_FUNDING_BASE_COMMIT = 'e36ca479d051deb9ff31297ccf12814b16c17220'
export const SHOP_TEST_FUNDING_MARKER_PATH = 'ops/SHOP_TEST_FUNDING_RELEASE_20261006.json'
export const SHOP_TEST_FUNDING_MARKER_CONTENT = JSON.stringify({
  release: 'shop-existing-test-funding-20261006',
  baseCommit: SHOP_TEST_FUNDING_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const SHOP_TEST_FUNDING_REVIEWED_PATHS = Object.freeze([
  'docs/CONTEST_STATUS.md',
  'docs/ONE_TIME_API_TESTS_20261006.md',
  'ops/SHOP_TEST_FUNDING_RELEASE_20261006.json',
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'server/overnightTestBudget.ts',
  'server/studio.ts',
  'server/worker.ts',
  'src/lib/overnightTestClient.ts',
  'src/lib/shopTestFunding.ts',
  'src/lib/testAccountContract.ts',
  'src/pages/ShopPage.css',
  'src/pages/ShopPage.tsx',
  'tests/one-time-test-renewal.test.ts',
  'tests/overnight-status-diagnostics.test.ts',
  'tests/overnight-test-admission.test.ts',
  'tests/overnight-test-client.test.ts',
  'tests/overnight-test-budget.test.ts',
  'tests/overnight-test-namespace-native.test.mjs',
  'tests/overnight-test-page.test.mjs',
  'tests/shop-draft-lifecycle.test.mjs',
  'tests/shop-render-helper.mjs',
  'tests/shop-test-funding.test.ts',
  'tests/studio-native-fetch-browser.test.mjs',
  'tests/test-account-contract.test.ts',
  'tests/shop-test-funding-release.test.mjs',
].sort())
export const MODEL_PREVIEW_BASE_COMMIT = '62f9fa9277c7923ed40fd11decfd4630f1043cae'
export const MODEL_PREVIEW_MARKER_PATH = 'ops/MODEL_PREVIEW_RELEASE_20261006.json'
export const MODEL_PREVIEW_MARKER_CONTENT = JSON.stringify({
  release: 'bounded-original-model-preview-20261006',
  baseCommit: MODEL_PREVIEW_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
}, null, 2) + '\n'
export const MODEL_PREVIEW_REVIEWED_PATHS = Object.freeze([
  "docs/CONTEST_STATUS.md",
  "ops/MODEL_PREVIEW_RELEASE_20261006.json",
  "scripts/select-pipeline-only-release.mjs",
  "src/components/OracleModelPreview.tsx",
  "src/components/StudioGallery.tsx",
  "src/lib/softwareModelPreview.ts",
  "tests/model-preview-release.test.mjs",
  "tests/oracle-model-preview-lifecycle.test.mjs",
  "tests/software-model-preview.test.ts",
  "tests/studio-library-gallery.test.mjs"
].sort())
export const COMPATIBLE_MCC_BASE_COMMIT = '9b2a5a9e48424e11d2d8ddc9b360ec110544a508'
export const COMPATIBLE_MCC_MARKER_PATH = 'ops/COMPATIBLE_MCC_ROLLBACK_RELEASE_20261006.json'
export const COMPATIBLE_MCC_MARKER_CONTENT = JSON.stringify({
  release: 'compatible-mcc-ui-rollback-20261006',
  baseCommit: COMPATIBLE_MCC_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
  preserveSecrets: true,
  compatibleMccRollback: true,
}, null, 2) + '\n'
export const COMPATIBLE_MCC_REVIEWED_PATHS = Object.freeze([
  ".github/workflows/cloudflare.yml",
  "docs/COMPATIBLE_MCC_RESTORATION.md",
  "docs/CONTEST_STATUS.md",
  "ops/COMPATIBLE_MCC_ROLLBACK_RELEASE_20261006.json",
  "scripts/build-compatible-mcc-config.mjs",
  "scripts/check-compatible-mcc-release.mjs",
  "scripts/select-pipeline-only-release.mjs",
  "src/App.tsx",
  "src/components/GenerationCostNotice.tsx",
  "src/components/P0GameLab.tsx",
  "src/components/PortalAstraGenerator.tsx",
  "src/components/WorldStudio.tsx",
  "src/lib/avatarPreloadLifecycle.ts",
  "src/pages/PortalPage.tsx",
  "src/pages/ShopPage.css",
  "src/pages/ShopPage.tsx",
  "tests/account-entry-routing.test.mjs",
  "tests/avatar-preload-lifecycle.test.ts",
  "tests/compatible-mcc-release.test.mjs",
  "tests/contest-finish.test.mjs",
  "tests/contest-hotfix.test.ts",
  "tests/generation-profile-client.test.mjs",
  "tests/historical-blueprint-bindings.test.mjs",
  "tests/mcc-compatible-storage.test.ts",
  "tests/pipeline-only-release.test.mjs",
  "tests/portal-entry.test.mjs",
  "tests/private-game-lab-render.test.mjs",
  "tests/prompt-model-ui.test.mjs",
  "tests/shop-draft-lifecycle.test.mjs",
  "tests/shop-external.test.mjs"
].sort())
export const SUBSCRIPTION_UPGRADE_BASE_COMMIT = '29b6b9af08d62baafddceb029652db321ec83273'
export const SUBSCRIPTION_UPGRADE_MARKER_PATH = 'ops/SUBSCRIPTION_UPGRADE_REPAIR_RELEASE_20261007.json'
export const SUBSCRIPTION_UPGRADE_MARKER_CONTENT = JSON.stringify({
  release: 'settled-subscription-upgrade-repair-20261007',
  baseCommit: SUBSCRIPTION_UPGRADE_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
  preserveSecrets: true,
  subscriptionUpgradeRepair: true,
}, null, 2) + '\n'
export const SUBSCRIPTION_UPGRADE_REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/CONTEST_STATUS.md',
  SUBSCRIPTION_UPGRADE_MARKER_PATH,
  'scripts/build-compatible-mcc-config.mjs',
  'scripts/check-compatible-mcc-release.mjs',
  'scripts/select-pipeline-only-release.mjs',
  'server/billing.ts',
  'tests/billing-recovery.test.ts',
  'tests/subscription-upgrade-release.test.mjs',
].sort())
export const ACCOUNT_PURCHASE_EVIDENCE_BASE_COMMIT = 'e301b3989caf0bd2fcfe3a0e1ab65bd2b95ceb6d'
export const ACCOUNT_PURCHASE_EVIDENCE_MARKER_PATH = 'ops/ACCOUNT_PURCHASE_EVIDENCE_RELEASE_20261007.json'
export const ACCOUNT_PURCHASE_EVIDENCE_MARKER_CONTENT = JSON.stringify({
  release: 'account-purchase-evidence-readonly-20261007',
  baseCommit: ACCOUNT_PURCHASE_EVIDENCE_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
  preserveSecrets: true,
  accountPurchaseEvidence: true,
}, null, 2) + '\n'
export const ACCOUNT_PURCHASE_EVIDENCE_REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/CONTEST_STATUS.md',
  ACCOUNT_PURCHASE_EVIDENCE_MARKER_PATH,
  'scripts/build-compatible-mcc-config.mjs',
  'scripts/check-compatible-mcc-release.mjs',
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'src/lib/generationFunding.ts',
  'src/lib/loadGenerationFunding.ts',
  'src/pages/GenerationFundingPage.tsx',
  'tests/account-purchase-evidence-release.test.mjs',
  'tests/generation-funding-page.test.mjs',
  'tests/generation-funding.test.ts',
].sort())
export const OWNER_RESERVE_ADJUSTMENT_BASE_COMMIT = '267cefe2c40b8800e36a161cfa9166ec280142e5'
export const OWNER_RESERVE_ADJUSTMENT_MARKER_PATH = 'ops/OWNER_RESERVE_ADJUSTMENT_RELEASE_20261007.json'
export const OWNER_RESERVE_ADJUSTMENT_MARKER_CONTENT = JSON.stringify({
  release: 'owner-reserve-adjustment-20261007',
  baseCommit: OWNER_RESERVE_ADJUSTMENT_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
  preserveSecrets: true,
  ownerReserveAdjustment: true,
}, null, 2) + '\n'
export const OWNER_RESERVE_ADJUSTMENT_REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/CONTEST_STATUS.md',
  OWNER_RESERVE_ADJUSTMENT_MARKER_PATH,
  'scripts/build-compatible-mcc-config.mjs',
  'scripts/select-pipeline-only-release.mjs',
  'server/entitlements.ts',
  'server/ownerReserveAdjustment.ts',
  'src/App.tsx',
  'src/lib/ownerReserveAdjustment.ts',
  'src/lib/ownerReserveAdjustmentClient.ts',
  'src/pages/OwnerReserveAdjustmentPage.tsx',
  'tests/owner-reserve-adjustment-native.test.mjs',
  'tests/owner-reserve-adjustment-page.test.mjs',
  'tests/owner-reserve-adjustment-release.test.mjs',
  'tests/owner-reserve-adjustment.test.ts',
].sort())
export const BOUNDED_SOFTWARE_PREVIEW_BASE_COMMIT = '64986c33139e515d6a0a81fccb61f8db972bd62e'
export const BOUNDED_SOFTWARE_PREVIEW_MARKER_PATH = 'ops/BOUNDED_SOFTWARE_PREVIEW_RELEASE_20261007.json'
export const BOUNDED_SOFTWARE_PREVIEW_MARKER_CONTENT = JSON.stringify({
  release: 'bounded-software-model-preview-20261007',
  baseCommit: BOUNDED_SOFTWARE_PREVIEW_BASE_COMMIT,
  preserveBilling: true,
  preserveRemoteVars: true,
  preserveSecrets: true,
  boundedSoftwarePreview: true,
}, null, 2) + '\n'
export const BOUNDED_SOFTWARE_PREVIEW_REVIEWED_PATHS = Object.freeze([
  '.github/workflows/cloudflare.yml',
  'docs/CONTEST_STATUS.md',
  BOUNDED_SOFTWARE_PREVIEW_MARKER_PATH,
  'scripts/build-compatible-mcc-config.mjs',
  'scripts/select-pipeline-only-release.mjs',
  'src/components/OracleModelPreview.tsx',
  'src/lib/softwareModelPreview.ts',
  'tests/bounded-software-preview-release.test.mjs',
  'tests/oracle-model-preview-lifecycle.test.mjs',
  'tests/software-model-preview.test.ts',
].sort())
const releaseIntroductions = new Set([
  'tests/bounded-software-preview-release.test.mjs',
  'server/ownerReserveAdjustment.ts',
  'src/lib/ownerReserveAdjustment.ts',
  'src/lib/ownerReserveAdjustmentClient.ts',
  'src/pages/OwnerReserveAdjustmentPage.tsx',
  'tests/owner-reserve-adjustment-native.test.mjs',
  'tests/owner-reserve-adjustment-page.test.mjs',
  'tests/owner-reserve-adjustment-release.test.mjs',
  'tests/owner-reserve-adjustment.test.ts',
  'tests/account-purchase-evidence-release.test.mjs',
  'tests/subscription-upgrade-release.test.mjs',
  'docs/COMPATIBLE_MCC_RESTORATION.md',
  'tests/historical-blueprint-bindings.test.mjs',
  'tests/mcc-compatible-storage.test.ts',
  'scripts/build-compatible-mcc-config.mjs',
  'scripts/check-compatible-mcc-release.mjs',
  'tests/compatible-mcc-release.test.mjs',
  'src/lib/softwareModelPreview.ts',
  'tests/model-preview-release.test.mjs',
  'tests/oracle-model-preview-lifecycle.test.mjs',
  'tests/software-model-preview.test.ts',

  'src/lib/shopTestFunding.ts',
  'src/lib/testAccountContract.ts',
  'tests/shop-test-funding.test.ts',
  'tests/test-account-contract.test.ts',
  'tests/shop-test-funding-release.test.mjs',
  'src/lib/overnightTestDiagnostics.ts',
  'tests/overnight-status-diagnostics.test.ts',
  'tests/test-status-release.test.mjs',
  'docs/ONE_TIME_API_TESTS_20261006.md',
  'server/overnightTestBudget.ts',
  'src/lib/overnightTestClient.ts',
  'src/pages/OvernightTestsPage.css',
  'src/pages/OvernightTestsPage.tsx',
  'tests/one-time-test-release.test.mjs',
  'tests/one-time-test-renewal.test.ts',
  'tests/overnight-test-admission.test.ts',
  'tests/overnight-test-budget-native.test.mjs',
  'tests/overnight-test-budget.test.ts',
  'tests/overnight-test-client.test.ts',
  'tests/overnight-test-namespace-native.test.mjs',
  'tests/overnight-test-page.test.mjs',
  'docs/SOL61_BLUEPRINT_MIGRATION.md',
  'server/blueprintModelBinding.ts',
  'server/blueprintTerminalUsage.ts',
  'src/components/GenerationProgressOrb.css',
  'src/components/GenerationProgressOrb.tsx',
  'src/components/GenerationSculpture.tsx',
  'src/lib/generationProgressView.ts',
  'tests/blueprint-failed-provider-reconciliation.test.ts',
  'tests/blueprint-failed-reconciliation-native.test.mjs',
  'tests/blueprint-output-adjustment-preview.test.ts',
  'tests/fixtures/sol61-legacy-client.ts',
  'tests/fixtures/sol61-legacy-worker.ts',
  'tests/generation-progress-orb.test.mjs',
  'tests/generation-progress-view.test.ts',
  'tests/generation-sculpture-lifecycle.test.mjs',
  'tests/sol61-blueprint-migration.test.ts',
  'tests/sol61-mixed-deployment.test.ts',
  'tests/studio-generation-timing.test.ts',

  'docs/GENERATOR_UI_RESTORATION_20261004.md',
  'src/lib/generationFunding.ts',
  'src/lib/loadGenerationFunding.ts',
  'src/pages/GenerationFundingPage.css',
  'src/pages/GenerationFundingPage.tsx',
  'tests/generation-funding-page.test.mjs',
  'tests/generation-funding.test.ts',
  'docs/ASTRA_REPAIRED_MCC_GRANT.md',
  'server/astraRepairedMccGrant.ts',
  'tests/astra-repaired-mcc-grant.test.ts',
  'tests/studio-repaired-mcc.test.ts',
  'src/lib/studioLibrary.ts',
  'tests/account-provider-lifecycle.test.mjs',
  'tests/studio-library-gallery.test.mjs',
  'tests/studio-library.test.ts',
  'docs/ASTRA_PROJECT_BUDGET.md',
  'server/astraProjectBudget.ts',
  'tests/astra-project-budget.test.ts',
  'tests/studio-project-budget.test.ts',
])
const scopes = [
  { base: BOUNDED_SOFTWARE_PREVIEW_BASE_COMMIT, marker: BOUNDED_SOFTWARE_PREVIEW_MARKER_PATH, content: BOUNDED_SOFTWARE_PREVIEW_MARKER_CONTENT, paths: BOUNDED_SOFTWARE_PREVIEW_REVIEWED_PATHS, preserveRemoteVars: true, boundedSoftwarePreview: true, singleParent: true },
  { base: OWNER_RESERVE_ADJUSTMENT_BASE_COMMIT, marker: OWNER_RESERVE_ADJUSTMENT_MARKER_PATH, content: OWNER_RESERVE_ADJUSTMENT_MARKER_CONTENT, paths: OWNER_RESERVE_ADJUSTMENT_REVIEWED_PATHS, preserveRemoteVars: true, ownerReserveAdjustment: true, singleParent: true },
  { base: ACCOUNT_PURCHASE_EVIDENCE_BASE_COMMIT, marker: ACCOUNT_PURCHASE_EVIDENCE_MARKER_PATH, content: ACCOUNT_PURCHASE_EVIDENCE_MARKER_CONTENT, paths: ACCOUNT_PURCHASE_EVIDENCE_REVIEWED_PATHS, preserveRemoteVars: true, accountPurchaseEvidence: true, singleParent: true },
  { base: SUBSCRIPTION_UPGRADE_BASE_COMMIT, marker: SUBSCRIPTION_UPGRADE_MARKER_PATH, content: SUBSCRIPTION_UPGRADE_MARKER_CONTENT, paths: SUBSCRIPTION_UPGRADE_REVIEWED_PATHS, preserveRemoteVars: true, subscriptionUpgradeRepair: true, singleParent: true },
  { base: COMPATIBLE_MCC_BASE_COMMIT, marker: COMPATIBLE_MCC_MARKER_PATH, content: COMPATIBLE_MCC_MARKER_CONTENT, paths: COMPATIBLE_MCC_REVIEWED_PATHS, preserveRemoteVars: true, compatibleMccRollback: true, singleParent: true },
  { base: MODEL_PREVIEW_BASE_COMMIT, marker: MODEL_PREVIEW_MARKER_PATH, content: MODEL_PREVIEW_MARKER_CONTENT, paths: MODEL_PREVIEW_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: SHOP_TEST_FUNDING_BASE_COMMIT, marker: SHOP_TEST_FUNDING_MARKER_PATH, content: SHOP_TEST_FUNDING_MARKER_CONTENT, paths: SHOP_TEST_FUNDING_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: BASE_COMMIT, marker: MARKER_PATH, content: MARKER_CONTENT, paths: REVIEWED_PATHS },
  { base: FUNDING_BASE_COMMIT, marker: FUNDING_MARKER_PATH, content: FUNDING_MARKER_CONTENT, paths: FUNDING_REVIEWED_PATHS },
  { base: READONLY_QUOTE_BASE_COMMIT, marker: READONLY_QUOTE_MARKER_PATH, content: READONLY_QUOTE_MARKER_CONTENT, paths: READONLY_QUOTE_REVIEWED_PATHS, preserveRemoteVars: true },
  { base: MCC_ONE_ATTEMPT_BASE_COMMIT, marker: MCC_ONE_ATTEMPT_MARKER_PATH, content: MCC_ONE_ATTEMPT_MARKER_CONTENT, paths: MCC_ONE_ATTEMPT_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: ACCOUNT_MODEL_LIBRARY_BASE_COMMIT, marker: ACCOUNT_MODEL_LIBRARY_MARKER_PATH, content: ACCOUNT_MODEL_LIBRARY_MARKER_CONTENT, paths: ACCOUNT_MODEL_LIBRARY_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: PROJECT_MCC_ATTEMPT_BASE_COMMIT, marker: PROJECT_MCC_ATTEMPT_MARKER_PATH, content: PROJECT_MCC_ATTEMPT_MARKER_CONTENT, paths: PROJECT_MCC_ATTEMPT_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: CABINET_CONTEXT_BASE_COMMIT, marker: CABINET_CONTEXT_MARKER_PATH, content: CABINET_CONTEXT_MARKER_CONTENT, paths: CABINET_CONTEXT_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: GENERATION_RECOVERY_BASE_COMMIT, marker: GENERATION_RECOVERY_MARKER_PATH, content: GENERATION_RECOVERY_MARKER_CONTENT, paths: GENERATION_RECOVERY_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: ONE_TIME_TEST_BASE_COMMIT, marker: ONE_TIME_TEST_MARKER_PATH, content: ONE_TIME_TEST_MARKER_CONTENT, paths: ONE_TIME_TEST_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
  { base: TEST_STATUS_REPAIR_BASE_COMMIT, marker: TEST_STATUS_REPAIR_MARKER_PATH, content: TEST_STATUS_REPAIR_MARKER_CONTENT, paths: TEST_STATUS_REPAIR_REVIEWED_PATHS, preserveRemoteVars: true, singleParent: true },
]

function refuse() { throw new Error('PIPELINE_RELEASE_SCOPE_NOT_VERIFIED') }
function git(cwd, args) {
  const result = spawnSync('git', ['--no-pager', ...args], {
    cwd, encoding: 'utf8', shell: false, timeout: 15000, maxBuffer: 1024 * 1024,
    // The selector needs local Git objects only, never deployment credentials.
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (result.error || result.status !== 0) refuse()
  return result.stdout
}
function commit(cwd, revision, readGit) {
  const oid = readGit(cwd, ['rev-parse', '--verify', '--end-of-options', revision]).trim()
  if (!/^[0-9a-f]{40}$/.test(oid)) refuse()
  return oid
}

/** Only a fixed scope's marker addition at its reviewed parent preserves billing.
 * Continued marker presence never changes later ordinary releases.
 * Missing history or any marker modification/deletion stops before secret setup.
 */
function selectReleaseScope(cwd, readGit) {
  const head = commit(cwd, 'HEAD^{commit}', readGit)
  const parent = commit(cwd, `${head}^1^{commit}`, readGit)
  const raw = readGit(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', parent, head, '--'])
  const fields = raw.split('\0')
  if (fields.pop() !== '' || fields.length % 2) refuse()
  const changes = []
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index], path = fields[index + 1]
    if (!/^[AMDT]$/.test(status) || !path) refuse()
    changes.push({ status, path })
  }
  const markedScopes = scopes.filter(scope => changes.some(change => change.path === scope.marker))
  if (!markedScopes.length) {
    // A changed selector is release preparation, even if rebased without its marker.
    // It must never silently select an ordinary deployment that mutates billing.
    if (scopes.some(scope => parent === scope.base) || changes.some(change =>
      change.path === 'scripts/select-pipeline-only-release.mjs' ||
      (change.status === 'A' && releaseIntroductions.has(change.path)))) refuse()
    return null
  }
  if (markedScopes.length !== 1) refuse()
  const scope = markedScopes[0]
  if (scope.compatibleMccRollback && changes.some(change =>
    change.path === 'wrangler.jsonc' || change.path.startsWith('server/') ||
    (change.path.startsWith('src/lib/') && change.path !== 'src/lib/avatarPreloadLifecycle.ts'))) refuse()
  const marker = changes.find(change => change.path === scope.marker)
  if (marker.status !== 'A' || parent !== scope.base) refuse()
  if (scope.singleParent && readGit(cwd, ['rev-list', '--parents', '-n', '1', head]).trim() !== `${head} ${parent}`) refuse()
  if (changes.some(change => !['A', 'M'].includes(change.status)) ||
      JSON.stringify(changes.map(change => change.path).sort()) !== JSON.stringify(scope.paths)) refuse()
  if (scope.marker === BOUNDED_SOFTWARE_PREVIEW_MARKER_PATH || scope.marker === OWNER_RESERVE_ADJUSTMENT_MARKER_PATH || scope.marker === ACCOUNT_PURCHASE_EVIDENCE_MARKER_PATH || scope.marker === SUBSCRIPTION_UPGRADE_MARKER_PATH || scope.marker === COMPATIBLE_MCC_MARKER_PATH || scope.marker === MODEL_PREVIEW_MARKER_PATH || scope.marker === FUNDING_MARKER_PATH || scope.marker === READONLY_QUOTE_MARKER_PATH || scope.marker === MCC_ONE_ATTEMPT_MARKER_PATH || scope.marker === ACCOUNT_MODEL_LIBRARY_MARKER_PATH || scope.marker === PROJECT_MCC_ATTEMPT_MARKER_PATH || scope.marker === CABINET_CONTEXT_MARKER_PATH || scope.marker === GENERATION_RECOVERY_MARKER_PATH || scope.marker === ONE_TIME_TEST_MARKER_PATH || scope.marker === TEST_STATUS_REPAIR_MARKER_PATH || scope.marker === SHOP_TEST_FUNDING_MARKER_PATH) {
    const entries = readGit(cwd, ['ls-tree', '-z', head, '--', ...scope.paths]).split('\0')
    if (entries.pop() !== '' || entries.length !== scope.paths.length) refuse()
    const paths = entries.map(entry => {
      const match = /^100644 blob [0-9a-f]{40}\t(.+)$/.exec(entry)
      if (!match) refuse()
      return match[1]
    }).sort()
    if (JSON.stringify(paths) !== JSON.stringify(scope.paths)) refuse()
  }
  const entry = readGit(cwd, ['ls-tree', '-z', head, '--', scope.marker])
  const match = /^100644 blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(entry)
  if (!match || match[2] !== scope.marker) refuse()
  if (readGit(cwd, ['cat-file', 'blob', match[1]]) !== scope.content) refuse()
  if (scope.compatibleMccRollback) {
    const path = 'src/lib/avatarPreloadLifecycle.ts'
    const prior = readGit(cwd, ['cat-file', 'blob', `${parent}:${path}`])
    const current = readGit(cwd, ['cat-file', 'blob', `${head}:${path}`])
    const before = "export const DEFAULT_WORLD_AVATAR = 'terraformer' satisfies AvatarAsset"
    const after = "export const DEFAULT_WORLD_AVATAR = 'queen' satisfies AvatarAsset"
    if (prior.split(before).length !== 2 || current !== prior.replace(before, after)) refuse()
  }
  return scope
}

export function selectPipelineReleaseOptions(cwd = process.cwd(), readGit = git) {
  const scope = selectReleaseScope(cwd, readGit)
  return { preserveBilling: Boolean(scope), preserveRemoteVars: scope?.preserveRemoteVars === true, ...(scope?.compatibleMccRollback ? { compatibleMccRollback: true } : {}), ...(scope?.boundedSoftwarePreview ? { boundedSoftwarePreview: true, preserveSecrets: true } : {}), ...(scope?.ownerReserveAdjustment ? { ownerReserveAdjustment: true, preserveSecrets: true } : {}), ...(scope?.accountPurchaseEvidence ? { accountPurchaseEvidence: true, preserveSecrets: true } : {}), ...(scope?.subscriptionUpgradeRepair ? { subscriptionUpgradeRepair: true, preserveSecrets: true } : {}) }
}

export function selectPipelineOnlyRelease(cwd = process.cwd(), readGit = git) {
  return selectPipelineReleaseOptions(cwd, readGit).preserveBilling
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) refuse()
    const options = selectPipelineReleaseOptions()
    console.log(`preserve_billing=${options.preserveBilling}\npreserve_remote_vars=${options.preserveRemoteVars}`)
    if (options.compatibleMccRollback) console.log('compatible_mcc_rollback=true')
    if (options.subscriptionUpgradeRepair) console.log('subscription_upgrade_repair=true')
    if (options.accountPurchaseEvidence) console.log('account_purchase_evidence=true')
    if (options.ownerReserveAdjustment) console.log('owner_reserve_adjustment=true')
    if (options.boundedSoftwarePreview) console.log('bounded_software_preview=true')
  } catch {
    console.error('PIPELINE_RELEASE_SCOPE_NOT_VERIFIED: publication stopped before credential setup; verify the reviewed parent, paths and one-time marker. No secret values were read.')
    process.exitCode = 1
  }
}
