/**
 * web/parsers.mjs — JS ports of dashboard/internal/data/career.go.
 *
 * All functions return plain JS objects suitable for JSON serialization.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { readHistory } from '../pass-history.mjs';

// ── helpers ─────────────────────────────────────────────────────

function readFirst(paths) {
  for (const p of paths) {
    try {
      return { content: readFileSync(p, 'utf8'), path: p };
    } catch {}
  }
  return null;
}

function detectSource(url) {
  const low = (url || '').toLowerCase();
  if (low.includes('linkedin.com')) return 'linkedin';
  if (low.includes('glassdoor.com')) return 'glassdoor';
  if (low.includes('indeed.com')) return 'indeed';
  if (low.includes('builtin.com')) return 'builtin';
  if (low.includes('weworkremotely.com')) return 'wwr';
  if (low.includes('remoteok.com')) return 'remoteok';
  if (low.includes('cryptojobslist.com')) return 'cryptojobs';
  if (low.includes('web3.career')) return 'web3';
  if (low.includes('jobs.ashbyhq.com')) return 'ashby';
  if (low.includes('jobs.lever.co')) return 'lever';
  if (low.includes('greenhouse.io')) return 'greenhouse';
  if (low.includes('flexjobs.com')) return 'flexjobs';
  return 'other';
}

function normalizeStatus(raw) {
  if (!raw) return 'evaluated';
  let s = raw.replace(/\*\*/g, '').toLowerCase().trim();
  s = s.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();

  if (/no aplicar|no_aplicar|^skip$|geo blocker/.test(s)) return 'skip';
  if (/interview|entrevista/.test(s)) return 'interview';
  if (/offer|oferta/.test(s)) return 'offer';
  if (/responded|respondido/.test(s)) return 'responded';
  if (/applied|aplicado|aplicada|enviada|sent/.test(s)) return 'applied';
  if (/rejected|rechazado|rechazada/.test(s)) return 'rejected';
  if (/discarded|descartado|descartada|cerrada|cancelada|duplicado|^dup/.test(s))
    return 'discarded';
  if (/evaluated|evaluada|condicional|hold|monitor|evaluar|verificar/.test(s))
    return 'evaluated';
  return 'evaluated';
}

// ── applications.md ─────────────────────────────────────────────

export function parseApplications(careerOpsPath) {
  const r = readFirst([
    join(careerOpsPath, 'applications.md'),
    join(careerOpsPath, 'data', 'applications.md'),
  ]);
  if (!r) return [];

  const apps = [];
  let num = 0;
  const reReportLink = /\[(\d+)\]\(([^)]+)\)/;
  const reScore = /(\d+\.?\d*)\/5/;

  for (let line of r.content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('# ') || line.startsWith('|---') || line.startsWith('| #'))
      continue;
    if (!line.startsWith('|')) continue;

    let fields;
    if (line.includes('\t')) {
      line = line.replace(/^\|/, '').trim();
      fields = line.split('\t').map(p => p.trim().replace(/^\|+|\|+$/g, ''));
    } else {
      line = line.replace(/^\|+|\|+$/g, '');
      fields = line.split('|').map(p => p.trim());
    }
    if (fields.length < 8) continue;

    num++;
    const scoreRaw = fields[4] || '';
    const m = reScore.exec(scoreRaw);
    const score = m ? parseFloat(m[1]) : 0;

    let reportPath = '';
    let reportNumber = '';
    const linkMatch = reReportLink.exec(fields[7] || '');
    if (linkMatch) {
      reportNumber = linkMatch[1];
      reportPath = linkMatch[2];
    }

    apps.push({
      number: num,
      date: fields[1] || '',
      company: fields[2] || '',
      role: fields[3] || '',
      scoreRaw,
      score,
      status: normalizeStatus(fields[5] || ''),
      hasPDF: (fields[6] || '').includes('✅'),
      reportPath,
      reportNumber,
      notes: (fields[8] || '').trim(),
      jobURL: '',
      archetype: '',
      tldr: '',
      remote: '',
      compEstimate: '',
    });
  }
  return apps;
}

// ── pipeline.md (joined with pass-history) ──────────────────────

