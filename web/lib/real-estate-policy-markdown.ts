import {
  type RealEstatePolicySource,
  type RealEstateCostPolicy,
  validateRealEstateCostPolicy,
} from './real-estate-costs.ts';
import { type Policy, validatePolicy } from './nps-engine.ts';

const START_MARKER = '<!-- COUPLE_PENSION_POLICY_UPDATE_JSON_START -->';
const END_MARKER = '<!-- COUPLE_PENSION_POLICY_UPDATE_JSON_END -->';

export type PolicyUpdatePackage = {
  documentType: 'couple-pension-policy-update';
  packageSchemaVersion: '1.0';
  preparedAt: string;
  changeSummary: string[];
  researchSources: RealEstatePolicySource[];
  pensionPolicy: Policy;
  realEstatePolicy: RealEstateCostPolicy;
};

function validatePensionPolicyForUpdate(input: unknown): Policy {
  const policy = validatePolicy(input);
  const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  const rate = (value: unknown) => finite(value) && value >= 0 && value <= 1;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(policy.effectiveDate) ||
    !finite(policy.minimumContributionMonths) ||
    policy.minimumContributionMonths < 0 ||
    !rate(policy.earlyReductionPerMonth) ||
    !rate(policy.deferredBonusPerMonth) ||
    !rate(policy.survivorAdditionalRate)
  )
    throw new Error('연금 정책의 시행일·가입기간·증감률을 확인하세요.');
  if (
    policy.normalClaimAges.length === 0 ||
    policy.normalClaimAges.some(
      (item) =>
        !finite(item.from) ||
        (item.to != null && !finite(item.to)) ||
        !finite(item.age) ||
        item.age < 0 ||
        item.age > 100,
    ) ||
    policy.survivorRates.length === 0 ||
    policy.survivorRates.some(
      (item) =>
        !finite(item.from) ||
        (item.to != null && !finite(item.to)) ||
        !rate(item.rate),
    )
  )
    throw new Error('정상 수급연령 또는 유족연금 지급률 구간을 확인하세요.');
  const moneyValues = [
    policy.basicPension.baseYear,
    policy.basicPension.standardMonthly,
    policy.basicPension.coupleEachMonthly,
    policy.livingCostBenchmarks.general.baseYear,
    ...policy.livingCostBenchmarks.general.minimum,
    ...policy.livingCostBenchmarks.general.median,
    policy.livingCostBenchmarks.retiredCouple.baseYear,
    policy.livingCostBenchmarks.retiredCouple.minimum,
    policy.livingCostBenchmarks.retiredCouple.median,
  ];
  if (moneyValues.some((value) => !finite(value) || value < 0))
    throw new Error('기초연금 또는 생활비 기준 금액을 확인하세요.');
  const privatePolicy = policy.privatePension;
  if (
    !finite(privatePolicy.minimumStartAge) ||
    !finite(privatePolicy.minimumAccountYears) ||
    !finite(privatePolicy.pensionLimitDenominatorBase) ||
    !finite(privatePolicy.pensionLimitMultiplier) ||
    !rate(privatePolicy.localIncomeTaxRateOnIncomeTax) ||
    privatePolicy.privatePensionTaxRates.length === 0 ||
    privatePolicy.privatePensionTaxRates.some(
      (item) =>
        !finite(item.ageFrom) ||
        (item.ageTo != null && !finite(item.ageTo)) ||
        !rate(item.rate),
    ) ||
    privatePolicy.deferredRetirementTaxFactors.length === 0 ||
    privatePolicy.deferredRetirementTaxFactors.some(
      (item) =>
        !finite(item.pensionYearFrom) ||
        (item.pensionYearTo != null && !finite(item.pensionYearTo)) ||
        !rate(item.factor),
    )
  )
    throw new Error('개인·퇴직연금 세율 또는 수령한도 정책을 확인하세요.');
  const sourceUrls = [
    ...policy.npsGuides.map((guide) => guide.sourceUrl),
    ...policy.privatePension.guides.map((guide) => guide.sourceUrl),
  ];
  if (
    sourceUrls.length === 0 ||
    sourceUrls.some(
      (url) => typeof url !== 'string' || !url.startsWith('https://'),
    )
  )
    throw new Error('연금 정책 안내의 공식 HTTPS 출처를 확인하세요.');
  return policy;
}

