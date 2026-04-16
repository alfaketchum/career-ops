# Graph Report - .  (2026-04-15)

## Corpus Check
- 50 files · ~1,342,492 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 447 nodes · 610 edges · 30 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 102 edges (avg confidence: 0.86)
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
- **Data Contract Enforcement Triad** — data_contract_rule_rationale, claude_data_contract_rule, git_merge_direction_rule [INFERRED 0.85]
- **Candidate Context Sources for Evaluation** — cv_ajay_shah, digest_career_arc, digest_star_stories_bank [EXTRACTED 0.95]
- **Ethical Human-in-the-Loop Policy** — claude_ethical_use_rule, legal_ai_hallucination_warning, contributing_rejected_prs, readme_not_spray_pray_rationale [INFERRED 0.90]
- **MBA essays share Limitless Labs + DeFi + Global Partnerships arc** — essay_booth, essay_kellogg, essay_ucla, essay_wharton, concept_limitless_labs, concept_goal_global_head_partnerships [EXTRACTED 0.95]
- **Two-pass batch pipeline: light -> sort -> deep -> merge tracker** — batch_readme_light_pass, batch_readme_sort_queue, batch_readme_deep_pass, batch_readme_tracker_merge, batch_prompt_worker, data_applications_tracker [EXTRACTED 0.95]
- **A-G evaluation blocks implement the report format** — batch_prompt_block_a_role_summary, batch_prompt_block_b_cv_match, batch_prompt_block_c_level_strategy, batch_prompt_block_d_comp, batch_prompt_block_e_personalization, batch_prompt_block_f_interviews, batch_prompt_block_g_legitimacy, examples_sample_report [EXTRACTED 0.90]
- **JD Extraction Toolchain (Playwright → WebFetch → WebSearch)** — tool_playwright, tool_webfetch, tool_websearch [EXTRACTED 1.00]
- **Evaluation modes sharing A-F scoring** — mode_oferta, mode_de_angebot, concept_scoring_a_f [EXTRACTED 0.95]
- **User-layer sources of truth** — file_cv_md, file_profile_yml, mode_profile [EXTRACTED 1.00]
- **Pipeline modes across all languages** — de_pipeline, fr_pipeline, ja_pipeline, pt_pipeline, ru_pipeline [INFERRED 0.90]
- **Offer evaluation modes across all languages** — de_angebot, fr_offre, ja_kyujin, pt_oferta, ru_oferta [INFERRED 0.90]
- **Apply modes across all languages** — de_bewerben, fr_postuler, ja_oubo, pt_aplicar, ru_apply [INFERRED 0.90]
- **Wisetack SKIP decision rationale (score + legitimacy + comp)** — 001_wisetack_score_1_8, 001_wisetack_block_g_legitimacy_suspicious, 001_wisetack_below_market_comp [EXTRACTED 1.00]
- **Proof points supporting 4.2/5 CV match for Wisetack FP&A** — 001_wisetack_proof_jj_expense_system, 001_wisetack_proof_moodys_rosetta_stone, 001_wisetack_proof_aligned_50m_portfolio [EXTRACTED 1.00]
- **career-ops roadmap: Now/Next/Later triad** — img_roadmap_now_foundation, img_roadmap_next_local_ai, img_roadmap_later_desktop [EXTRACTED 1.00]
- **Russian mode system (README + shared + terminology)** — ru_readme_russian_modes, ru_shared_system_context, ru_readme_terminology_dictionary [EXTRACTED 1.00]
- **Russian market adaptations: labor law + comp + benefits** — ru_shared_employment_types, ru_readme_gross_vs_net, ru_shared_dms_benefits [EXTRACTED 1.00]
- **System-layer template triad (CV + portals + states)** — templates_cv_template_html, templates_portals_example_yml, templates_states_yml [EXTRACTED 1.00]

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
Cohesion: 0.08
Nodes (28): Ethical Use Rules (Quality Not Quantity), Mandatory Offer Verification via Playwright, Enforcement Actions (Warning/Temp/Perm Ban), Code of Conduct (Contributor Covenant 2.1), Contributing Guide, Issue-First PR Rule, Rejected PR Types (Scraping/Auto-submit/Deps), cv-santiago portfolio (companion open-source repo) (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (27): German Offer Evaluation Mode (angebot), German Apply Mode (bewerben), German Pipeline Mode, German Modes README (DACH), German Shared Mode, English Apply Mode (reference), English Offer Evaluation Mode (reference), English Pipeline Mode (reference) (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (22): cleanTableCell(), ComputeMetrics(), ComputeOverview(), ComputeProgressMetrics(), detectSource(), enrichAppURLsByCompany(), enrichFromScanHistory(), loadBatchInputURLs() (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.2
Nodes (6): ViewerClosedMsg, ViewerModel, computeColumnWidths(), isTableLine(), isTableSeparator(), parseTableCells()

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (7): NewInboxModel(), sortKey(), truncate(), InboxClosedMsg, InboxFilter, InboxModel, InboxOpenURLMsg

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (9): bar(), orDash(), scoreOrDash(), OverviewClosedMsg, OverviewModel, OverviewOpenInboxMsg, OverviewOpenProfileMsg, OverviewOpenTrackerMsg (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (12): $(), activateTab(), escapeHTML(), fetchJSON(), formatDeepEvent(), init(), render(), setStatus() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.2
Nodes (2): ProgressClosedMsg, ProgressModel

### Community 13 - "Community 13"
Cohesion: 0.24
Nodes (15): Agentic AI Thesis (Digital Asset x Gen AI), Ben Thompson / Aggregation Theory, BJJ 5+ years / purple belt (Wharton contribution), DeFi Discovery (2021), Long-term goal: Global Head of Partnerships (Gen AI to Emerging Markets), Limitless Labs (2023 DeFi startup), Rutgers -> J&J -> Moody's -> Aligned Co. career arc, Ryan Decision STAR story (Figma pivot, $500K funding) (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (13): CareerApplication, DeepPassStats, FunnelStage, LightPassStats, Overview, PipelineInboxItem, PipelineInboxStats, PipelineMetrics (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.25
Nodes (4): NewProfileModel(), ProfileClosedMsg, ProfileModel, profileTab

### Community 16 - "Community 16"
Cohesion: 0.27
Nodes (3): appModel, viewState, openURLCmd()

### Community 17 - "Community 17"
Cohesion: 0.4
Nodes (5): Discord Community, Security Policy, Private Vulnerability Reporting (hi@santifer.io), Support Channels Routing Table, Support Guide

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (4): Demo GIF (product demonstration), Hero Banner: 'You got the job.', OG Image: 'You got the job.' (social share), Vision Banner: 'Free for everyone.' (diverse figures approaching lit doorway)

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (4): Roadmap Later: Desktop App for Everyone (no terminal, built-in AI, every language/market), Roadmap Next: Free Local AI (on-device, no API costs, one-click, private), Roadmap Now: Community & Foundation (7 languages, security, zero-token scanner, contributor ladder), Roadmap Phases: Now/Next/Later

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (1): Theme

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (2): Changelog v1.4.0 (2026-04-13), Changelog v1.5.0 (2026-04-14)

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (2): Canonical Application States, TSV Tracker Additions Format

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (2): Language Modes (DE/FR/JA), README i18n Variants (ES/PT-BR/KO/JA/RU/ZH-TW)

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): English Interview Prep Mode (reference), Russian Interview Prep Mode

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Update Check Protocol

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (1): Skill Modes Routing Table

## Knowledge Gaps
- **140 isolated node(s):** `viewState`, `passHistoryEntry`, `batchEntry`, `PipelineInboxItem`, `PipelineInboxStats` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 22`** (2 nodes): `newCatppuccinMocha()`, `catppuccin.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `newCatppuccinLatte()`, `catppuccin_latte.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `Changelog v1.4.0 (2026-04-13)`, `Changelog v1.5.0 (2026-04-14)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `Canonical Application States`, `TSV Tracker Additions Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `Language Modes (DE/FR/JA)`, `README i18n Variants (ES/PT-BR/KO/JA/RU/ZH-TW)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `English Interview Prep Mode (reference)`, `Russian Interview Prep Mode`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Update Check Protocol`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `Skill Modes Routing Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 3 inferred relationships involving `Batch Worker Prompt (A-G + PDF + Tracker)` (e.g. with `Evaluation Flow (single offer, 6 blocks)` and `Codex Setup (AGENTS.md routing)`) actually correct?**
  _`Batch Worker Prompt (A-G + PDF + Tracker)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `viewState`, `passHistoryEntry`, `batchEntry` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
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