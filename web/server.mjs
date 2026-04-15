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
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import {
  parseApplications,
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

// ── scan-verify (batch-liveness) process tracking ───────────────

let scanVerifyProc = null;

function isScanVerifyRunning() {
  return scanVerifyProc != null && scanVerifyProc.exitCode == null;
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

    if (path === '/api/scanner-status') {
      const status = getScannerStatus(careerOpsPath);
      status.authSetupRunning = isAuthSetupRunning();
      return sendJSON(res, status);
    }

    if (path === '/api/scan-progress') {
      const progressPath = join(careerOpsPath, 'data', 'scan-progress.json');
      let data = { status: 'idle', running: isScanVerifyRunning() };
      if (existsSync(progressPath)) {
        try { data = { ...JSON.parse(readFileSync(progressPath, 'utf8')), running: isScanVerifyRunning() }; } catch {}
      }
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
