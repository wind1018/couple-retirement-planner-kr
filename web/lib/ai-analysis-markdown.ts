import type {
  NationalPensionInflationSettings,
  Policy,
  SimulationResult,
} from './nps-engine.ts';
import {
  addBasicPensionToResult,
  type BasicPensionSettings,
  type LivingCostSettings,
  livingCostLabel,
  livingCostMonthly,
} from './public-pension.ts';
import { buildIncomeTimelineEvents } from './income-timeline.ts';
import {
  buildHouseholdCashflow,
  resolveAssetUsePlan,
  resolveDebtServiceAtYear,
  type GapPeriod,
  type HouseholdCashflowAnalysis,
  type HouseholdFinanceSettings,
} from './household-cashflow.ts';
import { DEFAULT_REAL_ESTATE_COST_POLICY } from './real-estate-costs.ts';

export type AiAnalysisMarkdownInput = {
  result: SimulationResult;
  policy: Policy;
  npsInflation: NationalPensionInflationSettings;
  basicPension: BasicPensionSettings;
  livingCost: LivingCostSettings;
  plannerNetReturnRate: number;
  householdFinance: HouseholdFinanceSettings;
  includeLateLifeGap: boolean;
  generatedAt?: Date;
};

const pensionKindLabels: Record<
  SimulationResult['additionalPensions'][number]['kind'],
  string
> = {
  pensionSavings: '연금저축',
  irpPersonal: '개인형 IRP',
  retirementIrp: '퇴직급여 IRP',
  dbdc: 'DB·DC 퇴직연금',
  annuityInsurance: '연금보험',
};

const contributionFrequencyLabels: Record<string, string> = {
  none: '추가납입 없음',
  monthly: '월납',
  quarterly: '분기납',
  semiannual: '반기납',
  annual: '연납',
};

const assetTypeLabels: Record<string, string> = {
  cash: '현금·예금',
  financial: '금융·투자자산',
  primary_home: '실거주 주택',
  rental_property: '임대 부동산',
  officetel: '오피스텔',
  jeonse_deposit: '회수 가능한 전세보증금',
  other: '기타 자산',
};

const liquidityLabels: Record<string, string> = {
  liquid: '즉시 활용 가능',
  sellable: '매각 후 활용 가능',
  illiquid: '당장 현금화 어려움',
  exclude: '은퇴재원에서 제외',
};

const phaseLabels: Record<string, string> = {
  working: '은퇴 전',
  partial_retirement: '한 사람 은퇴 후',
  full_retirement: '가구 은퇴 후',
  survivor: '첫 사망 이후',
  ended: '분석 종료',
};

const surplusTypeLabels: Record<string, string> = {
  deposit: '예금·현금성 운용',
  investment: '투자자산 운용',
};

const surplusReturnModeLabels: Record<string, string> = {
  reinvest: '수익 재투자',
  cash_income: '수익을 생활비 현금으로 사용',
};

const survivorLivingCostModeLabels: Record<string, string> = {
  same_as_couple: '부부 생활비와 동일',
  ratio: '부부 생활비의 지정 비율',
  custom: '생존자 월 생활비 직접 입력',
};

const debtRepaymentLabels: Record<string, string> = {
  interest_only: '만기일시상환',
  amortizing: '원리금 분할상환',
  manual_monthly_payment: '월 상환액 직접 입력',
};

const taxEstimateStatusLabels: Record<string, string> = {
  complete: '세후 추정 완료',
  partial: '일부 세금만 반영',
  unknown: '세금 미입력',
};

const money = (value: number) =>
  `${Math.round(value).toLocaleString('ko-KR')}원`;
const signedMoney = (surplus: number, gap: number) =>
  gap > 0 ? `-${money(gap)}` : `+${money(surplus)}`;
const yesNo = (value: boolean) => (value ? '예' : '아니요');
const cell = (value: string | number) =>
  String(value).replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
const agePair = (ageA: number, ageB: number | null) =>
  `본인 ${ageA}세${ageB == null ? '' : ` · 배우자 ${ageB}세`}`;

function personLines(
  label: '본인' | '배우자',
  person: SimulationResult['a'] | SimulationResult['b'],
  currentYear: number,
) {
  if (!person?.enabled) return [`### ${label}`, '', '- 등록하지 않음', ''];
  const birthYear = person.birthDate.getFullYear();
  return [
    `### ${label}`,
    '',
    `- 출생연도 / 기준연도 나이: ${birthYear}년 / ${currentYear - birthYear}세`,
    `- 근로·사업소득 참여: ${yesNo(Boolean(person.employmentIncomeEnabled))}`,
    `- 은퇴 전 세후 월소득: ${money(person.preRetirementMonthlyIncome ?? 0)}`,
    `- 예상 은퇴: ${birthYear + (person.retirementAge ?? 60)}년 (${person.retirementAge ?? 60}세)`,
    `- 국민연금 가입 가정: ${yesNo(person.hasNps)}`,
    `- 국민연금 선택 개시: ${person.claimYear}년 (${person.claimAge}세)`,
    `- 국민연금 선택 월액(개시 시점 기준): ${money(person.selectedMonthlyPension)}`,
    `- 국민연금 정상 수령 월액: ${money(person.normalMonthlyPension)}`,
    `- 국민연금 예상 가입기간: ${person.creditedMonths}개월`,
    `- 임의계속가입 추가 납부 추정: ${money(person.additionalContribution)}`,
    `- 분석상 예상 사망 나이: ${person.deathAge}세`,
    '',
  ];
}

