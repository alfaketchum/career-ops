#!/usr/bin/env node
/**
 * batch-liveness.mjs — Check many URLs efficiently in one Playwright session.
 *
 * Two modes:
 *   1. Inline: pass JSON array as argv[2]
 *      node batch-liveness.mjs '[{"url":"...","title":"...","company":"...","query_name":"..."}]'
 *
 *   2. File: pass --input <path> (default: batch/scan-candidates.json)
 *      node batch-liveness.mjs --input batch/scan-candidates.json
 *
 * Writes incremental progress to data/scan-progress.json so the web dashboard
 * can poll for live status. On completion, also appends:
 *   - active URLs to data/pipeline.md
 *   - all results (active + expired) to data/scan-history.tsv
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { classifyLiveness } from './liveness-core.mjs';

const PROGRESS_PATH = 'data/scan-progress.json';
const PIPELINE_PATH = 'data/pipeline.md';
const HISTORY_PATH = 'data/scan-history.tsv';

mkdirSync('data', { recursive: true });

// ── parse args ──────────────────────────────────────────────────

const args = process.argv.slice(2);
let candidates;
const inputIdx = args.indexOf('--input');
if (inputIdx >= 0 && args[inputIdx + 1]) {
  candidates = JSON.parse(readFileSync(args[inputIdx + 1], 'utf8'));
} else if (args[0] && args[0].startsWith('[')) {
  candidates = JSON.parse(args[0]);
} else if (existsSync('batch/scan-candidates.json')) {
  candidates = JSON.parse(readFileSync('batch/scan-candidates.json', 'utf8'));
} else {
  console.error('No candidates. Provide JSON via argv[2] or --input <path>.');
  process.exit(1);
}

// ── progress writer ─────────────────────────────────────────────

function writeProgress(state) {
  try {
    writeFileSync(PROGRESS_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {}
}

const startedAt = new Date().toISOString();
const total = candidates.length;
const state = {
  status: 'running',
  startedAt,
  total,
  checked: 0,
  active: 0,
  expired: 0,
  current: null,
  recentActive: [],
  recentExpired: [],
  finishedAt: null,
};
writeProgress(state);

// ── run ─────────────────────────────────────────────────────────

const ctx = await chromium.launchPersistentContext('.playwright-auth', {
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

const active = [];
const expired = [];

try {
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    state.current = `${c.company} — ${c.title}`;
    writeProgress(state);

    const page = await ctx.newPage();
    try {
      const resp = await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const status = resp ? resp.status() : 0;
      await page.waitForTimeout(1500);
      const finalUrl = page.url();
      const bodyText = await page.evaluate(() => document.body ? document.body.innerText : '');
      const applyControls = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"]'));
        return els
          .filter(el => !el.closest('nav, header, footer'))
          .map(el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim())
          .filter(Boolean);
      });
      const verdict = classifyLiveness({ status, finalUrl, bodyText, applyControls });
      if (verdict.result === 'active') {
        active.push({ ...c, finalUrl });
        state.active++;
        state.recentActive.unshift(`✓ ${c.company} — ${c.title}`);
        state.recentActive = state.recentActive.slice(0, 10);
      } else {
        expired.push({ ...c, reason: verdict.reason, finalUrl });
        state.expired++;
        state.recentExpired.unshift(`✗ ${c.company} — ${verdict.reason}`);
        state.recentExpired = state.recentExpired.slice(0, 10);
      }
    } catch (err) {
      expired.push({ ...c, reason: `error: ${err.message}` });
      state.expired++;
      state.recentExpired.unshift(`✗ ${c.company} — ${err.message}`);
      state.recentExpired = state.recentExpired.slice(0, 10);
    } finally {
      await page.close().catch(() => {});
    }

    state.checked = i + 1;
    state.current = null;
    writeProgress(state);
  }
} finally {
  await ctx.close();
}

// ── write results to pipeline + scan-history ───────────────────

const today = new Date().toISOString().split('T')[0];

if (active.length > 0) {
  if (!existsSync(PIPELINE_PATH)) {
    writeFileSync(PIPELINE_PATH, '# Pipeline Inbox\n\n## Pendientes\n\n', 'utf8');
  }
  const pipeRows = active.map(r => `- [ ] ${r.url} | ${r.company} | ${r.title}`).join('\n') + '\n';
  appendFileSync(PIPELINE_PATH, pipeRows, 'utf8');
}

if (!existsSync(HISTORY_PATH)) {
  writeFileSync(HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf8');
}
const histRows =
  active.map(r => `${r.url}\t${today}\t${r.query_name || ''}\t${r.title}\t${r.company}\tadded`).join('\n') +
  (active.length ? '\n' : '') +
  expired.map(r => `${r.url}\t${today}\t${r.query_name || ''}\t${r.title}\t${r.company}\tskipped_expired`).join('\n') +
  (expired.length ? '\n' : '');
if (histRows) appendFileSync(HISTORY_PATH, histRows, 'utf8');

// ── final state ────────────────────────────────────────────────

state.status = 'completed';
state.finishedAt = new Date().toISOString();
writeProgress(state);

console.log(JSON.stringify({ active: active.length, expired: expired.length, total }));
