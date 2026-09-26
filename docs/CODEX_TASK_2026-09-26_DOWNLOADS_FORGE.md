# Codex task — P0 downloads + ForgeMPC2 delivery

Date: 2026-09-26
Repository: `teslaeco/WORLDIFACT`
Target branch: `fix/p0-downloads-forge-same-origin-20260926`

## Command / task

Fix the production Android failures shown by the owner without submitting any new AI generation and without changing an existing saved GLB.

1. Reproduce the export flow in source. The current optional artifact path performs GET -> POST `/exports/prepare` -> immediate GET and the server rate-limits both artifact reads through one shared bucket. Keep the efficient read-first behavior, but on HTTP 409 prepare the existing saved job at most once per client/job and retry exactly once with an explicit bounded `prepared` read stage. Keep GLB read-only and keep the in-world artifact audit GET-only. Never call `/v1/jobs`, Astra/OpenAI, checkout, or any paid generation path.
2. Isolate artifact rate limiting by signed job ID, requested format and bounded read stage (`initial` / `prepared`) so the recovery retry cannot block itself and consecutive PBR/FBX/BLEND downloads do not share one bucket. Preserve receipt/account ownership checks and same-origin protection.
3. Audit `teslaeco/Froge-MPC-2-test` instead of assuming assets exist. Use only committed, license-reviewed 3D character binaries. The pinned revision currently has one real character GLB: `public/models/rapper-v10.glb`, 10,343,368 bytes, Git blob `25d3a7f62fb97844843e3007d498a3d93a927d42`, SHA-256 `4b7e83d07723be958e7325f1cd7afc509ebc72d61a6357925c824ac716052adf`.
4. Make that exact Forge GLB reliable on mobile: hydrate it during verify/build from the immutable pinned revision, validate size + GLB header + SHA-256, serve it same-origin, and make release smoke verify the deployed bytes. Do not fabricate additional source characters. Clone the verified generic worker for the bounded GAME NPC task instances; retain procedural fallback.
5. Put the four mobile workers close enough to the central hub to be visibly discoverable while keeping them clear of the portal line and major collision zones. Start the same-origin character upgrade quickly after core scene startup.
6. Add regression tests for: prepare-before-read with no GET-prepare-GET retry; per-format limiter separation; same-origin Forge source + pinned upstream provenance; production smoke coverage of the Forge GLB.
7. Update `ASSET_LICENSES.md` and `docs/CONTEST_STATUS.md` truthfully. Mark Oracle post-hoc export installation as a separate production dependency until its live capability is actually verified.
8. Run the full repository verification in CI. Do not merge or deploy production until exact-head checks are green and the owner explicitly approves merge/deployment.

Acceptance: no new AI request; no paid generation; no secret exposure; exact saved GLB remains unchanged; a missing PBR/FBX/BLEND export can do initial GET -> no-AI prepare -> prepared-stage GET without self-rate-limiting; same-origin Forge worker is build- and release-verified.
