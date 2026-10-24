// JSON-LD for every page (audit item 16). Plain ESM so the layout and node:test share it.
//   Person            always: name, jobTitle "Property Consultant · UAE", url, telephone, email, knowsLanguage, sameAs.
//                     Its RERA card (once the agency line shows) and advertiser permit (once issued) are identifiers.
//   RealEstateAgent   only once golive.ts has the agency name, BRN and address: name, BRN identifier, address, area.
//   Article           insight pages only: headline, datePublished, dateModified, author (the Person).
// One node is a plain object; two or more go in an @graph that links them by @id.

/**
 * @param {{ site: { name: string; title: string; origin: string; phoneE164: string; email: string; areasServed: string; languages: readonly string[]; instagram: string; linkedin: string };
 *   agency: { name: string; brn: string; address: string } | null; cardNo: string; permitNo: string;
 *   article: { headline: string; datePublished: string; dateModified: string; url: string } | null }} o
 */
export function jsonLd({ site, agency, cardNo, permitNo, article }) {
  const personId = `${site.origin}/#person`;
  const agencyId = `${site.origin}/#agency`;
  const identifiers = [
    ...(cardNo ? [{ '@type': 'PropertyValue', name: 'RERA card', value: cardNo }] : []),
    ...(permitNo ? [{ '@type': 'PropertyValue', name: 'UAE Media Council advertiser permit', value: permitNo }] : []),
  ];
  const person = {
    '@type': 'Person',
    '@id': personId,
    name: site.name,
    jobTitle: `${site.title} · UAE`,
    url: `${site.origin}/`,
    telephone: `+${site.phoneE164}`,
    email: site.email,
    knowsLanguage: [...site.languages],
    sameAs: [site.instagram, site.linkedin],
    ...(agency ? { worksFor: { '@id': agencyId } } : {}),
    ...(identifiers.length ? { identifier: identifiers } : {}),
  };
  const nodes = [person];
  if (agency) {
    nodes.push({
      '@type': 'RealEstateAgent',
      '@id': agencyId,
      name: agency.name,
      identifier: [{ '@type': 'PropertyValue', name: 'BRN', value: agency.brn }],
      address: { '@type': 'PostalAddress', streetAddress: agency.address, addressCountry: 'AE' },
      areaServed: site.areasServed,
    });
  }
  if (article) {
    nodes.push({
      '@type': 'Article',
      headline: article.headline,
      datePublished: article.datePublished,
      dateModified: article.dateModified,
      author: { '@id': personId },
      mainEntityOfPage: article.url,
    });
  }
  if (nodes.length === 1) return { '@context': 'https://schema.org', ...person };
  return { '@context': 'https://schema.org', '@graph': nodes };
}
