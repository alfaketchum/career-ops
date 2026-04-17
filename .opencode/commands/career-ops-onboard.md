---
description: Conversational setup wizard -- CV, profile, portals, narrative, keywords. Run on demand or for a single step.
---

Run career-ops onboarding. Arguments provided: "$ARGUMENTS"

Sub-modes (pass after `onboard`):
- `(empty)` -> full 6-step flow (skips already-configured steps)
- `cv` -> Step 1 only: write/edit cv.md
- `profile` -> Step 2 only: merge into config/profile.yml (preserves archetypes/narrative)
- `portals` -> Step 3 only: regenerate from keywords + offer to seed tracked_companies from template
- `narrative` -> Step 5 only: the rich "tell me about yourself" conversation
- `keywords` -> Step 6 only: regenerate data/keywords.json
- `reset` -> backup all canonical files, then full re-run
- `status` -> print current setup state and exit (no prompts)

Load the career-ops skill:
```
skill({ name: "career-ops" })
```
