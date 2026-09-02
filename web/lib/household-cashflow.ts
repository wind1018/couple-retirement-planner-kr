import type { Policy, SimulationResult } from './nps-engine.ts';
import { employmentIncomeAtYear } from './pension-goal.ts';
import {
  livingCostMonthly,
  type LivingCostSettings,
} from './public-pension.ts';
import {
  DEFAULT_REAL_ESTATE_COST_POLICY,
  estimateHomePurchaseCosts,
  estimateHomeSaleCosts,
  estimateAnnualResidentialHoldingTaxes,
  type HoldingTaxPropertyInput,
  type HoldingTaxSettings,
  type PurchaseCostAutoSettings,
  type RealEstateCostPolicy,
  type SaleCostAutoSettings,
} from './real-estate-costs.ts';

export type AssetType =
  | 'cash'
  | 'financial'
  | 'primary_home'
  | 'rental_property'
  | 'officetel'
  | 'jeonse_deposit'
  | 'other';
export type RetirementLiquidity =
  | 'liquid'
  | 'sellable'
  | 'illiquid'
  | 'exclude';
export type AssetUseMode = 'cover_gap' | 'fixed_monthly' | 'hold';
export type AssetUsePlan = {
  mode: AssetUseMode;
  startYear: number;
  endYear?: number | null;
  monthlyAmount?: number;
  reserveAmount?: number;
};
export type HousingSurplusType = 'deposit' | 'investment';
export type HousingSurplusReturnMode = 'reinvest' | 'cash_income';
export type HousingMovePlan = {
  enabled: boolean;
  purchaseYear: number;
  replacementName: string;
  purchasePrice: number;
  purchaseCostRate?: number;
  purchaseTaxEstimate?: number;
  purchaseAutoCostSettings?: PurchaseCostAutoSettings;
  replacementAnnualAppreciationRate?: number;
  interimAnnualReturnRate?: number;
  surplusName: string;
  surplusType: HousingSurplusType;
  surplusAnnualReturnRate: number;
  surplusReturnMode: HousingSurplusReturnMode;
};
export type DebtRepaymentType =
  | 'interest_only'
  | 'amortizing'
  | 'manual_monthly_payment';
export type CashflowCompleteness = 'complete' | 'partial' | 'incomplete';
export type CashflowPhase =
  | 'working'
  | 'partial_retirement'
  | 'full_retirement'
  | 'survivor'
  | 'ended';

export type HouseholdAsset = {
  id: string;
  name: string;
  type: AssetType;
  currentValue: number;
  retirementLiquidity: RetirementLiquidity;
  annualAppreciationRate?: number;
  retirementUse?: AssetUsePlan;
  housingMovePlan?: HousingMovePlan;
  salePlan?: {
    enabled: boolean;
    year: number;
    sellingCostRate?: number;
    capitalGainsTaxEstimate?: number;
    autoCostSettings?: SaleCostAutoSettings;
  };
  rental?: {
    enabled: boolean;
    grossMonthlyRent: number;
    annualRentGrowthRate?: number;
    vacancyRate?: number;
    operatingExpenseRate?: number;
    estimatedTaxRate?: number;
    startYear?: number;
    endYear?: number | null;
  };
  holdingTax?: HoldingTaxSettings;
};

export type HouseholdDebt = {
  id: string;
  name: string;
  principal: number;
  annualInterestRate?: number;
  repaymentType?: DebtRepaymentType;
  remainingMonths?: number;
  manualMonthlyPayment?: number;
  maturityYear?: number;
  linkedAssetId?: string;
  payoffOnLinkedAssetSale?: boolean;
};

export type RecurringIncome = {
  id: string;
  name: string;
  monthlyAmount: number;
  startYear: number;
  endYear?: number | null;
  annualGrowthRate?: number;
  estimatedTaxRate?: number;
};

export type HouseholdFinanceSettings = {
  assets: HouseholdAsset[];
  debts: HouseholdDebt[];
  recurringIncomes: RecurringIncome[];
  realEstateCostPolicy?: RealEstateCostPolicy;
};

export type CashflowWarning = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  affectedMetric?: string;
};

export type HouseholdCashflowRow = {
  year: number;
  ageA: number;
  ageB: number | null;
  aliveA: boolean;
  aliveB: boolean;
  employmentIncome: number;
  nationalPension: number;
  basicPension: number;
  privatePension: number;
  rentalIncomeGross: number;
  rentalIncomeNet: number;
  otherIncome: number;
  debtService: number;
  propertyHoldingTax: number;
  propertyHoldingTaxDetails: {
    assetId: string;
    name: string;
    amount: number;
  }[];
  householdIncomeBeforeDebt: number;
  householdCashIncomeAfterDebt: number;
  monthlyGapBeforeAsset: number;
  assetWithdrawal: number;
  assetWithdrawalDetails: { assetId: string; name: string; amount: number }[];
  assetReturnIncome: number;
  assetReturnIncomeDetails: {
    assetId: string;
    name: string;
    amount: number;
  }[];
  assetReinvestedReturn: number;
  assetTransactionDetails: {
    assetId: string;
    transactionKind: 'sale' | 'purchase' | 'sale_and_purchase';
    soldAssetName: string;
    saleProceedsBeforeDebtPayoff?: number;
    saleProceeds: number;
    purchasedAssetName?: string;
    purchaseCost?: number;
    investableSurplus: number;
    fundingShortfall: number;
    saleBrokerage?: number;
    capitalGainsTaxes?: number;
    purchaseBrokerage?: number;
    acquisitionTaxes?: number;
    linkedDebtPayoff?: number;
    linkedDebtPayoffDetails?: {
      debtId: string;
      name: string;
      amount: number;
    }[];
    debtPayoffFundingShortfall?: number;
    roughEstimatePolicyId?: string;
  }[];
  householdCashAvailableAfterAsset: number;
  grossAssetBalance: number;
  liabilityBalance: number;
  netWorthBalance: number;
  remainingRetirementAssets: number;
  cashAndFinancialAssetBalance: number;
  replacementHousingValue: number;
  livingCost: number;
  monthlyGap: number;
  monthlySurplus: number;
  phase: CashflowPhase;
};

export type GapPeriod = {
  startYear: number;
  endYear: number;
  phase: Exclude<CashflowPhase, 'working' | 'ended'> | 'working';
  maxMonthlyGap: number;
  exactPresentValue: number;
};

export type HouseholdFinanceSummary = {
  grossAssets: number;
  liabilities: number;
  netWorth: number;
  retirementAvailableAssets: number;
  plannedAssetWithdrawals: number;
  plannedAssetReturnIncome: number;
  plannedAssetReinvestedReturns: number;
  linkedDebtPayoffsAtSale: number;
  linkedDebtPayoffFundingShortfall: number;
  housingMoveInvestableSurplus: number;
  housingPurchaseFundingShortfall: number;
  remainingPlannedAssetsAtEnd: number;
  replacementHousingValueAtEnd: number;
  primaryHomeValue: number;
  monthlyRentalIncomeGrossAtBaseYear: number;
  monthlyRentalIncomeNetAtBaseYear: number;
  monthlyOtherIncomeAtBaseYear: number;
  monthlyDebtServiceAtBaseYear: number;
  monthlyPropertyHoldingTaxAtBaseYear: number;
  plannedPropertyHoldingTaxes: number;
  completeness: {
    debtService: CashflowCompleteness;
    rentalNetIncome: CashflowCompleteness;
    taxEstimate: CashflowCompleteness;
  };
};

