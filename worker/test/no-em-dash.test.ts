// Owner rule 2026-10-24: no em dash anywhere (audit item 40). Same scanner and the same single legal.ts switch as the
// site's npm test (site/tests/helpers/no-em-dash.mjs), so the rule fails in the Worker's CI job too.
import { describe, expect, it } from 'vitest';
import { findEmDashes } from '../../site/tests/helpers/no-em-dash.mjs';

describe('no em dash (item 40)', () => {
  it('none in site/src, site/public, site/docs, worker/src, worker/templates or worker/scripts', () => {
    expect(findEmDashes()).toEqual([]);
  });
});
