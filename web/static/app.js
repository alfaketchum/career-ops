// career-ops dashboard frontend — vanilla JS, hash routing, polling refresh.

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const tabs = ['overview', 'inbox', 'tracker', 'progress', 'profile'];
const renderers = {};
let currentTab = 'overview';
let pollTimer = null;
let inboxFilter = 'all';
let trackerFilter = 'all';
let profileFile = 'profile';

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
  const [ov, scanner, scanProg] = await Promise.all([
    fetchJSON('/api/overview'),
    fetchJSON('/api/scanner-status'),
    fetchJSON('/api/scan-progress'),
  ]);
  const max = ov.scan.totalSeen || 1;

  const funnel = [
    { label: 'Scanner',   val: ov.scan.totalSeen, cls: 'scanner' },
    { label: 'Inbox',     val: ov.inboxPending,   cls: 'inbox' },
    { label: 'Light pass', val: ov.light.done,    cls: 'light' },
    { label: 'Deep pass',  val: ov.deep.done,     cls: 'deep' },
    { label: 'Applied',   val: ov.tracker.byStatus.applied || 0, cls: 'applied' },
  ];

  const funnelHTML = funnel.map(f =>
    `<div class="funnel-row">
       <span class="label">${f.label}</span>
       ${bar(f.val, max, f.cls)}
       <span class="count">${f.val}</span>
     </div>`
  ).join('');

  const scanLines = [
    ['Total seen', ov.scan.totalSeen, ''],
    ['Added to inbox', ov.scan.added, 'good'],
    ['Filtered by title', ov.scan.skippedTitle, 'muted'],
    ['Duplicates', ov.scan.skippedDup, 'muted'],
    ['Expired', ov.scan.skippedExpired, 'muted'],
    ['Last scan', ov.scan.lastScanDate || '—', ''],
  ];

  const lightLines = [
    ['Completed', `${ov.light.done} of ${ov.inboxTotal}`, ''],
    ['Avg score', ov.light.avgScore ? ov.light.avgScore.toFixed(2) : '—', 'good'],
    ['Top score', ov.light.highScore ? ov.light.highScore.toFixed(2) : '—', 'good'],
    ['Last scored', ov.light.lastScored || '—', ''],
  ];

  const deepLines = [
    ['Completed', ov.deep.done, ''],
    ['Pending light-passed', ov.deep.pending, 'warn'],
    ['Avg score', ov.deep.avgScore ? ov.deep.avgScore.toFixed(2) : '—', 'good'],
    ['Top score', ov.deep.highScore ? ov.deep.highScore.toFixed(2) : '—', 'good'],
    ['Last deep', ov.deep.lastDeepAt || '—', ''],
  ];

  const trackerLines = [
    ['Total apps', ov.tracker.total, ''],
    ['Avg score', ov.tracker.avgScore ? ov.tracker.avgScore.toFixed(2) : '—', 'good'],
    ['Top score', ov.tracker.topScore ? ov.tracker.topScore.toFixed(2) : '—', 'good'],
    ['With PDF', ov.tracker.withPDF, ''],
  ];

  const statListHTML = (lines) =>
    `<div class="stat-list">
       ${lines.map(([k, v, cls]) =>
         `<div class="stat-row"><span class="key">${k}</span><span class="val ${cls || ''}">${v}</span></div>`
       ).join('')}
     </div>`;

  const prioritiesHTML = ov.topPriorities.length === 0
    ? `<div class="empty-state"><p>No light-passed URLs yet. Run:</p><code>bash batch/batch-runner.sh --screen --parallel 5</code></div>`
    : `<div class="priorities">
         ${ov.topPriorities.map(p =>
           `<div class="p-row">
              <span class="score ${scoreCls(p.score)}">${p.score.toFixed(1)}</span>
              <span class="p-label">${escapeHTML(p.company)} — ${escapeHTML(p.role)}</span>
              <a href="${escapeHTML(p.url)}" target="_blank" rel="noopener" class="p-link">open ↗</a>
            </div>`
         ).join('')}
       </div>`;

  const statusBreakdownHTML = Object.entries(ov.tracker.byStatus)
    .map(([k, v]) => `<span class="status-tag ${k}">${k}: ${v}</span>`)
    .join(' ');

  // ── Scanner Modes card (auth status + button) ──
  const authBadge = scanner.authEnabled
    ? `<span class="badge good">✓ enabled</span>`
    : `<span class="badge muted">not configured</span>`;
  const authRunningBadge = scanner.authSetupRunning
    ? `<span class="badge warn">browser open — log in then close</span>`
    : '';
  const authButton = scanner.authEnabled
    ? `<button class="btn btn-secondary" id="auth-btn" ${scanner.authSetupRunning ? 'disabled' : ''}>Re-authenticate</button>`
    : `<button class="btn btn-primary" id="auth-btn" ${scanner.authSetupRunning ? 'disabled' : ''}>Set up LinkedIn auth</button>`;

  const scannerModesHTML = `
    <div class="section">
      <h2>Scanner Modes</h2>
      <div class="stat-list">
        <div class="stat-row">
          <span class="key">Default mode (WebSearch + verify)</span>
          <span class="val good">always on</span>
        </div>
        <div class="stat-row">
          <span class="key">Authenticated LinkedIn (opt-in)</span>
          <span class="val">${authBadge}</span>
        </div>
        <div class="stat-row">
          <span class="key">LinkedIn URLs added (auth scanner)</span>
          <span class="val">${scanner.linkedInUrlsAdded}</span>
        </div>
        ${scanner.lastLinkedInScan ? `
        <div class="stat-row">
          <span class="key">Last LinkedIn auth scan</span>
          <span class="val">${scanner.lastLinkedInScan}</span>
        </div>` : ''}
      </div>
      <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center;">
        ${authButton}
        ${authRunningBadge}
      </div>
      <div style="margin-top: 8px; color: var(--subtext); font-size: 11px;">
        ${scanner.authEnabled
          ? 'Run: <code>node scan.mjs --linkedin-auth</code> to fetch live LinkedIn URLs.'
          : 'Click to open a browser and log in to LinkedIn. Required for the opt-in authenticated scanner.'}
        <br>
        ⚠️ LinkedIn detects authenticated automation — use sparingly to avoid account restrictions.
      </div>
    </div>
  `;

  // ── Liveness Verification card ──
  const livenessCardHTML = (() => {
    const isRunning = !!scanProg.running;
    const hasState = scanProg.status && scanProg.status !== 'idle';
    const checked = scanProg.checked || 0;
    const total = scanProg.total || 0;
    const pct = total > 0 ? (checked / total) * 100 : 0;
    const activeCount = scanProg.active || 0;
    const expiredCount = scanProg.expired || 0;
    const recentActive = scanProg.recentActive || [];
    const recentExpired = scanProg.recentExpired || [];

    let statusLine = 'No verification has been run.';
    let progressBar = '';
    let recents = '';
    let buttonLabel = 'Verify URLs in pipeline';
    let buttonDisabled = '';

    if (hasState) {
      if (scanProg.status === 'running' || isRunning) {
        statusLine = scanProg.current
          ? `Verifying: <strong>${escapeHTML(scanProg.current)}</strong>`
          : 'Verifying…';
        buttonLabel = 'Verifying… (stay on this page)';
        buttonDisabled = 'disabled';
      } else if (scanProg.status === 'completed') {
        statusLine = `Last run: ${scanProg.finishedAt ? scanProg.finishedAt.split('T')[0] : 'recent'} — ${activeCount} active, ${expiredCount} expired (${total} total)`;
        buttonLabel = 'Run verification again';
      }
      progressBar = `
        <div style="margin-top: 10px;">
          <div class="bar"><div class="bar-fill ${activeCount > 0 ? 'applied' : 'light'}" style="width: ${pct}%"></div></div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--subtext); margin-top: 4px;">
            <span>${checked} / ${total} checked</span>
            <span>✓ ${activeCount} active &nbsp; ✗ ${expiredCount} expired</span>
          </div>
        </div>`;
      if (recentActive.length || recentExpired.length) {
        recents = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; font-size: 11px;">
            <div>
              <div style="color: var(--green); font-weight: 600; margin-bottom: 4px;">Recent active</div>
              ${recentActive.slice(0, 5).map(r => `<div style="color: var(--text);">${escapeHTML(r)}</div>`).join('') || '<div style="color: var(--muted);">none yet</div>'}
            </div>
            <div>
              <div style="color: var(--peach); font-weight: 600; margin-bottom: 4px;">Recent expired</div>
              ${recentExpired.slice(0, 5).map(r => `<div style="color: var(--muted);">${escapeHTML(r)}</div>`).join('') || '<div style="color: var(--muted);">none yet</div>'}
            </div>
          </div>`;
      }
    }

    return `
      <div class="section">
        <h2>URL Liveness Verification</h2>
        <div style="color: var(--subtext); font-size: 12px;">${statusLine}</div>
        ${progressBar}
        ${recents}
        <div style="margin-top: 12px;">
          <button class="btn btn-primary" id="verify-btn" ${buttonDisabled}>${buttonLabel}</button>
        </div>
        <div style="margin-top: 8px; color: var(--subtext); font-size: 11px;">
          Reads <code>batch/scan-candidates.json</code>, runs Playwright liveness on each URL, writes active to <code>data/pipeline.md</code> and all results to <code>data/scan-history.tsv</code>.
        </div>
      </div>
    `;
  })();

  const html = `
    <div class="section">
      <h2>Pipeline Funnel</h2>
      <div class="funnel">${funnelHTML}</div>
    </div>

    ${scannerModesHTML}

    ${livenessCardHTML}

    <div class="cards">
      <div class="section">
        <h2>Scanner</h2>
        ${statListHTML(scanLines)}
      </div>
      <div class="section">
        <h2>Light Pass (Haiku)</h2>
        ${statListHTML(lightLines)}
        <div class="cta">▸ bash batch/batch-runner.sh --screen --parallel 5</div>
      </div>
      <div class="section">
        <h2>Deep Pass (Sonnet)</h2>
        ${statListHTML(deepLines)}
        <div class="cta">▸ bash batch/batch-runner.sh --parallel 3 --limit 10</div>
      </div>
      <div class="section">
        <h2>Applications</h2>
        ${statListHTML(trackerLines)}
        <div style="margin-top: 10px;">${statusBreakdownHTML || '<span class="muted">no applications yet</span>'}</div>
      </div>
    </div>

    <div class="section">
      <h2>Top Priorities (next deep pass)</h2>
      ${prioritiesHTML}
    </div>
  `;
  $('#content').innerHTML = html;

  // Wire the verify button
  const verifyBtn = $('#verify-btn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Starting…';
      try {
        const r = await fetch('/api/scan-verify', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) {
          alert(data.error || 'Failed to start verification');
          verifyBtn.disabled = false;
          return;
        }
        await renderers.overview();
        // Poll every 2s while running, re-render to update progress bar
        const interval = setInterval(async () => {
          try {
            const s = await fetchJSON('/api/scan-progress');
            if (!s.running && s.status === 'completed') {
              clearInterval(interval);
            }
            await renderers.overview();
          } catch {}
        }, 2000);
      } catch (err) {
        alert('Error: ' + err.message);
        verifyBtn.disabled = false;
      }
    });
  }

  // Wire the auth-setup button
  const btn = $('#auth-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Opening browser…';
      try {
        const r = await fetch('/api/auth-setup', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) {
          alert(data.error || 'Failed to start auth setup');
          btn.disabled = false;
          btn.textContent = scanner.authEnabled ? 'Re-authenticate' : 'Set up LinkedIn auth';
          return;
        }
        // Re-render so the "browser open" badge appears + start aggressive polling
        await renderers.overview();
        // Poll every 2s for up to 5 minutes — when authSetupRunning flips to false
        // and authEnabled flips to true, we know it succeeded
        let polls = 0;
        const maxPolls = 150; // 5 min
        const interval = setInterval(async () => {
          polls++;
          if (polls > maxPolls) { clearInterval(interval); return; }
          try {
            const s = await fetchJSON('/api/scanner-status');
            if (!s.authSetupRunning) {
              clearInterval(interval);
              await renderers.overview();
            }
          } catch {}
        }, 2000);
      } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
      }
    });
  }
};

// ── Inbox ──────────────────────────────────────────────────────

renderers.inbox = async function () {
  const { items, stats } = await fetchJSON('/api/inbox');

  const filtered = items.filter(it => {
    const hasLight = it.lightScore > 0;
    const hasDeep = !!it.deepReport;
    if (inboxFilter === 'all') return true;
    if (inboxFilter === 'untouched') return !hasLight && !hasDeep;
    if (inboxFilter === 'light') return hasLight && !hasDeep;
    if (inboxFilter === 'deep') return hasDeep;
    return true;
  }).sort((a, b) => {
    const aKey = a.deepReport ? 100 + a.deepScore : a.lightScore;
    const bKey = b.deepReport ? 100 + b.deepScore : b.lightScore;
    return bKey - aKey;
  });

  const tabs = [
    { key: 'all',       label: `All (${stats.total})` },
    { key: 'untouched', label: `Untouched (${stats.untouched})` },
    { key: 'light',     label: `Light-passed (${stats.lightOnly})` },
    { key: 'deep',      label: `Deep-done (${stats.deepDone})` },
  ];

  const tabsHTML = tabs.map(t =>
    `<button class="${t.key === inboxFilter ? 'active' : ''}" data-filter="${t.key}">${t.label}</button>`
  ).join('');

  const rowsHTML = filtered.length === 0
    ? `<tr><td colspan="6"><div class="empty-state">no items match this filter</div></td></tr>`
    : filtered.map(it => `
        <tr>
          <td>${it.number}</td>
          <td><span class="tag ${it.source}">${it.source}</span></td>
          <td>${it.lightScore > 0 ? `<span class="score ${scoreCls(it.lightScore)}">${it.lightScore.toFixed(1)}</span>` : '—'}</td>
          <td>${it.deepReport ? `<span class="score ${scoreCls(it.deepScore)}">${it.deepReport} (${it.deepScore.toFixed(1)})</span>` : '—'}</td>
          <td>${escapeHTML(it.company)}</td>
          <td><a href="${escapeHTML(it.url)}" target="_blank" rel="noopener">${escapeHTML(it.role)} ↗</a></td>
        </tr>
      `).join('');

  $('#content').innerHTML = `
    <div class="section">
      <h2>Pipeline Inbox — ${stats.total} URLs</h2>
      <div class="filter-tabs">${tabsHTML}</div>
      <table>
        <thead>
          <tr><th>#</th><th>Source</th><th>Light</th><th>Deep</th><th>Company</th><th>Role</th></tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
  `;

  $$('.filter-tabs button').forEach(b => b.addEventListener('click', () => {
    inboxFilter = b.dataset.filter;
    renderers.inbox();
  }));
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

// ── Routing & polling ──────────────────────────────────────────

function activateTab(name) {
  if (!tabs.includes(name)) name = 'overview';
  currentTab = name;
  $$('nav#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === name));
  render();
}

async function render() {
  try {
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
  const tab = location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview';
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

// initial
const initialTab = location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview';
activateTab(initialTab);
startPoll();