export type HouseholdCashflowAnalysis = {
  baseYear: number;
  discountRate: number;
  rows: HouseholdCashflowRow[];
  gapPeriodsBeforeAssets: GapPeriod[];
  gapPeriods: GapPeriod[];
  capitalPlanGapPeriods: GapPeriod[];
  lateLifeGapPeriods: GapPeriod[];
  firstGapYear: number | null;
  maximumMonthlyGap: number;
  exactGapPresentValue: number;
  exactGapPresentValueAfterAssets: number;
  conservativeStressCapital: number;
  fundingNeedAfterAvailableAssets: number;
  suggestedMonthlyContribution: number;
  finance: HouseholdFinanceSummary;
  warnings: CashflowWarning[];
};

export const defaultHouseholdFinanceSettings =
  (): HouseholdFinanceSettings => ({
    assets: [],
    debts: [],
    recurringIncomes: [],
    realEstateCostPolicy: DEFAULT_REAL_ESTATE_COST_POLICY,
  });

const round = (value: number) => Math.round(value);
const clampRate = (value: number | undefined) =>
  Math.min(100, Math.max(0, value ?? 0)) / 100;

const basicPensionInRow = (
  row: SimulationResult['rows'][number] | undefined,
) =>
  row
    ? Math.max(
        0,
        row.pensionA +
          row.pensionB -
          row.nationalPensionA -
          row.nationalPensionB -
          row.additionalPensionA -
          row.additionalPensionB,
      )
    : 0;

function rentalIncomeAtYear(
  asset: HouseholdAsset,
  year: number,
  baseYear: number,
) {
  const rental = asset.rental;
  if (!rental?.enabled) return { gross: 0, net: 0, partial: false };
  const startYear = rental.startYear ?? baseYear;
  if (
    year < startYear ||
    (rental.endYear != null && year > rental.endYear) ||
    (asset.salePlan?.enabled && year >= asset.salePlan.year)
  )
    return { gross: 0, net: 0, partial: false };
  const gross =
    Math.max(0, rental.grossMonthlyRent) *
    (1 + clampRate(rental.annualRentGrowthRate)) ** (year - startYear);
  const vacancy = clampRate(rental.vacancyRate);
  const expense = clampRate(rental.operatingExpenseRate);
  const tax = clampRate(rental.estimatedTaxRate);
  return {
    gross: round(gross),
    net: round(gross * (1 - vacancy) * (1 - expense) * (1 - tax)),
    partial:
      rental.vacancyRate == null ||
      rental.operatingExpenseRate == null ||
      rental.estimatedTaxRate == null,
  };
}

function recurringIncomeAtYear(
  income: RecurringIncome,
  year: number,
): { net: number; partial: boolean } {
  if (
    year < income.startYear ||
    (income.endYear != null && year > income.endYear)
  )
    return { net: 0, partial: false };
  const gross =
    Math.max(0, income.monthlyAmount) *
    (1 + clampRate(income.annualGrowthRate)) ** (year - income.startYear);
  return {
    net: round(gross * (1 - clampRate(income.estimatedTaxRate))),
    partial: income.estimatedTaxRate == null,
  };
}

function amortizingPayment(
  principal: number,
  annualInterestRate: number,
  months: number,
) {
  if (principal <= 0 || months <= 0) return 0;
  const monthlyRate = Math.max(0, annualInterestRate) / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  return (
    (principal * monthlyRate * (1 + monthlyRate) ** months) /
    ((1 + monthlyRate) ** months - 1)
  );
}

function linkedAssetSaleYear(debt: HouseholdDebt, assets: HouseholdAsset[]) {
  if (!debt.payoffOnLinkedAssetSale || !debt.linkedAssetId) return null;
  const linkedAsset = assets.find((asset) => asset.id === debt.linkedAssetId);
  return linkedAsset?.salePlan?.enabled ? linkedAsset.salePlan.year : null;
}

function debtBalanceAtStartOfYear(
  debt: HouseholdDebt,
  year: number,
  baseYear: number,
) {
  const principal = Math.max(0, debt.principal);
  if (principal <= 0 || (debt.maturityYear && year > debt.maturityYear))
    return 0;
  if (debt.repaymentType !== 'amortizing') return principal;
  const months = Math.max(0, debt.remainingMonths ?? 0);
  if (months <= 0 || debt.annualInterestRate == null) return principal;
  const elapsedMonths = Math.min(months, Math.max(0, year - baseYear) * 12);
  if (elapsedMonths >= months) return 0;
  const monthlyRate = Math.max(0, debt.annualInterestRate) / 100 / 12;
  if (monthlyRate === 0)
    return Math.max(0, principal * (1 - elapsedMonths / months));
  const payment = amortizingPayment(principal, debt.annualInterestRate, months);
  const growth = (1 + monthlyRate) ** elapsedMonths;
  return Math.max(
    0,
    principal * growth - payment * ((growth - 1) / monthlyRate),
  );
}

export function resolveDebtServiceAtYear(
  debt: HouseholdDebt,
  year: number,
  baseYear: number,
  assets: HouseholdAsset[],
) {
  const payoffYear = linkedAssetSaleYear(debt, assets);
  if (payoffYear != null && year >= payoffYear)
    return { amount: 0, incomplete: false };
  if (debt.principal <= 0 || (debt.maturityYear && year > debt.maturityYear))
    return { amount: 0, incomplete: false };
  const repaymentType = debt.repaymentType;
  if (repaymentType === 'manual_monthly_payment') {
    return debt.manualMonthlyPayment != null && debt.manualMonthlyPayment >= 0
      ? { amount: debt.manualMonthlyPayment, incomplete: false }
      : { amount: 0, incomplete: true };
  }
  if (repaymentType === 'interest_only') {
    return debt.annualInterestRate != null
      ? {
          amount: debt.principal * (debt.annualInterestRate / 100 / 12),
          incomplete: false,
        }
      : { amount: 0, incomplete: true };
  }
  if (repaymentType === 'amortizing') {
    const months = debt.remainingMonths ?? 0;
    const elapsedMonths = Math.max(0, year - baseYear) * 12;
    if (debt.annualInterestRate == null || months <= 0)
      return { amount: 0, incomplete: true };
    return elapsedMonths >= months
      ? { amount: 0, incomplete: false }
      : {
          amount: amortizingPayment(
            debt.principal,
            debt.annualInterestRate,
            months,
          ),
          incomplete: false,
        };
  }
  return { amount: 0, incomplete: true };
}

