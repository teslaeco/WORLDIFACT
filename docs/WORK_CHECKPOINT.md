# Work checkpoint

The initial scaffold claimed browser verification without preserved current evidence. Those claims must not be carried forward.

The night branch implements valley/rover/doors, scene composition, device archive, GLB/JSON export, local original-model review, supplier comparison and a gated Astra Worker.

Read `NIGHT_SHIFT.md` for active-editor ownership and scope, `CONTEST_STATUS.md` for current verification/release gates, `MANUFACTURING_AUDIT.md` for mesh/pricing findings and `CLOUDFLARE.md` for release preparation.

Local browser checks were blocked. PR #2 is merged and main CI passed on `2588c3b9c0ea647d1db7662b24725388a215239f`. The owner manually started release run 34954004953: secret-format checks, 41 tests, lint, TypeScript, HTTP smoke, build, packaging and 14 static-asset uploads passed. Cloudflare then rejected `public/_redirects` with error 100324 (infinite redirect loop); public checks were skipped. The follow-up removes that redundant rule and retains native SPA routing. A new manual run on the corrected main commit is required; retrying the old run uses the old source. Live AI, an actual public deployment/check, current source models and manufacturing approval remain outstanding.
