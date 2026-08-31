import assert from 'node:assert/strict';
import test from 'node:test';
import {
  annuityPaymentEndDate,
  DEFAULT_POLICY,
  normalClaimAge,
  previewAdditionalPension,
  recommendedAnnuityPaymentTermYears,
  simulate,
  validatePolicy,
} from '../lib/nps-engine.ts';
import type { PersonInput } from '../lib/nps-engine.ts';
import type { AdditionalPensionInput } from '../lib/nps-engine.ts';
import {
  createEncryptedProfileFile,
  loadEncryptedSession,
  readEncryptedProfileFile,
  saveEncryptedSession,
} from '../lib/secure-session.ts';
import {
  analyzeHouseholdRetirement,
  analyzePensionGoals,
  legacyGoalsToTimelines,
  pensionGoalTimelinesToRanges,
} from '../lib/pension-goal.ts';
import {
  addBasicPensionToResult,
  basicPensionAtYear,
  livingCostMonthly,
} from '../lib/public-pension.ts';
import {
  buildIncomeTimelineEvents,
  incomeTimelineSnapshot,
} from '../lib/income-timeline.ts';
import { buildAiAnalysisMarkdown } from '../lib/ai-analysis-markdown.ts';

const person = (overrides: Partial<PersonInput> = {}): PersonInput => ({
  enabled: true,
  hasNps: true,
  name: '본인',
  birth: '19800101',
  anchoredMonthlyPension: 1_234_000,
  totalExpectedContribution: 120_000_000,
  expectedMonths: 360,
  currentMonthlyPremium: 430_000,
  periodStartYear: '2000',
  periodStartMonth: '01',
  periodEndYear: '2029',
  periodEndMonth: '12',
  continuationYears: 0,
  continuationPremium: 150_000,
  claimAge: 65,
  deathAge: 85,
  ...overrides,
});

void test('출생연도별 정상 수급연령 경계', () => {
  assert.equal(normalClaimAge(1952, DEFAULT_POLICY), 60);
  assert.equal(normalClaimAge(1953, DEFAULT_POLICY), 61);
  assert.equal(normalClaimAge(1968, DEFAULT_POLICY), 64);
  assert.equal(normalClaimAge(1969, DEFAULT_POLICY), 65);
});

void test('5년 조기는 30% 감액, 5년 연기는 36% 가산', () => {
  const b = person({ enabled: false, name: '배우자' });
  const early = simulate(person({ claimAge: 60 }), b, DEFAULT_POLICY);
  const deferred = simulate(person({ claimAge: 70 }), b, DEFAULT_POLICY);
  assert.equal(early.a.adjustmentFactor, 0.7);
  assert.equal(deferred.a.adjustmentFactor, 1.36);
});

void test('국민연금 물가연동은 수령 다음 해부터 월액을 복리 조정', () => {
  const b = person({ enabled: false, name: '배우자' });
  const indexed = simulate(person(), b, DEFAULT_POLICY, [], {
    enabled: true,
    annualRate: 2,
  });
  const fixed = simulate(person(), b, DEFAULT_POLICY);
  const firstYear = indexed.a.claimYear;
  const indexedFirst = indexed.rows.find((row) => row.year === firstYear);
  const indexedNext = indexed.rows.find((row) => row.year === firstYear + 1);
  const fixedNext = fixed.rows.find((row) => row.year === firstYear + 1);
  assert.equal(indexedFirst?.nationalPensionA, 1_234_000);
  assert.equal(indexedNext?.nationalPensionA, 1_258_680);
  assert.equal(fixedNext?.nationalPensionA, 1_234_000);
});

void test('임의계속가입 종료 전 수령은 거부', () => {
  const b = person({ enabled: false, name: '배우자' });
  assert.throws(
    () =>
      simulate(
        person({ continuationYears: 5, claimAge: 64 }),
        b,
        DEFAULT_POLICY,
      ),
    /종료 전/,
  );
});

