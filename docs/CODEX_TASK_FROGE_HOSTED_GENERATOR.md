# Codex task: connect the EXISTING Froge MPC 2 generator to WORLDIFACT

## Mission and exact source of truth

Execute the integration; do not stop at a plan. The user has explicitly identified this hosted application as the working generator:

https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

The integration repository is https://github.com/teslaeco/WORLDIFACT.
The reference source repository is https://github.com/teslaeco/Froge-MPC-2-test.
The hosted Studio and that GitHub snapshot are NOT assumed to be identical. Do not rebuild the generator from an older repository snapshot or replace its photo/Codex/Blender workflow with a limited text-only demo.

The user wants their existing Studio reachable from WORLDIFACT NOW. Improving likeness, hair, anatomy, textures, model quality and manufacturing suitability is explicitly deferred.

## Required result

WORLDIFACT meadow / platform centre / AI Shop navigation -> /shop -> the exact original hosted Froge MPC 2 Studio. Users must retain access to the original application's prompt, reference images, Codex instructions, generation workflow, model viewer and exports, subject to that application's existing sign-in and permissions.

This is an external application integration, not a native migration of accounts, storage or the AI model. Do not claim that linking the site transfers its backend, archive or API quota.

## Audit before editing

Read AGENTS.md, current main, PR #27, current routes, reference/foundation configuration, deployment workflow and docs/CONTEST_STATUS.md. Preserve concurrent work. Reuse the unmerged integration PR when safe, but replace its obsolete native-generator scope and update its title and description.

Inspect the exact hosted URL using credential-free, read-only HTTP. Record reachability, redirects and frame-policy headers separately. Do not follow sign-in redirects, request credentials, bypass authentication, or start a paid generation to test a link. Treat owner screenshots as owner evidence, not as a newly executed browser or API test.

## Implementation

1. Centralize the exact hosted URL in src/config/references.ts. Reuse it for the active Shop iframe, direct-open links, platform-centre original links and the Game Lab's original-Studio link. Keep forge-studio-public only as a named legacy reference, not an active generator target.
2. Replace the broken ShopPage native form and full-page preview placeholder with a small integration page. Do not add another prompt form, fake job state, duplicate gallery, generated asset, polling loop or JSON brief export.
3. Preserve WORLDIFACT navigation and render an obvious heading: Froge MPC 2 Studio / 3D model generator.
4. ABOVE the iframe, render a prominent ordinary anchor to the exact URL, labelled Open full 3D generator, with target="_blank" and rel="noopener noreferrer". Also provide a same-tab anchor for browsers that block new tabs. These controls must be usable immediately, whether the embedded application loads or not.
5. Embed the original HTTPS URL in a titled iframe using a scoped, normal-flow container. Keep its background and borders consistent with WORLDIFACT. Grant only relevant iframe features such as clipboard writing, optional user-triggered dictation and fullscreen; do not request unrelated camera, geolocation or payment permissions.
6. Preserve the original app's own sessions. Do not use credentialless mode, proxy its authenticated HTML, inject credentials, copy local storage, forward prompts in query parameters, or bypass response security policies.
7. Explain beside the permanent open button: when the embedded app is blank or asks for sign-in, open the full original Studio. Do not use iframe onLoad as proof that the generator works: cross-origin load events also fire on failures. Do not invent automatic CSP/X-Frame-Options detection. Never redirect, reload or unmount the Studio on a timer while someone may be editing a prompt or viewing a job.
8. Keep the primary AI Shop portal at /shop. Route /chess/shop to that same page, and ensure the platform centre and /portal/enchanted-ai-shop cannot return the user to the legacy brief exporter. Leave the other four worlds and GAME/MAKE tools intact.

## Mobile acceptance

The first useful content must be the launch controls, not a giant empty model placeholder. Use scoped CSS, sensible responsive frame heights, wrapping links, a readable heading and touch targets at least 44 CSS pixels high. Do not reuse the global .webgl-fallback class: its absolute positioning previously covered the entire page. No full-page fixed/absolute overlay, negative stacking trick, or hidden fallback link is acceptable.

## Safety and truth boundaries

Opening WORLDIFACT /shop must not issue a paid POST, call /api/blueprint or /api/oracle/jobs, clear or replace saved jobs, fetch model files, export JSON, automatically download files, change server secrets, raise a generation ceiling or re-arm a cost pilot. Do not change Oracle, Blender or the hosted generator's code/settings.

The original Studio's account permissions, API costs and limits continue to apply when a user explicitly generates there. WORLDIFACT pilot limits are a different system. Say EXTERNAL TOOL and owner-reported working until stronger live evidence exists. Do not claim verified new generation, a public no-login backend, competition eligibility, manufacturing readiness or an official OpenAI mascot from screenshots or HTTP success alone.

## Tests and evidence

Run npm run verify and npm run deploy:check. Add meaningful regression tests against the rendered Shop component: exact iframe destination, both direct links before the iframe, five-world navigation, visible sign-in help, absence of the legacy exporter/placeholder, no native generation request or auto-download, and no viewport-covering CSS. Check the exact current route rather than an unused old component.

Add a read-only public HTTP probe with bounded timeouts, no credentials and manual redirects. Unit-test that it cannot send POSTs or follow authentication links. Log only safe status fields; never cookies, redirect tokens or private response bodies. A 200 response is HTTP evidence only.

Respect recorded browser/access restrictions. Node server-render tests and HTTP probes are not Android, WebGL, authenticated Studio or successful generation evidence. Label unavailable checks UNKNOWN or BLOCKED instead of converting them to PASS.

## Release and handoff

Update docs/CONTEST_STATUS.md and the PR description with the revised external-integration decision, exact URL, tests, limitations and pending device checks. Obtain green CI on the final head. The user has requested execution and publication of this integration; do not ask them again to perform already-authorized terminal work. Do not expand that authorization to new API spending or contest submission.

Merge only the reviewed final SHA, then follow the existing Cloudflare release workflow to completion. Verify its public HTML/assets smoke result. Do not edit or trigger old paid-pilot marker files. A normal disabled-cost release must remain disabled; the hosted Froge app continues to use its own configuration.

Report the actual PR, merge SHA, deployment outcome and integration link. Clearly separate the completed WORLDIFACT integration from the original Studio's sign-in, embedding availability and model-generation quality. Do not say Codex or Copilot executed this task unless a real agent task was actually launched and its result observed.