export function buildPolicyUpdateMarkdown(
  pensionPolicy: Policy,
  realEstatePolicy: RealEstateCostPolicy,
  generatedAt = new Date(),
) {
  const pensionSources = [
    ...pensionPolicy.npsGuides.map((guide) => ({
      title: guide.sourceLabel,
      url: guide.sourceUrl,
      checkedAt: generatedAt.toISOString().slice(0, 10),
    })),
    ...pensionPolicy.privatePension.guides.map((guide) => ({
      title: guide.sourceLabel,
      url: guide.sourceUrl,
      checkedAt: generatedAt.toISOString().slice(0, 10),
    })),
  ].filter(
    (source, index, sources) =>
      source.url.startsWith('https://') &&
      sources.findIndex((item) => item.url === source.url) === index,
  );
  const updatePackage: PolicyUpdatePackage = {
    documentType: 'couple-pension-policy-update',
    packageSchemaVersion: '1.0',
    preparedAt: generatedAt.toISOString(),
    changeSummary: [
      'AI 작성: 확인한 공식자료와 실제로 변경한 필드를 여기에 요약하세요.',
    ],
    researchSources: [...pensionSources, ...realEstatePolicy.sources],
    pensionPolicy: validatePensionPolicyForUpdate(pensionPolicy),
    realEstatePolicy: validateRealEstateCostPolicy(realEstatePolicy),
  };
  return [
    '# 부부연금 시뮬레이터 통합 정책 업데이트 요청',
    '',
    `- 현재 연금 정책 ID: ${pensionPolicy.policyId}`,
    `- 현재 연금 정책 시행 기준일: ${pensionPolicy.effectiveDate}`,
    `- 현재 부동산 정책 ID: ${realEstatePolicy.policyId}`,
    `- 현재 부동산 정책 시행 기준일: ${realEstatePolicy.effectiveDate}`,
    `- 생성 시각: ${generatedAt.toISOString()}`,
    '',
    '## AI에게 요청하는 작업',
    '',
    '대한민국의 현재 공식 자료를 웹에서 확인하여 아래 JSON의 국민연금·기초연금·개인/퇴직연금·생활비 기준과 부동산 매매 중개보수·취득 관련 세금·양도소득세·주택 재산세·종합부동산세 참고 계산 정책을 최신화하세요.',
    '',
    '1. 국가법령정보센터, 국세청, 행정안전부, 지방자치단체 등 1차 공식 자료를 우선 사용하세요.',
    '2. `schemaVersion`, `documentType`, `packageSchemaVersion`과 JSON 필드 구조는 바꾸지 마세요.',
    '3. 비율은 퍼센트 숫자가 아니라 소수로 입력하세요. 예: 3%는 `0.03`입니다.',
    '4. 조사에 사용한 모든 출처의 제목, HTTPS URL, 확인일을 최상위 `researchSources`에 기록하세요. 부동산 계산에 직접 사용한 출처는 `realEstatePolicy.sources`에도 기록하세요.',
    '5. 실제로 바뀐 필드와 변경 이유를 `changeSummary`에 한국어로 기록하세요.',
    '6. 공식 자료로 확인할 수 없는 값은 추측해 바꾸지 말고 기존 값을 유지한 뒤 `notes`에 한계를 적으세요.',
    '7. 아래 시작·종료 표식 사이에는 JSON 코드블록 하나만 남기세요. 설명은 표식 바깥에 써도 앱에서 무시됩니다.',
    '',
    '> 이 문서는 연금 수급권을 확정하거나 세금 신고서를 만드는 것이 아니라 은퇴 현금흐름용 참고 추정 정책을 갱신하기 위한 것입니다.',
    '',
    START_MARKER,
    '```json',
    JSON.stringify(updatePackage, null, 2),
    '```',
    END_MARKER,
    '',
    '## 사용자 확인 항목',
    '',
    '- 정책 ID와 시행 기준일이 최신인지 확인',
    '- 출처 URL을 직접 열어 공식 문서인지 확인',
    '- 변경 요약과 세율 단위가 맞는지 확인',
    '- 앱에서 미리보기를 확인한 뒤 적용',
    '',
  ].join('\n');
}

export function parsePolicyUpdateMarkdown(
  markdown: string,
): PolicyUpdatePackage {
  const start = markdown.indexOf(START_MARKER);
  const end = markdown.indexOf(END_MARKER);
  if (
    start < 0 ||
    end <= start ||
    markdown.indexOf(START_MARKER, start + START_MARKER.length) >= 0 ||
    markdown.indexOf(END_MARKER, end + END_MARKER.length) >= 0
  )
    throw new Error(
      '정책 Markdown의 JSON 시작·종료 표식이 없거나 중복되었습니다.',
    );
  const block = markdown.slice(start + START_MARKER.length, end).trim();
  const match = block.match(/^```json\s*([\s\S]*?)\s*```$/);
  if (!match)
    throw new Error('정책 표식 사이에는 JSON 코드블록 하나만 있어야 합니다.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new Error('정책 Markdown 안의 JSON 형식이 올바르지 않습니다.');
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('정책 업데이트 패키지가 객체 형식이 아닙니다.');
  const candidate = parsed as Partial<PolicyUpdatePackage>;
  if (
    candidate.documentType !== 'couple-pension-policy-update' ||
    candidate.packageSchemaVersion !== '1.0' ||
    typeof candidate.preparedAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.preparedAt))
  )
    throw new Error('지원하지 않는 정책 업데이트 패키지입니다.');
  if (
    !Array.isArray(candidate.changeSummary) ||
    candidate.changeSummary.length === 0 ||
    candidate.changeSummary.length > 30 ||
    candidate.changeSummary.some(
      (item) => typeof item !== 'string' || item.length > 500,
    )
  )
    throw new Error(
      '변경 요약은 500자 이하 문자열을 한 건 이상 넣어야 합니다.',
    );
  if (
    !Array.isArray(candidate.researchSources) ||
    candidate.researchSources.length === 0 ||
    candidate.researchSources.length > 50 ||
    candidate.researchSources.some(
      (source) =>
        source == null ||
        typeof source !== 'object' ||
        typeof source.title !== 'string' ||
        source.title.length === 0 ||
        source.title.length > 200 ||
        typeof source.url !== 'string' ||
        !source.url.startsWith('https://') ||
        typeof source.checkedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt),
    )
  )
    throw new Error(
      '조사 출처는 제목·HTTPS URL·확인일을 포함해 한 건 이상 입력해야 합니다.',
    );
  return {
    documentType: candidate.documentType,
    packageSchemaVersion: candidate.packageSchemaVersion,
    preparedAt: candidate.preparedAt,
    changeSummary: [...candidate.changeSummary],
    researchSources: candidate.researchSources.map((source) => ({ ...source })),
    pensionPolicy: validatePensionPolicyForUpdate(candidate.pensionPolicy),
    realEstatePolicy: validateRealEstateCostPolicy(candidate.realEstatePolicy),
  };
}