void test('첫 사망 후 중복급여 중 큰 금액 자동 선택', () => {
  const a = person({ deathAge: 80 });
  const b = person({
    name: '배우자',
    birth: '19790222',
    anchoredMonthlyPension: 970_000,
    expectedMonths: 260,
    deathAge: 90,
  });
  const result = simulate(a, b, DEFAULT_POLICY);
  assert.ok(
    result.afterFirstDeathMonthly &&
      result.afterFirstDeathMonthly > b.anchoredMonthlyPension,
  );
  assert.match(result.survivorDecision ?? '', /유리/);
});

void test('국민연금 미가입 배우자도 가입자 사망 후 유족연금 수령', () => {
  const a = person({ deathAge: 80 });
  const b = person({
    name: '배우자',
    birth: '19790222',
    hasNps: false,
    anchoredMonthlyPension: 0,
    expectedMonths: 0,
    deathAge: 90,
  });
  const result = simulate(a, b, DEFAULT_POLICY);
  assert.equal(result.b?.selectedMonthlyPension, 0);
  assert.ok(result.afterFirstDeathMonthly && result.afterFirstDeathMonthly > 0);
  assert.match(result.survivorDecision ?? '', /유족연금 전액/);
});

const additional = (
  overrides: Partial<AdditionalPensionInput> = {},
): AdditionalPensionInput => ({
  id: 'p1',
  owner: 'a',
  enabled: true,
  kind: 'pensionSavings',
  name: '연금저축',
  calculationMode: 'balance',
  expectedBalance: 100_000_000,
  directMonthlyAmount: 0,
  startAge: 65,
  payoutYears: 10,
  annualReturnRate: 0,
  annualFeeRate: 0,
  accountYearsAtStart: 5,
  deferredRetirementTax: 0,
  ...overrides,
});

void test('납입 중인 연금보험은 계약 경과기간을 넘기는 다음 5년 단위 납입기간을 제안', () => {
  const asOf = new Date(2026, 7, 31);
  assert.equal(recommendedAnnuityPaymentTermYears('2020-08', true, asOf), 10);
  assert.equal(recommendedAnnuityPaymentTermYears('2024-08', true, asOf), 5);
  assert.equal(recommendedAnnuityPaymentTermYears('2020-08', false, asOf), 5);
  assert.equal(annuityPaymentEndDate('2020-08', 10), '2030-08');
});

void test('개인연금 적립금을 기간으로 나누어 국민연금과 합산', () => {
  const b = person({ enabled: false, name: '배우자' });
  const result = simulate(person(), b, DEFAULT_POLICY, [additional()]);
  const summary = result.additionalPensions[0];
  const preview = previewAdditionalPension(
    additional(),
    person(),
    DEFAULT_POLICY,
  );
  assert.equal(summary.grossMonthly, 833_333);
  assert.equal(preview.grossMonthly, summary.grossMonthly);
  assert.equal(result.bothAliveAdditionalMonthly, 833_333);
  assert.ok(result.bothAliveMonthly > result.a.selectedMonthlyPension);
  assert.ok(summary.firstYearEstimatedNetMonthly < summary.grossMonthly);
});

void test('적립금 방식은 개시를 늦추면 운용수익과 추가납입을 개시 잔액에 반영', () => {
  const b = person({ enabled: false, name: '배우자' });
  const immediate = simulate(person(), b, DEFAULT_POLICY, [
    additional({
      startAge: 60,
      balanceBaseAge: 60,
      annualReturnRateBeforeStart: 3,
      monthlyContributionUntilStart: 100_000,
    }),
  ]).additionalPensions[0];
  const delayed = simulate(person(), b, DEFAULT_POLICY, [
    additional({
      startAge: 65,
      balanceBaseAge: 60,
      annualReturnRateBeforeStart: 3,
      monthlyContributionUntilStart: 100_000,
    }),
  ]).additionalPensions[0];
  assert.equal(immediate.projectedStartBalance, 100_000_000);
  assert.ok((delayed.projectedStartBalance ?? 0) > 100_000_000);
  assert.equal(delayed.projectedContributionUntilStart, 6_000_000);
  assert.ok((delayed.projectedInvestmentGainBeforeStart ?? 0) > 0);
  assert.equal(
    delayed.projectedStartBalance,
    100_000_000 +
      (delayed.projectedContributionUntilStart ?? 0) +
      (delayed.projectedInvestmentGainBeforeStart ?? 0),
  );
  assert.ok(delayed.grossMonthly > immediate.grossMonthly);
});

