#!/bin/bash
# Mac: double-click to start the Huh? bridge (uses your login shell so codex / claude / cursor-agent are on PATH)
cd "$(dirname "$0")"
exec "${SHELL:-/bin/zsh}" -lc 'if ! command -v node >/dev/null; then echo "需要先安装 Node.js 18+：https://nodejs.org"; read -n1; exit 1; fi; node huh-bridge.mjs'
