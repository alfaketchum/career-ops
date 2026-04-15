# Batch Processing

Process multiple job offers in parallel via `claude -p` workers. Each worker runs the full evaluation pipeline (A-F report + PDF + tracker line) autonomously.

## Always Be Applying — Two-Pass Workflow

**Philosophy:** Every URL from the scanner will eventually get a full deep evaluation.
The light pass doesn't FILTER — it orders the queue so high-priority jobs are
processed first. You control cost with `--limit N` on the deep pass.

### State: `data/pass-history.tsv` (URL-keyed, persistent)

Single source of truth for what's been processed. Columns:
`url | company | role | light_score | light_at | deep_report | deep_score | deep_at`

- Light pass: skips URLs where `light_score` is set
- Deep pass: skips URLs where `deep_report` is set
- Survives weekly scans, batch resets, anything

Check status any time:
```bash
node pass-history.mjs status
```

### Step 1 — LIGHT pass (Haiku 4.5, priority scoring)

Scores every new URL on 4 dimensions. **No files written** except
`data/pass-history.tsv`. ~20s per offer.

```bash
bash batch/batch-runner.sh --screen --parallel 5
```

Already-light-passed URLs are skipped automatically.

### Step 2 — Sort the queue

Reorder `batch-input.tsv` by light score:

```bash
node batch/sort-queue.mjs
# Already deep-done URLs are pushed to the end
```

### Step 3 — DEEP pass (Sonnet 4.5, full quality + cost cap)

Full A-G evaluation, WebSearch, tailored PDF CV, tracker entry.
Use `--limit N` to cap cost per run.

```bash
# First 20 top-priority URLs
bash batch/batch-runner.sh --parallel 3 --limit 20

# Next 20 tomorrow
bash batch/batch-runner.sh --parallel 3 --limit 20

# Max quality (Opus) on top 5
CLAUDE_MODEL=claude-opus-4-5 bash batch/batch-runner.sh --parallel 2 --limit 5
```

Already-deep-passed URLs are skipped automatically — no duplicate reports.

### Resumability & weekly cron

Run the scanner weekly (Monday cron). New URLs get added to `batch-input.tsv`.
Light-pass them, sort the queue, and resume the deep pass. The history file
ensures nothing is re-evaluated.

**Cost control example (150 URLs over a few days):**
- Light pass all 150 (Haiku): ~$2-3
- Deep pass top 20 today (Sonnet): ~$4-5
- Deep pass next 20 tomorrow: ~$4-5
- ...spread the cost out; stop whenever you want

## Quick Start

1. **Add offers** to `batch-input.tsv` (tab-separated: `id`, `url`, `source`, `notes`):

   ```tsv
   id	url	source	notes
   1	https://jobs.example.com/role-a	LinkedIn	
   2	https://greenhouse.io/company/role-b	Greenhouse	priority
   ```

2. **Dry run** to preview what will be processed:

   ```bash
   ./batch/batch-runner.sh --dry-run
   ```

3. **Run the batch**:

   ```bash
   ./batch/batch-runner.sh
   ```

4. **Results** are automatically merged into `data/applications.md` and verified with `verify-pipeline.mjs` at the end of the run.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--parallel N` | `1` | Number of concurrent `claude -p` workers |
| `--dry-run` | off | Preview pending offers without processing |
| `--retry-failed` | off | Only retry offers marked as `failed` in state |
| `--start-from N` | `0` | Skip offers with ID below N |
| `--max-retries N` | `2` | Max retry attempts per offer before giving up |

## Directory Layout

```
batch/
  batch-runner.sh          # Orchestrator script
  batch-prompt.md          # Prompt template sent to each worker
  batch-input.tsv          # Input offers (you create this)
  batch-state.tsv          # Processing state (auto-managed, resumable)
  logs/                    # Per-offer worker logs ({report_num}-{id}.log)
  tracker-additions/       # TSV lines produced by workers
    merged/                # TSVs already merged into applications.md
```

## How It Works

1. **batch-runner.sh** reads `batch-input.tsv` and `batch-state.tsv` to determine which offers need processing.
2. For each pending offer, it assigns a report number and launches a `claude -p` worker with `batch-prompt.md` as the system prompt (placeholders like `{{URL}}`, `{{REPORT_NUM}}` are resolved).
3. Each worker evaluates the offer, writes a report to `reports/`, generates a PDF to `output/`, and writes a tracker TSV to `tracker-additions/`.
4. After all workers finish, batch-runner calls `merge-tracker.mjs` to merge TSVs into `data/applications.md` and runs `verify-pipeline.mjs` to check integrity.

## Tracker Merge

Workers write one TSV per offer to `batch/tracker-additions/`. The merge script (`npm run merge`) handles:

- Deduplication by company + role fuzzy match and report number
- Column order conversion (TSV has status before score; applications.md has score before status)
- In-place updates when a re-evaluation scores higher than the existing entry
- Moving processed TSVs to `tracker-additions/merged/`

Run `npm run merge` manually if you need to merge outside of a batch run.

## Resumability

`batch-state.tsv` tracks the status of every offer (`pending`, `processing`, `completed`, `failed`). If the batch is interrupted, re-running `batch-runner.sh` picks up where it left off -- completed offers are skipped automatically.

A PID-based lock file (`batch-runner.pid`) prevents concurrent batch runs. If a previous run crashed, the stale lock is detected and removed automatically.

## Prerequisites

- `claude` CLI in PATH (Claude Max subscription for default model)
- Node.js >= 18, Playwright chromium installed (`npm run doctor` to verify)
- `batch-input.tsv` with at least one offer
