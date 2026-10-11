# Supervised execution completion proposal

Status: LOCAL, NOT INSTALLED. No provider request, service restart, deployment,
account mutation or historical job continuation has been performed.

The owner reconnected Oracle Cloud Shell using Node 22 on 11 October 2026.
The existing SSH key and strict known-host entry reached the original generator.
The worker and tunnel services were active. Authenticated loopback health
confirmed Astra, connector 33 and the existing completion/context/construction
attestations. No credential value was copied into this repository.

The newest observed failed text job recorded five Astra requests, no failed
MCP calls, zero Blender builds, and WORLDIFACT_MODEL_INCOMPLETE after 25.52
seconds, all attributed to AI. The supervised CLI ended twice after contract
reads without building. Stored events omit assistant text, so the model's
specific explanation is unavailable. The separate screenshot photo-job UUID
had no Oracle database row; this does not establish zero cost or prove why its
submission disappeared. Private job IDs and original inputs are not published.

## Proposed execution change

`require_tools.transform` is a pure transformation of the exact installed
`codex_runner.py` SHA-256
`f3c9ce7ebcb629a823af0324c00a97bda35b63a99f15ff0804b6ea641c32c0bb`.
For explicit supervised WORLDIFACT completion profiles, it sets Responses
`tool_choice` to `required` before the existing cost guard admits the payload.
The existing terminal finish_model check runs before any further provider call.
Ordinary, FAST and typed construction behavior remains outside this change.
Model, reasoning effort, service tier, original inputs/images, tool definitions,
request/time/build ceilings and the USD 1.75 spend guard are preserved.

This prevents an optional text-only final answer from being the requested API
behavior while a supervised model remains unfinished. It does not force a
particular modeling tool, guarantee progress/quality, weaken refusal handling,
turn a candidate into an accepted model, or permit retries after provider errors.
The model could still spend its original allowance without finishing. No new
job is created by this transform. It must not be applied directly to live source:
the existing nested source receipts would correctly fail validation.

Official API contract checked on 11 October:
https://developers.openai.com/api/docs/guides/function-calling#tool-choice

## Proposed submission lifetime change

The Worker forwards its actual context to Studio. Only after full input
validation, admission and the one-use dispatch fence does Studio retain the
same submission/receipt-handling promise through `context.waitUntil`. The HTTP
handler still awaits that promise and returns its actual outcome. No retry,
queue consumer, new receipt or additional reservation is added. Rejected and
recovered submissions register no new background dispatch.

Oracle's existing submission timeout is 25 seconds. Cloudflare permits at most
30 seconds after disconnection; this is bounded protection for transmission and
acceptance handling, not a durable-delivery guarantee or background Blender
execution. Validation reads and admission before dispatch are not protected by
this new promise. This is a concrete missing lifecycle protection, not proof
that disconnection caused the reported photo-job incident.

https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil

## Validation and remaining gates

```sh
WORLDIFACT_REVIEWED_RUNNER=/path/to/verified/codex_runner.py \
  python3 -B -m unittest discover -s tools/model_execution -p 'test_*.py' -v
node --test tests/studio-api.test.ts
```

Eight execution tests pass against the exact observed Gateway handler AST.
Only provider I/O and spend operations are inert fixtures. Coverage includes
required tool execution before spending, intact input images/additional tools,
unchanged ordinary/FAST selection, terminal completion, cancellation, uncertain
usage, exhausted limits, cost refusal, incomplete-response no-retry, and missing
exec refusal. Twelve Studio transport tests pass, including one retained
submission, original context receiver, refusal, concurrent recovery and complete
four-photo payload preservation. These are not a live model or an actual phone
disconnect test. Missing reviewed source fails the Python gate explicitly.

Full local verification after integration with PR #262: lint and TypeScript passed; 2211 of 2213 application
tests passed. Two native Chromium tests failed because the executable is absent.
The separate real HTTP smoke, production build and Worker dry-run passed. The
dry-run is packaging validation only and its default variables must not be used
as production configuration. `ops/STUDIO_EXECUTION_RELEASE_20261011.json` pins
the exact parent and reviewed file set for the existing preserving release path.
It cannot install Oracle source or perform financial reconciliation. The owner
authorized publication and merge on 11 October at 21:42 Europe/Amsterdam.
The earlier remote budget-read request stopped responding. After reconnection,
fresh read-only SSH succeeded at 19:31 UTC. Both original user services were
active and the Oracle job database had no nonterminal jobs. The latest failed
text job's five recorded responses total 687,795 micro-USD in the conservative
provider ledger; an earlier failed job totals 1,183,701 micro-USD across nine
recorded responses (its usage counter reports ten requests, including the
refused request). These are provider upper-cost accounting, not invoice amounts
or user point settlement. The screenshot photo-job ID has neither a database
row, a job directory nor its path-derived ledger file. None proves zero cost.
The inspected incident journal window has no entries, so submission failure
still lacks transport evidence. Supabase discovery confirms the configured
authentication project; its public tables do not contain the Worker point
ledger. The 1,500 held points still require an authenticated account ledger read.

## Reference-profile word boundary correction

A reproduced classifier defect treated `man` inside `many`, `command`,
`manufacturing` and `German` as a character request. With a reference and the
Shop's default figurine purpose, an ordinary object then acquired full-body
anatomy instructions and the character structural gate. Character hints now
require Unicode word boundaries while retaining actual English character nouns
and Polish inflections. The original prompt and photo bytes are preserved.
This corrects a demonstrated defect; it does not establish that it caused the
specific screenshot failure. Text-only profile selection remains unchanged.
The focused profile/envelope tests pass (8/8), including non-character objects,
actual characters and complete bounded multi-photo payloads.

Required before Oracle installation: complete idle-only transactional installer,
all affected source/receipt binding updates, rollback, actual isolated
Codex/MCP/Blender offline gates, then source review and applicable maintenance
approval. Worker publication uses the preserving deployment scope and the
owner's explicit approval; hosted CI must still pass.
A paid acceptance test is separate, with at most the original USD 1.75 for one
explicitly approved job and no automatic repeat. Sol/Luna detailed modeling,
six model/mode combinations, full account persistence and point reconciliation
remain unfinished. No one-minute acceptance is claimed.
