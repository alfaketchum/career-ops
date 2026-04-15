#!/usr/bin/env node

/**
 * auth-setup.mjs — One-time browser login capture.
 *
 * Opens a Chromium window with a persistent user-data directory.
 * You manually log in to LinkedIn and Glassdoor (or any other site).
 * Close the browser when done. Cookies + session are saved to .playwright-auth/.
 *
 * After this, fetch-jd.mjs (and any worker that uses Playwright with the
 * same userDataDir) will be authenticated for those sites.
 *
 * Usage:
 *   node auth-setup.mjs
 *   node auth-setup.mjs --headed=false   # rare — only if running on a remote machine
 */

import { chromium } from 'playwright';
import { resolve } from 'path';

const AUTH_DIR = resolve('.playwright-auth');

const args = process.argv.slice(2);
const headed = !args.includes('--headed=false');

console.log('');
console.log('career-ops — auth setup');
console.log('========================');
console.log(`Auth directory: ${AUTH_DIR}`);
console.log('');
console.log('A Chromium window will open. Log in to:');
console.log('  • LinkedIn   → https://www.linkedin.com/login');
console.log('  • Glassdoor  → https://www.glassdoor.com/profile/login_input.htm');
console.log('  • (any other login-walled site you want to scrape)');
console.log('');
console.log('When done, simply CLOSE the browser window. Sessions persist.');
console.log('');

const context = await chromium.launchPersistentContext(AUTH_DIR, {
  headless: !headed,
  viewport: { width: 1280, height: 800 },
  args: ['--disable-blink-features=AutomationControlled'],
});

// Open a tab pre-pointed at LinkedIn login
const page = context.pages()[0] || await context.newPage();
await page.goto('https://www.linkedin.com/login');

console.log('Browser opened. Log in, then close the window.');

// Wait until all pages are closed
await new Promise((resolveProm) => {
  context.on('close', resolveProm);
});

console.log('');
console.log('✓ Auth state saved to', AUTH_DIR);
console.log('  Re-run this script anytime your session expires.');
process.exit(0);
