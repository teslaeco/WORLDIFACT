# Browser and device release evidence

Status: **PARTIAL / ANDROID PORTAL REGRESSION FOUND; FIX PREPARED, RE-TEST REQUIRED**. Local browser and shared-file preview actions were previously rejected by automatic approval review. Do not work around that restriction through another browser, CDP, file route or indirect app rendering. Source/HTTP tests are separate evidence.

Run the remaining browser checklist only through an authorized browser path or on the owner's device. Record date, device/browser, exact commit and actual public origin. Leave unobserved items UNKNOWN.

| Scenario | Acceptance | Current evidence |
|---|---|---|
| Android portrait/landscape | Readable controls; movement and camera usable together; no horizontal overflow | **PARTIAL PASS** on owner Android portrait at deployed `/lab`: layout and WebGL scene render. Landscape remains UNKNOWN |
| Desktop controls | WASD/arrows, mouse look, E and Escape; typing a prompt does not move the player | UNKNOWN |
| Workshop | Closed doors block entry; open doors permit entry/exit at rotated/scaled habitats | Movement logic tests only |
| Rover | Enter, steer, drive, exit; body does not pass through walls; exit remains in bounds | Movement logic tests only |
| Portals | Five direct routes and refresh work; planned gameplay is labelled | **FAIL observed on Android 2026-09-16**: while inside `/lab`, crossing Chess Cube set `Entering world…` but the page never navigated because P0 Game Lab passed a no-op `onPortalOpen`. Fix branch routes the four non-current portals through React Router. Re-test after deployment required |
| AI Game Lab portal | Current-world portal must not pretend to navigate to itself | In `/lab`, `ai-game-lab` is intentionally `activePortalId` and labelled `YOU ARE HERE`; it is excluded from entry detection. UI now explains this in the fix branch |
| AI Game Lab UI | Prompt/image controls, progress/cancel, Astra output, visible scene change, GAME/MAKE labels | **PARTIAL PASS**: prompt/image panel, scene and labels visible on owner Android. LIVE button correctly disabled because approved 4/4 pilot is exhausted. Fresh paid generation not authorized |
| Archive | Successful generation saves; reload/search/load/combine/import/export work; corrupt records handled | Archive tests only |
| WebGL | Fallback navigation; context loss pauses; recovery and teardown do not leak | **WebGL render observed on owner Android**; context-loss/fallback behavior remains UNKNOWN |
| Privacy | Notices reachable; access code never appears in exports or URLs | Source/API tests only |
| Public HTTPS | Root, `/lab`, assets/API reachable without ChatGPT login | **HTTP PASS** on deployed origin `https://worldifact.xodobrox.workers.dev`; owner Android also loaded `/lab` without ChatGPT login |
| Oracle generated GLB | Real artifact can be retrieved owner-only without new generation | **STRUCTURAL PASS**: 204,732-byte glTF 2.0, SHA-256 verified; visual quality still UNKNOWN |

## Android regression found on 2026-09-16

Owner-device evidence showed `/lab` rendering successfully in Chrome on Android, but portal navigation from the embedded meadow was broken. Root cause: `P0GameLab` supplied `onPortalOpen={() => {}}` to `StartingWorld`. `StartingWorld` correctly detected the portal, entered its transition state and stopped the animation loop, but the callback never changed route, so `Entering world…` remained indefinitely.

Prepared fix:

- resolve portal ids through the central WORLDIFACT portal configuration;
- navigate the four non-current portals from `/lab` instead of using a no-op callback;
- keep `ai-game-lab` marked as the current world (`YOU ARE HERE`) rather than re-entering the same route;
- add route-resolution regression coverage.

This fix is not a browser PASS until the owner re-tests the deployed build.

Do not create final Product Hunt screenshots/video from mocked LIVE responses. Device FPS remains unmeasured; structural draw-call reductions are not FPS results. The Oracle GLB remains `GENERATED-UNREVIEWED` until visually inspected.
