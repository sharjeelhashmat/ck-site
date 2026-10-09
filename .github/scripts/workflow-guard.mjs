#!/usr/bin/env node
// Workflow guard (P1β CS-1): static policy checks over .github/workflows/*.yml|*.yaml.
//
//   node workflow-guard.mjs --self-test      good/ fixtures must pass, bad/ fixtures must fail with their expected rule
//   node workflow-guard.mjs --mode=audit     report violations, always exit 0
//   node workflow-guard.mjs --mode=enforce   report violations, exit 1 if any (default when --mode is omitted)
//
// Rules (see RULES below). R0 covers scope (.github/actions/, workflow files outside .github/workflows/) and YAML
// parsing (any parse error or warning, alias explosion). Rules for deploy/deploy-site/rollback key off the file name
// stem, case-insensitive, so deploy.yaml and Deploy.yml get the same rules as deploy.yml.
//
// Fixture headers (first lines of each fixture):  "# as: <workflow file name>"  and, for bad/, "# expect: R<n>".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, parse, LineCounter, isMap, isSeq, isAlias, isScalar } from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

export const RULES = {
  R0: 'scope + YAML parse',
  R1: 'deploy/rollback triggers = {workflow_dispatch}',
  R2: 'forbidden triggers; ci.yml triggers',
  R3: 'secret placement',
  R4: 'production environment + ref guard',
  R5: 'permissions',
  R6: 'pinned actions/* only',
  R7: 'forbidden run commands',
  R8: 'no wrangler/npx in failure()/always() steps',
  R9: 'static deploy concurrency',
  R10: 'static working-directory',
  R11: 'rollback.yml structure',
};

const SECRET_RE = /\$\{\{[\s\S]*?\bsecrets\b[\s\S]*?\}\}/i;
const GUARD = "github.ref == 'refs/heads/phase2-site'";
const DEPLOY_STEMS = new Set(['deploy', 'deploy-site', 'rollback']);
const ROLLBACK_TARGETS = { 'rollback-worker': 'ck-lead-worker', 'rollback-site': 'ck-site-web' };
const CONCURRENCY = { deploy: 'prod-ck-lead-worker', 'deploy-site': 'prod-ck-site-web' };
const ROLLBACK_CONCURRENCY = { 'rollback-worker': 'prod-ck-lead-worker', 'rollback-site': 'prod-ck-site-web' };
const FORBIDDEN_EVENTS = ['pull_request_target', 'workflow_call', 'workflow_run', 'schedule', 'repository_dispatch'];
const ACTION_RE = /^actions\/[A-Za-z0-9._-]+@[0-9a-f]{40}$/;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const stemOf = (name) => name.replace(/\.ya?ml$/i, '').toLowerCase();
const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function containsSecret(x) {
  if (typeof x === 'string') return SECRET_RE.test(x);
  if (Array.isArray(x)) return x.some(containsSecret);
  if (isObj(x)) return Object.entries(x).some(([k, v]) => SECRET_RE.test(k) || containsSecret(v));
  return false;
}

// Unwraps an optional single ${{ }} wrapper. Returns null when the text mixes literal text and expressions.
function unwrapExpr(s) {
  const t = String(s).trim();
  const m = t.match(/^\$\{\{([\s\S]*)\}\}$/);
  const inner = m ? m[1] : t;
  if (inner.includes('${{') || (m && inner.includes('}}'))) return null;
  return collapse(inner);
}

