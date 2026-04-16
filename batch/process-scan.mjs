#!/usr/bin/env node
// Process scan-candidates.tsv: run check-liveness.mjs sequentially,
// then append results to scan-history.tsv and add actives to pipeline.md.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), '..');
const candidatesFile = path.join(ROOT, 'batch', 'scan-candidates.tsv');
const historyFile = path.join(ROOT, 'data', 'scan-history.tsv');
const pipelineFile = path.join(ROOT, 'data', 'pipeline.md');
const today = new Date().toISOString().slice(0, 10);

const lines = fs.readFileSync(candidatesFile, 'utf8').split(/\r?\n/).filter(l => l.trim());

const results = [];
const activeEntries = [];
const historyRows = [];

let idx = 0;
for (const line of lines) {
  idx++;
  const [url, portal, title, company] = line.split('\t');
  if (!url) continue;

  process.stdout.write(`[${idx}/${lines.length}] ${company} | ${title.slice(0, 50)}... `);

  const res = spawnSync('node', ['check-liveness.mjs', url], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 45000,
  });

  const active = res.status === 0;
  const status = active ? 'added' : 'skipped_expired';
  const out = (res.stdout || '') + (res.stderr || '');
  const reason = active ? 'active' : (out.match(/redirect to .*|expired|404|410/)?.[0] || 'expired/uncertain');

  process.stdout.write(`${active ? 'ACTIVE' : 'EXPIRED'} (${reason.slice(0, 60)})\n`);

  results.push({ url, title, company, active });
  historyRows.push(`${url}\t${today}\t${portal}\t${title}\t${company}\t${status}`);
  if (active) {
    activeEntries.push(`- [ ] ${url} | ${company} | ${title}`);
  }
}

// Append scan history rows
fs.appendFileSync(historyFile, historyRows.join('\n') + '\n');

// Append active entries to pipeline.md
if (activeEntries.length > 0) {
  let pipelineContent = fs.readFileSync(pipelineFile, 'utf8');
  if (!pipelineContent.endsWith('\n')) pipelineContent += '\n';
  pipelineContent += activeEntries.join('\n') + '\n';
  fs.writeFileSync(pipelineFile, pipelineContent);
}

// Summary
const activeCount = results.filter(r => r.active).length;
const expiredCount = results.length - activeCount;
console.log('\n=== SUMMARY ===');
console.log(`Total checked: ${results.length}`);
console.log(`Active (added to pipeline): ${activeCount}`);
console.log(`Expired (skipped): ${expiredCount}`);

// Breakdown by source
const breakdown = {};
for (const r of results) {
  const src = r.url.includes('linkedin.com') ? 'linkedin'
            : r.url.includes('glassdoor.com') ? 'glassdoor'
            : r.url.includes('builtin.com') ? 'builtin'
            : r.url.includes('weworkremotely.com') ? 'weworkremotely'
            : r.url.includes('cryptojobslist.com') ? 'cryptojobslist'
            : r.url.includes('web3.career') ? 'web3.career'
            : r.url.includes('remoteok.com') ? 'remoteok'
            : r.url.includes('greenhouse.io') ? 'greenhouse'
            : r.url.includes('lever.co') ? 'lever'
            : r.url.includes('ashbyhq.com') ? 'ashby'
            : 'other';
  if (!breakdown[src]) breakdown[src] = { active: 0, expired: 0 };
  if (r.active) breakdown[src].active++;
  else breakdown[src].expired++;
}
console.log('\nBy source:');
for (const [src, counts] of Object.entries(breakdown)) {
  console.log(`  ${src.padEnd(15)} active=${counts.active}  expired=${counts.expired}`);
}
