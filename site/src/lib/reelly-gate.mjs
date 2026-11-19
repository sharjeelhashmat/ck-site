// The public gate for Reelly launch cards and project pages on /new-launches (owner 2026-11-19). OFF in this build and
// until both hold:
//   1. GOLIVE allows launch cards at all: LAUNCH_CARDS_ALLOWED (agency, its ORN, the broker's BRN and the advertiser
//      permit in golive.ts), the same switch as "Launches I'm watching";
//   2. per project, the existing launch-reviews rules (market.mjs checkLaunchReviews): a Trakheesi permit number and a
//      self-hosted QR, the agency name and ORN, and no Abu Dhabi project before GOLIVE.abuDhabiLicensed.
// The data file (src/data/reelly-launches.json) ships empty. Its items are checked on every build, like
// launch-reviews.json, so a bad entry stops the build even while the gate is closed. Images are self-hosted copies only
// (the public CSP allows no other image host); Reelly's own image URLs are used in the private preview alone.
// The WhatsApp button on a public project page also needs LEAD_CAPTURE (soft launch has no service call to action).
import { checkLaunchReviews } from './market.mjs';
import { normaliseProject } from './launch-cards.mjs';

export const LAUNCH_IMAGE_RE = /^\/launch-images\/[a-z0-9][a-z0-9_-]{0,80}\.(webp|jpg|png)$/;

/** Problems with the data file, whatever the gate. @param {any} items @param {{abuDhabiLicensed: boolean}} golive */
export function checkReellyLaunches(items, golive) {
  if (!Array.isArray(items)) return ['reelly-launches.json must be a list'];
  const e = checkLaunchReviews(items, golive).map((x) => x.replace('launch-reviews.json', 'reelly-launches.json'));
  items.forEach((it, i) => {
    if (!Number.isInteger(it?.reelly?.id)) e.push(`item ${i + 1}: reelly.id (the Reelly project id) is required`);
    if (it?.image != null && !(typeof it.image === 'string' && LAUNCH_IMAGE_RE.test(it.image))) e.push(`item ${i + 1}: image must be a self-hosted /launch-images/<name>.webp, .jpg or .png path, or null`);
  });
  return e;
}

/**
 * The projects that may be shown publicly: none unless the gate is open, then every item (all passed the checks).
 * @param {any[]} items @param {{abuDhabiLicensed: boolean}} golive @param {boolean} launchCardsAllowed
 */
export function publicLaunches(items, golive, launchCardsAllowed) {
  const problems = checkReellyLaunches(items, golive);
  if (problems.length) throw new Error(`reelly-launches.json:\n- ${problems.join('\n- ')}`);
  if (!launchCardsAllowed) return [];
  return items.map((it) => ({
    view: { ...normaliseProject(it.reelly), image: it.image ?? null },
    compliance: { permit_number: it.permit_number, permit_qr: it.permit_qr, agency_name: it.agency_name, agency_orn: it.agency_orn },
  }));
}
