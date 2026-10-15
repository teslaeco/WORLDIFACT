# 15 October 2026 — Screenshot-driven navigation cleanup (review branch)

## Current milestone: implementation, not publication

The owner supplied Android screenshots identifying duplicated portal navigation, a large unwanted Product Hunt panel and an unnecessary chess launch page. This follow-up removes the old six-card grid and the entire Product Hunt panel/embeds from the shared meadow. The single LED navigation, resource strip (including its small Product Hunt link), ISS petition and existing footer remain.

`/chess` now mounts the real same-origin `/apps/chess/index.html` game directly in a full-height frame. The intermediate board illustration, extra launch click, promotional links and chess blueprint generator are removed. The original game account/guest welcome is retained; no authentication or shared-identity guard is removed. Other portals and legacy route redirects remain intact.

Routing regressions inspect the complete rendered pages: exactly one six-destination LED navigation on each landing page; no old grid or Product Hunt network embeds; a direct chess game frame with no launcher/generator; existing private-world, login and no-generation checks retained.

PENDING: full verify, foundation assembly, Worker dry-run, game-level return-to-menu/About changes and pinned integration. Physical Android interaction, real sign-in and production publication are not claimed. No provider calls, billing changes, merge or deployment are authorized by this review-branch checkpoint.

## Last production evidence, unchanged

Production remains the preceding successful six-portal release `c82c6abe246996630b1d751a40dcf769181089f5`, Cloudflare version `630e387c-15d8-42b6-848d-bacf32e2b697`. The complete prior status is preserved byte-for-byte in [the pre-cleanup snapshot](CONTEST_STATUS.before-ui-cleanup-20261015.md), original blob `1a50b6a47d107fd9fef81625ae7a8d4b1704f7d9`. Its historical LIVE/test claims are not fresh verification of this branch.
