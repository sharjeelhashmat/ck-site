// Pure ROI maths, ported unchanged from the live site's calculator (lib/roi.ts) so results match what
// visitors see today. No external data.

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
  annualizedReturnPct: number;
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

  const annualizedReturnPct =
    totalCashInvested > 0 && years > 0 ? (totalReturnOverHolding / totalCashInvested / years) * 100 : 0;

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
export const formatPct = (n: number): string => `${n.toFixed(1)}%`;
