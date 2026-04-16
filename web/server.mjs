#!/usr/bin/env node

/**
 * web/server.mjs — Read-only HTTP dashboard for career-ops.
 *
 * Run:
 *   node web/server.mjs                  # default: localhost:3000, cwd as careerOpsPath
 *   node web/server.mjs --port 8080
 *   PORT=8080 node web/server.mjs
 *   node web/server.mjs --path /path/to/career-ops
 *
 * Then open http://localhost:3000 in your browser.
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, statSync, createWriteStream, openSync, readSync, closeSync, mkdirSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'child_process';
import yaml from 'js-yaml';
import {
  parseApplications,
  parseJobs,
  computeJobStats,
  parsePipelineInbox,
  loadScanStats,
  loadReportSummary,
  computeMetrics,
  computeProgressMetrics,
  computeInboxStats,
  computeOverview,
  readProfileFile,
  readReport,
  getScannerStatus,
  PROFILE_FILES,
} from './parsers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ─────────────────────────────────────────────────────

function getArg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const port = parseInt(getArg('--port', process.env.PORT || '3000'), 10);
const careerOpsPath = resolve(getArg('--path', process.cwd()));

// ── Static file serving ─────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  // Default to index.html
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  // Block path traversal
  if (rel.includes('..')) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  const filePath = join(__dirname, 'static', rel);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
  res.end(readFileSync(filePath));
}

// ── JSON helper ─────────────────────────────────────────────────

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(text);
}

// ── auth-setup process tracking ─────────────────────────────────

let authSetupProc = null;

function isAuthSetupRunning() {
  return authSetupProc != null && authSetupProc.exitCode == null;
}

// ── scan process tracking ──────────────────────────────────────

let scanProc = null;
let scanLog = '';

function isScanRunning() {
  return scanProc != null && scanProc.exitCode == null;
}

// ── liveness check process tracking ────────────────────────────

let livenessProc = null;
let livenessLog = '';

function isLivenessRunning() {
  return livenessProc != null && livenessProc.exitCode == null;
}

// ── scan-verify (batch-liveness) process tracking ───────────────

let scanVerifyProc = null;

function isScanVerifyRunning() {
  return scanVerifyProc != null && scanVerifyProc.exitCode == null;
}

// ── stream-json summarizer ──────────────────────────────────────

function summarizeStreamEvent(j) {
  if (!j || typeof j !== 'object') return null;
  // Anthropic CLI stream-json emits {type, message, …} lines
  if (j.type === 'system' && j.subtype === 'init') return { kind: 'system', text: `session ${j.session_id || ''}` };
  if (j.type === 'assistant' && j.message?.content) {
    for (const b of j.message.content) {
      if (b.type === 'tool_use') {
        const name = b.name || 'tool';
        const input = b.input || {};
        let detail = '';
        if (name === 'Read') detail = input.file_path || '';
        else if (name === 'Edit' || name === 'Write') detail = input.file_path || '';
        else if (name === 'Bash') detail = (input.description || input.command || '').slice(0, 80);
        else if (name === 'WebFetch') detail = input.url || '';
        else if (name === 'WebSearch') detail = input.query || '';
        else if (name === 'Grep' || name === 'Glob') detail = input.pattern || '';
        else detail = Object.keys(input).slice(0, 3).map(k => `${k}=${String(input[k]).slice(0, 40)}`).join(' ');
        return { kind: 'tool', tool: name, detail: detail.slice(0, 120) };
      }
      if (b.type === 'text' && b.text) {
        const t = b.text.trim().slice(0, 160);
        if (t) return { kind: 'say', text: t };
      }
    }
  }
  if (j.type === 'user' && j.message?.content) {
    for (const b of j.message.content) {
      if (b.type === 'tool_result') {
        const content = Array.isArray(b.content) ? b.content.map(c => c.text || '').join(' ') : String(b.content || '');
        return { kind: 'result', text: content.slice(0, 120) };
      }
    }
  }
  if (j.type === 'result') {
    const n = j.num_turns ?? '';
    const cost = j.total_cost_usd ? `$${j.total_cost_usd.toFixed(4)}` : '';
    return { kind: 'done', text: `completed — ${n} turns ${cost}` };
  }
  return null;
}

// ── .env helpers ────────────────────────────────────────────────

function envPath(careerOpsPath) { return join(careerOpsPath, '.env'); }

function readEnvFile(careerOpsPath) {
  const p = envPath(careerOpsPath);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function upsertEnvFile(careerOpsPath, updates) {
  const p = envPath(careerOpsPath);
  const lines = existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/) : [];
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=/.exec(line);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      seen.add(m[1]);
      const val = updates[m[1]];
      if (val) out.push(`${m[1]}=${val}`);
      // if empty, drop the line (effectively deletes the key)
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k) && v) out.push(`${k}=${v}`);
  }
  // Clean trailing blank lines
  while (out.length && !out[out.length - 1].trim()) out.pop();
  writeFileSync(p, out.join('\n') + '\n', { mode: 0o600 });
}

function maskKey(key) {
  if (!key || key.length < 12) return key ? '••••' : '';
  return key.slice(0, 8) + '…' + key.slice(-4);
}

// ── light-pass (batch-runner.sh --screen) process tracking ──────

function resolveBashPath() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    '/usr/bin/bash',
    '/bin/bash',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return 'bash'; // last resort, hope PATH works
}
const BASH_PATH = resolveBashPath();

let lightPassProc = null;
let lightPassRun = null; // { startedAtMs, limit, total }

function isLightPassRunning() {
  return lightPassProc != null && lightPassProc.exitCode == null;
}

function readStateRows(statePath) {
  if (!existsSync(statePath)) return [];
  const lines = readFileSync(statePath, 'utf8').split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = line.split('\t');
    if (f.length < 7) continue;
    rows.push({
      id: f[0],
      url: f[1],
      status: f[2],
      startedAt: f[3],
      completedAt: f[4],
      reportNum: f[5],
      score: f[6],
    });
  }
  return rows;
}

function computeLightPassProgress(careerOpsPath) {
  const statePath = join(careerOpsPath, 'batch', 'batch-state.tsv');
  const rows = readStateRows(statePath).filter(r => r.reportNum === 'screen');
  const running = isLightPassRunning();
  const run = lightPassRun;

  if (!run) {
    const done = rows.filter(r => r.status === 'completed');
    return {
      status: running ? 'running' : 'idle',
      running,
      total: 0,
      checked: 0,
      active: 0,
      recent: [],
      lastCompletedAt: done.length ? done[done.length - 1].completedAt : null,
    };
  }

  const relevant = rows.filter(r => {
    const tStart = Date.parse(r.startedAt || '');
    return Number.isFinite(tStart) && tStart >= run.startedAtMs - 1000;
  });
  const completed = relevant.filter(r => r.status === 'completed');
  const failed = relevant.filter(r => r.status === 'failed');
  const processing = relevant.filter(r => r.status === 'processing' || r.status === 'running');
  const recent = completed.slice(-8).reverse().map(r => {
    const score = r.score && r.score !== '-' ? ` · ${r.score}` : '';
    return `✓ ${r.url.slice(0, 70)}${r.url.length > 70 ? '…' : ''}${score}`;
  });
  const current = processing.slice(-3).map(r => {
    return `⏳ ${r.url.slice(0, 70)}${r.url.length > 70 ? '…' : ''}`;
  });
  return {
    status: running ? 'running' : 'completed',
    running,
    total: run.total,
    checked: completed.length + failed.length,
    active: completed.length,
    failed: failed.length,
    recent,
    current,
    limit: run.limit,
    mode: run.mode,
    startedAt: new Date(run.startedAtMs).toISOString(),
  };
}

function isBatchVerified(progressPath, candidatesPath) {
  if (!existsSync(progressPath) || !existsSync(candidatesPath)) return false;
  try {
    const progress = JSON.parse(readFileSync(progressPath, 'utf8'));
    if (progress.status !== 'completed' || !progress.startedAt) return false;
    const candidatesMtime = statSync(candidatesPath).mtimeMs;
    const startedAtMs = Date.parse(progress.startedAt);
    return Number.isFinite(startedAtMs) && candidatesMtime <= startedAtMs;
  } catch {
    return false;
  }
}

// ── Server ──────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // ── API routes ──
    if (path === '/api/overview') {
      return sendJSON(res, computeOverview(careerOpsPath));
    }

    if (path === '/api/applications') {
      const apps = parseApplications(careerOpsPath);
      // Enrich each with report summary if a report exists
      for (const a of apps) {
        if (a.reportPath) {
          const rp = join(careerOpsPath, a.reportPath);
          const summary = loadReportSummary(rp);
          if (summary) {
            a.archetype = summary.archetype;
            a.tldr = summary.tldr;
            a.remote = summary.remote;
            a.compEstimate = summary.compEstimate;
            if (!a.jobURL && summary.jobURL) a.jobURL = summary.jobURL;
          }
        }
      }
      return sendJSON(res, { applications: apps, metrics: computeMetrics(apps) });
    }

    if (path === '/api/inbox') {
      const items = parsePipelineInbox(careerOpsPath);
      return sendJSON(res, { items, stats: computeInboxStats(items) });
    }

    if (path === '/api/jobs') {
      const jobs = parseJobs(careerOpsPath);
      return sendJSON(res, { jobs, stats: computeJobStats(jobs) });
    }

    if (path === '/api/select' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); if (body.length > 10000) req.destroy(); });
      req.on('end', () => {
        try {
          const { url: targetUrl, selected } = JSON.parse(body);
          if (!targetUrl) return sendJSON(res, { ok: false, error: 'url required' }, 400);
          const jobsPath = join(careerOpsPath, 'data', 'jobs.tsv');
          if (!existsSync(jobsPath)) return sendJSON(res, { ok: false, error: 'jobs.tsv not found' }, 404);
          const lines = readFileSync(jobsPath, 'utf8').split('\n');
          const out = [lines[0]]; // header
          let found = false;
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const f = lines[i].split('\t');
            if (f[0] === targetUrl) {
              f[6] = selected ? 'yes' : '';
              found = true;
            }
            out.push(f.join('\t'));
          }
          if (!found) return sendJSON(res, { ok: false, error: 'URL not found in jobs.tsv' }, 404);
          writeFileSync(jobsPath, out.join('\n') + '\n', 'utf8');
          return sendJSON(res, { ok: true });
        } catch (err) {
          return sendJSON(res, { ok: false, error: err.message }, 400);
        }
      });
      return;
    }

    if (path === '/api/generate-cv' && req.method === 'POST') {
      if (isScanVerifyRunning()) {
        return sendJSON(res, { ok: false, error: 'A batch process is already running.' }, 409);
      }
      const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
      const parallelRaw = parseInt(url.searchParams.get('parallel') || '', 10);
      const parallel = Number.isFinite(parallelRaw) && parallelRaw > 0 ? parallelRaw : 1;
      try {
        scanVerifyProc = spawn(BASH_PATH, [
          join(careerOpsPath, 'batch', 'batch-cv.sh'),
          '--limit', String(limit),
          '--parallel', String(parallel),
        ], {
          cwd: careerOpsPath,
          stdio: 'ignore',
          detached: false,
        });
        scanVerifyProc.on('exit', () => { setTimeout(() => { scanVerifyProc = null; }, 2000); });
        return sendJSON(res, { ok: true, pid: scanVerifyProc.pid });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/cv-progress') {
      const jobs = parseJobs(careerOpsPath);
      const stats = computeJobStats(jobs);
      return sendJSON(res, {
        running: isScanVerifyRunning(),
        selected: stats.selected,
        cvDone: stats.cvDone,
        cvPending: stats.cvPending,
        cvFailed: stats.cvFailed,
      });
    }

    if (path === '/api/keywords') {
      if (req.method === 'GET') {
        const kwPath = join(careerOpsPath, 'data', 'keywords.json');
        if (!existsSync(kwPath)) return sendJSON(res, { keywords: [], user_added: [] });
        try {
          return sendJSON(res, JSON.parse(readFileSync(kwPath, 'utf8')));
        } catch {
          return sendJSON(res, { keywords: [], user_added: [] });
        }
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); if (body.length > 50000) req.destroy(); });
        req.on('end', () => {
          try {
            const update = JSON.parse(body);
            const kwPath = join(careerOpsPath, 'data', 'keywords.json');
            let kw = existsSync(kwPath) ? JSON.parse(readFileSync(kwPath, 'utf8')) : { keywords: [], user_added: [] };

            // Handle toggle
            if (update.action === 'toggle' && update.term) {
              for (const k of kw.keywords) {
                if (k.term === update.term) k.enabled = !k.enabled;
              }
              for (const k of kw.user_added) {
                if (k.term === update.term) k.enabled = !k.enabled;
              }
            }
            // Handle add user keyword
            if (update.action === 'add' && update.term) {
              kw.user_added = kw.user_added || [];
              if (!kw.user_added.some(k => k.term.toLowerCase() === update.term.toLowerCase())) {
                kw.user_added.push({ term: update.term, enabled: true });
              }
            }
            // Handle remove user keyword
            if (update.action === 'remove' && update.term) {
              kw.user_added = (kw.user_added || []).filter(k => k.term !== update.term);
            }
            // Handle accept suggestion
            if (update.action === 'accept-suggestion' && update.term) {
              const existing = new Set(kw.keywords.map(k => k.term.toLowerCase()));
              if (!existing.has(update.term.toLowerCase())) {
                kw.keywords.push({ term: update.term, source: update.source || 'profile', enabled: true });
              }
            }
            // Handle dismiss suggestions
            if (update.action === 'dismiss-suggestions') {
              delete kw.pending_suggestions;
            }

            writeFileSync(kwPath, JSON.stringify(kw, null, 2) + '\n', 'utf8');
            return sendJSON(res, { ok: true, ...kw });
          } catch (err) {
            return sendJSON(res, { ok: false, error: err.message }, 400);
          }
        });
        return;
      }
    }

    if (path === '/api/keywords/regenerate' && req.method === 'POST') {
      try {
        const result = spawnSync('node', ['generate-keywords.mjs'], { cwd: careerOpsPath, encoding: 'utf8', timeout: 10000 });
        if (result.status !== 0) {
          return sendJSON(res, { ok: false, error: result.stderr || 'regeneration failed' }, 500);
        }
        const kwPath = join(careerOpsPath, 'data', 'keywords.json');
        const kw = JSON.parse(readFileSync(kwPath, 'utf8'));
        return sendJSON(res, { ok: true, ...kw });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    // ── Scan now ──
    if (path === '/api/scan-now' && req.method === 'POST') {
      if (isScanRunning()) {
        return sendJSON(res, { ok: false, error: 'A scan is already running.' }, 409);
      }
      const mode = url.searchParams.get('mode') || 'api'; // api, websearch, both
      const includeLinkedin = url.searchParams.get('linkedin') === '1';

      let script, scriptArgs;
      if (mode === 'websearch') {
        script = 'websearch-scan.mjs';
        scriptArgs = [];
      } else if (mode === 'both') {
        // Run scan.mjs first, then websearch-scan.mjs sequentially
        script = null; // handled below
        scriptArgs = [];
      } else {
        script = 'scan.mjs';
        scriptArgs = includeLinkedin ? ['--linkedin-auth'] : [];
      }

      try {
        scanLog = '';
        if (mode === 'both') {
          // Chain: api scan → websearch scan
          scanProc = spawn('node', ['scan.mjs', ...(includeLinkedin ? ['--linkedin-auth'] : [])], {
            cwd: careerOpsPath,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          scanProc.stdout.on('data', d => { scanLog += d.toString(); });
          scanProc.stderr.on('data', d => { scanLog += d.toString(); });
          scanProc.on('exit', (code) => {
            scanLog += `\n--- API scan finished (exit ${code}). Starting WebSearch scan ---\n`;
            const ws = spawn('node', ['websearch-scan.mjs'], {
              cwd: careerOpsPath,
              stdio: ['ignore', 'pipe', 'pipe'],
            });
            scanProc = ws;
            ws.stdout.on('data', d => { scanLog += d.toString(); });
            ws.stderr.on('data', d => { scanLog += d.toString(); });
            ws.on('exit', () => { setTimeout(() => { scanProc = null; }, 2000); });
          });
        } else {
          scanProc = spawn('node', [script, ...scriptArgs], {
            cwd: careerOpsPath,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          scanProc.stdout.on('data', d => { scanLog += d.toString(); });
          scanProc.stderr.on('data', d => { scanLog += d.toString(); });
          scanProc.on('exit', () => { setTimeout(() => { scanProc = null; }, 2000); });
        }
        return sendJSON(res, { ok: true, pid: scanProc.pid, mode });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/scan-now-status') {
      return sendJSON(res, {
        running: isScanRunning(),
        log: scanLog.slice(-2000), // last 2KB
      });
    }

    // ── Liveness check ──
    if (path === '/api/liveness-check' && req.method === 'POST') {
      if (isLivenessRunning()) {
        return sendJSON(res, { ok: false, error: 'A liveness check is already running.' }, 409);
      }
      try {
        livenessLog = '';
        livenessProc = spawn('node', ['check-liveness-jobs.mjs'], {
          cwd: careerOpsPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        });
        livenessProc.stdout.on('data', d => { livenessLog += d.toString(); });
        livenessProc.stderr.on('data', d => { livenessLog += d.toString(); });
        livenessProc.on('exit', () => { setTimeout(() => { livenessProc = null; }, 2000); });
        return sendJSON(res, { ok: true, pid: livenessProc.pid });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/liveness-status') {
      // Parse progress from log — script prints "[N/M]" in every result line
      // and "Liveness check: M URLs to check" at the start.
      const log = livenessLog;
      let total = 0, checked = 0, active = 0, expired = 0, uncertain = 0;
      if (log) {
        const startMatch = log.match(/Liveness check:\s*(\d+)\s*URLs to check/);
        if (startMatch) total = parseInt(startMatch[1], 10);
        // Find the last [N/M] progress marker
        const progressMatches = [...log.matchAll(/\[(\d+)\/(\d+)\]/g)];
        if (progressMatches.length > 0) {
          const last = progressMatches[progressMatches.length - 1];
          checked = parseInt(last[1], 10);
          if (!total) total = parseInt(last[2], 10);
        }
        // Count per-result symbols across all log lines
        active = (log.match(/^\s*\u2713\s*\[/gm) || []).length;
        expired = (log.match(/^\s*\u2717\s*\[/gm) || []).length;
        uncertain = (log.match(/^\s*[?!]\s*\[/gm) || []).length;
        // If "Done:" line present, prefer its counts (more accurate)
        const doneMatch = log.match(/Done:\s*(\d+)\s*active,\s*(\d+)\s*expired,\s*(\d+)\s*uncertain\s*\((\d+)\s*checked\)/);
        if (doneMatch) {
          active = parseInt(doneMatch[1], 10);
          expired = parseInt(doneMatch[2], 10);
          uncertain = parseInt(doneMatch[3], 10);
          checked = parseInt(doneMatch[4], 10);
        }
      }
      return sendJSON(res, {
        running: isLivenessRunning(),
        log: log.slice(-2000),
        progress: { total, checked, active, expired, uncertain },
      });
    }

    if (path === '/api/scan-stats') {
      return sendJSON(res, loadScanStats(careerOpsPath));
    }

    if (path === '/api/progress') {
      const apps = parseApplications(careerOpsPath);
      return sendJSON(res, computeProgressMetrics(apps));
    }

    if (path.startsWith('/api/profile/')) {
      const key = path.slice('/api/profile/'.length);
      if (!Object.keys(PROFILE_FILES).includes(key)) {
        return sendJSON(res, { error: 'unknown profile file', valid: Object.keys(PROFILE_FILES) }, 400);
      }
      const f = readProfileFile(careerOpsPath, key);
      return sendJSON(res, f);
    }

    if (path.startsWith('/api/report/')) {
      const reportPath = decodeURIComponent(path.slice('/api/report/'.length));
      const r = readReport(careerOpsPath, reportPath);
      if (!r) return sendJSON(res, { error: 'not found' }, 404);
      return sendJSON(res, r);
    }

    if (path === '/api/health') {
      return sendJSON(res, { ok: true, careerOpsPath });
    }

    // ── Setup wizard ──
    if (path === '/api/setup-status') {
      const cv = existsSync(join(careerOpsPath, 'cv.md'));
      const profile = existsSync(join(careerOpsPath, 'config', 'profile.yml'));
      const portals = existsSync(join(careerOpsPath, 'portals.yml'));
      const keywords = existsSync(join(careerOpsPath, 'data', 'keywords.json'));
      return sendJSON(res, { cv, profile, portals, keywords, complete: cv && profile && portals && keywords });
    }

    // ── Current values for each onboarding step (used by revisit mode) ──
    if (path === '/api/setup/values') {
      const values = {
        cv: { exists: false, content: '' },
        profile: { exists: false, name: '', email: '', phone: '', location: '', targetRoles: '', salaryRange: '' },
        portals: { exists: false, trackedCompanies: 0, searchQueries: 0, linkedinSearches: 0 },
        keywords: { exists: false, count: 0, enabledCount: 0, generatedAt: '' },
      };

      // CV
      const cvPath = join(careerOpsPath, 'cv.md');
      if (existsSync(cvPath)) {
        values.cv.exists = true;
        try { values.cv.content = readFileSync(cvPath, 'utf8'); } catch {}
      }

      // Profile
      const profilePath = join(careerOpsPath, 'config', 'profile.yml');
      if (existsSync(profilePath)) {
        values.profile.exists = true;
        try {
          const p = yaml.load(readFileSync(profilePath, 'utf8')) || {};
          const c = p.candidate || {};
          values.profile.name = c.full_name || '';
          values.profile.email = c.email || '';
          values.profile.phone = c.phone || '';
          values.profile.location = c.location || '';
          const primary = p.target_roles?.primary || [];
          values.profile.targetRoles = Array.isArray(primary) ? primary.join(', ') : '';
          values.profile.salaryRange = p.compensation?.target_range || '';
        } catch {}
      }

      // Portals summary
      const portalsPath = join(careerOpsPath, 'portals.yml');
      if (existsSync(portalsPath)) {
        values.portals.exists = true;
        try {
          const p = yaml.load(readFileSync(portalsPath, 'utf8')) || {};
          values.portals.trackedCompanies = Array.isArray(p.tracked_companies) ? p.tracked_companies.length : 0;
          values.portals.searchQueries = Array.isArray(p.search_queries) ? p.search_queries.length : 0;
          values.portals.linkedinSearches = p.linkedin?.searches?.length || 0;
        } catch {}
      }

      // Keywords summary
      const kwPath = join(careerOpsPath, 'data', 'keywords.json');
      if (existsSync(kwPath)) {
        values.keywords.exists = true;
        try {
          const kw = JSON.parse(readFileSync(kwPath, 'utf8'));
          const all = [...(kw.keywords || []), ...(kw.user_added || [])];
          values.keywords.count = all.length;
          values.keywords.enabledCount = all.filter(k => k.enabled).length;
          values.keywords.generatedAt = kw.generated_at || '';
        } catch {}
      }

      return sendJSON(res, values);
    }

    if (path === '/api/setup/cv' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); if (body.length > 500000) req.destroy(); });
      req.on('end', () => {
        try {
          const { content } = JSON.parse(body);
          if (!content || !content.trim()) return sendJSON(res, { ok: false, error: 'CV content is empty' }, 400);
          writeFileSync(join(careerOpsPath, 'cv.md'), content.trim() + '\n', 'utf8');
          return sendJSON(res, { ok: true });
        } catch (err) {
          return sendJSON(res, { ok: false, error: err.message }, 400);
        }
      });
      return;
    }

    if (path === '/api/setup/profile' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); if (body.length > 50000) req.destroy(); });
      req.on('end', () => {
        try {
          const { name, email, phone, location, targetRoles, salaryRange } = JSON.parse(body);
          if (!name) return sendJSON(res, { ok: false, error: 'Name is required' }, 400);

          const roles = (targetRoles || '').split(',').map(r => r.trim()).filter(Boolean);
          const profilePath = join(careerOpsPath, 'config', 'profile.yml');
          const configDir = join(careerOpsPath, 'config');
          if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

          // MERGE into existing YAML when present (preserves archetypes, narrative, etc.)
          // When no file exists, fall back to the default template.
          if (existsSync(profilePath)) {
            let existing = {};
            try {
              existing = yaml.load(readFileSync(profilePath, 'utf8')) || {};
            } catch {
              existing = {};
            }

            // Update only the fields the wizard controls
            existing.candidate = {
              ...(existing.candidate || {}),
              full_name: name,
              email: email || '',
              phone: phone || '',
              location: location || '',
            };

            if (roles.length > 0) {
              existing.target_roles = {
                ...(existing.target_roles || {}),
                primary: roles,
              };
              // Regenerate archetypes from roles ONLY if none exist yet
              if (!existing.target_roles.archetypes || existing.target_roles.archetypes.length === 0) {
                existing.target_roles.archetypes = roles.map((r, i) => ({
                  name: r,
                  level: 'Mid-Senior',
                  fit: i === 0 ? 'primary' : i < 3 ? 'primary' : 'secondary',
                }));
              }
            }

            existing.compensation = {
              ...(existing.compensation || {}),
              target_range: salaryRange || (existing.compensation?.target_range || 'Negotiable'),
            };

            // Write back, preserving structure. Comments are lost (acceptable tradeoff).
            const serialized = yaml.dump(existing, { lineWidth: 120, noRefs: true, quotingType: '"' });
            writeFileSync(profilePath, serialized, 'utf8');
            return sendJSON(res, { ok: true, roles, merged: true });
          }

          // First-time setup: use the template structure
          const archetypes = roles.map((r, i) => {
            const fit = i === 0 ? 'primary' : i < 3 ? 'primary' : 'secondary';
            return `    - name: "${r}"\n      level: "Mid-Senior"\n      fit: "${fit}"`;
          }).join('\n');
          const primaryList = roles.map(r => `    - "${r}"`).join('\n');

          const yml = `# Career-Ops Profile Configuration

candidate:
  full_name: "${name}"
  email: "${email || ''}"
  phone: "${phone || ''}"
  location: "${location || ''}"

target_roles:
  primary:
${primaryList || '    - "Analyst"'}
  archetypes:
${archetypes || '    - name: "Analyst"\n      level: "Mid-Senior"\n      fit: "primary"'}

narrative:
  headline: ""
  exit_story: ""
  superpowers: []
  proof_points: []

compensation:
  target_range: "${salaryRange || 'Negotiable'}"
  currency: "USD"
  minimum: ""
  location_flexibility: "${location && location.toLowerCase().includes('remote') ? 'Remote preferred' : 'Open to discussion'}"

location:
  country: ""
  city: "${location || ''}"
  timezone: ""
  visa_status: ""
`;
          writeFileSync(profilePath, yml, 'utf8');
          return sendJSON(res, { ok: true, roles, merged: false });
        } catch (err) {
          return sendJSON(res, { ok: false, error: err.message }, 400);
        }
      });
      return;
    }

    if (path === '/api/setup/portals' && req.method === 'POST') {
      try {
        const templatePath = join(careerOpsPath, 'templates', 'portals.example.yml');
        const destPath = join(careerOpsPath, 'portals.yml');
        if (!existsSync(templatePath)) {
          return sendJSON(res, { ok: false, error: 'templates/portals.example.yml not found' }, 404);
        }
        let content = readFileSync(templatePath, 'utf8');

        // Read target roles from profile to customize title_filter
        const profilePath = join(careerOpsPath, 'config', 'profile.yml');
        if (existsSync(profilePath)) {
          try {
            const profileText = readFileSync(profilePath, 'utf8');
            // Simple YAML extraction — grab lines after "primary:" that start with "    - "
            const primaryMatch = profileText.match(/primary:\n((?:\s+-\s+"[^"]+"\n?)+)/);
            if (primaryMatch) {
              const roles = [...primaryMatch[1].matchAll(/-\s+"([^"]+)"/g)].map(m => m[1]);
              if (roles.length > 0) {
                const roleLines = roles.map(r => `    - "${r}"`).join('\n');
                content = content.replace(
                  /title_filter:\n  positive:\n([\s\S]*?)(?=\n  negative:)/,
                  `title_filter:\n  positive:\n${roleLines}\n`
                );
              }
            }
          } catch {}
        }

        writeFileSync(destPath, content, 'utf8');
        return sendJSON(res, { ok: true });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    // ── Parsed view of portals.yml's search_queries + linkedin.searches ──
    if (path === '/api/portals-queries') {
      try {
        const portalsPath = join(careerOpsPath, 'portals.yml');
        if (!existsSync(portalsPath)) {
          return sendJSON(res, { websearch: [], linkedin: [] });
        }
        const cfg = yaml.load(readFileSync(portalsPath, 'utf8')) || {};

        // Parse search_queries — infer template + keyword from the name prefix.
        // Expected name format: "<Template> — <Keyword>[ (Remote)]"
        const parseName = (name) => {
          const m = /^([^\u2014\-]+?)\s*[\u2014\-]\s*(.+?)(?:\s*\(Remote\))?\s*$/.exec(String(name || ''));
          if (m) return { template: m[1].trim(), keyword: m[2].trim() };
          return { template: 'custom', keyword: String(name || '').trim() };
        };

        const websearch = (cfg.search_queries || []).map(q => {
          const { template, keyword } = parseName(q.name);
          return {
            template,
            keyword,
            name: q.name || '',
            query: q.query || '',
            enabled: q.enabled !== false,
          };
        });

        const linkedin = (cfg.linkedin?.searches || []).map(s => ({
          name: s.name || '',
          keyword: s.q || '',
          remote: !!s.remote,
        }));

        return sendJSON(res, { websearch, linkedin });
      } catch (err) {
        return sendJSON(res, { error: err.message, websearch: [], linkedin: [] }, 500);
      }
    }

    // ── Regenerate portals.yml derived sections from keywords.json ──
    if (path === '/api/regenerate-portals' && req.method === 'POST') {
      try {
        const seedTracked = url.searchParams.get('seed_tracked') === '1';
        const force = url.searchParams.get('force') === '1';
        const scriptArgs = ['regenerate-portals.mjs'];
        if (seedTracked) scriptArgs.push('--seed-tracked');
        if (force) scriptArgs.push('--force');
        const result = spawnSync('node', scriptArgs, {
          cwd: careerOpsPath,
          encoding: 'utf8',
          timeout: 20000,
        });
        if (result.status !== 0) {
          return sendJSON(res, {
            ok: false,
            error: (result.stderr || result.stdout || 'regeneration failed').trim(),
          }, 500);
        }
        return sendJSON(res, { ok: true, output: (result.stdout || '').trim() });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/setup/keywords' && req.method === 'POST') {
      try {
        const result = spawnSync('node', ['generate-keywords.mjs'], { cwd: careerOpsPath, encoding: 'utf8', timeout: 10000 });
        if (result.status !== 0) {
          return sendJSON(res, { ok: false, error: result.stderr || 'keyword generation failed' }, 500);
        }
        const kwPath = join(careerOpsPath, 'data', 'keywords.json');
        const kw = existsSync(kwPath) ? JSON.parse(readFileSync(kwPath, 'utf8')) : { keywords: [], user_added: [] };
        return sendJSON(res, { ok: true, ...kw });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/scanner-status') {
      const status = getScannerStatus(careerOpsPath);
      status.authSetupRunning = isAuthSetupRunning();
      return sendJSON(res, status);
    }

    if (path === '/api/scan-progress') {
      const progressPath = join(careerOpsPath, 'data', 'scan-progress.json');
      const candidatesPath = join(careerOpsPath, 'batch', 'scan-candidates.json');
      let data = { status: 'idle', running: isScanVerifyRunning() };
      if (existsSync(progressPath)) {
        try { data = { ...JSON.parse(readFileSync(progressPath, 'utf8')), running: isScanVerifyRunning() }; } catch {}
      }
      data.batchVerified = isBatchVerified(progressPath, candidatesPath);
      data.candidatesAvailable = existsSync(candidatesPath);
      return sendJSON(res, data);
    }

    if (path === '/api/scan-verify' && req.method === 'POST') {
      if (isScanVerifyRunning()) {
        return sendJSON(res, { ok: false, error: 'A liveness scan is already running.' }, 409);
      }
      const candidatesPath = join(careerOpsPath, 'batch', 'scan-candidates.json');
      if (!existsSync(candidatesPath)) {
        return sendJSON(res, { ok: false, error: 'No batch/scan-candidates.json found. Generate one first by running a scan.' }, 400);
      }
      const progressPath = join(careerOpsPath, 'data', 'scan-progress.json');
      if (isBatchVerified(progressPath, candidatesPath)) {
        return sendJSON(res, { ok: false, error: 'This batch has already been verified. Run a new scan to generate fresh candidates.' }, 409);
      }
      try {
        scanVerifyProc = spawn('node', ['batch-liveness.mjs', '--input', 'batch/scan-candidates.json'], {
          cwd: careerOpsPath,
          stdio: 'ignore',
          detached: false,
        });
        scanVerifyProc.on('exit', () => {
          setTimeout(() => { scanVerifyProc = null; }, 2000);
        });
        return sendJSON(res, { ok: true, pid: scanVerifyProc.pid });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/deep-pass-log') {
      const logPath = join(careerOpsPath, 'batch', 'deep-pass-live.log');
      const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      if (!existsSync(logPath)) return sendJSON(res, { offset: 0, size: 0, chunk: '', events: [] });
      const stat = statSync(logPath);
      const size = stat.size;
      if (offset >= size) return sendJSON(res, { offset, size, chunk: '', events: [] });
      // Read from offset to end
      const fd = openSync(logPath, 'r');
      try {
        const len = Math.min(size - offset, 256 * 1024); // cap 256KB per poll
        const buf = Buffer.alloc(len);
        readSync(fd, buf, 0, len, offset);
        const chunk = buf.toString('utf8');
        const events = [];
        for (const line of chunk.split(/\r?\n/)) {
          if (!line.trim()) continue;
          if (line.startsWith('===')) { events.push({ kind: 'marker', text: line }); continue; }
          try {
            const j = JSON.parse(line);
            const ev = summarizeStreamEvent(j);
            if (ev) events.push(ev);
          } catch {
            events.push({ kind: 'raw', text: line.slice(0, 200) });
          }
        }
        return sendJSON(res, { offset: offset + len, size, events });
      } finally {
        closeSync(fd);
      }
    }

    if (path === '/api/debug-bash') {
      const r = spawnSync(BASH_PATH, ['-c', 'echo hello from bash; which claude; pwd'], {
        cwd: careerOpsPath, encoding: 'utf8', timeout: 5000,
      });
      return sendJSON(res, { bashPath: BASH_PATH, status: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error?.message });
    }

    if (path === '/api/light-pass-progress') {
      return sendJSON(res, computeLightPassProgress(careerOpsPath));
    }

    // ── settings (API key management) ──
    if (path === '/api/settings/keys' && req.method === 'GET') {
      const env = readEnvFile(careerOpsPath);
      return sendJSON(res, {
        anthropic: maskKey(env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ''),
      });
    }

    if (path === '/api/settings/keys' && (req.method === 'POST' || req.method === 'DELETE')) {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); if (body.length > 10000) req.destroy(); });
      req.on('end', () => {
        let payload = {};
        if (req.method === 'POST') {
          try { payload = JSON.parse(body || '{}'); } catch {
            return sendJSON(res, { ok: false, error: 'Invalid JSON' }, 400);
          }
        }
        const rawKey = req.method === 'DELETE' ? '' : String(payload.anthropic ?? '').trim();
        if (rawKey && !/^sk-ant-[A-Za-z0-9_\-]{10,}$/.test(rawKey)) {
          return sendJSON(res, { ok: false, error: 'Key does not look like an Anthropic API key (expected sk-ant-…)' }, 400);
        }
        try {
          upsertEnvFile(careerOpsPath, { ANTHROPIC_API_KEY: rawKey });
          if (rawKey) process.env.ANTHROPIC_API_KEY = rawKey;
          else delete process.env.ANTHROPIC_API_KEY;
          return sendJSON(res, { ok: true, anthropic: maskKey(rawKey) });
        } catch (err) {
          return sendJSON(res, { ok: false, error: err.message }, 500);
        }
      });
      return;
    }

    if (path === '/api/light-pass-modes') {
      return sendJSON(res, {
        apiAvailable: !!process.env.ANTHROPIC_API_KEY,
        cliAvailable: true,
        defaultMode: process.env.ANTHROPIC_API_KEY ? 'api' : 'cli',
      });
    }

    if (path === '/api/light-pass' && req.method === 'POST') {
      if (isLightPassRunning()) {
        return sendJSON(res, { ok: false, error: 'A light pass is already running.' }, 409);
      }
      const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
      const mode = url.searchParams.get('mode') === 'api' ? 'api' : 'cli';
      if (mode === 'api' && !process.env.ANTHROPIC_API_KEY) {
        return sendJSON(res, { ok: false, error: 'API mode requires ANTHROPIC_API_KEY env var. Set it or use CLI mode.' }, 400);
      }
      try {
        const prep = spawnSync('node', ['prepare-batch-input.mjs'], { cwd: careerOpsPath, encoding: 'utf8' });
        if (prep.status !== 0) {
          return sendJSON(res, { ok: false, error: `prepare failed: ${prep.stderr || prep.stdout}` }, 500);
        }
        let prepData = {};
        try { prepData = JSON.parse(prep.stdout.trim() || '{}'); } catch {}
        const totalPending = prepData.totalPending || 0;
        if (totalPending === 0) {
          return sendJSON(res, { ok: false, error: 'No pending URLs in pipeline to light-pass.' }, 400);
        }
        const total = Math.min(limit, totalPending);
        lightPassRun = { startedAtMs: Date.now(), limit, total, mode };
        const logPath = join(careerOpsPath, 'batch', 'light-pass.log');
        const logStream = createWriteStream(logPath, { flags: 'w' });
        try {
          if (mode === 'api') {
            lightPassProc = spawn(process.execPath, ['batch-light-api.mjs', '--limit', String(limit), '--chunk', '10', '--parallel', '3'], {
              cwd: careerOpsPath,
              stdio: ['ignore', 'pipe', 'pipe'],
              env: process.env,
            });
          } else {
            lightPassProc = spawn(process.execPath, ['batch-light-multi.mjs', '--limit', String(limit), '--chunk', '10', '--parallel', '3'], {
              cwd: careerOpsPath,
              stdio: ['ignore', 'pipe', 'pipe'],
              env: process.env,
            });
          }
          lightPassProc.stdout.pipe(logStream, { end: false });
          lightPassProc.stderr.pipe(logStream, { end: false });
        } catch (err) {
          lightPassProc = null;
          lightPassRun = null;
          logStream.end();
          return sendJSON(res, { ok: false, error: `spawn failed: ${err.message}` }, 500);
        }
        lightPassProc.on('error', (err) => {
          console.error('[light-pass] spawn error:', err.message);
          lightPassProc = null;
        });
        lightPassProc.on('exit', (code) => {
          console.log(`[light-pass] exited code=${code}`);
          logStream.end();
          setTimeout(() => { lightPassProc = null; }, 2000);
        });
        return sendJSON(res, { ok: true, pid: lightPassProc.pid, total, limit, mode, appended: prepData.appended || 0, logPath: 'batch/light-pass.log' });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/verify-scored' && req.method === 'POST') {
      if (isScanVerifyRunning()) {
        return sendJSON(res, { ok: false, error: 'A liveness scan is already running.' }, 409);
      }
      try {
        scanVerifyProc = spawn(process.execPath, ['verify-scored.mjs'], {
          cwd: careerOpsPath,
          stdio: 'ignore',
          detached: false,
          env: process.env,
        });
        scanVerifyProc.on('error', (err) => { console.error('[verify-scored] spawn error:', err.message); scanVerifyProc = null; });
        scanVerifyProc.on('exit', () => { setTimeout(() => { scanVerifyProc = null; }, 2000); });
        return sendJSON(res, { ok: true, pid: scanVerifyProc.pid });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    if (path === '/api/auth-setup' && req.method === 'POST') {
      if (isAuthSetupRunning()) {
        return sendJSON(res, { ok: false, error: 'Auth setup already running. Close the browser window first.' }, 409);
      }
      try {
        authSetupProc = spawn('node', ['auth-setup.mjs'], {
          cwd: careerOpsPath,
          stdio: 'ignore',
          detached: false,
        });
        authSetupProc.on('exit', () => {
          // keep the proc reference for one more poll cycle, then clear
          setTimeout(() => { authSetupProc = null; }, 2000);
        });
        return sendJSON(res, { ok: true, pid: authSetupProc.pid, message: 'Browser window opening — log in to LinkedIn, then close the window.' });
      } catch (err) {
        return sendJSON(res, { ok: false, error: err.message }, 500);
      }
    }

    // ── Static ──
    if (path.startsWith('/static/')) {
      return serveStatic(req, res, path.slice('/static'.length));
    }
    if (path === '/' || path === '/index.html') {
      return serveStatic(req, res, '/');
    }

    // Fallback: SPA-style — let app handle hash routes
    return serveStatic(req, res, '/');
  } catch (err) {
    console.error('ERROR:', err);
    sendJSON(res, { error: err.message }, 500);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`career-ops dashboard → http://localhost:${port}`);
  console.log(`(serving data from: ${careerOpsPath})`);
  console.log(`Ctrl+C to stop`);
});