void test('같은 연간 추가납입액도 월납과 연납의 실제 납입주기를 구분', () => {
  const b = person({ enabled: false, name: '배우자' });
  const monthly = simulate(person(), b, DEFAULT_POLICY, [
    additional({
      startAge: 65,
      balanceBaseAge: 60,
      annualReturnRateBeforeStart: 3,
      contributionFrequency: 'monthly',
      contributionAmount: 100_000,
    }),
  ]).additionalPensions[0];
  const annual = simulate(person(), b, DEFAULT_POLICY, [
    additional({
      startAge: 65,
      balanceBaseAge: 60,
      annualReturnRateBeforeStart: 3,
      contributionFrequency: 'annual',
      contributionAmount: 1_200_000,
    }),
  ]).additionalPensions[0];
  assert.ok(
    (monthly.projectedStartBalance ?? 0) > (annual.projectedStartBalance ?? 0),
  );
});

void test('퇴직연금 추가납입은 지정한 종료 나이까지만 반영하고 이후에는 운용만 지속', () => {
  const preview = previewAdditionalPension(
    additional({
      kind: 'dbdc',
      expectedBalance: 200_000_000,
      balanceBaseAge: 51,
      startAge: 65,
      contributionFrequency: 'annual',
      contributionAmount: 6_000_000,
      contributionEndAge: 60,
      annualReturnRateBeforeStart: 0,
      annualFeeRate: 0,
      payoutYears: 30,
    }),
    person(),
    DEFAULT_POLICY,
  );
  assert.equal(preview.projectedContributionUntilStart, 54_000_000);
  assert.equal(preview.projectedStartBalance, 254_000_000);
});

void test('금융기관 월 예상액 직접 입력과 수령기간 종료를 연도표에 반영', () => {
  const b = person({ enabled: false, name: '배우자' });
  const result = simulate(person(), b, DEFAULT_POLICY, [
    additional({
      calculationMode: 'monthly',
      directMonthlyAmount: 500_000,
      payoutYears: 5,
    }),
  ]);
  const start = result.additionalPensions[0].startYear;
  assert.equal(
    result.rows.find((x) => x.year === start)?.additionalPensionA,
    500_000,
  );
  assert.equal(
    result.rows.find((x) => x.year === start + 5)?.additionalPensionA,
    0,
  );
});

void test('연금저축 계좌 5년 요건과 퇴직급여 예외', () => {
  const b = person({ enabled: false, name: '배우자' });
  assert.throws(
    () =>
      simulate(person(), b, DEFAULT_POLICY, [
        additional({ accountOpenDate: '2042-01', accountYearsAtStart: 0 }),
      ]),
    /5년이 지난 뒤/,
  );
  assert.doesNotThrow(() =>
    simulate(person(), b, DEFAULT_POLICY, [
      additional({ accountOpenDate: '2040-01', accountYearsAtStart: 0 }),
    ]),
  );
  assert.doesNotThrow(() =>
    simulate(person(), b, DEFAULT_POLICY, [
      additional({
        kind: 'retirementIrp',
        accountYearsAtStart: 0,
        deferredRetirementTax: 5_000_000,
      }),
    ]),
  );
});

void test('Windows 전체 정책팩 스키마를 HTML 정책으로 변환', () => {
  const adapted = validatePolicy({
    schemaVersion: '1.0.0',
    policyPackId: 'TEST',
    publishedAt: '2026-01-01T00:00:00+09:00',
    normalClaimAges: [
      {
        birthYearFrom: 1969,
        birthYearToExclusive: null,
        normalClaimAgeMonths: 780,
      },
    ],
    pensionAdjustment: {
      earlyReductionPerMonth: { numerator: 5, denominator: 1000 },
      deferredBonusPerMonth: { numerator: 6, denominator: 1000 },
    },
    qualification: { minimumContributionMonths: 120 },
    duplicateBenefit: {
      unselectedSurvivorPensionAdditionalRate: {
        numerator: 30,
        denominator: 100,
      },
    },
    survivorBenefit: {
      pensionRates: [
        {
          contributionMonthsFrom: 240,
          contributionMonthsToExclusive: null,
          rate: { numerator: 60, denominator: 100 },
        },
      ],
    },
    notes: [],
  });
  assert.equal(adapted.policyId, 'TEST');
  assert.equal(adapted.normalClaimAges[0].age, 65);
  assert.equal(adapted.survivorAdditionalRate, 0.3);
});

