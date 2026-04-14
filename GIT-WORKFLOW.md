# Git Workflow — career-ops

## Branch Strategy

### `main` (public)
- Clean, open-source career-ops system
- No personal data — all user files are in `.gitignore`
- Receives upstream updates from `santifer/career-ops`
- Safe to push to public repos

### `my-data` (private)
- Branched from `main`
- Contains all personal files force-added with `git add -f`
- Used to sync personal data between machines
- **NEVER merge into `main`** — personal data must stay isolated
- **NEVER push to a public remote** — contains PII, essays, salary info

## Personal Files (on `my-data` only)

These files are in `.gitignore` on `main` but tracked on `my-data`:

| File | Content |
|------|---------|
| `cv.md` | CV / resume |
| `config/profile.yml` | Name, email, phone, targets, comp |
| `modes/_profile.md` | Archetypes, framing, negotiation scripts |
| `article-digest.md` | Proof points, STAR stories |
| `portals.yml` | Portal scanner config |
| `data/applications.md` | Application tracker |
| `data/essays/*.md` | MBA essays, interview prep |

## Common Operations

### Sync personal data to another machine
```bash
# On this machine (push)
git checkout my-data
git push origin my-data

# On other machine (pull)
git clone <your-private-remote> career-ops
git checkout my-data
```

### Get upstream system updates
```bash
git checkout main
git pull origin main          # or: node update-system.mjs apply
git checkout my-data
git merge main                # bring system updates into your data branch
```

### Save new personal data
```bash
git checkout my-data
git add -f <new-personal-file>
git commit -m "update personal data"
```

### Switch to clean public view
```bash
git checkout main
# Personal files disappear — only system files visible
```

## Rules
1. All personal edits happen on `my-data`
2. System/code changes happen on `main` (or PRs to upstream)
3. Merge direction: `main → my-data` only, never the reverse
4. If productizing: `main` is the distributable product, `my-data` is your instance
