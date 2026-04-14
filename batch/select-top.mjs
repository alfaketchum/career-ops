#!/usr/bin/env node

/**
 * select-top.mjs — Select top N scored offers from batch-state.tsv
 * for a second deep-evaluation pass.
 *
 * Reads batch-state.tsv (output of screen pass), filters by min score,
 * sorts by score descending, and writes the top N to a new batch-input.tsv
 * so the deep pass can run against only the best candidates.
 *
 * Usage:
 *   node batch/select-top.mjs [--top N] [--min-score X] [--output path]
 *
 * Options:
 *   --top N          Take top N offers (default: 20)
 *   --min-score X    Only include offers scoring >= X (default: 3.5)
 *   --output path    Write to this path (default: batch/batch-input-deep.tsv)
 *   --dry-run        Print results without writing
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const STATE_FILE = 'batch/batch-state.tsv';
const INPUT_FILE = 'batch/batch-input.tsv';

function getArg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const topN = parseInt(getArg('--top', '20'), 10);
const minScore = parseFloat(getArg('--min-score', '3.5'));
const outputPath = getArg('--output', 'batch/batch-input-deep.tsv');
const dryRun = hasFlag('--dry-run');

if (!existsSync(STATE_FILE)) {
  console.error(`ERROR: ${STATE_FILE} not found. Run screen pass first:`);
  console.error('  bash batch/batch-runner.sh --screen --parallel 5');
  process.exit(1);
}

if (!existsSync(INPUT_FILE)) {
  console.error(`ERROR: ${INPUT_FILE} not found.`);
  process.exit(1);
}

// Load original input to get URL/company/role for each ID
const inputLines = readFileSync(INPUT_FILE, 'utf8').split('\n').filter(l => l.trim());
const inputByID = new Map();
for (let i = 1; i < inputLines.length; i++) {
  const fields = inputLines[i].split('\t');
  if (fields.length >= 4) {
    inputByID.set(fields[0], {
      id: fields[0],
      url: fields[1],
      source: fields[2],
      notes: fields[3],
    });
  }
}

// Load state: id, url, status, started_at, completed_at, report_num, score, error, retries
const stateLines = readFileSync(STATE_FILE, 'utf8').split('\n').filter(l => l.trim());
const scored = [];
for (let i = 1; i < stateLines.length; i++) {
  const fields = stateLines[i].split('\t');
  if (fields.length < 7) continue;
  const [id, url, status, startedAt, completedAt, reportNum, scoreStr] = fields;
  if (status !== 'completed') continue;
  const score = parseFloat(scoreStr);
  if (isNaN(score) || score < minScore) continue;
  const original = inputByID.get(id);
  if (!original) continue;
  scored.push({
    id,
    url: url || original.url,
    source: original.source,
    notes: original.notes,
    score,
    reportNum,
  });
}

// Sort by score descending
scored.sort((a, b) => b.score - a.score);

// Take top N
const top = scored.slice(0, topN);

if (top.length === 0) {
  console.error(`No offers scored >= ${minScore}. Try lowering --min-score.`);
  process.exit(1);
}

console.log(`\nTop ${top.length} offers (score >= ${minScore}):`);
console.log('─'.repeat(80));
for (const [i, o] of top.entries()) {
  console.log(`  ${(i + 1).toString().padStart(2)}. [${o.score.toFixed(1)}] ${o.notes.substring(0, 70)}`);
}
console.log('─'.repeat(80));

if (dryRun) {
  console.log('\n[dry-run] Would write to:', outputPath);
  process.exit(0);
}

// Write new batch-input with fresh IDs (so deep pass runs as a new batch)
const header = 'id\turl\tsource\tnotes';
const rows = top.map((o, i) => `${i + 1}\t${o.url}\t${o.source}\t[SCORE ${o.score.toFixed(1)}] ${o.notes}`);
writeFileSync(outputPath, [header, ...rows].join('\n') + '\n', 'utf8');

console.log(`\n✓ Wrote ${top.length} offers to ${outputPath}`);
console.log('\nNext step (deep pass):');
console.log(`  cp ${outputPath} batch/batch-input.tsv`);
console.log(`  rm -f batch/batch-state.tsv  # reset state for new batch`);
console.log(`  bash batch/batch-runner.sh --parallel 3  # uses Sonnet 4.5 by default`);
console.log(`  # or: CLAUDE_MODEL=claude-opus-4-5 bash batch/batch-runner.sh  # for max quality`);
