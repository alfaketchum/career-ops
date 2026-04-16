#!/usr/bin/env node

/**
 * websearch-scan.mjs — WebSearch-based job scanner using Anthropic API.
 *
 * Reads search_queries from portals.yml, sends each to Claude with WebSearch,
 * extracts job URLs, deduplicates, checks liveness, writes to jobs.tsv.
 *
 * Requires ANTHROPIC_API_KEY in .env or environment.
 *
 * Usage:
 *   node websearch-scan.mjs                # run all enabled queries
 *   node websearch-scan.mjs --dry-run      # preview queries without running
 *   node websearch-scan.mjs --limit 5      # run at most 5 queries
 *   node websearch-scan.mjs --no-liveness  # skip Playwright liveness check
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'portals.yml';
const JOBS_TSV = 'data/jobs.tsv';
const SCAN_HISTORY = 'data/scan-history.tsv';
const JOBS_HEADER = 'url\tcompany\trole\tsource\tscan_date\tliveness\tselected\tcv_status\tcv_date\tnotes';

mkdirSync('data', { recursive: true });

// Load .env if exists
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noLiveness = args.includes('--no-liveness');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(JOBS_TSV)) {
    for (const line of readFileSync(JOBS_TSV, 'utf8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(normalizeUrl(url));
    }
  }
  if (existsSync(SCAN_HISTORY)) {
    for (const line of readFileSync(SCAN_HISTORY, 'utf8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(normalizeUrl(url));
    }
  }
  return seen;
}

function normalizeUrl(url) {
  return (url || '').split('?')[0].replace(/\/+$/, '');
}

function loadTitleFilter() {
  if (!existsSync(PORTALS_PATH)) return () => true;
  const cfg = yaml.load(readFileSync(PORTALS_PATH, 'utf8')) || {};
  const tf = cfg.title_filter || {};
  const positive = (tf.positive || []).map(k => k.toLowerCase());
  const negative = (tf.negative || []).map(k => k.toLowerCase());

  // Also merge keywords.json
  if (existsSync('data/keywords.json')) {
    try {
      const kw = JSON.parse(readFileSync('data/keywords.json', 'utf8'));
      for (const k of [...(kw.keywords || []), ...(kw.user_added || [])]) {
        if (k.enabled) positive.push(k.term.toLowerCase());
      }
    } catch {}
  }

  const uniquePositive = [...new Set(positive)];

  return (title) => {
    const lower = (title || '').toLowerCase();
    const hasPos = uniquePositive.length === 0 || uniquePositive.some(k => lower.includes(k));
    const hasNeg = negative.some(k => lower.includes(k));
    return hasPos && !hasNeg;
  };
}

async function runWebSearch(query) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Add it to .env or set the environment variable.');

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
    messages: [{
      role: 'user',
      content: `Search for: ${query}\n\nReturn ONLY a JSON array of job postings found. Each entry should have: {"title": "...", "url": "...", "company": "..."}. No explanation, just the JSON array. If no results, return [].`,
    }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  // Extract text content from response
  let text = '';
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
  }

  // Parse JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const jobs = JSON.parse(jsonMatch[0]);
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

async function checkLiveness(url) {
  try {
    const { classifyLiveness } = await import('./liveness-core.mjs');
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let status = 200;
    page.on('response', r => {
      if (r.url().startsWith(url.split('?')[0])) status = r.status();
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (err) {
      await browser.close();
      return 'expired';
    }

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const applyControls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button, input[type="submit"]'))
        .map(e => e.textContent || e.value || '').filter(t => t.trim().length > 0 && t.trim().length < 100);
    }).catch(() => []);

    await browser.close();
    const result = classifyLiveness({ status, finalUrl, bodyText, applyControls });
    return result.result;
  } catch {
    return 'uncertain';
  }
}

async function main() {
  if (!existsSync(PORTALS_PATH)) {
    console.error('ERROR: portals.yml not found.');
    process.exit(1);
  }

  const cfg = yaml.load(readFileSync(PORTALS_PATH, 'utf8')) || {};
  const queries = (cfg.search_queries || []).filter(q => q.enabled !== false);
  const titleFilter = loadTitleFilter();
  const seenUrls = loadSeenUrls();
  const toRun = queries.slice(0, limit);

  console.log(`WebSearch scan: ${toRun.length} queries (${queries.length} total enabled)`);

  if (!process.env.ANTHROPIC_API_KEY && !dryRun) {
    console.error('ERROR: ANTHROPIC_API_KEY not set. Add to .env or environment.');
    process.exit(1);
  }

  if (dryRun) {
    for (const q of toRun) console.log(`  ${q.name}: ${q.query}`);
    console.log('(dry run — no API calls)');
    process.exit(0);
  }

  const date = new Date().toISOString().slice(0, 10);
  const allNew = [];
  let totalFound = 0;
  let filtered = 0;
  let dupes = 0;
  let errors = 0;

  for (const q of toRun) {
    process.stdout.write(`  ${q.name}… `);
    try {
      const jobs = await runWebSearch(q.query);
      totalFound += jobs.length;

      for (const j of jobs) {
        if (!j.url || !j.url.startsWith('http')) continue;
        const norm = normalizeUrl(j.url);
        if (seenUrls.has(norm)) { dupes++; continue; }
        if (!titleFilter(j.title)) { filtered++; continue; }
        seenUrls.add(norm);

        let liveness = 'unchecked';
        if (!noLiveness) {
          liveness = await checkLiveness(j.url);
        }

        allNew.push({
          url: j.url,
          company: j.company || '',
          title: j.title || '',
          source: 'websearch',
          liveness,
          portal: q.name,
        });
      }
      console.log(`${jobs.length} results`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }
  }

  // Write to jobs.tsv
  if (allNew.length > 0) {
    if (!existsSync(JOBS_TSV)) {
      writeFileSync(JOBS_TSV, JOBS_HEADER + '\n', 'utf8');
    }
    const existing = new Set(readFileSync(JOBS_TSV, 'utf8').split('\n').slice(1).map(l => l.split('\t')[0]).filter(Boolean));
    const jobLines = allNew
      .filter(o => !existing.has(o.url))
      .map(o => [o.url, o.company, o.title, o.source, date, o.liveness, '', '', '', ''].join('\t'))
      .join('\n');
    if (jobLines) appendFileSync(JOBS_TSV, jobLines + '\n', 'utf8');

    // Also write to scan-history.tsv
    if (!existsSync(SCAN_HISTORY)) {
      writeFileSync(SCAN_HISTORY, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf8');
    }
    const histLines = allNew
      .map(o => `${o.url}\t${date}\t${o.portal}\t${o.title}\t${o.company}\tadded`)
      .join('\n');
    appendFileSync(SCAN_HISTORY, histLines + '\n', 'utf8');
  }

  // Summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`WebSearch Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Queries run:         ${toRun.length}`);
  console.log(`Total results:       ${totalFound}`);
  console.log(`Filtered by title:   ${filtered}`);
  console.log(`Duplicates:          ${dupes}`);
  console.log(`New jobs added:      ${allNew.length}`);
  if (!noLiveness) {
    const activeCount = allNew.filter(o => o.liveness === 'active').length;
    const expiredCount = allNew.filter(o => o.liveness === 'expired').length;
    console.log(`  Active:            ${activeCount}`);
    console.log(`  Expired:           ${expiredCount}`);
  }
  if (errors) console.log(`Errors:              ${errors}`);
  console.log(`\n→ Review new jobs in the dashboard: npm run web`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
