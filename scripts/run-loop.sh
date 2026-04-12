#!/usr/bin/env bash
# scripts/run-loop.sh
# Full builder+reviewer automation loop.
# Claude Code (backed by GLM via z.ai) runs both roles headlessly.
#
# Usage:
#   bash scripts/run-loop.sh
#   bash scripts/run-loop.sh 5   # stop after N cycles

MAX_CYCLES=${1:-999}
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

log() {
    local color=$2
    local ts
    ts=$(date +"%H:%M:%S")
    case $color in
        green)  printf "\033[32m[%s] %s\033[0m\n" "$ts" "$1" ;;
        yellow) printf "\033[33m[%s] %s\033[0m\n" "$ts" "$1" ;;
        red)    printf "\033[31m[%s] %s\033[0m\n" "$ts" "$1" ;;
        cyan)   printf "\033[36m[%s] %s\033[0m\n" "$ts" "$1" ;;
        gray)   printf "\033[90m[%s] %s\033[0m\n" "$ts" "$1" ;;
        *)      printf "[%s] %s\n" "$ts" "$1" ;;
    esac
}

has_incomplete_tasks() {
    grep -q '\- \[ \]' tasks/TASKS.md
}

if ! command -v claude &>/dev/null; then
    log "ERROR: 'claude' not found. Run: npm install -g @anthropic-ai/claude-code" red
    exit 1
fi

log "Builder+Reviewer loop starting (GLM via Claude Code)" cyan
log "Repo: $REPO" gray
log "Press Ctrl+C to stop." gray
echo ""

cycle=0

while [ "$cycle" -lt "$MAX_CYCLES" ]; do

    if ! has_incomplete_tasks; then
        log "All tasks complete. Loop done." green
        break
    fi

    cycle=$((cycle + 1))
    printf '%0.s=' {1..50}; echo ""
    log "Cycle $cycle - Builder starting..." green

    before=$(git rev-parse HEAD)

    claude -p "Builder role. Work on next task." --cwd "$REPO"
    exit_code=$?

    if [ "$exit_code" -ne 0 ]; then
        log "Builder exited with error ($exit_code). Stopping." red
        break
    fi

    after=$(git rev-parse HEAD)

    if [ "$after" = "$before" ]; then
        log "Builder ran but made no commit. Stopping - check output above." yellow
        break
    fi

    log "Builder committed: $(git log -1 --pretty='%s')" green
    echo ""

    log "Cycle $cycle - Reviewer starting..." cyan

    claude -p "Reviewer role. Check the latest commit." --cwd "$REPO"
    exit_code=$?

    if [ "$exit_code" -ne 0 ]; then
        log "Reviewer exited with error ($exit_code). Continuing anyway." yellow
    fi

    review_msg=$(git log -1 --pretty='%s')
    if echo "$review_msg" | grep -q "^fix:"; then
        log "Reviewer found issues - fixed: $review_msg" yellow
    else
        log "Reviewer: LGTM" green
    fi

    echo ""
done

log "Loop finished after $cycle cycle(s)." cyan
