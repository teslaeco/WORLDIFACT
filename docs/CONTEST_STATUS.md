# WORLDIFACT — evidence ledger

Latest documentation milestone: 21 September 2026.

## VERIFIED — gallery publication and A05 file repair

- Gallery and ten image paths were published on PR #60 by a successful non-forced branch fast-forward to `9877b63af81669fc894313d355972c41d60e5da1`. Post-push reads confirmed the article's exact checked blob and image directory.
- The final directory-size check found a defect in recovered A05 blob `b6ffddfbd31595782646b4e80f214285a4503ef8`: GitHub held 8562 bytes, whereas the RIFF header declared 8572. Merely checking its magic and dimensions had not caught this. Do not treat the earlier header-only check as a full image validation.
- Recreated A05 from the owner's original `Screenshot_20260921-063413.png`, crop `[0,270,435,690]`, LANCZOS thumbnail within 360 x 360, WebP quality 68 / method 6. Result: 360 x 348, 8254 bytes. Full local bitmap decoding and RIFF/file-length agreement passed.
- Uploaded repaired Git blob `517f76f5724988a178344f90f14624d5c926152a`; the returned SHA matches the hash of the locally decoded bytes. Updated the manifest with its source/output SHA-256, exact crop, size and repair provenance. No generative image edit was used.
- The other nine directory sizes agree with their previously read headers. This does not claim a fresh full bitmap decode for those nine or a live GitHub browser-rendering pass.

## VERIFIED — GitHub rim gallery assets and article links

- Owner clarified that the comparison images must be embedded in the GitHub article, not replaced with generated posters or a production-site update.
- Recovered ten existing screenshot-crop blobs and attached them at `docs/evidence/rim-review-2026-09-21/` in image commit `eb3da73189c618aede70dd7f4e72421ae59d5d2b`. A05 was subsequently replaced as recorded above.
- Read all ten image paths back through the GitHub Contents API; their returned Git blob identifiers and WebP headers match the initial publication manifest. The A05 byte-length defect was caught by the separate directory-size check above. Header verification alone is not a full bitmap-decoding or browser-rendering pass.
- The article contains ten inline, clickable images: five WORLDIFACT captures, four Meshy captures and one separately labeled earlier FORGE capture. The strongest supplied Meshy openwork result is retained. Multiple views are not presented as independent trials.
- Parsed the prepared HTML gallery locally: ten unique image paths, ten matching click targets, nonempty alt text and exact correspondence with the remotely checked file identifiers. The checked article blob is `416a2a313d1b88026186bac3bb6d3d0ae3756562`.
- Added [the public crop manifest](evidence/rim-review-2026-09-21/manifest.json). Original screenshot SHA-256 values were checked against the supplied local source files again. No AI-generated comparison poster is included.
- No application code, workflow, paid generation, secret, production deployment or main-branch merge was requested or performed for this gallery update. The current PR records branch publication and any CI result.
- Browser rendering remains BLOCKED in this environment: the direct raw-image read returned a cache miss and the shell cannot resolve GitHub DNS. No physical Android or complete application-suite pass is claimed. Earlier crop-reproduction settings remain unavailable for six current image files; this limitation is disclosed in the manifest.

## Earlier milestones — preserved unchanged

The complete preceding ledger is retained verbatim in [CONTEST_STATUS_2026-09-20.md](CONTEST_STATUS_2026-09-20.md), using the original Git blob `ce73ca1780c7a608025c48548b4f4d0b5d019e07` from main commit `cdfb2870da1a34f324235d2435c3e44b3db1bb30`. No previous evidence or release record has been deleted. This index change does not reset any runtime configuration or acceptance gate.

The latest preceding record documents the project-attachment release and Oracle bridge work on 20 September, including the remaining Oracle VM project-file installation block. Those are historical records, not runtime checks repeated in this continuation. The older README also contains historical launch statements; this documentation-only review does not revalidate contest status.

## VERIFIED — rim comparison documentation prepared

- Owner requested an honest Astra/WORLDIFACT vs Meshy assessment and a GitHub post.
- Review branch: `docs/astra-meshy-rim-review-20260921`.
- Added [the English photovoltaic rim case study](ASTRA_VS_MESHY_RIM_CASE_STUDY.md) and a visible README link.
- Reviewed ten owner-supplied screenshots; their original bytes, sizes and SHA-256 hashes were checked locally and recorded in [the evidence manifest](evidence/RIM_REVIEW_2026-09-21.json).
- Inspected pinned Shop source to distinguish the FAST Astra-specification/procedural path from the detailed SLOW Studio/Oracle/Blender path.
- Reopened official OpenAI model guidance and Meshy multi-view/API documentation on 21 September 2026.
- The report acknowledges WORLDIFACT's unresolved geometry issues and Meshy's successful openwork example. It claims no global winner, numeric quality improvement, speed/cost advantage or manufacturing approval.
- No application code, model configuration, quota, secret, generation job or production deployment was changed by this documentation work.

## UNKNOWN / BLOCKED — limits of this review

- UNKNOWN: per-rim provider/model traces, raw exported meshes, actual texture dimensions, input equivalence, complete attempt history, latency, cost and fabrication readiness.
- Uncropped original screenshots remain unpublished because they contain browser/account UI. The gallery above supersedes the earlier absence of public crops, but it is not a reproducible generation benchmark.
- A public Shop page read failed in the browsing tool. This is not evidence that the site itself was down; no live browser or device pass is claimed.
- Local Git clone was blocked by DNS resolution. Repository inspection and publication use the connected GitHub API; no local full application test run is claimed.
- CI status must be read from the resulting PR checks. Preparation of these files is not evidence that CI passed.

## Publication gate

GO for a reviewable documentation branch and draft PR. Main-branch merge and any resulting automatic production deployment require separate explicit owner approval. No contest submission or contest eligibility decision was made. The proposed mesh-level comparison is RECOMMENDATION / NOT RUN. MAKE remains VALIDATION REQUIRED.
