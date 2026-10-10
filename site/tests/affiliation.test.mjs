// The agency + BRN line renders only when BOTH values are set (owner decision 2026-10-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affiliationLine } from '../src/lib/affiliation.mjs';

test('affiliation line: shown only when both the agency and the BRN are set', () => {
  assert.equal(affiliationLine('', ''), '');
  assert.equal(affiliationLine('Example Brokerage', ''), '', 'agency set, BRN empty: nothing');
  assert.equal(affiliationLine('', '12345'), '', 'BRN set, agency empty: nothing');
  assert.equal(affiliationLine('  ', ' 12345 '), '', 'whitespace-only agency counts as empty');
  assert.equal(affiliationLine('Example Brokerage', '12345'), 'Working with Example Brokerage · BRN 12345');
  assert.doesNotMatch(affiliationLine('', ''), /pending/i);
});
