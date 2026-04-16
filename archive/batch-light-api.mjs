#!/usr/bin/env node

/**
 * batch-light-api.mjs — Light pass via direct Anthropic API.
 *
 * Fastest path:
 *  - One API call per chunk (default 10 URLs) via @anthropic-ai/sdk
 *  - Prompt caching on cv.md + modes/_profile.md + config/profile.yml
 *    → first chunk pays the read cost, subsequent chunks hit cache
 *  - No CLI startup tax per URL
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node batch-light-api.mjs --limit 50 --chunk 10 --parallel 3
 *
 * Reads:  batch/batch-input.tsv, data/pass-history.tsv
 * Writes: data/pass-history.tsv, batch/batch-state.tsv, batch/logs/api-*.log
 *
 * Progress state matches batch-runner.sh --screen so the dashboard displays it
 * without changes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { recordLight } from './pass-history.mjs';

const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const LIMIT = parseInt(flag('limit', '50'), 10);
const CHUNK = parseInt(flag('chunk', '10'), 10);
const PARALLEL = parseInt(flag('parallel', '3'), 10);
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

const INPUT_PATH = 'batch/batch-input.tsv';
const STATE_PATH = 'batch/batch-state.tsv';
const LOGS_DIR = 'batch/logs';
const STATE_HEADER = 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set. Use batch-light-multi.mjs for CLI mode.');
  process.exit(1);
}

const client = new Anthropic();

// ── state helpers (same shape as batch-runner.sh) ────────────────

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
  const map = readState();
  map.set(id, { id, url, status, startedAt: startedAt || '-', completedAt: completedAt || '-', reportNum: reportNum || '-', score: String(score) });
  const rows = [STATE_HEADER];
  for (const r of map.values()) {
    rows.push([r.id, r.url, r.status, r.startedAt, r.completedAt, r.reportNum, r.score, error, retries].join('\t'));
  }
  writeFileSync(STATE_PATH, rows.join('\n') + '\n');
}

// ── system prompt + cache blocks ─────────────────────────────────

const SYSTEM_INSTRUCTIONS = `You score job postings on title + company + candidate profile. Output a JSON array.

You have ONLY the title, company, and URL string. You CANNOT fetch the page — do not try. The title and company string are ALWAYS sufficient input for a heuristic score. Never claim content is "not accessible"; score from what's given.

Scoring (1-5 each, always produce a number):
- Role Fit: does the role title match the target archetypes in the profile? Exact match = 5, related = 3, unrelated = 1. If title is generic (e.g. "Business Analyst"), judge from candidate profile context: score 3 if plausible, 2 if unlikely.
- Company Match: does the company name look like the kind listed in the profile's preferred/vibe section? If unknown, default to 3.
- Remote Hint: "remote" in title or URL = 5; unclear = 3; on-site/hybrid = 1-2.
- Red Flags: 5 clean, 3 neutral, 1 junior/intern/wrong stack/off-target (e.g. Sales when the candidate isn't sales).

Priority score = arithmetic mean of the 4 dimensions.

Output rules:
1. Output ONLY a JSON array, no prose, no markdown fences.
2. Same length and order as the input list.
3. Every object MUST have status="completed" and a numeric score. Never use status="failed" — a generic or vague title gets a middling score, not a failure.
4. Each object: {"status":"completed","id":"<id>","url":"<url>","company":"<co>","role":"<role>","score":<float>,"reason":"<one sentence>"}`;

function loadProfileBlocks() {
  const paths = ['cv.md', 'modes/_profile.md', 'config/profile.yml'];
  const blocks = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    blocks.push({
      type: 'text',
      text: `### ${p}\n\n${readFileSync(p, 'utf8')}`,
      cache_control: { type: 'ephemeral' },
    });
  }
  return blocks;
}

// ── input ────────────────────────────────────────────────────────

function loadPending() {
  if (!existsSync(INPUT_PATH)) {
    console.error('No batch-input.tsv. Run prepare-batch-input.mjs first.');
    process.exit(1);
  }
  const lines = readFileSync(INPUT_PATH, 'utf8').split('\n');
  const state = readState();
  const pending = [];
  for (let i = 1; i < lines.length; i++) {
    const [id, url, source, notes] = lines[i].split('\t');
    if (!/^\d+$/.test(id || '')) continue;
    if (!/^https?:\/\//.test(url || '')) continue;
    const s = state.get(id);
    if (s && s.status === 'completed' && s.reportNum === 'screen') continue;
    const [company, ...roleParts] = (notes || '').split(' | ');
    pending.push({ id, url, company: company || source || '', role: roleParts.join(' | ') || '' });
    if (pending.length >= LIMIT) break;
  }
  return pending;
}

// ── chunk runner ─────────────────────────────────────────────────

function buildUserMessage(chunk) {
  const parts = ['Score these ' + chunk.length + ' postings (same order in output):\n'];
  chunk.forEach((p, i) => {
    parts.push(`${i + 1}. id=${p.id} | URL=${p.url} | Company=${p.company} | Role=${p.role}`);
  });
  return parts.join('\n');
}

const profileBlocks = loadProfileBlocks();

async function runChunk(chunk) {
  const firstId = chunk[0].id;
  const logPath = join(LOGS_DIR, `api-${firstId}.log`);
  mkdirSync(LOGS_DIR, { recursive: true });
  const startedAt = new Date().toISOString().replace(/\.\d{3}/, '');

  for (const p of chunk) {
    writeStateRow(p.id, p.url, 'processing', startedAt, '-', 'screen', '-');
  }

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        { type: 'text', text: SYSTEM_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
        ...profileBlocks,
      ],
      messages: [{ role: 'user', content: buildUserMessage(chunk) }],
    });
  } catch (err) {
    writeFileSync(logPath, `[api error] ${err.message}\n`);
    const completedAt = new Date().toISOString().replace(/\.\d{3}/, '');
    for (const p of chunk) writeStateRow(p.id, p.url, 'failed', startedAt, completedAt, 'screen', '-', err.message, 0);
    return;
  }

  const text = resp.content?.map(b => b.type === 'text' ? b.text : '').join('') || '';
  const cacheStats = resp.usage ? ` cache_read=${resp.usage.cache_read_input_tokens ?? 0} cache_create=${resp.usage.cache_creation_input_tokens ?? 0} in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}` : '';
  writeFileSync(logPath, `=== response ===\n${text}\n=== usage ===\n${JSON.stringify(resp.usage || {}, null, 2)}\n`);

  const completedAt = new Date().toISOString().replace(/\.\d{3}/, '');
  let scores = [];
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try { scores = JSON.parse(match[0]); } catch {}
  }
  const byId = new Map(scores.map(s => [String(s.id ?? ''), s]));
  for (const p of chunk) {
    const s = byId.get(p.id);
    if (s && s.status === 'completed' && typeof s.score === 'number') {
      recordLight(p.url, { company: p.company, role: p.role, score: s.score });
      writeStateRow(p.id, p.url, 'completed', startedAt, completedAt, 'screen', s.score.toFixed(2));
      console.log(`  ✓ ${p.id} ${p.company} ${s.score}${cacheStats}`);
    } else {
      writeStateRow(p.id, p.url, 'failed', startedAt, completedAt, 'screen', '-', (s && s.reason) || 'no-json', 0);
      console.log(`  ✗ ${p.id} ${p.company} — failed`);
    }
  }
}

// ── main ─────────────────────────────────────────────────────────

(async () => {
  initState();
  const pending = loadPending();
  if (!pending.length) {
    console.log('No pending URLs to score.');
    return;
  }
  console.log(`API light pass: ${pending.length} URLs, chunk=${CHUNK}, parallel=${PARALLEL}, model=${MODEL}`);

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
  console.log('=== API light pass complete ===');
})();
