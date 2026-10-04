# Original Studio request budget with compatible recovery

`STUDIO_NEW_JOB_POLICY=legacy-usd175-v1` restores the original new-model contract:
250 customer points on successful completion and a maximum USD 1.75 provider
reservation for one Astra/Blender job. The public Shop and character creator show
the single original price. No new 200-cent or 400-cent priced request is admitted
under this policy, including a receipt prepared before the policy changed.
This applies to requests handled by the new deployment. Work already executing
in an older Worker instance may finish under its original configuration.
Missing configuration also selects the original policy; unknown values refuse
new admission. Only an explicit `tiered-v1` configuration enables new priced tiers.

This is a compatibility-preserving rollback of new-request behavior, not a
historical database or full source-tree restore. Already admitted 250/500-point
jobs retain their original signed input, price, provider cap and recovery path.
Their terminal settlement and authenticated liability reconciliation are unchanged.
Existing support claims, provider reservations and account funding are not reset.
The original request path still needs sufficient verified account funding.

The current dispatch fences, account/session discovery, namespaced Blueprint
recovery, download protections and world-loading corrections remain installed.
Those safeguards cannot be removed safely while newer jobs and browser receipts
remain in use. A stale priced browser submission is refused with a typed reason
before any new account or Oracle reservation; an exact already-owned priced
submission remains recovery-only.

Oracle keeps its immutable job terms and terminal seals. Its verified legacy
request path already distinguishes an unpriced USD 1.75 job from newer priced
jobs; this website change does not install or downgrade Oracle code. Any separate
runtime downgrade requires current host evidence and a reviewed migration.
Dots review authentication is a separate worker and is not activated by this policy.

Regression tests cover both policy values, absent/unknown configuration, stale
prepared receipts, simultaneous refused submissions, original-cap payloads,
priced pending/failed/completed recovery, immutable settlement and the single-price
Shop UI. Inert test responses are not evidence of a successful paid generation.
