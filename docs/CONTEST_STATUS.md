# WORLDIFACT status — Shop draft editing repair

Date: 17 September 2026. Active scoped repair: PR #37, `fix/shop-edit-after-result-20260917`.

## Owner report and verified cause

The owner's 17:08 Android screenshot shows the successfully generated knight, its saved receipt and archive, but the prompt/mode/purpose controls are disabled. Production code used `disabled={busy || !!saved}` and equivalent expressions. Any selected receipt therefore kept the form locked indefinitely, even after success, despite the help text saying drafts remain editable.

This is a frontend lifecycle defect, distinct from the expired/disabled paid window. A functioning FAST connector does not make a form editable if it has an explicit disabled attribute. No Oracle reinstall, model regeneration, browser-data clearing or secret change is needed for this defect.

Official control semantics checked: https://react.dev/reference/react-dom/components/textarea and https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/disabled.

## Implemented in PR #37

- The description, generation mode, purpose and STANDARD reference controls now edit a next-model draft independently of the selected result and available paid allowance. Inputs only lock for the submission/preparation operation that owns them, not forever because a receipt exists.
- A running job remains immutable. The user may draft the next request while it runs, but no second job can start until the selected receipt's own terminal status is confirmed.
- The prior preview, submitted description, downloads and archive stay unchanged during editing, switching mode and clearing the draft. A visible `Clear next-model draft` action affects only draft description/photos, with confirmation, and never removes the receipt or archived model.
- Only an explicit Generate action can replace a completed selection. The coordinator verifies its own latest confirmed terminal state, snapshots inputs before waiting, and preserves the old receipt in same-origin device history before storing the new one.
- Free preparation failure, unavailable allowance and storage failure do not discard the previous model or send a paid POST. Failed acceptance recovers only the newly prepared receipt by GET. Existing double-click protection, fetch binding, exact-input signature, server limits and archive-original preservation remain.
- FAST retains its capability check and v1 restrictions: text-only, no reference photos/terrain, up-to-2K map ceiling. Choosing STANDARD restores the applicable photo/texture controls. Draft mode does not change the original result's generation profile or export identity.
- No CSS, generator/Oracle source, cloud infrastructure, secrets, provider model, request ceiling or pilot/expiry marker was changed.

## Tests and evidence boundary

New tests exercise the actual checked-in Shop component, its effect lifecycle and real input/submit handlers with deterministic storage/timer/HTTP adapters. They restore a completed result with zero allowance, edit the prompt, switch STANDARD/FAST, select/clear new references, preserve the old preview/receipt/archive, reject active-job replacement and verify one submission only after an explicit Generate action with a simulated available allowance.

Additional real-client tests cover terminal identity, unknown restored state, unchanged old receipt after failed free preparation, storage failure, lost next-job response and snapshot stability if a draft object changes while preparation is waiting.

Initial run `35239946404` passed 175/176 tests, including all ten new behavioral cases; the only failure was the pre-existing native-fetch fixture's explicit dependency bundle not yet including the new `studioDraft.ts` helper. It was fixed by including that exact module, preserving the unknown-import assertion. The existing standalone Chromium API test now also exercises explicit next-job receipt preservation. It still uses inert data URLs only and is NOT a website preview or Android/WebGL test.

Complete final-head verification is required before publication. Test fixtures are not a paid AI result, and successful source checks do not prove physical-device behavior. Recorded browser-preview security restrictions remain respected; no blocked page preview is retried indirectly.

## Scope and approval

The user requested that these broken fields be fixed on the existing site, continuing the already authorized scoped repair/publication workflow. This branch contains only the edit/next-job lifecycle repair and its tests/docs. Release only the reviewed expected head after full CI and public asset verification.

The previous conversation includes approval of **one FAST test up to USD 5**. That approval is acknowledged; it is not missing and should not be requested again. It is also not proof of actual server activation, a successful request or an enforced monetary cap. This UI repair does not enable or execute that test and must not be reported as doing so. No seventh request, paid benchmark, budget reset/refund or expiry extension has occurred in this repair.

Editing must work even when the paid window is disabled. The Generate button must accurately remain disabled when the server cannot accept a paid request. Do not promise that simply selecting FAST or editing a prompt reopens paid capacity.

## Preserved installation and production baseline

Prior release ledger, including the complete Oracle installation/verification/rollback evidence and public FAST capability: https://github.com/teslaeco/WORLDIFACT/blob/19f9cd57573b3966d258c227813a105ca2aed611/docs/CONTEST_STATUS.md.

- FAST installed by the owner on the exact reviewed Oracle v33, locally verified and restarted. Worker and tunnel were active; no paid model request by the installer.
- PR #36 merged as `8b95f95c6b015bd645020cded76e174fb78a83fc`; preceding Cloudflare version `9cfc1b17-2c6f-4af5-9464-49cb5cc4ed3a`.
- Prior public probe at 14:54:27 UTC showed `fastReady=true`, `photoReady=true`, Oracle `CONNECTOR_READY`, paid `ready=false`, `DISABLED_OR_EXPIRED`, six reserved attempts and zero remaining. These are timestamped observations, not an indefinitely current counter.
- Original hosted Studio remains https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/ . WORLDIFACT entry remains https://worldifact.xodobrox.workers.dev/shop . No authenticated iframe, top-level redirect or brief-export substitute is restored.
- The owner's successful knight and approximately 16-minute duration remain the real baseline. No new 1–2-minute end-to-end performance, improved likeness, native 4K/8K, manufacturing approval, public store catalog/order or contest readiness is claimed.

## Handoff

GO for this UI repair only after final exact-head checks. Record merge SHA, publication outcome and public probe in the PR and this ledger after success. Keep actual field editing, paid capacity and fresh model performance as three separate claims. Do not tell the user to clear browser storage or install the Oracle patch again.
