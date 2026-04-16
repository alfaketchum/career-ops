# Graph Report - .  (2026-04-16)

## Corpus Check
- 16 files · ~10,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 493 nodes · 661 edges · 37 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 107 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `PipelineModel` - 30 edges
2. `Batch Worker Prompt (A-G + PDF + Tracker)` - 17 edges
3. `README — Career-Ops Overview` - 13 edges
4. `ProgressModel` - 12 edges
5. `ViewerModel` - 12 edges
6. `Ajay Shah CV` - 11 edges
7. `InboxModel` - 10 edges
8. `Career Arc Narrative` - 9 edges
9. `Mode: oferta — Complete Evaluation A-G` - 9 edges
10. `OverviewModel` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Batch Worker Prompt (A-G + PDF + Tracker)` --semantically_similar_to--> `Sample Report (Acme AI A-F eval, 4.2/5)`  [INFERRED] [semantically similar]
  batch/batch-prompt.md → examples/sample-report.md
- `Ethical Use Rules (Quality Not Quantity)` --semantically_similar_to--> `AI Hallucination Warning`  [INFERRED] [semantically similar]
  CLAUDE.md → LEGAL_DISCLAIMER.md
- `Language Modes (DE/FR/JA)` --semantically_similar_to--> `README i18n Variants (ES/PT-BR/KO/JA/RU/ZH-TW)`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `Project Values` --semantically_similar_to--> `Not-Spray-and-Pray Filter Rationale`  [INFERRED] [semantically similar]
  GOVERNANCE.md → README.md
- `Scoring Blocks A-F (RU)` --semantically_similar_to--> `Wisetack FP&A Analyst Evaluation`  [INFERRED] [semantically similar]
  modes/ru/_shared.md → reports/001-wisetack-2026-04-15.md

## Hyperedges (group relationships)
- **User Personalization Files** — claudemd_cv_md, claudemd_profile_yml, claudemd_profile_md, claudemd_portals_yml [EXTRACTED 0.95]
- **Batch Scoring Input Files** — claudemd_cv_md, claudemd_profile_md, claudemd_profile_yml, batch_screen_scoring_dimensions [EXTRACTED 0.90]
- **Pipeline Integrity Enforcement Flow** — claudemd_tsv_tracker_format, claudemd_merge_tracker_mjs, claudemd_applications_md, claudemd_verify_pipeline_mjs [EXTRACTED 0.90]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (49): Archetype Detection (6 archetypes), ATS Rules (Single-column, standard headers, UTF-8), Block A — Role Summary, Block B — CV Match + Gaps, Block C — Level and Strategy, Block D — Comp and Demand, Block E — Personalization Plan, Block F — Interview Plan (STAR) (+41 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (14): NewPipelineModel(), statusLabel(), truncateRunes(), PipelineClosedMsg, PipelineLoadReportMsg, PipelineModel, PipelineOpenInboxMsg, PipelineOpenProgressMsg (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (35): 6 Role Archetypes, Block G — Posting Legitimacy, A-F Scoring Blocks (6 blocks, 1-5 global), STAR+R Story Format, data/applications.md (Applications Tracker), cv.md (canonical CV), data/follow-ups.md, data/pipeline.md (URL inbox) (+27 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (35): Financial Analyst (FP&A) Archetype, Below-Market Comp ($70.8K-$99.1K vs $107K-$158K), Block B - CV Match 4.2/5, Block D - Compensation 1.5/5, Block G - Legitimacy: Suspicious (Position Closed), Wisetack (Consumer Lending Fintech), Decision: DO NOT APPLY (Position Closed), Proof Point: Aligned $50M Portfolio, 173.7% Return (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (32): Codex Agent Entry Point, Codex Setup Docs Reference, No-Fetch Hard Rule (title+company only), Batch Worker — Priority Scorer Prompt, Batch Worker — Multi Priority Scorer Prompt, 4-Dimension Scoring (Role/Company/Remote/Red Flags), Data Contract Rule (User vs System Layer), CLAUDE.md Project Instructions (+24 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (32): Hard Rules (no files, no fetch, JSON only), Single-line JSON Output Format, JSON Array Output Format, Batch Worker Multi Priority Scorer (list), Batch Worker Priority Scorer (single), Rationale: Speed via title+company only (no fetch), Four Scoring Dimensions (Role Fit, Company Match, Remote Hint, Red Flags), data/applications.md (tracker) (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (28): Ethical Use Rules (Quality Not Quantity), Mandatory Offer Verification via Playwright, Enforcement Actions (Warning/Temp/Perm Ban), Code of Conduct (Contributor Covenant 2.1), Contributing Guide, Issue-First PR Rule, Rejected PR Types (Scraping/Auto-submit/Deps), cv-santiago portfolio (companion open-source repo) (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (27): German Offer Evaluation Mode (angebot), German Apply Mode (bewerben), German Pipeline Mode, German Modes README (DACH), German Shared Mode, English Apply Mode (reference), English Offer Evaluation Mode (reference), English Pipeline Mode (reference) (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (22): cleanTableCell(), ComputeMetrics(), ComputeOverview(), ComputeProgressMetrics(), detectSource(), enrichAppURLsByCompany(), enrichFromScanHistory(), loadBatchInputURLs() (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.2
Nodes (6): ViewerClosedMsg, ViewerModel, computeColumnWidths(), isTableLine(), isTableSeparator(), parseTableCells()

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (7): NewInboxModel(), sortKey(), truncate(), InboxClosedMsg, InboxFilter, InboxModel, InboxOpenURLMsg

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (9): bar(), orDash(), scoreOrDash(), OverviewClosedMsg, OverviewModel, OverviewOpenInboxMsg, OverviewOpenProfileMsg, OverviewOpenTrackerMsg (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.21
Nodes (12): $(), activateTab(), escapeHTML(), fetchJSON(), formatDeepEvent(), init(), render(), setStatus() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (2): ProgressClosedMsg, ProgressModel

### Community 14 - "Community 14"
Cohesion: 0.24
Nodes (15): Agentic AI Thesis (Digital Asset x Gen AI), Ben Thompson / Aggregation Theory, BJJ 5+ years / purple belt (Wharton contribution), DeFi Discovery (2021), Long-term goal: Global Head of Partnerships (Gen AI to Emerging Markets), Limitless Labs (2023 DeFi startup), Rutgers -> J&J -> Moody's -> Aligned Co. career arc, Ryan Decision STAR story (Figma pivot, $500K funding) (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (13): CareerApplication, DeepPassStats, FunnelStage, LightPassStats, Overview, PipelineInboxItem, PipelineInboxStats, PipelineMetrics (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (4): NewProfileModel(), ProfileClosedMsg, ProfileModel, profileTab

### Community 17 - "Community 17"
Cohesion: 0.27
Nodes (3): appModel, viewState, openURLCmd()

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (5): Discord Community, Security Policy, Private Vulnerability Reporting (hi@santifer.io), Support Channels Routing Table, Support Guide

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (4): Demo GIF (product demonstration), Hero Banner: 'You got the job.', OG Image: 'You got the job.' (social share), Vision Banner: 'Free for everyone.' (diverse figures approaching lit doorway)

### Community 20 - "Community 20"
Cohesion: 0.5
Nodes (4): Roadmap Later: Desktop App for Everyone (no terminal, built-in AI, every language/market), Roadmap Next: Free Local AI (on-device, no API costs, one-click, private), Roadmap Now: Community & Foundation (7 languages, security, zero-token scanner, contributor ladder), Roadmap Phases: Now/Next/Later

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (4): Career-Ops AI Job Search Pipeline, Ethical Use Rules (quality over quantity), Graphify Integration Rules, Update Check via update-system.mjs

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (1): Theme

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (3): check-liveness.mjs, fetch-jd.mjs (auth-aware JD fetcher), liveness-core.mjs

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): Changelog v1.4.0 (2026-04-13), Changelog v1.5.0 (2026-04-14)

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (2): Canonical Application States, TSV Tracker Additions Format

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (2): Language Modes (DE/FR/JA), README i18n Variants (ES/PT-BR/KO/JA/RU/ZH-TW)

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (2): English Interview Prep Mode (reference), Russian Interview Prep Mode

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (2): auth-setup.mjs, linkedin-scan.mjs (authenticated search)

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (2): data/keywords.json, web/server.mjs (browser dashboard)

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (2): generate-pdf.mjs (HTML to PDF via Playwright), Offer Verification via Playwright (mandatory)

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): Update Check Protocol

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (1): Skill Modes Routing Table

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (1): cache-company.mjs

## Knowledge Gaps
- **163 isolated node(s):** `viewState`, `passHistoryEntry`, `batchEntry`, `PipelineInboxItem`, `PipelineInboxStats` (+158 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 25`** (2 nodes): `newCatppuccinMocha()`, `catppuccin.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `newCatppuccinLatte()`, `catppuccin_latte.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `Changelog v1.4.0 (2026-04-13)`, `Changelog v1.5.0 (2026-04-14)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `Canonical Application States`, `TSV Tracker Additions Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `Language Modes (DE/FR/JA)`, `README i18n Variants (ES/PT-BR/KO/JA/RU/ZH-TW)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `English Interview Prep Mode (reference)`, `Russian Interview Prep Mode`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `auth-setup.mjs`, `linkedin-scan.mjs (authenticated search)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `data/keywords.json`, `web/server.mjs (browser dashboard)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `generate-pdf.mjs (HTML to PDF via Playwright)`, `Offer Verification via Playwright (mandatory)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `Update Check Protocol`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `Skill Modes Routing Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `cache-company.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 3 inferred relationships involving `Batch Worker Prompt (A-G + PDF + Tracker)` (e.g. with `Evaluation Flow (single offer, 6 blocks)` and `Codex Setup (AGENTS.md routing)`) actually correct?**
  _`Batch Worker Prompt (A-G + PDF + Tracker)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `viewState`, `passHistoryEntry`, `batchEntry` to the rest of the system?**
  _163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._