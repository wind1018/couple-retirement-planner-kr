export type PersonInput = {
  enabled: boolean;
  hasNps: boolean;
  name: string;
  birth: string;
  anchoredMonthlyPension: number;
  totalExpectedContribution: number;
  expectedMonths: number;
  currentMonthlyPremium: number;
  periodStartYear: string;
  periodStartMonth: string;
  periodEndYear: string;
  periodEndMonth: string;
  continuationYears: number;
  continuationPremium: number;
  claimAge: number;
  employmentIncomeEnabled?: boolean;
  retirementAge?: number;
  preRetirementMonthlyIncome?: number;
  deathAge: number;
};

export type AdditionalPensionKind =
  | 'pensionSavings'
  | 'irpPersonal'
  | 'retirementIrp'
  | 'dbdc'
  | 'annuityInsurance';

export type AdditionalPensionInput = {
  id: string;
  owner: 'a' | 'b';
  enabled: boolean;
  kind: AdditionalPensionKind;
  name: string;
  calculationMode: 'balance' | 'monthly';
  expectedBalance: number;
  balanceBaseAge?: number;
  monthlyContributionUntilStart?: number;
  contributionFrequency?:
    | 'none'
    | 'monthly'
    | 'quarterly'
    | 'semiannual'
    | 'annual';
  contributionAmount?: number;
  contributionEndAge?: number;
  annualReturnRateBeforeStart?: number;
  directMonthlyAmount: number;
  startAge: number;
  payoutYears: number;
  annualReturnRate: number;
  annualFeeRate: number;
  accountYearsAtStart: number;
  accountOpenDate?: string;
  annuityPaymentTermYears?: number;
  annuityPaymentTermKnown?: boolean;
  annuityPremiumPaying?: boolean;
  deferredRetirementTax: number;
};

export type PrivatePensionPolicy = {
  minimumStartAge: number;
  minimumAccountYears: number;
  deferredRetirementIncomeAccountYearsExempt: boolean;
  pensionLimitDenominatorBase: number;
  pensionLimitMultiplier: number;
  localIncomeTaxRateOnIncomeTax: number;
  privatePensionTaxRates: { ageFrom: number; ageTo?: number; rate: number }[];
  deferredRetirementTaxFactors: {
    pensionYearFrom: number;
    pensionYearTo?: number;
    factor: number;
  }[];
  guides: PrivatePensionGuide[];
  notes: string[];
};