void test('세션은 암호문만 저장하고 올바른 암호로만 복원', async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
  const privateData = { birth: '19800101', pension: 1_234_000 };
  await saveEncryptedSession(privateData, 'test-password');
  const stored = [...memory.values()][0];
  assert.ok(stored);
  assert.doesNotMatch(stored, /19800101|1234000/);
  assert.deepEqual(await loadEncryptedSession('test-password'), privateData);
  await assert.rejects(
    loadEncryptedSession('wrong-password'),
    /암호가 다르거나/,
  );
});

void test('암호화 JSON 프로필은 다른 세션에서도 파일만으로 복원', async () => {
  const privateData = {
    form: { birth: '19750222', expectedPension: 1_850_000 },
    policy: { id: 'TEST' },
  };
  const file = await createEncryptedProfileFile(privateData, 'file-password');
  const serialized = JSON.stringify(file);
  assert.equal(file.format, 'nps-simulator.encrypted-profile');
  assert.doesNotMatch(serialized, /19750222|1850000/);
  assert.deepEqual(
    await readEncryptedProfileFile(JSON.parse(serialized), 'file-password'),
    privateData,
  );
  await assert.rejects(
    readEncryptedProfileFile(JSON.parse(serialized), 'wrong-password'),
    /암호가 다르거나/,
  );
});

void test('부부 목표 월연금은 개인별 부족액과 합산 부족액을 계산', () => {
  const a = person();
  const b = person({
    name: '배우자',
    birth: '19820101',
    anchoredMonthlyPension: 900_000,
  });
  const result = simulate(a, b, DEFAULT_POLICY);
  const plan = analyzePensionGoals(
    [
      {
        id: 'goal',
        startAge: 65,
        endAge: 70,
        monthlyA: 1_800_000,
        monthlyB: 1_500_000,
      },
    ],
    result,
    2,
    2026,
  );
  assert.equal(plan.ranges.length, 1);
  assert.ok(plan.ranges[0].maximumGapA > 0);
  assert.ok(plan.ranges[0].maximumGapB > 0);
  assert.ok(plan.ranges[0].maximumCombinedGap > 0);
  assert.equal(plan.ranges[0].guides.length, 2);
});

void test('은퇴 전 근로소득은 목표를 충당하고 은퇴 연도부터 연금 공백을 계산', () => {
  const a = person({
    employmentIncomeEnabled: true,
    retirementAge: 60,
    preRetirementMonthlyIncome: 3_000_000,
  });
  const b = person({ enabled: false, name: '배우자' });
  const result = simulate(a, b, DEFAULT_POLICY);
  const plan = analyzePensionGoals(
    [
      {
        id: 'retirement-bridge',
        startAge: 55,
        endAge: 67,
        monthlyA: 2_000_000,
        monthlyB: 0,
      },
    ],
    result,
    2,
    2026,
  );
  const guide = plan.ranges[0].guides[0];
  assert.equal(guide.firstGapYear, 2040);
  assert.equal(guide.ageAAtStart, 60);
  assert.equal(guide.savingYears, 14);
  assert.ok(guide.monthlyContribution > 0);
});

