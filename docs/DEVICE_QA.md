# Browser and device release evidence

Status: **PARTIAL / MANUAL DEVICE QA STILL REQUIRED**. Local browser and shared-file preview actions were previously rejected by automatic approval review. Do not work around that restriction through another browser, CDP, file route or indirect app rendering. Source/HTTP tests are separate evidence.

Run the remaining browser checklist only through an authorized browser path or on the owner's device. Record date, device/browser, exact commit and actual public origin. Leave unobserved items UNKNOWN.

| Scenario | Acceptance | Current evidence |
|---|---|---|
| Android portrait/landscape | Readable controls; movement and camera usable together; no horizontal overflow | `/control` visually observed earlier on owner Android; current `/lab` interaction UNKNOWN |
| Desktop controls | WASD/arrows, mouse look, E and Escape; typing a prompt does not move the player | UNKNOWN |
| Workshop | Closed doors block entry; open doors permit entry/exit at rotated/scaled habitats | Movement logic tests only |
| Rover | Enter, steer, drive, exit; body does not pass through walls; exit remains in bounds | Movement logic tests only |
| Portals | Five direct routes and refresh work; planned gameplay is labelled | Release/source tests plus deployed public HTTP; interactive browser behavior UNKNOWN |
| AI Game Lab UI | Prompt/image controls, progress/cancel, Astra output, visible scene change, GAME/MAKE labels | API/schema/state tests and real LIVE backend evidence; clean-session browser observation UNKNOWN |
| Archive | Successful generation saves; reload/search/load/combine/import/export work; corrupt records handled | Archive tests only |
| WebGL | Fallback navigation; context loss pauses; recovery and teardown do not leak | Code/resource tests only; device behavior UNKNOWN |
| Privacy | Notices reachable; access code never appears in exports or URLs | Source/API tests only |
| Public HTTPS | Root, `/lab`, assets/API reachable without ChatGPT login | **HTTP PASS** on deployed origin `https://worldifact.xodobrox.workers.dev`; this does not prove browser rendering/input |
| Oracle generated GLB | Real artifact can be retrieved owner-only without new generation | **STRUCTURAL PASS**: 204,732-byte glTF 2.0, SHA-256 verified; visual quality still UNKNOWN |

Do not create final Product Hunt screenshots/video from mocked LIVE responses. Device FPS remains unmeasured; structural draw-call reductions are not FPS results. The Oracle GLB remains `GENERATED-UNREVIEWED` until visually inspected.
