# WORLDIFACT — full site/generation recovery audit, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · EXACT-HEAD CI PENDING.**

- Production evidence before this repair: deployment run `36261232605` was LIVE, `generationReady=true`, Studio `ready=true`, Oracle `CONNECTOR_READY` v33, `posthocExportRevision=2`, `legacyGlbExportRecoveryRevision=1`. The infrastructure was alive; the remaining customer failure was in lifecycle/recovery behavior rather than a missing Oracle/export capability.
- VERIFIED code defect: account-enabled Studio converted every Oracle HTTP 409 into a fake `pending` customer job. The Oracle contract returns 409 when another job is active **without inserting the new job**. That mismatch could debit a free slot/50 credits and leave the browser pinned to a job UUID that Oracle never created, disabling the next generation.
- Repair: explicit Oracle 400/409/422/429 rejections are terminal before generation acceptance; customer reservation is restored immediately and the browser receives the real rejection instead of a fake pending job.
- Legacy stuck receipts get a new signed-account `reconcile-missing` path. It can settle/refund only after the receipt is older than 3 minutes and Oracle itself returns 404 for that exact UUID. It never creates, cancels or replaces a model.
- Shop automatically uses that reconciliation for an old `reconciliationRequired` receipt, archives/releases it after confirmed absence, and re-enables generation without a duplicate POST.
- Release audit now covers every WORLDIFACT React deep link, every concrete `/portal/:id` route, copied application assets, LIVE Studio readiness, Oracle v33/export capability, and unauthenticated account/generation guards. No paid call is made by the release smoke.
- One explicit owner-approved production smoke is gated by `ops/P0_FULL_RECOVERY_SMOKE_20260926`: one deterministic Oracle job ID, bounded busy retry only after explicit 409 non-acceptance, then real GLB + PBR ZIP + FBX + BLEND validation. Secrets are not printed.
- Payments, orders, supplier actions and manufacturing approval are outside this recovery.

# WORLDIFACT — Oracle queue heartbeat follow-up, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · CI PENDING · NO JOB CANCELLATION.**

- Latest owner screenshot shows the finisher printed only `Checking Oracle queue...` and then returned to the Cloud Shell prompt without queue JSON or maintenance output.
- Root cause in our orchestration: the previous implementation held one silent SSH call open for up to 25 minutes while waiting for the active Oracle job. On mobile/Cloud Shell that path is not observable and can terminate without useful progress evidence.
- The fix replaces the long remote wait with one-shot, read-only `queue-status` checks every 15 seconds from Cloud Shell. Each poll prints sanitized job id prefix, state and seconds since the last database update.
- The queue read uses SQLite read-only mode and never reads prompts, cancels jobs, changes SQL state, restarts services or submits AI.
- As soon as the queue reports `IDLE`, the same command proceeds automatically to the reviewed export maintenance and the single resumable E2E job.
- After 25 minutes of continuous activity it stops unchanged with the last sanitized queue state instead of hanging silently.

---

# WORLDIFACT — Oracle export active-job guard follow-up, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · CI PENDING · NO JOB CANCELLATION.**

- Owner Cloud Shell evidence now shows the v4 installer reaches the real safety guard and refuses maintenance because one Oracle model job is still non-terminal: `A model job is active. Nothing was changed.`.
- This is not a worker/tunnel outage: both services remain `active`.
- The finisher now performs a read-only queue check before maintenance and waits up to 25 minutes for existing work to finish naturally.
- It reads only job id/state/timestamps from `jobs.sqlite` using SQLite read-only mode. It does not read prompts, cancel jobs, mutate SQL, restart services or submit AI while waiting.
- If the queue becomes idle, the same command continues automatically into the reviewed export install and one resumable E2E model.
- If the bounded wait expires, it stops without changes and prints sanitized job id/state/age so a genuinely stuck job can be diagnosed explicitly instead of being cancelled blindly.

---

# WORLDIFACT — Oracle export recovery v4, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · CI PENDING · ORACLE APPLY/E2E PENDING.**

- Owner Cloud Shell evidence showed the v3 transient maintenance unit reached `failed` while `froge-worker.service` and `froge-tunnel.service` both remained `active`. The failure therefore belongs to the maintenance launcher path, not a dead Oracle worker/tunnel.
- v4 removes the transient `systemd-run` maintenance layer entirely. OCI Cloud Shell now runs the rollback-safe reviewed installer synchronously over the existing SSH channel and receives the exact installer JSON/error instead of collapsing to generic `LAUNCH_FAILED`.
- The installer still accepts only exact reviewed v33 source revisions, refuses active jobs/unknown server bytes, backs up the exact starting `server.py`, restarts only `froge-worker.service`, verifies `posthocExportRevision=2` + `legacyGlbExportRecoveryRevision=1`, and rolls back to the exact starting bytes if verification fails.
- The one explicitly approved live E2E test persists one UUID before submission. If phone/browser/SSH transport drops, re-running the same command resumes that same job id instead of creating a second model. Automatic generation retries remain **0**.
- E2E acceptance requires real validated bytes for GLB, PBR/texture ZIP, FBX and BLEND.
- No payment, checkout, supplier order or manufacturing approval is performed by this repair. Oracle maintenance itself sends no AI request; only the owner-approved one-job E2E stage may create a model.

---

# WORLDIFACT — P0 download/NPC repair live release, 26 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** PR #117 was squash-merged as `62d953c4dcc7a39282b978d5d8231e0fa1fdf706`.

