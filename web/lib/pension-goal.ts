import type {
  AdditionalPensionSummary,
  PersonResult,
  SimulationResult,
} from './nps-engine';

export type PensionGoalRange = {
  id: string;
  startAge: number;
  endAge: number | null;
  monthlyA: number;
  monthlyB: number;
};

export type PensionGoalPoint = {
  id: string;
  endAge: number | null;
  monthly: number;
};

export type PensionGoalTimelines = {
  a: PensionGoalPoint[];
  b: PensionGoalPoint[];
};

const effectiveEndYear = (
  point: PensionGoalPoint,
  birthYear: number,
  deathAge: number,
) => birthYear + (point.endAge ?? deathAge + 1);

export function pensionGoalTimelinesToRanges({
  timelines,
  birthYearA,
  birthYearB,
  currentAgeA,
  currentAgeB,
  deathAgeA,
  deathAgeB,
  spouseEnabled,
}: {
  timelines: PensionGoalTimelines;
  birthYearA: number;
  birthYearB: number;
  currentAgeA: number;
  currentAgeB: number;
  deathAgeA: number;
  deathAgeB: number;
  spouseEnabled: boolean;
}): PensionGoalRange[] {
  const startYear = Math.min(
    birthYearA + currentAgeA,
    spouseEnabled ? birthYearB + currentAgeB : Number.POSITIVE_INFINITY,
  );
  const finalYearExclusive = Math.max(
    birthYearA + deathAgeA + 1,
    spouseEnabled ? birthYearB + deathAgeB + 1 : 0,
  );
  const boundaries = new Set<number>([startYear, finalYearExclusive]);
  timelines.a.forEach((point) =>
    boundaries.add(effectiveEndYear(point, birthYearA, deathAgeA)),
  );
  if (spouseEnabled)
    timelines.b.forEach((point) =>
      boundaries.add(effectiveEndYear(point, birthYearB, deathAgeB)),
    );
  const years = [...boundaries]
    .filter((year) => year >= startYear && year <= finalYearExclusive)
    .sort((left, right) => left - right);
  const amountAt = (
    points: PensionGoalPoint[],
    year: number,
    birthYear: number,
    deathAge: number,
  ) => {
    if (year > birthYear + deathAge) return 0;
    const point = [...points]
      .sort(
        (left, right) =>
          effectiveEndYear(left, birthYear, deathAge) -
          effectiveEndYear(right, birthYear, deathAge),
      )
      .find((item) => effectiveEndYear(item, birthYear, deathAge) > year);
    return Math.max(0, point?.monthly ?? 0);
  };

  return years.slice(0, -1).map((year, index) => {
    const endYear = years[index + 1];
    return {
      id: `timeline-${year}-${endYear}`,
      startAge: year - birthYearA,
      endAge: endYear >= finalYearExclusive ? null : endYear - birthYearA,
      monthlyA: amountAt(timelines.a, year, birthYearA, deathAgeA),
      monthlyB: spouseEnabled
        ? amountAt(timelines.b, year, birthYearB, deathAgeB)
        : 0,
    };
  });
}

export function legacyGoalsToTimelines(
  goals: PensionGoalRange[],
  birthYearA: number,
  birthYearB: number,
): PensionGoalTimelines {
  const sorted = [...goals].sort(
    (left, right) => left.startAge - right.startAge,
  );
  const toPoints = (owner: 'a' | 'b') => {
    const offset = owner === 'b' ? birthYearA - birthYearB : 0;
    const points = sorted.map(
      (goal, index): PensionGoalPoint => ({
        id: `${owner}-legacy-${index}`,
        endAge: goal.endAge == null ? null : goal.endAge + offset,
        monthly: owner === 'a' ? goal.monthlyA : goal.monthlyB,
      }),
    );
    const first = sorted[0];
    if (first && first.startAge > 0)
      points.unshift({
        id: `${owner}-legacy-before-first`,
        endAge: first.startAge + offset,
        monthly: 0,
      });
    if (!points.some((point) => point.endAge == null))
      points.push({
        id: `${owner}-legacy-life`,
        endAge: null,
        monthly: points.at(-1)?.monthly ?? 0,
      });
    return points;
  };
  return { a: toPoints('a'), b: toPoints('b') };
}

