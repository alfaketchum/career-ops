#!/usr/bin/env node

/**
 * cache-company.mjs — Auto-growing company cache
 *
 * After a high-scoring evaluation (>= 3.5), detects the company's ATS
 * from the job URL, infers the careers page, and appends to
 * tracked_companies in portals.yml. Future scans then hit that
 * company's API directly.
 *
 * Usage:
 *   node cache-company.mjs --url <job_url> --company "Name" --score 4.2
 *   node cache-company.mjs --url <job_url> --company "Name" --dry-run
 *   node cache-company.mjs --from-report reports/042-acme-2026-04-14.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'portals.yml';

// ── ATS inference from job URL ─────────────────────────────────────

export function inferCompanyFromUrl(jobUrl) {
  let parsed;
  try {
    parsed = new URL(jobUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname;
  const path = parsed.pathname;

  // Ashby: jobs.ashbyhq.com/{slug}/...
  const ashbyMatch = host === 'jobs.ashbyhq.com' && path.match(/^\/([^/?#]+)/);
  if (ashbyMatch) {
    const slug = ashbyMatch[1];
    return {
      slug,
      careersUrl: `https://jobs.ashbyhq.com/${slug}`,
      apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
      atsType: 'ashby',
    };
  }

  // Lever: jobs.lever.co/{slug}/...
  const leverMatch = host === 'jobs.lever.co' && path.match(/^\/([^/?#]+)/);
  if (leverMatch) {
    const slug = leverMatch[1];
    return {
      slug,
      careersUrl: `https://jobs.lever.co/${slug}`,
      apiUrl: `https://api.lever.co/v0/postings/${slug}`,
      atsType: 'lever',
    };
  }

  // Greenhouse: job-boards.greenhouse.io/{slug}/... or job-boards.eu.greenhouse.io/{slug}/...
  const ghMatch = /^job-boards(?:\.eu)?\.greenhouse\.io$/.test(host) && path.match(/^\/([^/?#]+)/);
  if (ghMatch) {
    const slug = ghMatch[1];
    return {
      slug,
      careersUrl: `https://${host}/${slug}`,
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      atsType: 'greenhouse',
    };
  }

  // Greenhouse: boards.greenhouse.io/{slug}/...
  const ghBoardsMatch = host === 'boards.greenhouse.io' && path.match(/^\/([^/?#]+)/);
  if (ghBoardsMatch) {
    const slug = ghBoardsMatch[1];
    return {
      slug,
      careersUrl: `https://boards.greenhouse.io/${slug}`,
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      atsType: 'greenhouse',
    };
  }

  // BambooHR: {co}.bamboohr.com/careers/...
  const bambooMatch = host.match(/^(.+)\.bamboohr\.com$/);
  if (bambooMatch) {
    const slug = bambooMatch[1];
    return {
      slug,
      careersUrl: `https://${slug}.bamboohr.com/careers/list`,
      apiUrl: null,
      atsType: 'bamboohr',
    };
  }

  // Teamtailor: {co}.teamtailor.com/jobs/...
  const ttMatch = host.match(/^(.+)\.teamtailor\.com$/);
  if (ttMatch) {
    const slug = ttMatch[1];
    return {
      slug,
      careersUrl: `https://${slug}.teamtailor.com/jobs`,
      apiUrl: `https://${slug}.teamtailor.com/jobs.rss`,
      atsType: 'teamtailor',
    };
  }

  // Workday: {co}.{shard}.myworkdayjobs.com/...
  const wdMatch = host.match(/^(.+)\.myworkdayjobs\.com$/);
  if (wdMatch) {
    return {
      slug: wdMatch[1],
      careersUrl: `https://${host}${path.split('/').slice(0, 2).join('/')}`,
      apiUrl: null,
      atsType: 'workday',
    };
  }

  // Unknown ATS — store origin as careers_url
  return {
    slug: host.replace(/^www\./, '').split('.')[0],
    careersUrl: parsed.origin,
    apiUrl: null,
    atsType: 'unknown',
  };
}

// ── Dedup check ────────────────────────────────────────────────────

function normalizeUrl(url) {
  return (url || '').toLowerCase().replace(/\/+$/, '');
}

export function isAlreadyTracked(trackedCompanies, candidate) {
  if (!Array.isArray(trackedCompanies)) return false;

  const candidateUrl = normalizeUrl(candidate.careersUrl);
  const candidateName = (candidate.name || '').toLowerCase().trim();

  return trackedCompanies.some(tc => {
    // Match by careers_url
    if (candidateUrl && normalizeUrl(tc.careers_url) === candidateUrl) return true;
    // Match by name (case-insensitive)
    if (candidateName && (tc.name || '').toLowerCase().trim() === candidateName) return true;
    return false;
  });
}

// ── Cache writer (comment-preserving) ──────────────────────────────

export function cacheCompany({ name, careersUrl, apiUrl, atsType, score, dryRun }) {
  if (!existsSync(PORTALS_PATH)) {
    return { added: false, reason: 'portals.yml not found' };
  }

  const raw = readFileSync(PORTALS_PATH, 'utf8');
  const config = yaml.load(raw);
  const tracked = config.tracked_companies || [];

  if (isAlreadyTracked(tracked, { name, careersUrl })) {
    return { added: false, reason: `already tracked: ${name}` };
  }

  // Build the YAML entry
  const today = new Date().toISOString().split('T')[0];
  const lines = [];
  lines.push(`  - name: "${name}"`);
  lines.push(`    careers_url: "${careersUrl}"`);
  if (apiUrl) {
    lines.push(`    api: "${apiUrl}"`);
  }
  lines.push(`    ats: "${atsType}"`);
  lines.push(`    notes: "Auto-cached from evaluation (score ${score || '?'}/5, ${today})"`);
  lines.push(`    added: "${today}"`);
  lines.push(`    enabled: true`);
  const entry = lines.join('\n');

  if (dryRun) {
    console.log(`[dry-run] Would add to tracked_companies:\n${entry}`);
    return { added: true, reason: 'dry-run' };
  }

  // Write: handle empty array vs existing entries
  let updated;
  if (raw.includes('tracked_companies: []')) {
    updated = raw.replace('tracked_companies: []', `tracked_companies:\n${entry}`);
  } else if (raw.includes('tracked_companies:')) {
    // Append after the last entry in tracked_companies
    // Find the last non-comment, non-empty line in the tracked_companies section
    const tcIndex = raw.indexOf('tracked_companies:');
    const afterTc = raw.slice(tcIndex);
    const beforeTc = raw.slice(0, tcIndex);

    // Find where tracked_companies content ends (next top-level key or EOF)
    const nextKeyMatch = afterTc.match(/\n[a-zA-Z_][^\n]*:/);
    if (nextKeyMatch) {
      const insertPos = tcIndex + nextKeyMatch.index;
      updated = raw.slice(0, insertPos) + '\n' + entry + '\n' + raw.slice(insertPos);
    } else {
      // tracked_companies is last section — append at end
      updated = raw.trimEnd() + '\n' + entry + '\n';
    }
  } else {
    // No tracked_companies section at all — append
    updated = raw.trimEnd() + '\n\ntracked_companies:\n' + entry + '\n';
  }

  writeFileSync(PORTALS_PATH, updated, 'utf8');
  console.log(`✓ Cached: ${name} (${atsType}) → tracked_companies`);
  return { added: true, reason: `added ${name}` };
}

// ── Report parser ──────────────────────────────────────────────────

function parseReport(reportPath) {
  if (!existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    process.exit(1);
  }
  const content = readFileSync(reportPath, 'utf8');

  const urlMatch = content.match(/\*\*URL:\*\*\s*(.+)/);
  const scoreMatch = content.match(/\*\*Score:\*\*\s*([\d.]+)/);
  // Company from filename: {###}-{company-slug}-{date}.md
  const fileMatch = reportPath.match(/\d+-(.+?)-\d{4}-\d{2}-\d{2}\.md$/);

  const url = urlMatch ? urlMatch[1].trim() : null;
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
  const companySlug = fileMatch ? fileMatch[1] : null;
  // Convert slug to title case
  const company = companySlug
    ? companySlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : null;

  return { url, score, company };
}

// ── CLI ────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  const hasFlag = (flag) => args.includes(flag);

  const dryRun = hasFlag('--dry-run');
  const reportPath = getArg('--from-report');

  let url, company, score;

  if (reportPath) {
    const parsed = parseReport(reportPath);
    url = parsed.url;
    company = parsed.company;
    score = parsed.score;
    if (!url) {
      console.error('Could not extract URL from report');
      process.exit(1);
    }
  } else {
    url = getArg('--url');
    company = getArg('--company');
    score = getArg('--score') ? parseFloat(getArg('--score')) : null;
  }

  if (!url) {
    console.error('Usage: node cache-company.mjs --url <url> --company "Name" [--score N] [--dry-run]');
    console.error('       node cache-company.mjs --from-report <report.md> [--dry-run]');
    process.exit(1);
  }

  const inferred = inferCompanyFromUrl(url);
  if (!inferred) {
    console.error(`Could not infer ATS from URL: ${url}`);
    process.exit(1);
  }

  const name = company || inferred.slug;

  const result = cacheCompany({
    name,
    careersUrl: inferred.careersUrl,
    apiUrl: inferred.apiUrl,
    atsType: inferred.atsType,
    score,
    dryRun,
  });

  if (!result.added) {
    console.log(`⏭ ${result.reason}`);
  }

  process.exit(0);
}

// Only run CLI when invoked directly (not imported)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('cache-company.mjs') ||
  process.argv[1].replace(/\\/g, '/').endsWith('cache-company.mjs')
);
if (isMainModule) {
  main();
}