export function parsePipelineInbox(careerOpsPath) {
  const r = readFirst([
    join(careerOpsPath, 'data', 'pipeline.md'),
    join(careerOpsPath, 'pipeline.md'),
  ]);
  if (!r) return [];

  // Read pass-history (pass-history.mjs uses cwd-relative path; ensure we cd-equivalent)
  // The function readHistory uses HISTORY_PATH = 'data/pass-history.tsv' relative to CWD.
  // For correctness when careerOpsPath != cwd, parse manually here too.
  const history = loadPassHistoryDirect(careerOpsPath);

  const items = [];
  let num = 0;
  const re = /^- \[([ x])\]\s+(\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/;

  for (let line of r.content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const m = re.exec(line);
    if (!m) continue;
    num++;
    const url = m[2].trim();
    const item = {
      number: num,
      url,
      company: m[3].trim(),
      role: m[4].trim(),
      source: detectSource(url),
      processed: m[1] === 'x',
      lightScore: 0,
      lightAt: '',
      deepReport: '',
      deepScore: 0,
      deepAt: '',
    };
    const h = history.get(url);
    if (h) {
      if (h.company) item.company = h.company;
      if (h.role) item.role = h.role;
      item.lightScore = h.lightScore || 0;
      item.lightAt = h.lightAt || '';
      item.deepReport = h.deepReport || '';
      item.deepScore = h.deepScore || 0;
      item.deepAt = h.deepAt || '';
    }
    items.push(item);
  }
  return items;
}

function loadPassHistoryDirect(careerOpsPath) {
  const r = readFirst([
    join(careerOpsPath, 'data', 'pass-history.tsv'),
    join(careerOpsPath, 'pass-history.tsv'),
  ]);
  const map = new Map();
  if (!r) return map;
  const lines = r.content.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = line.split('\t');
    if (f.length < 8) continue;
    const [url, company, role, ls, la, dr, ds, da] = f;
    map.set(url, {
      url,
      company: company || '',
      role: role || '',
      lightScore: ls === '-' || !ls ? null : parseFloat(ls),
      lightAt: la === '-' || !la ? null : la,
      deepReport: dr === '-' || !dr ? null : dr,
      deepScore: ds === '-' || !ds ? null : parseFloat(ds),
      deepAt: da === '-' || !da ? null : da,
    });
  }
  return map;
}

// ── scan-history.tsv ────────────────────────────────────────────

export function loadScanStats(careerOpsPath) {
  const stats = {
    totalSeen: 0,
    added: 0,
    skippedTitle: 0,
    skippedDup: 0,
    skippedExpired: 0,
    lastScanDate: '',
    bySource: {},
  };
  const r = readFirst([
    join(careerOpsPath, 'data', 'scan-history.tsv'),
    join(careerOpsPath, 'scan-history.tsv'),
  ]);
  if (!r) return stats;

  const lines = r.content.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = line.split('\t');
    if (f.length < 6) continue;
    const [, date, portal, , , status] = f;
    stats.totalSeen++;
    switch (status) {
      case 'added': stats.added++; break;
      case 'skipped_title': stats.skippedTitle++; break;
      case 'skipped_dup': stats.skippedDup++; break;
      case 'skipped_expired': stats.skippedExpired++; break;
    }
    if (date && date > stats.lastScanDate) stats.lastScanDate = date;
    if (portal) {
      const src = portal.split(/\s+/)[0];
      stats.bySource[src] = (stats.bySource[src] || 0) + 1;
    }
  }
  return stats;
}

// ── reports/*.md (lazy summary) ─────────────────────────────────

export function loadReportSummary(reportPath) {
  if (!existsSync(reportPath)) return null;
  const content = readFileSync(reportPath, 'utf8');
  const get = (re) => {
    const m = re.exec(content);
    return m ? m[1].trim().replace(/\|+\s*$/, '').trim() : '';
  };
  const archetype =
    get(/(?:Arquetipo(?:\s+detectado)?)\*\*\s*\|\s*(.+)/i) ||
    get(/(?:Arquetipo):\*\*\s*(.+)/i);
  let tldr =
    get(/\*\*TL;DR\*\*\s*\|\s*(.+)/i) ||
    get(/\*\*TL;DR:\*\*\s*(.+)/i);
  if (tldr.length > 240) tldr = tldr.slice(0, 240) + '…';
  const remote = get(/\*\*Remote\*\*\s*\|\s*(.+)/i);
  const comp = get(/\*\*Comp\*\*\s*\|\s*(.+)/i);
  const url = get(/\*\*URL:\*\*\s*(https?:\/\/\S+)/);
  return { archetype, tldr, remote, compEstimate: comp, jobURL: url };
}

