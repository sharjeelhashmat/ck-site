#!/usr/bin/env node
// Migration lint (P1β CS-1). Plain Node, no dependencies.
//
// pull_request (GITHUB_BASE_REF set, or --base=<branch>):
//   git diff --name-status --no-renames "origin/<base>...HEAD" -- worker/migrations/
//   - any status other than A (M, D, R, C, T, ...) on a migration = FAIL: migrations are immutable.
//   - an added file must be named ^[0-9]{4}_[a-z0-9_]+\.sql$, sit directly in worker/migrations/, must not reuse
//     an existing file name or 4-digit number (in the base branch or within the same change), and must pass the
//     additive-only check.
// push (no base ref): additive-only check over every file in worker/migrations/.
//
// Additive-only check: strip -- line comments and /* */ blocks, uppercase, then
//   - FAIL on the tokens DROP, DELETE, UPDATE, TRUNCATE, REPLACE, RENAME anywhere;
//   - every statement must start with CREATE TABLE, CREATE INDEX, CREATE UNIQUE INDEX, ALTER TABLE <t> ADD COLUMN,
//     INSERT INTO <t> (t created earlier in the same file) or PRAGMA. Anything else = FAIL.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = 'worker/migrations';
const NAME_RE = /^[0-9]{4}_[a-z0-9_]+\.sql$/;
const BANNED_RE = /\b(DROP|DELETE|UPDATE|TRUNCATE|REPLACE|RENAME)\b/g;
const IDENT = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[A-Z_][A-Z0-9_$]*)`;
const NAME = String.raw`((?:${IDENT}\.)?${IDENT})`;
const CREATE_TABLE_RE = new RegExp(String.raw`^CREATE TABLE (?:IF NOT EXISTS )?${NAME}(?:\s|\(|$)`);
const CREATE_INDEX_RE = /^CREATE (?:UNIQUE )?INDEX\b/;
const ALTER_ADD_RE = new RegExp(String.raw`^ALTER TABLE ${NAME} ADD COLUMN\b`);
const INSERT_RE = new RegExp(String.raw`^INSERT (?:OR IGNORE )?INTO ${NAME}(?:\s|\(|$)`);
const PRAGMA_RE = /^PRAGMA\b/;

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
const unquote = (n) => n.split('.').pop().replace(/^["`[]|["`\]]$/g, '');

// Removes comments outside quoted strings/identifiers; returns the remaining text (quotes kept).
function stripComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) throw new Error(`unterminated ${c} quote`);
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === '-' && n === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
    } else if (c === '/' && n === '*') {
      const j = sql.indexOf('*/', i + 2);
      if (j < 0) throw new Error('unterminated /* comment');
      out += ' ';
      i = j + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// Splits on ; outside quotes.
function statements(text) {
  const out = [];
  let cur = '';
  let q = null;
  for (const c of text) {
    if (q) { if (c === q) q = null; cur += c; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if (c === ';') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function additiveCheck(sql) {
  let text;
  try {
    text = stripComments(sql).toUpperCase();
  } catch (e) {
    return [e.message];
  }
  const problems = [];
  const banned = [...new Set([...text.matchAll(BANNED_RE)].map((m) => m[1]))];
  if (banned.length) problems.push(`forbidden token(s): ${banned.join(', ')}`);
  const created = new Set();
  for (const s of statements(text)) {
    const head = s.slice(0, 60);
    let m;
    if ((m = s.match(CREATE_TABLE_RE))) created.add(unquote(m[1]));
    else if (CREATE_INDEX_RE.test(s) || ALTER_ADD_RE.test(s) || PRAGMA_RE.test(s)) continue;
    else if ((m = s.match(INSERT_RE))) {
      if (!created.has(unquote(m[1]))) problems.push(`INSERT into a table not created earlier in this file: "${head}"`);
    } else problems.push(`statement not allowed: "${head}"`);
  }
  return problems;
}

function checkFile(rel) {
  return additiveCheck(fs.readFileSync(path.join(REPO, rel), 'utf8'));
}

function diffMode(base) {
  const range = `origin/${base}...HEAD`;
  console.log(`pull_request mode: git diff --name-status --no-renames "${range}" -- ${DIR}/`);
  const out = git('diff', '--name-status', '--no-renames', range, '--', `${DIR}/`);
  const existing = git('ls-tree', '--name-only', `origin/${base}`, `${DIR}/`)
    .split('\n').filter(Boolean).map((p) => path.posix.basename(p));
  const existingNames = new Set(existing.map((n) => n.toLowerCase()));
  const usedNumbers = new Map(existing.filter((n) => /^[0-9]{4}_/.test(n)).map((n) => [n.slice(0, 4), n]));
  const rows = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [status, ...paths] = line.split('\t');
    const rel = paths[paths.length - 1];
    const name = path.posix.basename(rel);
    const reasons = [];
    if (status !== 'A') {
      reasons.push(`status ${status}: existing migrations are immutable`);
    } else {
      if (path.posix.dirname(rel) !== DIR) reasons.push(`must sit directly in ${DIR}/`);
      if (!NAME_RE.test(name)) reasons.push('name must match ^[0-9]{4}_[a-z0-9_]+\\.sql$');
      if (existingNames.has(name.toLowerCase())) reasons.push('name collides with an existing migration');
      const num = name.slice(0, 4);
      if (/^[0-9]{4}$/.test(num) && usedNumbers.has(num)) reasons.push(`number ${num} already used by ${usedNumbers.get(num)}`);
      else if (/^[0-9]{4}$/.test(num)) usedNumbers.set(num, name);
      reasons.push(...checkFile(rel));
    }
    rows.push({ file: rel, status, verdict: reasons.length ? 'FAIL' : 'PASS', reason: reasons.join('; ') });
  }
  return rows;
}

function fullMode() {
  console.log(`push mode: additive-only check over every file in ${DIR}/`);
  return fs.readdirSync(path.join(REPO, DIR)).sort().map((name) => {
    const rel = `${DIR}/${name}`;
    const reasons = fs.statSync(path.join(REPO, rel)).isFile() ? checkFile(rel) : ['not a regular file'];
    return { file: rel, status: 'existing', verdict: reasons.length ? 'FAIL' : 'PASS', reason: reasons.join('; ') };
  });
}

function print(rows) {
  const head = ['file', 'status', 'verdict', 'reason'];
  const cells = rows.map((r) => [r.file, r.status, r.verdict, r.reason || '-']);
  const w = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const fmt = (c) => c.map((x, i) => x.padEnd(w[i])).join(' | ');
  console.log(fmt(head));
  console.log(w.map((n) => '-'.repeat(n)).join('-|-'));
  for (const c of cells) console.log(fmt(c));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const esc = (s) => s.replace(/\|/g, '\\|');
    const md = ['## Migration lint', '', `| ${head.join(' | ')} |`, '|---|---|---|---|',
      ...cells.map((c) => `| ${c.map(esc).join(' | ')} |`), ''];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  }
}

function main() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--base='));
  const base = arg ? arg.slice('--base='.length) : process.env.GITHUB_BASE_REF || '';
  if (base && !/^[A-Za-z0-9._/-]+$/.test(base)) throw new Error(`refusing unexpected base ref: ${base}`);
  const rows = base ? diffMode(base) : fullMode();
  if (!rows.length) console.log(`no changes under ${DIR}/`);
  else print(rows);
  const failed = rows.filter((r) => r.verdict === 'FAIL').length;
  console.log(failed ? `\nFAIL: ${failed} migration file(s) rejected` : '\nPASS');
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`migrations-lint error: ${e.message}`);
    process.exitCode = 1;
  }
}
