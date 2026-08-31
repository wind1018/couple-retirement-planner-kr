import type {
  NationalPensionInflationSettings,
  Policy,
  SimulationResult,
} from './nps-engine.ts';
import {
  analyzeHouseholdRetirement,
  type HouseholdRetirementAnalysis,
} from './pension-goal.ts';
import {
  addBasicPensionToResult,
  type BasicPensionSettings,
  type LivingCostSettings,
  livingCostLabel,
  livingCostMonthly,
} from './public-pension.ts';
import {
  buildIncomeTimelineEvents,
  incomeTimelineSnapshot,
} from './income-timeline.ts';

export type AiAnalysisMarkdownInput = {
  result: SimulationResult;
  policy: Policy;
  npsInflation: NationalPensionInflationSettings;
  basicPension: BasicPensionSettings;
  livingCost: LivingCostSettings;
  plannerNetReturnRate: number;
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

function householdRetirementLines(
  analysis: HouseholdRetirementAnalysis | null,
) {
  if (!analysis) {
    return ['근로·사업소득 참여자가 없어 가구 은퇴 시점을 별도로 계산하지 않음'];
  }
  return [
    `- 가구 은퇴: ${analysis.retirementYear}년 (${agePair(analysis.ageA, analysis.ageB)})`,
    `- 은퇴 첫해 생활비 기준: ${money(analysis.essentialMonthlyAtRetirement)}/월`,
    `- 은퇴 첫해 개시된 예상 세후 연금소득: ${money(analysis.expectedMonthlyAtRetirement)}/월`,
    `- 은퇴 첫해 부족 추정: ${analysis.monthlyGapAtRetirement > 0 ? `-${money(analysis.monthlyGapAtRetirement)}/월` : '부족 없음'}`,
    `- 부족 발생 추정 기간: ${analysis.firstGapYear == null ? '없음' : `${analysis.firstGapYear}~${analysis.lastGapYear}년`}`,
    `- 기간 중 최대 월 부족 추정: ${money(analysis.maximumMonthlyGap)}`,
    `- 보수적 필요재원 현재가치 추정: ${money(analysis.requiredCapital)}`,
    `- 현재부터 필요재원 준비 시 월 적립 추정: ${money(analysis.monthlyContribution)} (${analysis.savingYears.toFixed(1)}년 준비 가정)`,
    analysis.suggestedEarlyAccount
      ? `- 조기 개시 비교 후보: ${analysis.suggestedEarlyAccount.ownerName}의 ${analysis.suggestedEarlyAccount.name} (현재 ${analysis.suggestedEarlyAccount.currentStartYear}년·${analysis.suggestedEarlyAccount.currentStartAge}세 개시 설정)`
      : '- 조기 개시 비교 후보: 등록된 후보 없음',
  ];
}

export function buildAiAnalysisMarkdown({
  result: sourceResult,
  policy,
  npsInflation,
  basicPension,
  livingCost,
  plannerNetReturnRate,
  generatedAt = new Date(),
}: AiAnalysisMarkdownInput) {
  const result = addBasicPensionToResult(sourceResult, basicPension);
  const currentYear = generatedAt.getFullYear();
  const generatedDate = generatedAt.toISOString().slice(0, 10);
  const livingLabel = livingCostLabel(livingCost);
  const householdRetirement = analyzeHouseholdRetirement(
    [],
    result,
    plannerNetReturnRate,
    (year) => livingCostMonthly(livingCost, year),
    currentYear,
  );
  const finalYear = result.rows.at(-1)?.year ?? currentYear;
  const eventGroups = buildIncomeTimelineEvents(result, currentYear).filter(
    (group) => group.year >= currentYear && group.year <= finalYear,
  );
  const timelineRows = eventGroups.map((group) => {
    const snapshot = incomeTimelineSnapshot(
      result,
      group.year,
      livingCostMonthly(livingCost, group.year),
    );
    return `| ${group.year} | ${cell(agePair(snapshot.ageA, snapshot.ageB))} | ${cell(group.events.map((event) => event.title).join(', '))} | ${money(snapshot.employmentA + snapshot.employmentB)} | ${money(snapshot.pensionNetA + snapshot.pensionNetB)} | ${money(snapshot.householdIncome)} | ${money(snapshot.livingCost)} | ${signedMoney(snapshot.surplus, snapshot.gap)} |`;
  });
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
    return `| ${cell(account.ownerName)} | ${cell(pensionKindLabels[account.kind])} | ${cell(account.name)} | ${money(account.expectedBalance)} | ${cell(contribution)} | ${account.startYear}년 (${account.startAge}세) | ${account.payoutYears}년 | ${account.annualReturnRateBeforeStart ?? 0}% / ${account.annualReturnRate}% | ${account.annualFeeRate}% | ${account.projectedStartBalance == null ? '직접 월액 입력' : money(account.projectedStartBalance)} | ${money(account.firstYearEstimatedNetMonthly)} |`;
  });
  const warnings = result.warnings.length
    ? result.warnings.map((warning) => `- ${warning}`)
    : ['- 시뮬레이터가 생성한 별도 경고 없음'];

  return [
    '# AI 상담용 부부 연금·은퇴 현황',
    '',
    `- 생성일: ${generatedDate}`,
    `- 계산 정책: ${policy.policyId} (시행 기준 ${policy.effectiveDate})`,
    '- 목적: 아래 입력 가정과 시뮬레이션 결과를 AI에게 전달하여 은퇴 현금흐름을 점검하기 위한 자료',
    '',
    '> **개인정보 주의:** 이 파일은 암호화되지 않은 평문입니다. 생년월일 전체와 암호는 포함하지 않았지만 연금액·소득·자산 추정치가 들어 있습니다. 공유 전 내용을 직접 확인하세요.',
    '',
    '> **계산 주의:** 모든 금액은 입력값과 정책 가정에 따른 추정치입니다. 실제 수급 자격, 세금, 수수료, 투자손익, 물가와 제도 변경은 금융기관·국민연금공단·세무 전문가에게 별도로 확인해야 합니다.',
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
    '## 1. 가구 구성과 은퇴 전 소득',
    '',
    ...personLines('본인', result.a, currentYear),
    ...personLines('배우자', result.b, currentYear),
    '## 2. 공통 계산 가정',
    '',
    `- 생활비 비교 기준: ${livingLabel}`,
    `- 기준연도 생활비: ${money(livingCostMonthly(livingCost, currentYear))}/월`,
    `- 생활비 물가상승률: 연 ${livingCost.annualInflationRate}%`,
    `- 국민연금 물가연동 적용: ${yesNo(npsInflation.enabled)}${npsInflation.enabled ? ` (연 ${npsInflation.annualRate}%)` : ''}`,
    `- 기초연금 가정: 본인 ${yesNo(basicPension.a)}, 배우자 ${yesNo(Boolean(result.b && basicPension.b))}`,
    `- 부족재원 현재가치·적립 계산의 세후 기대수익률: 연 ${plannerNetReturnRate}%`,
    '',
    '## 3. 연금 합산 요약',
    '',
    `- 두 사람 생존 시 전체 연금 월 합산: ${money(result.bothAliveMonthly)}`,
    `- 국민연금 월 합산: ${money(result.bothAliveNationalMonthly)}`,
    `- 개인·퇴직연금 월 합산: ${money(result.bothAliveAdditionalMonthly)}`,
    `- 예상 세후 연금 월 합산: ${money(result.estimatedBothAliveNetMonthly)}`,
    `- 첫 사망 후 월 합산: ${result.afterFirstDeathMonthly == null ? '해당 없음' : money(result.afterFirstDeathMonthly)}`,
    `- 첫 사망 후 국민연금 판단: ${result.survivorDecision ?? '해당 없음'}`,
    '',
    '## 4. 개인·퇴직연금 상세',
    '',
    ...(additionalRows.length
      ? [
          '| 대상 | 종류 | 표시 이름 | 현재 적립금 | 추가납입 | 수령 개시 | 수령기간 | 개시 전/수령 중 수익률 | 연 수수료 | 개시 예상 적립금 | 첫해 예상 세후 월액 |',
          '|---|---|---|---:|---|---|---:|---:|---:|---:|---:|',
          ...additionalRows,
        ]
      : ['등록된 개인·퇴직연금 없음']),
    '',
    '## 5. 가구 은퇴와 생활비 부족 분석',
    '',
    ...householdRetirementLines(householdRetirement),
    '',
    '## 6. 주요 연도별 소득·생활비 변화',
    '',
    '| 연도 | 당시 나이 | 주요 사건 | 근로소득/월 | 세후 연금소득/월 | 세후 가구소득/월 | 생활비 기준/월 | 차이/월 |',
    '|---:|---|---|---:|---:|---:|---:|---:|',
    ...timelineRows,
    '',
    '## 7. 시뮬레이터 경고와 확인사항',
    '',
    ...warnings,
    '',
    '## 8. 추가로 AI에게 알려주면 분석이 좋아지는 정보',
    '',
    '- 현재 현금성 자산, 주택담보대출·기타 부채와 금리',
    '- 은퇴 전후 실제 월지출과 의료·간병·주거비 계획',
    '- 퇴직금 예상액, 개인연금의 실제 금융기관 예상 월액과 세금',
    '- 자녀 지원, 상속·증여, 주택 이전 또는 주택연금 계획',
    '- 감내 가능한 투자손실 범위와 비상자금 목표',
    '',
  ].join('\n');
}
