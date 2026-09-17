#!/usr/bin/env bash
set -euo pipefail
# Read the remote ref without fetching depth=1, which can mark this checkout's
# HEAD as a shallow root and destroy the ability to compare its first parent.
head=$(git rev-parse HEAD)
remote_line=$(git ls-remote --exit-code origin refs/heads/main)
remote=${remote_line%%$'\t'*}
if [[ ! "$remote" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Invalid remote main response; generation activation remains blocked.' >&2
  exit 1
fi
if [[ "$head" != "$remote" ]]; then
  echo false
  exit 0
fi
if [[ "${1:-marker}" == 'current' ]]; then
  echo true
  exit 0
fi
# An unreadable parent is an error, NOT a successful no-op. Keep this command
# outside an if/pipeline so an actual history failure stops the workflow.
git rev-parse --verify HEAD^1 >/dev/null
changes=$(git diff --name-only HEAD^1 HEAD --)
if grep -Fxq 'ops/STUDIO_RESUME_ORIGINAL_SIX_20260917' <<< "$changes"; then
  echo true
else
  echo false
fi