void test('가구 은퇴 시 생활비 안전선 공백과 개인 목표 조정 범위를 별도 계산', () => {
  const a = person({
    employmentIncomeEnabled: true,
    retirementAge: 60,
    preRetirementMonthlyIncome: 6_000_000,
  });
  const b = person({
    name: '배우자',
    birth: '19820101',
    anchoredMonthlyPension: 900_000,
    employmentIncomeEnabled: true,
    retirementAge: 60,
    preRetirementMonthlyIncome: 4_000_000,
  });
  const result = simulate(a, b, DEFAULT_POLICY);
  const analysis = analyzeHouseholdRetirement(
    [
      {
        id: 'household-goal',
        startAge: 60,
        endAge: null,
        monthlyA: 2_000_000,
        monthlyB: 2_000_000,
      },
    ],
    result,
    2,
    () => 3_000_000,
    2026,
  );
  assert.ok(analysis);
  assert.equal(analysis.retirementYear, 2042);
  assert.equal(analysis.ageA, 62);
  assert.equal(analysis.ageB, 60);
  assert.equal(analysis.monthlyGapAtRetirement, 3_000_000);
  assert.equal(analysis.adjustableGoalAboveEssential, 1_000_000);
  assert.ok(analysis.monthlyContribution > 0);
});

void test('연도 이벤트는 은퇴와 연금 개시를 탭 단위 연도로 묶음', () => {
  const a = person({
    employmentIncomeEnabled: true,
    retirementAge: 60,
    preRetirementMonthlyIncome: 3_000_000,
  });
  const result = simulate(
    a,
    person({ enabled: false, name: '배우자' }),
    DEFAULT_POLICY,
  );
  const groups = buildIncomeTimelineEvents(result, 2026);
  const retirement = groups.find((group) => group.year === 2040);
  const npsStart = groups.find((group) => group.year === 2045);
  assert.ok(retirement?.events.some((event) => event.kind === 'retirement'));
  assert.ok(
    retirement?.events.some((event) => event.kind === 'householdRetirement'),
  );
  assert.ok(
    npsStart?.events.some((event) => event.kind === 'nationalPensionStart'),
  );
});

void test('선택 연도 소득은 근로소득과 연금을 합산해 생활비 차이를 계산', () => {
  const a = person({
    employmentIncomeEnabled: true,
    retirementAge: 60,
    preRetirementMonthlyIncome: 3_000_000,
  });
  const result = simulate(
    a,
    person({ enabled: false, name: '배우자' }),
    DEFAULT_POLICY,
  );
  const beforeRetirement = incomeTimelineSnapshot(result, 2039, 2_500_000);
  const retirementYear = incomeTimelineSnapshot(result, 2040, 2_500_000);
  assert.equal(beforeRetirement.employmentA, 3_000_000);
  assert.equal(beforeRetirement.gap, 0);
  assert.equal(retirementYear.employmentA, 0);
  assert.equal(retirementYear.gap, 2_500_000);
});

void test('기간형 연금 종료 후 부족분은 선택 전까지 보완안에서 제외', () => {
  const b = person({ enabled: false, name: '배우자' });
  const result = simulate(person(), b, DEFAULT_POLICY, [
    additional({
      calculationMode: 'monthly',
      directMonthlyAmount: 500_000,
      payoutYears: 5,
    }),
  ]);
  const goal = [
    {
      id: 'late-life',
      startAge: 65,
      endAge: null,
      monthlyA: 1_500_000,
      monthlyB: 0,
    },
  ];
  const defaultPlan = analyzePensionGoals(goal, result, 2, 2026, false);
  const includedPlan = analyzePensionGoals(goal, result, 2, 2026, true);
  assert.equal(defaultPlan.ranges[0].lateLifeGapExcluded, true);
  assert.equal(defaultPlan.ranges[0].guides.length, 0);
  assert.equal(includedPlan.ranges[0].guides.length, 1);
});

void test('부부 목표 슬라이드는 각자의 종료점을 합쳐 연도별 목표 구간으로 변환', () => {
  const ranges = pensionGoalTimelinesToRanges({
    timelines: {
      a: [
        { id: 'a65', endAge: 65, monthly: 0 },
        { id: 'alife', endAge: null, monthly: 1_500_000 },
      ],
      b: [
        { id: 'b67', endAge: 67, monthly: 500_000 },
        { id: 'blife', endAge: null, monthly: 1_000_000 },
      ],
    },
    birthYearA: 1975,
    birthYearB: 1979,
    currentAgeA: 51,
    currentAgeB: 47,
    deathAgeA: 85,
    deathAgeB: 90,
    spouseEnabled: true,
  });
  assert.equal(ranges[0].monthlyA, 0);
  assert.equal(ranges[0].monthlyB, 500_000);
  assert.ok(ranges.some((range) => range.monthlyA === 1_500_000));
  assert.ok(ranges.some((range) => range.monthlyB === 1_000_000));
  assert.equal(ranges.at(-1)?.endAge, null);
});

