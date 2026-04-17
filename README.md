# Always Be Applying

**Self-hosted AI job-search agent. Your data, your API key.**

Always Be Applying is a local web app that turns the slow, repetitive parts of a job
search into a tight feedback loop. It scans company ATSs (Greenhouse / Ashby / Lever)
directly, evaluates each posting against your real CV and proof points, generates
ATS-optimized PDFs per role, and tracks every application in one place.

It runs on your machine. Your CV, your reports, your tracker, your scans — none of it
leaves your laptop. The only outbound calls are to the Anthropic API, with your key.

---

## Why this exists

Job boards lie about freshness. Recruiters use AI to filter you. The good roles get
buried under noise. Most "job-search tools" are spreadsheets with a wrapper.

Always Be Applying is the opposite shape:

- **Goes to the source.** Hits Greenhouse / Ashby / Lever JSON APIs directly. No
  scraping, no rate limits, no stale Google-cached results. The companies *want*
  this traffic.
- **Reads your actual CV.** Evaluations score against your background — proof points,
  metrics, articles, archetypes — not against a keyword match.
- **Tells you not to apply.** If a role scores below 4.0/5, the system recommends
  against it. Your time is finite. So is the recruiter's.
- **Runs locally.** Your data is on your filesystem. No SaaS, no logins, no
  contributing to a third-party ML pipeline.

---

## Quick start

```bash
git clone https://github.com/alfaketchum/always-be-applying
cd always-be-applying
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run web
```

Open `http://localhost:3000`. The web app walks you through onboarding the first time
you visit — it'll ask for your CV, target roles, and a few questions about what
makes you different. From there you scan portals, evaluate offers, and generate CVs
without ever opening a terminal.

Everything you create lives in your project directory:

| Path | What's in it |
|---|---|
| `cv.md` | Your canonical CV (markdown) |
| `config/profile.yml` | Your identity and target roles |
| `modes/_profile.md` | Your archetypes, deal-breakers, negotiation posture |
| `article-digest.md` | Your proof points (compact, with citations) |
| `portals.yml` | Companies you watch + search queries |
| `data/jobs.tsv` | Every job the scanner has found, with liveness status |
| `data/applications.md` | Your tracker |
| `reports/` | Every evaluation report you've generated |

---

## What the dashboard does

**Overview** — your funnel at a glance: scanned → active → selected → CV done → applied.
Pipeline counts, application metrics, status breakdown.

**Profile** — view your CV, profile.yml, _profile.md, article-digest.md, and portals.yml
in one place.

**Keywords** — toggle which search terms are active. Regenerate from your CV/profile/digest
when your background changes. See exactly which search queries each keyword produces.

**Scanner** — three modes, all visible:
- **API scan**: hits Greenhouse / Ashby / Lever directly. Free, structured, 100% live.
- **WebSearch**: Google `site:` queries via Anthropic Haiku for boards without APIs.
- **LinkedIn auth**: optional authenticated browser-based search. Account-ban risk.

Plus liveness checking — Playwright visits each scanned URL and confirms it's still open.
Live progress, streaming log.

**Jobs** — every job, with filters by liveness / selected / CV-status. Bulk select for
batch CV generation.

**Tracker** — every application you've logged, with score / status / report links.

**Progress** — funnel conversion rates, score distribution, weekly activity.

**Settings** — Anthropic API key management. Revisit onboarding wizard.

---

## How the agent works

The web app is a thin shell over a set of agent-driven *modes*:

| Mode | What it does |
|---|---|
| `onboard` | Conversational setup — extracts your identity into the canonical files |
| `oferta` | Evaluates a job description against your CV, returns A-F scoring + verdict |
| `pdf` | Generates an ATS-optimized PDF tailored to the specific role |
| `deep` | Researches a company beyond the JD — news, funding, reviews |
| `scan` | Hits portals (no LLM) and adds new postings to the pipeline |
| `apply` | Helps fill out application forms (Playwright-driven) |
| `contacto` | Finds LinkedIn contacts at a target company and drafts outreach |
| `interview-prep` | Builds STAR+R stories tailored to the company and role |
| `patterns` | Analyzes rejection patterns to improve targeting over time |
| `followup` | Tracks application cadence, surfaces overdue follow-ups |

Each mode lives as a markdown file in `modes/` with a defined set of tool contracts.
The web app invokes them by calling the Anthropic API with your key. No middleman.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Browser (localhost:3000)                   │
│  - Dashboard (vanilla JS, no framework)     │
│  - Onboarding chat                          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Local Node server (web/server.mjs)         │
│  - REST API for the dashboard               │
│  - Spawns scan, liveness, PDF generation    │
│  - Calls Anthropic API for agent modes      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Your filesystem (this directory)           │
│  - cv.md, profile.yml, portals.yml, ...     │
│  - data/jobs.tsv, reports/, etc.            │
│  - .env (your Anthropic API key)            │
└─────────────────────────────────────────────┘
```

No database. No cloud. No background sync. Quit the server and everything stops.
Restart it and your state picks up where you left off.

---

## Power users: Claude Code support

If you already use Claude Code, every mode is also invokable from the CLI:

```
/career-ops onboard          # full setup wizard
/career-ops oferta {URL}     # evaluate a job
/career-ops pdf              # generate CV for a selected job
/career-ops scan             # scan portals
/career-ops batch            # parallel evaluation of multiple jobs
```

In Claude Code you get the conversational depth of the original agent runtime —
better for long planning sessions, ad-hoc research, and pattern analysis. The
web app is the everyday interface; Claude Code is the deep-work interface. They
operate on the same files.

---

## Customization

Most settings live in plain text files you can edit:

- **`config/profile.yml`** — your identity (name, roles, salary)
- **`modes/_profile.md`** — your archetypes and negotiation rules
- **`portals.yml`** — companies you watch + scan queries
- **`templates/cv-template.html`** — the HTML template for generated PDFs
- **`modes/*.md`** — every agent prompt; tweak scoring, change tone, adjust rules

Changes take effect immediately. No build step.

---

## Status

Pre-1.0. Personal use today, opening up to early users.

The core pipeline is solid (700+ jobs scanned, hundreds of evaluations on real
applications) but the BYOK web installation flow is still being smoothed out.
If you try it and hit friction, file an issue.

---

## Acknowledgments

Forked from [career-ops](https://github.com/santifer/career-ops) by Santiago
Fernández de Valderrama. The original project's archetypes, scoring logic,
and modes are the foundation; this fork extends them with a self-hosted web
agent runtime, BYOK distribution, and a different product focus.
