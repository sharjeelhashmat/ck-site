// Throwaway, clearly fake fixtures for tests and visual checks. Never shipped and never placed under src/data.
export const claim = (key, category, over = {}) => ({
  key, label: `Label ${key}`, value: `Value ${key}`, category, sourceName: 'Example Register', sourceType: 'GOVERNMENT_DATA',
  sourceUrl: 'https://example.com/source', publishedOn: '2026-09-01', verification: 'VERIFIED', verifiedBy: 'Sharjeel Hashmat', verifiedOn: '2026-09-20', ...over,
});

export function validOpp(over = {}) {
  const factor = (rating, ev) => ({ rating, note: `Because ${rating}.`, evidence: ev });
  return {
    slug: 'sample-tower', status: 'published', version: 1,
    project: 'Sample Tower (test fixture)', developer: 'Example Developer', location: 'Example District', unit: '1 bed', propertyType: 'Apartment', dealType: 'INVEST',
    numbers: [claim('price', 'price'), claim('plan', 'price')],
    income: [claim('rent', 'income'), claim('svc', 'income'), claim('net', 'income')],
    comparables: [claim('c1', 'comps'), claim('c2', 'comps'), claim('c3', 'comps')],
    supply: [claim('s1', 'supply')],
    factors: {
      location: factor('Adequate', ['price']), entry: factor('Adequate', ['c1', 'c2', 'c3']), fundamentals: factor('Adequate', ['price']),
      yield: factor('Adequate', ['rent', 'svc', 'net']), supply: factor('Weak', ['s1']), liquidity: factor('Adequate', ['c1']), risk: factor('Adequate', ['s1']),
    },
    thesis: 'A short thesis.', verdict: 'WATCH', verdictNote: 'Not yet, monitor supply.',
    risks: ['Supply completes in the exit window.'], couldWork: ['Rents hold.'], couldFail: ['Supply arrives early.'], changeMyView: ['Handover slips past 2028.'],
    exitNote: 'Likely buyer is an end user.',
    investorFit: { objective: 'rental income', budgetBand: '1M to 2M AED', timeline: '5 years', riskTolerance: 'moderate' },
    compliance: { permitNumber: 'TEST-PERMIT-1' },
    publishedOn: '2026-09-21', lastVerified: '2026-09-20', reviewBy: '2026-10-05',
    ...over,
  };
}

export function validArticle(slug, over = {}) {
  return {
    slug, status: 'published', series: 'Before You Buy', title: `Title ${slug}`, description: `Description ${slug}`, author: 'Sharjeel Hashmat', reviewer: 'Sharjeel Hashmat',
    publishedOn: '2026-09-21', updatedOn: '2026-09-21', reviewBy: '2026-12-01', geography: 'Dubai', topic: 'Costs', confidence: 'High',
    body: [{ h: 'Heading' }, { p: 'Paragraph.' }, { ul: ['a', 'b'] }, { table: { head: ['A', 'B'], rows: [['1', '2']] } }],
    sources: [{ name: 'Example Register', tier: 1, url: 'https://example.com/a', publishedOn: '2026-09-01', verifiedOn: '2026-09-20' }],
    ...over,
  };
}


// Market events and project trackers (PR 3). Fake records for tests and the Chromium check only; never shipped.
export const officialSource = (over = {}) => ({ name: 'Example Transport Authority', url: 'https://example.com/news', publishedOn: '2026-10-01', verifiedOn: '2026-10-20', tier: 1, ...over });

export function validEvent(id, over = {}) {
  return {
    id, title: `Example announcement ${id}`, emirate: 'Dubai', category: 'Metro/tram', status: 'Announced', officialDate: 'Q4 2029',
    announcedOn: '2026-10-01', areas: ['dubai-marina'], summary: 'The authority announced a new line with stations named in the release.',
    source: officialSource(), ...over,
  };
}

export function validProject(slug = 'example-metro-line', over = {}) {
  return {
    slug, name: 'Example Metro Line (test fixture)', emirate: 'Dubai', category: 'Metro/tram', operator: 'Example Transport Authority',
    summary: 'A fictional metro line used only by the tests.', areas: ['dubai-marina', 'palm-jumeirah'],
    timeline: [
      { date: '2026-03-01', status: 'Announced', note: 'Line announced with its route.', source: officialSource({ publishedOn: '2026-03-01' }) },
      { date: '2026-09-15', status: 'Approved', note: 'Contract awarded.', source: officialSource({ publishedOn: '2026-09-15' }) },
    ],
    reviewBy: '2027-01-31', ...over,
  };
}

/** The fixture set the Chromium check also uses (tests/changes.test.mjs and tests/e2e/changes.e2e.mjs). */
export function changesFixture() {
  const events = [
    validEvent('line-announced', { title: 'Example metro line announced', project: 'example-metro-line', announcedOn: '2026-10-10', areas: ['dubai-marina', 'palm-jumeirah'] }),
    validEvent('bridge-cancelled', { title: 'Example bridge plan withdrawn', category: 'Roads/bridges', status: 'Cancelled', officialDate: '', announcedOn: '2026-09-01' }),
    validEvent('old-fee-rule', { title: 'Example service fee rule', category: 'Regulation/fees', status: 'Approved', officialDate: '1 January 2026', announcedOn: '2025-11-01', source: officialSource({ publishedOn: '2025-11-01', verifiedOn: '2026-03-01' }) }),
    ...Array.from({ length: 5 }, (_, i) => validEvent(`older-${i}`, { title: `Example older notice ${i}`, announcedOn: `2025-0${i + 1}-15`, status: 'Open', source: officialSource({ publishedOn: `2025-0${i + 1}-15` }) })),
  ];
  return { events, projects: [validProject()] };
}
