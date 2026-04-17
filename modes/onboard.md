# Mode: onboard — Setup, Revisit, Reset

Conversational onboarding that creates and maintains the canonical user files
career-ops depends on: `cv.md`, `config/profile.yml`, `modes/_profile.md`,
`article-digest.md`, `portals.yml`, `data/keywords.json`, and `data/applications.md`.

This mode replaces the inline "First Run -- Onboarding" logic that previously lived
in CLAUDE.md. It is now invokable on demand, idempotent, and step-addressable so
that re-running a single step (or all of them) is a first-class operation.

---

## Why this exists as a skill

1. **On-demand invocation** -- users can re-run onboarding without deleting files.
2. **Step-addressable** -- `/career-ops onboard narrative` re-runs only Step 5
   (the "feed me more info" conversation) without touching the rest.
3. **Single source of truth** -- the same prompt runs in Claude Code (this file)
   and in any commercial backend that wants to embed onboarding via the Anthropic
   API. The `Tool contracts` section below is the boundary.
4. **Auto-trigger preserved** -- session boot still calls onboarding when files
   are missing, but the logic now lives here, not in CLAUDE.md.

---

## Invocation

| Invocation | Behavior |
|---|---|
| `/career-ops onboard` | Full flow. Skips steps whose canonical file already exists; user can opt to re-run any. |
| `/career-ops onboard cv` | Step 1 only -- (re)write `cv.md`. |
| `/career-ops onboard profile` | Step 2 only -- merge into `config/profile.yml`. |
| `/career-ops onboard portals` | Step 3 only -- regenerate `portals.yml` from current keywords + offer to seed `tracked_companies` from template. |
| `/career-ops onboard narrative` | Step 5 only -- the rich "tell me about yourself" conversation that writes to `modes/_profile.md`, the narrative section of `profile.yml`, and `article-digest.md`. |
| `/career-ops onboard keywords` | Step 6 only -- regenerate `data/keywords.json` from CV + profile + digest. |
| `/career-ops onboard reset` | Backup all canonical files into `backup-{YYYY-MM-DD-HHMM}/`, then run the full flow from scratch. Preserves work product (`reports/`, `data/jobs.tsv`, `data/applications.md`, `data/scan-history.tsv`, `interview-prep/`). |
| `/career-ops onboard status` | Print current state of each canonical file (exists / size / last-modified) and exit without prompting. Useful for debugging and for the web dashboard. |

**Auto-trigger semantics (from session boot in CLAUDE.md):** Before any other
career-ops mode runs, check whether `cv.md`, `config/profile.yml`,
`modes/_profile.md`, and `portals.yml` all exist. If any is missing, invoke
`/career-ops onboard` automatically and refuse to proceed with other modes
until onboarding completes.

---

## Canonical files this mode owns

| File | Owner | Created in | Re-runs |
|---|---|---|---|
| `cv.md` | user | Step 1 | `onboard cv` |
| `config/profile.yml` | user | Step 2 | `onboard profile` |
| `portals.yml` | user | Step 3 | `onboard portals` |
| `data/applications.md` | system | Step 4 | (auto, idempotent) |
| `modes/_profile.md` | user | Step 5 | `onboard narrative` |
| `article-digest.md` | user | Step 5 | `onboard narrative` |
| `data/keywords.json` | system | Step 6 | `onboard keywords` |
| `data/.onboarded_at` | system | Step 6 | (timestamp on completion) |

Files this mode **never touches** (work product, accumulated state):
`reports/`, `data/jobs.tsv`, `data/pipeline.md`, `data/scan-history.tsv`,
`data/pass-history.tsv`, `interview-prep/`, `data/follow-ups.md`,
`output/`, `batch/`, `.env`, `.playwright-auth/`.

---

## Tool contracts

These are the abstract operations the onboarding agent invokes. The runtime
binds them to concrete implementations -- this is the seam between skill
logic and runtime (Claude Code uses Read/Write/Bash; a commercial backend
binds to per-user database operations).

### File-state inspection

| Tool | Signature | Behavior |
|---|---|---|
| `read_user_file` | `(path: string) -> { exists: bool, content: string, size: int, mtime: string }` | Read a canonical user file if present. Returns `exists: false` when absent. |
| `file_status` | `() -> { cv: bool, profile: bool, portals: bool, _profile: bool, keywords: bool, digest: bool, applications: bool }` | One-shot status of all canonical files. Used by `onboard status` and the auto-trigger. |