function rowPresentValue(
  monthlyGap: number,
  year: number,
  baseYear: number,
  annualNetReturnRate: number,
) {
  const rate = Math.max(-0.99, annualNetReturnRate / 100);
  return (
    (Math.max(0, monthlyGap) * 12) / (1 + rate) ** Math.max(0, year - baseYear)
  );
}

export function calculateGapPresentValue(
  rows: Array<Pick<HouseholdCashflowRow, 'year' | 'monthlyGap'>>,
  baseYear: number,
  annualNetReturnRate: number,
) {
  return round(
    rows.reduce(
      (sum, row) =>
        sum +
        rowPresentValue(
          row.monthlyGap,
          row.year,
          baseYear,
          annualNetReturnRate,
        ),
      0,
    ),
  );
}

export function buildGapPeriods(
  rows: HouseholdCashflowRow[],
  baseYear: number,
  annualNetReturnRate: number,
) {
  const periods: GapPeriod[] = [];
  let current: HouseholdCashflowRow[] = [];
  const flush = () => {
    if (!current.length) return;
    periods.push({
      startYear: current[0].year,
      endYear: current.at(-1)?.year ?? current[0].year,
      phase: current[0].phase === 'ended' ? 'survivor' : current[0].phase,
      maxMonthlyGap: round(Math.max(...current.map((row) => row.monthlyGap))),
      exactPresentValue: calculateGapPresentValue(
        current,
        baseYear,
        annualNetReturnRate,
      ),
    });
    current = [];
  };
  for (const row of rows) {
    if (row.monthlyGap <= 0) {
      flush();
      continue;
    }
    if (current.length && current[0].phase !== row.phase) flush();
    current.push(row);
  }
  flush();
  return periods;
}

function availableAssetValue(
  asset: HouseholdAsset,
  debts: HouseholdDebt[],
  currentYear: number,
  realEstatePolicy: RealEstateCostPolicy,
) {
  if (asset.currentValue <= 0) return 0;
  const plan = resolveAssetUsePlan(asset, currentYear);
  if (plan.mode === 'hold') return 0;
  const reserve = Math.max(0, plan.reserveAmount ?? 0);
  if (asset.salePlan?.enabled) {
    const netSaleValue = resolveSaleTransaction(
      asset,
      asset.currentValue,
      asset.salePlan.year,
      realEstatePolicy,
    ).netProceeds;
    const linkedDebtPayoff = debts
      .filter(
        (debt) =>
          debt.linkedAssetId === asset.id && debt.payoffOnLinkedAssetSale,
      )
      .reduce(
        (sum, debt) =>
          sum +
          debtBalanceAtStartOfYear(debt, asset.salePlan!.year, currentYear),
        0,
      );
    const netSaleValueAfterDebt = Math.max(0, netSaleValue - linkedDebtPayoff);
    const move = asset.housingMovePlan;
    if (move?.enabled) {
      const replacementCost = resolvePurchaseTransaction(
        move,
        realEstatePolicy,
      ).totalCost;
      return Math.max(0, netSaleValueAfterDebt - replacementCost - reserve);
    }
    return Math.max(0, netSaleValueAfterDebt - reserve);
  }
  if (asset.retirementLiquidity === 'liquid')
    return Math.max(0, asset.currentValue - reserve);
  return 0;
}

function resolveSaleTransaction(
  asset: HouseholdAsset,
  grossSalePrice: number,
  saleYear: number,
  realEstatePolicy: RealEstateCostPolicy,
) {
  const sale = asset.salePlan;
  if (sale?.autoCostSettings?.enabled) {
    const estimate = estimateHomeSaleCosts({
      projectedSalePrice: grossSalePrice,
      saleYear,
      settings: sale.autoCostSettings,
      policy: realEstatePolicy,
    });
    return {
      netProceeds: Math.max(0, grossSalePrice - estimate.totalSellingCosts),
      saleBrokerage: estimate.brokerage.total,
      capitalGainsTaxes: estimate.totalCapitalGainsTaxes,
      roughEstimatePolicyId: estimate.policyId,
    };
  }
  const manualSellingCosts = grossSalePrice * clampRate(sale?.sellingCostRate);
  const manualTax = Math.max(0, sale?.capitalGainsTaxEstimate ?? 0);
  return {
    netProceeds: Math.max(0, grossSalePrice - manualSellingCosts - manualTax),
    saleBrokerage: undefined,
    capitalGainsTaxes: manualTax,
    roughEstimatePolicyId: undefined,
  };
}

function resolvePurchaseTransaction(
  move: HousingMovePlan,
  realEstatePolicy: RealEstateCostPolicy,
) {
  if (move.purchaseAutoCostSettings?.enabled) {
    const estimate = estimateHomePurchaseCosts({
      purchasePrice: move.purchasePrice,
      settings: move.purchaseAutoCostSettings,
      policy: realEstatePolicy,
    });
    return {
      totalCost: Math.max(0, move.purchasePrice + estimate.totalPurchaseCosts),
      purchaseBrokerage: estimate.brokerage.total,
      acquisitionTaxes:
        estimate.acquisitionTax +
        estimate.localEducationTax +
        estimate.ruralSpecialTax,
      roughEstimatePolicyId: estimate.policyId,
    };
  }
  return {
    totalCost: Math.max(
      0,
      move.purchasePrice * (1 + clampRate(move.purchaseCostRate)) +
        (move.purchaseTaxEstimate ?? 0),
    ),
    purchaseBrokerage: undefined,
    acquisitionTaxes: Math.max(0, move.purchaseTaxEstimate ?? 0),
    roughEstimatePolicyId: undefined,
  };
}

export function resolveAssetUsePlan(
  asset: HouseholdAsset,
  currentYear = new Date().getFullYear(),
): AssetUsePlan {
  if (asset.retirementUse) return asset.retirementUse;
  if (asset.retirementLiquidity === 'liquid')
    return { mode: 'cover_gap', startYear: currentYear, reserveAmount: 0 };
  if (asset.salePlan?.enabled)
    return {
      mode: 'cover_gap',
      startYear: asset.salePlan.year,
      reserveAmount: 0,
    };
  return { mode: 'hold', startYear: currentYear, reserveAmount: 0 };
}

const signedAnnualRate = (value: number | undefined) =>
  Math.min(100, Math.max(-100, value ?? 0)) / 100;

