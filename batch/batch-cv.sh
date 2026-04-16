#!/usr/bin/env bash
set -euo pipefail

# career-ops batch CV generator — process selected jobs from data/jobs.tsv
# Reads jobs.tsv, filters to selected=yes + cv_status empty/pending,
# delegates each to a claude -p worker for A-G evaluation + PDF generation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BATCH_DIR="$SCRIPT_DIR"
JOBS_FILE="$PROJECT_DIR/data/jobs.tsv"
PROMPT_FILE="$BATCH_DIR/batch-prompt.md"
LOGS_DIR="$BATCH_DIR/logs"
TRACKER_DIR="$BATCH_DIR/tracker-additions"
REPORTS_DIR="$PROJECT_DIR/reports"
LOCK_FILE="$BATCH_DIR/batch-cv.pid"
MAIN_PID="${BASHPID:-$$}"

# Defaults
PARALLEL=1
DRY_RUN=false
RETRY_FAILED=false
LIMIT=0

usage() {
  cat <<'USAGE'
career-ops batch CV generator — generate tailored CVs for selected jobs
Default model: Sonnet 4.5 (override with CLAUDE_MODEL env var).

Usage: batch-cv.sh [OPTIONS]

Options:
  --parallel N         Number of parallel workers (default: 1)
  --dry-run            Show what would be processed, don't execute
  --retry-failed       Only retry jobs with cv_status=failed
  --limit N            Process at most N selected jobs (cost control)
  -h, --help           Show this help

Files:
  data/jobs.tsv        Source of jobs (select via dashboard or edit directly)
  batch-prompt.md      Prompt template for workers
  logs/                Per-job logs
  tracker-additions/   Tracker lines for post-batch merge
USAGE
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --parallel) PARALLEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --limit) LIMIT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Lock file
acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local old_pid
    old_pid=$(cat "$LOCK_FILE")
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "ERROR: Another batch-cv is already running (PID $old_pid)"
      exit 1
    else
      rm -f "$LOCK_FILE"
    fi
  fi
  echo "$MAIN_PID" > "$LOCK_FILE"
}

release_lock() {
  if [[ "${BASHPID:-$$}" != "$MAIN_PID" ]]; then return; fi
  rm -f "$LOCK_FILE"
}
trap release_lock EXIT

check_prerequisites() {
  if [[ ! -f "$JOBS_FILE" ]]; then
    echo "ERROR: $JOBS_FILE not found. Run migration first."
    exit 1
  fi
  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: $PROMPT_FILE not found."
    exit 1
  fi
  if ! command -v claude &>/dev/null; then
    echo "ERROR: 'claude' CLI not found in PATH."
    exit 1
  fi
  mkdir -p "$LOGS_DIR" "$TRACKER_DIR" "$REPORTS_DIR"
}

# Calculate next report number from existing reports
next_report_num() {
  local max_num=0
  if [[ -d "$REPORTS_DIR" ]]; then
    for f in "$REPORTS_DIR"/*.md; do
      [[ -f "$f" ]] || continue
      local basename
      basename=$(basename "$f")
      local num="${basename%%-*}"
      num=$((10#$num))
      if (( num > max_num )); then max_num=$num; fi
    done
  fi
  printf '%03d' $((max_num + 1))
}

# Update cv_status in jobs.tsv for a given URL
update_job_status() {
  local url="$1" cv_status="$2" cv_date="$3" notes="$4"
  local tmp="$JOBS_FILE.tmp"

  head -1 "$JOBS_FILE" > "$tmp"
  while IFS=$'\t' read -r jurl jcomp jrole jsrc jscan jlive jsel jcvs jcvd jnotes; do
    [[ "$jurl" == "url" ]] && continue
    if [[ "$jurl" == "$url" ]]; then
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$jurl" "$jcomp" "$jrole" "$jsrc" "$jscan" "$jlive" "$jsel" "$cv_status" "$cv_date" "$notes" >> "$tmp"
    else
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$jurl" "$jcomp" "$jrole" "$jsrc" "$jscan" "$jlive" "$jsel" "$jcvs" "$jcvd" "$jnotes" >> "$tmp"
    fi
  done < "$JOBS_FILE"
  mv "$tmp" "$JOBS_FILE"
}

# Process a single job
process_job() {
  local url="$1" company="$2" role="$3" report_num="$4"

  local date
  date=$(date +%Y-%m-%d)
  local started_at
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  echo "--- Processing: $company | $role (report $report_num)"
  echo "    URL: $url"

  update_job_status "$url" "generating" "" ""

  # Build prompt
  local prompt="Procesa esta oferta de empleo. Ejecuta el pipeline completo: evaluación A-F + report .md + PDF + tracker line."
  prompt="$prompt URL: $url"
  prompt="$prompt Report number: $report_num"
  prompt="$prompt Date: $date"

  local log_file="$LOGS_DIR/${report_num}-cv.log"

  # Resolve prompt template
  local resolved_prompt="$BATCH_DIR/.resolved-prompt-${report_num}.md"
  local esc_url="${url//\\/\\\\}"
  esc_url="${esc_url//|/\\|}"
  local esc_report_num="${report_num//|/\\|}"
  local esc_date="${date//|/\\|}"
  sed \
    -e "s|{{URL}}|${esc_url}|g" \
    -e "s|{{REPORT_NUM}}|${esc_report_num}|g" \
    -e "s|{{DATE}}|${esc_date}|g" \
    -e "s|{{ID}}|${report_num}|g" \
    -e "s|{{JD_FILE}}|/tmp/batch-jd-${report_num}.txt|g" \
    "$PROMPT_FILE" > "$resolved_prompt"

  local model="${CLAUDE_MODEL:-claude-sonnet-4-5}"
  local exit_code=0

  claude -p \
    --model "$model" \
    --dangerously-skip-permissions \
    --append-system-prompt-file "$resolved_prompt" \
    -- "$prompt" \
    > "$log_file" 2>&1 || exit_code=$?

  rm -f "$resolved_prompt"

  local completed_at
  completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [[ $exit_code -eq 0 ]]; then
    local score="-"
    local score_match
    score_match=$(sed -nE 's/.*"score":[[:space:]]*([0-9.]+).*/\1/p' "$log_file" 2>/dev/null | head -1 || true)
    if [[ -n "$score_match" ]]; then score="$score_match"; fi

    update_job_status "$url" "done" "$(date +%Y-%m-%d)" "report:$report_num score:$score"
    echo "    ✅ Completed (score: $score, report: $report_num)"
  else
    local error_msg
    error_msg=$(tail -5 "$log_file" 2>/dev/null | tr '\n' ' ' | cut -c1-200 || echo "exit code $exit_code")
    update_job_status "$url" "failed" "" "error: $error_msg"
    echo "    ❌ Failed (exit code $exit_code)"
  fi
}