const periodStats = (periods: GapPeriod[]) => ({
  firstYear: periods[0]?.startYear ?? null,
  lastYear: periods.at(-1)?.endYear ?? null,
  maximumMonthlyGap: periods.length
    ? Math.max(...periods.map((period) => period.maxMonthlyGap))
    : 0,
  presentValue: periods.reduce(
    (sum, period) => sum + period.exactPresentValue,
    0,
  ),
});

function fundingLines(
  analysis: HouseholdCashflowAnalysis,
  includeLateLifeGap: boolean,
) {
  const preDeathBeforeAssets = periodStats(
    analysis.gapPeriodsBeforeAssets.filter(
      (period) => period.phase !== 'survivor',
    ),
  );
  const allBeforeAssets = periodStats(analysis.gapPeriodsBeforeAssets);
  const preDeathAfterAssets = periodStats(
    analysis.gapPeriods.filter((period) => period.phase !== 'survivor'),
  );
  const lateLifeAfterAssets = periodStats(analysis.lateLifeGapPeriods);
  const allAfterAssets = periodStats(analysis.gapPeriods);
  const selectedAfterAssets = includeLateLifeGap
    ? allAfterAssets
    : preDeathAfterAssets;
  const span = (stats: ReturnType<typeof periodStats>) =>
    stats.firstYear == null
      ? '없음'
      : `${stats.firstYear}~${stats.lastYear}년`;
  return [
    '### 자산 활용 전 생활비 공백',
    '',
    `- 첫 사망 이전: ${span(preDeathBeforeAssets)} · 최대 월 ${money(preDeathBeforeAssets.maximumMonthlyGap)} · 현재가치 ${money(preDeathBeforeAssets.presentValue)}`,
    `- 전체 생애: ${span(allBeforeAssets)} · 최대 월 ${money(allBeforeAssets.maximumMonthlyGap)} · 현재가치 ${money(allBeforeAssets.presentValue)}`,
    '',
    '### 등록 자산 활용 후 실제 미충당 위험',
    '',
    `- 첫 사망 이전 기본계획: ${span(preDeathAfterAssets)} · 최대 월 ${money(preDeathAfterAssets.maximumMonthlyGap)} · 현재가치 ${money(preDeathAfterAssets.presentValue)}`,
    `- 첫 사망 이후 후기 위험: ${span(lateLifeAfterAssets)} · 최대 월 ${money(lateLifeAfterAssets.maximumMonthlyGap)} · 현재가치 ${money(lateLifeAfterAssets.presentValue)}`,
    `- 전체 생애: ${span(allAfterAssets)} · 최대 월 ${money(allAfterAssets.maximumMonthlyGap)} · 현재가치 ${money(allAfterAssets.presentValue)}`,
    `- 현재 선택한 필요재원 범위: ${includeLateLifeGap ? '전체 생애' : '첫 사망 이전 기본계획'} · 첫 미충당연도 ${selectedAfterAssets.firstYear ?? '없음'} · 현재가치 ${money(selectedAfterAssets.presentValue)}`,
    '',
    '### 현재가치·누계 참고값',
    '',
    `- 선택 범위에서 자산을 쓰지 않을 때 부족액 현재가치: ${money(analysis.exactGapPresentValue)}`,
    `  - 기준연도: ${analysis.baseYear}년`,
    `  - 세후 할인율: 연 ${analysis.discountRate}%`,
    '  - 계산법: 연도별 실제 월 부족액 × 12를 기준연도로 할인한 합계',
    `- 선택 범위에서 최대 부족액 지속 가정 스트레스 필요재원: ${money(analysis.conservativeStressCapital)}`,
    `  - 기준연도: ${analysis.baseYear}년`,
    `  - 세후 할인율: 연 ${analysis.discountRate}%`,
    '- 스트레스 값은 기본 필요재원이 아니라 보수적 상한 비교값',
    `- 계획에 따른 전체 자산 인출액: ${money(analysis.finance.plannedAssetWithdrawals)}`,
    `- 생활비 현금으로 받은 자산 운용수익 합계: ${money(analysis.finance.plannedAssetReturnIncome)}`,
    `- 자산 운용수익 재투자 합계: ${money(analysis.finance.plannedAssetReinvestedReturns)}`,
    `- 주택 교체 후 생성된 운용자금: ${money(analysis.finance.housingMoveInvestableSurplus)}`,
    `- 새 주택 구입 별도 필요자금: ${money(analysis.finance.housingPurchaseFundingShortfall)}`,
    `- 선택 범위에서 자산 인출 후 남은 부족액 현재가치: ${money(analysis.exactGapPresentValueAfterAssets)}`,
    `- 마지막 분석연도 남은 활용 예정 자산: ${money(analysis.finance.remainingPlannedAssetsAtEnd)}`,
    `- 첫 부족 전 월 적립 추정: ${money(analysis.suggestedMonthlyContribution)}`,
  ];
}

