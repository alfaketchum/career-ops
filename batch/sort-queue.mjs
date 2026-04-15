#!/usr/bin/env node

/**
 * sort-queue.mjs — Reorder batch-input.tsv by priority scores from pass-history.
 *
 * Philosophy: "Always Be Applying" — every URL eventually gets a deep eval.
 * This orders the queue by light-pass score so the deep pass processes
 * high-priority jobs first. User can then run the deep pass with --limit N
 * to control cost per session.
 *
 * Reads: data/pass-history.tsv (the URL-keyed persistent state)
 * Writes: batch/batch-input.tsv (reordered, re-IDed 1..N)
 *
 * Usage:
 *   node batch/sort-queue.mjs
 *   node batch/sort-queue.mjs --dry-run
 *   node batch/sort-queue.mjs --output batch/batch-input.tsv
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { readHistory } from '../pass-history.mjs';

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

if (!existsSync(INPUT_FILE)) {
  console.error(`ERROR: ${INPUT_FILE} not found.`);
  process.exit(1);
}

const history = readHistory();
if (history.size === 0) {
  console.error(`ERROR: data/pass-history.tsv is empty or missing.`);
  console.error('Run the light pass first:');
  console.error('  bash batch/batch-runner.sh --screen --parallel 5');
  process.exit(1);
}

// Load batch-input.tsv — header: id, url, source, notes
const inputLines = readFileSync(INPUT_FILE, 'utf8').split('\n').filter(l => l.trim());
const urls = [];
for (let i = 1; i < inputLines.length; i++) {
  const fields = inputLines[i].split('\t');
  if (fields.length < 4) continue;
  const [id, url, source, notes] = fields;
  const rec = history.get(url);
  urls.push({
    originalId: id,
    url,
    source,
    notes,
    score: rec && rec.lightScore != null ? rec.lightScore : 0,
    company: rec ? rec.company : '',
    role: rec ? rec.role : '',
    deepDone: rec && rec.deepReport != null,
  });
}

// Separate: scored (sort desc), unscored (append at end)
// Also push deep-done URLs to the end since they'll be skipped anyway
const scored = urls.filter(u => u.score > 0 && !u.deepDone).sort((a, b) => b.score - a.score);
const unscored = urls.filter(u => u.score === 0 && !u.deepDone);
const deepDone = urls.filter(u => u.deepDone);
const ordered = [...scored, ...unscored, ...deepDone];

// Re-ID
const header = 'id\turl\tsource\tnotes';
const rows = ordered.map((u, i) => {
  let suffix = '';
  if (u.deepDone) suffix = ' [DEEP-DONE]';
  else if (u.score > 0) suffix = ` [PRIORITY ${u.score.toFixed(1)}]`;
  return `${i + 1}\t${u.url}\t${u.source}\t${u.notes}${suffix}`;
});

// Summary
console.log('\nQueue reordered by priority:');
console.log('─'.repeat(80));
console.log(`  Scored + pending deep:  ${scored.length}`);
console.log(`  Unscored (run light):   ${unscored.length}`);
console.log(`  Already deep-done:      ${deepDone.length} (kept at end; batch-runner will skip)`);
console.log(`  Total:                  ${ordered.length}`);
console.log('─'.repeat(80));

if (scored.length > 0) {
  console.log('\nTop 15 priorities:');
  for (let i = 0; i < Math.min(15, scored.length); i++) {
    const u = scored[i];
    const label = u.company && u.role ? `${u.company} — ${u.role}` : u.notes;
    console.log(`  ${(i + 1).toString().padStart(3)}. [${u.score.toFixed(1)}] ${label.substring(0, 70)}`);
  }
  console.log('─'.repeat(80));
}

if (dryRun) {
  console.log(`\n[dry-run] Would write to ${outputPath}`);
  process.exit(0);
}

// Backup original if overwriting
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

if (scored.length > 0) {
  console.log('\nNext step — deep pass (budget-controlled):');
  console.log('  bash batch/batch-runner.sh --parallel 3 --limit 20');
  console.log('  # or for max quality:');
  console.log('  CLAUDE_MODEL=claude-opus-4-5 bash batch/batch-runner.sh --parallel 2 --limit 10');
}