void test('기존 표 방식 목표는 배우자 출생연도 차이를 보정해 슬라이드로 이관', () => {
  const timelines = legacyGoalsToTimelines(
    [
      {
        id: 'legacy',
        startAge: 60,
        endAge: 65,
        monthlyA: 1_000_000,
        monthlyB: 800_000,
      },
    ],
    1975,
    1979,
  );
  assert.equal(timelines.a[0].endAge, 60);
  assert.equal(timelines.a[1].endAge, 65);
  assert.equal(timelines.b[0].endAge, 56);
  assert.equal(timelines.b[1].endAge, 61);
  assert.equal(timelines.b[1].monthly, 800_000);
});

void test('기초연금은 65세부터 적용하고 부부 동시 수급 시 각각 20% 감액', () => {
  const result = simulate(
    person({ birth: '19800101', deathAge: 90 }),
    person({ birth: '19800101', name: '배우자', deathAge: 95 }),
    DEFAULT_POLICY,
  );
  assert.deepEqual(basicPensionAtYear(result, { a: true, b: true }, 2044), {
    a: 0,
    b: 0,
  });
  assert.deepEqual(basicPensionAtYear(result, { a: true, b: true }, 2045), {
    a: 279_760,
    b: 279_760,
  });
  const adjusted = addBasicPensionToResult(result, { a: true, b: true });
  const row = adjusted.rows.find((item) => item.year === 2045);
  assert.equal(
    row?.estimatedNetCombined,
    (result.rows.find((item) => item.year === 2045)?.estimatedNetCombined ??
      0) + 559_520,
  );
});

void test('국가 생활비 기준은 가구원 수와 물가상승률로 연도별 증가', () => {
  const settings = {
    reference: 'general' as const,
    householdSize: 4,
    basis: 'minimum' as const,
    annualInflationRate: 2,
  };
  assert.equal(livingCostMonthly(settings, 2026), 2_078_316);
  assert.equal(livingCostMonthly(settings, 2027), 2_119_882);
  assert.equal(
    livingCostMonthly({ ...settings, basis: 'median' }, 2026),
    6_494_738,
  );
});

void test('노후 부부 생활비는 최소·적정 조사 기준을 선택해 반영', () => {
  const settings = {
    reference: 'retiredCouple' as const,
    householdSize: 4,
    basis: 'minimum' as const,
    annualInflationRate: 0,
  };
  assert.equal(livingCostMonthly(settings, 2026), 2_166_000);
  assert.equal(
    livingCostMonthly({ ...settings, basis: 'median' }, 2026),
    2_981_000,
  );
  assert.equal(
    livingCostMonthly({ ...settings, annualInflationRate: 2 }, 2026),
    2_253_506,
  );
});

void test('AI 상담용 Markdown은 계산 결과를 담고 생년월일 전체를 제외', () => {
  const result = simulate(
    person({
      birth: '19800101',
      retirementAge: 60,
      employmentIncomeEnabled: true,
      preRetirementMonthlyIncome: 5_000_000,
    }),
    person({ enabled: false, hasNps: false, name: '배우자' }),
    DEFAULT_POLICY,
  );
  const markdown = buildAiAnalysisMarkdown({
    result,
    policy: DEFAULT_POLICY,
    npsInflation: { enabled: true, annualRate: 2.1 },
    basicPension: { a: false, b: false },
    livingCost: {
      reference: 'retiredCouple',
      householdSize: 2,
      basis: 'median',
      annualInflationRate: 2,
    },
    plannerNetReturnRate: 2,
    generatedAt: new Date('2026-08-31T00:00:00.000Z'),
  });

  assert.match(markdown, /# AI 상담용 부부 연금·은퇴 현황/);
  assert.match(markdown, /## AI에게 요청할 분석/);
  assert.match(markdown, /본인 60세/);
  assert.match(markdown, /노후 부부 적정 생활비/);
  assert.doesNotMatch(markdown, /19800101/);
});