// ── computed metrics ────────────────────────────────────────────

export function computeMetrics(apps) {
  const m = { total: apps.length, byStatus: {}, avgScore: 0, topScore: 0, withPDF: 0, actionable: 0 };
  let scoreSum = 0;
  let scoreCount = 0;
  for (const a of apps) {
    m.byStatus[a.status] = (m.byStatus[a.status] || 0) + 1;
    if (a.score > 0) {
      scoreSum += a.score;
      scoreCount++;
      if (a.score > m.topScore) m.topScore = a.score;
    }
    if (a.hasPDF) m.withPDF++;
    if (!['skip', 'rejected', 'discarded'].includes(a.status)) m.actionable++;
  }
  if (scoreCount > 0) m.avgScore = scoreSum / scoreCount;
  return m;
}

export function computeProgressMetrics(apps) {
  const stages = ['evaluated', 'applied', 'responded', 'interview', 'offer', 'rejected'];
  const counts = Object.fromEntries(stages.map(s => [s, 0]));
  for (const a of apps) {
    if (counts[a.status] !== undefined) counts[a.status]++;
  }
  // Funnel cumulative
  const funnel = [
    { label: 'Evaluated', count: apps.length },
    { label: 'Applied', count: counts.applied + counts.responded + counts.interview + counts.offer + counts.rejected },
    { label: 'Responded', count: counts.responded + counts.interview + counts.offer },
    { label: 'Interview', count: counts.interview + counts.offer },
    { label: 'Offer', count: counts.offer },
  ];
  const max = funnel[0].count || 1;
  funnel.forEach(s => (s.pct = (s.count / max) * 100));

  const buckets = [
    { label: '4.5-5.0', count: 0 },
    { label: '4.0-4.4', count: 0 },
    { label: '3.5-3.9', count: 0 },
    { label: '3.0-3.4', count: 0 },
    { label: '<3.0', count: 0 },
  ];
  for (const a of apps) {
    if (a.score === 0) continue;
    if (a.score >= 4.5) buckets[0].count++;
    else if (a.score >= 4.0) buckets[1].count++;
    else if (a.score >= 3.5) buckets[2].count++;
    else if (a.score >= 3.0) buckets[3].count++;
    else buckets[4].count++;
  }

  // Weekly activity (last 8 ISO weeks)
  const weekCounts = new Map();
  for (const a of apps) {
    if (!a.date) continue;
    const w = isoWeek(a.date);
    weekCounts.set(w, (weekCounts.get(w) || 0) + 1);
  }
  const weeklyActivity = [...weekCounts.entries()]
    .sort()
    .slice(-8)
    .map(([week, count]) => ({ week, count }));

  const applied = funnel[1].count || 1;
  const responded = funnel[2].count;
  const interview = funnel[3].count;
  const offer = funnel[4].count;

  return {
    funnelStages: funnel,
    scoreBuckets: buckets,
    weeklyActivity,
    responseRate: (responded / applied) * 100,
    interviewRate: (interview / applied) * 100,
    offerRate: (offer / applied) * 100,
    avgScore: computeMetrics(apps).avgScore,
    topScore: computeMetrics(apps).topScore,
    totalOffers: counts.offer,
    activeApps: apps.filter(a => !['skip', 'rejected', 'discarded'].includes(a.status)).length,
  };
}

