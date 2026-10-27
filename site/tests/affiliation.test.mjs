// The agency line renders only when the agency, its ORN and the broker's BRN are ALL set (owner decisions 2026-10-10 and
// 2026-10-26). ORN = the agency (RERA Office Registration Number); BRN = the broker (RERA broker card number).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affiliationLine } from '../src/lib/affiliation.mjs';

test('affiliation line: shown only when the agency, the ORN and the BRN are all set', () => {
  assert.equal(affiliationLine('', '', ''), '');
  assert.equal(affiliationLine('Example Brokerage', '', ''), '', 'agency only: nothing');
  assert.equal(affiliationLine('Example Brokerage', '67890', ''), '', 'agency and ORN, BRN empty: nothing');
  assert.equal(affiliationLine('Example Brokerage', '', '12345'), '', 'agency and BRN, ORN empty: nothing');
  assert.equal(affiliationLine('', '67890', '12345'), '', 'ORN and BRN, agency empty: nothing');
  assert.equal(affiliationLine('  ', ' 67890 ', ' 12345 '), '', 'whitespace-only agency counts as empty');
  assert.equal(affiliationLine('Example Brokerage', '67890', '12345'), 'Working with Example Brokerage · ORN 67890 · BRN 12345');
  assert.equal(affiliationLine(' Example Brokerage ', ' 67890 ', ' 12345 '), 'Working with Example Brokerage · ORN 67890 · BRN 12345');
  assert.doesNotMatch(affiliationLine('', '', ''), /pending/i);
});
