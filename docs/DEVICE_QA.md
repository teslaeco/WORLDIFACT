# Browser and device release evidence

Status: **PARTIAL / TWO ANDROID UX FAILURES OBSERVED; FIX PREPARED, RE-TEST REQUIRED**.

Run browser checks only on the owner's device or another authorized browser path. Record the deployed commit and public origin. Leave unobserved items UNKNOWN.

| Scenario | Acceptance | Current evidence |
|---|---|---|
| Android portrait | Readable controls; no horizontal overflow; primary interaction usable | **PARTIAL PASS**: `/lab` layout and WebGL render correctly on owner Android |
| Android landscape | Same core controls remain usable | UNKNOWN |
| Desktop controls | WASD/arrows, mouse look, E/Escape; prompt typing does not move player | UNKNOWN |
| Portal navigation | Non-current portals leave `/lab`; current Game Lab does not re-enter itself | Previous freeze fixed and deployed in PR #19; owner-device cross-route re-test still incomplete |
| AI Game Lab scene | 3D scene renders and accepts controls | **PASS observed on owner Android** |
| AI Game Lab LIVE | LIVE button only enabled with an authorized Astra allowance | **EXPECTED BLOCKED**: approved 4/4 paid pilot is exhausted |
| AI Game Lab DEMO | A no-cost clearly labelled MOCK flow changes scene and exposes GAME/MAKE | **FAIL on current production**: screen shows `DEMO only` but no usable local DEMO action; fix branch adds `Try DEMO locally · no API cost` |
| 8 Planets | Public no-login content renders inside WORLDIFACT | **FAIL on current production**: owner Android shows blank/broken external FORGE iframe |
| 8 Planets fallback | A local clearly-labelled demo works even when external prototype cannot embed | **PREPARED** on `fix/nonworking-embedded-worlds-20260916`: local 8-stage interaction replaces the broken iframe; original remains an external prototype link |
| Other tested routes | Open without the two failures above | Owner reports other tested pages working; exact route-by-route evidence not yet recorded |
| WebGL fallback/context loss | Fallback navigation works and context recovery is safe | Code tests only; device context-loss behavior UNKNOWN |
| Public HTTPS | Root, `/lab`, assets/API reachable without ChatGPT login | HTTP PASS; owner Android loaded `/lab` without login |
| Oracle generated GLB | Existing generated model can be retrieved owner-only without new generation | STRUCTURAL PASS; visual quality remains `GENERATED-UNREVIEWED` |

## Android findings — 16 September 2026

### 1. AI Game Lab

The native `/lab` UI and Three.js scene render on Android. The `Create with GPT-6 Astra` button is disabled because the approved paid pilot quota is exhausted. That is correct for cost control, but the page currently advertises `DEMO only` without providing a usable local DEMO action.

Prepared fix:

- add a no-cost local `DEMO / MOCK` generation button using the existing validated `demoBlueprint` + `localSceneResult` path;
- visibly change the same Three.js scene;
- expose the local WorldBlueprint and AssetSpec while keeping MAKE `validation-required`;
- keep LIVE disabled until a separate paid allowance is explicitly approved;
- never label local DEMO output as Astra-generated.

### 2. 8 Planets in 8 Days

The `/planets` route currently embeds the external FORGE World Builder URL in an iframe. Owner Android shows that frame as a blank/broken document. The exact remote cause is not asserted; embedding/authentication/CSP/remote availability are outside the reliable no-login contest path.

Prepared fix:

- stop depending on the remote iframe for the primary `/planets` experience;
- render a local no-login eight-stage `DEMO · MOCK GAMEPLAY` fallback with Move/Jump/progress and planet selection;
- retain the original FORGE prototype only as an explicitly external link;
- label the full eight-level campaign as PLANNED.

The fixes are not production PASS until CI is green, the owner approves merge/deploy, and the deployed Android re-test succeeds.

Do not create final Product Hunt screenshots/video from mocked LIVE responses. The Oracle GLB remains `GENERATED-UNREVIEWED` until visually inspected.
