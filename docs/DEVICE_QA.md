# Browser and device release evidence

Status: **BLOCKED**. Local browser and shared-file preview actions were previously rejected by automatic approval review. Do not work around that restriction through another browser, CDP, file route or indirect app rendering. Source/HTTP tests are separate evidence.

Run this checklist only through an authorized browser path or on the owner's device. Record date, device/browser, exact commit and actual public origin. Leave unobserved items UNKNOWN.

| Scenario | Acceptance | Current evidence |
|---|---|---|
| Android portrait/landscape | Readable controls; movement and camera usable together; no horizontal overflow | UNKNOWN |
| Desktop controls | WASD/arrows, mouse look, E and Escape; typing a prompt does not move the player | UNKNOWN |
| Workshop | Closed doors block entry; open doors permit entry/exit at rotated/scaled habitats | Movement logic tests only |
| Rover | Enter, steer, drive, exit; body does not pass through walls; exit remains in bounds | Movement logic tests only |
| Portals | Five direct routes and refresh work; planned gameplay is labelled | HTTP route testing pending deployment |
| Create and edit | Prompt and image flow; progress; cancellation; edits protected from late replies | API/schema/state audit; browser UNKNOWN |
| Archive | Successful generation saves; reload/search/load/combine/import/export work; corrupt records handled | Archive tests only |
| WebGL | Fallback navigation; context loss pauses; recovery and teardown do not leak | Code/resource tests only |
| Privacy | Notices reachable; access code never appears in exports or URLs | Source/API tests only |
| Public HTTPS | Clean session without ChatGPT login, direct routes, static assets and API | NOT DEPLOYED |

Do not create final Product Hunt screenshots/video from mocked LIVE responses. Device FPS remains unmeasured; structural draw-call reductions are not FPS results.
