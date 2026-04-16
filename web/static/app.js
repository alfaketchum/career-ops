// career-ops dashboard frontend — vanilla JS, hash routing, polling refresh.

const $ = (sel, ctx = document) => ctx.querySelector(sel);

function formatDeepEvent(ev) {
  if (!ev) return '';
  const palette = { marker: 'var(--yellow)', system: 'var(--muted)', tool: 'var(--blue)', say: 'var(--text)', result: 'var(--subtext)', done: 'var(--green)', raw: 'var(--muted)' };
  const color = palette[ev.kind] || 'var(--text)';
  if (ev.kind === 'tool') {
    return `<div style="color: ${color};">◆ <strong>${escapeHTML(ev.tool)}</strong> <span style="color: var(--subtext);">${escapeHTML(ev.detail)}</span></div>`;
  }
  if (ev.kind === 'say') {
    return `<div style="color: ${color}; padding-left: 14px;">${escapeHTML(ev.text)}</div>`;
  }
  if (ev.kind === 'result') {
    return `<div style="color: ${color}; padding-left: 14px; font-style: italic;">↳ ${escapeHTML(ev.text)}</div>`;
  }
  if (ev.kind === 'done') {
    return `<div style="color: ${color}; font-weight: 600;">✓ ${escapeHTML(ev.text)}</div>`;
  }
  if (ev.kind === 'marker') {
    return `<div style="color: ${color}; font-weight: 600; margin-top: 6px;">${escapeHTML(ev.text)}</div>`;
  }
  return `<div style="color: ${color};">${escapeHTML(ev.text || '')}</div>`;
}
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const tabs = ['overview', 'profile', 'keywords', 'scanner', 'jobs', 'tracker', 'progress', 'settings'];
const renderers = {};
let currentTab = 'overview';
let pollTimer = null;
let jobsFilter = 'all';
let trackerFilter = 'all';
let profileFile = 'profile';

// Navigation icons (inline SVG for crispness — Lucide-inspired)
const NAV_ICONS = {
  overview: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  profile: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  keywords: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h.01"/><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg>',
  scanner: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  jobs: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  tracker: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>',
  progress: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 17 4-4 4 4 6-6"/></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  setup: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>',
};

// ── Hero stats & next step bar ──────────────────────────────────

async function updateHero() {
  try {
    const ov = await fetchJSON('/api/overview');
    const jobs = ov.jobs || {};
    const tracker = ov.tracker || {};

    const statsEl = $('#hero-stats');
    if (statsEl) {
      statsEl.innerHTML = [
        { value: jobs.total || 0, label: 'Total Jobs' },
        { value: tracker.byStatus?.applied || 0, label: 'Applied' },
        { value: (tracker.byStatus?.interview || 0) + (tracker.byStatus?.offer || 0), label: 'Interviews' },
        { value: tracker.avgScore ? tracker.avgScore.toFixed(1) : '\u2014', label: 'Avg Score' },
      ].map(s => `
        <div class="hero-stat">
          <span class="hero-stat-value">${s.value}</span>
          <span class="hero-stat-label">${s.label}</span>
        </div>
      `).join('');
    }

    const nextEl = $('#next-step');
    if (nextEl) {
      let msg, href;
      if (jobs.total === 0) {
        msg = 'Run your first scan to find job opportunities';
        href = '#/overview';
      } else if (jobs.unchecked > 0) {
        msg = `Check liveness for ${jobs.unchecked} unchecked jobs`;
        href = '#/overview';
      } else if (jobs.active > 0 && jobs.selected === 0) {
        msg = `Review ${jobs.active} active jobs and select the best matches`;
        href = '#/jobs';
      } else if (jobs.selected > 0 && jobs.cvDone < jobs.selected) {
        msg = `Generate CVs for ${jobs.selected - jobs.cvDone} selected jobs`;
        href = '#/overview';
      } else {
        msg = 'Run a scan to find new opportunities';
        href = '#/overview';
      }
      nextEl.innerHTML = `
        <div class="next-step-inner">
          <span class="next-step-text">Next: ${msg}</span>
          <a href="${href}" class="next-step-go">Go \u2192</a>
        </div>
      `;
    }
  } catch (e) {
    // Hero update is non-critical — don't block tab render
  }
}

// ── helpers ─────────────────────────────────────────────────────

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  return r.json();
}

function setStatus(ok) {
  $('#connection-status').classList.toggle('error', !ok);
  $('#last-updated').textContent = new Date().toLocaleTimeString();
}

function scoreCls(score) {
  if (!score) return 'zero';
  if (score >= 4.0) return 'good';
  if (score >= 3.0) return 'ok';
  return 'bad';
}

