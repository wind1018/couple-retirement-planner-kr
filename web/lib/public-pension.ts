import {
  DEFAULT_POLICY,
  type Policy,
  type SimulationResult,
} from './nps-engine.ts';

export type BasicPensionSettings = {
  a: boolean;
  b: boolean;
};

export type LivingCostBasis = 'minimum' | 'median';
export type LivingCostReference = 'general' | 'retiredCouple' | 'custom';
export type SurvivorLivingCostMode = 'same_as_couple' | 'ratio' | 'custom';

export type LivingCostSettings = {
  reference: LivingCostReference;
  householdSize: number;
  basis: LivingCostBasis;
  annualInflationRate: number;
  customBaseYear?: number;
  customMonthlyAmount?: number;
  survivorMode?: SurvivorLivingCostMode;
  survivorRatio?: number;
  survivorBaseYear?: number;
  survivorMonthlyAmount?: number;
};

export const BASIC_PENSION_BASE_YEAR = DEFAULT_POLICY.basicPension.baseYear;
export const BASIC_PENSION_STANDARD_MONTHLY =
  DEFAULT_POLICY.basicPension.standardMonthly;
export const BASIC_PENSION_COUPLE_EACH_MONTHLY =
  DEFAULT_POLICY.basicPension.coupleEachMonthly;

export const LIVING_COST_2026: Record<LivingCostBasis, number[]> =
  DEFAULT_POLICY.livingCostBenchmarks.general;

export const RETIRED_COUPLE_LIVING_COST_BASE_YEAR =
  DEFAULT_POLICY.livingCostBenchmarks.retiredCouple.baseYear;
export const RETIRED_COUPLE_LIVING_COST_2024: Record<LivingCostBasis, number> =
  DEFAULT_POLICY.livingCostBenchmarks.retiredCouple;

export const defaultBasicPensionSettings = (): BasicPensionSettings => ({
  a: false,
  b: false,
});

export const defaultLivingCostSettings = (): LivingCostSettings => ({
  reference: 'general',
  householdSize: 4,
  basis: 'minimum',
  annualInflationRate: 2,
  customBaseYear: BASIC_PENSION_BASE_YEAR,
  customMonthlyAmount: 3_000_000,
  survivorMode: 'same_as_couple',
  survivorRatio: 75,
  survivorBaseYear: BASIC_PENSION_BASE_YEAR,
  survivorMonthlyAmount: 2_000_000,
});

export function livingCostMonthly(
  settings: LivingCostSettings,
  year = BASIC_PENSION_BASE_YEAR,
  survivor = false,
  policy: Policy = DEFAULT_POLICY,
) {
  const retiredCouple = settings.reference === 'retiredCouple';
  const householdIndex = Math.min(
    6,
    Math.max(0, Math.round(settings.householdSize) - 1),
  );
  const custom = settings.reference === 'custom';
  const base = custom
    ? Math.max(0, settings.customMonthlyAmount ?? 0)
    : retiredCouple
      ? policy.livingCostBenchmarks.retiredCouple[settings.basis]
      : policy.livingCostBenchmarks.general[settings.basis][householdIndex];
  const baseYear = custom
    ? (settings.customBaseYear ?? BASIC_PENSION_BASE_YEAR)
    : retiredCouple
      ? policy.livingCostBenchmarks.retiredCouple.baseYear
      : policy.livingCostBenchmarks.general.baseYear;
  const elapsedYears = Math.max(0, year - baseYear);
  const coupleCost = Math.round(
    base *
      (1 + Math.max(0, settings.annualInflationRate) / 100) ** elapsedYears,
  );
  if (!survivor) return coupleCost;
  const survivorMode = settings.survivorMode ?? 'same_as_couple';
  if (survivorMode === 'ratio') {
    const enteredRatio = settings.survivorRatio ?? 75;
    const ratio = enteredRatio <= 1 ? enteredRatio : enteredRatio / 100;
    return Math.round(coupleCost * Math.min(1, Math.max(0, ratio)));
  }
  if (survivorMode === 'custom') {
    const survivorBaseYear =
      settings.survivorBaseYear ?? settings.customBaseYear ?? baseYear;
    const survivorElapsedYears = Math.max(0, year - survivorBaseYear);
    return Math.round(
      Math.max(0, settings.survivorMonthlyAmount ?? 0) *
        (1 + Math.max(0, settings.annualInflationRate) / 100) **
          survivorElapsedYears,
    );
  }
  return coupleCost;
}

