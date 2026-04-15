#!/usr/bin/env node

/**
 * fetch-jd.mjs — Fetch a job description with persistent auth.
 *
 * Uses Playwright with a persistent user-data dir (.playwright-auth/)
 * so login-walled sites (LinkedIn, Glassdoor) work after `node auth-setup.mjs`.
 *
 * Usage:
 *   node fetch-jd.mjs <url>
 *   node fetch-jd.mjs <url> --json   # output as JSON {url, title, company, body, ok, error}
 *   node fetch-jd.mjs <url> --save jds/foo.md   # write to file
 *
 * Exit codes:
 *   0 = success (JD fetched, content non-empty)
 *   1 = error (network, timeout, login required, expired)
 *   2 = bad usage
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { classifyLiveness } from './liveness-core.mjs';

const AUTH_DIR = resolve('.playwright-auth');
const TIMEOUT_MS = 25000;

const args = process.argv.slice(2);
const url = args[0];
const asJson = args.includes('--json');
const saveIdx = args.indexOf('--save');
const savePath = saveIdx >= 0 ? args[saveIdx + 1] : null;

if (!url || !/^https?:\/\//.test(url)) {
  console.error('Usage: node fetch-jd.mjs <url> [--json] [--save path]');
  process.exit(2);
}

function fail(error, extra = {}) {
  if (asJson) {
    console.log(JSON.stringify({ url, ok: false, error, ...extra }));
  } else {
    console.error(`ERROR: ${error}`);
  }
  process.exit(1);
}

function ok(payload) {
  if (asJson) {
    console.log(JSON.stringify({ url, ok: true, ...payload }));
  } else {
    console.log(`# ${payload.title || '(no title)'}\n`);
    if (payload.company) console.log(`Company: ${payload.company}\n`);
    console.log(payload.body || '(empty)');
  }
  if (savePath) {
    mkdirSync(dirname(savePath), { recursive: true });
    const md = `# ${payload.title || '(no title)'}\n\n` +
               (payload.company ? `**Company:** ${payload.company}\n\n` : '') +
               `**URL:** ${url}\n\n---\n\n${payload.body || ''}\n`;
    writeFileSync(savePath, md, 'utf8');
    console.error(`✓ Saved to ${savePath}`);
  }
  process.exit(0);
}

// ── extractors per host ──────────────────────────────────────────

function isLinkedIn(u) { return /linkedin\.com\/jobs/.test(u); }
function isGlassdoor(u) { return /glassdoor\.[a-z]+\/job/i.test(u); }
function isIndeed(u) { return /indeed\.com\/(viewjob|job)/.test(u); }

async function extract(page) {
  // Generic strategy: try JSON-LD JobPosting, then host-specific selectors,
  // then fall back to <main>/<article> body text.
  const data = await page.evaluate(() => {
    const out = { title: '', company: '', body: '' };

    // 1. JSON-LD JobPosting
    const ldNodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (const n of ldNodes) {
      try {
        const parsed = JSON.parse(n.textContent);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item && (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting')))) {
            out.title = item.title || out.title;
            out.company = (item.hiringOrganization && item.hiringOrganization.name) || out.company;
            out.body = item.description || out.body;
          }
        }
      } catch {}
    }

    // 2. host-specific
    const host = location.hostname;
    if (!out.title) {
      out.title = (document.querySelector('h1') || {}).innerText || '';
    }
    if (!out.body) {
      // LinkedIn JD container
      const li = document.querySelector('.jobs-description__content, .show-more-less-html__markup, .jobs-box__html-content');
      if (li) out.body = li.innerText;
    }
    if (!out.body) {
      // Glassdoor
      const gd = document.querySelector('[class*="JobDetails"], [data-test="jobDescriptionContainer"], .jobDescriptionContent');
      if (gd) out.body = gd.innerText;
    }
    if (!out.body) {
      // Generic fallback
      const main = document.querySelector('main') || document.querySelector('article') || document.body;
      out.body = main ? main.innerText.slice(0, 20000) : '';
    }
    if (!out.company) {
      const subtitle = document.querySelector('.topcard__org-name-link, [data-tracking-control-name="public_jobs_topcard-org-name"]');
      if (subtitle) out.company = subtitle.innerText.trim();
    }
    return out;
  });

  return data;
}

// ── login wall detection (host-specific, complements liveness-core) ──

function looksLoggedOut(host, body) {
  if (!body) return false;
  const lower = body.toLowerCase().slice(0, 4000);
  if (host.includes('linkedin.com')) {
    return /sign in to view this job|join now to see|please log in/.test(lower) && !lower.includes('about the job');
  }
  if (host.includes('glassdoor')) {
    return /sign in to|create your account/.test(lower) && lower.length < 1500;
  }
  return false;
}

// LinkedIn-specific: dead job IDs redirect to /jobs/ (the home page).
// Detect this so we can mark as expired instead of returning the home page.
function isLinkedInHomeRedirect(originalUrl, finalUrl) {
  if (!originalUrl.includes('linkedin.com/jobs/view/')) return false;
  // If we navigated to a /jobs/view/ URL but ended up at /jobs/ or /jobs/search,
  // LinkedIn redirected because the job is gone.
  const cleanFinal = finalUrl.split('?')[0].replace(/\/+$/, '');
  return /linkedin\.com\/jobs\/?$/.test(cleanFinal) ||
         cleanFinal.endsWith('/jobs/search') ||
         cleanFinal.includes('/jobs/collections/');
}

// ── main ─────────────────────────────────────────────────────────

async function main() {
  let context, page;
  try {
    if (!existsSync(AUTH_DIR)) {
      console.error(`(no auth dir at ${AUTH_DIR}; run "node auth-setup.mjs" first to log in to LinkedIn/Glassdoor)`);
    }
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    page = await context.newPage();
    const response = await page.goto(url, { timeout: TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    const status = response ? response.status() : 0;

    // Wait for either the JD content to render OR a generic body fallback.
    // Try a few likely selectors, but don't fail if none match.
    const jdSelectors = [
      '[class*="JobDescription"]',
      '[data-test="jobDescriptionContainer"]',
      '.jobs-description__content',
      '.show-more-less-html__markup',
      '.jobs-box__html-content',
      '.jobDescriptionContent',
      'article',
      'main',
    ];
    try {
      await Promise.race(
        jdSelectors.map(sel => page.waitForSelector(sel, { timeout: 6000 }).catch(() => null))
      );
    } catch {}
    // Final settle wait for late JS
    await page.waitForTimeout(1500);

    const finalUrl = page.url();
    const data = await extract(page);
    const host = new URL(finalUrl).hostname;

    // Login wall (host-specific)
    if (looksLoggedOut(host, data.body)) {
      fail('login_required', { hint: 'Run: node auth-setup.mjs to log in.' });
      return;
    }

    // LinkedIn redirected to home page = job is dead
    if (isLinkedInHomeRedirect(url, finalUrl)) {
      fail('expired', { finalUrl, reason: 'LinkedIn redirected to jobs home (job removed)' });
      return;
    }

    // Use the existing shared liveness classifier (DRY with check-liveness.mjs)
    const apply = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"]'));
      return els
        .filter(el => !el.closest('nav, header, footer'))
        .map(el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim())
        .filter(Boolean);
    });
    const verdict = classifyLiveness({ status, finalUrl, bodyText: data.body, applyControls: apply });
    if (verdict.result === 'expired') {
      fail('expired', { finalUrl, reason: verdict.reason });
      return;
    }
    // 'uncertain' is OK — caller decides. We still return the body.

    ok({
      title: (data.title || '').trim().slice(0, 300),
      company: (data.company || '').trim().slice(0, 200),
      body: (data.body || '').trim(),
      liveness: verdict.result,
    });
  } catch (err) {
    fail(`fetch_error: ${err.message}`);
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

main();