function bar(value, max, cls) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="bar"><div class="bar-fill ${cls}" style="width: ${pct}%"></div></div>`;
}

// ── Overview ───────────────────────────────────────────────────

renderers.overview = async function () {
  const [ov, cvProg] = await Promise.all([
    fetchJSON('/api/overview'),
    fetchJSON('/api/cv-progress'),
  ]);

  const jobs = ov.jobs || {};
  const max = Math.max(jobs.total || 1, ov.scan?.added || 1);

  const funnel = [
    { label: 'Scanned',    val: jobs.total,    cls: 'scanner' },
    { label: 'Active',     val: jobs.active,   cls: 'inbox' },
    { label: 'Selected',   val: jobs.selected, cls: 'light' },
    { label: 'CV done',    val: jobs.cvDone,   cls: 'applied' },
    { label: 'Applied',    val: ov.tracker?.byStatus?.applied || 0, cls: 'deep' },
  ];

  const funnelHTML = funnel.map(f =>
    `<div class="funnel-row">
       <span class="label">${f.label}</span>
       ${bar(f.val, max, f.cls)}
       <span class="count">${f.val}</span>
     </div>`
  ).join('');

  const statListHTML = (lines) =>
    `<div class="stat-list">
       ${lines.map(([k, v, cls]) =>
         `<div class="stat-row"><span class="key">${k}</span><span class="val ${cls || ''}">${v}</span></div>`
       ).join('')}
     </div>`;

  const scanLines = [
    ['Total scanned', jobs.total, ''],
    ['Active', jobs.active, 'good'],
    ['Expired', jobs.expired, 'muted'],
    ['Uncertain', jobs.uncertain, 'warn'],
    ['Unchecked', jobs.unchecked, jobs.unchecked > 0 ? 'warn' : ''],
    ['Last scan', ov.lastScanDate || '\u2014', ''],
  ];

  const cvLines = [
    ['Selected for CV', jobs.selected, ''],
    ['CV generated', jobs.cvDone, 'good'],
    ['Generating', cvProg.cvPending || 0, 'warn'],
    ['Failed', cvProg.cvFailed || 0, cvProg.cvFailed ? 'bad' : 'muted'],
  ];

  const trackerLines = [
    ['Total apps', ov.tracker?.total || 0, ''],
    ['Avg score', ov.tracker?.avgScore ? ov.tracker.avgScore.toFixed(2) : '\u2014', 'good'],
    ['Top score', ov.tracker?.topScore ? ov.tracker.topScore.toFixed(2) : '\u2014', 'good'],
    ['With PDF', ov.tracker?.withPDF || 0, ''],
  ];

  const statusBreakdownHTML = ov.tracker?.byStatus
    ? Object.entries(ov.tracker.byStatus).map(([k, v]) => `<span class="status-tag ${k}">${k}: ${v}</span>`).join(' ')
    : '';

  const cvRunning = cvProg.running;
  const cvBtnLabel = cvRunning ? 'Generating CVs\u2026' : `Generate CVs (${jobs.selected} selected)`;
  const cvBtnDisabled = cvRunning || jobs.selected === 0 ? 'disabled' : '';

  const html = `
    <div class="section">
      <h2>Pipeline</h2>
      <div class="funnel">${funnelHTML}</div>
    </div>

    <div class="cards">
      <div class="section">
        <h2>Jobs</h2>
        ${statListHTML(scanLines)}
      </div>
      <div class="section">
        <h2>CV Generation</h2>
        ${statListHTML(cvLines)}
        <div style="margin-top: 12px;">
          <button class="btn btn-primary" id="gen-cv-btn" ${cvBtnDisabled}>${cvBtnLabel}</button>
        </div>
      </div>
      <div class="section">
        <h2>Applications</h2>
        ${statListHTML(trackerLines)}
        <div style="margin-top: 10px;">${statusBreakdownHTML || '<span class="muted">no applications yet</span>'}</div>
      </div>
    </div>
  `;
  $('#content').innerHTML = html;

  const genCvBtn = $('#gen-cv-btn');
  if (genCvBtn) {
    genCvBtn.addEventListener('click', async () => {
      genCvBtn.disabled = true;
      genCvBtn.textContent = 'Starting\u2026';
      try {
        const r = await fetch('/api/generate-cv', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) { alert(data.error); genCvBtn.disabled = false; return; }
        const interval = setInterval(async () => {
          try {
            const s = await fetchJSON('/api/cv-progress');
            if (!s.running) clearInterval(interval);
            await renderers.overview();
          } catch {}
        }, 3000);
      } catch (err) {
        alert(err.message);
        genCvBtn.disabled = false;
      }
    });
  }
};

// ── Scanner ───────────────────────────────────────────────────

renderers.scanner = async function () {
  const [ov, scanner, scanStatus, livenessStatus] = await Promise.all([
    fetchJSON('/api/overview'),
    fetchJSON('/api/scanner-status'),
    fetchJSON('/api/scan-now-status').catch(() => ({ running: false, log: '' })),
    fetchJSON('/api/liveness-status').catch(() => ({ running: false })),
  ]);

  const jobs = ov.jobs || {};
  const trackedN = scanner.trackedCompaniesCount || 0;
  const queriesN = scanner.searchQueriesCount || 0;
  const linkedinN = scanner.linkedinSearchesCount || 0;
  const hasKey = scanner.hasApiKey;

  // Mode availability
  const apiReady = trackedN > 0;
  const websearchReady = queriesN > 0 && hasKey;
  const linkedinReady = scanner.authEnabled && linkedinN > 0;

  // Dropdown option labels with counts and reasons
  const apiLabel = `API scan \u2014 ${trackedN} tracked ${trackedN === 1 ? 'company' : 'companies'}`;
  const wsLabel = hasKey
    ? `WebSearch \u2014 ${queriesN} ${queriesN === 1 ? 'query' : 'queries'} enabled`
    : `WebSearch \u2014 needs API key`;
  const bothLabel = `Both (API + WebSearch) \u2014 ${trackedN + queriesN} total`;

  // Pick a sensible default: first ready mode
  let defaultMode = 'api';
  if (!apiReady && websearchReady) defaultMode = 'websearch';
  else if (apiReady && websearchReady) defaultMode = 'both';

  // Last scan summary line
  let lastScanHTML = '';
  if (scanner.lastScan && scanner.lastScan.added > 0) {
    const ls = scanner.lastScan;
    const sourceList = ls.sources.length ? ls.sources.join(', ') : 'scan';
    lastScanHTML = `
      <div class="scan-last">
        <span class="scan-last-dot"></span>
        <span>Last scan: added <strong>${ls.added}</strong> ${ls.added === 1 ? 'job' : 'jobs'} from ${sourceList} on ${ls.date}</span>
      </div>
    `;
  } else if (scanner.lastScan) {
    lastScanHTML = `
      <div class="scan-last scan-last-empty">
        <span class="scan-last-dot muted"></span>
        <span>Last scan ran on ${scanner.lastScan.date} but found no new jobs</span>
      </div>
    `;
  }

  // Warning banner when nothing is configured
  let warningHTML = '';
  if (!apiReady && !websearchReady && !linkedinReady) {
    warningHTML = `
      <div class="scan-warning">
        <strong>Nothing configured yet.</strong>
        Add companies to <code>portals.yml &rsaquo; tracked_companies</code>,
        enable <code>search_queries</code> and set an
        <a href="#/settings">Anthropic API key</a>, or
        <a href="#" id="goto-auth">set up LinkedIn auth</a>.
      </div>
    `;
  }

  const scanRunning = scanStatus.running;
  const scanBtnLabel = scanRunning ? 'Scanning\u2026' : 'Scan now';
  const anyReady = apiReady || websearchReady;
  const scanBtnDisabled = scanRunning || !anyReady ? 'disabled' : '';

  const livenessRunning = livenessStatus.running;
  const livenessBtnLabel = livenessRunning ? 'Checking liveness\u2026' : `Check liveness (${jobs.unchecked} unchecked)`;
  const livenessBtnDisabled = livenessRunning || jobs.unchecked === 0 ? 'disabled' : '';

  const authBadge = scanner.authEnabled
    ? `<span class="badge good">enabled</span>`
    : `<span class="badge muted">not configured</span>`;
  const authButton = scanner.authEnabled
    ? `<button class="btn btn-secondary" id="auth-btn" ${scanner.authSetupRunning ? 'disabled' : ''}>Re-authenticate</button>`
    : `<button class="btn btn-primary" id="auth-btn" ${scanner.authSetupRunning ? 'disabled' : ''}>Set up LinkedIn auth</button>`;

  const scanLogPreview = scanStatus.log
    ? `<pre class="scan-log">${escapeHTML(scanStatus.log.slice(-1500))}</pre>`
    : '';

  // Build mode select options with disabled states + reasons
  const modeOptions = [
    { value: 'api', label: apiLabel, disabled: !apiReady, note: !apiReady ? 'add companies to portals.yml' : '' },
    { value: 'websearch', label: wsLabel, disabled: !websearchReady, note: !hasKey ? 'set API key in Settings' : (queriesN === 0 ? 'no queries enabled' : '') },
    { value: 'both', label: bothLabel, disabled: !(apiReady && websearchReady), note: '' },
  ];

  const modeOptionsHTML = modeOptions.map(o =>
    `<option value="${o.value}" ${o.disabled ? 'disabled' : ''} ${o.value === defaultMode && !o.disabled ? 'selected' : ''}>${o.label}${o.note ? ' \u2014 ' + o.note : ''}</option>`
  ).join('');

  $('#content').innerHTML = `
    ${lastScanHTML}
    ${warningHTML}

    <div class="section">
      <h2>Scan for new jobs &mdash; step 1</h2>
      <p class="section-sub">Hits job boards and adds new postings to your pipeline as <em>unchecked</em>. Run liveness check afterwards to promote them to <em>active</em>.</p>

      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px;">
        <select id="scan-mode" class="scan-select" ${scanRunning ? 'disabled' : ''}>
          ${modeOptionsHTML}
        </select>
        <button class="btn btn-primary" id="scan-btn" ${scanBtnDisabled}>${scanBtnLabel}</button>
        ${scanner.authEnabled ? `<label class="scan-linkedin-label"><input type="checkbox" id="scan-linkedin" ${scanRunning ? 'disabled' : ''}> + LinkedIn <span class="scan-linkedin-count">(${linkedinN} ${linkedinN === 1 ? 'query' : 'queries'})</span></label>` : ''}
      </div>

      <table class="scan-config-table">
        <thead>
          <tr><th>Mode</th><th>Source</th><th>Config</th><th>Ready</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>API scan</strong></td>
            <td>Greenhouse / Ashby / Lever</td>
            <td><code>portals.yml &rsaquo; tracked_companies</code> &middot; ${trackedN}</td>
            <td>${apiReady ? '<span class="badge good">ready</span>' : '<span class="badge muted">empty</span>'}</td>
          </tr>
          <tr>
            <td><strong>WebSearch</strong></td>
            <td>Haiku + <code>site:</code> search</td>
            <td><code>portals.yml &rsaquo; search_queries</code> &middot; ${queriesN}</td>
            <td>${websearchReady ? '<span class="badge good">ready</span>' : (!hasKey ? '<a href="#/settings" class="badge warn">needs API key</a>' : '<span class="badge muted">no queries</span>')}</td>
          </tr>
          <tr>
            <td><strong>LinkedIn</strong></td>
            <td>authenticated browser</td>
            <td><code>portals.yml &rsaquo; linkedin.searches</code> &middot; ${linkedinN}</td>
            <td>${linkedinReady ? '<span class="badge good">ready</span>' : (scanner.authEnabled ? '<span class="badge muted">no queries</span>' : '<span class="badge muted">not authed</span>')}</td>
          </tr>
        </tbody>
      </table>

      ${scanLogPreview}
    </div>

    <div class="section">
      <h2>Liveness check &mdash; step 2</h2>
      <p class="section-sub">After scanning, Playwright visits each URL to confirm the posting is still open. Closed jobs are hidden from the Jobs tab automatically.</p>

      <div class="liveness-grid">
        <div class="liveness-cell">
          <div class="liveness-cell-value" style="color: var(--success);">${jobs.active || 0}</div>
          <div class="liveness-cell-label">Active</div>
        </div>
        <div class="liveness-cell">
          <div class="liveness-cell-value" style="color: var(--neutral-500);">${jobs.expired || 0}</div>
          <div class="liveness-cell-label">Expired</div>
        </div>
        <div class="liveness-cell">
          <div class="liveness-cell-value" style="color: var(--warning);">${jobs.uncertain || 0}</div>
          <div class="liveness-cell-label">Uncertain</div>
        </div>
        <div class="liveness-cell">
          <div class="liveness-cell-value" style="color: ${jobs.unchecked > 0 ? 'var(--warning)' : 'var(--neutral-300)'};">${jobs.unchecked || 0}</div>
          <div class="liveness-cell-label">Unchecked</div>
        </div>
      </div>

      <div id="liveness-progress" style="display: none;">
        <div class="liveness-progress-header">
          <span id="liveness-progress-label">Preparing\u2026</span>
          <span id="liveness-progress-counts"></span>
        </div>
        <div class="bar" style="height: 8px;">
          <div class="bar-fill" id="liveness-progress-fill" style="width: 0%;"></div>
        </div>
      </div>

      <pre class="scan-log" id="liveness-log" style="display: none;"></pre>

      <div style="margin-top: 14px;">
        <button class="btn btn-primary" id="liveness-btn" ${livenessBtnDisabled}>${livenessBtnLabel}</button>
      </div>
    </div>

    <div class="section">
      <h2>LinkedIn authentication</h2>
      <div class="stat-list">
        <div class="stat-row"><span class="key">Status</span><span class="val">${authBadge}</span></div>
        <div class="stat-row"><span class="key">LinkedIn URLs added (all time)</span><span class="val">${scanner.linkedInUrlsAdded || 0}</span></div>
        ${scanner.lastLinkedInScan ? `<div class="stat-row"><span class="key">Last LinkedIn scan</span><span class="val">${scanner.lastLinkedInScan}</span></div>` : ''}
      </div>
      <div style="margin-top: 14px;">${authButton}</div>
      <p class="section-sub" style="margin-top: 14px; margin-bottom: 0;">Optional. Runs <code>linkedin-scan.mjs</code> against LinkedIn's own search when <em>+ LinkedIn</em> is checked. Comes with account-ban risk; use sparingly.</p>
    </div>
  `;

  const authBtn = $('#auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', async () => {
      authBtn.disabled = true;
      authBtn.textContent = 'Opening browser\u2026';
      try {
        const r = await fetch('/api/auth-setup', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) { alert(data.error); authBtn.disabled = false; return; }
        await renderers.scanner();
        const interval = setInterval(async () => {
          try {
            const s = await fetchJSON('/api/scanner-status');
            if (!s.authSetupRunning) { clearInterval(interval); await renderers.scanner(); }
          } catch {}
        }, 2000);
      } catch (err) { alert(err.message); authBtn.disabled = false; }
    });
  }

  const scanBtn = $('#scan-btn');
  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning\u2026';
      const mode = $('#scan-mode')?.value || 'api';
      const linkedin = $('#scan-linkedin')?.checked ? '1' : '0';
      try {
        const r = await fetch(`/api/scan-now?mode=${mode}&linkedin=${linkedin}`, { method: 'POST' });
        const data = await r.json();
        if (!data.ok) { alert(data.error); scanBtn.disabled = false; scanBtn.textContent = 'Scan now'; return; }
        const interval = setInterval(async () => {
          try {
            const s = await fetchJSON('/api/scan-now-status');
            if (!s.running) { clearInterval(interval); }
            await renderers.scanner();
          } catch {}
        }, 2000);
      } catch (err) { alert(err.message); scanBtn.disabled = false; scanBtn.textContent = 'Scan now'; }
    });
  }

  // Start polling liveness progress (handles both user-initiated and already-running cases)
  async function pollLivenessProgress() {
    const progressEl = $('#liveness-progress');
    const labelEl = $('#liveness-progress-label');
    const countsEl = $('#liveness-progress-counts');
    const fillEl = $('#liveness-progress-fill');
    const logEl = $('#liveness-log');
    const btn = $('#liveness-btn');

    if (!progressEl) return; // UI not present
    progressEl.style.display = 'block';
    if (logEl) logEl.style.display = 'block';

    const tick = async () => {
      try {
        const s = await fetchJSON('/api/liveness-status');
        const p = s.progress || { total: 0, checked: 0, active: 0, expired: 0, uncertain: 0 };
        const pct = p.total > 0 ? Math.round((p.checked / p.total) * 100) : 0;

        if (fillEl) fillEl.style.width = pct + '%';
        if (labelEl) labelEl.textContent = s.running
          ? (p.total > 0 ? `Checking ${p.checked} of ${p.total} jobs\u2026 (${pct}%)` : 'Starting\u2026')
          : (p.checked > 0 ? `Done \u2014 checked ${p.checked} of ${p.total}` : 'Idle');
        if (countsEl) countsEl.textContent = p.total > 0
          ? `\u2713 ${p.active} active  \u00b7  \u2717 ${p.expired} expired  \u00b7  ? ${p.uncertain} uncertain`
          : '';
        if (logEl && s.log) logEl.textContent = s.log.slice(-2000);
        if (logEl) logEl.scrollTop = logEl.scrollHeight;

        if (!s.running) {
          if (btn) { btn.disabled = false; }
          clearInterval(pollLivenessProgress._timer);
          pollLivenessProgress._timer = null;
          // Refresh hero stats to reflect new active/expired counts
          updateHero();
        }
      } catch {}
    };
    if (pollLivenessProgress._timer) clearInterval(pollLivenessProgress._timer);
    await tick(); // run once immediately
    pollLivenessProgress._timer = setInterval(tick, 2000);
  }

  // If liveness is already running when we arrive on this tab, show the progress UI
  if (livenessRunning) {
    pollLivenessProgress();
  }

  const livenessBtn = $('#liveness-btn');
  if (livenessBtn) {
    livenessBtn.addEventListener('click', async () => {
      livenessBtn.disabled = true;
      livenessBtn.textContent = 'Starting\u2026';
      try {
        const r = await fetch('/api/liveness-check', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) { alert(data.error); livenessBtn.disabled = false; return; }
        livenessBtn.textContent = 'Checking\u2026';
        pollLivenessProgress();
      } catch (err) { alert(err.message); livenessBtn.disabled = false; }
    });
  }
};

// ── Jobs ──────────────────────────────────────────────────────

renderers.jobs = async function () {
  const { jobs, stats } = await fetchJSON('/api/jobs');

  const livenessDot = (l) => {
    if (l === 'active') return '<span style="color: var(--green);">●</span>';
    if (l === 'expired') return '<span style="color: var(--red);">●</span>';
    if (l === 'uncertain') return '<span style="color: var(--yellow);">●</span>';
    return '<span style="color: var(--muted);">○</span>';
  };

  const filtered = jobs.filter(j => {
    if (jobsFilter === 'all') return true;
    if (jobsFilter === 'active') return j.liveness === 'active';
    if (jobsFilter === 'selected') return j.selected;
    if (jobsFilter === 'cv-done') return j.cvStatus === 'done';
    if (jobsFilter === 'unchecked') return j.liveness === 'unchecked';
    return true;
  });

  const filterTabs = [
    { key: 'all',       label: `All (${stats.total})` },
    { key: 'active',    label: `Active (${stats.active})` },
    { key: 'unchecked', label: `Unchecked (${stats.unchecked})` },
    { key: 'selected',  label: `Selected (${stats.selected})` },
    { key: 'cv-done',   label: `CV done (${stats.cvDone})` },
  ];

  const tabsHTML = filterTabs.map(t =>
    `<button class="${t.key === jobsFilter ? 'active' : ''}" data-filter="${t.key}">${t.label}</button>`
  ).join('');

  const rowsHTML = filtered.length === 0
    ? `<tr><td colspan="7"><div class="empty-state">no jobs match this filter</div></td></tr>`
    : filtered.map(j => `
        <tr>
          <td><input type="checkbox" class="job-select" data-url="${escapeHTML(j.url)}" ${j.selected ? 'checked' : ''}></td>
          <td>${livenessDot(j.liveness)}</td>
          <td><span class="tag ${j.source.split('-')[0]}">${j.source}</span></td>
          <td>${escapeHTML(j.company)}</td>
          <td><a href="${escapeHTML(j.url)}" target="_blank" rel="noopener">${escapeHTML(j.role)} ↗</a></td>
          <td>${j.cvStatus ? `<span class="status-tag ${j.cvStatus}">${j.cvStatus}</span>` : '—'}</td>
          <td style="font-size: 11px; color: var(--subtext);">${j.scanDate}</td>
        </tr>
      `).join('');

  $('#content').innerHTML = `
    <div class="section">
      <h2>Jobs — ${stats.total} total</h2>
      <div class="filter-tabs">${tabsHTML}</div>
      <div style="margin: 10px 0; display: flex; gap: 8px;">
        <button class="btn btn-secondary" id="select-all-active">Select all active</button>
        <button class="btn btn-secondary" id="deselect-all">Deselect all</button>
        <button class="btn btn-primary" id="gen-cv-btn-jobs" ${stats.selected === 0 ? 'disabled' : ''}>Generate CVs (${stats.selected})</button>
      </div>
      <table>
        <thead>
          <tr><th style="width:30px;">✓</th><th>Live</th><th>Source</th><th>Company</th><th>Role</th><th>CV</th><th>Scanned</th></tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
  `;

  // Wire checkboxes
  $$('.job-select').forEach(cb => cb.addEventListener('change', async () => {
    await fetch('/api/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cb.dataset.url, selected: cb.checked }),
    });
  }));

  // Select all active
  $('#select-all-active')?.addEventListener('click', async () => {
    const activeJobs = jobs.filter(j => j.liveness === 'active' && !j.selected);
    for (const j of activeJobs) {
      await fetch('/api/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: j.url, selected: true }),
      });
    }
    await renderers.jobs();
  });

  // Deselect all
  $('#deselect-all')?.addEventListener('click', async () => {
    const selectedJobs = jobs.filter(j => j.selected);
    for (const j of selectedJobs) {
      await fetch('/api/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: j.url, selected: false }),
      });
    }
    await renderers.jobs();
  });

  // Generate CVs button
  $('#gen-cv-btn-jobs')?.addEventListener('click', async () => {
    const btn = $('#gen-cv-btn-jobs');
    btn.disabled = true;
    btn.textContent = 'Starting…';
    try {
      const r = await fetch('/api/generate-cv', { method: 'POST' });
      const data = await r.json();
      if (!data.ok) { alert(data.error); btn.disabled = false; return; }
      const interval = setInterval(async () => {
        try {
          const s = await fetchJSON('/api/cv-progress');
          if (!s.running) { clearInterval(interval); await renderers.jobs(); }
        } catch {}
      }, 3000);
    } catch (err) { alert(err.message); btn.disabled = false; }
  });

  // Filter tabs
  $$('.filter-tabs button').forEach(b => b.addEventListener('click', () => {
    jobsFilter = b.dataset.filter;
    renderers.jobs();
  }));
};

// ── Keywords ──────────────────────────────────────────────────

renderers.keywords = async function () {
  const [kw, queries] = await Promise.all([
    fetchJSON('/api/keywords'),
    fetchJSON('/api/portals-queries').catch(() => ({ websearch: [], linkedin: [] })),
  ]);
  const allKw = [...(kw.keywords || []).map(k => ({ ...k, userAdded: false })), ...(kw.user_added || []).map(k => ({ ...k, source: 'user', userAdded: true }))];
  const pending = kw.pending_suggestions || [];

  const pendingHTML = pending.length === 0 ? '' : `
    <div class="section" style="border-left: 3px solid var(--yellow); padding-left: 12px;">
      <h3 style="color: var(--yellow);">Source files changed — new keyword suggestions</h3>
      <p style="font-size: 12px; color: var(--subtext);">Your CV, profile, or digest has changed. Review these suggested keywords:</p>
      ${pending.map(p => `
        <div style="display: flex; align-items: center; gap: 8px; margin: 6px 0;">
          <span>${escapeHTML(p.term)}</span>
          <span class="tag ${p.source}">${p.source}</span>
          <button class="btn btn-secondary accept-suggestion" data-term="${escapeHTML(p.term)}" data-source="${escapeHTML(p.source)}" style="padding: 2px 8px; font-size: 11px;">Accept</button>
        </div>
      `).join('')}
      <button class="btn btn-secondary" id="dismiss-suggestions" style="margin-top: 8px;">Dismiss all</button>
    </div>
  `;

  const rowsHTML = allKw.map(k => `
    <tr>
      <td>
        <label class="toggle">
          <input type="checkbox" class="kw-toggle" data-term="${escapeHTML(k.term)}" ${k.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>${escapeHTML(k.term)}</td>
      <td><span class="tag ${k.source}">${k.source}</span></td>
      <td>${k.userAdded ? `<button class="btn btn-secondary kw-remove" data-term="${escapeHTML(k.term)}" style="padding: 2px 8px; font-size: 11px; color: var(--red);">Remove</button>` : ''}</td>
    </tr>
  `).join('');

  $('#content').innerHTML = `
    ${pendingHTML}
    <div class="section">
      <h2>Search Keywords</h2>
      <p style="font-size: 12px; color: var(--subtext);">These keywords are used by LinkedIn scanner and WebSearch. Toggle to enable/disable. Add your own below.</p>
      <table>
        <thead><tr><th style="width: 50px;">On</th><th>Keyword</th><th>Source</th><th></th></tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
      <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
        <input type="text" id="new-keyword" placeholder="Add a keyword\u2026" style="flex: 1; min-width: 200px; padding: 6px 10px; background: var(--surface); color: var(--neutral-900); border: 1px solid var(--neutral-200); border-radius: var(--radius-sm); font-family: inherit; font-size: 13px;">
        <button class="btn btn-primary" id="add-keyword">Add</button>
        <button class="btn btn-secondary" id="regen-keywords">Regenerate from profile</button>
        <button class="btn btn-secondary" id="regen-portals" title="Rebuild portals.yml search_queries + linkedin.searches + title_filter.positive from the enabled keywords above">Regenerate portals</button>
      </div>
      <div style="margin-top: 8px; font-size: 11px; color: var(--neutral-500);">
        Generated from: cv.md, config/profile.yml, article-digest.md
        ${kw.generated_at ? ` \u00b7 last generated: ${kw.generated_at}` : ''}
      </div>
    </div>

    <div class="section">
      <h2>Generated search queries</h2>
      <p class="section-sub">
        These are the actual search strings your scanner runs &mdash; built from the enabled keywords above.
        Click <strong>Regenerate portals</strong> after toggling keywords to resync.
      </p>

      ${queries.websearch.length === 0 && queries.linkedin.length === 0 ? `
        <div class="empty-state" style="padding: 24px;">
          <p>No generated queries yet. Click <strong>Regenerate portals</strong> above to build them.</p>
        </div>
      ` : ''}

      ${queries.websearch.length > 0 ? `
        <details class="queries-details" open>
          <summary>
            <span class="queries-summary-label">WebSearch queries</span>
            <span class="queries-summary-count">${queries.websearch.length} &middot; ${new Set(queries.websearch.map(q => q.keyword)).size} keywords &times; ${new Set(queries.websearch.map(q => q.template)).size} templates</span>
          </summary>
          <table class="queries-table">
            <thead>
              <tr><th style="width: 110px;">Template</th><th style="width: 180px;">Keyword</th><th>Query string</th></tr>
            </thead>
            <tbody>
              ${queries.websearch.map(q => `
                <tr${q.enabled === false ? ' class="disabled-row"' : ''}>
                  <td><span class="template-chip">${escapeHTML(q.template)}</span></td>
                  <td>${escapeHTML(q.keyword)}</td>
                  <td><code class="query-code">${escapeHTML(q.query)}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </details>
      ` : ''}

      ${queries.linkedin.length > 0 ? `
        <details class="queries-details">
          <summary>
            <span class="queries-summary-label">LinkedIn authenticated searches</span>
            <span class="queries-summary-count">${queries.linkedin.length} &middot; requires <code>auth-setup.mjs</code></span>
          </summary>
          <table class="queries-table">
            <thead>
              <tr><th>Keyword</th><th style="width: 120px;">Filter</th></tr>
            </thead>
            <tbody>
              ${queries.linkedin.map(s => `
                <tr>
                  <td>${escapeHTML(s.keyword)}</td>
                  <td>${s.remote ? '<span class="badge good">remote only</span>' : '<span class="badge muted">any</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </details>
      ` : ''}
    </div>
  `;

  // Wire toggles
  $$('.kw-toggle').forEach(cb => cb.addEventListener('change', async () => {
    await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', term: cb.dataset.term }),
    });
  }));

  // Wire remove buttons
  $$('.kw-remove').forEach(btn => btn.addEventListener('click', async () => {
    await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', term: btn.dataset.term }),
    });
    await renderers.keywords();
  }));

  // Wire add keyword
  $('#add-keyword')?.addEventListener('click', async () => {
    const input = $('#new-keyword');
    const term = input?.value?.trim();
    if (!term) return;
    await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', term }),
    });
    input.value = '';
    await renderers.keywords();
  });

  // Helper: run portals regenerator. Pauses polling during run so the UI doesn't
  // wipe intermediate feedback; shows final result via alert() for reliability.
  async function runRegeneratePortals(seedTracked, force) {
    const btn = $('#regen-portals');
    if (btn) { btn.disabled = true; btn.textContent = 'Regenerating\u2026'; }
    stopPoll(); // pause 5s polling — renderer re-renders would wipe in-flight state
    try {
      const params = new URLSearchParams();
      if (seedTracked) params.set('seed_tracked', '1');
      if (force) params.set('force', '1');
      const r = await fetch(`/api/regenerate-portals?${params}`, { method: 'POST' });
      const d = await r.json();
      if (!d.ok) {
        alert(`Portals regeneration failed:\n\n${d.error}`);
        return false;
      }
      alert(`Portals regenerated \u2713\n\n${d.output || 'Done.'}`);
      return true;
    } catch (err) {
      alert(`Portals regeneration error:\n\n${err.message}`);
      return false;
    } finally {
      // btn may have been re-rendered away; query fresh
      const freshBtn = $('#regen-portals');
      if (freshBtn) { freshBtn.disabled = false; freshBtn.textContent = 'Regenerate portals'; }
      startPoll();
    }
  }

  // Wire regenerate keywords → prompt to chain portals regen
  $('#regen-keywords')?.addEventListener('click', async () => {
    const btn = $('#regen-keywords');
    btn.disabled = true;
    btn.textContent = 'Regenerating\u2026';
    await fetch('/api/keywords/regenerate', { method: 'POST' });
    btn.disabled = false;
    btn.textContent = 'Regenerate from profile';
    // Ask if they want to also resync portals.yml with the new keywords
    const shouldRegenPortals = confirm(
      'Keywords regenerated.\n\n' +
      'Also regenerate portals.yml?\n' +
      'This will rebuild search_queries, linkedin.searches, and title_filter.positive ' +
      'from the new keyword list. Preserves tracked_companies and negative filters.'
    );
    if (shouldRegenPortals) {
      await runRegeneratePortals(false, false);
    }
    await renderers.keywords();
  });

  // Wire regenerate portals standalone button
  $('#regen-portals')?.addEventListener('click', async () => {
    await runRegeneratePortals(false, false);
  });

  // Wire accept suggestion
  $$('.accept-suggestion').forEach(btn => btn.addEventListener('click', async () => {
    await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept-suggestion', term: btn.dataset.term, source: btn.dataset.source }),
    });
    await renderers.keywords();
  }));

  // Wire dismiss suggestions
  $('#dismiss-suggestions')?.addEventListener('click', async () => {
    await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss-suggestions' }),
    });
    await renderers.keywords();
  });
};

// ── Tracker ────────────────────────────────────────────────────

renderers.tracker = async function () {
  const { applications, metrics } = await fetchJSON('/api/applications');

  if (applications.length === 0) {
    $('#content').innerHTML = `
      <div class="section">
        <div class="empty-state">
          <h3>No applications yet</h3>
          <p>The tracker is empty. Run a deep pass to start populating it:</p>
          <code>bash batch/batch-runner.sh --parallel 3 --limit 5</code>
        </div>
      </div>
    `;
    return;
  }

  const filtered = trackerFilter === 'all'
    ? applications
    : applications.filter(a => a.status === trackerFilter);

  const statuses = ['all', 'evaluated', 'applied', 'responded', 'interview', 'offer', 'rejected', 'discarded', 'skip'];
  const tabsHTML = statuses.map(s =>
    `<button class="${s === trackerFilter ? 'active' : ''}" data-filter="${s}">${s} (${s === 'all' ? applications.length : metrics.byStatus[s] || 0})</button>`
  ).join('');

  const rowsHTML = filtered.map(a => `
    <tr>
      <td>${a.number}</td>
      <td>${a.date}</td>
      <td>${escapeHTML(a.company)}</td>
      <td>${escapeHTML(a.role)}</td>
      <td><span class="score ${scoreCls(a.score)}">${a.score ? a.score.toFixed(1) : '—'}</span></td>
      <td><span class="status-tag ${a.status}">${a.status}</span></td>
      <td>${a.hasPDF ? '✅' : '—'}</td>
      <td>${a.reportNumber ? `<a href="#/report/${encodeURIComponent(a.reportPath)}" data-report="${escapeHTML(a.reportPath)}">${a.reportNumber}</a>` : '—'}</td>
      <td style="color: var(--subtext); font-size: 11px;">${escapeHTML(a.tldr || a.notes || '')}</td>
    </tr>
  `).join('');

  $('#content').innerHTML = `
    <div class="section">
      <h2>Applications Tracker — ${applications.length} total</h2>
      <div class="filter-tabs">${tabsHTML}</div>
      <table>
        <thead>
          <tr><th>#</th><th>Date</th><th>Company</th><th>Role</th><th>Score</th><th>Status</th><th>PDF</th><th>Report</th><th>TL;DR</th></tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
  `;

  $$('.filter-tabs button').forEach(b => b.addEventListener('click', () => {
    trackerFilter = b.dataset.filter;
    renderers.tracker();
  }));

  // Hijack report link clicks → open in a new view
  $$('a[data-report]').forEach(a => a.addEventListener('click', async (e) => {
    e.preventDefault();
    const path = a.dataset.report;
    const r = await fetchJSON(`/api/report/${encodeURIComponent(path)}`);
    $('#content').innerHTML = `
      <div class="section">
        <h2>${escapeHTML(r.path)}</h2>
        <button onclick="history.back()" class="cta" style="cursor:pointer;border:none;font-family:inherit;">← Back</button>
        <div class="profile-viewer">
          <pre>${escapeHTML(r.content)}</pre>
        </div>
      </div>
    `;
  }));
};

// ── Progress ───────────────────────────────────────────────────

renderers.progress = async function () {
  const p = await fetchJSON('/api/progress');

  const funnelMax = p.funnelStages[0]?.count || 1;
  const funnelHTML = p.funnelStages.map(s => `
    <div class="funnel-row">
      <span class="label">${s.label}</span>
      <div class="bar"><div class="bar-fill applied" style="width: ${s.pct}%"></div></div>
      <span class="count">${s.count} (${s.pct.toFixed(0)}%)</span>
    </div>
  `).join('');

  const bucketMax = Math.max(...p.scoreBuckets.map(b => b.count), 1);
  const bucketsHTML = p.scoreBuckets.map(b => `
    <div class="funnel-row">
      <span class="label">${b.label}</span>
      <div class="bar"><div class="bar-fill light" style="width: ${(b.count / bucketMax) * 100}%"></div></div>
      <span class="count">${b.count}</span>
    </div>
  `).join('');

  const weeksMax = Math.max(...p.weeklyActivity.map(w => w.count), 1);
  const weeksHTML = p.weeklyActivity.length === 0
    ? '<div class="empty-state">no activity yet</div>'
    : p.weeklyActivity.map(w => `
        <div class="funnel-row">
          <span class="label">${w.week}</span>
          <div class="bar"><div class="bar-fill scanner" style="width: ${(w.count / weeksMax) * 100}%"></div></div>
          <span class="count">${w.count}</span>
        </div>
      `).join('');

  const ratesHTML = `
    <div class="stat-list">
      <div class="stat-row"><span class="key">Response rate</span><span class="val good">${p.responseRate.toFixed(1)}%</span></div>
      <div class="stat-row"><span class="key">Interview rate</span><span class="val good">${p.interviewRate.toFixed(1)}%</span></div>
      <div class="stat-row"><span class="key">Offer rate</span><span class="val good">${p.offerRate.toFixed(1)}%</span></div>
      <div class="stat-row"><span class="key">Total offers</span><span class="val">${p.totalOffers}</span></div>
      <div class="stat-row"><span class="key">Active applications</span><span class="val">${p.activeApps}</span></div>
    </div>
  `;

  $('#content').innerHTML = `
    <div class="cards">
      <div class="section">
        <h2>Funnel</h2>
        <div class="funnel">${funnelHTML}</div>
      </div>
      <div class="section">
        <h2>Conversion Rates</h2>
        ${ratesHTML}
      </div>
    </div>
    <div class="cards">
      <div class="section">
        <h2>Score Distribution</h2>
        <div class="funnel">${bucketsHTML}</div>
      </div>
      <div class="section">
        <h2>Weekly Activity (last 8)</h2>
        <div class="funnel">${weeksHTML}</div>
      </div>
    </div>
  `;
};

// ── Profile ────────────────────────────────────────────────────

renderers.profile = async function () {
  const f = await fetchJSON(`/api/profile/${profileFile}`);

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'cv',      label: 'CV' },
    { key: 'digest',  label: 'Proof Points' },
    { key: 'config',  label: 'Config' },
    { key: 'portals', label: 'Portals' },
  ];

  const tabsHTML = tabs.map(t =>
    `<button class="${t.key === profileFile ? 'active' : ''}" data-file="${t.key}">${t.label}</button>`
  ).join('');

  $('#content').innerHTML = `
    <div class="section">
      <h2>Profile — what the evaluator filters against</h2>
      <div class="filter-tabs">${tabsHTML}</div>
      <p style="color: var(--subtext); font-size: 11px;">Source: <code>${escapeHTML(f.path)}</code></p>
      <div class="profile-viewer">
        <pre>${escapeHTML(f.content)}</pre>
      </div>
    </div>
  `;

  $$('.filter-tabs button').forEach(b => b.addEventListener('click', () => {
    profileFile = b.dataset.file;
    renderers.profile();
  }));
};

// ── Settings ───────────────────────────────────────────────────

renderers.settings = async function () {
  const keys = await fetchJSON('/api/settings/keys');
  const anthropicSet = !!keys.anthropic;

  $('#content').innerHTML = `
    <div class="section">
      <h2>Settings — API keys</h2>
      <p style="color: var(--subtext); font-size: 12px;">
        Stored in <code>.env</code> at the project root (gitignored, 0600 perms). The key is used by the light pass API mode and works for Haiku, Sonnet, and Opus.
      </p>

      <div style="margin-top: 16px;">
        <label for="anthropic-key" style="font-size: 12px; color: var(--subtext); display: block; margin-bottom: 6px;">
          Anthropic API key ${anthropicSet ? `<span style="color: var(--green);">· saved (${escapeHTML(keys.anthropic)})</span>` : '<span style="color: var(--muted);">· not set</span>'}
        </label>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input type="password" id="anthropic-key" placeholder="${anthropicSet ? 'Paste to replace' : 'sk-ant-api03-...'}" autocomplete="off" style="flex: 1; min-width: 320px; padding: 6px 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-family: monospace; font-size: 12px;">
          <button class="btn btn-secondary" id="anthropic-reveal" type="button">Show</button>
          <button class="btn btn-primary" id="anthropic-save" type="button">Save</button>
          ${anthropicSet ? `<button class="btn btn-secondary" id="anthropic-delete" type="button" style="color: var(--red);">Remove</button>` : ''}
        </div>
        <div id="anthropic-status" style="margin-top: 8px; font-size: 11px; color: var(--subtext); min-height: 14px;"></div>
      </div>

      <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--subtext); font-size: 11px;">
        Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style="color: var(--blue);">console.anthropic.com/settings/keys</a>. One key covers Haiku / Sonnet / Opus.
      </div>
    </div>

    <div class="section">
      <h2>Onboarding</h2>
      <p class="section-sub">Re-run the setup wizard to review or reconfigure your CV, profile, portals, and keywords. Each step will show your current state &mdash; you can skip through anything that's already configured.</p>
      <a href="#/setup" class="btn btn-secondary" id="revisit-onboarding-btn">Revisit onboarding wizard</a>
    </div>
  `;

  const input = $('#anthropic-key');
  const status = $('#anthropic-status');

  $('#anthropic-reveal').addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#anthropic-reveal').textContent = input.type === 'password' ? 'Show' : 'Hide';
  });

  $('#anthropic-save').addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) { status.textContent = 'Paste a key first.'; status.style.color = 'var(--peach)'; return; }
    status.textContent = 'Saving…';
    status.style.color = 'var(--subtext)';
    try {
      const r = await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropic: value }),
      });
      const d = await r.json();
      if (!d.ok) { status.textContent = `✗ ${d.error}`; status.style.color = 'var(--red)'; return; }
      input.value = '';
      input.type = 'password';
      status.textContent = `✓ Saved (${d.anthropic}). Light pass API mode is now available.`;
      status.style.color = 'var(--green)';
      setTimeout(() => renderers.settings(), 800);
    } catch (err) {
      status.textContent = `✗ ${err.message}`;
      status.style.color = 'var(--red)';
    }
  });

  const delBtn = $('#anthropic-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Remove the saved Anthropic API key from .env?')) return;
      status.textContent = 'Removing…';
      try {
        const r = await fetch('/api/settings/keys', { method: 'DELETE' });
        const d = await r.json();
        if (!d.ok) { status.textContent = `✗ ${d.error}`; status.style.color = 'var(--red)'; return; }
        status.textContent = '✓ Removed';
        status.style.color = 'var(--green)';
        setTimeout(() => renderers.settings(), 600);
      } catch (err) {
        status.textContent = `✗ ${err.message}`;
        status.style.color = 'var(--red)';
      }
    });
  }
};

// ── Setup Wizard ──────────────────────────────────────────────

let setupStatus = null;
let setupManualStep = null; // null = auto-compute, 1..5 = user-selected

renderers.setup = async function () {
  const [status, values] = await Promise.all([
    fetchJSON('/api/setup-status'),
    fetchJSON('/api/setup/values').catch(() => ({
      cv: { exists: false, content: '' },
      profile: { exists: false },
      portals: { exists: false, trackedCompanies: 0, searchQueries: 0, linkedinSearches: 0 },
      keywords: { exists: false, count: 0, enabledCount: 0 },
    })),
  ]);
  setupStatus = status;

  // First-incomplete-step auto-computation
  const autoStep = !status.cv ? 1
    : !status.profile ? 2
    : !status.portals ? 3
    : !status.keywords ? 4
    : 5;

  const isRevisit = status.complete;
  const step = setupManualStep ?? autoStep;

  // Progress dots (clickable when revisiting or when step <= autoStep)
  const steps = ['CV', 'Profile', 'Portals', 'Keywords', 'Done'];
  const progressHTML = steps.map((s, i) => {
    const n = i + 1;
    const done = (n < autoStep) || (isRevisit && n < 5);
    const active = n === step;
    const cls = [active ? 'active' : '', done && !active ? 'done' : '', (isRevisit || n <= autoStep) ? 'clickable' : ''].filter(Boolean).join(' ');
    return `<div class="wizard-dot ${cls}" data-step="${n}"><span>${n}</span><label>${s}</label></div>`;
  }).join('<div class="wizard-line"></div>');

  let stepHTML = '';

  // ── Step 1: CV ──
  if (step === 1) {
    const existing = values.cv.exists;
    stepHTML = `
      <div class="wizard-step">
        <h3>Step 1: Your CV</h3>
        <p>${existing ? 'Edit your current CV below.' : 'Paste your resume or CV. Plain text or markdown.'} Used to generate search keywords and tailor CVs for each job.</p>
        ${existing ? `<p class="setup-meta">Currently ${values.cv.content.length.toLocaleString()} characters.</p>` : ''}
        <textarea id="setup-cv" class="wizard-textarea" rows="16" placeholder="# Your Name&#10;&#10;## Experience&#10;&#10;### Company — Location&#10;**Job Title**&#10;Date range&#10;&#10;- Achievement 1">${escapeHTML(values.cv.content || '')}</textarea>
        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-cv-save">${existing ? 'Save changes' : 'Save & continue'}</button>
          ${!existing ? `<button class="btn btn-secondary" id="setup-cv-skip">Skip for now</button>` : ''}
        </div>
      </div>
    `;
  }

  // ── Step 2: Profile ──
  else if (step === 2) {
    const p = values.profile;
    const existing = p.exists;
    stepHTML = `
      <div class="wizard-step">
        <h3>Step 2: Your Profile</h3>
        <p>${existing ? 'Update the basics. Changes merge into <code>config/profile.yml</code> \u2014 custom archetypes, narrative, and proof points are preserved.' : 'Tell us about yourself and what roles you\'re targeting.'}</p>
        <div class="wizard-form">
          <div class="wizard-field">
            <label>Full name *</label>
            <input type="text" id="setup-name" placeholder="Jane Smith" value="${escapeHTML(p.name || '')}">
          </div>
          <div class="wizard-field">
            <label>Email</label>
            <input type="email" id="setup-email" placeholder="jane@example.com" value="${escapeHTML(p.email || '')}">
          </div>
          <div class="wizard-field">
            <label>Phone</label>
            <input type="text" id="setup-phone" placeholder="+1-555-0123" value="${escapeHTML(p.phone || '')}">
          </div>
          <div class="wizard-field">
            <label>Location</label>
            <input type="text" id="setup-location" placeholder="NYC / Remote" value="${escapeHTML(p.location || '')}">
          </div>
          <div class="wizard-field">
            <label>Target roles (comma-separated) *</label>
            <input type="text" id="setup-roles" placeholder="Financial Analyst, Business Analyst" value="${escapeHTML(p.targetRoles || '')}">
          </div>
          <div class="wizard-field">
            <label>Salary range</label>
            <input type="text" id="setup-salary" placeholder="$100K-150K" value="${escapeHTML(p.salaryRange || '')}">
          </div>
        </div>
        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-profile-save">${existing ? 'Save changes' : 'Save & continue'}</button>
          ${!existing ? `<button class="btn btn-secondary" id="setup-profile-skip">Skip for now</button>` : ''}
        </div>
      </div>
    `;
  }

  // ── Step 3: Portals ──
  else if (step === 3) {
    const portals = values.portals;
    const existing = portals.exists;
    const emptyTracked = existing && portals.trackedCompanies === 0;

    if (!existing) {
      stepHTML = `
        <div class="wizard-step">
          <h3>Step 3: Job Portals</h3>
          <p>The scanner searches LinkedIn, Indeed, Glassdoor, Greenhouse, Ashby, and others for your target roles. Install the default portal config to get started.</p>
          <p class="setup-meta">You can customize <code>portals.yml</code> later to add specific companies or tune search queries.</p>
          <div class="wizard-actions">
            <button class="btn btn-primary" id="setup-portals-install">Install default portals</button>
            <button class="btn btn-secondary" id="setup-portals-skip">Skip for now</button>
          </div>
        </div>
      `;
    } else {
      stepHTML = `
        <div class="wizard-step">
          <h3>Step 3: Job Portals</h3>
          <p>Your <code>portals.yml</code> is configured. You can resync the derived sections (search queries, LinkedIn searches, title filter) from your current keywords, or seed tracked companies from the template.</p>

          <div class="cards" style="margin: 16px 0;">
            <div class="setup-stat">
              <div class="setup-stat-value ${portals.trackedCompanies === 0 ? 'warn' : 'good'}">${portals.trackedCompanies}</div>
              <div class="setup-stat-label">Tracked companies</div>
              ${portals.trackedCompanies === 0 ? '<div class="setup-stat-hint">Empty \u2014 seed from template below</div>' : ''}
            </div>
            <div class="setup-stat">
              <div class="setup-stat-value">${portals.searchQueries}</div>
              <div class="setup-stat-label">WebSearch queries</div>
            </div>
            <div class="setup-stat">
              <div class="setup-stat-value">${portals.linkedinSearches}</div>
              <div class="setup-stat-label">LinkedIn searches</div>
            </div>
          </div>

          <div class="wizard-actions">
            <button class="btn btn-primary" id="setup-portals-regen">Regenerate from keywords</button>
            ${emptyTracked ? `<button class="btn btn-primary" id="setup-portals-seed">Seed tracked_companies from template (+88)</button>` : ''}
            <button class="btn btn-secondary" id="setup-portals-continue">Continue \u2192</button>
          </div>

          <p class="setup-meta" style="margin-top: 14px;">
            <strong>Regenerate</strong> rewrites <code>search_queries</code>, <code>linkedin.searches</code>, and <code>title_filter.positive</code> from your enabled keywords. Preserves <code>tracked_companies</code> and negative filters.
            ${emptyTracked ? '<br><strong>Seed tracked_companies</strong> copies 88 pre-configured companies from <code>templates/portals.example.yml</code>.' : ''}
          </p>
        </div>
      `;
    }
  }

  // ── Step 4: Keywords ──
  else if (step === 4) {
    const kw = values.keywords;
    const existing = kw.exists;
    stepHTML = `
      <div class="wizard-step">
        <h3>Step 4: Search Keywords</h3>
        <p>${existing ? 'Keywords are generated from your CV, profile, and article digest.' : 'Generate keywords from your CV and profile.'} Use the Keywords tab for detailed editing and toggling.</p>

        ${existing ? `
          <div class="cards" style="margin: 16px 0;">
            <div class="setup-stat">
              <div class="setup-stat-value good">${kw.enabledCount}</div>
              <div class="setup-stat-label">Enabled keywords</div>
            </div>
            <div class="setup-stat">
              <div class="setup-stat-value">${kw.count}</div>
              <div class="setup-stat-label">Total keywords</div>
            </div>
            <div class="setup-stat">
              <div class="setup-stat-value" style="font-size: 13px; font-weight: 500; padding-top: 8px;">${kw.generatedAt ? kw.generatedAt.split('T')[0] : 'never'}</div>
              <div class="setup-stat-label">Last generated</div>
            </div>
          </div>
        ` : ''}

        <div id="setup-keywords-result"></div>

        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-keywords-regen">${existing ? 'Regenerate from CV + profile' : 'Generate keywords'}</button>
          ${existing ? `<button class="btn btn-secondary" id="setup-keywords-continue">Continue \u2192</button>` : ''}
        </div>
      </div>
    `;
  }

  // ── Step 5: Done / Summary ──
  else {
    stepHTML = `
      <div class="wizard-step">
        <h3>${isRevisit ? 'Configuration summary' : 'You\'re all set!'}</h3>
        <p>${isRevisit ? 'Your current setup:' : 'Your profile is configured and keywords are ready. Here\'s what to do next:'}</p>

        <div class="stat-list" style="margin: 16px 0;">
          <div class="stat-row"><span class="key">CV</span><span class="val">${values.cv.exists ? `\u2713 ${values.cv.content.length.toLocaleString()} chars` : '\u2717 missing'}</span></div>
          <div class="stat-row"><span class="key">Profile</span><span class="val">${values.profile.exists ? `\u2713 ${escapeHTML(values.profile.name || 'unnamed')} \u2014 ${(values.profile.targetRoles || '').split(',').filter(Boolean).length} roles` : '\u2717 missing'}</span></div>
          <div class="stat-row"><span class="key">Portals</span><span class="val">${values.portals.exists ? `\u2713 ${values.portals.trackedCompanies} companies, ${values.portals.searchQueries} queries, ${values.portals.linkedinSearches} LinkedIn` : '\u2717 missing'}</span></div>
          <div class="stat-row"><span class="key">Keywords</span><span class="val">${values.keywords.exists ? `\u2713 ${values.keywords.enabledCount}/${values.keywords.count} enabled` : '\u2717 missing'}</span></div>
        </div>

        ${!isRevisit ? `
          <p>Now:</p>
          <div class="stat-list" style="margin: 16px 0;">
            <div class="stat-row"><span class="key">1. Scan for jobs</span><span class="val">Scanner tab \u2192 Scan now</span></div>
            <div class="stat-row"><span class="key">2. Check liveness</span><span class="val">Scanner tab \u2192 Check liveness</span></div>
            <div class="stat-row"><span class="key">3. Select & apply</span><span class="val">Jobs tab, then Generate CVs</span></div>
          </div>
        ` : ''}

        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-go-overview">Go to Overview</button>
        </div>
      </div>
    `;
  }

  const cliNote = isRevisit ? `
    <div class="setup-banner">
      <strong>Revisit mode.</strong> Click any numbered dot to jump. Saves merge into existing files non-destructively.
      If you originally onboarded via the Claude CLI (<code>/career-ops</code>), that conversational flow is richer than this web wizard \u2014 it can generate your full <code>portals.yml</code> (including <code>tracked_companies</code>) and <code>profile.yml</code> archetypes from scratch. Use the CLI if you want to rebuild from scratch.
    </div>
  ` : '';

  $('#content').innerHTML = `
    <div class="section">
      <h2>${isRevisit ? 'Setup \u2014 revisit' : 'Setup'}</h2>
      ${cliNote}
      <div class="wizard-progress">${progressHTML}</div>
      ${stepHTML}
    </div>
  `;

  // ── Wire: clickable progress dots ──
  $$('.wizard-dot.clickable').forEach(dot => {
    dot.addEventListener('click', () => {
      const n = parseInt(dot.dataset.step, 10);
      if (!Number.isFinite(n)) return;
      setupManualStep = n;
      renderers.setup();
    });
  });

  // ── Step 1 handlers ──
  $('#setup-cv-save')?.addEventListener('click', async () => {
    const content = $('#setup-cv')?.value;
    if (!content?.trim()) { alert('CV content is empty.'); return; }
    const btn = $('#setup-cv-save');
    const originalLabel = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving\u2026';
    const r = await fetch('/api/setup/cv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    const d = await r.json();
    if (!d.ok) { alert(d.error); btn.disabled = false; btn.textContent = originalLabel; return; }
    if (isRevisit) {
      btn.textContent = 'Saved \u2713';
      setTimeout(() => { btn.disabled = false; btn.textContent = originalLabel; }, 1200);
    } else {
      setupManualStep = null;
      await renderers.setup();
    }
  });
  $('#setup-cv-skip')?.addEventListener('click', async () => {
    await fetch('/api/setup/cv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '# My CV\n\n(paste your CV here later)' }) });
    setupManualStep = null;
    await renderers.setup();
  });

  // ── Step 2 handlers ──
  $('#setup-profile-save')?.addEventListener('click', async () => {
    const name = $('#setup-name')?.value?.trim();
    if (!name) { alert('Name is required.'); return; }
    const roles = $('#setup-roles')?.value?.trim();
    if (!roles) { alert('Enter at least one target role.'); return; }
    const btn = $('#setup-profile-save');
    const originalLabel = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving\u2026';
    const r = await fetch('/api/setup/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email: $('#setup-email')?.value?.trim() || '',
        phone: $('#setup-phone')?.value?.trim() || '',
        location: $('#setup-location')?.value?.trim() || '',
        targetRoles: roles,
        salaryRange: $('#setup-salary')?.value?.trim() || '',
      }),
    });
    const d = await r.json();
    if (!d.ok) { alert(d.error); btn.disabled = false; btn.textContent = originalLabel; return; }
    if (isRevisit) {
      btn.textContent = d.merged ? 'Saved (merged) \u2713' : 'Saved \u2713';
      setTimeout(() => { btn.disabled = false; btn.textContent = originalLabel; }, 1500);
    } else {
      setupManualStep = null;
      await renderers.setup();
    }
  });
  $('#setup-profile-skip')?.addEventListener('click', async () => {
    await fetch('/api/setup/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'User', targetRoles: 'Analyst', salaryRange: '' }),
    });
    setupManualStep = null;
    await renderers.setup();
  });

  // ── Step 3 handlers ──
  $('#setup-portals-install')?.addEventListener('click', async () => {
    const btn = $('#setup-portals-install');
    btn.disabled = true; btn.textContent = 'Installing\u2026';
    const r = await fetch('/api/setup/portals', { method: 'POST' });
    const d = await r.json();
    if (!d.ok) { alert(d.error); btn.disabled = false; btn.textContent = 'Install default portals'; return; }
    setupManualStep = null;
    await renderers.setup();
  });
  $('#setup-portals-skip')?.addEventListener('click', async () => {
    await fetch('/api/setup/portals', { method: 'POST' });
    setupManualStep = null;
    await renderers.setup();
  });
  $('#setup-portals-regen')?.addEventListener('click', async () => {
    const btn = $('#setup-portals-regen');
    btn.disabled = true; btn.textContent = 'Regenerating\u2026';
    stopPoll();
    try {
      const r = await fetch('/api/regenerate-portals', { method: 'POST' });
      const d = await r.json();
      if (!d.ok) { alert(`Regenerate failed: ${d.error}`); return; }
      alert(`Portals regenerated \u2713\n\n${d.output || ''}`);
      await renderers.setup();
    } catch (err) {
      alert(err.message);
    } finally {
      startPoll();
      const freshBtn = $('#setup-portals-regen');
      if (freshBtn) { freshBtn.disabled = false; freshBtn.textContent = 'Regenerate from keywords'; }
    }
  });
  $('#setup-portals-seed')?.addEventListener('click', async () => {
    const btn = $('#setup-portals-seed');
    btn.disabled = true; btn.textContent = 'Seeding\u2026';
    stopPoll();
    try {
      const r = await fetch('/api/regenerate-portals?seed_tracked=1', { method: 'POST' });
      const d = await r.json();
      if (!d.ok) { alert(`Seed failed: ${d.error}`); return; }
      alert(`Seeded tracked_companies \u2713\n\n${d.output || ''}`);
      await renderers.setup();
    } catch (err) {
      alert(err.message);
    } finally {
      startPoll();
    }
  });
  $('#setup-portals-continue')?.addEventListener('click', () => {
    setupManualStep = 4;
    renderers.setup();
  });

  // ── Step 4 handlers ──
  $('#setup-keywords-regen')?.addEventListener('click', async () => {
    const btn = $('#setup-keywords-regen');
    const originalLabel = btn.textContent;
    btn.disabled = true; btn.textContent = 'Generating\u2026';
    const container = $('#setup-keywords-result');
    if (container) container.innerHTML = '<p style="color: var(--neutral-500);">Running generate-keywords.mjs\u2026</p>';
    try {
      const r = await fetch('/api/setup/keywords', { method: 'POST' });
      const d = await r.json();
      if (d.ok && d.keywords) {
        const all = [...d.keywords, ...(d.user_added || [])];
        if (container) container.innerHTML = `
          <p style="color: var(--success); margin-top: 12px;">\u2713 ${all.length} keywords generated:</p>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0;">
            ${all.filter(k => k.enabled).map(k => `<span class="tag ${k.source}">${escapeHTML(k.term)}</span>`).join('')}
          </div>
          <p style="font-size: 12px; color: var(--neutral-500);">Manage these in the Keywords tab.</p>
        `;
      } else {
        if (container) container.innerHTML = `<p style="color: var(--error);">\u2717 ${escapeHTML(d.error || 'unknown error')}</p>`;
      }
    } catch (err) {
      if (container) container.innerHTML = `<p style="color: var(--error);">\u2717 ${escapeHTML(err.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = originalLabel;
      // Refresh the counts shown in the step
      if (isRevisit) await renderers.setup();
    }
  });
  $('#setup-keywords-continue')?.addEventListener('click', () => {
    setupManualStep = 5;
    renderers.setup();
  });

  // ── Step 5 handlers ──
  $('#setup-go-overview')?.addEventListener('click', () => {
    setupManualStep = null;
    if (!isRevisit && tabs.includes('setup')) tabs.splice(tabs.indexOf('setup'), 1);
    updateNav();
    location.hash = '#/overview';
    activateTab('overview');
  });
};

