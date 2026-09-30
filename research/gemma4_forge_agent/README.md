# WORLDIFACT Forge Agent — research starter

**Status: DEMO tooling. No Gemma inference, training, autonomous patching, Kaggle
baseline, registration or submission has been performed.** This isolated Python
package is not connected to the WORLDIFACT website, billing, Oracle, or production
credentials. It is the first evaluation tool for the proposed developer agent,
not the competition solution itself.

## Run now (Python 3.10+, standard library only)

From the repository root:

```sh
python3 -m unittest discover -s research/gemma4_forge_agent -p 'test_*.py' -v
python3 research/gemma4_forge_agent/preflight.py /path/to/model.glb
```

The CLI reads a local regular file, outputs JSON, and never modifies the input.
Exit codes: `0` = `PASS_PARTIAL_CHECKS`, `1` = `FAIL_PARTIAL_CHECKS`,
`2` = `UNSUPPORTED_PROFILE`. JSON includes SHA-256, observed byte count and a stable
error code, without reproducing asset JSON, paths, prompts or credentials.

### What v0.1 checks

- GLB 2 header, exact download length, chunk ordering/alignment/bounds, bounded
  UTF-8 JSON, duplicate keys, non-finite numbers and declared asset version.
- A single embedded binary buffer, its declared size and zero padding, and basic
  buffer-view bounds and embedded image declarations.
- A conservative self-contained profile: URI resources (including data URIs),
  declared extensions and unknown chunk types are not evaluated. No URI is ever
  opened. An unsupported profile can still be a valid glTF asset.
- File limit: 100 MiB; JSON chunk limit: 1 MiB. These are local screening policies,
  **not Kaggle requirements**. Only regular files are read; direct symlinks are
  rejected. No packages, model weights, shell commands or network are launched.

### What passing does NOT mean

This is **not** the Khronos glTF Validator. Accessor contents, mesh topology,
scene reachability, image decoding, complete material links, appearance,
animation, Blender/FBX round trips and manufacturability are not validated.
An empty but valid GLB container can pass and reports zero mesh declarations.
A malformed mesh can pass the partial checks. Never use this tool alone to mark
a customer deliverable as complete, detailed, renderable or MAKE-approved.

The 34 unit tests use original, synthetic fixtures (including one triangle).
They demonstrate tool behavior, not real model quality or agent performance.
Fixtures and source follow the repository MIT license. No private assets or
competition training/evaluation data are included.

## Experiment order

1. Confirm current rules, eligible model/checkpoint, permitted data, hardware,
   runtime/network restrictions and output format. Record the official source
   revision and verify account enrollment. Do not guess these settings.
2. Reproduce the organizer's untouched baseline on authorized resources. Save
   code/config/model/data hashes, environment, complete logs and measured score.
3. Evaluate small, licensed post-training experiments against that baseline.
   Keep training and held-out tasks separate. Record every attempt, including
   failures, runtime, compute and cost per successfully resolved task.
4. Separately evaluate WORLDIFACT Python/Blender repair tasks. Use this preflight
   as one check, then full format validation, reopen/render and human review.
   Do not call internal export checks a Kaggle score.

Model-generated code must only run later in a reviewed, disposable sandbox with
no production credentials, no network, resource/time limits and an immutable
test oracle. This package is a read-only checker, **not that sandbox**. No automatic
merge, deployment, paid compute or contest submission is authorized here.

See [competition status](../../docs/GEMMA4_DEVELOPER_AGENT.md) and
[experiment configuration](experiment.json).

## Sources

- [Official competition](https://www.kaggle.com/competitions/gemma-4-developer-agent)
- [Rules](https://www.kaggle.com/competitions/gemma-4-developer-agent/rules)
- [Organizer starter](https://www.kaggle.com/code/ryanholbrook/getting-started-gemma-4-developer-agent)
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification)