export type GoalOwnerGuide = {
  owner: 'a' | 'b';
  ownerName: string;
  maximumMonthlyGap: number;
  firstGapYear: number;
  lastGapYear: number;
  requiredCapital: number;
  monthlyContribution: number;
  monthsUntilStart: number;
  suggestedAccountName: string | null;
  suggestedStartAge: number;
  startTimingLabel: string;
  ageAAtStart: number;
  ageBAtStart: number | null;
  savingYears: number;
  payoutYears: number;
};

export type GoalRangeAnalysis = {
  goal: PensionGoalRange;
  startYear: number;
  endYear: number;
  spouseStartAge: number | null;
  spouseEndAge: number | null;
  averageNetA: number;
  averageNetB: number;
  averageNetCombined: number;
  maximumGapA: number;
  maximumGapB: number;
  maximumCombinedGap: number;
  coverageRate: number;
  lateLifeGapExcluded: boolean;
  guides: GoalOwnerGuide[];
};

export type PensionGoalPlan = {
  ranges: GoalRangeAnalysis[];
  errors: string[];
  allGoalsMet: boolean;
};

export type HouseholdRetirementAnalysis = {
  retirementYear: number;
  ageA: number;
  ageB: number | null;
  essentialMonthlyAtRetirement: number;
  expectedMonthlyAtRetirement: number;
  monthlyGapAtRetirement: number;
  firstGapYear: number | null;
  lastGapYear: number | null;
  maximumMonthlyGap: number;
  requiredCapital: number;
  monthlyContribution: number;
  savingYears: number;
  payoutYears: number;
  suggestedEarlyAccount: {
    name: string;
    ownerName: string;
    currentStartYear: number;
    currentStartAge: number;
  } | null;
  combinedGoalAtRetirement: number;
  adjustableGoalAboveEssential: number;
};

const round = (value: number) => Math.round(value);

