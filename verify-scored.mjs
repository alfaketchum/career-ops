#!/usr/bin/env node

/**
 * verify-scored.mjs — Playwright liveness check on every light-scored URL.
 *
 * Reads:  data/pass-history.tsv (URLs with a light_score)
 * Writes: data/dead-urls.tsv (dead URLs with reason + checked date)
 *         data/scan-progress.json (live progress for the dashboard)
 *
 * Usage:
 *   node verify-scored.mjs [--limit N]
 *
 * Runs headlessly. Uses the persistent auth profile so LinkedIn/Glassdoor
 * URLs render properly. Skips URLs already verified today (by default).
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { classifyLiveness } from './liveness-core.mjs';

const HISTORY_PATH = 'data/pass-history.tsv';
const DEAD_PATH = 'data/dead-urls.tsv';
const PROGRESS_PATH = 'data/scan-progress.json';
const DEAD_HEADER = 'url\treason\tchecked_at';
const TODAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

function readScored() {
  if (!existsSync(HISTORY_PATH)) return [];
  const lines = readFileSync(HISTORY_PATH, 'utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split('\t');
    if (f.length < 8) continue;
    const [url, company, role, lightScore] = f;
    if (!url || !/^https?:\/\//.test(url)) continue;
    if (!lightScore || lightScore === '-') continue;
    out.push({ url, company, role });
  }
  return out;
}

function readDead() {
  if (!existsSync(DEAD_PATH)) return new Set();
  const lines = readFileSync(DEAD_PATH, 'utf8').split('\n');
  const s = new Set();
  for (let i = 1; i < lines.length; i++) {
    const [url] = lines[i].split('\t');
    if (url) s.add(url);
  }
  return s;
}

function appendDead(url, reason) {
  mkdirSync(dirname(DEAD_PATH), { recursive: true });
  if (!existsSync(DEAD_PATH)) writeFileSync(DEAD_PATH, DEAD_HEADER + '\n');
  const safe = reason.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').slice(0, 200);
  appendFileSync(DEAD_PATH, `${url}\t${safe}\t${TODAY}\n`);
}

function writeProgress(state) {
  try {
    writeFileSync(PROGRESS_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {}
}

// ── run ─────────────────────────────────────────────────────────

const scored = readScored();
const dead = readDead();
const todo = scored.filter(r => !dead.has(r.url)).slice(0, LIMIT);

if (!todo.length) {
  console.log(`No URLs to verify (${scored.length} scored, ${dead.size} already marked dead).`);
  process.exit(0);
}

const state = {
  status: 'running',
  mode: 'scored-verify',
  startedAt: new Date().toISOString(),
  total: todo.length,
  checked: 0,
  active: 0,
  expired: 0,
  current: null,
  recentActive: [],
  recentExpired: [],
  finishedAt: null,
};
writeProgress(state);

const ctx = await chromium.launchPersistentContext('.playwright-auth', {
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

let newDead = 0;
try {
  for (const r of todo) {
    state.current = `${r.company} — ${r.role}`;
    writeProgress(state);

    const page = await ctx.newPage();
    try {
      const resp = await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
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
      state.checked++;
      if (verdict.result === 'active') {
        state.active++;
        state.recentActive.unshift(`✓ ${r.company} — ${r.role}`);
        state.recentActive = state.recentActive.slice(0, 10);
      } else {
        state.expired++;
        appendDead(r.url, verdict.reason);
        newDead++;
        state.recentExpired.unshift(`✗ ${r.company} — ${verdict.reason}`);
        state.recentExpired = state.recentExpired.slice(0, 10);
      }
    } catch (err) {
      state.checked++;
      state.expired++;
      appendDead(r.url, `error: ${err.message}`);
      newDead++;
      state.recentExpired.unshift(`✗ ${r.company} — ${err.message}`);
      state.recentExpired = state.recentExpired.slice(0, 10);
    } finally {
      await page.close().catch(() => {});
    }
    writeProgress(state);
  }
} finally {
  await ctx.close().catch(() => {});
}

state.status = 'completed';
state.finishedAt = new Date().toISOString();
state.current = null;
writeProgress(state);

console.log(`\nDone: ${state.active} active, ${state.expired} expired. New dead URLs recorded: ${newDead}.`);
