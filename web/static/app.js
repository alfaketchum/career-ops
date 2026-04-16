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

const tabs = ['overview', 'jobs', 'keywords', 'tracker', 'progress', 'profile', 'settings'];
const renderers = {};
let currentTab = 'overview';
let pollTimer = null;
let jobsFilter = 'all';
let trackerFilter = 'all';
let profileFile = 'profile';

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
  const [ov, scanner, cvProg, scanStatus, livenessStatus] = await Promise.all([
    fetchJSON('/api/overview'),
    fetchJSON('/api/scanner-status'),
    fetchJSON('/api/cv-progress'),
    fetchJSON('/api/scan-now-status').catch(() => ({ running: false, log: '' })),
    fetchJSON('/api/liveness-status').catch(() => ({ running: false })),
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
    ['Last scan', ov.lastScanDate || '—', ''],
  ];

  const cvLines = [
    ['Selected for CV', jobs.selected, ''],
    ['CV generated', jobs.cvDone, 'good'],
    ['Generating', cvProg.cvPending || 0, 'warn'],
    ['Failed', cvProg.cvFailed || 0, cvProg.cvFailed ? 'bad' : 'muted'],
  ];

  const trackerLines = [
    ['Total apps', ov.tracker?.total || 0, ''],
    ['Avg score', ov.tracker?.avgScore ? ov.tracker.avgScore.toFixed(2) : '—', 'good'],
    ['Top score', ov.tracker?.topScore ? ov.tracker.topScore.toFixed(2) : '—', 'good'],
    ['With PDF', ov.tracker?.withPDF || 0, ''],
  ];

  const statusBreakdownHTML = ov.tracker?.byStatus
    ? Object.entries(ov.tracker.byStatus).map(([k, v]) => `<span class="status-tag ${k}">${k}: ${v}</span>`).join(' ')
    : '';

  // Scanner modes card
  const authBadge = scanner.authEnabled
    ? `<span class="badge good">enabled</span>`
    : `<span class="badge muted">not configured</span>`;
  const authButton = scanner.authEnabled
    ? `<button class="btn btn-secondary" id="auth-btn" ${scanner.authSetupRunning ? 'disabled' : ''}>Re-authenticate</button>`
    : `<button class="btn btn-primary" id="auth-btn" ${scanner.authSetupRunning ? 'disabled' : ''}>Set up LinkedIn auth</button>`;

  // CV generation card
  const cvRunning = cvProg.running;
  const cvBtnLabel = cvRunning ? 'Generating CVs…' : `Generate CVs (${jobs.selected} selected)`;
  const cvBtnDisabled = cvRunning || jobs.selected === 0 ? 'disabled' : '';

  // Scan now button
  const scanRunning = scanStatus.running;
  const scanBtnDisabled = scanRunning ? 'disabled' : '';

  // Liveness button
  const livenessRunning = livenessStatus.running;
  const livenessBtnLabel = livenessRunning ? 'Checking liveness…' : `Check liveness (${jobs.unchecked} unchecked)`;
  const livenessBtnDisabled = livenessRunning || jobs.unchecked === 0 ? 'disabled' : '';

  // Check if API key is available for websearch mode
  const hasApiKey = !!ov.scan?.apiKeySet; // we'll check this below

  // Scan log preview
  const scanLogPreview = scanStatus.log
    ? `<pre style="margin-top: 8px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 11px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;">${escapeHTML(scanStatus.log.slice(-1200))}</pre>`
    : '';

  const html = `
    <div class="section">
      <h2>Pipeline</h2>
      <div class="funnel">${funnelHTML}</div>
    </div>

    <div class="section">
      <h2>Scan & Verify</h2>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <select id="scan-mode" style="padding: 6px 8px; background: var(--surface0); color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-size: 12px;" ${scanRunning ? 'disabled' : ''}>
          <option value="api">API scan (Greenhouse/Ashby/Lever)</option>
          <option value="websearch">WebSearch (uses API key)</option>
          <option value="both">Both (API + WebSearch)</option>
        </select>
        <button class="btn btn-primary" id="scan-btn" ${scanBtnDisabled}>${scanRunning ? 'Scanning…' : 'Scan now'}</button>
        ${scanner.authEnabled ? `<label style="font-size: 12px; color: var(--subtext); display: flex; align-items: center; gap: 4px;"><input type="checkbox" id="scan-linkedin" ${scanRunning ? 'disabled' : ''}> + LinkedIn</label>` : ''}
      </div>
      <div style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <button class="btn btn-secondary" id="liveness-btn" ${livenessBtnDisabled}>${livenessBtnLabel}</button>
      </div>
      <div style="margin-top: 6px; font-size: 11px; color: var(--subtext);">
        <strong>API</strong> — free, hits company career APIs from portals.yml.
        <strong>WebSearch</strong> — uses Anthropic API key + Haiku to search LinkedIn/Indeed/Glassdoor via portals.yml queries.
        <strong>Claude CLI</strong> — run <code>/career-ops scan</code> in Claude for the richest results.
      </div>
      ${scanLogPreview}
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

    <div class="section">
      <h2>Scanner Modes</h2>
      <div class="stat-list">
        <div class="stat-row"><span class="key">API scanner (Greenhouse/Ashby/Lever)</span><span class="val good">always on</span></div>
        <div class="stat-row"><span class="key">LinkedIn auth</span><span class="val">${authBadge}</span></div>
        <div class="stat-row"><span class="key">LinkedIn URLs added</span><span class="val">${scanner.linkedInUrlsAdded}</span></div>
      </div>
      <div style="margin-top: 12px;">${authButton}</div>
    </div>
  `;
  $('#content').innerHTML = html;

  // Wire CV generation button
  const genCvBtn = $('#gen-cv-btn');
  if (genCvBtn) {
    genCvBtn.addEventListener('click', async () => {
      genCvBtn.disabled = true;
      genCvBtn.textContent = 'Starting…';
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

  // Wire auth button
  const authBtn = $('#auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', async () => {
      authBtn.disabled = true;
      authBtn.textContent = 'Opening browser…';
      try {
        const r = await fetch('/api/auth-setup', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) { alert(data.error); authBtn.disabled = false; return; }
        await renderers.overview();
        const interval = setInterval(async () => {
          try {
            const s = await fetchJSON('/api/scanner-status');
            if (!s.authSetupRunning) { clearInterval(interval); await renderers.overview(); }
          } catch {}
        }, 2000);
      } catch (err) { alert(err.message); authBtn.disabled = false; }
    });
  }

  // Wire scan button
  const scanBtn = $('#scan-btn');
  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning…';
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
            await renderers.overview();
          } catch {}
        }, 2000);
      } catch (err) { alert(err.message); scanBtn.disabled = false; scanBtn.textContent = 'Scan now'; }
    });
  }

  // Wire liveness button
  const livenessBtn = $('#liveness-btn');
  if (livenessBtn) {
    livenessBtn.addEventListener('click', async () => {
      livenessBtn.disabled = true;
      livenessBtn.textContent = 'Starting…';
      try {
        const r = await fetch('/api/liveness-check', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) { alert(data.error); livenessBtn.disabled = false; return; }
        livenessBtn.textContent = 'Checking… (refresh to see progress)';
        const interval = setInterval(async () => {
          try {
            const s = await fetchJSON('/api/liveness-status');
            if (!s.running) { clearInterval(interval); await renderers.overview(); }
          } catch {}
        }, 3000);
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
  const kw = await fetchJSON('/api/keywords');
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
      <div style="margin-top: 16px; display: flex; gap: 8px;">
        <input type="text" id="new-keyword" placeholder="Add a keyword…" style="flex: 1; padding: 6px 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px;">
        <button class="btn btn-primary" id="add-keyword">Add</button>
        <button class="btn btn-secondary" id="regen-keywords">Regenerate from profile</button>
      </div>
      <div style="margin-top: 8px; font-size: 11px; color: var(--subtext);">
        Generated from: cv.md, config/profile.yml, article-digest.md
        ${kw.generated_at ? ` · last generated: ${kw.generated_at}` : ''}
      </div>
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

  // Wire regenerate
  $('#regen-keywords')?.addEventListener('click', async () => {
    const btn = $('#regen-keywords');
    btn.disabled = true;
    btn.textContent = 'Regenerating…';
    await fetch('/api/keywords/regenerate', { method: 'POST' });
    await renderers.keywords();
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

renderers.setup = async function () {
  const status = await fetchJSON('/api/setup-status');
  setupStatus = status;

  // Determine current step
  let step = 1;
  if (status.cv) step = 2;
  if (status.cv && status.profile) step = 3;
  if (status.cv && status.profile && status.portals) step = 4;
  if (status.cv && status.profile && status.portals && status.keywords) step = 5;

  const steps = ['CV', 'Profile', 'Portals', 'Keywords', 'Done'];
  const progressHTML = steps.map((s, i) => {
    const n = i + 1;
    const cls = n < step ? 'done' : n === step ? 'active' : '';
    return `<div class="wizard-dot ${cls}"><span>${n}</span><label>${s}</label></div>`;
  }).join('<div class="wizard-line"></div>');

  let stepHTML = '';

  if (step === 1) {
    stepHTML = `
      <div class="wizard-step">
        <h3>Step 1: Your CV</h3>
        <p>Paste your resume or CV below. Plain text or markdown — we'll use it to generate search keywords and tailor CVs for each job.</p>
        <textarea id="setup-cv" class="wizard-textarea" rows="16" placeholder="Paste your CV here…&#10;&#10;# Your Name&#10;&#10;## Experience&#10;&#10;### Company — Location&#10;**Job Title**&#10;Date range&#10;&#10;- Achievement 1&#10;- Achievement 2"></textarea>
        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-cv-save">Save & continue</button>
          <button class="btn btn-secondary" id="setup-cv-skip">Skip for now</button>
        </div>
      </div>
    `;
  } else if (step === 2) {
    stepHTML = `
      <div class="wizard-step">
        <h3>Step 2: Your Profile</h3>
        <p>Tell us about yourself and what roles you're targeting.</p>
        <div class="wizard-form">
          <div class="wizard-field">
            <label>Full name *</label>
            <input type="text" id="setup-name" placeholder="Jane Smith">
          </div>
          <div class="wizard-field">
            <label>Email</label>
            <input type="email" id="setup-email" placeholder="jane@example.com">
          </div>
          <div class="wizard-field">
            <label>Phone</label>
            <input type="text" id="setup-phone" placeholder="+1-555-0123">
          </div>
          <div class="wizard-field">
            <label>Location</label>
            <input type="text" id="setup-location" placeholder="NYC / Remote">
          </div>
          <div class="wizard-field">
            <label>Target roles (comma-separated) *</label>
            <input type="text" id="setup-roles" placeholder="Financial Analyst, Business Analyst, Strategy Analyst">
          </div>
          <div class="wizard-field">
            <label>Salary range</label>
            <input type="text" id="setup-salary" placeholder="$100K-150K">
          </div>
        </div>
        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-profile-save">Save & continue</button>
          <button class="btn btn-secondary" id="setup-profile-skip">Skip for now</button>
        </div>
      </div>
    `;
  } else if (step === 3) {
    stepHTML = `
      <div class="wizard-step">
        <h3>Step 3: Job Portals</h3>
        <p>The scanner searches LinkedIn, Indeed, Glassdoor, Greenhouse, and 20+ other job boards for your target roles. We'll configure the search queries based on the roles you entered.</p>
        <p style="font-size: 12px; color: var(--subtext);">You can customize <code>portals.yml</code> later to add specific companies or adjust search queries.</p>
        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-portals-save">Use defaults & continue</button>
          <button class="btn btn-secondary" id="setup-portals-skip">Skip for now</button>
        </div>
      </div>
    `;
  } else if (step === 4) {
    // Auto-generate keywords and show them
    stepHTML = `
      <div class="wizard-step">
        <h3>Step 4: Search Keywords</h3>
        <p>Generating keywords from your CV and profile…</p>
        <div id="setup-keywords-result"></div>
        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-keywords-done" disabled>Looks good — finish setup</button>
        </div>
      </div>
    `;
  } else {
    stepHTML = `
      <div class="wizard-step">
        <h3>You're all set!</h3>
        <p>Your profile is configured and keywords are ready. Here's what to do next:</p>
        <div class="stat-list" style="margin: 16px 0;">
          <div class="stat-row"><span class="key">1. Scan for jobs</span><span class="val">Click "Scan now" on the Overview tab</span></div>
          <div class="stat-row"><span class="key">2. Check liveness</span><span class="val">Verify which jobs are still open</span></div>
          <div class="stat-row"><span class="key">3. Select & apply</span><span class="val">Check jobs in the Jobs tab, generate tailored CVs</span></div>
        </div>
        <div class="wizard-actions">
          <button class="btn btn-primary" id="setup-go-overview">Go to Overview</button>
        </div>
      </div>
    `;
  }

  $('#content').innerHTML = `
    <div class="section">
      <h2>Setup</h2>
      <div class="wizard-progress">${progressHTML}</div>
      ${stepHTML}
    </div>
  `;

  // Wire step 1
  $('#setup-cv-save')?.addEventListener('click', async () => {
    const content = $('#setup-cv')?.value;
    if (!content?.trim()) { alert('Please paste your CV first.'); return; }
    const btn = $('#setup-cv-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    const r = await fetch('/api/setup/cv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    const d = await r.json();
    if (!d.ok) { alert(d.error); btn.disabled = false; btn.textContent = 'Save & continue'; return; }
    await renderers.setup();
  });
  $('#setup-cv-skip')?.addEventListener('click', async () => {
    // Write a placeholder
    await fetch('/api/setup/cv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '# My CV\n\n(paste your CV here later)' }) });
    await renderers.setup();
  });

  // Wire step 2
  $('#setup-profile-save')?.addEventListener('click', async () => {
    const name = $('#setup-name')?.value?.trim();
    if (!name) { alert('Name is required.'); return; }
    const roles = $('#setup-roles')?.value?.trim();
    if (!roles) { alert('Enter at least one target role.'); return; }
    const btn = $('#setup-profile-save');
    btn.disabled = true; btn.textContent = 'Saving…';
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
    if (!d.ok) { alert(d.error); btn.disabled = false; btn.textContent = 'Save & continue'; return; }
    await renderers.setup();
  });
  $('#setup-profile-skip')?.addEventListener('click', async () => {
    await fetch('/api/setup/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'User', targetRoles: 'Analyst', salaryRange: '' }),
    });
    await renderers.setup();
  });

  // Wire step 3
  $('#setup-portals-save')?.addEventListener('click', async () => {
    const btn = $('#setup-portals-save');
    btn.disabled = true; btn.textContent = 'Setting up…';
    const r = await fetch('/api/setup/portals', { method: 'POST' });
    const d = await r.json();
    if (!d.ok) { alert(d.error); btn.disabled = false; btn.textContent = 'Use defaults & continue'; return; }
    await renderers.setup();
  });
  $('#setup-portals-skip')?.addEventListener('click', async () => {
    // Just copy the template as-is
    await fetch('/api/setup/portals', { method: 'POST' });
    await renderers.setup();
  });

  // Wire step 4 — auto-generate keywords
  if (step === 4) {
    const r = await fetch('/api/setup/keywords', { method: 'POST' });
    const d = await r.json();
    const container = $('#setup-keywords-result');
    const doneBtn = $('#setup-keywords-done');
    if (d.ok && d.keywords) {
      const all = [...d.keywords, ...(d.user_added || [])];
      container.innerHTML = `
        <p style="color: var(--green);">${all.length} keywords generated:</p>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0;">
          ${all.filter(k => k.enabled).map(k => `<span class="tag ${k.source}">${escapeHTML(k.term)}</span>`).join('')}
        </div>
        <p style="font-size: 12px; color: var(--subtext);">You can manage these in the Keywords tab anytime.</p>
      `;
      doneBtn.disabled = false;
    } else {
      container.innerHTML = `<p style="color: var(--peach);">Could not generate keywords: ${escapeHTML(d.error || 'unknown error')}. You can set them up later in the Keywords tab.</p>`;
      doneBtn.disabled = false;
      doneBtn.textContent = 'Continue anyway';
    }
  }
  $('#setup-keywords-done')?.addEventListener('click', () => {
    // Remove setup tab and go to overview
    if (tabs.includes('setup')) tabs.splice(tabs.indexOf('setup'), 1);
    updateNav();
    location.hash = '#/overview';
    activateTab('overview');
  });

  // Wire step 5
  $('#setup-go-overview')?.addEventListener('click', () => {
    if (tabs.includes('setup')) tabs.splice(tabs.indexOf('setup'), 1);
    updateNav();
    location.hash = '#/overview';
    activateTab('overview');
  });
};

// ── Routing & polling ──────────────────────────────────────────

function updateNav() {
  const nav = $('nav#tabs');
  nav.className = 'pill-nav';
  nav.innerHTML = tabs.map(t =>
    `<a href="#/${t}" data-tab="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</a>`
  ).join('');
}

function activateTab(name) {
  if (!tabs.includes(name)) name = tabs[0];
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
      // Insert setup tab at the front
      if (!tabs.includes('setup')) tabs.unshift('setup');
      updateNav();
      activateTab('setup');
    } else {
      // Remove setup tab if present
      if (tabs.includes('setup')) tabs.splice(tabs.indexOf('setup'), 1);
      const initialTab = location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview';
      activateTab(initialTab);
    }
  } catch {
    // Can't reach server — just show overview
    const initialTab = location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview';
    activateTab(initialTab);
  }
  startPoll();
}

init();