export type PrivatePensionGuide = {
  kind: AdditionalPensionKind;
  title: string;
  receiptStart: string;
  receiptPeriod: string;
  receiptMethod: string;
  delayEffect: string;
  simulatorTip: string;
  caution: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type Policy = {
  schemaVersion: '1.0';
  policyId: string;
  effectiveDate: string;
  minimumContributionMonths: number;
  earlyReductionPerMonth: number;
  deferredBonusPerMonth: number;
  survivorAdditionalRate: number;
  normalClaimAges: { from: number; to?: number; age: number }[];
  survivorRates: { from: number; to?: number; rate: number }[];
  npsGuides: NpsPolicyGuide[];
  privatePension: PrivatePensionPolicy;
  notes: string[];
};

export type NationalPensionInflationSettings = {
  enabled: boolean;
  annualRate: number;
};

export const defaultNationalPensionInflationSettings =
  (): NationalPensionInflationSettings => ({
    enabled: true,
    annualRate: 2.1,
  });

export type NpsPolicyGuide = {
  id: 'normal' | 'early' | 'deferred' | 'continuation' | 'survivor';
  title: string;
  qualification: string;
  timing: string;
  amountRule: string;
  simulatorTip: string;
  caution: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type PersonResult = PersonInput & {
  birthDate: Date;
  normalAge: number;
  claimYear: number;
  deathYear: number;
  creditedMonths: number;
  normalMonthlyPension: number;
  selectedMonthlyPension: number;
  additionalContribution: number;
  adjustmentFactor: number;
};

export type AnnualRow = {
  year: number;
  ageA: number;
  pensionA: number;
  ageB: number | null;
  pensionB: number;
  nationalPensionA: number;
  nationalPensionB: number;
  additionalPensionA: number;
  additionalPensionB: number;
  estimatedNetA: number;
  estimatedNetB: number;
  combined: number;
  estimatedNetCombined: number;
  status: string;
  detailA?: string;
  detailB?: string;
};

export type SimulationResult = {
  a: PersonResult;
  b: PersonResult | null;
  bothAliveMonthly: number;
  afterFirstDeathMonthly: number | null;
  survivorDecision: string | null;
  survivorCalculation: string | null;
  totalAdditionalContribution: number;
  bothAliveNationalMonthly: number;
  bothAliveAdditionalMonthly: number;
  estimatedBothAliveNetMonthly: number;
  additionalPensions: AdditionalPensionSummary[];
  rows: AnnualRow[];
  warnings: string[];
};

export type AdditionalPensionSummary = AdditionalPensionInput & {
  ownerName: string;
  startYear: number;
  projectedStartBalance: number | null;
  projectedContributionUntilStart: number | null;
  projectedInvestmentGainBeforeStart: number | null;
  grossMonthly: number;
  firstYearEstimatedNetMonthly: number;
  firstYearAnnualPensionLimit: number | null;
  limitExceeded: boolean;
};

export const DEFAULT_POLICY: Policy = {
  schemaVersion: '1.0',
  policyId: 'KR-PENSION-2026.08.1',
  effectiveDate: '2026-08-30',
  minimumContributionMonths: 120,
  earlyReductionPerMonth: 0.005,
  deferredBonusPerMonth: 0.006,
  survivorAdditionalRate: 0.3,
  normalClaimAges: [
    { from: 1900, to: 1953, age: 60 },
    { from: 1953, to: 1957, age: 61 },
    { from: 1957, to: 1961, age: 62 },
    { from: 1961, to: 1965, age: 63 },
    { from: 1965, to: 1969, age: 64 },
    { from: 1969, age: 65 },
  ],
  survivorRates: [
    { from: 0, to: 120, rate: 0.4 },
    { from: 120, to: 240, rate: 0.5 },
    { from: 240, rate: 0.6 },
  ],
  npsGuides: [
    {
      id: 'normal',
      title: '정상 노령연금',
      qualification:
        '국민연금 가입기간이 10년(120개월) 이상이고 출생연도별 지급개시연령에 도달하면 매월 노령연금을 받을 수 있습니다.',
      timing:
        '1952년생 이전 60세, 1953~1956년생 61세, 1957~1960년생 62세, 1961~1964년생 63세, 1965~1968년생 64세, 1969년생 이후 65세가 정상 지급개시연령입니다.',
      amountRule:
        '가입기간과 가입 중 기준소득월액 등을 반영해 공단이 산정합니다. 프로그램은 NPS 앱에 표시된 세전 예상연금을 기준값으로 사용합니다.',
      simulatorTip:
        '생년월일·공단 세전 월 예상연금·총 예상 가입개월을 그대로 입력하면 정상 수령 나이를 자동 선택합니다.',
      caution:
        '실제 수급 개시월과 연금액은 가입 이력, 크레딧, 소득활동과 공단 확정값에 따라 달라질 수 있습니다.',
      sourceLabel: '국민연금공단 노령연금 안내',
      sourceUrl: 'https://ma.nps.or.kr/pnsinfo/ntpsklg/getOHAF0056M0.do',
    },
    {
      id: 'early',
      title: '조기 노령연금',
      qualification:
        '가입기간 10년 이상이고 출생연도별 조기 지급개시연령에 도달했으며, 소득 있는 업무에 종사하지 않는 경우 신청할 수 있습니다.',
      timing:
        '정상 지급개시연령보다 최대 5년 먼저 받을 수 있습니다. 정상 65세인 사람은 조건 충족 시 60세부터 선택할 수 있습니다.',
      amountRule:
        '1개월 일찍 받을 때마다 0.5%, 1년마다 6%가 평생 감액됩니다. 최대 5년 조기수령하면 30% 감액됩니다.',
      simulatorTip:
        '전략 보고서에서 정상연령 전의 나이를 선택하면 감액률을 자동 반영합니다. 임의계속가입 종료 전 나이는 선택할 수 없습니다.',
      caution:
        '소득 있는 업무에 종사하게 되면 지급정지 등 실제 조건이 발생할 수 있으므로 조기수령 가능 여부를 공단에 확인해야 합니다.',
      sourceLabel: '국민연금공단 조기노령연금 안내',
      sourceUrl: 'https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0100M0.do',
    },
    {
      id: 'deferred',
      title: '연기연금',
      qualification:
        '노령연금 수급권자가 희망하면 정상 지급개시연령부터 최대 5년 동안 연금액의 전부 또는 일부를 연기할 수 있습니다.',
      timing:
        '연기 비율은 일부 또는 전부를 선택할 수 있으며, 프로그램은 비교가 쉽도록 전체 연금을 0~5년 연기하는 경우를 계산합니다.',
      amountRule:
        '연기한 부분은 1개월마다 0.6%, 1년마다 7.2% 가산됩니다. 5년 전체 연기 시 36% 가산됩니다.',
      simulatorTip:
        '전략 보고서에서 정상연령 이후 나이를 선택하면 해당 개월의 가산률을 자동 적용합니다.',
      caution:
        '연기 중 받지 못한 금액과 가산 후 금액의 손익분기점, 예상 수명, 연금소득세·건강보험료 영향을 함께 판단해야 합니다.',
      sourceLabel: '국민연금공단 연기연금 안내',
      sourceUrl: 'https://ma.nps.or.kr/pnsinfo/ntpsklg/getOHAF0056M0.do',
    },
    {
      id: 'continuation',
      title: '임의계속가입',
      qualification:
        '60세가 되었지만 가입기간을 늘리거나 10년 수급요건을 채우려는 가입자 또는 가입자였던 사람은 공단 심사를 거쳐 임의계속가입을 신청할 수 있습니다.',
      timing:
        '일반적으로 65세가 될 때까지 가입기간을 연장할 수 있습니다. 실제 가입 가능 여부와 기준소득월액·보험료는 가입 유형과 공단 결정에 따릅니다.',
      amountRule:
        '보험료를 추가 납부해 가입기간이 늘어나면 노령연금액도 증가할 수 있습니다. 정확한 증가액은 공단 계산이 우선합니다.',
      simulatorTip:
        '전략 보고서에서 0~5년과 월 납입액을 선택하면 공단 예상연금과 기존 가입기간을 기준으로 추가 연금액을 근사 계산합니다.',
      caution:
        '프로그램의 추가 연금액은 Anchor Mode 추정치입니다. 납부 가능 여부, 실제 보험료와 증가액을 국민연금공단에 확인하세요.',
      sourceLabel: '국가법령정보센터 국민연금법',
      sourceUrl: 'https://www.law.go.kr/lsInfoP.do?lsId=001781',
    },
    {
      id: 'survivor',
      title: '유족연금·중복조정',
      qualification:
        '가입자·가입자였던 사람 또는 노령·장애연금 수급권자가 사망하면 생계를 유지하던 유족이 법정 요건을 충족할 때 유족연금을 받을 수 있습니다.',
      timing:
        '사망자의 가입기간에 따라 기본연금액의 40%(10년 미만), 50%(10년 이상 20년 미만), 60%(20년 이상)를 기준으로 산정하며 부양가족연금액 등이 반영될 수 있습니다.',
      amountRule:
        '생존 배우자에게 본인 노령연금과 유족연금 수급권이 함께 생기면 보통 본인 급여에 유족연금액의 30%를 더하는 방법과 유족연금 전액 중 유리한 쪽을 선택합니다.',
      simulatorTip:
        '배우자가 국민연금에 가입하지 않았더라도 “배우자 있음”을 선택하고 생년월일·예상 사망 나이를 입력하면 유족연금 흐름을 계산합니다.',
      caution:
        '생계유지, 납부 이력, 유족 범위와 지급정지 요건을 모두 판정하지 못하므로 프로그램 결과보다 공단 수급권 확인이 우선합니다.',
      sourceLabel: '국민연금공단 유족연금 안내',
      sourceUrl:
        'https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0072M0.do?menuId=MN24001121',
    },
  ],
  privatePension: {
    minimumStartAge: 55,
    minimumAccountYears: 5,
    deferredRetirementIncomeAccountYearsExempt: true,
    pensionLimitDenominatorBase: 11,
    pensionLimitMultiplier: 1.2,
    localIncomeTaxRateOnIncomeTax: 0.1,
    privatePensionTaxRates: [
      { ageFrom: 0, ageTo: 70, rate: 0.05 },
      { ageFrom: 70, ageTo: 80, rate: 0.04 },
      { ageFrom: 80, rate: 0.03 },
    ],
    deferredRetirementTaxFactors: [
      { pensionYearFrom: 1, pensionYearTo: 11, factor: 0.7 },
      { pensionYearFrom: 11, pensionYearTo: 21, factor: 0.6 },
      { pensionYearFrom: 21, factor: 0.5 },
    ],
    guides: [
      {
        kind: 'pensionSavings',
        title: '연금저축',
        receiptStart:
          '세법상 연금수령은 원칙적으로 만 55세 이상이면서 계좌 가입일부터 5년이 지난 뒤 신청할 수 있습니다.',
        receiptPeriod:
          '“가입 5년”은 계좌 유지 요건이지 5년 동안만 받아야 한다는 뜻이 아닙니다. 금융기관 상품에 따라 5년·10년·15년·20년 등 기간을 선택할 수 있으며, 세법상 연금수령한도도 함께 확인해야 합니다.',
        receiptMethod:
          '적립금을 정해진 기간에 나누어 받거나 금융기관이 제시하는 연금 방식으로 받습니다. 중도해지나 한도 초과 인출은 연금 외 수령으로 과세될 수 있습니다.',
        delayEffect:
          '국민연금처럼 법정 연기 가산률은 없습니다. 늦춘 기간 동안 적립금이 계속 운용되고 추가 납입하면 개시 적립금이 늘 수 있지만, 그동안 못 받은 연금과 투자손실 위험을 함께 비교해야 합니다. 수령 나이가 높아지면 적용되는 원천징수율이 낮아질 수 있습니다.',
        simulatorTip:
          '금융기관 앱에 월 예상액이 있으면 직접 입력하고, 적립금만 알면 현재 적립금·계좌 개설 연월·기간·기대수익률·수수료를 입력하세요. 수령 시작 시 가입기간은 자동 계산됩니다.',
        caution:
          '세액공제를 받지 않은 원금, 세액공제 받은 납입금, 운용수익의 과세가 서로 다를 수 있어 최종 세금은 금융기관 자료가 우선합니다.',
        sourceLabel: '국세청 연금소득 안내',
        sourceUrl:
          'https://ems.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7885&mi=6449',
      },
      {
        kind: 'irpPersonal',
        title: 'IRP 개인납입분',
        receiptStart:
          '개인이 추가 납입한 IRP 자금은 원칙적으로 만 55세 이상이고 계좌 가입일부터 5년이 지난 뒤 연금으로 받을 수 있습니다.',
        receiptPeriod:
          '수령기간은 하나로 고정된 것이 아닙니다. 금융기관 상품 범위에서 기간형 또는 연금 방식으로 선택하며 세법상 연금수령한도를 확인해야 합니다.',
        receiptMethod:
          '연금으로 나누어 받거나 법에서 허용한 사유·조건에 따라 인출합니다. 단순 중도인출은 제한되며 세금이 달라질 수 있습니다.',
        delayEffect:
          '개시를 늦춘다는 이유만으로 정해진 보너스가 붙지는 않습니다. 계좌 운용수익과 추가 납입으로 잔액이 커질 가능성과 수령하지 못한 기간의 기회비용을 비교해야 합니다.',
        simulatorTip:
          '계좌 개설 연월을 입력하면 선택한 수령 시작 시점까지의 가입기간을 자동 계산합니다. IRP 안에 개인납입금과 퇴직급여가 함께 있다면 가능하면 금융기관 제공 월 예상액을 입력하세요.',
        caution:
          '같은 IRP라도 개인납입분과 이연퇴직소득은 세후 계산 방식이 다르므로 하나의 세율로 단정할 수 없습니다.',
        sourceLabel: '국세청 연금소득 안내',
        sourceUrl:
          'https://ems.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7885&mi=6449',
      },
      {
        kind: 'retirementIrp',
        title: '퇴직급여 IRP',
        receiptStart:
          '퇴직급여가 이체된 IRP는 만 55세 이상부터 연금수령이 가능하며, 이연퇴직소득이 들어 있는 경우 일반적인 계좌 가입 5년 요건의 예외가 적용됩니다.',
        receiptPeriod:
          '금융기관에서 제공하는 기간형 수령 등을 선택할 수 있습니다. 연금수령 연차가 길어지면 이연퇴직소득에 적용되는 퇴직소득세 부담이 단계적으로 낮아질 수 있습니다.',
        receiptMethod:
          '연금으로 나누어 받거나 일시금으로 받을 수 있습니다. 일시금과 연금은 적용되는 퇴직소득세 방식이 다릅니다.',
        delayEffect:
          '개시 전 계좌를 계속 운용하면 적립금이 변할 수 있지만 법정 연기 가산률은 없습니다. 이연퇴직소득의 70%·60%·50% 세율 단계는 개시 전 대기기간이 아니라 실제 연금수령 연차를 기준으로 합니다.',
        simulatorTip:
          '예상 적립금 또는 금융기관 월 예상액을 입력하고, 알고 있다면 “일시금 수령 시 예상 퇴직소득세”도 입력하세요.',
        caution:
          '퇴직소득세 예상액을 입력하지 않으면 프로그램의 세후액에는 해당 세금이 차감되지 않습니다.',
        sourceLabel: '고용노동부 퇴직연금 안내',
        sourceUrl: 'https://www.moel.go.kr/retirementpay.do',
      },
      {
        kind: 'dbdc',
        title: 'DB·DC 퇴직연금',
        receiptStart:
          '퇴직연금 급여는 만 55세 이후 연금 또는 일시금으로 받을 수 있습니다. DB는 사전에 정한 급여 수준, DC는 개인 계좌의 적립금과 운용성과가 중심입니다.',
        receiptPeriod:
          '실제 연금 수령기간과 선택지는 가입한 제도와 금융기관 상품에 따라 달라집니다. 프로그램에 표시된 5년·10년 등은 비교 계산을 위한 선택값이지 모든 상품의 보장 조건은 아닙니다.',
        receiptMethod:
          '퇴직 시 일시금으로 받거나 IRP 등을 통해 연금으로 나누어 받을 수 있습니다. 실제 지급과 IRP 이전 예외는 퇴직 당시 조건을 확인해야 합니다.',
        delayEffect:
          'DB·DC에도 국민연금과 같은 일률적인 연기 보너스는 없습니다. DC·IRP 잔액은 계속 운용될 수 있고, DB 급여는 회사 제도와 퇴직 시점의 산식이 우선하므로 금융기관·회사 예상액을 확인해야 합니다.',
        simulatorTip:
          'DB는 회사·금융기관의 예상 퇴직급여를 입력하는 것이 안전합니다. DC는 현재 적립금과 회사 규약상의 월납·분기납·반기납·연납 주기 및 회당 부담금을 입력할 수 있습니다.',
        caution:
          '미래 임금, 근속기간, 운용수익률과 수수료에 따라 실제 금액이 달라질 수 있습니다.',
        sourceLabel: '고용노동부 퇴직연금 안내',
        sourceUrl: 'https://www.moel.go.kr/retirementpay.do',
      },
      {
        kind: 'annuityInsurance',
        title: '일반 연금보험',
        receiptStart:
          '법에서 모든 상품에 하나의 개시 나이를 정하는 방식이 아니라 보험계약의 연금개시 나이가 우선합니다. 가입설계서와 보험사 앱에서 개시 나이를 확인해야 합니다.',
        receiptPeriod:
          '5년·10년·20년 보증형, 확정기간형, 종신형 등 상품별 선택지가 다릅니다. “5년 가입 후 수령” 규칙을 연금저축과 동일하게 적용하면 안 됩니다.',
        receiptMethod:
          '확정기간 동안 받거나 생존 중 종신으로 받는 방식 등이 있으며, 사망 후 보증 지급과 수익자 지급은 계약 조건에 따릅니다.',
        delayEffect:
          '개시를 늦추면 운용기간이 길고 예상 지급기간이 짧아져 월액이 커질 수 있지만 상품별 예정이율·사망률·보증기간에 따라 다릅니다. 보험사가 개시 나이별로 제시한 월액이 우선합니다.',
        simulatorTip:
          '보험 계약 시작 연월을 입력하고 약정 납입기간을 정확히 알면 체크한 뒤 기간을 선택하세요. 모르면 현재까지 납입 중인 것으로 보고 최소 5년부터 다음 5년 단위 기간을 자동 선택합니다. 사망률·예정이율·보증기간은 임의로 추정하지 않고 보험사가 제공한 세전 월 예상액을 직접 입력합니다.',
        caution:
          '보험차익 비과세 여부와 중도해지 환급금은 계약기간·납입방식 등 별도 요건이 있으므로 상품 설명서를 확인하세요.',
        sourceLabel: '금융감독원 통합연금포털',
        sourceUrl: 'https://100lifeplan.fss.or.kr/',
      },
    ],
    notes: [
      '일반 연금보험은 계약별 개시 나이·보증기간·종신 조건이 달라 보험사 예상 월액을 우선합니다.',
      '사적연금 세후액은 원천징수 기준 참고치이며 연간 합계와 다른 소득에 따라 최종 세액이 달라질 수 있습니다.',
      '월납·분기납·반기납·연납 추가금은 각 납입주기의 마지막에 들어오는 것으로 가정해 운용수익을 계산합니다.',
    ],
  },
  notes: [
    '추가 가입에 따른 연금 증가는 공단 예상연금을 가입개월과 보험료 비율로 환산한 Anchor Mode 근사입니다.',
    '유족연금은 실제 수급권·생계유지 요건을 반영하지 못하므로 국민연금공단 확인값이 우선합니다.',
  ],
};

const round = (value: number) => Math.round(value);

function nationalPensionInflationFactor(
  year: number,
  firstPaymentYear: number,
  settings: NationalPensionInflationSettings,
) {
  if (!settings.enabled || year <= firstPaymentYear) return 1;
  return (
    (1 + Math.min(20, Math.max(-10, settings.annualRate)) / 100) **
    (year - firstPaymentYear)
  );
}

export function parseBirth(value: string): Date {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8)
    throw new Error('생년월일은 19800101처럼 8자리로 입력하세요.');
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    throw new Error('생년월일을 확인하세요.');
  return date;
}

export function normalClaimAge(birthYear: number, policy: Policy): number {
  return (
    policy.normalClaimAges.find(
      (x) => birthYear >= x.from && (x.to == null || birthYear < x.to),
    )?.age ?? 65
  );
}

export function claimAgeOptions(
  birth: string,
  continuationYears: number,
  policy: Policy,
): { age: number; disabled: boolean; normal: boolean }[] {
  let normal = 65;
  try {
    normal = normalClaimAge(parseBirth(birth).getFullYear(), policy);
  } catch {
    /* 입력 중 */
  }
  return Array.from({ length: 11 }, (_, i) => normal - 5 + i).map((age) => ({
    age,
    normal: age === normal,
    disabled: age < 60 + continuationYears,
  }));
}

function personResult(input: PersonInput, policy: Policy): PersonResult {
  const birthDate = parseBirth(input.birth);
  const normalAge = normalClaimAge(birthDate.getFullYear(), policy);
  if (!input.hasNps) {
    return {
      ...input,
      normalAge,
      birthDate,
      claimYear: birthDate.getFullYear() + normalAge,
      deathYear: birthDate.getFullYear() + input.deathAge,
      creditedMonths: 0,
      normalMonthlyPension: 0,
      selectedMonthlyPension: 0,
      additionalContribution: 0,
      adjustmentFactor: 1,
    };
  }
  if (input.anchoredMonthlyPension <= 0)
    throw new Error(`${input.name}: 세전 월 예상연금을 입력하세요.`);
  if (input.expectedMonths <= 0)
    throw new Error(`${input.name}: 총 예상 가입개월을 입력하세요.`);
  if (input.claimAge < normalAge - 5 || input.claimAge > normalAge + 5)
    throw new Error(`${input.name}: 수령 나이를 확인하세요.`);
  if (input.claimAge < 60 + input.continuationYears)
    throw new Error(
      `${input.name}: 임의계속가입 종료 전에는 연금을 받을 수 없습니다.`,
    );
  const continuationMonths = input.continuationYears * 12;
  const anchorPremium =
    input.currentMonthlyPremium > 0
      ? input.currentMonthlyPremium
      : input.totalExpectedContribution > 0
        ? input.totalExpectedContribution / input.expectedMonths
        : 0;
  const premiumRatio =
    anchorPremium > 0 && input.continuationPremium > 0
      ? input.continuationPremium / anchorPremium
      : 1;
  const equivalentMonths =
    input.expectedMonths + continuationMonths * premiumRatio;
  const creditedMonths = input.expectedMonths + continuationMonths;
  const normalMonthlyPension =
    creditedMonths >= policy.minimumContributionMonths
      ? round(
          (input.anchoredMonthlyPension * equivalentMonths) /
            input.expectedMonths,
        )
      : 0;
  const offset = input.claimAge - normalAge;
  const adjustmentFactorRaw =
    offset < 0
      ? 1 + offset * 12 * policy.earlyReductionPerMonth
      : 1 + offset * 12 * policy.deferredBonusPerMonth;
  const adjustmentFactor = Math.round(adjustmentFactorRaw * 1000) / 1000;
  return {
    ...input,
    birthDate,
    normalAge,
    claimYear: birthDate.getFullYear() + input.claimAge,
    deathYear: birthDate.getFullYear() + input.deathAge,
    creditedMonths,
    normalMonthlyPension,
    selectedMonthlyPension: round(normalMonthlyPension * adjustmentFactor),
    additionalContribution: round(
      continuationMonths * input.continuationPremium,
    ),
    adjustmentFactor,
  };
}

export function pensionAtClaimAge(
  input: PersonInput,
  policy: Policy,
  claimAge: number,
): PersonResult {
  return personResult({ ...input, claimAge }, policy);
}

function survivorRate(months: number, policy: Policy) {
  return (
    policy.survivorRates.find(
      (x) => months >= x.from && (x.to == null || months < x.to),
    )?.rate ?? 0
  );
}

function estimateRawSurvivor(deceased: PersonResult, policy: Policy) {
  if (deceased.normalMonthlyPension <= 0) return 0;
  const oldAgeRate = Math.min(
    1,
    0.5 + Math.max(0, deceased.creditedMonths - 120) * (0.05 / 12),
  );
  if (oldAgeRate <= 0) return 0;
  const basic = deceased.normalMonthlyPension / oldAgeRate;
  return Math.min(
    round(basic * survivorRate(deceased.creditedMonths, policy)),
    deceased.selectedMonthlyPension,
  );
}

function ageAt(person: PersonResult, year: number) {
  return year - person.birthDate.getFullYear();
}

const isRetirementIncomeKind = (kind: AdditionalPensionKind) =>
  kind === 'retirementIrp' || kind === 'dbdc';

const isTaxQualifiedKind = (kind: AdditionalPensionKind) =>
  kind !== 'annuityInsurance';

function projectedBalanceAtStart(account: AdditionalPensionInput) {
  if (account.expectedBalance <= 0)
    throw new Error(
      `${account.name || '추가 연금'}: 현재 적립금을 입력하세요.`,
    );
  const baseAge = account.balanceBaseAge ?? account.startAge;
  if (baseAge > account.startAge)
    throw new Error(
      `${account.name || '추가 연금'}: 현재 나이보다 이른 수령 시작 나이는 선택할 수 없습니다.`,
    );
  const months = Math.max(0, account.startAge - baseAge) * 12;
  const contributionEndAge = Math.min(
    account.startAge,
    account.contributionEndAge ?? account.startAge,
  );
  const contributionMonths = Math.max(0, contributionEndAge - baseAge) * 12;
  const legacyMonthlyContribution = account.monthlyContributionUntilStart ?? 0;
  const frequency =
    account.contributionFrequency ??
    (legacyMonthlyContribution > 0 ? 'monthly' : 'none');
  const contribution = account.contributionAmount ?? legacyMonthlyContribution;
  const contributionInterval =
    frequency === 'monthly'
      ? 1
      : frequency === 'quarterly'
        ? 3
        : frequency === 'semiannual'
          ? 6
          : frequency === 'annual'
            ? 12
            : 0;
  const netMonthlyRate =
    ((account.annualReturnRateBeforeStart ?? 0) - account.annualFeeRate) /
    100 /
    12;
  if (months === 0) return round(account.expectedBalance);
  let balance = account.expectedBalance;
  for (let month = 1; month <= months; month++) {
    balance *= 1 + netMonthlyRate;
    if (
      contributionInterval > 0 &&
      contribution > 0 &&
      month <= contributionMonths &&
      month % contributionInterval === 0
    )
      balance += contribution;
  }
  return round(balance);
}

function projectedContributionUntilStart(account: AdditionalPensionInput) {
  const baseAge = account.balanceBaseAge ?? account.startAge;
  const contributionEndAge = Math.min(
    account.startAge,
    account.contributionEndAge ?? account.startAge,
  );
  const months = Math.max(0, contributionEndAge - baseAge) * 12;
  const legacyMonthlyContribution = account.monthlyContributionUntilStart ?? 0;
  const frequency =
    account.contributionFrequency ??
    (legacyMonthlyContribution > 0 ? 'monthly' : 'none');
  const contribution = account.contributionAmount ?? legacyMonthlyContribution;
  const interval =
    frequency === 'monthly'
      ? 1
      : frequency === 'quarterly'
        ? 3
        : frequency === 'semiannual'
          ? 6
          : frequency === 'annual'
            ? 12
            : 0;
  if (interval <= 0 || contribution <= 0) return 0;
  return round(Math.floor(months / interval) * contribution);
}

function monthlyFromBalance(account: AdditionalPensionInput) {
  if (account.payoutYears <= 0)
    throw new Error(
      `${account.name || '추가 연금'}: 적립금 계산은 수령기간을 선택하세요. 종신형은 금융기관 월 예상액을 입력하세요.`,
    );
  const months = account.payoutYears * 12;
  const startBalance = projectedBalanceAtStart(account);
  const netMonthlyRate =
    (account.annualReturnRate - account.annualFeeRate) / 100 / 12;
  if (Math.abs(netMonthlyRate) < 0.0000001) return round(startBalance / months);
  const denominator = 1 - Math.pow(1 + netMonthlyRate, -months);
  if (denominator <= 0) return round(startBalance / months);
  return round((startBalance * netMonthlyRate) / denominator);
}

function privateIncomeTaxRate(age: number, policy: Policy) {
  return (
    policy.privatePension.privatePensionTaxRates.find(
      (x) => age >= x.ageFrom && (x.ageTo == null || age < x.ageTo),
    )?.rate ?? 0
  );
}

function deferredTaxFactor(pensionYear: number, policy: Policy) {
  return (
    policy.privatePension.deferredRetirementTaxFactors.find(
      (x) =>
        pensionYear >= x.pensionYearFrom &&
        (x.pensionYearTo == null || pensionYear < x.pensionYearTo),
    )?.factor ?? 1
  );
}

function pensionLimit(
  account: AdditionalPensionInput,
  pensionYear: number,
  policy: Policy,
) {
  if (!isTaxQualifiedKind(account.kind) || account.expectedBalance <= 0)
    return null;
  const denominator =
    policy.privatePension.pensionLimitDenominatorBase - pensionYear;
  if (denominator <= 0) return null;
  return round(
    (projectedBalanceAtStart(account) / denominator) *
      policy.privatePension.pensionLimitMultiplier,
  );
}

export function accountTenureMonthsAtStart(
  account: AdditionalPensionInput,
  birth: string,
) {
  if (!account.accountOpenDate)
    return Math.max(0, account.accountYearsAtStart || 0) * 12;
  const match = /^(\d{4})-(\d{2})$/.exec(account.accountOpenDate);
  if (!match) throw new Error('계좌 개설 연월을 확인하세요.');
  const openYear = Number(match[1]);
  const openMonth = Number(match[2]);
  if (openMonth < 1 || openMonth > 12)
    throw new Error('계좌 개설 월을 확인하세요.');
  const birthDate = parseBirth(birth);
  const startYear = birthDate.getFullYear() + account.startAge;
  const startMonth = birthDate.getMonth() + 1;
  return (startYear - openYear) * 12 + (startMonth - openMonth);
}

export function recommendedAnnuityPaymentTermYears(
  contractStartDate?: string,
  premiumPaying = true,
  asOf = new Date(),
) {
  const minimumYears = 5;
  if (!premiumPaying || !contractStartDate) return minimumYears;
  const match = /^(\d{4})-(\d{2})$/.exec(contractStartDate);
  if (!match) return minimumYears;
  const startYear = Number(match[1]);
  const startMonth = Number(match[2]);
  if (startMonth < 1 || startMonth > 12) return minimumYears;
  const elapsedMonths =
    (asOf.getFullYear() - startYear) * 12 + (asOf.getMonth() + 1 - startMonth);
  if (elapsedMonths <= minimumYears * 12) return minimumYears;
  return Math.min(50, Math.ceil(elapsedMonths / 60) * 5);
}

export function annuityPaymentEndDate(
  contractStartDate?: string,
  paymentTermYears = 5,
) {
  const match = /^(\d{4})-(\d{2})$/.exec(contractStartDate ?? '');
  if (!match) return '';
  const startYear = Number(match[1]);
  const startMonth = Number(match[2]);
  if (startMonth < 1 || startMonth > 12) return '';
  return `${startYear + Math.max(1, paymentTermYears)}-${String(startMonth).padStart(2, '0')}`;
}

function validateAdditionalPension(
  account: AdditionalPensionInput,
  owner: PersonResult,
  policy: Policy,
) {
  const label = account.name || '추가 연금';
  if (!account.enabled) return;
  if (account.startAge <= 0)
    throw new Error(`${label}: 수령 시작 나이를 입력하세요.`);
  if (
    isTaxQualifiedKind(account.kind) &&
    account.startAge < policy.privatePension.minimumStartAge
  )
    throw new Error(
      `${label}: 세법상 연금계좌 수령 시작은 ${policy.privatePension.minimumStartAge}세 이상으로 입력하세요.`,
    );
  const accountYearsExempt =
    isRetirementIncomeKind(account.kind) &&
    policy.privatePension.deferredRetirementIncomeAccountYearsExempt;
  if (
    isTaxQualifiedKind(account.kind) &&
    !accountYearsExempt &&
    !account.accountOpenDate &&
    account.accountYearsAtStart <= 0
  )
    throw new Error(`${label}: 계좌 개설 연월을 입력하세요.`);
  const tenureMonths = accountTenureMonthsAtStart(account, owner.birth);
  if (
    isTaxQualifiedKind(account.kind) &&
    !accountYearsExempt &&
    tenureMonths < 0
  )
    throw new Error(`${label}: 계좌 개설 연월이 수령 시작 시점보다 늦습니다.`);
  if (
    isTaxQualifiedKind(account.kind) &&
    !accountYearsExempt &&
    tenureMonths < policy.privatePension.minimumAccountYears * 12
  )
    throw new Error(
      `${label}: 계좌 개설 후 ${policy.privatePension.minimumAccountYears}년이 지난 뒤 수령을 시작하도록 입력하세요.`,
    );
  if (owner.deathAge <= account.startAge)
    throw new Error(
      `${label}: 예상 사망 나이보다 수령 시작 나이가 빠른지 확인하세요.`,
    );
  if (account.calculationMode === 'monthly' && account.directMonthlyAmount <= 0)
    throw new Error(`${label}: 금융기관 예상 월 수령액을 입력하세요.`);
  if (account.calculationMode === 'balance') monthlyFromBalance(account);
}

function additionalPensionMonthly(
  account: AdditionalPensionInput,
  owner: PersonResult,
  year: number,
  policy: Policy,
) {
  const startYear = owner.birthDate.getFullYear() + account.startAge;
  const pensionYear = year - startYear + 1;
  if (!account.enabled || pensionYear < 1 || year > owner.deathYear)
    return { gross: 0, net: 0 };
  if (account.payoutYears > 0 && pensionYear > account.payoutYears)
    return { gross: 0, net: 0 };
  const gross =
    account.calculationMode === 'monthly'
      ? account.directMonthlyAmount
      : monthlyFromBalance(account);
  let tax = 0;
  if (account.kind === 'pensionSavings' || account.kind === 'irpPersonal') {
    const incomeTax = privateIncomeTaxRate(ageAt(owner, year), policy);
    tax =
      gross *
      incomeTax *
      (1 + policy.privatePension.localIncomeTaxRateOnIncomeTax);
  } else if (
    isRetirementIncomeKind(account.kind) &&
    account.deferredRetirementTax > 0
  ) {
    const payoutMonths = Math.max(12, account.payoutYears * 12);
    tax =
      (account.deferredRetirementTax / payoutMonths) *
      deferredTaxFactor(pensionYear, policy);
  }
  return { gross, net: Math.max(0, round(gross - tax)) };
}

function additionalPensionSummary(
  account: AdditionalPensionInput,
  owner: PersonResult,
  policy: Policy,
): AdditionalPensionSummary {
  validateAdditionalPension(account, owner, policy);
  const startYear = owner.birthDate.getFullYear() + account.startAge;
  const payment = additionalPensionMonthly(account, owner, startYear, policy);
  const projectedStartBalance =
    account.calculationMode === 'balance'
      ? projectedBalanceAtStart(account)
      : null;
  const projectedContribution =
    projectedStartBalance == null
      ? null
      : projectedContributionUntilStart(account);
  const projectedInvestmentGain =
    projectedStartBalance == null || projectedContribution == null
      ? null
      : round(
          projectedStartBalance -
            account.expectedBalance -
            projectedContribution,
        );
  const firstYearAnnualPensionLimit = pensionLimit(account, 1, policy);
  return {
    ...account,
    ownerName: owner.name,
    startYear,
    projectedStartBalance,
    projectedContributionUntilStart: projectedContribution,
    projectedInvestmentGainBeforeStart: projectedInvestmentGain,
    grossMonthly: payment.gross,
    firstYearEstimatedNetMonthly: payment.net,
    firstYearAnnualPensionLimit,
    limitExceeded:
      firstYearAnnualPensionLimit != null &&
      payment.gross * 12 > firstYearAnnualPensionLimit,
  };
}

export function previewAdditionalPension(
  account: AdditionalPensionInput,
  ownerInput: PersonInput,
  policy: Policy,
): AdditionalPensionSummary {
  return additionalPensionSummary(
    account,
    personResult(ownerInput, policy),
    policy,
  );
}

function summarizeAdditionalPensions(
  accounts: AdditionalPensionInput[],
  a: PersonResult,
  b: PersonResult | null,
  policy: Policy,
) {
  return accounts
    .filter((account) => account.enabled)
    .map((account): AdditionalPensionSummary => {
      const owner = account.owner === 'a' ? a : b;
      if (!owner)
        throw new Error(
          `${account.name || '추가 연금'}: 배우자 정보가 필요합니다.`,
        );
      return additionalPensionSummary(account, owner, policy);
    });
}

export function simulate(
  aInput: PersonInput,
  bInput: PersonInput,
  policy: Policy,
  additionalPensionInputs: AdditionalPensionInput[] = [],
  npsInflation: NationalPensionInflationSettings = {
    enabled: false,
    annualRate: 0,
  },
): SimulationResult {
  const a = personResult(aInput, policy);
  const b = bInput.enabled ? personResult(bInput, policy) : null;
  const additionalPensions = summarizeAdditionalPensions(
    additionalPensionInputs,
    a,
    b,
    policy,
  );
  const additionalStartYears = additionalPensions.map((x) => x.startYear);
  const earliest = Math.min(
    a.claimYear,
    b?.claimYear ?? a.claimYear,
    ...(additionalStartYears.length ? additionalStartYears : [a.claimYear]),
  );
  const end = Math.max(
    a.birthDate.getFullYear() + 95,
    b ? b.birthDate.getFullYear() + 95 : 0,
  );
  const firstDeathYear = b ? Math.min(a.deathYear, b.deathYear) : Infinity;
  const aDiesFirst = !!b && a.deathYear < b.deathYear;
  const bDiesFirst = !!b && b.deathYear < a.deathYear;
  let survivorDecision: string | null = null;
  let survivorCalculation: string | null = null;
  let afterFirstDeathMonthly: number | null = null;
  const rows: AnnualRow[] = [];

  for (let year = earliest; year <= end; year++) {
    const aliveA = year <= a.deathYear;
    const aliveB = !!b && year <= b.deathYear;
    let pensionA =
      aliveA && year >= a.claimYear
        ? round(
            a.selectedMonthlyPension *
              nationalPensionInflationFactor(year, a.claimYear, npsInflation),
          )
        : 0;
    let pensionB =
      aliveB && b && year >= b.claimYear
        ? round(
            b.selectedMonthlyPension *
              nationalPensionInflationFactor(year, b.claimYear, npsInflation),
          )
        : 0;
    let detailA = '';
    let detailB = '';
    let status = b ? '부부 생존' : '본인 수령';

    if (b && year > firstDeathYear && (aliveA || aliveB)) {
      const survivor = aDiesFirst ? b : a;
      const deceased = aDiesFirst ? a : b;
      const survivorStartYear = firstDeathYear + 1;
      const raw = round(
        estimateRawSurvivor(deceased, policy) *
          nationalPensionInflationFactor(year, survivorStartYear, npsInflation),
      );
      const own =
        year >= survivor.claimYear
          ? round(
              survivor.selectedMonthlyPension *
                nationalPensionInflationFactor(
                  year,
                  survivor.claimYear,
                  npsInflation,
                ),
            )
          : 0;
      const ownPlus = round(own + raw * policy.survivorAdditionalRate);
      const selected = Math.max(ownPlus, raw);
      const addition = Math.max(0, selected - own);
      status = `${deceased.name} 사망 후 · ${survivor.name} 수령`;
      survivorDecision =
        ownPlus >= raw
          ? `${survivor.name} 노령연금 + 유족연금 ${policy.survivorAdditionalRate * 100}%가 유리 (${selected.toLocaleString('ko-KR')}원)`
          : `노령연금을 포기하고 유족연금 전액이 유리 (${selected.toLocaleString('ko-KR')}원)`;
      survivorCalculation = `사망자 정상연금 역산 기본연금액 × 가입기간 지급률 ${(survivorRate(deceased.creditedMonths, policy) * 100).toFixed(0)}%; 전액 선택은 사망자 노령연금 100%가 아니라 산정된 유족연금의 100%입니다.`;
      if (aDiesFirst) {
        pensionA = 0;
        pensionB = selected;
        detailB = `본인 ${own.toLocaleString()} + 유족 추가 ${addition.toLocaleString()}`;
      }
      if (bDiesFirst) {
        pensionB = 0;
        pensionA = selected;
        detailA = `본인 ${own.toLocaleString()} + 유족 추가 ${addition.toLocaleString()}`;
      }
    }
    if (!aliveA) pensionA = 0;
    if (b && !aliveB) pensionB = 0;
    const additionalA = additionalPensions
      .filter((x) => x.owner === 'a')
      .reduce(
        (sum, account) => {
          const payment = additionalPensionMonthly(account, a, year, policy);
          return {
            gross: sum.gross + payment.gross,
            net: sum.net + payment.net,
          };
        },
        { gross: 0, net: 0 },
      );
    const additionalB = b
      ? additionalPensions
          .filter((x) => x.owner === 'b')
          .reduce(
            (sum, account) => {
              const payment = additionalPensionMonthly(
                account,
                b,
                year,
                policy,
              );
              return {
                gross: sum.gross + payment.gross,
                net: sum.net + payment.net,
              };
            },
            { gross: 0, net: 0 },
          )
      : { gross: 0, net: 0 };
    const nationalPensionA = pensionA;
    const nationalPensionB = pensionB;
    const grossA = pensionA + additionalA.gross;
    const grossB = pensionB + additionalB.gross;
    if (b && year > firstDeathYear && (aliveA || aliveB))
      afterFirstDeathMonthly ??= grossA + grossB;
    if (grossA + grossB > 0)
      rows.push({
        year,
        ageA: ageAt(a, year),
        pensionA: grossA,
        ageB: b ? ageAt(b, year) : null,
        pensionB: grossB,
        nationalPensionA,
        nationalPensionB,
        additionalPensionA: additionalA.gross,
        additionalPensionB: additionalB.gross,
        estimatedNetA: nationalPensionA + additionalA.net,
        estimatedNetB: nationalPensionB + additionalB.net,
        combined: grossA + grossB,
        estimatedNetCombined:
          nationalPensionA +
          nationalPensionB +
          additionalA.net +
          additionalB.net,
        status,
        detailA,
        detailB,
      });
  }

  const bothAliveYear = Math.max(
    a.claimYear,
    b?.claimYear ?? a.claimYear,
    ...(additionalStartYears.length ? additionalStartYears : [a.claimYear]),
  );
  const bothAliveRow = rows.find((row) => row.year === bothAliveYear);
  const bothAliveNationalMonthly =
    bothAliveRow?.nationalPensionA != null
      ? bothAliveRow.nationalPensionA + bothAliveRow.nationalPensionB
      : a.selectedMonthlyPension + (b?.selectedMonthlyPension ?? 0);
  const bothAliveAdditionalMonthly =
    bothAliveRow?.additionalPensionA != null
      ? bothAliveRow.additionalPensionA + bothAliveRow.additionalPensionB
      : 0;

  return {
    a,
    b,
    bothAliveMonthly: bothAliveNationalMonthly + bothAliveAdditionalMonthly,
    afterFirstDeathMonthly,
    survivorDecision,
    survivorCalculation,
    totalAdditionalContribution:
      a.additionalContribution + (b?.additionalContribution ?? 0),
    bothAliveNationalMonthly,
    bothAliveAdditionalMonthly,
    estimatedBothAliveNetMonthly:
      bothAliveRow?.estimatedNetCombined ??
      bothAliveNationalMonthly + bothAliveAdditionalMonthly,
    additionalPensions,
    rows,
    warnings: [
      ...policy.notes,
      ...(npsInflation.enabled
        ? [
            `국민연금은 수령 개시 다음 해부터 매년 ${npsInflation.annualRate.toFixed(1)}%의 동일한 물가변동률이 적용된다고 가정했습니다. 실제 연금액은 매년 1월 전년도 전국 소비자물가변동률에 따라 달라집니다.`,
          ]
        : [
            '국민연금 물가연동을 적용하지 않아 수령기간의 명목 월액이 동일하게 표시됩니다.',
          ]),
      ...policy.privatePension.notes,
      ...additionalPensions
        .filter((x) => x.limitExceeded)
        .map(
          (x) =>
            `${x.ownerName} ${x.name}: 첫해 연 수령액이 세법상 연금수령한도 추정액을 초과합니다. 초과 인출의 과세를 금융기관에 확인하세요.`,
        ),
      ...additionalPensions
        .filter(
          (x) => isRetirementIncomeKind(x.kind) && x.deferredRetirementTax <= 0,
        )
        .map(
          (x) =>
            `${x.ownerName} ${x.name}: 퇴직소득세 예상액이 없어 세후액에 퇴직소득세를 차감하지 않았습니다.`,
        ),
      '금액은 세전·현재가치 보정 전 참고 추정치입니다. 실제 급여액과 수급권은 국민연금공단 확인이 우선합니다.',
    ],
  };
}

export function validatePolicy(value: unknown): Policy {
  const p = value as Partial<Policy> & Record<string, unknown>;
  if (
    p?.schemaVersion === '1.0' &&
    typeof p.policyId === 'string' &&
    Array.isArray(p.normalClaimAges) &&
    Array.isArray(p.survivorRates)
  )
    return {
      ...(p as Policy),
      npsGuides: p.npsGuides ?? DEFAULT_POLICY.npsGuides,
      privatePension: {
        ...DEFAULT_POLICY.privatePension,
        ...p.privatePension,
        guides: (
          p.privatePension?.guides ?? DEFAULT_POLICY.privatePension.guides
        ).map((guide) => ({
          ...DEFAULT_POLICY.privatePension.guides.find(
            (fallback) => fallback.kind === guide.kind,
          ),
          ...guide,
        })) as PrivatePensionGuide[],
      },
    };
  const desktop = value as {
    schemaVersion?: string;
    policyPackId?: string;
    publishedAt?: string;
    normalClaimAges?: {
      birthYearFrom: number;
      birthYearToExclusive?: number | null;
      normalClaimAgeMonths: number;
    }[];
    pensionAdjustment?: {
      earlyReductionPerMonth: { numerator: number; denominator: number };
      deferredBonusPerMonth: { numerator: number; denominator: number };
    };
    qualification?: { minimumContributionMonths: number };
    duplicateBenefit?: {
      unselectedSurvivorPensionAdditionalRate: {
        numerator: number;
        denominator: number;
      };
    };
    survivorBenefit?: {
      pensionRates: {
        contributionMonthsFrom: number;
        contributionMonthsToExclusive?: number | null;
        rate: { numerator: number; denominator: number };
      }[];
    };
    notes?: string[];
  };
  if (
    desktop?.schemaVersion === '1.0.0' &&
    desktop.policyPackId &&
    desktop.normalClaimAges &&
    desktop.pensionAdjustment &&
    desktop.qualification &&
    desktop.duplicateBenefit &&
    desktop.survivorBenefit
  ) {
    const ratio = (x: { numerator: number; denominator: number }) =>
      x.numerator / x.denominator;
    return {
      schemaVersion: '1.0',
      policyId: desktop.policyPackId,
      effectiveDate: desktop.publishedAt?.slice(0, 10) ?? '',
      minimumContributionMonths:
        desktop.qualification.minimumContributionMonths,
      earlyReductionPerMonth: ratio(
        desktop.pensionAdjustment.earlyReductionPerMonth,
      ),
      deferredBonusPerMonth: ratio(
        desktop.pensionAdjustment.deferredBonusPerMonth,
      ),
      survivorAdditionalRate: ratio(
        desktop.duplicateBenefit.unselectedSurvivorPensionAdditionalRate,
      ),
      normalClaimAges: desktop.normalClaimAges.map((x) => ({
        from: x.birthYearFrom,
        ...(x.birthYearToExclusive == null
          ? {}
          : { to: x.birthYearToExclusive }),
        age: x.normalClaimAgeMonths / 12,
      })),
      survivorRates: desktop.survivorBenefit.pensionRates.map((x) => ({
        from: x.contributionMonthsFrom,
        ...(x.contributionMonthsToExclusive == null
          ? {}
          : { to: x.contributionMonthsToExclusive }),
        rate: ratio(x.rate),
      })),
      npsGuides: DEFAULT_POLICY.npsGuides,
      privatePension: DEFAULT_POLICY.privatePension,
      notes: desktop.notes ?? [],
    };
  }
  throw new Error(
    '지원하지 않는 정책 파일입니다. HTML 정책 1.0 또는 데스크톱 정책팩 1.0.0 형식을 확인하세요.',
  );
}
