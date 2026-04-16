#!/usr/bin/env node

/**
 * prepare-batch-input.mjs
 *
 * Populate batch/batch-input.tsv from data/pipeline.md.
 * Appends only URLs that are not already in batch-input.tsv
 * and not already completed (report_num="screen") in batch-state.tsv.
 *
 * Output JSON: { appended, totalPending, inputPath }
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const CWD = process.cwd();
const PIPELINE = join(CWD, 'data', 'pipeline.md');
const INPUT = join(CWD, 'batch', 'batch-input.tsv');
const STATE = join(CWD, 'batch', 'batch-state.tsv');
const HEADER = 'id\turl\tsource\tnotes\n';

function readLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n');
}

function parsePipeline() {
  const rows = [];
  for (const line of readLines(PIPELINE)) {
    const m = /^-\s*\[\s*\]\s*(\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const [, url, company, role] = m;
    if (!/^https?:\/\//.test(url)) continue;
    rows.push({ url, company: company.trim(), role: role.trim() });
  }
  return rows;
}

function existingUrls() {
  const urls = new Set();
  for (const line of readLines(INPUT)) {
    const [id, url] = line.split('\t');
    if (url && /^https?:\/\//.test(url)) urls.add(url);
    if (!id && !url) continue;
  }
  return urls;
}

function completedScreenUrls() {
  const urls = new Set();
  for (const line of readLines(STATE)) {
    const f = line.split('\t');
    if (f.length < 7) continue;
    const [, url, status, , , reportNum] = f;
    if (status === 'completed' && reportNum === 'screen' && /^https?:\/\//.test(url)) {
      urls.add(url);
    }
  }
  return urls;
}

function nextId() {
  let maxId = 0;
  for (const line of readLines(INPUT)) {
    const [id] = line.split('\t');
    const n = parseInt(id, 10);
    if (Number.isFinite(n)) maxId = Math.max(maxId, n);
  }
  return maxId + 1;
}

function sourceFromUrl(url) {
  if (url.includes('greenhouse.io')) return 'greenhouse';
  if (url.includes('lever.co')) return 'lever';
  if (url.includes('ashbyhq.com')) return 'ashby';
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('builtin.com')) return 'builtin';
  if (url.includes('remoteok.com')) return 'remoteok';
  if (url.includes('weworkremotely.com')) return 'wwr';
  return 'web';
}

function main() {
  if (!existsSync(INPUT)) {
    writeFileSync(INPUT, HEADER, 'utf8');
  } else {
    const first = readLines(INPUT)[0] || '';
    if (!first.startsWith('id\t')) {
      const body = readFileSync(INPUT, 'utf8');
      writeFileSync(INPUT, HEADER + body, 'utf8');
    }
  }

  const have = existingUrls();
  const done = completedScreenUrls();
  const pipeline = parsePipeline();

  let id = nextId();
  let appended = 0;
  const rowsToAppend = [];
  for (const r of pipeline) {
    if (have.has(r.url) || done.has(r.url)) continue;
    const notes = `${r.company} | ${r.role}`.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    rowsToAppend.push(`${id}\t${r.url}\t${sourceFromUrl(r.url)}\t${notes}`);
    have.add(r.url);
    id++;
    appended++;
  }
  if (rowsToAppend.length) {
    appendFileSync(INPUT, rowsToAppend.join('\n') + '\n', 'utf8');
  }

  let totalPending = 0;
  for (const line of readLines(INPUT)) {
    const [rid, url] = line.split('\t');
    if (!/^\d+$/.test(rid || '')) continue;
    if (!/^https?:\/\//.test(url || '')) continue;
    if (done.has(url)) continue;
    totalPending++;
  }

  process.stdout.write(JSON.stringify({ appended, totalPending, inputPath: INPUT }));
}

main();