// ── Routing & polling ──────────────────────────────────────────

function updateNav() {
  const nav = $('nav#tabs');
  nav.className = 'sidepanel-nav';
  nav.innerHTML = tabs.map(t => {
    const icon = NAV_ICONS[t] || '';
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    return `<a href="#/${t}" data-tab="${t}"><span class="nav-icon">${icon}</span>${label}</a>`;
  }).join('');
}

function activateTab(name) {
  // Setup is always reachable via #/setup even when not in the visible nav,
  // so users can revisit the onboarding wizard after initial completion.
  if (!tabs.includes(name) && name !== 'setup') name = tabs[0];
  currentTab = name;
  $$('nav#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === name));
  render();
}

async function render() {
  try {
    updateHero(); // fire-and-forget — updates hero stats independently
    const fn = renderers[currentTab];
    if (fn) await fn();
    setStatus(true);
  } catch (err) {
    console.error(err);
    setStatus(false);
    $('#content').innerHTML = `<div class="empty-state"><h3>Error</h3><p>${escapeHTML(err.message)}</p></div>`;
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(render, 5000);
}
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

window.addEventListener('hashchange', () => {
  const tab = location.hash.replace(/^#\/?/, '').split('/')[0] || tabs[0];
  activateTab(tab);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      render();
    }
  }
});

// ── Initial load — check setup status first ──────────────────
async function init() {
  try {
    const status = await fetchJSON('/api/setup-status');
    setupStatus = status;
    if (!status.complete) {
      if (!tabs.includes('setup')) tabs.unshift('setup');
      updateNav();
      activateTab('setup');
    } else {
      if (tabs.includes('setup')) tabs.splice(tabs.indexOf('setup'), 1);
      updateNav();
      const initialTab = location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview';
      activateTab(initialTab);
    }
  } catch {
    updateNav();
    const initialTab = location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview';
    activateTab(initialTab);
  }
  startPoll();
}

init();