# Main
main() {
  check_prerequisites

  if [[ "$DRY_RUN" == "false" ]]; then
    acquire_lock
  fi

  # Build list of jobs to process from jobs.tsv
  local -a pending_urls=()
  local -a pending_companies=()
  local -a pending_roles=()

  while IFS=$'\t' read -r url company role source scan_date liveness selected cv_status cv_date notes; do
    [[ "$url" == "url" ]] && continue  # skip header
    [[ -z "$url" ]] && continue

    if [[ "$RETRY_FAILED" == "true" ]]; then
      [[ "$cv_status" != "failed" ]] && continue
    else
      # Only process selected jobs with empty/pending cv_status
      [[ "$selected" != "yes" ]] && continue
      [[ "$cv_status" == "done" || "$cv_status" == "generating" ]] && continue
    fi

    pending_urls+=("$url")
    pending_companies+=("$company")
    pending_roles+=("$role")

    if (( LIMIT > 0 && ${#pending_urls[@]} >= LIMIT )); then
      break
    fi
  done < "$JOBS_FILE"

  local pending_count=${#pending_urls[@]}

  if (( pending_count == 0 )); then
    echo "No jobs to process. Select jobs in the dashboard first (selected=yes in jobs.tsv)."
    exit 0
  fi

  echo "=== career-ops batch CV generator ==="
  echo "Parallel: $PARALLEL | Jobs: $pending_count"
  if (( LIMIT > 0 )); then echo "Limit: $LIMIT"; fi
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "=== DRY RUN ==="
    for i in "${!pending_urls[@]}"; do
      echo "  ${pending_companies[$i]} | ${pending_roles[$i]} | ${pending_urls[$i]}"
    done
    echo ""
    echo "Would process $pending_count jobs"
    exit 0
  fi

  # Process jobs
  if (( PARALLEL <= 1 )); then
    for i in "${!pending_urls[@]}"; do
      local report_num
      report_num=$(next_report_num)
      process_job "${pending_urls[$i]}" "${pending_companies[$i]}" "${pending_roles[$i]}" "$report_num"
    done
  else
    local running=0
    local -a pids=()

    for i in "${!pending_urls[@]}"; do
      while (( running >= PARALLEL )); do
        for j in "${!pids[@]}"; do
          if ! kill -0 "${pids[$j]}" 2>/dev/null; then
            wait "${pids[$j]}" 2>/dev/null || true
            unset 'pids[j]'
            running=$((running - 1))
          fi
        done
        pids=("${pids[@]}")
        sleep 1
      done

      local report_num
      report_num=$(next_report_num)
      process_job "${pending_urls[$i]}" "${pending_companies[$i]}" "${pending_roles[$i]}" "$report_num" &
      pids+=($!)
      running=$((running + 1))
    done

    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi

  # Merge tracker additions
  echo ""
  echo "=== Merging tracker additions ==="
  node "$PROJECT_DIR/merge-tracker.mjs"

  # Summary
  echo ""
  echo "=== Batch CV Summary ==="
  echo "Processed: $pending_count jobs"
}

main "$@"
