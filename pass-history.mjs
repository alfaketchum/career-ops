#!/usr/bin/env node

/**
 * pass-history.mjs — URL-keyed persistent state for light/deep pass tracking.
 *
 * Single source of truth for "has this URL been light-passed / deep-passed".
 * Survives batch resets, scanner re-runs, and weekly cron cycles.
 *
 * File format: data/pass-history.tsv
 * Columns: url, company, role, light_score, light_at, deep_report, deep_score, deep_at
 *
 * Usage as module:
 *   import { readHistory, isLightDone, isDeepDone, recordLight, recordDeep } from './pass-history.mjs'
 *
 * Usage as CLI:
 *   node pass-history.mjs status                        # show counts
 *   node pass-history.mjs light <url> <company> <role> <score>
 *   node pass-history.mjs deep <url> <report> <score>
 *   node pass-history.mjs query <url>                   # print record
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const HISTORY_PATH = 'data/pass-history.tsv';
const HEADER = 'url\tcompany\trole\tlight_score\tlight_at\tdeep_report\tdeep_score\tdeep_at';

export function readHistory() {
  if (!existsSync(HISTORY_PATH)) return new Map();
  const content = readFileSync(HISTORY_PATH, 'utf8');
  const map = new Map();
  const lines = content.split('\n').filter(l => l.trim());
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split('\t');
    if (fields.length < 8) continue;
    const [url, company, role, lightScore, lightAt, deepReport, deepScore, deepAt] = fields;
    map.set(url, {
      url,
      company: company || '',
      role: role || '',
      lightScore: lightScore === '-' || !lightScore ? null : parseFloat(lightScore),
      lightAt: lightAt === '-' || !lightAt ? null : lightAt,
      deepReport: deepReport === '-' || !deepReport ? null : deepReport,
      deepScore: deepScore === '-' || !deepScore ? null : parseFloat(deepScore),
      deepAt: deepAt === '-' || !deepAt ? null : deepAt,
    });
  }
  return map;
}

function writeHistory(map) {
  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  const rows = [HEADER];
  for (const entry of map.values()) {
    rows.push([
      entry.url,
      entry.company || '',
      entry.role || '',
      entry.lightScore != null ? entry.lightScore.toFixed(2) : '-',
      entry.lightAt || '-',
      entry.deepReport || '-',
      entry.deepScore != null ? entry.deepScore.toFixed(2) : '-',
      entry.deepAt || '-',
    ].join('\t'));
  }
  writeFileSync(HISTORY_PATH, rows.join('\n') + '\n', 'utf8');
}

export function isLightDone(url, history = null) {
  const map = history || readHistory();
  const rec = map.get(url);
  return !!(rec && rec.lightScore != null);
}

export function isDeepDone(url, history = null) {
  const map = history || readHistory();
  const rec = map.get(url);
  return !!(rec && rec.deepReport != null);
}

export function recordLight(url, { company, role, score }) {
  const map = readHistory();
  const today = new Date().toISOString().split('T')[0];
  const existing = map.get(url) || { url };
  existing.url = url;
  existing.company = company || existing.company || '';
  existing.role = role || existing.role || '';
  existing.lightScore = score;
  existing.lightAt = today;
  map.set(url, existing);
  writeHistory(map);
}

export function recordDeep(url, { reportNum, score }) {
  const map = readHistory();
  const today = new Date().toISOString().split('T')[0];
  const existing = map.get(url) || { url };
  existing.url = url;
  existing.deepReport = reportNum;
  existing.deepScore = score;
  existing.deepAt = today;
  map.set(url, existing);
  writeHistory(map);
}

export function status() {
  const map = readHistory();
  let total = 0;
  let light = 0;
  let deep = 0;
  let both = 0;
  for (const rec of map.values()) {
    total++;
    const hasLight = rec.lightScore != null;
    const hasDeep = rec.deepReport != null;
    if (hasLight) light++;
    if (hasDeep) deep++;
    if (hasLight && hasDeep) both++;
  }
  return { total, light, deep, lightOnly: light - both, deepOnly: deep - both, untouched: total - light - deep + both };
}

// ── CLI ────────────────────────────────────────────────────────────

function isMainModule() {
  const p = process.argv[1] || '';
  return p.endsWith('pass-history.mjs') || p.replace(/\\/g, '/').endsWith('pass-history.mjs');
}

function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'status': {
      const s = status();
      console.log(`\npass-history: ${HISTORY_PATH}`);
      console.log('─'.repeat(50));
      console.log(`  Total URLs tracked:    ${s.total}`);
      console.log(`  Light-passed:          ${s.light}`);
      console.log(`  Deep-passed:           ${s.deep}`);
      console.log(`  Both passes done:      ${s.deep - s.deepOnly}`);
      console.log(`  Pending deep:          ${s.lightOnly}`);
      break;
    }
    case 'light': {
      const [, , , url, company, role, scoreStr] = process.argv;
      if (!url || !scoreStr) {
        console.error('Usage: node pass-history.mjs light <url> <company> <role> <score>');
        process.exit(1);
      }
      recordLight(url, { company, role, score: parseFloat(scoreStr) });
      console.log(`✓ Light recorded: ${url} → ${scoreStr}`);
      break;
    }
    case 'deep': {
      const [, , , url, reportNum, scoreStr] = process.argv;
      if (!url || !reportNum || !scoreStr) {
        console.error('Usage: node pass-history.mjs deep <url> <report_num> <score>');
        process.exit(1);
      }
      recordDeep(url, { reportNum, score: parseFloat(scoreStr) });
      console.log(`✓ Deep recorded: ${url} → report ${reportNum}, score ${scoreStr}`);
      break;
    }
    case 'query': {
      const url = process.argv[3];
      if (!url) {
        console.error('Usage: node pass-history.mjs query <url>');
        process.exit(1);
      }
      const map = readHistory();
      const rec = map.get(url);
      if (!rec) {
        console.log('(not in history)');
        process.exit(1);
      }
      console.log(JSON.stringify(rec, null, 2));
      break;
    }
    default:
      console.error('Usage: node pass-history.mjs <status|light|deep|query>');
      process.exit(1);
  }
}

if (isMainModule()) {
  main();
}
