// FAQ copy: owner-supplied wording (work order 2026-09-24), used verbatim. Single source for the page and its FAQPage JSON-LD.
// `links` turns a phrase that already appears in the answer into a link; it never changes the words.
// Held back on purpose (figure-source rule: need a verified, dated, cited figure before publishing):
//   - Government fees on a Dubai purchase (DLD transfer fee + admin/registration)
//   - Golden Visa eligibility via property investment (minimum threshold)

export interface Faq {
  q: string;
  a: string;
  links?: Record<string, string>;
}

export const FAQS: Faq[] = [
  {
    q: 'How do I start working with you?',
    // Owner-approved rewording 2026-09-24: the Investor Profile is reached only from the link shown after an enquiry.
    a: 'Book a call or fill out the contact form. Investors can then add a short Investor Profile for a more tailored match.',
    links: { 'contact form': '/contact' },
  },
  {
    q: 'Do you only work with UAE residents?',
    a: 'No — coverage includes UAE residents, GCC nationals and international buyers/investors.',
  },
  {
    q: 'What areas do you cover?',
    a: 'UAE-wide, with area guides published for major districts under Areas.',
    links: { Areas: '/areas' },
  },
  {
    q: "What's the difference between off-plan and secondary market?",
    a: 'Off-plan is bought directly from a developer before/during construction, typically on a payment plan; secondary market is an existing, completed or resale unit. Trade-offs (price, timeline, certainty) are covered in the Insights articles.',
    links: { 'Insights articles': '/insights' },
  },
  {
    q: 'How do I get a mortgage as a non-resident?',
    a: 'Non-resident mortgages are available through several UAE banks with different down-payment and eligibility rules than resident buyers; assessed case-by-case during consultation.',
  },
  {
    q: 'How quickly do you respond to enquiries?',
    a: 'Enquiries submitted through the contact form or investor profile are typically followed up within one business day.',
    links: { 'contact form': '/contact' },
  },
];

// Splits an answer into text and link segments. Only the first occurrence of each phrase is linked.
export function segments(f: Faq): { text: string; href?: string }[] {
  let parts: { text: string; href?: string }[] = [{ text: f.a }];
  for (const [phrase, href] of Object.entries(f.links ?? {})) {
    let done = false;
    parts = parts.flatMap((p) => {
      if (done || p.href) return [p];
      const i = p.text.indexOf(phrase);
      if (i < 0) return [p];
      done = true;
      return [{ text: p.text.slice(0, i) }, { text: phrase, href }, { text: p.text.slice(i + phrase.length) }].filter((s) => s.text);
    });
  }
  return parts;
}
