// Pure ROI maths for the /invest calculator. No external data. The annualised return is a true IRR on the cash flows
// (owner 2026-11-08), not the simple average it used to be: year 0 = -(price + acquisition costs); years 1 to N = annual
// net income (rent minus service charges); year N also + the projected exit value.

export interface ROIInputs {
  budget: number;
  expectedAnnualRent: number;
  annualServiceCharges: number;
  holdingPeriodYears: number;
  acquisitionCostPct: number;
  expectedAnnualAppreciationPct: number;
}

export interface ROIResult {
  acquisitionCosts: number;
  totalCashInvested: number;
  grossYieldPct: number;
  netYieldPct: number;
  annualNetIncome: number;
  projectedExitValue: number;
  totalReturnOverHolding: number;
  /** IRR in percent, or null when the cash flows have no rate of return (shown as "n/a"). */
  annualizedReturnPct: number | null;
}

/**
 * The internal rate of return of yearly cash flows (cf[0] now, cf[t] after t years) as a fraction, or null when there is
 * none: fewer than two flows, a non-finite flow, no sign change, or no rate between -99.99% and 1,000,000% where the net
 * present value crosses zero. Bisection on a bracketed sign change, so it always converges (no Newton step can diverge).
 */
export function irr(cf: number[]): number | null {
  if (cf.length < 2 || !cf.every(Number.isFinite)) return null;
  if (!(cf.some((c) => c < 0) && cf.some((c) => c > 0))) return null;
  const npv = (r: number) => cf.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
  let lo = -0.9999;
  let hi = 1;
  let fLo = npv(lo);
  let fHi = npv(hi);
  while (fLo * fHi > 0 && hi < 1e4) {
    hi *= 2;
    fHi = npv(hi);
  }
  if (!(fLo * fHi <= 0)) return null;
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  for (let k = 0; k < 200 && hi - lo > 1e-12; k++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid);
    if (f === 0) return mid;
    if (fLo * f < 0) { hi = mid; fHi = f; } else { lo = mid; fLo = f; }
  }
  return (lo + hi) / 2;
}

/** The calculator's cash flows: year 0 the price and acquisition costs paid; each year the net income; the last year
 * also the exit value. */
export function cashFlows(i: ROIInputs): number[] {
  const years = Math.max(Math.round(i.holdingPeriodYears), 0);
  const net = i.expectedAnnualRent - i.annualServiceCharges;
  const exit = i.budget * Math.pow(1 + i.expectedAnnualAppreciationPct / 100, years);
  return [-(i.budget + i.budget * (i.acquisitionCostPct / 100)), ...Array.from({ length: years }, (_, t) => net + (t === years - 1 ? exit : 0))];
}

export function computeROI(i: ROIInputs): ROIResult {
  const acquisitionCosts = i.budget * (i.acquisitionCostPct / 100);
  const totalCashInvested = i.budget + acquisitionCosts;

  const grossYieldPct = i.budget > 0 ? (i.expectedAnnualRent / i.budget) * 100 : 0;
  const annualNetIncome = i.expectedAnnualRent - i.annualServiceCharges;
  const netYieldPct = i.budget > 0 ? (annualNetIncome / i.budget) * 100 : 0;

  const years = Math.max(i.holdingPeriodYears, 0);
  const projectedExitValue = i.budget * Math.pow(1 + i.expectedAnnualAppreciationPct / 100, years);

  const cumulativeRentalIncome = annualNetIncome * years;
  const capitalGain = projectedExitValue - i.budget;
  const totalReturnOverHolding = cumulativeRentalIncome + capitalGain - acquisitionCosts;

  const rate = irr(cashFlows(i));
  const annualizedReturnPct = rate === null ? null : rate * 100;

  return {
    acquisitionCosts,
    totalCashInvested,
    grossYieldPct,
    netYieldPct,
    annualNetIncome,
    projectedExitValue,
    totalReturnOverHolding,
    annualizedReturnPct,
  };
}

export const formatAED = (n: number): string => 'AED ' + Math.round(n).toLocaleString('en-AE');
export const formatPct = (n: number | null): string => (n === null || !Number.isFinite(n) ? 'n/a' : `${n.toFixed(1)}%`);
