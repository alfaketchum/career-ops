#!/usr/bin/env node

/**
 * linkedin-scan.mjs — Authenticated LinkedIn job search scanner.
 *
 * ⚠️ OPT-IN ONLY. LinkedIn aggressively detects automated access from
 * authenticated sessions. Heavy use can trigger account restrictions or
 * bans. The DEFAULT scan mode (`node scan.mjs`) uses WebSearch + Playwright
 * liveness verify, which is safer.
 *
 * Use this only when:
 * - You need fresher LinkedIn URLs than Google's cache provides
 * - You want roles that don't appear in Google site: queries
 * - You accept the account-ban risk
 *
 * Mitigation: keep --max small (default 25), don't run more than once a day,
 * use a dedicated/secondary LinkedIn account if possible.
 *
 * Uses Playwright with persistent auth (.playwright-auth/) to query
 * LinkedIn's own search. Returns LIVE URLs only.
 *
 * Reads search keywords from portals.yml -> linkedin.searches.
 *
 * Output: appends new URLs to data/pipeline.md AND data/scan-history.tsv,
 * deduplicating against both.
 *
 * Usage:
 *   node auth-setup.mjs                        # one-time: log in
 *   node linkedin-scan.mjs                     # run scan
 *   node linkedin-scan.mjs --dry-run
 *   node linkedin-scan.mjs --max 30            # max results per query
 *   node linkedin-scan.mjs --query "credit analyst"   # one-off
 *   node scan.mjs --linkedin-auth              # equivalent (called from scan)
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

const AUTH_DIR = resolve('.playwright-auth');
const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY = 'data/scan-history.tsv';
const PIPELINE = 'data/pipeline.md';
const APPLICATIONS = 'data/applications.md';

const TIMEOUT_MS = 25000;

mkdirSync('data', { recursive: true });

// ── args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const maxIdx = args.indexOf('--max');
const maxPerQuery = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 25;
const queryIdx = args.indexOf('--query');
const oneOffQuery = queryIdx >= 0 ? args[queryIdx + 1] : null;

// ── default queries ───────────────────────────────────────────────

const DEFAULT_QUERIES = [
  // f_WT=2 = Remote, sortBy=DD = newest first
  { name: 'LinkedIn — Financial Analyst (Remote)',  q: 'Financial Analyst',  remote: true },
  { name: 'LinkedIn — Credit Analyst (Remote)',     q: 'Credit Analyst',     remote: true },
  { name: 'LinkedIn — Business Analyst (Remote)',   q: 'Business Analyst',   remote: true },
  { name: 'LinkedIn — FP&A (Remote)',               q: 'FP&A',               remote: true },
  { name: 'LinkedIn — BD Partnerships (Remote)',    q: 'Business Development Partnerships', remote: true },
  { name: 'LinkedIn — Strategy Analyst (Remote)',   q: 'Strategy Analyst',   remote: true },
  { name: 'LinkedIn — Influencer Marketing (Remote)', q: 'Influencer Marketing', remote: true },
];

// ── load filters ──────────────────────────────────────────────────

let titleFilter = { positive: [], negative: [], seniority_boost: [] };
let queries = DEFAULT_QUERIES;
if (existsSync(PORTALS_PATH)) {
  const cfg = yaml.load(readFileSync(PORTALS_PATH, 'utf8')) || {};
  if (cfg.title_filter) titleFilter = { ...titleFilter, ...cfg.title_filter };
  if (cfg.linkedin && Array.isArray(cfg.linkedin.searches) && cfg.linkedin.searches.length) {
    queries = cfg.linkedin.searches;
  }
}
if (oneOffQuery) {
  queries = [{ name: 'LinkedIn — ad-hoc', q: oneOffQuery, remote: true }];
}

// ── dedup sources ─────────────────────────────────────────────────

function loadSeenURLs() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY)) {
    for (const line of readFileSync(SCAN_HISTORY, 'utf8').split('\n')) {
      const url = line.split('\t')[0];
      if (url && url.startsWith('http')) seen.add(normalizeURL(url));
    }
  }
  if (existsSync(PIPELINE)) {
    const re = /^- \[[ x]\]\s+(\S+)/;
    for (const line of readFileSync(PIPELINE, 'utf8').split('\n')) {
      const m = re.exec(line.trim());
      if (m) seen.add(normalizeURL(m[1]));
    }
  }
  return seen;
}

function normalizeURL(url) {
  // Strip query params and trailing slash for dedup
  return url.split('?')[0].replace(/\/+$/, '');
}

function passesTitleFilter(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  for (const neg of titleFilter.negative || []) {
    if (lower.includes(neg.toLowerCase())) return false;
  }
  if ((titleFilter.positive || []).length === 0) return true;
  for (const pos of titleFilter.positive || []) {
    if (lower.includes(pos.toLowerCase())) return true;
  }
  return false;
}

// ── scrape one query ──────────────────────────────────────────────

async function scrapeQuery(page, query) {
  const params = new URLSearchParams({
    keywords: query.q,
    sortBy: 'DD',
  });
  if (query.remote) params.set('f_WT', '2');
  const url = `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForTimeout(3500);

  // Scroll a bit to trigger lazy-loaded jobs
  await page.evaluate(() => window.scrollBy(0, 1500));
  await page.waitForTimeout(1500);

  const results = await page.evaluate(() => {
    const out = [];
    const cards = document.querySelectorAll('a[href*="/jobs/view/"]');
    for (const a of cards) {
      const url = a.href.split('?')[0];
      // Job title is usually in an aria-label or inner text
      const title = (a.getAttribute('aria-label') || a.innerText || '').trim().split('\n')[0].trim();
      // Walk up to find a container with company info
      let card = a;
      let company = '';
      for (let i = 0; i < 8 && card; i++) {
        const cText = card.innerText || '';
        if (cText.length > 50 && cText.length < 4000) {
          // Try to extract company line (usually 2nd line in the card)
          const lines = cText.split('\n').map(s => s.trim()).filter(Boolean);
          if (lines.length >= 2) company = lines[1];
          break;
        }
        card = card.parentElement;
      }
      out.push({ url, title, company });
    }
    return out;
  });

  // Dedup within this query by URL
  const seen = new Set();
  return results.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// ── main ──────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(AUTH_DIR)) {
    console.error('ERROR: no auth dir. Run: node auth-setup.mjs first.');
    process.exit(1);
  }

  const seenURLs = loadSeenURLs();
  console.log(`Loaded ${seenURLs.size} previously-seen URLs for dedup`);

  const ctx = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await ctx.newPage();

  const allNew = [];
  const stats = { queries: 0, total: 0, filtered: 0, dup: 0, new: 0 };

  try {
    for (const q of queries) {
      stats.queries++;
      console.log(`\n→ ${q.name}`);
      let results;
      try {
        results = await scrapeQuery(page, q);
      } catch (err) {
        console.error(`  scrape failed: ${err.message}`);
        continue;
      }
      results = results.slice(0, maxPerQuery);
      console.log(`  ${results.length} results`);
      for (const r of results) {
        stats.total++;
        const norm = normalizeURL(r.url);
        if (!passesTitleFilter(r.title)) {
          stats.filtered++;
          continue;
        }
        if (seenURLs.has(norm)) {
          stats.dup++;
          continue;
        }
        seenURLs.add(norm);
        allNew.push({ url: r.url, title: r.title, company: r.company || '?', portal: q.name });
        stats.new++;
      }
    }
  } finally {
    await ctx.close();
  }

  // Output summary
  console.log('\n=== summary ===');
  console.log(`Queries: ${stats.queries} | Found: ${stats.total} | Filtered: ${stats.filtered} | Dup: ${stats.dup} | New: ${stats.new}`);

  if (allNew.length === 0) {
    console.log('No new URLs to add.');
    process.exit(0);
  }

  // Print new URLs
  console.log('\nNew URLs:');
  for (const r of allNew) {
    console.log(`  + ${r.title} @ ${r.company}`);
    console.log(`    ${r.url}`);
  }

  if (dryRun) {
    console.log('\n[dry-run] No files modified.');
    process.exit(0);
  }

  // Write to scan-history.tsv
  const today = new Date().toISOString().split('T')[0];
  if (!existsSync(SCAN_HISTORY)) {
    writeFileSync(SCAN_HISTORY, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf8');
  }
  const histRows = allNew.map(r => `${r.url}\t${today}\t${r.portal}\t${r.title}\t${r.company}\tadded`).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY, histRows, 'utf8');

  // Append to pipeline.md
  const pipeRows = allNew.map(r => `- [ ] ${r.url} | ${r.company} | ${r.title}`).join('\n') + '\n';
  if (!existsSync(PIPELINE)) {
    writeFileSync(PIPELINE, '# Pipeline Inbox\n\n## Pendientes\n\n' + pipeRows, 'utf8');
  } else {
    appendFileSync(PIPELINE, pipeRows, 'utf8');
  }

  console.log(`\n✓ Wrote ${allNew.length} new URLs to ${PIPELINE} and ${SCAN_HISTORY}`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
