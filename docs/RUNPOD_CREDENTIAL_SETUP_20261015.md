# WORLDIFACT RunPod credentials: safe setup (2026-10-15)

Status: **STAGED in draft PR #305; no secret provisioned or GPU rented by this PR.**

## Step 1 — create a RunPod API key

Go to the **RunPod console**, not the documentation:

https://console.runpod.io/user/credentials

Open **API Keys** → **Create API Key**. Use the name
`WORLDIFACT-GITHUB`.

Start with **Read Only**, or a **Restricted** key limited to reading
Serverless endpoints if your account allows that scope. Do not use broad
**All** permissions for a connectivity test. The test only makes GET requests.
RunPod displays the generated key once. Save it in your password manager;
never post it in a chat, screenshot, issue, commit or log.

This is **not** an S3 key, SSH key, container-registry credential or
RunPod Secrets entry.

Official source: https://docs.runpod.io/get-started/credentials

## Step 2 — store the key in GitHub

Repository: `teslaeco/WORLDIFACT`. Open
https://github.com/teslaeco/WORLDIFACT/settings/environments

Create environment **`runpod-staging`**. Prefer required reviewer approval
and restrict deployment branches to `main` where account settings permit.
Inside the environment select **Environment secrets → Add secret**.

- Name: `RUNPOD_API_KEY`
- Value: the RunPod key copied directly in the browser
- Save secret; do not display or paste its value in GitHub comments.

Official GitHub guide:
https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets

The ChatGPT GitHub connector used here does **not** support direct GitHub
environment administration/secrets. Only the owner can finish these steps.
We cannot verify whether a secret exists from a screenshot of the docs.

## Step 3 — protected read-only validation

The repository contains `.github/workflows/runpod-staging-readonly.yml`.
It is intentionally **manual-only** (`workflow_dispatch`) and uses the
`runpod-staging` environment. It performs **one GET** against the fixed
RunPod REST v2 `/endpoints` API using `secrets.RUNPOD_API_KEY`.

It does not reveal the key or provider body, create a GPU, upload images,
create endpoints, buy volumes, submit inference or trigger billing.

**GitHub only makes a new workflow-dispatch action available after the workflow
is present on the default branch.** PR #305 is a draft and remains unmerged;
the manual check is **PREPARED / NOT EXECUTED** until a separately approved
merge. Do not work around an approval by temporarily leaking a key into a PR
workflow. After the reviewed merge, use **Actions → RunPod staging —
read-only account connection check → Run workflow**, approve the environment
if prompted, and inspect the sanitized success/failure message.

Official RunPod REST v2 overview:
https://www.runpod.io/blog/runpods-rest-api-v2-is-here-one-api-for-your-entire-gpu-stack

## What comes later (not required today)

The Serverless endpoint ID is **not an API key**; after a safe, explicitly
approved resource provisioning step, place the nonsecret ID in server-side
configuration as `RUNPOD_ENDPOINT_ID`.

The GitHub environment key is for controlled deployment/verification jobs.
The production Cloudflare Worker needs its **own runtime secret**, authorized
and installed only in a later activation step; a GitHub secret does not
automatically appear in Cloudflare. RunPod GPU workers need separately
scoped **private object storage credentials** for source images, model
checkpoints and export artifacts. Do not use a personally privileged API
key for browser code or embed it in a Docker image.

Next release gates include audited container image, licensed model weights,
serverless endpoint configuration with Active workers 0 / Max workers 1,
actual cost/availability check, secure private S3 storage, account scope,
cost reservations, end-to-end original-image GPU test, visual QA, GAME
download checks and independent MAKE validation.

**No current claim of LIVE GPU, real new ECOMECH or production deployment.**
