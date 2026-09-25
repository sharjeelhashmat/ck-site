// Legal copy. Terms are carried over from the live site (last updated 5 September 2026). Section 4 changed 2026-09-21: verdict labels are BUY / WATCH / PASS (decision 1 of the Investment Intelligence System).
// Privacy is the live text with ONLY the sections that describe infrastructure changed (2, 4, 5, 7) so they stay true
// after the move off Firebase. Every changed sentence is listed in CHANGES_FOR_APPROVAL.md. Owner approval required
// before publishing (legal wording is a claim in the owner's name).
import { SITE } from './site';
import { PROFILE_ENABLED, PROFILE_PRIVACY_LINE } from './profile';

export interface LegalSection { h: string; p: string[]; list?: string[]; after?: string }
const mail = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

// The date moves only when the text does: the investor profile line appears with the feature (owner approval required).
export const PRIVACY_UPDATED = PROFILE_ENABLED ? '21 September 2026' : '20 September 2026';
export const PRIVACY: LegalSection[] = [
  {
    h: '1. Who this policy covers',
    p: [
      `This policy applies to sharjeelhashmat.com and describes how ${SITE.name} ("I", "me"), as the data controller, collects, uses and stores personal data from visitors, enquirers and clients in connection with UAE real estate services. This site is operated as a personal brand by ${SITE.name}, a freelance real estate consultant working with ${SITE.brokerage}; the BRN registration reference is shown in the site's footer and About page for regulatory purposes.`,
    ],
  },
  {
    h: '2. What I collect',
    p: [
      `Contact and enquiry details you submit through the site's forms (name, email, phone, country, budget range, timeline, message, and, for sell enquiries, property details); ROI Calculator inputs, which are processed in your browser and are not stored unless you separately submit them via an enquiry form; and standard technical data (such as IP address and browser information) collected automatically by the hosting and security infrastructure described below, including a bot check (Cloudflare Turnstile) on the enquiry forms. I do not knowingly collect any special category (sensitive) personal data through this site.`,
      ...(PROFILE_ENABLED ? [PROFILE_PRIVACY_LINE] : []),
      `If you unsubscribe from the newsletter, you may optionally tell us why. If you do, we store that reason against your subscriber record to help us improve the newsletter; it is never shared externally.`,
    ],
  },
  {
    h: '3. Legal basis and applicable law',
    p: [
      `This site operates under UAE law, including the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021, "PDPL"). Data is processed on two lawful bases: your consent (given by submitting a form) and my legitimate business interest in responding to enquiries and operating a real estate advisory practice, in each case limited to what's needed for that purpose. Where processing relies on consent, you can withdraw it at any time (see Section 8) without affecting the lawfulness of processing carried out before withdrawal.`,
    ],
  },
  {
    h: '4. How data is used',
    p: [
      `To respond to your enquiry, provide the property information, valuation, or investment analysis you requested, and — where you've agreed — to follow up about opportunities that match what you're looking for. When you submit a form, your enquiry is sorted by a fixed set of rules (for example, what you're looking to do and your timeline) to decide which short automated acknowledgement email you receive and how quickly I'm alerted; any follow-up beyond that acknowledgement is written by me. Data is not sold to third parties, and is not used for automated decision-making that produces legal or similarly significant effects on you.`,
    ],
  },
  {
    h: '5. Third parties and where data is stored',
    p: [
      `Enquiry data is stored using Cloudflare (Workers and the D1 database, with Turnstile for bot protection), which acts as a data processor on my behalf. Emails to you (the acknowledgement described above) are delivered through Resend, and my own mailbox is hosted by Zoho Mail; each acts as a data processor for that purpose. These providers maintain their own contractual and technical safeguards for data they process, and data may be held on servers outside the UAE, including in Europe, as part of their standard infrastructure — a cross-border transfer the PDPL permits provided appropriate safeguards are in place, which I consider these providers' standing data-processing terms and security certifications to satisfy. Data is not otherwise shared with third parties except where required by UAE law or regulatory authority (for example DLD/RERA in connection with a specific transaction). No separate analytics or advertising cookies are currently in use on this site.`,
    ],
  },
  {
    h: '6. Retention',
    p: [
      `Enquiry data is retained for as long as reasonably necessary to service your enquiry and maintain business and regulatory records (including any records DLD/RERA rules require me to keep in connection with a transaction), and is deleted or anonymized once no longer needed for those purposes, or earlier on request under Section 8 — except where I'm legally required to keep it for longer.`,
    ],
  },
  {
    h: '7. Security',
    p: [
      `Data is protected using the security features of the infrastructure described above (including encryption in transit) together with access controls limiting who can read or change it. No method of transmission or storage is completely secure, and I can't guarantee absolute security.`,
    ],
  },
  {
    h: '8. Your rights under the PDPL',
    p: ['You may, at any time, request to:'],
    list: [
      `access the personal data I hold about you and how it's processed;`,
      `correct (rectify) inaccurate or incomplete data;`,
      `have your data erased, subject to any legal or regulatory retention requirement;`,
      `restrict or object to processing, including objecting to being contacted for marketing at any time;`,
      `receive the data you've provided in a structured, commonly-used format where processing is based on consent; and`,
      `withdraw consent at any time, without affecting processing carried out before withdrawal.`,
    ],
    after: `To exercise any of these, contact me using the details in Section 11 — I'll respond within a reasonable time. If you're not satisfied with how a request is handled, you have the right to lodge a complaint with the UAE Data Office, the federal authority responsible for enforcing the PDPL.`,
  },
  {
    h: `9. Children's privacy`,
    p: [
      `This site is intended for adults seeking real estate advice and is not directed at children. I do not knowingly collect personal data from anyone under 18; if you believe a minor has submitted data through this site, contact me and I'll delete it.`,
    ],
  },
  {
    h: '10. Changes to this policy',
    p: [
      `I may update this policy as the site's features or data practices change. The "Last updated" date at the top will reflect the latest revision; material changes affecting how your data is used will be highlighted here rather than made silently.`,
    ],
  },
  {
    h: '11. Contact',
    p: [`For any privacy request, contact ${SITE.name} directly at ${mail} or ${SITE.phoneDisplay}.`],
  },
];

