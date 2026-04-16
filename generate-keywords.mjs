#!/usr/bin/env node

/**
 * generate-keywords.mjs — Auto-generate search keywords from user profile.
 *
 * Reads config/profile.yml, cv.md, and article-digest.md to produce
 * data/keywords.json with search terms for LinkedIn and WebSearch scanners.
 *
 * Tracks file checksums to detect changes and suggest new keywords
 * without overwriting user-added terms.
 *
 * Usage:
 *   node generate-keywords.mjs              # generate/refresh keywords
 *   node generate-keywords.mjs --check      # check if source files changed (exit 0=changed, 1=no change)
 *   node generate-keywords.mjs --diff       # show new keyword suggestions vs current
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import yaml from 'js-yaml';

const PROFILE_PATH = 'config/profile.yml';
const CV_PATH = 'cv.md';
const DIGEST_PATH = 'article-digest.md';
const KEYWORDS_PATH = 'data/keywords.json';

mkdirSync('data', { recursive: true });

function fileHash(path) {
  if (!existsSync(path)) return '';
  return createHash('md5').update(readFileSync(path, 'utf8')).digest('hex');
}

function extractFromProfile(path) {
  if (!existsSync(path)) return [];
  const cfg = yaml.load(readFileSync(path, 'utf8')) || {};
  const terms = [];

  // Primary target roles
  const primary = cfg.target_roles?.primary || [];
  for (const role of primary) {
    terms.push({ term: role, source: 'profile' });
  }

  // Archetype names (deduplicated against primary)
  const primaryLower = new Set(primary.map(r => r.toLowerCase()));
  for (const arch of cfg.target_roles?.archetypes || []) {
    if (arch.name && !primaryLower.has(arch.name.toLowerCase())) {
      terms.push({ term: arch.name, source: 'profile' });
    }
  }

  // Narrative superpowers as domain hints
  for (const sp of cfg.narrative?.superpowers || []) {
    if (sp.length <= 40) {
      terms.push({ term: sp, source: 'profile' });
    }
  }

  return terms;
}

function extractFromCV(path) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');
  const terms = [];
  const seen = new Set();
  const lines = content.split('\n');

  // Job titles follow "### Company — Location" headers in the Experience section.
  // Pattern: ### line, then **Title** on the next non-empty line (no colon — that's a skills label).
  let inExperience = false;
  let prevWasCompanyHeader = false;

  for (const line of lines) {
    if (/^## Experience/i.test(line)) { inExperience = true; continue; }
    if (/^## /i.test(line) && inExperience) { inExperience = false; continue; }

    if (inExperience && /^### /.test(line)) {
      prevWasCompanyHeader = true;
      continue;
    }

    if (inExperience && prevWasCompanyHeader) {
      const m = /^\*\*(.+?)\*\*/.exec(line);
      if (m) {
        const title = m[1].trim();
        // Strip trailing comma-separated context (e.g. ", Consumer L2") to get the core role
        const core = title.replace(/,\s*[^,]+$/, '').trim();
        if (core.length >= 5 && core.length <= 60 && !seen.has(core.toLowerCase())) {
          seen.add(core.toLowerCase());
          terms.push({ term: core, source: 'cv' });
        }
      }
      prevWasCompanyHeader = false;
      continue;
    }

    if (line.trim()) prevWasCompanyHeader = false;
  }

  return terms;
}

function extractFromDigest(path) {
  // The digest contains proof points and narrative frames — useful for CV tailoring
  // but not for job search keywords. Company names are already covered by CV extraction,
  // and headers like "Personality & Self-Assessment" aren't searchable roles.
  // Return empty — the digest feeds evaluation quality, not keyword generation.
  return [];
}

function deduplicateTerms(terms) {
  const seen = new Set();
  return terms.filter(t => {
    const key = t.term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadExisting() {
  if (!existsSync(KEYWORDS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(KEYWORDS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const diffMode = args.includes('--diff');

  const hashes = {
    cv: fileHash(CV_PATH),
    profile: fileHash(PROFILE_PATH),
    digest: fileHash(DIGEST_PATH),
  };

  const existing = loadExisting();

  // --check: just report if files changed
  if (checkOnly) {
    if (!existing) {
      console.log('no-keywords-file');
      process.exit(0);
    }
    const changed = Object.keys(hashes).some(
      k => hashes[k] !== (existing.source_hashes?.[k] || '')
    );
    console.log(changed ? 'changed' : 'unchanged');
    process.exit(changed ? 0 : 1);
  }

  // Generate keywords from all sources
  const profileTerms = extractFromProfile(PROFILE_PATH);
  const cvTerms = extractFromCV(CV_PATH);
  const digestTerms = extractFromDigest(DIGEST_PATH);

  const allTerms = deduplicateTerms([...profileTerms, ...cvTerms, ...digestTerms]);

  // Build keywords list, preserving enabled state from existing file
  const existingMap = new Map();
  if (existing) {
    for (const kw of existing.keywords || []) {
      existingMap.set(kw.term.toLowerCase(), kw);
    }
  }

  const keywords = allTerms.map(t => {
    const prev = existingMap.get(t.term.toLowerCase());
    return {
      term: t.term,
      source: t.source,
      enabled: prev ? prev.enabled : true,
    };
  });

  // Preserve user-added keywords (never overwritten)
  const userAdded = existing?.user_added || [];

  // --diff: show what changed
  if (diffMode) {
    const oldTerms = new Set((existing?.keywords || []).map(k => k.term.toLowerCase()));
    const newTerms = new Set(keywords.map(k => k.term.toLowerCase()));
    const added = keywords.filter(k => !oldTerms.has(k.term.toLowerCase()));
    const removed = (existing?.keywords || []).filter(k => !newTerms.has(k.term.toLowerCase()));

    if (added.length === 0 && removed.length === 0) {
      console.log('No keyword changes detected.');
    } else {
      if (added.length) {
        console.log('New keywords:');
        for (const k of added) console.log(`  + ${k.term} (${k.source})`);
      }
      if (removed.length) {
        console.log('Removed keywords:');
        for (const k of removed) console.log(`  - ${k.term} (${k.source})`);
      }
    }
    process.exit(0);
  }

  // Check for pending suggestions (source files changed since last generation)
  let pendingSuggestions = null;
  if (existing && Object.keys(hashes).some(k => hashes[k] !== (existing.source_hashes?.[k] || ''))) {
    const oldTerms = new Set((existing.keywords || []).map(k => k.term.toLowerCase()));
    const newOnly = keywords.filter(k => !oldTerms.has(k.term.toLowerCase()));
    if (newOnly.length > 0) {
      pendingSuggestions = newOnly;
    }
  }

  const output = {
    generated_at: new Date().toISOString().split('T')[0],
    source_hashes: hashes,
    keywords,
    user_added: userAdded,
    ...(pendingSuggestions ? { pending_suggestions: pendingSuggestions } : {}),
  };

  writeFileSync(KEYWORDS_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(`Keywords generated: ${keywords.length} auto + ${userAdded.length} user-added`);
  console.log(`Saved to ${KEYWORDS_PATH}`);
  if (pendingSuggestions) {
    console.log(`\n⚠️  ${pendingSuggestions.length} new keyword suggestions pending review`);
  }
}

main();