function isoWeek(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function computeInboxStats(items) {
  const s = { total: items.length, untouched: 0, lightOnly: 0, deepDone: 0, avgLight: 0, avgDeep: 0 };
  let lightSum = 0, lightCount = 0, deepSum = 0, deepCount = 0;
  for (const it of items) {
    const hasLight = it.lightScore > 0;
    const hasDeep = !!it.deepReport;
    if (hasDeep) {
      s.deepDone++;
      deepSum += it.deepScore;
      deepCount++;
    } else if (hasLight) {
      s.lightOnly++;
      lightSum += it.lightScore;
      lightCount++;
    } else {
      s.untouched++;
    }
    if (hasLight && hasDeep) {
      lightSum += it.lightScore;
      lightCount++;
    }
  }
  if (lightCount) s.avgLight = lightSum / lightCount;
  if (deepCount) s.avgDeep = deepSum / deepCount;
  return s;
}

export function computeOverview(careerOpsPath) {
  const apps = parseApplications(careerOpsPath);
  const items = parsePipelineInbox(careerOpsPath);
  const scan = loadScanStats(careerOpsPath);
  const tracker = computeMetrics(apps);

  const overview = {
    scan,
    inboxTotal: items.length,
    inboxPending: items.filter(it => !it.processed).length,
    light: { done: 0, pending: 0, avgScore: 0, highScore: 0, lastScored: '' },
    deep: { done: 0, pending: 0, avgScore: 0, highScore: 0, lastDeepAt: '' },
    topPriorities: [],
    tracker,
  };

  let lightSum = 0, deepSum = 0;
  const pending = [];
  let lastLight = '', lastDeep = '';

  for (const it of items) {
    if (it.lightScore > 0) {
      overview.light.done++;
      lightSum += it.lightScore;
      if (it.lightScore > overview.light.highScore) overview.light.highScore = it.lightScore;
      if (it.lightAt > lastLight) lastLight = it.lightAt;
      if (!it.deepReport) {
        pending.push({ score: it.lightScore, company: it.company, role: it.role, url: it.url });
      }
    }
    if (it.deepReport) {
      overview.deep.done++;
      deepSum += it.deepScore;
      if (it.deepScore > overview.deep.highScore) overview.deep.highScore = it.deepScore;
      if (it.deepAt > lastDeep) lastDeep = it.deepAt;
    }
  }
  if (overview.light.done) overview.light.avgScore = lightSum / overview.light.done;
  if (overview.deep.done) overview.deep.avgScore = deepSum / overview.deep.done;
  overview.light.lastScored = lastLight;
  overview.deep.lastDeepAt = lastDeep;
  overview.light.pending = Math.max(0, overview.inboxPending - overview.light.done);
  overview.deep.pending = pending.length;

  pending.sort((a, b) => b.score - a.score);
  overview.topPriorities = pending.slice(0, 10);
  return overview;
}

// ── profile files (whitelist) ───────────────────────────────────

export const PROFILE_FILES = {
  'cv': 'cv.md',
  'profile': 'modes/_profile.md',
  'digest': 'article-digest.md',
  'config': 'config/profile.yml',
  'portals': 'portals.yml',
};

export function readProfileFile(careerOpsPath, key) {
  const rel = PROFILE_FILES[key];
  if (!rel) return null;
  const p = join(careerOpsPath, rel);
  if (!existsSync(p)) return { path: rel, content: `(file not found: ${rel})` };
  return { path: rel, content: readFileSync(p, 'utf8') };
}

// ── scanner status (auth + LinkedIn coverage) ──

export function getScannerStatus(careerOpsPath) {
  const authDir = join(careerOpsPath, '.playwright-auth');
  const authEnabled = existsSync(authDir);

  // Count LinkedIn URLs added by the authenticated scanner
  // (linkedin-scan.mjs always tags portal as "LinkedIn — ...")
  const stats = {
    authEnabled,
    linkedInUrlsAdded: 0,
    lastLinkedInScan: '',
    webSearchUrlsAdded: 0,
  };

  const scanPath = join(careerOpsPath, 'data', 'scan-history.tsv');
  if (!existsSync(scanPath)) return stats;
  const content = readFileSync(scanPath, 'utf8');
  const lines = content.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split('\t');
    if (f.length < 6) continue;
    const [, date, portal, , , status] = f;
    if (status !== 'added') continue;
    // linkedin-scan.mjs portals always include " (Remote)" suffix and use em-dash;
    // WebSearch portals from /career-ops scan use "site:linkedin.com" or just "LinkedIn — ... Remote" (no parens)
    if (portal && /^LinkedIn — .* \(Remote\)/.test(portal)) {
      stats.linkedInUrlsAdded++;
      if (date > stats.lastLinkedInScan) stats.lastLinkedInScan = date;
    } else if (portal && portal.startsWith('site:')) {
      stats.webSearchUrlsAdded++;
    }
  }
  return stats;
}

// Simple report content read for the in-app viewer
export function readReport(careerOpsPath, reportPath) {
  // reportPath comes in as e.g. "reports/045-acme-2026-04-14.md"
  // Reject anything that escapes the careerOpsPath
  const safe = reportPath.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
  const p = join(careerOpsPath, safe);
  if (!existsSync(p)) return null;
  return { path: safe, content: readFileSync(p, 'utf8') };
}