- Main CI run `36234284770`: **SUCCESS**.
- Production workflow `36234284830`: **SUCCESS**.
- Cloudflare version: `c63a9626-0bc6-402e-b645-da08cbb4accf`.
- Public release smoke: **PASS** for 16 HTML routes, 43 matching hub assets and 105 original app entries/assets.
- The published same-origin ForgeMPC2 worker GLB was build-verified at 10,343,368 bytes / SHA-256 `4b7e83d07723be958e7325f1cd7afc509ebc72d61a6357925c824ac716052adf` and included in release verification.
- Production diagnostics report Oracle `CONNECTOR_READY`, `connectorVersion: 33`. This confirms the live Oracle connector is reachable; the deploy diagnostic does not currently expose `posthocExportRevision` / `legacyGlbExportRecoveryRevision`, so those exact revision markers are not inferred from this release log.
- The Android HTTP 429 self-throttling path is removed: missing PBR/FBX/BLEND recovery uses an `initial` artifact read, one cached no-AI prepare on 409, then one separately rate-limited `prepared` read.
- No paid AI/model request was made by CI or deployment.

---

# WORLDIFACT — Android export 429 + Forge worker delivery repair, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · CODE HEAD CI VERIFIED · MERGE / PRODUCTION / ORACLE CAPABILITY VERIFICATION PENDING.** Branch: `fix/p0-downloads-forge-same-origin-20260926`.

- **VERIFIED root cause from current source and owner screenshot:** the optional-export client performed GET → POST prepare → immediate GET. Both artifact GETs used the same Cloudflare rate-limit bucket, so the second read could return HTTP 429 with the exact UI error `Please wait before checking or submitting again.`.
- The client now reads an existing PBR/FBX/BLEND artifact first. Only HTTP 409 triggers one cached, idempotent, no-AI export-preparation request for that saved job and one retry marked as the `prepared` stage. The read-only world audit explicitly disables preparation and remains GET-only.
- Artifact read limits are isolated by signed job + format + bounded stage (`initial` / `prepared`), so the 409 recovery retry cannot throttle itself and PBR, FBX and BLEND do not share one bucket.
- **VERIFIED ForgeMPC2 source inventory:** pinned `teslaeco/Froge-MPC-2-test@bac2827fc1ec31e71dc0f5c586df43c507338725` contains one committed 3D character binary: `public/models/rapper-v10.glb` (10,343,368 bytes, Git blob `25d3a7f62fb97844843e3007d498a3d93a927d42`). No additional committed FBX/BLEND/GLB character library was found, so this repair does not invent missing characters.
- Build/verify now hydrates that exact immutable GLB, checks size/container/SHA-256, publishes it same-origin at `/world-assets/forge/rapper-v10.glb`, and production smoke must hash the published copy. The four mobile workers are moved closer to the hub and the verified asset upgrade starts after 600 ms (300 ms desktop); seven desktop task instances remain.
- The Forge worker is still a generic GAME character; task differences come from WORLDIFACT props/behavior. Procedural workers remain a truthful fallback if the verified GLB cannot load.
- **BLOCKED / separate dependency:** if an older completed Oracle job never produced PBR/FBX/BLEND, the production Oracle worker still needs the reviewed post-hoc export capability. Merged website code alone does not prove that VM capability is installed. Do not claim legacy missing exports fixed until production health confirms `posthocExportRevision=2` (or equivalent reviewed capability) and an owned saved job succeeds end-to-end.
- No Astra/OpenAI generation, model submission, checkout, payment, supplier order or manufacturing approval is performed by this repair.
- Code head `8c363cbdf267d6e9f8e4fe9fe86047601e9b3daa` passed all eight review workflows: Verify WORLDIFACT `36231931579`, ForgeMPC2 source `36231931585`, post-hoc export review `36231931583`, FAST worker `36231931569`, FAST install safety `36231931559`, Cloud Shell launcher `36231931607`, Oracle project-file review `36231931563`, and FAST cost guard `36231931560`. This documentation-only follow-up still requires its own exact-head checks before merge.

---

# WORLDIFACT — Grand Desert + Mountain Coast + living Forge workers, 26 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** PR #112 rebuilt the expansion on current main, passed all seven exact-head checks, and was squash-merged as `03c345d37e91d3b1af608084c64c676eb86d594f`.

- The central five-portal Riverlight meadow remains the hub. Walkable world bounds expand from roughly ±42 to ±174 GAME units and the meadow support plane expands to ±180.
- **Grand Desert** begins east/right of the hub at X≈52 and extends to X≈174 with a mobile-bounded dune mesh, rocks and an oasis. The existing editable excavation worksite at X 15–40 / Z 14–39 remains separate and functional.
- **Mountain Coast** begins west/left of the hub at X≈-52 with layered instanced ridges, green forested valleys, a GAME river and a visible western ocean/coast. The ocean is scenery at the far edge; it is not labelled real Earth observation.
- New terrain and workers are outside the five-portal line and do not replace Giant Tower, spawn or owner vehicles. Camera/fog/world movement limits expand to expose the new biomes.
- Living NPC plans use finite deterministic GAME loops: planting saplings, carrying material, assembling simple blocks and surveying. Mobile is capped at 4 NPCs; desktop at 7.
- Pinned ForgeMPC2 candidate: `teslaeco/Froge-MPC-2-test@bac2827fc1ec31e71dc0f5c586df43c507338725` / `public/models/rapper-v10.glb` / Git blob `25d3a7f62fb97844843e3007d498a3d93a927d42` / 10,343,368 bytes. Provenance and licensing are recorded in `ASSET_LICENSES.md`.