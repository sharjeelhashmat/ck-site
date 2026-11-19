// Every wrangler version a workflow asserts must be the version its package's lockfile installs (deploy-site run
// 44504467565 failed on "expected 4.152.0, got 4.160.1" after the lockfiles moved). For each job in .github/workflows,
// a step that runs `wrangler --version` and compares it with `[ "$v" = "X" ]` is an assertion; the package is the job's
// defaults.run.working-directory (or the step's own working-directory), and every version written in the step (its
// name, the comparison, the messages) must equal that package's package-lock.json. Reads the files only; no build needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const lockVersion = (pkg) => JSON.parse(readFileSync(join(repo, pkg, 'package-lock.json'), 'utf8')).packages['node_modules/wrangler']?.version;
const LOCKS = { site: lockVersion('site'), worker: lockVersion('worker') };

/** The wrangler version assertions in one workflow: [{ job, dir, versions, compared }]. */
export function wranglerAsserts(yamlText) {
  const out = [];
  let inJobs = false;
  let job = null;
  let inDefaults = false;
  let step = null;
  const endStep = () => {
    if (!step || !job) return;
    const text = step.lines.join('\n');
    const compared = text.match(/\[ "\$v" = "([^"]+)" \]/);
    if (/\bwrangler --version\b/.test(text) && compared) {
      const own = text.match(/^ {8}working-directory:\s*(\S+)\s*$/m);
      out.push({ job: job.name, dir: own ? own[1] : job.dir, compared: compared[1], versions: [...text.matchAll(/\b\d+\.\d+\.\d+\b/g)].map((m) => m[0]) });
    }
    step = null;
  };
  for (const line of yamlText.split('\n')) {
    const indent = line.length - line.trimStart().length;
    const blank = line.trim() === '' || line.trim().startsWith('#');
    if (!blank && indent === 0) { endStep(); inJobs = /^jobs:\s*$/.test(line); job = null; continue; }
    if (!inJobs) continue;
    if (!blank && indent === 2) { endStep(); job = { name: line.trim().replace(/:$/, ''), dir: null }; inDefaults = false; continue; }
    if (!job) continue;
    if (!blank && indent === 4) { endStep(); inDefaults = line.trim() === 'defaults:'; continue; }
    if (inDefaults) {
      const m = line.match(/^ {8}working-directory:\s*(\S+)\s*$/);
      if (m) job.dir = m[1];
      continue;
    }
    if (/^ {6}- /.test(line)) { endStep(); step = { lines: [line] }; continue; }
    if (step && (blank || indent >= 8)) step.lines.push(line);
    else if (!blank && indent < 8) endStep();
  }
  endStep();
  return out;
}

const workflows = readdirSync(join(repo, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f)).sort();
const all = workflows.flatMap((f) => wranglerAsserts(readFileSync(join(repo, '.github/workflows', f), 'utf8')).map((a) => ({ file: f, ...a })));

test('the lockfiles both install wrangler', () => {
  assert.match(LOCKS.site ?? '', /^\d+\.\d+\.\d+$/);
  assert.match(LOCKS.worker ?? '', /^\d+\.\d+\.\d+$/);
});

test('every wrangler version a workflow asserts is the version its package-lock.json installs', () => {
  // The seven assertions today: deploy-site, deploy-staging and rollback-site (site); deploy, readiness, market-data-sync
  // apply and rollback-worker (worker). A new one is checked the same way; fewer fails here, so the check cannot silently
  // vanish (for example if the step text changes so the parser no longer sees it).
  assert.ok(all.length >= 7, `${all.length} assertions found`);
  for (const a of all) {
    const where = `${a.file} job ${a.job}`;
    assert.ok(a.dir in LOCKS, `${where}: working-directory ${a.dir} is not site or worker`);
    for (const v of a.versions) assert.equal(v, LOCKS[a.dir], `${where}: asserts wrangler ${v}, ${a.dir}/package-lock.json has ${LOCKS[a.dir]}`);
    assert.equal(a.compared, LOCKS[a.dir], `${where}: compares with ${a.compared}`);
  }
});

test('the parser: finds the assertion, its package, and a stale version', () => {
  const wf = [
    'name: x', 'jobs:', '  deploy:', '    runs-on: ubuntu-24.04', '    defaults:', '      run:', '        shell: bash', '        working-directory: site', '    steps:',
    '      - run: npm ci', '      - name: Assert wrangler 1.2.3', '        run: |', '          v=$(npx --no-install wrangler --version | tr -d \'[:space:]\')',
    '          [ "$v" = "1.2.3" ] || { echo "expected wrangler 1.2.3, got: $v"; exit 1; }', '  other:', '    defaults:', '      run:', '        working-directory: worker', '    steps:',
    '      - run: npx --no-install wrangler --version', '      - name: Check', '        working-directory: site', '        run: |', '          v=$(npx --no-install wrangler --version)', '          [ "$v" = "4.5.6" ] || exit 1',
  ].join('\n');
  assert.deepEqual(wranglerAsserts(wf), [
    { job: 'deploy', dir: 'site', compared: '1.2.3', versions: ['1.2.3', '1.2.3', '1.2.3'] },
    { job: 'other', dir: 'site', compared: '4.5.6', versions: ['4.5.6'] },
  ]);
});
