#!/usr/bin/env node

/**
 * migrate-to-jobs-tsv.mjs — One-time migration to unified jobs.tsv
 *
 * Merges data from:
 *   - data/scan-history.tsv (all scanned URLs)
 *   - data/pipeline.md (inbox items)
 *   - data/pass-history.tsv (light/deep pass state)
 *
 * Into: data/jobs.tsv (single source of truth)
 *
 * Safe to re-run — deduplicates by URL.
 * Does NOT delete old files (kept as backup).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const SCAN_HISTORY = 'data/scan-history.tsv';
const PIPELINE = 'data/pipeline.md';
const PASS_HISTORY = 'data/pass-history.tsv';
const JOBS_TSV = 'data/jobs.tsv';
const HEADER = 'url\tcompany\trole\tsource\tscan_date\tliveness\tselected\tcv_status\tcv_date\tnotes';

mkdirSync('data', { recursive: true });

function detectSource(url) {
  const low = (url || '').toLowerCase();
  if (low.includes('greenhouse.io')) return 'greenhouse-api';
  if (low.includes('ashbyhq.com')) return 'ashby-api';
  if (low.includes('lever.co')) return 'lever-api';
  if (low.includes('linkedin.com')) return 'linkedin-auth';
  return 'other';
}

function main() {
  const jobs = new Map(); // url -> record

  // 1. Load scan-history.tsv
  if (existsSync(SCAN_HISTORY)) {
    const lines = readFileSync(SCAN_HISTORY, 'utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const [url, firstSeen, portal, title, company, status] = line.split('\t');
      if (!url || !url.startsWith('http')) continue;

      // Determine source from portal field
      let source = detectSource(url);
      if (portal && portal.startsWith('LinkedIn')) source = 'linkedin-auth';
      if (portal && portal.startsWith('site:')) source = 'websearch';

      jobs.set(url, {
        url,
        company: company || '',
        role: title || '',
        source,
        scan_date: firstSeen || '',
        liveness: status === 'added' ? 'unchecked' : 'expired',
        selected: '',
        cv_status: '',
        cv_date: '',
        notes: '',
      });
    }
  }

  // 2. Enrich from pipeline.md
  if (existsSync(PIPELINE)) {
    const content = readFileSync(PIPELINE, 'utf8');
    const re = /^- \[([ x])\]\s+(\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
      const url = m[2].trim();
      const company = m[3].trim();
      const role = m[4].trim();
      const existing = jobs.get(url);
      if (existing) {
        if (!existing.company && company) existing.company = company;
        if (!existing.role && role) existing.role = role;
      } else {
        jobs.set(url, {
          url,
          company,
          role,
          source: detectSource(url),
          scan_date: '',
          liveness: 'unchecked',
          selected: '',
          cv_status: '',
          cv_date: '',
          notes: '',
        });
      }
    }
  }

  // 3. Enrich from pass-history.tsv
  if (existsSync(PASS_HISTORY)) {
    const lines = readFileSync(PASS_HISTORY, 'utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const [url, company, role, lightScore, lightAt, deepReport, deepScore, deepAt] = line.split('\t');
      if (!url || !url.startsWith('http')) continue;

      const existing = jobs.get(url) || {
        url,
        company: '',
        role: '',
        source: detectSource(url),
        scan_date: '',
        liveness: 'unchecked',
        selected: '',
        cv_status: '',
        cv_date: '',
        notes: '',
      };

      if (company && company !== '-') existing.company = company;
      if (role && role !== '-') existing.role = role;

      // If deep pass was done, mark cv_status=done
      if (deepReport && deepReport !== '-') {
        existing.cv_status = 'done';
        existing.cv_date = deepAt && deepAt !== '-' ? deepAt : '';
        existing.notes = `report:${deepReport} score:${deepScore}`;
      } else if (lightScore && lightScore !== '-') {
        existing.notes = `light_score:${lightScore}`;
      }

      jobs.set(url, existing);
    }
  }

  // 4. Write jobs.tsv
  const rows = [HEADER];
  for (const job of jobs.values()) {
    rows.push([
      job.url,
      job.company,
      job.role,
      job.source,
      job.scan_date,
      job.liveness,
      job.selected,
      job.cv_status,
      job.cv_date,
      job.notes,
    ].join('\t'));
  }

  writeFileSync(JOBS_TSV, rows.join('\n') + '\n', 'utf8');

  // Summary
  const total = jobs.size;
  const withDeep = [...jobs.values()].filter(j => j.cv_status === 'done').length;
  console.log(`Migration complete: ${total} URLs merged into ${JOBS_TSV}`);
  console.log(`  ${withDeep} with completed deep pass → cv_status=done`);
  console.log(`  Old files preserved as backup (not deleted)`);
}

main();
