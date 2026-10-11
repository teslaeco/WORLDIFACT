# Shop attachments and customer interface — 11 October 2026

## Scope

The existing preview-first Shop remains the single workspace. The prompt has a
keyboard-accessible plus button and adjacent active-model selector with a status
light. Four JPG/PNG/WebP references, up to 40 MiB total original size across
successive selections, are shared between 3D and Image mode. They are prepared
locally into JPEGs, at most 1.5 MiB each / 6 MiB total. Large originals are never
silently omitted; invalid batches preserve the previous selection. The existing
text-only Sol/Luna routes remain labelled drafts and require Astra for references.

Image requests with references use one multipart OpenAI `/v1/images/edits` call;
text-only requests keep `/v1/images/generations`. This follows the official
[image edit contract](https://developers.openai.com/api/reference/resources/images/methods/edit).
Input bytes participate in the immutable request fingerprint, but are not stored
in Durable Object history, public files or browser recovery metadata. Navigation
recovers by GET; an in-memory retry uses the same full request and ID. Native
Cloudflare tests verify four multipart files, one charge, replay and saved PNG.
The existing 5-point terms, model IDs, authentication, dispatch and billing guards
are unchanged. No API key provisioning or real paid generation is performed.

Two selectable styles: Cosmos (default) and Egypt (sandstone, engraved SVG relief,
green/blue LED accents). More themes are labelled future functionality. Theme
selection is local and does not submit jobs. The exact existing 18-face sculpture
is retained; a LED progress ring below it shows confirmed model milestones.
Image generation remains indeterminate when the provider reports no percentage;
animation never fabricates elapsed-time completion. Reduced motion is respected.

Existing authenticated GLB, FBX, Blender and PBR downloads are retained. New OBJ
export converts the same authorized GLB locally, preserving placements and baking
static poses/instances. OBJ contains geometry, UVs and normals; use GLB/Blender
for PBR materials, animation and rigs. Conversion never dispatches a provider job.

## Validation and limitations

Automated tests cover original upload boundaries, fifth-file rejection, malformed
references, native multipart transport, replay conflicts, preserved reservations,
PNG persistence, translated shared meshes in OBJ, external-resource rejection,
preview ordering and accessible indeterminate progress. Paid visual generation
and new-model production quality are not claimed. Local browser preview remains
blocked by the recorded browser policy; hosted verification and production
read-only UI inspection are separate evidence.

Local evidence: 102 Shop lifecycle tests passed; focused reference/OBJ/native
image tests passed. TypeScript, production build and Worker dry-run passed.
The full local verify run reached 2,166 tests but two Chromium-specific tests
were unavailable; an earlier fixture assertion was corrected and its suite
rerun successfully. Full hosted CI remains the merge gate.

## Release and rollback

Use the exact-parent, exact-path source-only envelope. It preserves remote vars,
secrets, bindings, Stripe, existing points, jobs and generated files; financial
recovery jobs are disabled. Squash merge only after required checks pass. A parent
change invalidates the envelope and requires review, not a forced merge.
Rollback is a separately reviewed preserving source release. Keep all existing
image records and fingerprints; do not reverse completed charges or replay jobs.
