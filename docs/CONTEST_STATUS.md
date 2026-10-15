# 15 October 2026 — Screenshot-driven navigation cleanup (review branch)

## Current milestone: implementation, not publication

Owner screenshots identified duplicate portal navigation, an unwanted large Product Hunt panel and an unnecessary chess launcher. The old six-card grid and entire Product Hunt panel/embeds are removed from the shared meadow. The single LED navigation, compact resource strip, small Product Hunt resource link and ISS petition remain.

`/chess` automatically replaces its disposable entry route with the actual same-origin `/apps/chess/index.html` game. There is no intermediate preview, extra launch click, blueprint generator or nested mobile WebGL frame. The real account/guest welcome and shared identity checks remain. This intentional entry navigation is separate from the linked game's in-document Exit to menu. Other portals and legacy route redirects remain intact.

## Verification diagnosis

[Diagnostic run 38694557865](https://github.com/teslaeco/WORLDIFACT/actions/runs/38694557865) ran the unchanged full verify: lint and TypeScript passed; 2306/2312 tests passed, zero skipped. The six failures were five portal-harness imports not recognizing the real new ChessPage and one historical requirement for the now owner-removed Product Hunt embeds. The revised harness loads the actual ChessPage; Shop, Planets, ISS, Terra, private-world and account checks remain. The Product Hunt regression now checks absence of the big embeds and preservation of the requested small resource link/petition. The historical no-nested-chess-iframe protection is retained. New tests execute the actual entry effect, including StrictMode replay and a fixed account-capable same-origin target.

Linked game work: [Cube Chess PR #144](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/144) adds confirmed return to menu, preserved saved games and chess-first English/Polish About copy. Its first browser run exposed an existing self-triggering guest readiness observer; the follow-up disconnects it before changing observed attributes. The integrated pin and final verification are still pending here.

PENDING: full verification after this repair, foundation assembly, Worker dry-run, final tested chess pin and owner publication approval. The temporary diagnostics workflow does not modify the protected original CI and will be removed before release. Physical Android, real sign-in and production publication are not claimed. No paid provider request, billing change, merge or deployment is included.

## Last production evidence, unchanged

Production remains the preceding six-portal release `c82c6abe246996630b1d751a40dcf769181089f5`, Cloudflare version `630e387c-15d8-42b6-848d-bacf32e2b697`. Complete prior evidence is preserved byte-for-byte in [the pre-cleanup snapshot](CONTEST_STATUS.before-ui-cleanup-20261015.md), original blob `1a50b6a47d107fd9fef81625ae7a8d4b1704f7d9`. Historical LIVE/test claims are not verification of this branch.