function applyAssetUsePlans(
  baseRows: HouseholdCashflowRow[],
  assets: HouseholdAsset[],
  debts: HouseholdDebt[],
  currentYear: number,
  realEstatePolicy: RealEstateCostPolicy,
) {
  const states = assets.map((asset) => ({
    asset,
    plan: resolveAssetUsePlan(asset, currentYear),
    balance: Math.max(0, asset.currentValue),
    sold: false,
    purchased: false,
    replacementHomeBalance: 0,
    saleBrokerage: undefined as number | undefined,
    capitalGainsTaxes: undefined as number | undefined,
    saleRoughEstimatePolicyId: undefined as string | undefined,
    saleProceedsBeforeDebtPayoff: undefined as number | undefined,
    linkedDebtPayoff: 0,
    linkedDebtPayoffDetails: [] as NonNullable<
      HouseholdCashflowRow['assetTransactionDetails'][number]['linkedDebtPayoffDetails']
    >,
    debtPayoffFundingShortfall: 0,
  }));
  let totalWithdrawals = 0;
  let totalReturnIncome = 0;
  let totalReinvestedReturns = 0;
  let totalLinkedDebtPayoffs = 0;
  let totalLinkedDebtPayoffFundingShortfall = 0;
  let totalHousingMoveSurplus = 0;
  let totalHousingPurchaseShortfall = 0;
  let totalPropertyHoldingTaxes = 0;
  const rows = baseRows.map((baseRow, rowIndex): HouseholdCashflowRow => {
    const year = baseRow.year;
    let annualReturnIncome = 0;
    let annualReinvestedReturn = 0;
    const returnIncomeDetails: HouseholdCashflowRow['assetReturnIncomeDetails'] =
      [];
    const transactionDetails: HouseholdCashflowRow['assetTransactionDetails'] =
      [];
    if (rowIndex > 0) {
      for (const state of states) {
        const move = state.asset.housingMovePlan;
        if (!state.sold) {
          state.balance *=
            1 + signedAnnualRate(state.asset.annualAppreciationRate);
          continue;
        }
        if (move?.enabled && !state.purchased) {
          state.balance *= 1 + signedAnnualRate(move.interimAnnualReturnRate);
          continue;
        }
        if (move?.enabled && state.purchased) {
          state.replacementHomeBalance *=
            1 + signedAnnualRate(move.replacementAnnualAppreciationRate);
          const earned =
            state.balance * signedAnnualRate(move.surplusAnnualReturnRate);
          if (move.surplusReturnMode === 'cash_income') {
            annualReturnIncome += earned;
            if (earned !== 0)
              returnIncomeDetails.push({
                assetId: state.asset.id,
                name: move.surplusName,
                amount: round(earned / 12),
              });
          } else {
            state.balance = Math.max(0, state.balance + earned);
            annualReinvestedReturn += earned;
          }
        }
      }
    }
    for (const state of states) {
      const sale = state.asset.salePlan;
      if (sale?.enabled && !state.sold && year >= sale.year) {
        const saleResult = resolveSaleTransaction(
          state.asset,
          state.balance,
          year,
          realEstatePolicy,
        );
        const linkedDebtPayoffDetails = debts
          .filter(
            (debt) =>
              debt.linkedAssetId === state.asset.id &&
              debt.payoffOnLinkedAssetSale,
          )
          .map((debt) => ({
            debtId: debt.id,
            name: debt.name,
            amount: round(debtBalanceAtStartOfYear(debt, year, currentYear)),
          }))
          .filter((detail) => detail.amount > 0);
        const linkedDebtPayoff = linkedDebtPayoffDetails.reduce(
          (sum, detail) => sum + detail.amount,
          0,
        );
        const debtPayoffFundingShortfall = Math.max(
          0,
          linkedDebtPayoff - saleResult.netProceeds,
        );
        state.saleProceedsBeforeDebtPayoff = saleResult.netProceeds;
        state.linkedDebtPayoff = linkedDebtPayoff;
        state.linkedDebtPayoffDetails = linkedDebtPayoffDetails;
        state.debtPayoffFundingShortfall = debtPayoffFundingShortfall;
        state.balance = Math.max(0, saleResult.netProceeds - linkedDebtPayoff);
        state.saleBrokerage = saleResult.saleBrokerage;
        state.capitalGainsTaxes = saleResult.capitalGainsTaxes;
        state.saleRoughEstimatePolicyId = saleResult.roughEstimatePolicyId;
        state.sold = true;
        totalLinkedDebtPayoffs += linkedDebtPayoff;
        totalLinkedDebtPayoffFundingShortfall += debtPayoffFundingShortfall;
        const move = state.asset.housingMovePlan;
        const effectivePurchaseYear = Math.max(
          sale.year,
          move?.purchaseYear ?? sale.year,
        );
        if (!move?.enabled || effectivePurchaseYear > year)
          transactionDetails.push({
            assetId: state.asset.id,
            transactionKind: 'sale',
            soldAssetName: state.asset.name,
            saleProceedsBeforeDebtPayoff: round(saleResult.netProceeds),
            saleProceeds: round(state.balance),
            investableSurplus: move?.enabled ? 0 : round(state.balance),
            fundingShortfall: 0,
            saleBrokerage: saleResult.saleBrokerage,
            capitalGainsTaxes: saleResult.capitalGainsTaxes,
            linkedDebtPayoff: round(linkedDebtPayoff),
            linkedDebtPayoffDetails,
            debtPayoffFundingShortfall: round(debtPayoffFundingShortfall),
            roughEstimatePolicyId: saleResult.roughEstimatePolicyId,
          });
      }
    }

    for (const state of states) {
      const sale = state.asset.salePlan;
      const move = state.asset.housingMovePlan;
      if (!sale?.enabled || !move?.enabled || state.purchased || !state.sold)
        continue;
      const effectivePurchaseYear = Math.max(sale.year, move.purchaseYear);
      if (year < effectivePurchaseYear) continue;
      const availableBeforePurchase = state.balance;
      const purchaseResult = resolvePurchaseTransaction(move, realEstatePolicy);
      const purchaseCost = purchaseResult.totalCost;
      const investableSurplus = Math.max(
        0,
        availableBeforePurchase - purchaseCost,
      );
      const fundingShortfall = Math.max(
        0,
        purchaseCost - availableBeforePurchase,
      );
      state.balance = investableSurplus;
      state.replacementHomeBalance = Math.max(0, move.purchasePrice);
      state.purchased = true;
      totalHousingMoveSurplus += investableSurplus;
      totalHousingPurchaseShortfall += fundingShortfall;
      const saleAndPurchaseSameYear = sale.year === effectivePurchaseYear;
      if (saleAndPurchaseSameYear) {
        const saleDetailIndex = transactionDetails.findIndex(
          (detail) => detail.assetId === state.asset.id,
        );
        if (saleDetailIndex >= 0) transactionDetails.splice(saleDetailIndex, 1);
      }
      transactionDetails.push({
        assetId: state.asset.id,
        transactionKind: saleAndPurchaseSameYear
          ? 'sale_and_purchase'
          : 'purchase',
        soldAssetName: state.asset.name,
        saleProceedsBeforeDebtPayoff: saleAndPurchaseSameYear
          ? state.saleProceedsBeforeDebtPayoff
          : undefined,
        saleProceeds: round(availableBeforePurchase),
        purchasedAssetName: move.replacementName,
        purchaseCost: round(purchaseCost),
        investableSurplus: round(investableSurplus),
        fundingShortfall: round(fundingShortfall),
        saleBrokerage: saleAndPurchaseSameYear
          ? state.saleBrokerage
          : undefined,
        capitalGainsTaxes: saleAndPurchaseSameYear
          ? state.capitalGainsTaxes
          : undefined,
        purchaseBrokerage: purchaseResult.purchaseBrokerage,
        acquisitionTaxes: purchaseResult.acquisitionTaxes,
        linkedDebtPayoff: saleAndPurchaseSameYear
          ? round(state.linkedDebtPayoff)
          : undefined,
        linkedDebtPayoffDetails: saleAndPurchaseSameYear
          ? state.linkedDebtPayoffDetails
          : undefined,
        debtPayoffFundingShortfall: saleAndPurchaseSameYear
          ? round(state.debtPayoffFundingShortfall)
          : undefined,
        roughEstimatePolicyId:
          purchaseResult.roughEstimatePolicyId ??
          (saleAndPurchaseSameYear
            ? state.saleRoughEstimatePolicyId
            : undefined),
      });
    }

    const holdingTaxInputs = states.flatMap((state) => {
      const settings = state.asset.holdingTax;
      if (!settings?.enabled) return [];
      const usesReplacementHome = Boolean(
        state.asset.housingMovePlan?.enabled && state.purchased,
      );
      const marketValue = usesReplacementHome
        ? state.replacementHomeBalance
        : state.sold
          ? 0
          : state.balance;
      if (marketValue <= 0) return [];
      const assessedValueRatio =
        state.asset.currentValue > 0
          ? settings.assessedValue / state.asset.currentValue
          : 0.7;
      return [
        {
          id: state.asset.id,
          name: usesReplacementHome
            ? (state.asset.housingMovePlan?.replacementName ?? state.asset.name)
            : state.asset.name,
          marketValue,
          settings: {
            ...settings,
            assessedValue: marketValue * assessedValueRatio,
          },
        } satisfies HoldingTaxPropertyInput,
      ];
    });
    const holdingTaxEstimate = estimateAnnualResidentialHoldingTaxes(
      holdingTaxInputs,
      realEstatePolicy,
    );
    const propertyHoldingTaxDetails = holdingTaxEstimate.perProperty
      .filter((estimate) => {
        const input = holdingTaxInputs.find((item) => item.id === estimate.id);
        return input?.settings.includeInCashflow && estimate.annualTotal > 0;
      })
      .map((estimate) => ({
        assetId: estimate.id,
        name:
          holdingTaxInputs.find((item) => item.id === estimate.id)?.name ??
          '부동산',
        amount: round(estimate.annualTotal / 12),
      }));
    const propertyHoldingTax = round(
      propertyHoldingTaxDetails.reduce((sum, detail) => sum + detail.amount, 0),
    );
    totalPropertyHoldingTaxes += propertyHoldingTax * 12;

    let annualWithdrawal = 0;
    const details: HouseholdCashflowRow['assetWithdrawalDetails'] = [];
    const drawFrom = (
      state: (typeof states)[number],
      requestedAnnual: number,
    ) => {
      const reserve = Math.max(0, state.plan.reserveAmount ?? 0);
      const drawable = Math.max(0, state.balance - reserve);
      const amount = Math.min(drawable, Math.max(0, requestedAnnual));
      if (amount <= 0) return;
      state.balance -= amount;
      annualWithdrawal += amount;
      details.push({
        assetId: state.asset.id,
        name:
          state.asset.housingMovePlan?.enabled && state.purchased
            ? state.asset.housingMovePlan.surplusName
            : state.asset.name,
        amount: round(amount / 12),
      });
    };

    for (const state of states) {
      const { asset, plan } = state;
      if (
        plan.mode === 'hold' ||
        year < plan.startYear ||
        (plan.endYear != null && year > plan.endYear)
      )
        continue;
      const convertedToCash = asset.housingMovePlan?.enabled
        ? state.purchased
        : asset.retirementLiquidity === 'liquid' || state.sold;
      if (!convertedToCash) continue;
      if (plan.mode === 'fixed_monthly')
        drawFrom(state, Math.max(0, plan.monthlyAmount ?? 0) * 12);
      if (plan.mode === 'cover_gap') {
        const cashIncludingPriorDraws =
          baseRow.householdCashIncomeAfterDebt -
          propertyHoldingTax +
          annualReturnIncome / 12 +
          annualWithdrawal / 12;
        const remainingMonthlyGap = Math.max(
          0,
          baseRow.livingCost - cashIncludingPriorDraws,
        );
        drawFrom(state, remainingMonthlyGap * 12);
      }
    }

    const assetWithdrawal = round(annualWithdrawal / 12);
    const assetReturnIncome = round(annualReturnIncome / 12);
    const assetReinvestedReturn = round(annualReinvestedReturn / 12);
    totalWithdrawals += annualWithdrawal;
    totalReturnIncome += annualReturnIncome;
    totalReinvestedReturns += annualReinvestedReturn;
    const householdCashAvailableAfterAsset =
      baseRow.householdCashIncomeAfterDebt +
      assetReturnIncome +
      assetWithdrawal -
      propertyHoldingTax;
    const remainingRetirementAssets = round(
      states
        .filter(
          (state) =>
            state.plan.mode !== 'hold' &&
            (!state.asset.housingMovePlan?.enabled || state.purchased),
        )
        .reduce((sum, state) => sum + state.balance, 0),
    );
    const cashAndFinancialAssetBalance = round(
      states
        .filter(
          (state) =>
            state.asset.type === 'cash' ||
            state.asset.type === 'financial' ||
            state.sold,
        )
        .reduce((sum, state) => sum + state.balance, 0),
    );
    const replacementHousingValue = round(
      states.reduce((sum, state) => sum + state.replacementHomeBalance, 0),
    );
    const grossAssetBalance = round(
      states.reduce(
        (sum, state) => sum + state.balance + state.replacementHomeBalance,
        0,
      ),
    );
    const liabilityBalance = round(
      debts.reduce((sum, debt) => {
        const linkedState = debt.linkedAssetId
          ? states.find((state) => state.asset.id === debt.linkedAssetId)
          : undefined;
        if (debt.payoffOnLinkedAssetSale && linkedState?.sold) return sum;
        return sum + debtBalanceAtStartOfYear(debt, year, currentYear);
      }, 0),
    );
    return {
      ...baseRow,
      monthlyGapBeforeAsset: round(
        Math.max(
          0,
          baseRow.livingCost -
            (baseRow.householdCashIncomeAfterDebt - propertyHoldingTax),
        ),
      ),
      assetWithdrawal,
      assetWithdrawalDetails: details,
      propertyHoldingTax,
      propertyHoldingTaxDetails,
      assetReturnIncome,
      assetReturnIncomeDetails: returnIncomeDetails,
      assetReinvestedReturn,
      assetTransactionDetails: transactionDetails,
      householdCashAvailableAfterAsset: round(householdCashAvailableAfterAsset),
      grossAssetBalance,
      liabilityBalance,
      netWorthBalance: round(grossAssetBalance - liabilityBalance),
      remainingRetirementAssets,
      cashAndFinancialAssetBalance,
      replacementHousingValue,
      monthlyGap: round(
        Math.max(0, baseRow.livingCost - householdCashAvailableAfterAsset),
      ),
      monthlySurplus: round(
        Math.max(0, householdCashAvailableAfterAsset - baseRow.livingCost),
      ),
    };
  });
  return {
    rows,
    totalWithdrawals: round(totalWithdrawals),
    totalReturnIncome: round(totalReturnIncome),
    totalReinvestedReturns: round(totalReinvestedReturns),
    linkedDebtPayoffs: round(totalLinkedDebtPayoffs),
    linkedDebtPayoffFundingShortfall: round(
      totalLinkedDebtPayoffFundingShortfall,
    ),
    housingMoveSurplus: round(totalHousingMoveSurplus),
    housingPurchaseShortfall: round(totalHousingPurchaseShortfall),
    propertyHoldingTaxes: round(totalPropertyHoldingTaxes),
    remainingAssets: rows.at(-1)?.remainingRetirementAssets ?? 0,
    replacementHousingValue: rows.at(-1)?.replacementHousingValue ?? 0,
  };
}