function presentValueForMonthlyIncome(
  monthlyIncome: number,
  months: number,
  annualNetReturnRate: number,
) {
  if (monthlyIncome <= 0 || months <= 0) return 0;
  const monthlyRate = Math.max(-0.99, annualNetReturnRate / 100) / 12;
  if (Math.abs(monthlyRate) < 1e-9) return monthlyIncome * months;
  return (
    monthlyIncome * ((1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate)
  );
}

function monthlySavingForTarget(
  targetCapital: number,
  months: number,
  annualNetReturnRate: number,
) {
  if (targetCapital <= 0 || months <= 0) return 0;
  const monthlyRate = Math.max(-0.99, annualNetReturnRate / 100) / 12;
  if (Math.abs(monthlyRate) < 1e-9) return targetCapital / months;
  return (
    (targetCapital * monthlyRate) / (Math.pow(1 + monthlyRate, months) - 1)
  );
}

function accountForOwner(
  accounts: AdditionalPensionSummary[],
  owner: 'a' | 'b',
  suggestedStartAge: number,
) {
  return (
    accounts
      .filter(
        (account) =>
          account.owner === owner &&
          account.enabled &&
          account.calculationMode === 'balance' &&
          suggestedStartAge >= (account.kind === 'annuityInsurance' ? 45 : 55),
      )
      .sort((left, right) => left.startYear - right.startYear)[0] ?? null
  );
}

export function employmentIncomeAtYear(
  person: PersonResult | null,
  year: number,
) {
  if (
    !person ||
    !person.enabled ||
    !person.employmentIncomeEnabled ||
    (person.preRetirementMonthlyIncome ?? 0) <= 0
  )
    return 0;
  const retirementYear =
    person.birthDate.getFullYear() + (person.retirementAge ?? 60);
  return year < retirementYear ? (person.preRetirementMonthlyIncome ?? 0) : 0;
}

export function analyzeHouseholdRetirement(
  goals: PensionGoalRange[],
  result: SimulationResult,
  annualNetReturnRate: number,
  essentialMonthlyAtYear: (year: number) => number,
  currentYear = new Date().getFullYear(),
): HouseholdRetirementAnalysis | null {
  const people = [result.a, result.b].filter((person): person is PersonResult =>
    Boolean(person?.enabled && person.employmentIncomeEnabled),
  );
  if (people.length === 0) return null;
  const retirementYear = Math.max(
    ...people.map(
      (person) => person.birthDate.getFullYear() + (person.retirementAge ?? 60),
    ),
  );
  const birthYearA = result.a.birthDate.getFullYear();
  const birthYearB = result.b?.birthDate.getFullYear() ?? null;
  const rowByYear = new Map(result.rows.map((row) => [row.year, row]));
  const finalYear = Math.max(
    result.a.deathYear,
    result.b?.deathYear ?? result.a.deathYear,
  );
  const gaps = Array.from(
    { length: Math.max(0, finalYear - retirementYear + 1) },
    (_, index) => {
      const year = retirementYear + index;
      const expected =
        (rowByYear.get(year)?.estimatedNetCombined ?? 0) +
        employmentIncomeAtYear(result.a, year) +
        employmentIncomeAtYear(result.b, year);
      return {
        year,
        gap: Math.max(0, essentialMonthlyAtYear(year) - expected),
      };
    },
  ).filter((item) => item.gap > 0);
  const firstGapYear = gaps[0]?.year ?? null;
  const lastGapYear = gaps.at(-1)?.year ?? null;
  const maximumMonthlyGap = gaps.length
    ? Math.max(...gaps.map((item) => item.gap))
    : 0;
  const payoutYears =
    firstGapYear == null || lastGapYear == null
      ? 0
      : lastGapYear - firstGapYear + 1;
  const requiredCapital = presentValueForMonthlyIncome(
    maximumMonthlyGap,
    payoutYears * 12,
    annualNetReturnRate,
  );
  const monthsUntilGap =
    firstGapYear == null ? 0 : Math.max(0, (firstGapYear - currentYear) * 12);
  const essentialAtRetirement = essentialMonthlyAtYear(retirementYear);
  const expectedAtRetirement =
    (rowByYear.get(retirementYear)?.estimatedNetCombined ?? 0) +
    employmentIncomeAtYear(result.a, retirementYear) +
    employmentIncomeAtYear(result.b, retirementYear);
  const ageAAtRetirement = retirementYear - birthYearA;
  const goalAtRetirement = [...goals]
    .sort((left, right) => left.startAge - right.startAge)
    .find(
      (goal) =>
        ageAAtRetirement >= goal.startAge &&
        (goal.endAge == null || ageAAtRetirement < goal.endAge),
    );
  const combinedGoalAtRetirement = goalAtRetirement
    ? goalAtRetirement.monthlyA + (result.b ? goalAtRetirement.monthlyB : 0)
    : 0;
  const suggestedEarlyAccount =
    result.additionalPensions
      .filter(
        (account) => account.enabled && account.startYear > retirementYear,
      )
      .sort((left, right) => left.startYear - right.startYear)[0] ?? null;
  return {
    retirementYear,
    ageA: ageAAtRetirement,
    ageB: birthYearB == null ? null : retirementYear - birthYearB,
    essentialMonthlyAtRetirement: essentialAtRetirement,
    expectedMonthlyAtRetirement: expectedAtRetirement,
    monthlyGapAtRetirement: Math.max(
      0,
      essentialAtRetirement - expectedAtRetirement,
    ),
    firstGapYear,
    lastGapYear,
    maximumMonthlyGap: round(maximumMonthlyGap),
    requiredCapital: round(requiredCapital),
    monthlyContribution: round(
      monthlySavingForTarget(
        requiredCapital,
        monthsUntilGap,
        annualNetReturnRate,
      ),
    ),
    savingYears: monthsUntilGap / 12,
    payoutYears,
    suggestedEarlyAccount: suggestedEarlyAccount
      ? {
          name: suggestedEarlyAccount.name,
          ownerName: suggestedEarlyAccount.ownerName,
          currentStartYear: suggestedEarlyAccount.startYear,
          currentStartAge: suggestedEarlyAccount.startAge,
        }
      : null,
    combinedGoalAtRetirement,
    adjustableGoalAboveEssential: Math.max(
      0,
      combinedGoalAtRetirement - essentialAtRetirement,
    ),
  };
}

export function analyzePensionGoals(
  goals: PensionGoalRange[],
  result: SimulationResult,
  annualNetReturnRate: number,
  currentYear = new Date().getFullYear(),
  includeLateLifeGap = false,
): PensionGoalPlan {
  const errors: string[] = [];
  const birthYearA = result.a.birthDate.getFullYear();
  const birthYearB = result.b?.birthDate.getFullYear() ?? null;
  const finalDeathYear = Math.max(
    result.a.deathYear,
    result.b?.deathYear ?? result.a.deathYear,
  );
  const sorted = [...goals].sort(
    (left, right) => left.startAge - right.startAge,
  );

  sorted.forEach((goal, index) => {
    if (goal.endAge != null && goal.endAge <= goal.startAge)
      errors.push(
        `${goal.startAge}세 구간의 종료 나이는 시작 나이보다 커야 합니다.`,
      );
    const previous = sorted[index - 1];
    if (
      previous &&
      (previous.endAge == null || previous.endAge > goal.startAge)
    )
      errors.push(
        `${previous.startAge}세 구간과 ${goal.startAge}세 구간이 겹칩니다.`,
      );
  });

  const rowByYear = new Map(result.rows.map((row) => [row.year, row]));
  const finalFinitePensionYear = (owner: 'a' | 'b') => {
    const years = result.additionalPensions
      .filter(
        (account) =>
          account.owner === owner && account.enabled && account.payoutYears > 0,
      )
      .map((account) => account.startYear + account.payoutYears - 1);
    return years.length > 0 ? Math.max(...years) : null;
  };
  const ranges = sorted.map((goal): GoalRangeAnalysis => {
    const startYear = birthYearA + goal.startAge;
    const requestedEndYear =
      goal.endAge == null ? finalDeathYear : birthYearA + goal.endAge - 1;
    const endYear = Math.max(
      startYear,
      Math.min(requestedEndYear, finalDeathYear),
    );
    let totalNetA = 0;
    let totalNetB = 0;
    let totalNetCombined = 0;
    let totalTarget = 0;
    let totalCovered = 0;
    let maximumGapA = 0;
    let maximumGapB = 0;
    let maximumCombinedGap = 0;
    const gapYearsA: number[] = [];
    const gapYearsB: number[] = [];
    const gapAByYear = new Map<number, number>();
    const gapBByYear = new Map<number, number>();

    for (let year = startYear; year <= endYear; year++) {
      const row = rowByYear.get(year);
      const aliveA = year <= result.a.deathYear;
      const aliveB = !!result.b && year <= result.b.deathYear;
      const targetA = aliveA ? Math.max(0, goal.monthlyA) : 0;
      const targetB = aliveB ? Math.max(0, goal.monthlyB) : 0;
      const actualA =
        (row?.estimatedNetA ?? 0) + employmentIncomeAtYear(result.a, year);
      const actualB =
        (row?.estimatedNetB ?? 0) + employmentIncomeAtYear(result.b, year);
      const targetCombined = targetA + targetB;
      const actualCombined = actualA + actualB;
      const gapA = Math.max(0, targetA - actualA);
      const gapB = Math.max(0, targetB - actualB);
      const combinedGap = Math.max(0, targetCombined - actualCombined);
      totalNetA += actualA;
      totalNetB += actualB;
      totalNetCombined += actualCombined;
      totalTarget += targetCombined;
      totalCovered += Math.min(targetCombined, actualCombined);
      maximumGapA = Math.max(maximumGapA, gapA);
      maximumGapB = Math.max(maximumGapB, gapB);
      maximumCombinedGap = Math.max(maximumCombinedGap, combinedGap);
      if (gapA > 0) {
        gapYearsA.push(year);
        gapAByYear.set(year, gapA);
      }
      if (gapB > 0) {
        gapYearsB.push(year);
        gapBByYear.set(year, gapB);
      }
    }

    const years = Math.max(1, endYear - startYear + 1);
    const guides: GoalOwnerGuide[] = [];
    let lateLifeGapExcluded = false;
    const addGuide = (
      owner: 'a' | 'b',
      ownerName: string,
      gapYears: number[],
      gapByYear: Map<number, number>,
      ownerBirthYear: number,
    ) => {
      if (gapYears.length === 0) return;
      const finalPensionYear = finalFinitePensionYear(owner);
      const guideGapYears =
        !includeLateLifeGap && finalPensionYear != null
          ? gapYears.filter((year) => year <= finalPensionYear)
          : gapYears;
      if (guideGapYears.length < gapYears.length) lateLifeGapExcluded = true;
      if (guideGapYears.length === 0) return;
      const maximumMonthlyGap = Math.max(
        ...guideGapYears.map((year) => gapByYear.get(year) ?? 0),
      );
      const firstGapYear = guideGapYears[0];
      const lastGapYear = guideGapYears[guideGapYears.length - 1];
      const payoutMonths = (lastGapYear - firstGapYear + 1) * 12;
      const requiredCapital = presentValueForMonthlyIncome(
        maximumMonthlyGap,
        payoutMonths,
        annualNetReturnRate,
      );
      const monthsUntilStart = Math.max(0, (firstGapYear - currentYear) * 12);
      const suggestedStartAge =
        Math.max(firstGapYear, currentYear) - ownerBirthYear;
      const account = accountForOwner(
        result.additionalPensions,
        owner,
        suggestedStartAge,
      );
      guides.push({
        owner,
        ownerName,
        maximumMonthlyGap,
        firstGapYear,
        lastGapYear,
        requiredCapital: round(requiredCapital),
        monthlyContribution: round(
          monthlySavingForTarget(
            requiredCapital,
            monthsUntilStart,
            annualNetReturnRate,
          ),
        ),
        monthsUntilStart,
        suggestedAccountName: account?.name ?? null,
        suggestedStartAge,
        startTimingLabel:
          firstGapYear <= currentYear
            ? '현재 개시 검토'
            : `${firstGapYear}년(${suggestedStartAge}세) 개시 검토`,
        ageAAtStart: firstGapYear - birthYearA,
        ageBAtStart: birthYearB == null ? null : firstGapYear - birthYearB,
        savingYears: monthsUntilStart / 12,
        payoutYears: lastGapYear - firstGapYear + 1,
      });
    };

    addGuide('a', result.a.name, gapYearsA, gapAByYear, birthYearA);
    if (result.b && birthYearB != null)
      addGuide('b', result.b.name, gapYearsB, gapBByYear, birthYearB);

    return {
      goal,
      startYear,
      endYear,
      spouseStartAge: birthYearB == null ? null : startYear - birthYearB,
      spouseEndAge: birthYearB == null ? null : endYear - birthYearB,
      averageNetA: round(totalNetA / years),
      averageNetB: round(totalNetB / years),
      averageNetCombined: round(totalNetCombined / years),
      maximumGapA: round(maximumGapA),
      maximumGapB: round(maximumGapB),
      maximumCombinedGap: round(maximumCombinedGap),
      coverageRate:
        totalTarget <= 0
          ? 100
          : Math.min(100, (totalCovered / totalTarget) * 100),
      lateLifeGapExcluded,
      guides,
    };
  });

  return {
    ranges,
    errors,
    allGoalsMet:
      errors.length === 0 &&
      ranges.every((range) => range.maximumCombinedGap <= 0),
  };
}
