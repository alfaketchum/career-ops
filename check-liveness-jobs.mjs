#!/usr/bin/env node

/**
 * check-liveness-jobs.mjs — Check liveness of unchecked URLs in jobs.tsv
 *
 * Reads data/jobs.tsv, finds rows with liveness=unchecked,
 * checks each URL via Playwright + liveness-core.mjs,
 * updates the liveness column in-place.
 *
 * Usage:
 *   node check-liveness-jobs.mjs              # check all unchecked
 *   node check-liveness-jobs.mjs --limit 20   # check at most 20
 *   node check-liveness-jobs.mjs --dry-run    # preview without writing
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { classifyLiveness } from './liveness-core.mjs';

const JOBS_PATH = 'data/jobs.tsv';
const CONCURRENCY = 3;
const TIMEOUT_MS = 15000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

async function checkUrl(url) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let status = 200;
    page.on('response', r => {
      if (r.url() === url || r.url().startsWith(url.split('?')[0])) {
        status = r.status();
      }
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    } catch (err) {
      if (err.message.includes('net::ERR_') || err.message.includes('Timeout')) {
        return { result: 'expired', reason: err.message.slice(0, 80) };
      }
      throw err;
    }

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

    // Collect apply-related controls
    const applyControls = await page.evaluate(() => {
      const els = document.querySelectorAll('a, button, input[type="submit"]');
      return Array.from(els).map(e => e.textContent || e.value || '').filter(t => t.trim().length > 0 && t.trim().length < 100);
    }).catch(() => []);

    return classifyLiveness({ status, finalUrl, bodyText, applyControls });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function main() {
  if (!existsSync(JOBS_PATH)) {
    console.error('ERROR: data/jobs.tsv not found.');
    process.exit(1);
  }

  const content = readFileSync(JOBS_PATH, 'utf8');
  const lines = content.split('\n');
  const header = lines[0];
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = lines[i].split('\t');
    rows.push({
      fields: f,
      lineIdx: i,
      url: f[0],
      liveness: f[5],
    });
  }

  const unchecked = rows.filter(r => r.liveness === 'unchecked' || r.liveness === '');
  const toCheck = unchecked.slice(0, limit);

  console.log(`Liveness check: ${toCheck.length} URLs to check (${unchecked.length} unchecked total)`);
  if (dryRun) {
    for (const r of toCheck) console.log(`  ${r.url}`);
    console.log('(dry run — no changes)');
    process.exit(0);
  }

  let checked = 0;
  let active = 0;
  let expired = 0;
  let uncertain = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < toCheck.length; i += CONCURRENCY) {
    const batch = toCheck.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async r => {
        const result = await checkUrl(r.url);
        r.fields[5] = result.result; // update liveness column
        checked++;
        if (result.result === 'active') active++;
        else if (result.result === 'expired') expired++;
        else uncertain++;
        const symbol = result.result === 'active' ? '✓' : result.result === 'expired' ? '✗' : '?';
        console.log(`  ${symbol} [${checked}/${toCheck.length}] ${r.fields[2]} — ${r.fields[1]} (${result.reason})`);
        return result;
      })
    );

    // Handle failures
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'rejected') {
        batch[j].fields[5] = 'uncertain';
        uncertain++;
        checked++;
        console.log(`  ! [${checked}/${toCheck.length}] ${batch[j].url} (error: ${results[j].reason?.message || 'unknown'})`);
      }
    }
  }

  // Write updated jobs.tsv
  const outLines = [header];
  for (const r of rows) {
    outLines.push(r.fields.join('\t'));
  }
  writeFileSync(JOBS_PATH, outLines.join('\n') + '\n', 'utf8');

  console.log(`\nDone: ${active} active, ${expired} expired, ${uncertain} uncertain (${checked} checked)`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
