import type { Policy, SimulationResult } from './nps-engine.ts';
import { employmentIncomeAtYear } from './pension-goal.ts';
import {
  livingCostMonthly,
  type LivingCostSettings,
} from './public-pension.ts';

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
  salePlan?: {
    enabled: boolean;
    year: number;
    sellingCostRate?: number;
    capitalGainsTaxEstimate?: number;
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
  householdIncomeBeforeDebt: number;
  householdCashIncomeAfterDebt: number;
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
  primaryHomeValue: number;
  monthlyRentalIncomeGrossAtBaseYear: number;
  monthlyRentalIncomeNetAtBaseYear: number;
  monthlyOtherIncomeAtBaseYear: number;
  monthlyDebtServiceAtBaseYear: number;
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
  gapPeriods: GapPeriod[];
  capitalPlanGapPeriods: GapPeriod[];
  lateLifeGapPeriods: GapPeriod[];
  firstGapYear: number | null;
  maximumMonthlyGap: number;
  exactGapPresentValue: number;
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
  if (year < startYear || (rental.endYear != null && year > rental.endYear))
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

function debtServiceAtYear(
  debt: HouseholdDebt,
  year: number,
  baseYear: number,
) {
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

function availableAssetValue(asset: HouseholdAsset) {
  if (asset.currentValue <= 0) return 0;
  if (asset.type === 'primary_home' && !asset.salePlan?.enabled) return 0;
  if (asset.retirementLiquidity === 'liquid') return asset.currentValue;
  if (
    asset.retirementLiquidity === 'sellable' &&
    (asset.type !== 'primary_home' || asset.salePlan?.enabled)
  ) {
    const sellingCost = clampRate(asset.salePlan?.sellingCostRate);
    return Math.max(
      0,
      asset.currentValue * (1 - sellingCost) -
        (asset.salePlan?.capitalGainsTaxEstimate ?? 0),
    );
  }
  return 0;
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
  const rows = Array.from(
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
        debtServiceAtYear(debt, year, currentYear),
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
        householdIncomeBeforeDebt: round(householdIncomeBeforeDebt),
        householdCashIncomeAfterDebt: round(householdCashIncomeAfterDebt),
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
  const gapPeriods = buildGapPeriods(rows, currentYear, annualNetReturnRate);
  const capitalPlanRows = includeLateLifeGap
    ? rows
    : rows.filter((row) => row.year <= firstDeathYear);
  const capitalPlanGapPeriods = buildGapPeriods(
    capitalPlanRows,
    currentYear,
    annualNetReturnRate,
  );
  const lateLifeGapPeriods = gapPeriods.filter(
    (period) => period.phase === 'survivor',
  );
  const gapRows = capitalPlanRows.filter((row) => row.monthlyGap > 0);
  const exactGapPresentValue = calculateGapPresentValue(
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
    finance.assets.reduce((sum, asset) => sum + availableAssetValue(asset), 0),
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
    primaryHomeValue: round(
      finance.assets
        .filter((asset) => asset.type === 'primary_home')
        .reduce((sum, asset) => sum + Math.max(0, asset.currentValue), 0),
    ),
    monthlyRentalIncomeGrossAtBaseYear: baseRow?.rentalIncomeGross ?? 0,
    monthlyRentalIncomeNetAtBaseYear: baseRow?.rentalIncomeNet ?? 0,
    monthlyOtherIncomeAtBaseYear: baseRow?.otherIncome ?? 0,
    monthlyDebtServiceAtBaseYear: baseRow?.debtService ?? 0,
    completeness: {
      debtService: anyDebtIncomplete ? 'incomplete' : 'complete',
      rentalNetIncome: anyRentalPartial ? 'partial' : 'complete',
      taxEstimate:
        taxEstimateIncomplete || anyOtherIncomePartial ? 'partial' : 'complete',
    },
  };
  const fundingNeedAfterAvailableAssets = round(
    Math.max(0, exactGapPresentValue - retirementAvailableAssets),
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
  return {
    baseYear: currentYear,
    discountRate: annualNetReturnRate,
    rows,
    gapPeriods,
    capitalPlanGapPeriods,
    lateLifeGapPeriods,
    firstGapYear,
    maximumMonthlyGap: round(maximumMonthlyGap),
    exactGapPresentValue,
    conservativeStressCapital,
    fundingNeedAfterAvailableAssets,
    suggestedMonthlyContribution: round(
      monthlyContributionForPresentValue(
        fundingNeedAfterAvailableAssets,
        monthsUntilFirstGap,
        annualNetReturnRate,
      ),
    ),
    finance: financeSummary,
    warnings,
  };
}