export function buildAiAnalysisMarkdown({
  result: sourceResult,
  policy,
  npsInflation,
  basicPension,
  livingCost,
  plannerNetReturnRate,
  householdFinance,
  includeLateLifeGap,
  generatedAt = new Date(),
}: AiAnalysisMarkdownInput) {
  const result = addBasicPensionToResult(sourceResult, basicPension, policy);
  const currentYear = generatedAt.getFullYear();
  const generatedDate = generatedAt.toISOString().slice(0, 10);
  const livingLabel = livingCostLabel(livingCost);
  const realEstatePolicy =
    householdFinance.realEstateCostPolicy ??
    DEFAULT_REAL_ESTATE_COST_POLICY;
  const cashflow = buildHouseholdCashflow({
    result,
    livingCost,
    finance: householdFinance,
    annualNetReturnRate: plannerNetReturnRate,
    includeLateLifeGap,
    currentYear,
    policy,
  });
  const eventByYear = new Map(
    buildIncomeTimelineEvents(result, currentYear).map((group) => [
      group.year,
      group.events.map((event) => event.title).join(', '),
    ]),
  );
  const assetById = new Map(
    householdFinance.assets.map((asset) => [asset.id, asset]),
  );
  const transactionSummary = (
    row: HouseholdCashflowAnalysis['rows'][number],
  ) =>
    row.assetTransactionDetails
      .map((detail) => {
        const asset = assetById.get(detail.assetId);
        const isJeonseDeposit = asset?.type === 'jeonse_deposit';
        const disposition = isJeonseDeposit ? '보증금 회수' : '매각';
        const saleCostLabel = isJeonseDeposit ? '회수·중개비용' : '매도중개';
        const costs = [
          detail.saleBrokerage == null
            ? ''
            : `${saleCostLabel} ${money(detail.saleBrokerage)}`,
          detail.capitalGainsTaxes == null ||
          (isJeonseDeposit && detail.capitalGainsTaxes === 0)
            ? ''
            : `${isJeonseDeposit ? '자동계산상 ' : ''}양도세·지방세 ${money(detail.capitalGainsTaxes)}`,
          detail.purchaseBrokerage == null
            ? ''
            : `매수중개 ${money(detail.purchaseBrokerage)}`,
          detail.acquisitionTaxes == null
            ? ''
            : `취득관련세금 ${money(detail.acquisitionTaxes)}`,
          (detail.linkedDebtPayoff ?? 0) <= 0
            ? ''
            : `연결대출 자동상환 ${money(detail.linkedDebtPayoff ?? 0)}`,
        ]
          .filter(Boolean)
          .join('·');
        const summary = detail.purchasedAssetName
          ? `${detail.soldAssetName} ${disposition}→${detail.purchasedAssetName} 구입, 잔여 ${money(detail.investableSurplus)}`
          : `${detail.soldAssetName} ${disposition} ${money(detail.saleProceeds)}`;
        return `${summary}${costs ? ` (${costs}${detail.roughEstimatePolicyId ? `, ${detail.roughEstimatePolicyId} 참고 추정` : ''})` : ''}`;
      })
      .join(', ');
  const firstAssetUseRow = cashflow.rows.find(
    (row) => row.assetWithdrawal > 0,
  );
  const firstGapBeforeAssetRow = cashflow.rows.find(
    (row) => row.monthlyGapBeforeAsset > 0,
  );
  const firstUnfundedRow = cashflow.rows.find((row) => row.monthlyGap > 0);
  const cashDepletionRow = cashflow.rows.find(
    (row, index, rows) =>
      row.cashAndFinancialAssetBalance <= 0 &&
      index > 0 &&
      rows[index - 1].cashAndFinancialAssetBalance > 0,
  );
  const eventSummary = (
    row: HouseholdCashflowAnalysis['rows'][number],
    includeDerivedMarkers = false,
  ) => {
    const markers = [eventByYear.get(row.year), transactionSummary(row)];
    if (includeDerivedMarkers) {
      if (row.year === firstGapBeforeAssetRow?.year)
        markers.push('자산 활용 전 생활비 부족 시작');
      if (row.year === firstAssetUseRow?.year)
        markers.push('생활비용 자산 원금 인출 시작');
      if (row.year === firstUnfundedRow?.year)
        markers.push('자산 활용 후에도 미충당 발생');
      if (row.year === cashDepletionRow?.year)
        markers.push('현금·금융자산 잔액 소진');
      if (row.year === cashflow.rows.at(-1)?.year) markers.push('분석 종료');
    }
    return markers.filter(Boolean).join(', ');
  };
  const recurringCashNet = (
    row: HouseholdCashflowAnalysis['rows'][number],
  ) => row.householdCashIncomeAfterDebt - row.propertyHoldingTax;
  const timelineRows = cashflow.rows.map((row) => {
    return `| ${row.year} | ${cell(agePair(row.ageA, row.ageB))} | ${phaseLabels[row.phase] ?? row.phase} | ${cell(eventSummary(row))} | ${money(row.employmentIncome)} | ${money(row.nationalPension)} | ${money(row.basicPension)} | ${money(row.privatePension)} | ${money(row.rentalIncomeNet)} | ${money(row.otherIncome)} | ${money(row.debtService)} | ${money(row.propertyHoldingTax)} | ${money(recurringCashNet(row))} | ${money(row.monthlyGapBeforeAsset)} | ${money(row.assetReturnIncome)} | ${money(row.assetWithdrawal)} | ${money(row.monthlyGap)} | ${money(row.cashAndFinancialAssetBalance)} | ${money(row.remainingRetirementAssets)} | ${money(row.replacementHousingValue)} | ${money(row.livingCost)} | ${signedMoney(row.monthlySurplus, row.monthlyGap)} |`;
  });
  const keyYears = new Set<number>([
    currentYear,
    ...eventByYear.keys(),
    ...cashflow.rows
      .filter((row) => row.assetTransactionDetails.length > 0)
      .map((row) => row.year),
    ...[
      firstGapBeforeAssetRow?.year,
      firstAssetUseRow?.year,
      firstUnfundedRow?.year,
      cashDepletionRow?.year,
      cashflow.rows.at(-1)?.year,
    ].filter((year): year is number => year != null),
  ]);
  const keyEventRows = cashflow.rows
    .filter((row) => keyYears.has(row.year))
    .map(
      (row) =>
        `| ${row.year} | ${cell(agePair(row.ageA, row.ageB))} | ${phaseLabels[row.phase] ?? row.phase} | ${cell(eventSummary(row, true) || '주요 계산 시점')} | ${money(recurringCashNet(row))} | ${money(row.livingCost)} | ${money(row.monthlyGapBeforeAsset)} | ${money(row.assetWithdrawal)} | ${money(row.monthlyGap)} | ${money(row.cashAndFinancialAssetBalance)} |`,
    );
  const additionalRows = result.additionalPensions.map((account) => {
    const contributionFrequency =
      contributionFrequencyLabels[account.contributionFrequency ?? 'none'] ??
      account.contributionFrequency ??
      '추가납입 없음';
    const contribution =
      account.contributionFrequency === 'none' ||
      (account.contributionAmount ?? 0) <= 0
        ? '없음'
        : `${contributionFrequency} ${money(account.contributionAmount ?? 0)}, ${account.contributionEndAge ?? account.startAge}세까지`;
    return `| ${cell(account.ownerName)} | ${cell(pensionKindLabels[account.kind])} | ${cell(account.name)} | ${money(account.expectedBalance)} | ${cell(contribution)} | ${account.startYear}년 (${account.startAge}세) | ${account.payoutYears}년 | ${account.annualReturnRateBeforeStart ?? 0}% / ${account.annualReturnRate}% | ${account.annualFeeRate}% | ${account.projectedStartBalance == null ? '직접 월액 입력' : money(account.projectedStartBalance)} | ${money(account.firstYearEstimatedNetMonthly)} | ${taxEstimateStatusLabels[account.taxEstimateStatus] ?? account.taxEstimateStatus} |`;
  });
  const assetRows = householdFinance.assets.map((asset) => {
    const plan = resolveAssetUsePlan(asset, currentYear);
    const planLabel =
      plan.mode === 'cover_gap'
        ? '생활비 부족 자동 보충'
        : plan.mode === 'fixed_monthly'
          ? `매월 ${money(plan.monthlyAmount ?? 0)} 인출`
          : '보유만 함';
    const move = asset.housingMovePlan;
    const moveLabel = move?.enabled
      ? `${move.purchaseYear}년 ${move.replacementName} ${money(move.purchasePrice)}에 구입 · 매각~구입 대기수익률 연 ${move.interimAnnualReturnRate ?? 0}% · 새 주택 가치변동률 연 ${move.replacementAnnualAppreciationRate ?? 0}% · 잔여금 ${move.surplusName}(${surplusTypeLabels[move.surplusType] ?? move.surplusType}, 연 ${move.surplusAnnualReturnRate}%, ${surplusReturnModeLabels[move.surplusReturnMode] ?? move.surplusReturnMode})`
      : '없음';
    const dispositionLabel =
      asset.type === 'jeonse_deposit' ? '보증금 회수' : '매각';
    const saleLabel = asset.salePlan?.enabled
      ? `${asset.salePlan.year}년 ${dispositionLabel} · ${dispositionLabel} 전 가치변동률 연 ${asset.annualAppreciationRate ?? 0}% · ${asset.salePlan.autoCostSettings?.enabled ? (asset.type === 'jeonse_deposit' ? '회수·중개비용 자동 참고 추정' : '세금·중개보수 자동 참고 추정') : '비용 직접 입력'}`
      : '없음';
    const moveCostLabel = move?.purchaseAutoCostSettings?.enabled
      ? '취득세·중개보수 자동 참고 추정'
      : '취득비용 직접 입력';
    const holdingTaxLabel = asset.holdingTax?.enabled
      ? `공시가격 ${money(asset.holdingTax.assessedValue || asset.currentValue * 0.7)} · 가구 ${asset.holdingTax.householdHomeCount}주택 · ${asset.holdingTax.oneHouseholdOneHome ? '1세대 1주택 가정' : '일반 가정'} · ${asset.holdingTax.jointOwnership ? `공동명의 본인 ${asset.holdingTax.ownerAShareRate}%` : `단독명의 ${asset.holdingTax.soleOwner === 'a' ? '본인' : '배우자'}`} · ${asset.holdingTax.includeUrbanAreaTax ? '도시지역분 포함' : '도시지역분 제외'} · ${asset.holdingTax.includeInCashflow ? '전체 분석 반영' : '계산만 하고 분석 미반영'}${asset.type === 'officetel' ? ' · 주거용 오피스텔로 가정' : ''}`
      : '계산 안 함';
    const rentalLabel = asset.rental?.enabled
      ? `세전 월 ${money(asset.rental.grossMonthlyRent)} · 공실률 ${asset.rental.vacancyRate ?? '미입력'}% · 운영비율 ${asset.rental.operatingExpenseRate ?? '미입력'}% · 세율 ${asset.rental.estimatedTaxRate ?? '미입력'}% · ${asset.rental.startYear ?? currentYear}년부터${asset.rental.endYear == null ? '' : ` ${asset.rental.endYear}년까지`}`
      : '없음';
    return `| ${cell(asset.name)} | ${assetTypeLabels[asset.type] ?? asset.type} | ${money(asset.currentValue)} | ${liquidityLabels[asset.retirementLiquidity] ?? asset.retirementLiquidity} | ${cell(saleLabel)} | ${cell(`${moveLabel}${move?.enabled ? ` · ${moveCostLabel}` : ''}`)} | ${cell(`${planLabel}${plan.mode === 'hold' ? '' : ` · ${plan.startYear}년부터${plan.endYear == null ? '' : ` ${plan.endYear}년까지`} · 최소 ${money(plan.reserveAmount ?? 0)} 보유`}`)} | ${cell(holdingTaxLabel)} | ${cell(rentalLabel)} |`;
  });
  const debtRows = householdFinance.debts.map((debt) => {
    const linkedAsset = householdFinance.assets.find(
      (asset) => asset.id === debt.linkedAssetId,
    );
    const linkedAssetLabel = linkedAsset
      ? `${linkedAsset.name}${debt.payoffOnLinkedAssetSale ? ` · ${linkedAsset.salePlan?.enabled ? `${linkedAsset.salePlan.year}년` : '매각연도 미입력'} 자동상환` : ' · 자동상환 안 함'}`
      : '없음';
    const debtService = resolveDebtServiceAtYear(
      debt,
      currentYear,
      currentYear,
      householdFinance.assets,
    );
    const monthlyPaymentLabel = debtService.incomplete
      ? '계산정보 미입력'
      : `${money(debtService.amount)}${debt.repaymentType === 'manual_monthly_payment' ? ' (직접 입력)' : ' (자동계산)'}`;
    const maturityLabel = debt.maturityYear
      ? `${debt.maturityYear}년`
      : debt.remainingMonths != null && debt.remainingMonths > 0
        ? `남은 ${debt.remainingMonths}개월`
        : '미입력';
    return `| ${cell(debt.name)} | ${money(debt.principal)} | ${debt.repaymentType == null ? '미입력' : (debtRepaymentLabels[debt.repaymentType] ?? debt.repaymentType)} | ${debt.annualInterestRate == null ? '미입력' : `${debt.annualInterestRate}%`} | ${monthlyPaymentLabel} | ${maturityLabel} | ${cell(linkedAssetLabel)} |`;
  });
  const gapRows = cashflow.gapPeriods.map(
    (period, index) =>
      `| ${index + 1} | ${period.startYear} | ${period.endYear} | ${phaseLabels[period.phase] ?? period.phase} | ${money(period.maxMonthlyGap)} | ${money(period.exactPresentValue)} |`,
  );
  const hasAdditionalPension = result.additionalPensions.length > 0;
  const hasAssets = householdFinance.assets.length > 0;
  const hasDebts = householdFinance.debts.length > 0;
  const hasRentalIncome = cashflow.finance.monthlyRentalIncomeGrossAtBaseYear > 0;
  const hasHoldingTax = householdFinance.assets.some(
    (asset) => asset.holdingTax?.enabled,
  );
  const hasResidentialRealEstate = householdFinance.assets.some((asset) =>
    ['primary_home', 'rental_property', 'officetel'].includes(asset.type),
  );
  const hasCashAssets = householdFinance.assets.some(
    (asset) => asset.type === 'cash' || asset.type === 'financial',
  );
  const hasSurvivorLivingCost =
    (livingCost.survivorMode ?? 'same_as_couple') !== 'same_as_couple';
  const completenessRows = [
    '| 본인 근로소득·은퇴 | 완료 | 입력값 반영 | 실제 은퇴시점 변경 여부 확인 |',
    `| 배우자 근로소득·은퇴 | ${result.b ? '완료' : '누락'} | ${result.b ? '입력값 반영' : '배우자 미등록'} | ${result.b ? '실제 은퇴시점 변경 여부 확인' : '배우자가 있으면 등록 필요'} |`,
    '| 국민연금 | 완료 | 공단 예상액·가입기간 반영 | 실제 수급개시월과 공단 확정액 확인 |',
    `| 개인·퇴직연금 | ${hasAdditionalPension ? (result.overallTaxEstimateStatus === 'complete' ? '완료' : '부분') : '해당 없음'} | ${hasAdditionalPension ? `${result.additionalPensions.length}개 계좌 반영` : '등록 계좌 없음'} | ${hasAdditionalPension ? (result.overallTaxEstimateStatus !== 'complete' ? '세금 미입력으로 월액이 과대 추정될 수 있음' : '실제 금융기관 예상액 확인') : '보유 계좌가 있다면 등록 필요'} |`,
    '| 생활비 | 완료 | 선택한 기준과 물가상승률 반영 | 의료·간병·일시지출은 별도 확인 |',
    `| 자산 | ${hasAssets ? '완료' : '누락'} | ${hasAssets ? `${householdFinance.assets.length}개 자산 반영` : '등록 자산 없음'} | 현재가치와 현금화 가능성 확인 |`,
    `| 부채상환 | ${hasDebts ? (cashflow.finance.completeness.debtService === 'complete' ? '완료' : '부분') : '해당 없음'} | ${hasDebts ? `${householdFinance.debts.length}개 부채 반영` : '등록 부채 없음'} | ${hasDebts ? (cashflow.finance.completeness.debtService !== 'complete' ? '금리·상환기간·월 상환액 보완 필요' : '변동금리 위험 확인') : '추가 부채가 있다면 등록 필요'} |`,
    `| 임대 순수입 | ${hasRentalIncome ? (cashflow.finance.completeness.rentalNetIncome === 'complete' ? '완료' : '부분') : '해당 없음'} | ${hasRentalIncome ? '임대료 반영' : '임대소득 없음'} | ${hasRentalIncome ? (cashflow.finance.completeness.rentalNetIncome !== 'complete' ? '공실·운영비·세금 미입력' : '임대 종료시점 확인') : '임대소득이 있다면 등록 필요'} |`,
    `| 부동산 보유세 | ${hasHoldingTax ? '부분' : hasResidentialRealEstate ? '누락' : '해당 없음'} | ${hasHoldingTax ? `${realEstatePolicy.policyId} 러프 계산` : hasResidentialRealEstate ? '자동계산 설정 없음' : '주거용 부동산 없음'} | ${hasResidentialRealEstate ? '공시가격·감면·세부담상한과 실제 고지액 확인' : '주거용 부동산이 있다면 등록 필요'} |`,
    `| 현금·금융자산 | ${hasCashAssets ? '완료' : '누락'} | ${hasCashAssets ? '등록 잔액 반영' : '별도 현금·금융자산 미등록'} | 비상자금과 즉시 사용 가능액 확인 |`,
    `| 첫 사망 후 생활비 | ${hasSurvivorLivingCost ? '완료' : '부분'} | ${hasSurvivorLivingCost ? '별도 비율·금액 반영' : '부부 생활비와 동일하게 가정'} | 생존자 주거·의료비 기준 확인 |`,
  ];
  const verificationQuestions = [
    ...(!hasCashAssets
      ? ['- 현재 보유한 현금·예금·투자자산과 별도로 남길 비상자금은 얼마인가요?']
      : []),
    ...(hasDebts && cashflow.finance.completeness.debtService !== 'complete'
      ? ['- 상환정보가 불완전한 대출의 남은 기간·만기·실제 월 상환액은 얼마인가요?']
      : []),
    ...(hasRentalIncome && cashflow.finance.completeness.rentalNetIncome !== 'complete'
      ? ['- 임대소득의 예상 공실률·운영비율·세율과 종료 시점은 어떻게 되나요?']
      : []),
    ...(hasAdditionalPension && result.overallTaxEstimateStatus !== 'complete'
      ? ['- 개인·퇴직연금의 금융기관 세후 예상 월액 또는 적용할 예상 세율은 얼마인가요?']
      : []),
    ...(!hasSurvivorLivingCost
      ? ['- 첫 사망 이후 생존자 생활비를 부부 생활비와 동일하게 둘지, 별도 비율·금액으로 줄일지 확인해 주세요.']
      : []),
    ...(hasResidentialRealEstate
      ? [
          hasHoldingTax
            ? '- 재산세·종합부동산세 계산에 사용한 공시가격·주택 수·명의와 실제 감면·세부담상한 적용 여부가 맞나요?'
            : '- 보유 중인 주거용 부동산의 공시가격·주택 수·명의를 입력해 보유세를 전체 분석에 반영할까요?',
        ]
      : []),
    ...(householdFinance.assets.some((asset) => asset.housingMovePlan?.enabled)
      ? ['- 주택 매각·대체주택 구입가격, 거래시점, 가치변동률과 잔여자금 수익률을 보수적으로 다시 확인해 주세요.']
      : []),
    '- 은퇴 전후 의료·간병비, 자녀지원, 상속·증여 등 표에 없는 일시지출 계획이 있나요?',
    '- 감내 가능한 투자손실 범위와 반드시 유지할 비상자금 목표는 얼마인가요?',
  ];
  const warnings = [
    ...cashflow.warnings.map(
      (warning) =>
        `- [${warning.severity.toUpperCase()}] ${warning.code}: ${warning.message}`,
    ),
    ...result.warnings.map((warning) => `- [INFO] ${warning}`),
  ];

  return [
    '---',
    'document_type: retirement_simulation_ai_handoff',
    'schema_version: "2.1"',
    `generated_at: "${generatedAt.toISOString()}"`,
    `policy_id: "${policy.policyId}"`,
    `pension_policy_id: "${policy.policyId}"`,
    `real_estate_policy_id: "${realEstatePolicy.policyId}"`,
    `base_year: ${currentYear}`,
    'currency: KRW',
    'calculation_resolution: annual',
    'flow_amount_basis: representative_monthly_nominal',
    'balance_amount_basis: year_end_nominal',
    `present_value_base_year: ${currentYear}`,
    '---',
    '',
    '# AI 상담용 부부 연금·은퇴 종합현황',
    '',
    `- 생성일: ${generatedDate}`,
    `- 연금 계산 정책: ${policy.policyId} (시행 기준 ${policy.effectiveDate})`,
    `- 부동산 참고 계산 정책: ${realEstatePolicy.policyId} (시행 기준 ${realEstatePolicy.effectiveDate})`,
    '- 목적: 아래 입력 가정과 시뮬레이션 결과를 AI에게 전달하여 은퇴 현금흐름을 점검하기 위한 자료',
    '',
    '> **개인정보 주의:** 이 파일은 암호화되지 않은 평문입니다. 생년월일 전체와 암호는 포함하지 않았지만 연금액·소득·자산 추정치가 들어 있습니다. 공유 전 내용을 직접 확인하세요.',
    '',
    '> **계산 주의:** 모든 금액은 입력값과 정책 가정에 따른 추정치입니다. 실제 수급 자격, 세금, 수수료, 투자손익, 물가와 제도 변경은 금융기관·국민연금공단·세무 전문가에게 별도로 확인해야 합니다.',
    '',
    '## 0. 계산 완성도',
    '',
    '| 영역 | 상태 | 반영 내용 | 해석상 주의·보완사항 |',
    '|---|---|---|---|',
    ...completenessRows,
    '',
    '## AI에게 요청할 분석',
    '',
    '다음 관점으로 분석해 주세요.',
    '',
    '1. 본인과 배우자의 은퇴, 국민연금 개시, 개인·퇴직연금 개시 사이에 소득 공백이 언제 발생하는지 연도와 당시 나이로 설명해 주세요.',
    '2. 선택한 생활비 기준보다 가구소득이 부족한 기간, 최대 부족액, 원인을 우선순위로 정리해 주세요.',
    '3. 기존 퇴직·개인연금의 개시 시점 조정, 추가 저축, 지출 조정 중 비교할 현실적인 대안을 제시해 주세요. 특정 금융상품 매수 권유는 하지 마세요.',
    '4. 주택 매각·대체주택 구입·잔여금 운용 계획이 은퇴 현금흐름에 미치는 영향과 거래비용·가격·수익률 위험을 점검해 주세요.',
    '5. 물가상승률, 기대수익률, 예상 사망 나이가 달라질 때 취약한 가정을 찾아 민감도 점검 항목을 제안해 주세요.',
    '6. 결론을 단정하기 전에 누락되었거나 확인이 필요한 정보와 계산 가정을 질문 목록으로 만들어 주세요.',
    '7. 답변은 `핵심 결론 → 시점별 필요한 행동 → 자산 인출 전후 부족 → 현금자산 고갈 위험 → 민감도 → 추가 확인 질문` 순서로 작성해 주세요.',
    '8. `부분·누락·unknown·러프 계산` 항목을 확정값처럼 취급하거나 임의의 숫자로 보완하지 말고, 계산 결과·입력 가정·추가 확인 사항을 구분해 주세요.',
    '',
    '## 1. 가구 구성과 근로소득',
    '',
    ...personLines('본인', result.a, currentYear),
    ...personLines('배우자', result.b, currentYear),
    '## 2. 국민연금·공통 계산 가정',
    '',
    `- 생활비 비교 기준: ${livingLabel}`,
    `- 기준연도 생활비: ${money(livingCostMonthly(livingCost, currentYear, false, policy))}/월`,
    `- 생활비 물가상승률: 연 ${livingCost.annualInflationRate}%`,
    `- 국민연금 물가연동 적용: ${yesNo(npsInflation.enabled)}${npsInflation.enabled ? ` (연 ${npsInflation.annualRate}%)` : ''}`,
    `- 기초연금 가정: 본인 ${yesNo(basicPension.a)}, 배우자 ${yesNo(Boolean(result.b && basicPension.b))}`,
    `- 부족재원 현재가치·적립 계산의 세후 기대수익률: 연 ${plannerNetReturnRate}%`,
    '- 사망 시점 계산 기준: 예상 사망 나이가 되는 연도 말까지 생존한 것으로 보고 유족연금과 생존자 생활비 전환은 다음 연도부터 적용',
    `- 첫 사망 후 생활비 방식: ${survivorLivingCostModeLabels[livingCost.survivorMode ?? 'same_as_couple'] ?? livingCost.survivorMode}${livingCost.survivorMode === 'ratio' ? ` (${livingCost.survivorRatio ?? 75}%)` : ''}`,
    `- 필요재원 포함 범위: ${includeLateLifeGap ? '마지막 생존자 사망까지' : '첫 사망 이전 기본계획 + 첫 사망 이후 별도 위험'}`,
    '',
    '## 3. 연금 합산 요약',
    '',
    `- 두 사람 생존 시 전체 연금 월 합산: ${money(result.bothAliveMonthly)}`,
    `- 국민연금 월 합산: ${money(result.bothAliveNationalMonthly)}`,
    `- 개인·퇴직연금 월 합산: ${money(result.bothAliveAdditionalMonthly)}`,
    `- 연금 세금 추정 상태: ${taxEstimateStatusLabels[result.overallTaxEstimateStatus] ?? result.overallTaxEstimateStatus}`,
    `- 계산에 사용한 연금 월 합산: ${money(result.estimatedBothAliveNetMonthly)}${result.overallTaxEstimateStatus === 'complete' ? ' (세후 추정)' : ' (세금 미반영 또는 일부 반영 가능)'}`,
    '',
    '## 4. 자산·부채·개인·퇴직연금',
    '',
    ...(additionalRows.length
      ? [
          '### 개인·퇴직연금',
          '',
          '| 대상 | 종류 | 표시 이름 | 현재 적립금 | 추가납입 | 수령 개시 | 수령기간 | 개시 전/수령 중 수익률 | 연 수수료 | 개시 예상 적립금 | 첫해 예상 월액 | 세금 상태 |',
          '|---|---|---|---:|---|---|---:|---:|---:|---:|---:|---|',
          ...additionalRows,
        ]
      : ['등록된 개인·퇴직연금 없음']),
    '',
    '### 자산',
    '',
    ...(assetRows.length
      ? [
          '| 이름 | 유형 | 현재가치 | 은퇴 유동성 | 매각·회수계획 | 주거 이전·잔여금 운용 | 생활비 사용계획 | 보유세 설정 | 임대 설정 |',
          '|---|---|---:|---|---|---|---|---|---:|',
          ...assetRows,
        ]
      : ['등록된 자산 없음']),
    '',
    '### 부채',
    '',
    ...(debtRows.length
      ? [
          '| 이름 | 잔액 | 상환방식 | 금리 | 월 상환액 | 만기 | 연결 자산·매각 시 상환 |',
          '|---|---:|---|---:|---:|---|---|',
          ...debtRows,
        ]
      : ['등록된 부채 없음']),
    '',
    `- 총자산: ${money(cashflow.finance.grossAssets)}`,
    `- 총부채: ${money(cashflow.finance.liabilities)}`,
    `- 순자산: ${money(cashflow.finance.netWorth)}`,
    `- 은퇴 활용 가능 자산: ${money(cashflow.finance.retirementAvailableAssets)}`,
    `- 계획 기간 총 자산 인출액: ${money(cashflow.finance.plannedAssetWithdrawals)}`,
    `- 계획 기간 부동산 보유세 합계: ${money(cashflow.finance.plannedPropertyHoldingTaxes)}`,
    `- 자산 매각대금에서 자동상환한 연결대출 합계: ${money(cashflow.finance.linkedDebtPayoffsAtSale)}`,
    `- 연결대출 상환 별도 필요자금: ${money(cashflow.finance.linkedDebtPayoffFundingShortfall)}`,
    `- 생활비 현금으로 받은 자산 운용수익 합계: ${money(cashflow.finance.plannedAssetReturnIncome)}`,
    `- 자산 운용수익 재투자 합계: ${money(cashflow.finance.plannedAssetReinvestedReturns)}`,
    `- 주택 교체 후 생성된 운용자금: ${money(cashflow.finance.housingMoveInvestableSurplus)}`,
    `- 새 주택 구입 별도 필요자금: ${money(cashflow.finance.housingPurchaseFundingShortfall)}`,
    `- 마지막 분석연도 새 거주주택 가치: ${money(cashflow.finance.replacementHousingValueAtEnd)}`,
    `- 마지막 분석연도 남은 활용 예정 자산: ${money(cashflow.finance.remainingPlannedAssetsAtEnd)}`,
    `- 실거주 주택 가치: ${money(cashflow.finance.primaryHomeValue)} (매각 계획이 없으면 은퇴재원에서 제외)`,
    '',
    '## 5. 기타 반복소득',
    '',
    `- 기준연도 임대 세전 월소득: ${money(cashflow.finance.monthlyRentalIncomeGrossAtBaseYear)}`,
    `- 기준연도 임대 순 월소득: ${money(cashflow.finance.monthlyRentalIncomeNetAtBaseYear)}`,
    `- 기준연도 기타 반복소득: ${money(cashflow.finance.monthlyOtherIncomeAtBaseYear)}`,
    `- 기준연도 월 부채상환: ${money(cashflow.finance.monthlyDebtServiceAtBaseYear)}`,
    `- 기준연도 월 부동산 보유세: ${money(cashflow.finance.monthlyPropertyHoldingTaxAtBaseYear)}`,
    '',
    '## 6. 금액 기준·부호·열 정의',
    '',
    `- 흐름 금액: 각 연도의 대표 월 명목금액입니다. 현재가치가 필요한 값만 ${currentYear}년 기준으로 별도 표시합니다.`,
    '- 잔액 금액: 해당 연도 말 예상 명목잔액입니다.',
    '- 반복현금 순액: 근로·연금·임대·기타소득에서 대출상환과 부동산 보유세를 차감한 월 현금입니다.',
    '- 자산활용 전 부족: 현금 운용수익과 자산 원금 인출을 더하기 전 생활비 부족액입니다.',
    '- 자산 원금 인출: 생활비 관점에서는 플러스 현금이지만 같은 금액만큼 보유 자산잔액을 줄입니다.',
    '- 인출 후 부족: 등록한 운용수익과 원금 인출까지 적용하고도 남은 실제 월 미충당액입니다.',
    '- 현금·금융자산 잔액: 현금·예금·금융자산과 매각 후 현금화된 자산의 연도 말 잔액입니다.',
    '- 남은 활용자산: 생활비 사용계획이 설정된 전체 자산의 연도 말 잔액으로, 아직 매각 전인 자산을 포함할 수 있습니다.',
    '- 새 주택 가치는 주거자산 잔액이며 생활비용 현금과 구분합니다.',
    '',
    '## 7. 핵심 사건·의사결정 연도',
    '',
    '| 연도 | 당시 나이 | 생애 단계 | 사건·의미 | 반복현금 순액 | 생활비 | 자산활용 전 부족 | 자산 원금 인출 | 인출 후 부족 | 연말 현금·금융자산 |',
    '|---:|---|---|---|---:|---:|---:|---:|---:|---:|',
    ...keyEventRows,
    '',
    '## 8. 전체 연도별 가구 현금흐름 (부록)',
    '',
    '| 연도 | 당시 나이 | 생애 단계 | 주요 사건 | 근로 | 국민연금 | 기초연금 | 사적연금 | 임대순소득 | 기타 | 대출상환 | 부동산 보유세 | 반복현금 순액 | 자산활용 전 부족 | 현금 운용수익 | 자산 원금 인출 | 인출 후 부족 | 현금·금융자산 잔액 | 남은 활용자산 | 새 주택 가치 | 생활비 | 생활비 후 최종 차이 |',
    '|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...timelineRows,
    '',
    '## 9. 자산 활용 후 실제 부족구간',
    '',
    ...(gapRows.length
      ? [
          '| 구간 | 시작 | 종료 | 단계 | 최대 월 부족 | 기준연도 현재가치 |',
          '|---:|---:|---:|---|---:|---:|',
          ...gapRows,
        ]
      : ['부족구간 없음']),
    '',
    '## 10. 필요재원: 기본계획과 후기 위험 분리',
    '',
    ...fundingLines(cashflow, includeLateLifeGap),
    '',
    '## 11. 첫 사망 후 전환',
    '',
    ...(result.afterFirstDeath
      ? [
          `- 전환연도: ${result.afterFirstDeath.year}년`,
          `- 생존자: ${result.afterFirstDeath.survivorName}`,
          `- 본인 국민연금: ${money(result.afterFirstDeath.ownNationalPension)}`,
          `- 유족연금 전액: ${money(result.afterFirstDeath.survivorPensionFull)}`,
          `- 선택 국민연금: ${money(result.afterFirstDeath.selectedNationalPension)}`,
          `- 기초연금: ${money(result.afterFirstDeath.basicPension)}`,
          `- 기타 개인·퇴직연금: ${money(result.afterFirstDeath.additionalPrivatePension)}`,
          `- 전체 예상 연금소득: ${money(result.afterFirstDeath.totalNetPension)}`,
          `- 판단: ${result.afterFirstDeath.decisionText}`,
        ]
      : ['해당 없음']),
    '',
    '## 12. 계산 경고',
    '',
    ...warnings,
    '',
    '## 13. 실제 누락·위험에 따른 확인 질문',
    '',
    ...verificationQuestions,
    '',
  ].join('\n');
}
