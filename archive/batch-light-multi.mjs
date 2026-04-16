#!/usr/bin/env node

/**
 * batch-light-multi.mjs — Batched light pass.
 *
 * Groups URLs into chunks and sends each chunk to a single `claude -p`
 * invocation. Cuts per-URL CLI startup tax from ~20s to ~2s.
 *
 * Usage:
 *   node batch-light-multi.mjs --limit 50 --chunk 10 --parallel 3
 *
 * Reads:  batch/batch-input.tsv (pending URLs), data/pass-history.tsv (dedup)
 * Writes: data/pass-history.tsv, batch/batch-state.tsv, batch/logs/multi-*.log
 *
 * Designed to be spawned from the web dashboard's /api/light-pass endpoint.
 * Writes progress in the same shape as batch-runner.sh so the existing
 * dashboard poll works without changes.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { recordLight } from './pass-history.mjs';

const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const LIMIT = parseInt(flag('limit', '50'), 10);
const CHUNK = parseInt(flag('chunk', '10'), 10);
const PARALLEL = parseInt(flag('parallel', '3'), 10);

const INPUT_PATH = 'batch/batch-input.tsv';
const STATE_PATH = 'batch/batch-state.tsv';
const LOGS_DIR = 'batch/logs';
const PROMPT_PATH = 'batch/batch-prompt-screen-multi.md';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';

const STATE_HEADER = 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries';

// ── state helpers ────────────────────────────────────────────────

function initState() {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  if (!existsSync(STATE_PATH)) writeFileSync(STATE_PATH, STATE_HEADER + '\n');
}

function readState() {
  if (!existsSync(STATE_PATH)) return new Map();
  const lines = readFileSync(STATE_PATH, 'utf8').split('\n');
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split('\t');
    if (f.length < 7) continue;
    map.set(f[0], { id: f[0], url: f[1], status: f[2], startedAt: f[3], completedAt: f[4], reportNum: f[5], score: f[6] });
  }
  return map;
}

function writeStateRow(id, url, status, startedAt, completedAt, reportNum, score, error = '-', retries = 0) {
  // Read all rows, upsert this one, rewrite.
  const map = readState();
  map.set(id, { id, url, status, startedAt: startedAt || '-', completedAt: completedAt || '-', reportNum: reportNum || '-', score: String(score) });
  const rows = [STATE_HEADER];
  for (const r of map.values()) {
    rows.push([r.id, r.url, r.status, r.startedAt, r.completedAt, r.reportNum, r.score, error, retries].join('\t'));
  }
  writeFileSync(STATE_PATH, rows.join('\n') + '\n');
}

// ── input ────────────────────────────────────────────────────────

function loadPending() {
  if (!existsSync(INPUT_PATH)) {
    console.error('No batch-input.tsv. Run prepare-batch-input.mjs first.');
    process.exit(1);
  }
  const lines = readFileSync(INPUT_PATH, 'utf8').split('\n');
  const pending = [];
  const state = readState();
  for (let i = 1; i < lines.length; i++) {
    const [id, url, source, notes] = lines[i].split('\t');
    if (!/^\d+$/.test(id || '')) continue;
    if (!/^https?:\/\//.test(url || '')) continue;
    const s = state.get(id);
    if (s && s.status === 'completed' && s.reportNum === 'screen') continue;
    // notes format from prepare script: "Company | Role"
    const [company, ...roleParts] = (notes || '').split(' | ');
    pending.push({ id, url, company: company || source || '', role: roleParts.join(' | ') || '' });
    if (pending.length >= LIMIT) break;
  }
  return pending;
}

// ── chunk runner ─────────────────────────────────────────────────

function buildPrompt(chunk) {
  const lines = ['Score the following postings. Return a JSON array of exactly ' + chunk.length + ' objects in order.\n'];
  chunk.forEach((p, i) => {
    lines.push(`### ${i + 1}`);
    lines.push(`URL: ${p.url}`);
    lines.push(`Company: ${p.company}`);
    lines.push(`Role: ${p.role}`);
    lines.push(`Batch ID: ${p.id}`);
    lines.push('');
  });
  return lines.join('\n');
}

function runChunk(chunk) {
  return new Promise((resolve) => {
    mkdirSync(LOGS_DIR, { recursive: true });
    const firstId = chunk[0].id;
    const logPath = join(LOGS_DIR, `multi-${firstId}.log`);
    const startedAt = new Date().toISOString().replace(/\.\d{3}/, '');

    for (const p of chunk) {
      writeStateRow(p.id, p.url, 'processing', startedAt, '-', 'screen', '-');
    }

    const promptPath = PROMPT_PATH;
    const userMsg = buildPrompt(chunk);
    const args = ['-p', userMsg, '--model', CLAUDE_MODEL, '--append-system-prompt', `@${promptPath}`];
    const p = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d.toString(); });
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', (err) => {
      writeFileSync(logPath, `[spawn error] ${err.message}\n`);
      finalize({ ok: false, error: err.message });
    });
    p.on('exit', (code) => {
      writeFileSync(logPath, `=== stdout ===\n${stdout}\n=== stderr ===\n${stderr}\n`);
      finalize({ ok: code === 0, code, stdout, stderr });
    });

    function finalize(result) {
      const completedAt = new Date().toISOString().replace(/\.\d{3}/, '');
      let scores = [];
      if (result.ok && result.stdout) {
        // Extract JSON array from stdout (ignore any prose wrapping)
        const m = result.stdout.match(/\[[\s\S]*\]/);
        if (m) {
          try { scores = JSON.parse(m[0]); } catch (e) { /* fall through */ }
        }
      }
      const byId = new Map(scores.map(s => [String(s.id ?? s.batch_id ?? ''), s]));
      for (const p of chunk) {
        const s = byId.get(p.id);
        if (s && s.status === 'completed' && typeof s.score === 'number') {
          recordLight(p.url, { company: p.company, role: p.role, score: s.score });
          writeStateRow(p.id, p.url, 'completed', startedAt, completedAt, 'screen', s.score.toFixed(2));
          console.log(`  ✓ ${p.id} ${p.company} ${s.score}`);
        } else {
          writeStateRow(p.id, p.url, 'failed', startedAt, completedAt, 'screen', '-', (s && s.reason) || 'no-json', 0);
          console.log(`  ✗ ${p.id} ${p.company} — failed`);
        }
      }
      resolve();
    }
  });
}

// ── main ─────────────────────────────────────────────────────────

(async () => {
  initState();
  const pending = loadPending();
  if (!pending.length) {
    console.log('No pending URLs to score.');
    return;
  }
  console.log(`Multi light pass: ${pending.length} URLs, chunk=${CHUNK}, parallel=${PARALLEL}`);

  const chunks = [];
  for (let i = 0; i < pending.length; i += CHUNK) chunks.push(pending.slice(i, i + CHUNK));

  let idx = 0;
  const workers = Array.from({ length: Math.min(PARALLEL, chunks.length) }, async () => {
    while (idx < chunks.length) {
      const mine = chunks[idx++];
      console.log(`chunk ${idx}/${chunks.length} (${mine.length} urls)`);
      await runChunk(mine);
    }
  });
  await Promise.all(workers);
  console.log('=== Multi light pass complete ===');
})();