export function livingCostLabel(settings: LivingCostSettings) {
  if (settings.reference === 'custom') return '우리 집 실제 생활비';
  if (settings.reference === 'retiredCouple') {
    return `노후 부부 ${settings.basis === 'minimum' ? '최소' : '적정'} 생활비`;
  }
  return `${settings.householdSize}인 일반 가구 ${
    settings.basis === 'minimum' ? '생계급여' : '기준중위소득'
  } 기준`;
}

export function basicPensionAtYear(
  result: SimulationResult,
  settings: BasicPensionSettings,
  year: number,
  policy: Policy = DEFAULT_POLICY,
) {
  const birthYearA = result.a.birthDate.getFullYear();
  const receivesA =
    settings.a && year - birthYearA >= 65 && year <= result.a.deathYear;
  const birthYearB = result.b?.birthDate.getFullYear() ?? null;
  const receivesB = Boolean(
    settings.b &&
    result.b &&
    birthYearB != null &&
    year - birthYearB >= 65 &&
    year <= result.b.deathYear,
  );
  const each =
    receivesA && receivesB
      ? policy.basicPension.coupleEachMonthly
      : policy.basicPension.standardMonthly;
  return {
    a: receivesA ? each : 0,
    b: receivesB ? each : 0,
  };
}

export function basicPensionBothAliveMonthly(
  result: SimulationResult,
  settings: BasicPensionSettings,
  policy: Policy = DEFAULT_POLICY,
) {
  const count = Number(settings.a) + Number(Boolean(result.b && settings.b));
  return count >= 2
    ? policy.basicPension.coupleEachMonthly * 2
    : count * policy.basicPension.standardMonthly;
}

const appendDetail = (detail: string | undefined, basic: number) =>
  basic > 0
    ? [detail, `기초연금 ${basic.toLocaleString('ko-KR')}원`]
        .filter(Boolean)
        .join(' · ')
    : detail;

export function addBasicPensionToResult(
  result: SimulationResult,
  settings: BasicPensionSettings,
  policy: Policy = DEFAULT_POLICY,
): SimulationResult {
  const bothAliveBasic = basicPensionBothAliveMonthly(result, settings, policy);
  const rows = result.rows.map((row) => {
    const basic = basicPensionAtYear(result, settings, row.year, policy);
    return {
      ...row,
      pensionA: row.pensionA + basic.a,
      pensionB: row.pensionB + basic.b,
      estimatedNetA: row.estimatedNetA + basic.a,
      estimatedNetB: row.estimatedNetB + basic.b,
      combined: row.combined + basic.a + basic.b,
      estimatedNetCombined: row.estimatedNetCombined + basic.a + basic.b,
      detailA: appendDetail(row.detailA, basic.a),
      detailB: appendDetail(row.detailB, basic.b),
    };
  });
  const firstDeathYear = result.b
    ? Math.min(result.a.deathYear, result.b.deathYear)
    : null;
  const afterDeathBasic =
    firstDeathYear == null
      ? 0
      : Object.values(
          basicPensionAtYear(result, settings, firstDeathYear + 1, policy),
        ).reduce((sum, value) => sum + value, 0);
  const survivorRows = result.survivorRows.map((row) => {
    const basic = Object.values(
      basicPensionAtYear(result, settings, row.year, policy),
    ).reduce((sum, value) => sum + value, 0);
    return {
      ...row,
      basicPension: basic,
      totalNetPension: row.totalNetPension + basic,
    };
  });
  const afterFirstDeath = survivorRows[0] ?? null;
  const basicEnabled = settings.a || Boolean(result.b && settings.b);
  return {
    ...result,
    bothAliveMonthly: result.bothAliveMonthly + bothAliveBasic,
    estimatedBothAliveNetMonthly:
      result.estimatedBothAliveNetMonthly + bothAliveBasic,
    afterFirstDeathMonthly:
      result.afterFirstDeathMonthly == null
        ? null
        : (afterFirstDeath?.totalNetPension ??
          result.afterFirstDeathMonthly + afterDeathBasic),
    survivorRows,
    afterFirstDeath,
    rows,
    warnings: basicEnabled
      ? [
          ...result.warnings,
          `기초연금은 ${policy.basicPension.baseYear}년 정책 기준액을 수급한다고 가정한 값입니다. 실제 지급액은 만 65세 도달 시점의 소득인정액, 국민연금액, 부부감액 및 당시 정책에 따라 달라집니다.`,
        ]
      : result.warnings,
  };
}