### CV (Step 1)

| Tool | Signature | Behavior |
|---|---|---|
| `write_user_cv` | `(content: string) -> { ok: bool }` | Replace `cv.md` entirely. Caller is responsible for preserving prior content if merging is desired. |

### Profile (Step 2)

| Tool | Signature | Behavior |
|---|---|---|
| `merge_user_profile_basics` | `({ name, email, phone, location, target_roles[], salary_range }) -> { ok, merged: bool }` | Merge basic candidate fields and `target_roles.primary` into `config/profile.yml`. **Must preserve** existing `target_roles.archetypes`, `narrative`, `compensation` fields not provided, and any unknown top-level keys. Implementation: parse YAML → merge → re-emit. |
| `read_user_profile` | `() -> { candidate, target_roles, narrative, compensation, ... }` | Return parsed profile for pre-filling. |

### Narrative (Step 5)

| Tool | Signature | Behavior |
|---|---|---|
| `write_user_profile_narrative` | `({ headline, exit_story, superpowers[], proof_points[] }) -> { ok }` | Update only the `narrative` block of `profile.yml`. Idempotent; full overwrite of that block. |
| `write_user_archetypes` | `(archetypes: [{ name, level, fit, description? }]) -> { ok }` | Replace the archetypes section in `modes/_profile.md`. |
| `write_user_negotiation` | `(content_md: string) -> { ok }` | Update the "Negotiation scripts" section of `modes/_profile.md`. Append-or-replace based on heading match. |
| `write_user_dealbreakers` | `(items: string[]) -> { ok }` | Update the "Deal-breakers" list in `modes/_profile.md`. |
| `append_article_digest` | `(entry: { title, source, claim, metric?, citation }) -> { ok, total_entries: int }` | Append a single proof point to `article-digest.md`. Each entry MUST include a citation (essay filename, URL, or "user-stated"). |
| `read_user_essays` | `() -> [{ filename, content }]` | Read all files in `data/essays/`. Used to distill proof points into `article-digest.md`. |

### Portals (Step 3)

| Tool | Signature | Behavior |
|---|---|---|
| `read_portals_summary` | `() -> { tracked_companies: int, search_queries: int, linkedin_searches: int, exists: bool }` | Counts for the current `portals.yml`. |
| `regenerate_portals` | `() -> { ok, output: string }` | Run `regenerate-portals.mjs`. Rewrites derived sections (`title_filter.positive`, `search_queries`, `linkedin.searches`) from `keywords.json`. Preserves `tracked_companies` and negative filter. |
| `seed_tracked_companies` | `(force?: bool) -> { ok, count: int }` | Run `regenerate-portals.mjs --seed-tracked`. Copies the curated company catalog from `templates/portals.example.yml` into `tracked_companies`. Refuses to overwrite a non-empty list unless `force` is true. |
| `install_default_portals` | `() -> { ok }` | First-time only: copy `templates/portals.example.yml` to `portals.yml` and patch `title_filter.positive` from the user's target roles. |

### Keywords (Step 6)

| Tool | Signature | Behavior |
|---|---|---|
| `regenerate_keywords` | `() -> { ok, keywords: [{ term, source, enabled }], count: int }` | Run `generate-keywords.mjs`. Reads `cv.md` + `config/profile.yml` + `article-digest.md`, produces `data/keywords.json`. Preserves user-toggled state where keys match. |
| `read_keywords` | `() -> { keywords: [...], user_added: [...], generated_at: string }` | Read current `data/keywords.json`. |

### Tracker (Step 4)

| Tool | Signature | Behavior |
|---|---|---|
| `bootstrap_tracker` | `() -> { ok, created: bool }` | Create `data/applications.md` with the standard header if missing. Idempotent -- never overwrites an existing tracker. |

### Reset / lifecycle

| Tool | Signature | Behavior |
|---|---|---|
| `backup_user_files` | `(paths: string[], dest: string) -> { ok, copied: string[] }` | Copy files to a timestamped backup directory. Used by `onboard reset`. |
| `set_onboarded_timestamp` | `() -> { ok }` | Write current ISO timestamp to `data/.onboarded_at`. Marks completion. |
| `read_onboarded_timestamp` | `() -> { exists: bool, timestamp?: string }` | Used by auto-trigger to distinguish "fresh install" from "files were intentionally deleted". |