// Run text normalisation: join backslash-newline, drop quotes/backticks and stray backslashes, collapse whitespace.
// `commands` splits on newlines, ;, &&, || and | before collapsing, for per-command checks.
function prepRun(raw) {
  const joined = String(raw).replace(/\\\r?\n/g, '').replace(/['"`]/g, '').replace(/\\/g, '');
  return {
    flat: collapse(joined),
    commands: joined.split(/\r?\n|;|&&|\|\||\|/).map(collapse).filter(Boolean),
  };
}

function eventsOf(on) {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  if (isObj(on)) return Object.keys(on);
  return [];
}

// YAML node lookup for line numbers: walks maps/seqs, resolving aliases; falls back to the deepest node found.
function lineOf(doc, lc, p) {
  let node = doc.contents;
  let best = node;
  for (const k of p) {
    if (isAlias(node)) node = node.resolve(doc);
    if (isMap(node)) {
      const pair = node.items.find((it) => String(isScalar(it.key) ? it.key.value : it.key) === String(k));
      if (!pair) break;
      best = pair.key?.range ? pair.key : pair.value ?? best;
      node = pair.value;
    } else if (isSeq(node) && typeof k === 'number' && node.items[k]) {
      node = node.items[k];
      best = node;
    } else break;
    if (!node) break;
  }
  return best?.range ? lc.linePos(best.range[0]).line : null;
}

function checkConcurrency(c, expected) {
  if (c === undefined) return 'concurrency missing';
  if (!isObj(c)) return 'concurrency must be a mapping with group and cancel-in-progress: false';
  const extra = Object.keys(c).filter((k) => k !== 'group' && k !== 'cancel-in-progress');
  if (extra.length) return `unexpected concurrency key(s): ${extra.join(', ')}`;
  if (typeof c.group !== 'string' || c.group.includes('${{')) return 'concurrency group must be a static string';
  if (c.group !== expected) return `concurrency group must be "${expected}" (found "${c.group}")`;
  if (c['cancel-in-progress'] !== false) return 'cancel-in-progress must be false';
  return null;
}

export function analyse(fileName, src) {
  const out = [];
  const stem = stemOf(fileName);
  const lc = new LineCounter();
  const doc = parseDocument(src, { uniqueKeys: true, merge: true, prettyErrors: true, lineCounter: lc });
  const add = (rule, job, message, p) =>
    out.push({ workflow: fileName, job: job ?? '-', rule, message, line: p ? lineOf(doc, lc, p) : null });
  for (const [kind, list] of [['error', doc.errors], ['warning', doc.warnings]]) {
    for (const e of list) {
      out.push({ workflow: fileName, job: '-', rule: 'R0', message: `YAML ${kind} ${e.code}: ${e.message.split('\n')[0]}`, line: e.linePos?.[0]?.line ?? null });
    }
  }
  if (out.length) return out;
  let wf;
  try {
    wf = doc.toJS({ maxAliasCount: 50 });
  } catch (e) {
    add('R0', null, `YAML could not be resolved: ${e.message}`);
    return out;
  }
  if (!isObj(wf)) {
    add('R0', null, 'workflow is not a mapping');
    return out;
  }
  const jobs = isObj(wf.jobs) ? wf.jobs : null;
  if (!jobs) add('R0', null, 'jobs must be a mapping', ['jobs']);

  // Trigger key: "on", or a boolean-true key (YAML 1.1 reading of `on`).
  const trigKeys = Object.keys(wf).filter((k) => k === 'on' || k === 'true');
  const trigKey = trigKeys[0];
  const on = trigKey !== undefined ? wf[trigKey] : undefined;
  const events = eventsOf(on);
  if (trigKeys.length !== 1) add('R2', null, `expected exactly one trigger key, found ${trigKeys.length}`);

  // R1
  if (DEPLOY_STEMS.has(stem) && !same([...new Set(events)].sort(), ['workflow_dispatch'])) {
    add('R1', null, `triggers must be exactly {workflow_dispatch}; found {${events.join(', ')}}`, [trigKey]);
  }
  // R2
  for (const e of events) {
    if (FORBIDDEN_EVENTS.includes(e)) add('R2', null, `forbidden trigger: ${e}`, [trigKey, e]);
  }
  if (stem === 'ci') {
    if (!same([...new Set(events)].sort(), ['pull_request', 'push'])) {
      add('R2', null, `ci triggers must be exactly {pull_request, push}; found {${events.join(', ')}}`, [trigKey]);
    }
    if (isObj(on)) {
      const pr = on.pull_request;
      if (!(pr === null || pr === undefined || (isObj(pr) && !Object.keys(pr).length))) {
        add('R2', null, 'ci pull_request must have no filters', [trigKey, 'pull_request']);
      }
      if ('push' in on && !same(on.push, { branches: ['phase2-site'] })) {
        add('R2', null, 'ci push must be exactly branches: [phase2-site]', [trigKey, 'push']);
      }
    }
  }

  // R3 (workflow level): no secret reference anywhere outside jobs (covers env and defaults).
  for (const k of Object.keys(wf)) {
    if (k !== 'jobs' && containsSecret(wf[k])) add('R3', null, `workflow-level "${k}" references secrets`, [k]);
  }
  // R5 (workflow level)
  if (!same(wf.permissions, { contents: 'read' })) {
    add('R5', null, `top-level permissions must be {contents: read}; found ${JSON.stringify(wf.permissions ?? null)}`, ['permissions']);
  }
  // R10 (workflow level)
  const wfWd = wf.defaults?.run?.['working-directory'];
  if (wfWd !== undefined && (typeof wfWd !== 'string' || wfWd.includes('${{'))) {
    add('R10', null, 'defaults.run.working-directory must be a plain string', ['defaults', 'run', 'working-directory']);
  }
  // R9 (workflow level)
  if (stem in CONCURRENCY && wf.concurrency !== undefined) {
    const err = checkConcurrency(wf.concurrency, CONCURRENCY[stem]);
    if (err) add('R9', null, err, ['concurrency']);
  }
  if (stem === 'rollback' && wf.concurrency !== undefined) {
    add('R9', null, 'workflow-level concurrency is forbidden in rollback.yml', ['concurrency']);
  }

  for (const [id, job] of Object.entries(jobs ?? {})) {
    const J = (...p) => ['jobs', id, ...p];
    if (!isObj(job)) {
      add('R0', id, 'job must be a mapping', J());
      continue;
    }
    // R3 (job level)
    if ('uses' in job) add('R3', id, `job-level uses (reusable workflow) is forbidden: ${job.uses}`, J('uses'));
    if ('secrets' in job) add('R3', id, `job-level secrets is forbidden: ${JSON.stringify(job.secrets)}`, J('secrets'));
    // R6 (job level)
    if ('uses' in job && !ACTION_RE.test(String(job.uses))) add('R6', id, `uses not allowed: ${job.uses}`, J('uses'));

    // R4
    const hasSecret = containsSecret(job);
    if (hasSecret || 'environment' in job) {
      const env = job.environment;
      const envName = typeof env === 'string' ? env : isObj(env) && Object.keys(env).every((k) => k === 'name' || k === 'url') ? env.name : undefined;
      if (envName !== 'production') {
        add('R4', id, `${hasSecret ? 'job references secrets; ' : ''}environment must be production (found ${JSON.stringify(env ?? null)})`, J(env === undefined ? '' : 'environment').filter(Boolean));
      }
      const cond = typeof job.if === 'string' ? unwrapExpr(job.if) : null;
      if (stem === 'rollback' && id in ROLLBACK_TARGETS) {
        const want = `${GUARD} && inputs.target == '${ROLLBACK_TARGETS[id]}'`;
        if (cond !== want) add('R4', id, `if must be exactly: ${want} (found ${JSON.stringify(job.if ?? null)})`, J('if'));
      } else {
        const problems = [];
        if (cond === null) problems.push(job.if === undefined ? 'missing if' : 'if is not a single expression');
        else {
          if (!cond.startsWith(GUARD)) problems.push(`must start with ${GUARD}`);
          else {
            const rest = cond.slice(GUARD.length).trim();
            if (rest && !rest.startsWith('&&')) problems.push('guard may only be followed by && clauses');
          }
          if (cond.includes('||')) problems.push('|| is forbidden');
          if (/!\s*\(|!\s*github\.ref/.test(cond)) problems.push('negation of the guard is forbidden');
          if (/\balways\s*\(/i.test(cond)) problems.push('always() is forbidden');
        }
        if (problems.length) add('R4', id, `${hasSecret ? 'secret-bearing job' : 'environment job'} if: ${problems.join('; ')} (found ${JSON.stringify(job.if ?? null)})`, J('if'));
      }
    }

    // R5 (job level)
    if ('permissions' in job && !same(job.permissions, {}) && !same(job.permissions, { contents: 'read' })) {
      add('R5', id, `job permissions must be {} or {contents: read}; found ${JSON.stringify(job.permissions)}`, J('permissions'));
    }
    // R10 (job level)
    const jobWd = job.defaults?.run?.['working-directory'];
    if (jobWd !== undefined && (typeof jobWd !== 'string' || jobWd.includes('${{'))) {
      add('R10', id, 'defaults.run.working-directory must be a plain string', J('defaults', 'run', 'working-directory'));
    }
    // R9 (job level)
    if (stem in CONCURRENCY) {
      if (wf.concurrency === undefined || job.concurrency !== undefined) {
        const err = checkConcurrency(job.concurrency, CONCURRENCY[stem]);
        if (err) add('R9', id, err, J('concurrency'));
      }
    }
    if (stem === 'rollback' && id in ROLLBACK_CONCURRENCY) {
      const err = checkConcurrency(job.concurrency, ROLLBACK_CONCURRENCY[id]);
      if (err) add('R9', id, err, J('concurrency'));
    }

    const steps = job.steps === undefined ? [] : job.steps;
    if (!Array.isArray(steps)) {
      add('R0', id, 'steps must be a list', J('steps'));
      continue;
    }
    const wranglerCommands = [];
    steps.forEach((step, i) => {
      const S = (...p) => J('steps', i, ...p);
      if (!isObj(step)) {
        add('R0', id, `step ${i} must be a mapping`, S());
        return;
      }
      // R6
      if ('uses' in step && !ACTION_RE.test(String(step.uses))) add('R6', id, `uses not allowed: ${step.uses}`, S('uses'));
      // R10
      const wd = step['working-directory'];
      if (wd !== undefined && (typeof wd !== 'string' || wd.includes('${{'))) {
        add('R10', id, 'step working-directory must be a plain string', S('working-directory'));
      }
      if (step.run === undefined) return;
      const { flat, commands } = prepRun(step.run);
      const R = S('run');
      // R7
      if (stem !== 'rollback' && commands.some((c) => /\bwrangler\b.*\brollback\b/i.test(c))) add('R7', id, '"wrangler rollback" is only allowed in rollback.yml', R);
      if (stem === 'rollback' && /\bd1\b/i.test(flat)) add('R7', id, '"d1" is forbidden in rollback.yml', R);
      if (/wrangler@/i.test(flat)) add('R7', id, '"wrangler@<version>" is forbidden (use the pinned devDependency)', R);
      // npx's own --yes/-y (auto-install), i.e. among the flags before the package name; --yes passed to the tool is R7's next check.
      if (commands.some((c) => /\b(npx|npm (exec|x))(\s+-\S+)*?\s+(--yes|-y)(?=\s|=|$)/i.test(c))) add('R7', id, '"npx --yes" is forbidden', R);
      if (stem !== 'rollback' && /(^|\s)--yes(?=\s|=|$)/.test(flat)) add('R7', id, '"--yes" is only allowed in rollback.yml', R);
      if (/\b(curl|wget)\b.*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/i.test(flat)) add('R7', id, 'piping curl/wget into a shell is forbidden', R);
      if (/\bd1\s+time-travel\s+restore\b/i.test(flat)) add('R7', id, '"wrangler d1 time-travel restore" is forbidden', R);
      if (/\bd1\s+execute\b/i.test(flat)) add('R7', id, '"wrangler d1 execute" is forbidden', R);
      // R8
      if (typeof step.if === 'string' && /\b(failure|always)\s*\(/i.test(step.if) && /\b(wrangler|npx)\b/i.test(flat)) {
        add('R8', id, 'a failure()/always() step must not run wrangler or npx', S('if'));
      }
      for (const c of commands) if (/\bwrangler\b/i.test(c)) wranglerCommands.push({ c, path: R });
    });

    // R11 (per rollback job)
    if (stem === 'rollback' && id in ROLLBACK_TARGETS) {
      const target = ROLLBACK_TARGETS[id];
      if ('needs' in job) add('R11', id, 'needs is forbidden', J('needs'));
      if (job.strategy?.matrix !== undefined) add('R11', id, 'strategy.matrix is forbidden', J('strategy'));
      const real = wranglerCommands.filter(({ c }) => !/\bwrangler (--version|-v)$/i.test(c));
      if (!real.length) add('R11', id, `no wrangler command with --name ${target}`, J('steps'));
      for (const { c, path: p } of real) {
        const names = [...c.matchAll(/--name(?:=|\s+)(\S+)/g)].map((m) => m[1]);
        if (!names.length || names.some((n) => n !== target)) add('R11', id, `wrangler --name must be ${target}: "${c}"`, p);
      }
    }
  }

  // R11 (workflow level)
  if (stem === 'rollback') {
    const ids = Object.keys(jobs ?? {}).sort();
    if (!same(ids, ['rollback-site', 'rollback-worker'])) add('R11', null, `jobs must be exactly rollback-worker, rollback-site; found ${ids.join(', ')}`, ['jobs']);
    const target = isObj(on) ? on.workflow_dispatch?.inputs?.target : undefined;
    if (!isObj(target) || target.type !== 'choice' || !same(target.options, ['ck-lead-worker', 'ck-site-web'])) {
      add('R11', null, 'inputs.target must be type: choice with options exactly [ck-lead-worker, ck-site-web]', [trigKey, 'workflow_dispatch', 'inputs', 'target']);
    }
  }
  return out;
}

// Scope: every workflow file is in .github/workflows/ (top level); no .github/actions/; no workflow/action YAML
// anywhere else under .github/. The guard's own fixtures and node_modules are excluded.
function scope(root) {
  const gh = path.join(root, '.github');
  const violations = [];
  const workflows = [];
  const v = (rel, message) => violations.push({ workflow: rel, job: '-', rule: 'R0', message, line: null });
  if (fs.existsSync(path.join(gh, 'actions'))) v('.github/actions/', '.github/actions/ must not exist');
  const skip = new Set([path.join(gh, 'scripts', 'node_modules'), path.join(gh, 'scripts', 'fixtures')]);
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (skip.has(abs)) continue;
      if (ent.isDirectory()) { walk(abs); continue; }
      if (!/\.ya?ml$/i.test(ent.name)) continue;
      if (path.dirname(abs) === path.join(gh, 'workflows')) { workflows.push(rel); continue; }
      if (rel.startsWith('.github/workflows/')) { v(rel, 'workflow file in a subdirectory of .github/workflows/'); continue; }
      if (/^\.github\/dependabot\.ya?ml$/.test(rel)) continue;
      let parsed;
      try { parsed = parse(fs.readFileSync(abs, 'utf8')); } catch { v(rel, 'unparseable YAML outside .github/workflows/'); continue; }
      if (isObj(parsed) && ('jobs' in parsed || 'runs' in parsed || 'on' in parsed || 'true' in parsed)) {
        v(rel, 'workflow/action file outside .github/workflows/');
      }
    }
  };
  if (fs.existsSync(gh)) walk(gh);
  return { violations, workflows: workflows.sort() };
}

function rowsFor(file, violations) {
  const stem = stemOf(path.basename(file));
  const applicable = Object.keys(RULES).filter((r) =>
    (r !== 'R1' || DEPLOY_STEMS.has(stem)) && (r !== 'R9' || stem in CONCURRENCY || stem === 'rollback') && (r !== 'R11' || stem === 'rollback'));
  const rows = [];
  for (const r of applicable) {
    const hits = violations.filter((x) => x.rule === r);
    if (!hits.length) rows.push({ workflow: file, job: '-', rule: r, result: 'PASS', line: '', message: '' });
    for (const h of hits) rows.push({ workflow: file, job: h.job, rule: r, result: 'FAIL', line: h.line ?? '', message: h.message });
  }
  return rows;
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function scan(mode) {
  const { violations: scopeV, workflows } = scope(REPO);
  const all = [...scopeV];
  const rows = scopeV.map((x) => ({ ...x, result: 'FAIL', line: '' }));
  if (!scopeV.length) rows.push({ workflow: '.github', job: '-', rule: 'R0', result: 'PASS', line: '', message: 'scope' });
  for (const rel of workflows) {
    const vs = analyse(path.basename(rel), fs.readFileSync(path.join(REPO, rel), 'utf8')).map((x) => ({ ...x, workflow: rel }));
    all.push(...vs);
    rows.push(...rowsFor(rel, vs));
  }
  const present = new Set(workflows.map((w) => stemOf(path.basename(w))));
  for (const s of DEPLOY_STEMS) {
    if (!present.has(s)) rows.push({ workflow: `.github/workflows/${s}.yml`, job: '-', rule: '-', result: 'ABSENT', line: '', message: 'file not present; its rules apply once it exists' });
  }

  const header = ['workflow', 'job', 'rule', 'result', 'line', 'detail'];
  const cells = rows.map((r) => [r.workflow, r.job, r.rule, r.result, String(r.line), r.message]);
  const title = mode === 'audit' ? 'Workflow guard (AUDIT mode: violations are reported, the job does not fail)' : 'Workflow guard (ENFORCE mode)';
  const verdict = `${all.length} violation(s) across ${workflows.length} workflow file(s)`;
  const md = [`## ${title}`, '', `**${verdict}**`, '', `| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`,
    ...cells.map((c) => `| ${c.map(esc).join(' | ')} |`), ''].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

  const report = { mode, generatedAt: new Date().toISOString(), workflows, violationCount: all.length, violations: all, rows };
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(process.cwd(), 'workflow-guard-report.json'), json + '\n');
  console.log('\nworkflow-guard-report.json:');
  console.log(json);
  return all.length;
}

function selfTest() {
  const dir = path.join(HERE, 'fixtures');
  let ok = true;
  const lines = ['| fixture | as | expected | got | result |', '|---|---|---|---|---|'];
  for (const kind of ['good', 'bad']) {
    const files = fs.readdirSync(path.join(dir, kind)).filter((f) => /\.ya?ml$/.test(f)).sort();
    if (!files.length) { ok = false; lines.push(`| ${kind}/ | - | - | no fixtures | FAIL |`); }
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, kind, f), 'utf8');
      const as = src.match(/^# as: (\S+)/m)?.[1] ?? f;
      const expect = src.match(/^# expect: (R\d+)/m)?.[1];
      let got;
      try { got = [...new Set(analyse(as, src).map((x) => x.rule))]; } catch (e) { got = [`crash: ${e.message}`]; }
      const pass = kind === 'good' ? got.length === 0 : Boolean(expect) && got.includes(expect);
      if (!pass) ok = false;
      lines.push(`| ${kind}/${f} | ${as} | ${kind === 'good' ? 'none' : expect ?? 'MISSING # expect'} | ${got.join(', ') || 'none'} | ${pass ? 'PASS' : 'FAIL'} |`);
    }
  }
  const md = [`## Workflow guard self-test: ${ok ? 'PASS' : 'FAIL'}`, '', ...lines, ''].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    try { return selfTest() ? 0 : 1; } catch (e) { console.error(`self-test error: ${e.stack}`); return 1; }
  }
  const modeArg = args.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'enforce';
  if (mode !== 'audit' && mode !== 'enforce') {
    console.error(`unknown mode: ${mode} (use --mode=audit or --mode=enforce)`);
    return 2;
  }
  try {
    const n = scan(mode);
    return mode === 'enforce' && n ? 1 : 0;
  } catch (e) {
    console.error(`workflow-guard error: ${e.stack}`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Workflow guard ERROR\n\n${esc(e.message)}\n`);
    return mode === 'audit' ? 0 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
