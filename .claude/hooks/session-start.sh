#!/bin/bash
# SessionStart hook — install dependencies so lint/build work in
# Claude Code on the web sessions. Synchronous: the session waits until deps
# are ready, avoiding races where tooling runs before install completes.
set -euo pipefail

# Only needed in the remote (web) environment; local devs already have deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Prefer `npm install` over `npm ci` so the cached container state is reused
# across sessions. Idempotent and non-interactive.
npm install --no-audit --no-fund
