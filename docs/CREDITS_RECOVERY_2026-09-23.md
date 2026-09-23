# Credits, checkout landing and stale receipt recovery

Owner request: keep the credit count visible at the top, return subscription buyers to the homepage with thanks, and repair the AI Shop's stuck generation shown with an invalid receipt and more than 35 hours elapsed.

Baseline: main 9703573e535f12e490e1b5f9323ae11e6adf21d6. Branch: fix/credits-checkout-stale-receipt. Existing release evidence remains in CONTEST_STATUS.md and the prior PRs.

This first checkpoint adds a shared sticky balance bar outside route suspense. It reads the authenticated entitlement endpoint, scopes state to the account, cancels obsolete requests, refreshes on focus/navigation and periodically while visible, and does not invent a zero or a purchased balance when unavailable. Free FAST/SLOW counts are separate.

The existing Stripe processing return is routed to the homepage. Thank-you text distinguishes a server-confirmed active membership from pending confirmation or billing review. A URL does not grant credits or prove settlement. Payment capture, webhook, prices, idempotency and cancellation logic are unchanged. PayPal capture remains an explicit action on the existing page.

The invalid-receipt recovery change and its safety regressions are recorded in the next commit on this branch. A failed receipt check is not proof that an Oracle model failed or was cancelled. Historical recovery data must be preserved before the local selection is released. No automatic paid retry, refund, credit grant, signature weakening or model deletion is authorized by recovery.

Validation at this checkpoint: source review only. CI, build, Worker dry-run and deployment are not yet reported as passing. Public network access and repository cloning are unavailable in the local runtime; GitHub connector publication and the existing CI/release gates are used. No paid generation or payment was performed.
