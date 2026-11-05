// The mode site/dist was built in, read from the same source the build reads: src/lib/golive.ts itself (its committed
// values with GOLIVE_OVERRIDES applied) and PUBLIC_INDEXABLE (src/lib/site.ts). CI's build is noindex:
// PUBLIC_INDEXABLE=false and no GOLIVE_OVERRIDES. The public build sets PUBLIC_INDEXABLE=true; the committed golive.ts is in
// soft launch, which needs only indexing for a public build. Tests that read site/dist assert what the build under test
// must contain in its own mode, so `npm test` is green after either build and neither mode's expectation is skipped.
//
// Soft launch (golive.ts softLaunch, LEAD_CAPTURE false) removes the enquiry and profile forms, the newsletter, every
// WhatsApp link and call to action, and the Privacy, Terms and Investor Profile pages. The tests that check those keep
// their lead-capture assertions and run them against leadCaptureDist(): site/dist itself when it has lead capture, else a
// lead-capture build (GOLIVE_OVERRIDES {"softLaunch":false}, noindex) made once per test run. The soft-launch expectation
// is asserted on site/dist (tests/soft-launch.test.mjs and the tests that branch on BUILD.leadCapture).
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLIVE } from '../../src/lib/golive.ts';

const g = { ...GOLIVE };
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const BUILD = Object.freeze({
  // SITE.indexable (site.ts)
  indexable: Boolean(g.indexing) && process.env.PUBLIC_INDEXABLE === 'true',
  // AFFILIATION_LINE (site.ts, affiliation.mjs): "Working with <agency> · ORN <orn> · BRN <brn>"
  affiliation: g.agencyName && g.agencyOrn && g.brokerBrn ? `Working with ${g.agencyName} · ORN ${g.agencyOrn} · BRN ${g.brokerBrn}` : '',
  // LAUNCH_CARDS_ALLOWED (golive.ts)
  launchCards: Boolean(g.agencyName && g.agencyOrn && g.brokerBrn && g.advertiserPermitNo),
  // LEAD_CAPTURE (golive.ts): false in soft launch
  leadCapture: !g.softLaunch,
  golive: Object.freeze(g),
});

// The JSON-LD identifiers the Person carries in this build (lib/jsonld.mjs, Base.astro): the broker's BRN once the
// agency line shows, the advertiser permit once issued.
export const PERSON_IDS = [
  ...(BUILD.affiliation ? [['BRN', BUILD.golive.brokerBrn]] : []),
  ...(BUILD.golive.advertiserPermitNo ? [['UAE Media Council advertiser permit', BUILD.golive.advertiserPermitNo]] : []),
];
export const SITEMAP_LINE = 'Sitemap: https://www.sharjeelhashmat.com/sitemap-index.xml';

// The mode of the lead-capture build: noindex, no agency values.
export const LEAD_BUILD = Object.freeze({ indexable: false, affiliation: '', launchCards: false, leadCapture: true });
const LEAD_OUT = '/tmp/ck-site-leadcapture';

/**
 * A built site with lead capture: site/dist when it has it, else a noindex build with GOLIVE_OVERRIDES {"softLaunch":false},
 * built once per test run (node --test runs every file as a child of one runner; the runner's pid marks the build).
 * @returns {{ dir: string, mode: { indexable: boolean, affiliation: string, launchCards: boolean, leadCapture: boolean } }}
 */
export function leadCaptureDist() {
  if (BUILD.leadCapture) return { dir: join(ROOT, 'dist'), mode: BUILD };
  const stamp = join(LEAD_OUT, '.built-for');
  const key = String(process.ppid);
  if (!(existsSync(stamp) && readFileSync(stamp, 'utf8') === key)) {
    // Built aside and moved into place, so a reader never sees a half-written folder.
    const tmp = `${LEAD_OUT}-${process.pid}`;
    rmSync(tmp, { recursive: true, force: true });
    const env = { ...process.env, PUBLIC_INDEXABLE: 'false', GOLIVE_OVERRIDES: JSON.stringify({ softLaunch: false }) };
    const b = spawnSync('npx', ['astro', 'build', '--outDir', tmp], { cwd: ROOT, env, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(`lead-capture build failed:\n${b.stdout}\n${b.stderr}`);
    const p = spawnSync('node', ['scripts/postbuild.mjs', tmp], { cwd: ROOT, encoding: 'utf8' });
    if (p.status !== 0) throw new Error(`lead-capture postbuild failed:\n${p.stdout}\n${p.stderr}`);
    writeFileSync(join(tmp, '.built-for'), key);
    rmSync(LEAD_OUT, { recursive: true, force: true });
    renameSync(tmp, LEAD_OUT);
  }
  return { dir: LEAD_OUT, mode: LEAD_BUILD };
}