### Runtime-binding examples

| Runtime | `write_user_cv(content)` binds to | `regenerate_keywords()` binds to |
|---|---|---|
| Claude Code (this skill, today) | `Write({ file_path: 'cv.md', content })` | `Bash('node generate-keywords.mjs')` |
| Anthropic API + Agent SDK (commercial backend) | `db.users.update({ id: userId }, { cv: content })` | `await regenerateKeywordsForUser(userId)` |
| Hosted CLI (BYOK self-host) | identical to Claude Code | identical to Claude Code |

The skill prompt does not know or care which runtime binds the tools. The
contract -- tool name, arguments, return shape, idempotency semantics -- is
what guarantees the same conversation produces the same effect across runtimes.

---

## Hard rules

1. **Never overwrite existing canonical files without an explicit `reset` invocation or user confirmation.** When a file exists and a step would re-create it, ASK first.
2. **Profile, archetypes, narrative, and proof points are MERGED, never replaced.** A re-run of Step 2 must preserve archetypes the user has built up over time. A re-run of Step 5 must append new proof points, not delete old ones.
3. **`portals.yml` is regenerated from `keywords.json` -- not from target roles directly.** This keeps the keyword list as the single source of truth. Re-running portals after changing keywords is the supported flow.
4. **`tracked_companies` is user-curated.** Never modify it except via `seed_tracked_companies` (explicit) or the user's manual edits. `regenerate_portals` must preserve it.
5. **No file may be deleted by this mode.** Reset uses `backup_user_files` to move files into a timestamped folder; it never `rm`s.
6. **Article digest entries must include a citation.** Either an essay filename from `data/essays/`, a URL the user provided, or the literal string `user-stated`. Hallucinated proof points are forbidden.
7. **The CLI mode names this skill exposes are stable.** Do not rename `onboard`, `onboard reset`, `onboard narrative`, etc. The web dashboard and any commercial backend may invoke them by name.

---

## Step 1 -- CV

**Goal:** Have `cv.md` exist and reflect the user's actual experience in clean Markdown.

**If `cv.md` exists**: ask the user
> "Your CV is already saved. Do you want to (a) replace it, (b) edit a section, or (c) skip?"
- (a) -> proceed as if missing
- (b) -> read the file, ask which section to update, write only that section back
- (c) -> skip

**If missing**: ask
> "I don't have your CV yet. You can either:
> 1. Paste your CV text here and I'll convert it to Markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

For all paths: produce clean Markdown with sections `# Name`, `## Summary`, `## Experience`, `## Projects`, `## Education`, `## Skills`. Use bold for job titles and dates. Bullet achievements; lead with metrics where possible.

**Tool calls:**
- Existing? -> `read_user_file('cv.md')`
- Save -> `write_user_cv(markdown)`

---

## Step 2 -- Profile

**Goal:** `config/profile.yml` reflects the user's identity and search targets.

**If exists**: pre-load values via `read_user_profile()`. Show:
> "Your current profile:
> - Name: {name}
> - Email: {email}
> - Roles: {primary_roles}
> - Salary: {target_range}
>
> Anything to update? (or 'skip')"

**If missing**: ask
> "I need a few details to personalize the system:
> - Your full name
> - Email and phone
> - Location and timezone
> - What roles are you targeting? (2-5 roles)
> - Salary target range"

**Tool calls:**
- `read_user_profile()` to pre-load
- `merge_user_profile_basics({ name, email, phone, location, target_roles, salary_range })` to save

**MUST preserve**: existing `target_roles.archetypes`, `narrative`, any compensation fields beyond `target_range`, any custom top-level YAML keys.

---

## Step 3 -- Portals

**Goal:** `portals.yml` is configured and reflects the current keyword list.

**If `portals.yml` does not exist**: install defaults.
- Call `install_default_portals()` (copies template, patches `title_filter.positive` from `target_roles.primary`).

**If `portals.yml` exists**: show counts via `read_portals_summary()`. Then ask:
> "Your portals.yml has:
> - {tracked_companies} tracked companies
> - {search_queries} WebSearch queries
> - {linkedin_searches} LinkedIn searches
>
> Want to:
> (a) Regenerate search_queries / linkedin.searches / title_filter.positive from your current keywords (preserves tracked_companies)
> (b) Seed tracked_companies from the template (88 pre-configured companies, only if your list is currently empty)
> (c) Skip"

