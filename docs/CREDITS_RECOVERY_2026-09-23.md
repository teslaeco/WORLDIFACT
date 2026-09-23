# Credits, checkout landing and stale receipt recovery

Owner request: keep the credit count visible at the top, return subscription buyers to the homepage with thanks, and repair the AI Shop's stuck generation shown with an invalid receipt and more than 35 hours elapsed.

Baseline: main 9703573e535f12e490e1b5f9323ae11e6adf21d6. Branch: fix/credits-checkout-stale-receipt. Existing release evidence remains in CONTEST_STATUS.md and the prior PRs.

The shared sticky balance bar sits outside route suspense. It reads the authenticated entitlement endpoint, scopes state to the account, cancels obsolete requests, refreshes on focus/navigation and periodically while visible, and does not invent a zero or a purchased balance when unavailable. Free FAST/SLOW counts are separate. The first minute after checkout uses a bounded faster cadence, then returns to the normal cadence.

The existing Stripe processing return is routed to the homepage. Thank-you text distinguishes a server-confirmed active membership from pending confirmation or billing review. A URL does not grant credits or prove settlement; a top-up does not imply membership. Payment capture, webhook, prices, idempotency and cancellation logic are unchanged. PayPal capture remains an explicit action on the existing page.

The receipt repair handles only the server's exact HTTP401 invalid-signature or expired-receipt errors during recovery. It preserves and verifies the complete original in local receipt history before permitting the existing UI to archive the unusable selection and stop its timer. It records a local recovery failure, not an Oracle failure/cancellation. The old model's outcome remains unknown. A new model still requires an explicit user action and normal server authorization/quota checks. An expired login, account mismatch, 404, throttling, network failure, generic 5xx or age alone cannot release a job. Late responses for another selection and failed history storage cannot erase the active receipt. No automatic paid retry, refund, credit grant, signature weakening or model deletion occurs.

Added isolated regressions cover real zero/invalid balances, no-store authenticated GETs, safe homepage routing, pending versus active/reviewed membership, exact invalid/expired receipt recovery, complete history retention, no paid replay, unrelated authorization/network errors, old-but-pending work, storage failure and stale-response isolation.

Validation at source checkpoint: source review only. CI, build, Worker dry-run and deployment are not yet reported as passing. Public network access and repository cloning are unavailable in the local runtime; GitHub connector publication and existing CI/release gates are used. No paid generation or payment was performed. Full live model output and a completed real-money purchase are not claimed. Subsequent CI/deployment evidence will be recorded in the implementation PR.
