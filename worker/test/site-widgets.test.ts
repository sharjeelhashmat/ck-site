// PR 2c item 2: the Worker requires the Turnstile action set by each form, so the site's widgets must set it. Reads the
// site source (no site build needed): the container carries data-action and the explicit render() passes it on.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TURNSTILE_ACTIONS } from '../src/turnstile';

const site = (f: string) => readFileSync(join(import.meta.dirname, '..', '..', 'site', 'src', 'components', f), 'utf8');

describe('site Turnstile widgets carry the action the Worker checks', () => {
  it('the enquiry form: data-action="lead", passed to render()', () => {
    const src = site('LeadForm.astro');
    expect(src).toMatch(/<div class="turnstile" id="lead-turnstile" data-sitekey=\{SITE\.turnstileSiteKey\} data-action="lead">/);
    expect(src).toMatch(/action: box\.dataset\.action/);
    expect(TURNSTILE_ACTIONS.lead).toBe('lead');
  });
  it('the newsletter signup: data-action="newsletter", passed to render()', () => {
    const src = site('NewsletterSignup.astro');
    expect(src).toMatch(/<div class="nl-turnstile" data-action="newsletter"><\/div>/);
    expect(src).toMatch(/action: box\.dataset\.action/);
    expect(TURNSTILE_ACTIONS.newsletter).toBe('newsletter');
  });
});

// PR 2c item 8b: the floating WhatsApp button sat outside every landmark (axe "region", moderate, on every page). The
// whole floating stack is now a labelled complementary landmark; same class, so no visual change.
describe('site floating actions sit inside a landmark', () => {
  it('FloatingActions.astro wraps the stack in <aside aria-label>, keeping the fab-stack class', () => {
    const src = site('FloatingActions.astro');
    expect(src).toMatch(/<aside class="fab-stack noprint" aria-label="Quick actions">[\s\S]*class="fab fab--wa"[\s\S]*id="to-top"[\s\S]*<\/aside>/);
    expect(src).not.toMatch(/<div class="fab-stack/);
  });
});
