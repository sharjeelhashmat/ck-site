// Built-in sample data for the private Reelly preview's demo mode (worker/reelly, /launches?demo=1): placeholder values in
// the shape of Reelly's API (GET /projects, GET /projects/{id}, GET /projects/{id}/units), so the layout can be seen and
// screenshotted without an API key. Every name says "Demo", no image or document points anywhere real, and the preview
// labels every card and page "Demo data". Never imported by any public page.

const plan = (id, name, steps, extra = {}) => ({ id, name, is_handover: false, months_after_handover: null, steps: steps.map(([n, p]) => ({ name: n, percentage: p })), ...extra });

/** @type {any[]} Project payloads (the list fields plus the detail fields the project page uses). */
export const DEMO_PROJECTS = [
  {
    id: 900001, slug_name: 'demo-residences-one', name: 'Demo Residences One', developer: 'Demo Developer A',
    location: { district: 'Demo District North', region: 'Dubai' }, cover_image: null,
    min_price: 1250000, max_price: 4100000, price_currency: 'AED', area_unit: 'sqft',
    sale_status: 'on_sale', sale_status_display: 'On sale', construction_status: 'under_construction', construction_status_display: 'Under construction',
    completion_date: '2028-06-30', escrow_number: null, service_charge: null,
    payment_plans: [plan(1, 'Demo plan 60/40', [['On booking', 10], ['During construction', 50], ['On handover', 40]])],
    typical_units: [
      { unit_type: 'apartments', bedrooms: 1, from_price_aed: 1250000, to_price_aed: 1600000 },
      { unit_type: 'apartments', bedrooms: 2, from_price_aed: 2050000, to_price_aed: 2700000 },
      { unit_type: 'apartments', bedrooms: 3, from_price_aed: 3300000, to_price_aed: 4100000 },
    ],
    marketing_brochure: null, floor_plans: [], general_plan: null, updated_at: '2026-11-18T08:00:00Z',
  },
  {
    id: 900002, slug_name: 'demo-park-villas', name: 'Demo Park Villas', developer: 'Demo Developer B',
    location: { district: 'Demo District East', region: 'Dubai' }, cover_image: null,
    min_price: 3900000, max_price: 7800000, price_currency: 'AED', area_unit: 'sqft',
    sale_status: 'presale', sale_status_display: 'Presale', construction_status: 'presale', construction_status_display: 'Presale',
    completion_date: '2029-03-31', escrow_number: null, service_charge: null,
    payment_plans: [plan(2, 'Demo plan with post-handover', [['On booking', 20], ['During construction', 40], ['After handover, over 2 years', 40]], { is_handover: true, months_after_handover: 24 })],
    typical_units: [
      { unit_type: 'townhouse', bedrooms: 3, from_price_aed: 3900000, to_price_aed: 4600000 },
      { unit_type: 'villa', bedrooms: 4, from_price_aed: 5900000, to_price_aed: 7800000 },
    ],
    marketing_brochure: null, floor_plans: [], general_plan: null, updated_at: '2026-11-18T08:00:00Z',
  },
  {
    id: 900003, slug_name: 'demo-marina-tower', name: 'Demo Marina Tower', developer: 'Demo Developer C',
    location: { district: 'Demo District West', region: 'Abu Dhabi' }, cover_image: null,
    min_price: 980000, max_price: 2900000, price_currency: 'AED', area_unit: 'sqft',
    sale_status: 'start_of_sales', sale_status_display: 'Start of sales', construction_status: 'under_construction', construction_status_display: 'Under construction',
    completion_date: '2027-12-31', escrow_number: null, service_charge: null,
    payment_plans: [],
    typical_units: [
      { unit_type: 'apartments', bedrooms: 0, from_price_aed: 980000, to_price_aed: 1150000 },
      { unit_type: 'apartments', bedrooms: 2, from_price_aed: 2200000, to_price_aed: 2900000 },
    ],
    marketing_brochure: null, floor_plans: [], general_plan: null, updated_at: '2026-11-18T08:00:00Z',
  },
];

/** Units (GET /projects/{id}/units results) for the demo projects. @type {Record<number, any[]>} */
export const DEMO_UNITS = {
  900001: [
    { id: 1, unit_type: 'apartments', bedrooms: 1, size: 780, price: 1250000, status: 'available' },
    { id: 2, unit_type: 'apartments', bedrooms: 1, size: 860, price: 1600000, status: 'booked' },
    { id: 3, unit_type: 'apartments', bedrooms: 2, size: 1210, price: 2050000, status: 'available' },
    { id: 4, unit_type: 'apartments', bedrooms: 2, size: 1390, price: 2700000, status: 'available' },
    { id: 5, unit_type: 'apartments', bedrooms: 3, size: 1820, price: 4100000, status: 'sold' },
  ],
  900002: [
    { id: 6, unit_type: 'townhouse', bedrooms: 3, size: 2400, price: 3900000, status: 'available' },
    { id: 7, unit_type: 'villa', bedrooms: 4, size: 3600, price: 5900000, status: 'reserved' },
  ],
  900003: [],
};
