# Generator interface repair — 4 October 2026

## Evidence and scope

The Shop must distinguish a selected procedural concept, an account admission
refusal and a running Oracle job. An interface repair cannot establish that an
account funding refusal is resolved or that a paid model has been generated.

The requested reference `493ec7a2088d65f05474d111009d152f49632a6d` and the later
historical baseline `9b27ab8d3234ec1dac212ca156b8e07548b6aa50` already contain the
current model and deliverable selectors. The earlier Shop at
`58e04843cee9afa5f7a8427edf853fe3986f6d45` offered the Astra/SLOW model workflow
without the deliverable selector. That earlier routing is historical context,
not authority to silently replace a user's current selection.

This change retains the requested reference's layout and explicit choices. It:

- Restores a compact cost notice: the exact account refusal, selected price and
  refresh action remain visible; expanded review prose stays in the existing
  native **Model details and billing** disclosure.
- Shortens the duplicate funding message below the form without claiming READY.
- Adds **Use detailed 3D model · Astra + Blender** beside the existing deliverable
  selector for Astra procedural drafts. This is a native non-submit button that
  only changes the draft. Focus moves to the persistent selector, and Generate
  remains a separate action with the displayed cost and all admission checks.
- Links to the separately implemented read-only account funding page through a
  normal full navigation in a clearly labeled new tab, avoiding the normal app
  hooks at that destination and preserving the in-memory Shop draft.

There is no full historical rollback, redesigned theme, default change,
automatic model upgrade, paid call, account grant, billing change, or change to
server admission or recovery. The original 250-point/USD 1.75 detailed-model
policy and saved historical job prices are retained.

## Verification

Focused tests cover native control semantics, disclosure content, repeated
selection, focus handoff, unchanged prompt/model/receipt/preview, back-forward
cache restoration, result recovery, explicit reversal, reset and account-funding
refusal. Portal lifecycle tests also cover the shared cost notice's consumers.
These are Node component/lifecycle tests, not physical-device visual evidence.

In the isolated UI-only checkout, local verification ran 1,105 tests: 1,104
passed, zero skipped, and the sole failure was the existing native Chromium
test because this executor denies its
process-singleton socket. The test was not removed or weakened. Lint (existing
warnings), TypeScript and manifest-pinned asset preparation pass. Local HTTP
smoke, production build and Worker deployment dry-run were verified separately
because the aggregate command stops at that native-browser failure. Exact-head
hosted CI, including native Chromium, is required before release. No blocked
browser route was retried indirectly.

## Integration requirement

Release this together with the standalone `/account/generation-funding` page
and its authenticated read-only API. Do not publish the link on its own. Use the
incident's reviewed pipeline-only release selection so the deployment performs
no Stripe synchronization. Generation itself must be verified separately from
this interface repair.
