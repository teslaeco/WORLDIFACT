# Gemma 4 Developer Agent — WORLDIFACT research entry preparation

Verified/reviewed on 30 September 2026. **Preparation is not enrollment or a
submission.** The owner approved starting this work. No new paid training,
production change, rule acceptance or final submission was performed.

## Evidence and open gates

| Item | Status | Evidence / limitation |
| --- | --- | --- |
| Competition identity | VERIFIED | [Official Kaggle page](https://www.kaggle.com/competitions/gemma-4-developer-agent); its public title is readable. |
| Post-train Gemma for autonomous software engineering | VERIFIED | Organizer launch notice dated 24 September 2026, reviewed privately; no private message is included. This is a coding-agent task, not a 3D art contest. |
| Full rules / eligibility / existing-code and external-data permissions | UNKNOWN | [Rules](https://www.kaggle.com/competitions/gemma-4-developer-agent/rules) did not expose body text to the available reader. Do not infer requirements from earlier competitions. |
| Authoritative entry and final-submission deadlines | UNKNOWN / CONFLICT | Kaggle search indexing reports entry deadline 25 Nov 2026. The [Google Gemma announcement](https://x.com/googlegemma/status/2104619611417391289) search excerpt reports 2 Nov 2026. The [timeline](https://www.kaggle.com/competitions/gemma-4-developer-agent/overview/timeline) body was unavailable. Neither date is treated as the verified final submission deadline. |
| Prize total | UNKNOWN / CONFLICT | Kaggle indexing reports USD 100,000; the Google Gemma announcement reports over USD 110,000. No prize income is budgeted. |
| Exact eligible checkpoint, training restrictions, hardware quota, submission format | UNKNOWN | [Organizer starter](https://www.kaggle.com/code/ryanholbrook/getting-started-gemma-4-developer-agent) identified, but full notebook and current rules not retrieved. No guessed model path or GPU allocation. |
| Account enrollment / accepted rules | UNKNOWN | No authenticated Kaggle action was available; plugin search returned no Kaggle connector. |
| Local Forge preflight tooling | VERIFIED | Read-only Python GLB partial screening and 34 synthetic unit tests pass locally. This is not a model baseline. |
| Gemma inference, fine-tuning, official baseline score | MISSING | Zero model calls and zero training runs. No Kaggle score claimed. |
| Production integration / final submission | BLOCKED | Separate evidence and explicit owner approval required. |

The earlier 18 September Product Hunt plan belongs to a different, past event.
Do not reuse its deadline, product-listing requirements or model rules for Kaggle.

## Proposed entry (RECOMMENDATION, not a verified judging criterion)

**WORLDIFACT Forge Agent**: post-train a coding agent and evaluate its ability to
navigate a repository, propose a patch, and verify the result. Maintain two
separate evaluations: the organizer's software-engineering benchmark and
WORLDIFACT-specific Python/Blender export-repair cases. The current contribution
is only one read-only evaluation tool for the second evaluation.

The product objective is fewer unusable exports and fewer failed paid attempts.
Savings, autonomy and improved visual quality must be measured, not advertised
in advance. Do not replace the working production model or enable Oracle jobs.

## Milestone M0 — completed locally, proposed on a research branch

Added `research/gemma4_forge_agent`: dependency-free partial GLB screening,
original synthetic fixtures, 34 tests, explicit non-approval statuses,
SHA-256/JSON evidence and a no-spend experiment configuration. The new CPU-only
PR workflow runs only these tools; it accesses no production secrets and never
trains or deploys. Existing WORLDIFACT CI remains unchanged.

Local command: `python3 -m unittest discover -s research/gemma4_forge_agent -p 'test_*.py' -v`.
Result: 34 tests passed, zero failed/skipped. Full repository npm verification is
not claimed from this local environment: Git transport failed on DNS resolution.
Exact-head GitHub workflow outcomes must be checked independently after PR creation.

## Next gates

1. Enroll using the owner's authenticated Kaggle session after reading the current
   rules. Capture the authoritative rules/timeline and clarify the date conflict.
2. Obtain the permitted organizer data and original notebook. Record hashes and
   permissions; reproduce a baseline on resources whose availability is confirmed.
3. Only after baseline evidence and an approved compute budget: small post-training
   experiment with strict train/validation separation and complete run logs.
4. Add full glTF validation, Blender reopen/render, texture checks and a reviewed
   disposable execution sandbox before evaluating generated fixes on our exports.
5. Human review before public claims, merge, deployment, or contest submission.

**GO:** isolated, no-spend preparation. **NO-GO:** claiming enrollment, a trained
model, a Kaggle result, restored detailed exports, or manufacturing readiness.