function monthlyContributionForPresentValue(
  presentValue: number,
  months: number,
  annualNetReturnRate: number,
) {
  if (presentValue <= 0) return 0;
  if (months <= 0) return presentValue;
  const monthlyRate = Math.max(-0.99, annualNetReturnRate / 100) / 12;
  if (Math.abs(monthlyRate) < 1e-9) return presentValue / months;
  const annuityPresentValueFactor =
    (1 - (1 + monthlyRate) ** -months) / monthlyRate;
  return presentValue / annuityPresentValueFactor;
}

export function buildHouseholdCashflow({
  result,
  livingCost,
  finance,
  annualNetReturnRate,
  includeLateLifeGap,
  currentYear = new Date().getFullYear(),
  policy,
}: {
  result: SimulationResult;
  livingCost: LivingCostSettings;
  finance: HouseholdFinanceSettings;
  annualNetReturnRate: number;
  includeLateLifeGap: boolean;
  currentYear?: number;
  policy?: Policy;
}): HouseholdCashflowAnalysis {
  const realEstateCostPolicy =
    finance.realEstateCostPolicy ?? DEFAULT_REAL_ESTATE_COST_POLICY;
  const rowByYear = new Map(result.rows.map((row) => [row.year, row]));
  const lastDeathYear = Math.max(
    result.a.deathYear,
    result.b?.deathYear ?? result.a.deathYear,
  );
  const employedPeople = [result.a, result.b].filter(
    (person) => person?.enabled && person.employmentIncomeEnabled,
  );
  const firstDeathYear = result.b
    ? Math.min(result.a.deathYear, result.b.deathYear)
    : result.a.deathYear;
  let anyRentalPartial = false;
  let anyOtherIncomePartial = false;
  let anyDebtIncomplete = false;
  const baseRows = Array.from(
    { length: Math.max(0, lastDeathYear - currentYear + 1) },
    (_, index): HouseholdCashflowRow => {
      const year = currentYear + index;
      const pensionRow = rowByYear.get(year);
      const aliveA = year <= result.a.deathYear;
      const aliveB = Boolean(result.b && year <= result.b.deathYear);
      const employmentIncome =
        employmentIncomeAtYear(result.a, year) +
        employmentIncomeAtYear(result.b, year);
      const nationalPension =
        (pensionRow?.nationalPensionA ?? 0) +
        (pensionRow?.nationalPensionB ?? 0);
      const basicPension = basicPensionInRow(pensionRow);
      const privatePensionGross =
        (pensionRow?.additionalPensionA ?? 0) +
        (pensionRow?.additionalPensionB ?? 0);
      const privatePension = pensionRow
        ? Math.max(
            0,
            pensionRow.estimatedNetCombined - nationalPension - basicPension,
          )
        : privatePensionGross;
      const rentals = finance.assets.map((asset) =>
        rentalIncomeAtYear(asset, year, currentYear),
      );
      anyRentalPartial ||= rentals.some((rental) => rental.partial);
      const rentalIncomeGross = rentals.reduce(
        (sum, rental) => sum + rental.gross,
        0,
      );
      const rentalIncomeNet = rentals.reduce(
        (sum, rental) => sum + rental.net,
        0,
      );
      const otherIncomes = finance.recurringIncomes.map((income) =>
        recurringIncomeAtYear(income, year),
      );
      anyOtherIncomePartial ||= otherIncomes.some((income) => income.partial);
      const otherIncome = otherIncomes.reduce(
        (sum, income) => sum + income.net,
        0,
      );
      const debts = finance.debts.map((debt) =>
        resolveDebtServiceAtYear(debt, year, currentYear, finance.assets),
      );
      anyDebtIncomplete ||= debts.some((debt) => debt.incomplete);
      const debtService = debts.reduce((sum, debt) => sum + debt.amount, 0);
      const householdIncomeBeforeDebt =
        employmentIncome +
        nationalPension +
        basicPension +
        privatePension +
        rentalIncomeNet +
        otherIncome;
      const householdCashIncomeAfterDebt =
        householdIncomeBeforeDebt - debtService;
      const survivor = Boolean(result.b && aliveA !== aliveB);
      const livingCostAmount = livingCostMonthly(
        livingCost,
        year,
        survivor,
        policy,
      );
      const activeWorkers = employedPeople.filter(
        (person) => employmentIncomeAtYear(person, year) > 0,
      ).length;
      const phase: CashflowPhase = survivor
        ? 'survivor'
        : activeWorkers === 0
          ? 'full_retirement'
          : activeWorkers < employedPeople.length
            ? 'partial_retirement'
            : 'working';
      return {
        year,
        ageA: year - result.a.birthDate.getFullYear(),
        ageB: result.b ? year - result.b.birthDate.getFullYear() : null,
        aliveA,
        aliveB,
        employmentIncome: round(employmentIncome),
        nationalPension: round(nationalPension),
        basicPension: round(basicPension),
        privatePension: round(privatePension),
        rentalIncomeGross: round(rentalIncomeGross),
        rentalIncomeNet: round(rentalIncomeNet),
        otherIncome: round(otherIncome),
        debtService: round(debtService),
        propertyHoldingTax: 0,
        propertyHoldingTaxDetails: [],
        householdIncomeBeforeDebt: round(householdIncomeBeforeDebt),
        householdCashIncomeAfterDebt: round(householdCashIncomeAfterDebt),
        monthlyGapBeforeAsset: round(
          Math.max(0, livingCostAmount - householdCashIncomeAfterDebt),
        ),
        assetWithdrawal: 0,
        assetWithdrawalDetails: [],
        assetReturnIncome: 0,
        assetReturnIncomeDetails: [],
        assetReinvestedReturn: 0,
        assetTransactionDetails: [],
        householdCashAvailableAfterAsset: round(householdCashIncomeAfterDebt),
        grossAssetBalance: 0,
        liabilityBalance: 0,
        netWorthBalance: 0,
        remainingRetirementAssets: 0,
        cashAndFinancialAssetBalance: 0,
        replacementHousingValue: 0,
        livingCost: livingCostAmount,
        monthlyGap: round(
          Math.max(0, livingCostAmount - householdCashIncomeAfterDebt),
        ),
        monthlySurplus: round(
          Math.max(0, householdCashIncomeAfterDebt - livingCostAmount),
        ),
        phase,
      };
    },
  );
  const assetUse = applyAssetUsePlans(
    baseRows,
    finance.assets,
    finance.debts,
    currentYear,
    realEstateCostPolicy,
  );
  const rows = assetUse.rows;
  const gapPeriodsBeforeAssets = buildGapPeriods(
    baseRows,
    currentYear,
    annualNetReturnRate,
  );
  const gapPeriods = buildGapPeriods(rows, currentYear, annualNetReturnRate);
  const capitalPlanRows = includeLateLifeGap
    ? rows
    : rows.filter((row) => row.year <= firstDeathYear);
  const baseCapitalPlanRows = includeLateLifeGap
    ? baseRows
    : baseRows.filter((row) => row.year <= firstDeathYear);
  const capitalPlanGapPeriods = buildGapPeriods(
    capitalPlanRows,
    currentYear,
    annualNetReturnRate,
  );
  const lateLifeGapPeriods = gapPeriods.filter(
    (period) => period.phase === 'survivor',
  );
  const gapRows = capitalPlanRows.filter((row) => row.monthlyGap > 0);
  const gapRowsBeforeAssets = baseCapitalPlanRows.filter(
    (row) => row.monthlyGapBeforeAsset > 0,
  );
  const exactGapPresentValue = calculateGapPresentValue(
    gapRowsBeforeAssets.map((row) => ({
      ...row,
      monthlyGap: row.monthlyGapBeforeAsset,
    })),
    currentYear,
    annualNetReturnRate,
  );
  const exactGapPresentValueAfterAssets = calculateGapPresentValue(
    gapRows,
    currentYear,
    annualNetReturnRate,
  );
  const firstGapYear = gapRows[0]?.year ?? null;
  const lastGapYear = gapRows.at(-1)?.year ?? null;
  const maximumMonthlyGap = gapRows.length
    ? Math.max(...gapRows.map((row) => row.monthlyGap))
    : 0;
  const conservativeRows =
    firstGapYear == null || lastGapYear == null
      ? []
      : Array.from({ length: lastGapYear - firstGapYear + 1 }, (_, index) => ({
          year: firstGapYear + index,
          monthlyGap: maximumMonthlyGap,
        }));
  const conservativeStressCapital = calculateGapPresentValue(
    conservativeRows,
    currentYear,
    annualNetReturnRate,
  );
  const grossAssets = finance.assets.reduce(
    (sum, asset) => sum + Math.max(0, asset.currentValue),
    0,
  );
  const liabilities = finance.debts.reduce(
    (sum, debt) => sum + Math.max(0, debt.principal),
    0,
  );
  const retirementAvailableAssets = round(
    finance.assets.reduce(
      (sum, asset) =>
        sum +
        availableAssetValue(
          asset,
          finance.debts,
          currentYear,
          realEstateCostPolicy,
        ),
      0,
    ),
  );
  const baseRow = rows[0];
  const taxEstimateIncomplete = result.additionalPensions.some(
    (account) => account.taxEstimateStatus !== 'complete',
  );
  const financeSummary: HouseholdFinanceSummary = {
    grossAssets: round(grossAssets),
    liabilities: round(liabilities),
    netWorth: round(grossAssets - liabilities),
    retirementAvailableAssets,
    plannedAssetWithdrawals: assetUse.totalWithdrawals,
    plannedAssetReturnIncome: assetUse.totalReturnIncome,
    plannedAssetReinvestedReturns: assetUse.totalReinvestedReturns,
    linkedDebtPayoffsAtSale: assetUse.linkedDebtPayoffs,
    linkedDebtPayoffFundingShortfall: assetUse.linkedDebtPayoffFundingShortfall,
    housingMoveInvestableSurplus: assetUse.housingMoveSurplus,
    housingPurchaseFundingShortfall: assetUse.housingPurchaseShortfall,
    remainingPlannedAssetsAtEnd: assetUse.remainingAssets,
    replacementHousingValueAtEnd: assetUse.replacementHousingValue,
    primaryHomeValue: round(
      finance.assets
        .filter((asset) => asset.type === 'primary_home')
        .reduce((sum, asset) => sum + Math.max(0, asset.currentValue), 0),
    ),
    monthlyRentalIncomeGrossAtBaseYear: baseRow?.rentalIncomeGross ?? 0,
    monthlyRentalIncomeNetAtBaseYear: baseRow?.rentalIncomeNet ?? 0,
    monthlyOtherIncomeAtBaseYear: baseRow?.otherIncome ?? 0,
    monthlyDebtServiceAtBaseYear: baseRow?.debtService ?? 0,
    monthlyPropertyHoldingTaxAtBaseYear: baseRow?.propertyHoldingTax ?? 0,
    plannedPropertyHoldingTaxes: assetUse.propertyHoldingTaxes,
    completeness: {
      debtService: anyDebtIncomplete ? 'incomplete' : 'complete',
      rentalNetIncome: anyRentalPartial ? 'partial' : 'complete',
      taxEstimate:
        taxEstimateIncomplete || anyOtherIncomePartial ? 'partial' : 'complete',
    },
  };
  const fundingNeedAfterAvailableAssets = round(
    exactGapPresentValueAfterAssets,
  );
  const monthsUntilFirstGap =
    firstGapYear == null ? 0 : Math.max(0, firstGapYear - currentYear) * 12;
  const warnings: CashflowWarning[] = [];
  if (anyDebtIncomplete)
    warnings.push({
      code: 'DEBT_SERVICE_MISSING',
      severity: 'critical',
      message:
        '대출 원금은 순자산에서 차감했지만 금리·상환방식·월 상환액 정보가 부족하여 일부 대출상환액을 현금흐름에 반영하지 못했습니다.',
      affectedMetric: 'monthlyGap',
    });
  const invalidLinkedDebts = finance.debts.filter(
    (debt) =>
      debt.payoffOnLinkedAssetSale &&
      (!debt.linkedAssetId ||
        !finance.assets.some((asset) => asset.id === debt.linkedAssetId)),
  );
  if (invalidLinkedDebts.length)
    warnings.push({
      code: 'LINKED_DEBT_ASSET_MISSING',
      severity: 'warning',
      message: `${invalidLinkedDebts.map((debt) => debt.name).join(', ')}은(는) 매각 시 자동상환을 선택했지만 연결 자산을 찾을 수 없습니다. 대출의 연결 자산을 다시 선택하세요.`,
      affectedMetric: 'assetTransactionDetails',
    });
  const linkedDebtsWithoutSale = finance.debts.filter((debt) => {
    if (!debt.payoffOnLinkedAssetSale || !debt.linkedAssetId) return false;
    const linkedAsset = finance.assets.find(
      (asset) => asset.id === debt.linkedAssetId,
    );
    return linkedAsset != null && !linkedAsset.salePlan?.enabled;
  });
  if (linkedDebtsWithoutSale.length)
    warnings.push({
      code: 'LINKED_DEBT_SALE_NOT_SCHEDULED',
      severity: 'warning',
      message: `${linkedDebtsWithoutSale.map((debt) => debt.name).join(', ')}의 연결 자산에 매각 계획이 없어 자동상환 시점이 정해지지 않았습니다. 자산의 매각 계획을 설정하세요.`,
      affectedMetric: 'assetTransactionDetails',
    });
  if (assetUse.linkedDebtPayoffFundingShortfall > 0)
    warnings.push({
      code: 'LINKED_DEBT_PAYOFF_SHORTFALL',
      severity: 'critical',
      message: `연결 자산의 비용·세금 차감 후 매각대금보다 자동상환할 대출잔액이 커 총 ${round(assetUse.linkedDebtPayoffFundingShortfall).toLocaleString('ko-KR')}원의 별도 상환자금이 필요합니다.`,
      affectedMetric: 'assetTransactionDetails',
    });
  if (anyRentalPartial)
    warnings.push({
      code: 'RENTAL_NET_INCOME_PARTIAL',
      severity: 'warning',
      message:
        '일부 임대소득의 공실률·운영비·세금이 비어 있어 순수입은 입력된 항목만 차감한 부분 추정입니다.',
      affectedMetric: 'rentalIncomeNet',
    });
  if ((livingCost.survivorMode ?? 'same_as_couple') === 'same_as_couple')
    warnings.push({
      code: 'SURVIVOR_LIVING_COST_UNCHANGED',
      severity: 'warning',
      message:
        '첫 사망 후 생활비를 부부 생존 시와 동일하게 가정했습니다. 생존자 1인 생활비를 별도로 입력하면 후기 현금흐름이 더 현실적입니다.',
      affectedMetric: 'livingCost',
    });
  if (taxEstimateIncomplete)
    warnings.push({
      code: 'TAX_ESTIMATE_PARTIAL',
      severity: 'warning',
      message:
        '일부 개인·퇴직연금의 세금 입력이 없어 전체 금액은 세후 확정액이 아닌 부분 추정입니다.',
      affectedMetric: 'householdCashIncomeAfterDebt',
    });
  const unavailablePlannedAssets = finance.assets.filter((asset) => {
    const plan = resolveAssetUsePlan(asset, currentYear);
    return (
      plan.mode !== 'hold' &&
      asset.retirementLiquidity !== 'liquid' &&
      !asset.salePlan?.enabled
    );
  });
  if (unavailablePlannedAssets.length)
    warnings.push({
      code: 'ASSET_USE_NOT_CONVERTIBLE',
      severity: 'warning',
      message: `${unavailablePlannedAssets.map((asset) => asset.name).join(', ')}은(는) 생활비에 사용하도록 설정됐지만 현금성 자산도 아니고 매각 계획도 없어 연도별 인출액에 반영되지 않았습니다.`,
      affectedMetric: 'assetWithdrawal',
    });
  const invalidHousingMoveYears = finance.assets.filter(
    (asset) =>
      asset.housingMovePlan?.enabled &&
      asset.salePlan?.enabled &&
      asset.housingMovePlan.purchaseYear < asset.salePlan.year,
  );
  if (invalidHousingMoveYears.length)
    warnings.push({
      code: 'HOUSING_PURCHASE_BEFORE_SALE',
      severity: 'warning',
      message: `${invalidHousingMoveYears.map((asset) => asset.name).join(', ')}의 새 주택 구입연도가 매각연도보다 빨라 계산에서는 매각연도에 구입하는 것으로 조정했습니다. 먼저 구입할 계획이라면 별도 조달자금이나 대출을 등록해야 합니다.`,
      affectedMetric: 'assetTransactionDetails',
    });
  if (assetUse.housingPurchaseShortfall > 0)
    warnings.push({
      code: 'HOUSING_PURCHASE_FUNDING_SHORTFALL',
      severity: 'critical',
      message: `주택 매각대금보다 새 주택 구입비용이 커 총 ${round(assetUse.housingPurchaseShortfall).toLocaleString('ko-KR')}원의 별도 구입자금이 필요합니다. 이 금액은 월 생활비 부족액과 분리된 일시 필요재원입니다.`,
      affectedMetric: 'assetTransactionDetails',
    });
  const roughHoldingTaxAssets = finance.assets.filter(
    (asset) => asset.holdingTax?.enabled,
  );
  const roughTransactionAssets = finance.assets.filter(
    (asset) =>
      asset.salePlan?.autoCostSettings?.enabled ||
      asset.housingMovePlan?.purchaseAutoCostSettings?.enabled,
  );
  const roughRealEstateAssets = [
    ...new Map(
      [...roughHoldingTaxAssets, ...roughTransactionAssets].map((asset) => [
        asset.id,
        asset,
      ]),
    ).values(),
  ];
  if (roughRealEstateAssets.length)
    warnings.push({
      code: 'REAL_ESTATE_COST_ROUGH_ESTIMATE',
      severity: 'warning',
      message: `${[
        roughHoldingTaxAssets.length
          ? `${roughHoldingTaxAssets.map((asset) => asset.name).join(', ')}의 재산세·종합부동산세`
          : '',
        roughTransactionAssets.length
          ? `${roughTransactionAssets.map((asset) => asset.name).join(', ')}의 거래세금·중개보수`
          : '',
      ]
        .filter(Boolean)
        .join(', ')}는 ${realEstateCostPolicy.policyId} 기준 참고 추정입니다. 자동계산을 켜지 않은 보유세·거래비용은 포함하지 않습니다. 미래 세법 변화를 예측하지 않으며 실제 세부담상한·고령자/장기보유 공제·비과세·중과·감면·필요경비는 세무사·관할기관에 확인하세요.`,
      affectedMetric: 'assetTransactionDetails',
    });
  return {
    baseYear: currentYear,
    discountRate: annualNetReturnRate,
    rows,
    gapPeriodsBeforeAssets,
    gapPeriods,
    capitalPlanGapPeriods,
    lateLifeGapPeriods,
    firstGapYear,
    maximumMonthlyGap: round(maximumMonthlyGap),
    exactGapPresentValue,
    exactGapPresentValueAfterAssets,
    conservativeStressCapital,
    fundingNeedAfterAvailableAssets,
    suggestedMonthlyContribution:
      monthsUntilFirstGap > 0
        ? round(
            monthlyContributionForPresentValue(
              fundingNeedAfterAvailableAssets,
              monthsUntilFirstGap,
              annualNetReturnRate,
            ),
          )
        : 0,
    finance: financeSummary,
    warnings,
  };
}
