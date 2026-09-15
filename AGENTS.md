# WORLDIFACT working instructions

Use English in source, product UI, repository documentation and commit messages. Communicate with Sebastian in Polish unless requested otherwise.

- Read `docs/NIGHT_SHIFT.md` and `docs/CONTEST_STATUS.md` before continuing this audit. Respect the active-editor marker; scheduled runs must avoid concurrent edits.
- During the currently authorized night shift, work locally. The user reserved PR creation, push, merge and Cloudflare publication for the morning review. Do not place orders, send supplier messages or enable paid generation without the applicable user authorization. Later user instructions can change this scope.
- Keep API credentials in the Worker environment only. Never add an API key to a `VITE_` variable, frontend bundle, URL, commit or report.
- DEMO is deterministic local logic. LIVE requires a successful real provider response. Report tests using a stub as tests, never as live AI evidence.
- The two current B2B candidates are Sculpteo and JLC3DP. Qualification contacts do not establish a manufacturing partnership. A calculator result is preliminary until engineering review.
- Preserve original GLB/Blender assets. Keep private source models outside the public repository. Label GAME and MAKE revisions separately, with hashes, units and approval evidence. Rendering success is not production approval.
- Follow recorded browser security blocks. Do not retry blocked local previews through another browser, CDP, file route or indirect execution. Record unavailable checks as BLOCKED.
- Run `npm run verify` and `npm run deploy:check` after material code changes. Add tests for meaningful input, state, geometry or API risks; avoid implementation-mirroring tests.
- Use `docs/CONTEST_STATUS.md` as the evidence ledger. Update stale claims in older documentation instead of appending contradictory assurances.