**Tool calls:**
- `read_portals_summary()`
- `regenerate_portals()` for (a)
- `seed_tracked_companies()` for (b)

**Note**: This step is for the search infrastructure. The user-curated company list (`tracked_companies`) only grows two ways: explicit seed from template, or `cache-company.mjs` adding companies after high-score evaluations. Never auto-modified here.

---

## Step 4 -- Tracker bootstrap

**Goal:** `data/applications.md` exists with the standard header.

**Always run** (idempotent). If file already exists, do nothing.

**Tool call:** `bootstrap_tracker()`

Standard header:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

---

## Step 5 -- Narrative (the conversation that matters)

**Goal:** Capture what makes this user different -- vocabulary, history, taste, deal-breakers, proof points -- across `modes/_profile.md`, the `narrative` block of `profile.yml`, and `article-digest.md`.

This is the step users remember as "where Claude got to know me." Take time. Ask follow-ups. Quote things back at the user to confirm interpretation.

### Conversation arc

Open with:
> "The basics are saved. The rest of this is optional but it's what makes future evaluations actually feel personalized. The more you tell me here, the better I'll filter and write CVs. Want to dig in?"

If yes, walk through these in order, **one question at a time**, with follow-ups:

1. **Superpower** -- "What's your unfair advantage? The thing you do that surprises people who haven't worked with you?"
   - Probe for a story, not just an adjective
   - Distill to 1-3 sentences -> `narrative.superpowers[]`

2. **Drains and energizes** -- "What kind of work makes time disappear? What kind drains you to look at?"
   - Used for filtering JDs in evaluations
   - Distill to bullet points -> `_profile.md` archetype `description`

3. **Deal-breakers** -- "Anything that's an automatic no? (e.g., on-site only, startups under 20 people, specific industries)"
   - Hard filters
   - -> `write_user_dealbreakers(items)`

4. **Best professional achievement** -- "Tell me the one story you'd lead with in an interview. What was the situation, what did you do, what was the result?"
   - This becomes the headline proof point
   - -> `narrative.headline` + first entry in `article-digest.md`

5. **Articles, talks, projects** -- "Have you written, spoken, or built anything publicly that I should know about? Even half-finished side projects count."
   - For each: ask for the URL or essay file, the metric/result, the audience
   - If the user has files in `data/essays/`, read them via `read_user_essays()` and distill into article-digest entries
   - -> `append_article_digest({ title, source, claim, metric, citation })` for each

6. **Negotiation posture** -- "What's your floor on comp? What non-comp things matter? (equity, remote, learning budget, etc.)"
   - -> `write_user_negotiation(markdown)`

7. **Archetype confirmation** -- echo back the inferred archetypes:
   > "Based on what you've told me, your search archetypes look like:
   > 1. {primary archetype} -- {description}
   > 2. {secondary} -- {description}
   > Sound right? Anything I missed?"
   - Adjust until user agrees -> `write_user_archetypes(archetypes)`

### Hard rules for Step 5

- Ask one question at a time. No question stacks. Wait for the answer before the next.
- After every 2-3 exchanges, summarize what you've captured and confirm.
- Never invent a proof point, metric, or citation. If a number is uncertain, ask the user. If they don't have one, omit it.
- This step is **append-only** to `article-digest.md` -- never delete prior entries during a re-run.
- If the user is brief or signals "let's move on," compress remaining questions into one combined ask.

### When to re-run

`/career-ops onboard narrative` re-runs only this step. Useful when:
- User has new articles or projects to add
- User's deal-breakers have changed
- Negotiation posture changed (e.g., salary expectation went up)
- Archetypes need refinement based on what evaluations have surfaced

---

## Step 6 -- Keywords + completion

**Goal:** `data/keywords.json` reflects the user's CV + profile + narrative.

1. Run `regenerate_keywords()` -> get the keyword list back.
2. Show the result to the user:
   > "Generated {N} keywords from your CV, profile, and digest. Top keywords by source:
   > - From CV: {list}
   > - From profile target_roles: {list}
   > - From digest proof points: {list}
   >
   > Anything to add or remove?"
