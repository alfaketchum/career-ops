#!/usr/bin/env node

/**
 * sort-queue.mjs — Reorder batch-input.tsv by priority scores from screen pass.
 *
 * Philosophy: "Always Be Applying" — every URL eventually gets a deep eval.
 * This just orders the queue so high-priority jobs are processed first.
 *
 * Usage:
 *   node batch/sort-queue.mjs
 *   node batch/sort-queue.mjs --dry-run
 *   node batch/sort-queue.mjs --output batch/batch-input.tsv   # default: overwrite input
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';

const SCORES_FILE = 'batch/priority-scores.tsv';
const INPUT_FILE = 'batch/batch-input.tsv';

function hasFlag(flag) {
  return process.argv.includes(flag);
}
function getArg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const dryRun = hasFlag('--dry-run');
const outputPath = getArg('--output', INPUT_FILE);

if (!existsSync(SCORES_FILE)) {
  console.error(`ERROR: ${SCORES_FILE} not found. Run screen pass first:`);
  console.error('  bash batch/batch-runner.sh --screen --parallel 5');
  process.exit(1);
}

if (!existsSync(INPUT_FILE)) {
  console.error(`ERROR: ${INPUT_FILE} not found.`);
  process.exit(1);
}

// Load priority scores — header: id, url, company, role, score, reason
const scoresLines = readFileSync(SCORES_FILE, 'utf8').split('\n').filter(l => l.trim());
const scoresByID = new Map();
for (let i = 1; i < scoresLines.length; i++) {
  const fields = scoresLines[i].split('\t');
  if (fields.length < 5) continue;
  const [id, url, company, role, scoreStr, reason] = fields;
  const score = parseFloat(scoreStr);
  if (isNaN(score)) continue;
  scoresByID.set(id, { score, company, role, reason });
}

// Load original input — header: id, url, source, notes
const inputLines = readFileSync(INPUT_FILE, 'utf8').split('\n').filter(l => l.trim());
const urls = [];
for (let i = 1; i < inputLines.length; i++) {
  const fields = inputLines[i].split('\t');
  if (fields.length < 4) continue;
  const [id, url, source, notes] = fields;
  const scored = scoresByID.get(id);
  urls.push({
    originalId: id,
    url,
    source,
    notes,
    score: scored ? scored.score : 0,
    company: scored ? scored.company : '',
    role: scored ? scored.role : '',
    reason: scored ? scored.reason : 'not scored',
  });
}

// Separate: scored URLs (sort by score desc), unscored URLs (append at end)
const scored = urls.filter(u => u.score > 0).sort((a, b) => b.score - a.score);
const unscored = urls.filter(u => u.score === 0);
const ordered = [...scored, ...unscored];

// Re-ID from 1 to N in new priority order
const header = 'id\turl\tsource\tnotes';
const rows = ordered.map((u, i) => {
  const noteSuffix = u.score > 0 ? ` [PRIORITY ${u.score.toFixed(1)}]` : '';
  return `${i + 1}\t${u.url}\t${u.source}\t${u.notes}${noteSuffix}`;
});

// Summary
console.log(`\nReordered queue by priority score:`);
console.log('─'.repeat(80));
console.log(`  Scored URLs:   ${scored.length}`);
console.log(`  Unscored URLs: ${unscored.length} (kept at end of queue)`);
console.log(`  Total:         ${ordered.length}`);
console.log('─'.repeat(80));
console.log('\nTop 15 priorities:');
for (let i = 0; i < Math.min(15, scored.length); i++) {
  const u = scored[i];
  const label = u.company && u.role ? `${u.company} — ${u.role}` : u.notes;
  console.log(`  ${(i + 1).toString().padStart(3)}. [${u.score.toFixed(1)}] ${label.substring(0, 70)}`);
}
console.log('─'.repeat(80));

if (dryRun) {
  console.log(`\n[dry-run] Would write reordered queue to ${outputPath}`);
  process.exit(0);
}

// Backup original if we're overwriting it
if (outputPath === INPUT_FILE) {
  const backup = INPUT_FILE.replace('.tsv', '.unsorted.tsv');
  try {
    renameSync(INPUT_FILE, backup);
    console.log(`\nBackup: ${backup}`);
  } catch (err) {
    console.error(`WARN: couldn't back up ${INPUT_FILE}: ${err.message}`);
  }
}

writeFileSync(outputPath, [header, ...rows].join('\n') + '\n', 'utf8');
console.log(`✓ Reordered queue written to ${outputPath}`);

console.log('\nNext step: reset state and run deep pass:');
console.log('  rm -f batch/batch-state.tsv');
console.log('  bash batch/batch-runner.sh --parallel 3');
