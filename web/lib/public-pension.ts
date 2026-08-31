import type { SimulationResult } from './nps-engine';

export type BasicPensionSettings = {
  a: boolean;
  b: boolean;
};

export type LivingCostBasis = 'minimum' | 'median';
export type LivingCostReference = 'general' | 'retiredCouple';

export type LivingCostSettings = {
  reference: LivingCostReference;
  householdSize: number;
  basis: LivingCostBasis;
  annualInflationRate: number;
};

export const BASIC_PENSION_BASE_YEAR = 2026;
export const BASIC_PENSION_STANDARD_MONTHLY = 349_700;
export const BASIC_PENSION_COUPLE_EACH_MONTHLY = 279_760;

export const LIVING_COST_2026: Record<LivingCostBasis, number[]> = {
  minimum: [
    820_556, 1_343_773, 1_714_892, 2_078_316, 2_418_150, 2_737_905, 3_044_848,
  ],
  median: [
    2_564_238, 4_199_292, 5_359_036, 6_494_738, 7_556_719, 8_555_952, 9_515_150,
  ],
};

export const RETIRED_COUPLE_LIVING_COST_BASE_YEAR = 2024;
export const RETIRED_COUPLE_LIVING_COST_2024: Record<LivingCostBasis, number> =
  {
    minimum: 2_166_000,
    median: 2_981_000,
  };

export const defaultBasicPensionSettings = (): BasicPensionSettings => ({
  a: false,
  b: false,
});

export const defaultLivingCostSettings = (): LivingCostSettings => ({
  reference: 'general',
  householdSize: 4,
  basis: 'minimum',
  annualInflationRate: 2,
});

export function livingCostMonthly(
  settings: LivingCostSettings,
  year = BASIC_PENSION_BASE_YEAR,
) {
  const retiredCouple = settings.reference === 'retiredCouple';
  const householdIndex = Math.min(
    6,
    Math.max(0, Math.round(settings.householdSize) - 1),
  );
  const base = retiredCouple
    ? RETIRED_COUPLE_LIVING_COST_2024[settings.basis]
    : LIVING_COST_2026[settings.basis][householdIndex];
  const baseYear = retiredCouple
    ? RETIRED_COUPLE_LIVING_COST_BASE_YEAR
    : BASIC_PENSION_BASE_YEAR;
  const elapsedYears = Math.max(0, year - baseYear);
  return Math.round(
    base *
      (1 + Math.max(0, settings.annualInflationRate) / 100) ** elapsedYears,
  );
}

export function livingCostLabel(settings: LivingCostSettings) {
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
      ? BASIC_PENSION_COUPLE_EACH_MONTHLY
      : BASIC_PENSION_STANDARD_MONTHLY;
  return {
    a: receivesA ? each : 0,
    b: receivesB ? each : 0,
  };
}

export function basicPensionBothAliveMonthly(
  result: SimulationResult,
  settings: BasicPensionSettings,
) {
  const count = Number(settings.a) + Number(Boolean(result.b && settings.b));
  return count >= 2
    ? BASIC_PENSION_COUPLE_EACH_MONTHLY * 2
    : count * BASIC_PENSION_STANDARD_MONTHLY;
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
): SimulationResult {
  const bothAliveBasic = basicPensionBothAliveMonthly(result, settings);
  const rows = result.rows.map((row) => {
    const basic = basicPensionAtYear(result, settings, row.year);
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
          basicPensionAtYear(result, settings, firstDeathYear + 1),
        ).reduce((sum, value) => sum + value, 0);
  const basicEnabled = settings.a || Boolean(result.b && settings.b);
  return {
    ...result,
    bothAliveMonthly: result.bothAliveMonthly + bothAliveBasic,
    estimatedBothAliveNetMonthly:
      result.estimatedBothAliveNetMonthly + bothAliveBasic,
    afterFirstDeathMonthly:
      result.afterFirstDeathMonthly == null
        ? null
        : result.afterFirstDeathMonthly + afterDeathBasic,
    rows,
    warnings: basicEnabled
      ? [
          ...result.warnings,
          '기초연금은 2026년 기준액을 수급한다고 가정한 값입니다. 실제 지급액은 만 65세 도달 시점의 소득인정액, 국민연금액, 부부감액 및 당시 정책에 따라 달라집니다.',
        ]
      : result.warnings,
  };
}
