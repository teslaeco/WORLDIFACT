# Prompt-adjacent model controls — release candidate

Owner-requested UI corrections on 28 September 2026.

## Prepared and tested source

Final preparation run: https://github.com/teslaeco/WORLDIFACT/actions/runs/36472828586
Job: `109099078856`, success. It applied one exact reviewed wrapper edit, passed the full application verification and Worker deployment dry-run, and committed only `src/pages/ShopPage.tsx` as `2e3843f66367edd2240b2f2c17b084e9e4f92eaa`.

The visible sequence is now: AI model dropdown, compact point-cost notice, prompt input. Advanced internal selectors remain hidden rather than separating the model selector from the prompt. Optional model/billing explanations are collapsed under a details element; essential cost, remaining points and blocked-state messages remain visible. The light-on-dark text contrast is checked numerically. This is code/SSR validation, not a screenshot of a real Android session.

The source also replaces the unrelated keyword-based live preview with a GLB generated from the actual returned blueprint. It preserves the explicitly separate local DEMO mode and makes no claim of a detailed Oracle mesh or validated manufacturing output.

## Actual paid test outcome

The one-off authorized backend test ran once in run36471162273. Astra failed with `max_output_tokens`, independently confirmed by GET of the existing job only. The SOL test did not produce a confirmed export; the offline Node texture-export path reports `document is not defined`. No additional paid generation or replacement Oracle job was requested. The approved USD2.10 cap is not an exact billed-cost measurement.

NO-GO for new Pro/Studio purchases. The installed Astra cost guard remains, `ENABLE_ASTRA_PLANS=false` is unchanged, and existing Creator/top-up billing is not repriced. No user points were debited by the isolated owner test. Follow-up issue: https://github.com/teslaeco/WORLDIFACT/issues/140 .

## Final gate

This documentation-only commit requests normal exact-head PR checks over the complete final tree. Merge and production deployment are still pending at the time this file was written. After a successful deployment, record the actual run and result in docs/CONTEST_STATUS.md. Never present a failed paid test as a green release gate.