export const TERMS_UPDATED = '21 September 2026';
export const TERMS: LegalSection[] = [
  { h: '1. Acceptance and eligibility', p: [`By using sharjeelhashmat.com, you agree to these Terms. This site is intended for adults capable of entering a binding agreement under UAE law; if you don't agree with these Terms, please don't use the site or submit an enquiry.`] },
  { h: '2. Informational use', p: [`The content on sharjeelhashmat.com — including listings, area guides, market commentary, the ROI Calculator and any "Compass Key Brief" verdict — is provided for general information only. It does not constitute financial, legal, tax or investment advice, and should not be relied on as a substitute for independent professional advice before making a property decision.`] },
  { h: '3. Listing accuracy and advertising permits', p: [`Listing details (price, size, availability) are provided in good faith and marked with a last-verified date where available, but are subject to change without notice and should be independently confirmed before any transaction. Where a listing is an active Dubai property advertisement, its DLD/RERA advertising permit ("Trakheesi") number is displayed alongside it — a listing shown without one is not yet cleared for advertising and should be treated as indicative only.`] },
  { h: '4. ROI Calculator and Property Brief disclaimer', p: [`The ROI Calculator produces estimates based solely on the figures you enter — it is not a market forecast, a valuation, or a guarantee of actual rental income, appreciation, or resale value. A "BUY / WATCH / PASS" verdict or "Sharjeel's View" on a property reflects a personal, professional opinion at a point in time, not a warranty of investment performance.`] },
  { h: '5. No warranty', p: [`The site and its content are provided "as is" and "as available," without warranties of any kind, express or implied, including as to accuracy, completeness, or fitness for a particular purpose, to the fullest extent UAE law allows.`] },
  { h: '6. Limitation of liability', p: [`To the extent permitted by UAE law, my liability for any claim arising from your use of this site or reliance on its content is limited to direct damages actually incurred, and excludes indirect or consequential loss. Nothing in these Terms limits or excludes liability that cannot lawfully be limited or excluded under UAE law — including liability for fraud, willful misconduct, or a harmful act (tortious liability), which the UAE Civil Code does not permit parties to exclude or reduce by agreement.`] },
  { h: '7. Indemnification', p: [`You agree to indemnify and hold ${SITE.name} harmless from any claim or loss arising from your misuse of this site or breach of these Terms, to the extent permitted by UAE law.`] },
  { h: '8. Regulatory note', p: [`Property transactions in Dubai are regulated by the Dubai Land Department (DLD) and the Real Estate Regulatory Agency (RERA). Nothing on this site overrides or substitutes for DLD/RERA registration, disclosure, advertising permit (Trakheesi), or licensing requirements, which apply independently of this website.`] },
  { h: '9. Third-party links and platforms', p: [`This site links to third-party platforms (including WhatsApp, Instagram and LinkedIn) for your convenience. I don't control and am not responsible for their content, availability, or privacy practices — using them is subject to their own terms.`] },
  { h: '10. Intellectual property', p: [`The Compass Key name, mark, and "Compass Key Brief" are the property of ${SITE.name} and may not be reproduced or used without permission. Site content may not be copied or republished without consent.`] },
  { h: '11. Access and termination', p: [`I may restrict or terminate access to this site (or any feature of it, such as the enquiry forms) for anyone I reasonably believe is misusing it — including automated or abusive submissions — without notice.`] },
  { h: '12. Changes to these Terms', p: [`I may update these Terms from time to time; the "Last updated" date above will reflect the latest revision. Continuing to use the site after a change takes effect means you accept the updated Terms.`] },
  { h: '13. Governing law and jurisdiction', p: [`These Terms are governed by the laws of the United Arab Emirates, including the UAE Civil Code (Federal Decree Law No. 25 of 2025), without regard to conflict-of-law principles. Subject to any mandatory law to the contrary, the onshore courts of Dubai have jurisdiction over any dispute arising from these Terms.`] },
  { h: '14. Severability', p: [`If any provision of these Terms is found unenforceable, the rest continues in effect, and the unenforceable provision will be read to give effect to its intent as closely as possible within the limits of applicable law.`] },
  { h: '15. Contact', p: [`Questions about these terms can be sent to ${mail}.`] },
];
