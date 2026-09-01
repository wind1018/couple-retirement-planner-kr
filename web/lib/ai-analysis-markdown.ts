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
  type HouseholdCashflowAnalysis,
  type HouseholdFinanceSettings,
} from './household-cashflow.ts';

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

function fundingLines(analysis: HouseholdCashflowAnalysis) {
  return [
    `- 첫 부족연도: ${analysis.firstGapYear ?? '없음'}`,
    `- 최대 월 부족액: ${money(analysis.maximumMonthlyGap)}`,
    `- 자산을 쓰지 않을 때 실제 연도별 부족액 현재가치: ${money(analysis.exactGapPresentValue)}`,
    `  - 기준연도: ${analysis.baseYear}년`,
    `  - 세후 할인율: 연 ${analysis.discountRate}%`,
    '  - 계산법: 연도별 실제 월 부족액 × 12를 기준연도로 할인한 합계',
    `- 최대 부족액 지속 가정 스트레스 필요재원: ${money(analysis.conservativeStressCapital)}`,
    `  - 기준연도: ${analysis.baseYear}년`,
    `  - 세후 할인율: 연 ${analysis.discountRate}%`,
    '- 스트레스 값은 기본 필요재원이 아니라 보수적 상한 비교값',
    `- 계획에 따른 전체 자산 인출액: ${money(analysis.finance.plannedAssetWithdrawals)}`,
    `- 자산 인출 후 남은 부족액 현재가치: ${money(analysis.exactGapPresentValueAfterAssets)}`,
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
  const timelineRows = cashflow.rows.map(
    (row) =>
      `| ${row.year} | ${cell(agePair(row.ageA, row.ageB))} | ${cell(eventByYear.get(row.year) ?? '')} | ${money(row.employmentIncome)} | ${money(row.nationalPension)} | ${money(row.basicPension)} | ${money(row.privatePension)} | ${money(row.rentalIncomeNet)} | ${money(row.otherIncome)} | ${money(row.debtService)} | ${money(row.assetWithdrawal)} | ${money(row.remainingRetirementAssets)} | ${money(row.livingCost)} | ${signedMoney(row.monthlySurplus, row.monthlyGap)} |`,
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
    return `| ${cell(account.ownerName)} | ${cell(pensionKindLabels[account.kind])} | ${cell(account.name)} | ${money(account.expectedBalance)} | ${cell(contribution)} | ${account.startYear}년 (${account.startAge}세) | ${account.payoutYears}년 | ${account.annualReturnRateBeforeStart ?? 0}% / ${account.annualReturnRate}% | ${account.annualFeeRate}% | ${account.projectedStartBalance == null ? '직접 월액 입력' : money(account.projectedStartBalance)} | ${money(account.firstYearEstimatedNetMonthly)} | ${account.taxEstimateStatus} |`;
  });
  const assetRows = householdFinance.assets.map((asset) => {
    const plan = resolveAssetUsePlan(asset, currentYear);
    const planLabel =
      plan.mode === 'cover_gap'
        ? '생활비 부족 자동 보충'
        : plan.mode === 'fixed_monthly'
          ? `매월 ${money(plan.monthlyAmount ?? 0)} 인출`
          : '보유만 함';
    return `| ${cell(asset.name)} | ${asset.type} | ${money(asset.currentValue)} | ${asset.retirementLiquidity} | ${asset.salePlan?.enabled ? `${asset.salePlan.year}년` : '없음'} | ${cell(`${planLabel}${plan.mode === 'hold' ? '' : ` · ${plan.startYear}년부터${plan.endYear == null ? '' : ` ${plan.endYear}년까지`} · 최소 ${money(plan.reserveAmount ?? 0)} 보유`}`)} | ${asset.rental?.enabled ? money(asset.rental.grossMonthlyRent) : '없음'} |`;
  });
  const debtRows = householdFinance.debts.map(
    (debt) =>
      `| ${cell(debt.name)} | ${money(debt.principal)} | ${debt.repaymentType ?? '미입력'} | ${debt.annualInterestRate == null ? '미입력' : `${debt.annualInterestRate}%`} | ${debt.manualMonthlyPayment == null ? '자동/미입력' : money(debt.manualMonthlyPayment)} | ${debt.maturityYear ?? '미입력'} |`,
  );
  const gapRows = cashflow.gapPeriods.map(
    (period, index) =>
      `| ${index + 1} | ${period.startYear} | ${period.endYear} | ${period.phase} | ${money(period.maxMonthlyGap)} | ${money(period.exactPresentValue)} |`,
  );
  const completeness = [
    '- [x] 본인 근로소득·은퇴 시점',
    `- [${result.b ? 'x' : ' '}] 배우자 근로소득·은퇴 시점`,
    '- [x] 국민연금',
    `- [${result.additionalPensions.length ? 'x' : ' '}] 개인·퇴직연금`,
    '- [x] 생활비',
    `- [${householdFinance.assets.length ? 'x' : ' '}] 자산`,
    `- [${householdFinance.debts.length ? 'x' : ' '}] 대출잔액`,
    `- [${cashflow.finance.completeness.debtService === 'complete' ? 'x' : ' '}] 대출 금리 또는 월 상환액`,
    `- [${cashflow.finance.monthlyRentalIncomeGrossAtBaseYear > 0 ? 'x' : ' '}] 임대료`,
    `- [${cashflow.finance.completeness.rentalNetIncome === 'complete' ? 'x' : ' '}] 임대소득 세금·공실·운영비`,
    `- [${householdFinance.assets.some((asset) => asset.type === 'cash' || asset.type === 'financial') ? 'x' : ' '}] 현금·예금·금융자산`,
    `- [${(livingCost.survivorMode ?? 'same_as_couple') !== 'same_as_couple' ? 'x' : ' '}] 첫 사망 후 생활비`,
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
    'schema_version: "2.0"',
    `generated_at: "${generatedAt.toISOString()}"`,
    `policy_id: "${policy.policyId}"`,
    `base_year: ${currentYear}`,
    'currency: KRW',
    'calculation_resolution: annual',
    '---',
    '',
    '# AI 상담용 부부 연금·은퇴 종합현황',
    '',
    `- 생성일: ${generatedDate}`,
    `- 계산 정책: ${policy.policyId} (시행 기준 ${policy.effectiveDate})`,
    '- 목적: 아래 입력 가정과 시뮬레이션 결과를 AI에게 전달하여 은퇴 현금흐름을 점검하기 위한 자료',
    '',
    '> **개인정보 주의:** 이 파일은 암호화되지 않은 평문입니다. 생년월일 전체와 암호는 포함하지 않았지만 연금액·소득·자산 추정치가 들어 있습니다. 공유 전 내용을 직접 확인하세요.',
    '',
    '> **계산 주의:** 모든 금액은 입력값과 정책 가정에 따른 추정치입니다. 실제 수급 자격, 세금, 수수료, 투자손익, 물가와 제도 변경은 금융기관·국민연금공단·세무 전문가에게 별도로 확인해야 합니다.',
    '',
    '## 0. 계산 완성도',
    '',
    ...completeness,
    '',
    '## AI에게 요청할 분석',
    '',
    '다음 관점으로 분석해 주세요.',
    '',
    '1. 본인과 배우자의 은퇴, 국민연금 개시, 개인·퇴직연금 개시 사이에 소득 공백이 언제 발생하는지 연도와 당시 나이로 설명해 주세요.',
    '2. 선택한 생활비 기준보다 가구소득이 부족한 기간, 최대 부족액, 원인을 우선순위로 정리해 주세요.',
    '3. 기존 퇴직·개인연금의 개시 시점 조정, 추가 저축, 지출 조정 중 비교할 현실적인 대안을 제시해 주세요. 특정 금융상품 매수 권유는 하지 마세요.',
    '4. 물가상승률, 기대수익률, 예상 사망 나이가 달라질 때 취약한 가정을 찾아 민감도 점검 항목을 제안해 주세요.',
    '5. 결론을 단정하기 전에 누락되었거나 확인이 필요한 정보와 계산 가정을 질문 목록으로 만들어 주세요.',
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
    '- 사망 시점 계산 convention: 예상 사망 나이가 되는 연도 말까지 생존한 것으로 보고 유족연금과 생존자 생활비 전환은 다음 연도부터 적용',
    `- 첫 사망 후 생활비 방식: ${livingCost.survivorMode ?? 'same_as_couple'}${livingCost.survivorMode === 'ratio' ? ` (${livingCost.survivorRatio ?? 75}%)` : ''}`,
    `- 필요재원 포함 범위: ${includeLateLifeGap ? '마지막 생존자 사망까지' : '첫 사망 이전 기본계획 + 첫 사망 이후 별도 위험'}`,
    '',
    '## 3. 연금 합산 요약',
    '',
    `- 두 사람 생존 시 전체 연금 월 합산: ${money(result.bothAliveMonthly)}`,
    `- 국민연금 월 합산: ${money(result.bothAliveNationalMonthly)}`,
    `- 개인·퇴직연금 월 합산: ${money(result.bothAliveAdditionalMonthly)}`,
    `- 연금 세금 추정 상태: ${result.overallTaxEstimateStatus}`,
    `- 세후 또는 부분 세후 추정 연금 월 합산: ${money(result.estimatedBothAliveNetMonthly)}`,
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
          '| 이름 | 유형 | 현재가치 | 은퇴 유동성 | 매각계획 | 생활비 사용계획 | 월 임대료 |',
          '|---|---|---:|---|---|---|---:|',
          ...assetRows,
        ]
      : ['등록된 자산 없음']),
    '',
    '### 부채',
    '',
    ...(debtRows.length
      ? [
          '| 이름 | 잔액 | 상환방식 | 금리 | 월 상환액 | 만기 |',
          '|---|---:|---|---:|---:|---|',
          ...debtRows,
        ]
      : ['등록된 부채 없음']),
    '',
    `- 총자산: ${money(cashflow.finance.grossAssets)}`,
    `- 총부채: ${money(cashflow.finance.liabilities)}`,
    `- 순자산: ${money(cashflow.finance.netWorth)}`,
    `- 은퇴 활용 가능 자산: ${money(cashflow.finance.retirementAvailableAssets)}`,
    `- 계획 기간 총 자산 인출액: ${money(cashflow.finance.plannedAssetWithdrawals)}`,
    `- 마지막 분석연도 남은 활용 예정 자산: ${money(cashflow.finance.remainingPlannedAssetsAtEnd)}`,
    `- 실거주 주택 가치: ${money(cashflow.finance.primaryHomeValue)} (매각 계획이 없으면 은퇴재원에서 제외)`,
    '',
    '## 5. 기타 반복소득',
    '',
    `- 기준연도 임대 세전 월소득: ${money(cashflow.finance.monthlyRentalIncomeGrossAtBaseYear)}`,
    `- 기준연도 임대 순 월소득: ${money(cashflow.finance.monthlyRentalIncomeNetAtBaseYear)}`,
    `- 기준연도 기타 반복소득: ${money(cashflow.finance.monthlyOtherIncomeAtBaseYear)}`,
    `- 기준연도 월 부채상환: ${money(cashflow.finance.monthlyDebtServiceAtBaseYear)}`,
    '',
    '## 6. 연도별 가구 현금흐름',
    '',
    '| 연도 | 당시 나이 | 주요 사건 | 근로 | 국민연금 | 기초연금 | 사적연금 | 임대순소득 | 기타 | 대출상환 | 자산인출 | 남은 활용자산 | 생활비 | 순차이 |',
    '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...timelineRows,
    '',
    '## 7. 부족구간',
    '',
    ...(gapRows.length
      ? [
          '| 구간 | 시작 | 종료 | 단계 | 최대 월 부족 | 기준연도 현재가치 |',
          '|---:|---:|---:|---|---:|---:|',
          ...gapRows,
        ]
      : ['부족구간 없음']),
    '',
    '## 8. 필요재원',
    '',
    ...fundingLines(cashflow),
    '',
    '## 9. 첫 사망 후 전환',
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
    '## 10. 계산 경고',
    '',
    ...warnings,
    '',
    '## 11. AI에게 확인 요청할 사항',
    '',
    '- 현재 현금성 자산, 주택담보대출·기타 부채와 금리',
    '- 은퇴 전후 실제 월지출과 의료·간병·주거비 계획',
    '- 퇴직금 예상액, 개인연금의 실제 금융기관 예상 월액과 세금',
    '- 자녀 지원, 상속·증여, 주택 이전 또는 주택연금 계획',
    '- 감내 가능한 투자손실 범위와 비상자금 목표',
    '',
  ].join('\n');
}