3. If user wants edits, take them as comma-separated terms with `+` or `-` prefixes (e.g., `+Solidity, -PHP`). Apply via the keywords API.
4. Suggest regenerating portals to sync queries:
   > "Your search keywords drive `portals.yml`. Want me to also regenerate the WebSearch + LinkedIn queries to match? (recommended)"
   - Yes -> call `regenerate_portals()`

5. Call `set_onboarded_timestamp()` to mark completion.

6. Print summary of every file written, with line counts and brief descriptions.

7. Suggest first action:
   > "You're set up. First action: `/career-ops scan` to find offers that match. Or paste a JD and I'll evaluate it directly."

---

## Reset mode (`/career-ops onboard reset`)

1. Confirm with user:
   > "Reset will move these files into `backup-{timestamp}/`:
   > - cv.md
   > - config/profile.yml
   > - modes/_profile.md
   > - article-digest.md
   > - portals.yml
   > - data/keywords.json
   >
   > Your work product (reports/, data/jobs.tsv, data/applications.md, data/scan-history.tsv, interview-prep/) will NOT be touched.
   >
   > Proceed? (y/n)"
2. On yes: `backup_user_files([...], 'backup-{ISO timestamp}/')`
3. Delete `data/.onboarded_at` so auto-trigger fires fresh.
4. Run the full flow from Step 1.

---

## Status mode (`/career-ops onboard status`)

Print, no questions:

```
career-ops setup status:

  cv.md                        OK   (3,488 chars, modified 2026-04-14)
  config/profile.yml           OK   (Ajay Shah, 4 target roles)
  portals.yml                  OK   (0 tracked_companies, 39 search_queries, 13 linkedin)
  modes/_profile.md            OK   (5 archetypes, 3 deal-breakers)
  article-digest.md            OK   (12 proof points, 132 lines)
  data/keywords.json           OK   (13 enabled / 13 total)
  data/applications.md         OK   (1 application logged)
  data/.onboarded_at           2026-04-14T19:22:04Z

Run `/career-ops onboard {step}` to re-run a single step,
or `/career-ops onboard reset` to back everything up and start fresh.
```

When a file is missing:

```
  cv.md                        MISSING   <- onboarding required
```

The auto-trigger uses this same shape to decide whether to launch onboarding.

---

## Error handling

| Failure | Response |
|---|---|
| User refuses to provide CV at Step 1 | Write a placeholder `# My CV\n\n(paste your CV here later)` and continue. Mark Step 1 as `incomplete`. Subsequent evaluations will warn that CV is empty. |
| User pastes malformed YAML during a profile edit | Parse defensively, surface the parse error in plain English, ask them to re-paste or fix. Do not write the file. |
| `generate-keywords.mjs` fails (Step 6) | Emit a bare keyword list from `target_roles.primary`, write it to `data/keywords.json`, flag for the user to retry later. Do not block completion. |
| `regenerate-portals.mjs` fails | Surface the script's stderr to the user verbatim. Do not modify `portals.yml`. Suggest opening it in an editor. |
| User abandons mid-conversation | Save what was captured. The next invocation of `/career-ops onboard` will see partial state and resume from the first incomplete step. |
| Backup creation fails during reset | Abort. Do NOT proceed to the rewrite phase. Surface the filesystem error. |

---

## Output contract

On successful completion of any step:
- The relevant canonical file(s) exist with valid content.
- For Steps 1-5: the user has explicitly confirmed the resulting content.
- For Step 6: `data/.onboarded_at` is updated.
- A summary line is printed: `[onboard] step={N} files_written=[...] status=ok`.

On failure:
- No file is left in a partially-written state.
- A summary line is printed: `[onboard] step={N} status=error reason={message}`.
- The auto-trigger will resume from the failed step on the next invocation.

---

## Relationship to other modes

- `/career-ops scan` checks `data/.onboarded_at` before running. If absent or
  if any canonical file is missing, it auto-invokes `/career-ops onboard`.
- `/career-ops oferta` requires `cv.md`, `profile.yml`, `_profile.md`, and
  `article-digest.md`. If any are missing, refuse and suggest
  `/career-ops onboard {missing-step}`.
- The web dashboard's "Revisit onboarding wizard" button (Settings tab) is the
  GUI surface of this mode. It exposes the same step navigation and the same
  underlying actions; the long-term goal is for the dashboard to invoke this
  skill via API rather than reimplementing the steps in JavaScript.
