export type RealEstatePolicySource = {
  title: string;
  url: string;
  checkedAt: string;
};

export type RealEstateCostPolicy = {
  schemaVersion: '1.0';
  policyId: string;
  effectiveDate: string;
  sources: RealEstatePolicySource[];
  brokerage: {
    vatRate: number;
    brackets: {
      priceBelow: number | null;
      upperRate: number;
      feeCap: number | null;
    }[];
  };
  acquisition: {
    standard: {
      lowPriceMax: number;
      lowRate: number;
      transitionPriceMax: number;
      transitionPriceUnit: number;
      transitionMultiplier: number;
      transitionOffset: number;
      highRate: number;
    };
    regulatedTwoHomeRate: number;
    regulatedThreeHomeRate: number;
    nonRegulatedThreeHomeRate: number;
    fourPlusHomeRate: number;
    localEducationRateForSurcharge: number;
    localEducationStandardMultiplier: number;
    ruralSpecialRateStandardLargeArea: number;
    ruralSpecialRateEightPercent: number;
    ruralSpecialRateTwelvePercent: number;
  };
  capitalGains: {
    oneHomeExemptionThreshold: number;
    basicDeductionPerOwner: number;
    localIncomeTaxRate: number;
    progressiveBrackets: {
      taxableBaseUpTo: number | null;
      rate: number;
      quickDeduction: number;
    }[];
    shortHoldingUnderOneYearRate: number;
    shortHoldingUnderTwoYearsRate: number;
    regulatedTwoHomeSurchargeRate: number;
    regulatedThreePlusHomeSurchargeRate: number;
    generalLongTermAnnualRate: number;
    generalLongTermMaximumRate: number;
    oneHomeHoldingAnnualRate: number;
    oneHomeHoldingMaximumRate: number;
    oneHomeResidenceAnnualRate: number;
    oneHomeResidenceMaximumRate: number;
    oneHomeMinimumResidenceYears: number;
  };
  holding?: {
    propertyTaxFairMarketValueRatio: number;
    oneHomeSpecialPriceMax: number;
    oneHomeRateReduction: number;
    propertyTaxBrackets: {
      taxableBaseUpTo: number | null;
      rate: number;
      quickDeduction: number;
    }[];
    localEducationTaxRate: number;
    urbanAreaTaxRate: number;
    comprehensive: {
      basicDeductionPerOwner: number;
      oneHouseholdOneHomeDeduction: number;
      fairMarketValueRatio: number;
      propertyTaxCreditRate: number;
      ruralSpecialTaxRate: number;
      standardBrackets: {
        taxableBaseUpTo: number | null;
        rate: number;
        quickDeduction: number;
      }[];
      threePlusHomeBrackets: {
        taxableBaseUpTo: number | null;
        rate: number;
        quickDeduction: number;
      }[];
    };
  };
  notes: string[];
};

export const DEFAULT_REAL_ESTATE_COST_POLICY: RealEstateCostPolicy = {
  schemaVersion: '1.0',
  policyId: 'KR-REAL-ESTATE-2026.09-ROUGH',
  effectiveDate: '2026-09-02',
  sources: [
    {
      title: '국가법령정보센터 주택 취득세율',
      url: 'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1031175463',
      checkedAt: '2026-09-02',
    },
    {
      title: '국가법령정보센터 주택 중개보수',
      url: 'https://www.law.go.kr/LSW/lbook/lbFileDownload.do?flExt=pdf&lbookConflSeq=85167&lbookSeq=91616',
      checkedAt: '2026-09-02',
    },
    {
      title: '국세청 양도소득세 세율 안내',
      url: 'https://webtv.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7711&mi=2312',
      checkedAt: '2026-09-02',
    },
    {
      title: '국세청 2026년 종합부동산세 요약',
      url: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7739&mi=2357',
      checkedAt: '2026-09-02',
    },
    {
      title: '국가법령정보센터 지방세법 제151조 지방교육세',
      url: 'https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0151&lsiSeq=282559&urlMode=lsScJoRltInfoR',
      checkedAt: '2026-09-02',
    },
  ],
  brokerage: {
    vatRate: 0.1,
    brackets: [
      { priceBelow: 50_000_000, upperRate: 0.006, feeCap: 250_000 },
      { priceBelow: 200_000_000, upperRate: 0.005, feeCap: 800_000 },
      { priceBelow: 900_000_000, upperRate: 0.004, feeCap: null },
      { priceBelow: 1_200_000_000, upperRate: 0.005, feeCap: null },
      { priceBelow: 1_500_000_000, upperRate: 0.006, feeCap: null },
      { priceBelow: null, upperRate: 0.007, feeCap: null },
    ],
  },
  acquisition: {
    standard: {
      lowPriceMax: 600_000_000,
      lowRate: 0.01,
      transitionPriceMax: 900_000_000,
      transitionPriceUnit: 100_000_000,
      transitionMultiplier: 2 / 3,
      transitionOffset: -3,
      highRate: 0.03,
    },
    regulatedTwoHomeRate: 0.08,
    regulatedThreeHomeRate: 0.12,
    nonRegulatedThreeHomeRate: 0.08,
    fourPlusHomeRate: 0.12,
    localEducationRateForSurcharge: 0.004,
    localEducationStandardMultiplier: 0.1,
    ruralSpecialRateStandardLargeArea: 0.002,
    ruralSpecialRateEightPercent: 0.006,
    ruralSpecialRateTwelvePercent: 0.01,
  },
  capitalGains: {
    oneHomeExemptionThreshold: 1_200_000_000,
    basicDeductionPerOwner: 2_500_000,
    localIncomeTaxRate: 0.1,
    progressiveBrackets: [
      { taxableBaseUpTo: 14_000_000, rate: 0.06, quickDeduction: 0 },
      { taxableBaseUpTo: 50_000_000, rate: 0.15, quickDeduction: 1_260_000 },
      { taxableBaseUpTo: 88_000_000, rate: 0.24, quickDeduction: 5_760_000 },
      { taxableBaseUpTo: 150_000_000, rate: 0.35, quickDeduction: 15_440_000 },
      { taxableBaseUpTo: 300_000_000, rate: 0.38, quickDeduction: 19_940_000 },
      { taxableBaseUpTo: 500_000_000, rate: 0.4, quickDeduction: 25_940_000 },
      {
        taxableBaseUpTo: 1_000_000_000,
        rate: 0.42,
        quickDeduction: 35_940_000,
      },
      { taxableBaseUpTo: null, rate: 0.45, quickDeduction: 65_940_000 },
    ],
    shortHoldingUnderOneYearRate: 0.7,
    shortHoldingUnderTwoYearsRate: 0.6,
    regulatedTwoHomeSurchargeRate: 0.2,
    regulatedThreePlusHomeSurchargeRate: 0.3,
    generalLongTermAnnualRate: 0.02,
    generalLongTermMaximumRate: 0.3,
    oneHomeHoldingAnnualRate: 0.04,
    oneHomeHoldingMaximumRate: 0.4,
    oneHomeResidenceAnnualRate: 0.04,
    oneHomeResidenceMaximumRate: 0.4,
    oneHomeMinimumResidenceYears: 2,
  },
  holding: {
    propertyTaxFairMarketValueRatio: 0.6,
    oneHomeSpecialPriceMax: 900_000_000,
    oneHomeRateReduction: 0.0005,
    propertyTaxBrackets: [
      { taxableBaseUpTo: 60_000_000, rate: 0.001, quickDeduction: 0 },
      { taxableBaseUpTo: 150_000_000, rate: 0.0015, quickDeduction: 30_000 },
      { taxableBaseUpTo: 300_000_000, rate: 0.0025, quickDeduction: 180_000 },
      { taxableBaseUpTo: null, rate: 0.004, quickDeduction: 630_000 },
    ],
    localEducationTaxRate: 0.2,
    urbanAreaTaxRate: 0.0014,
    comprehensive: {
      basicDeductionPerOwner: 900_000_000,
      oneHouseholdOneHomeDeduction: 1_200_000_000,
      fairMarketValueRatio: 0.6,
      propertyTaxCreditRate: 0.004,
      ruralSpecialTaxRate: 0.2,
      standardBrackets: [
        { taxableBaseUpTo: 300_000_000, rate: 0.005, quickDeduction: 0 },
        { taxableBaseUpTo: 600_000_000, rate: 0.007, quickDeduction: 600_000 },
        { taxableBaseUpTo: 1_200_000_000, rate: 0.01, quickDeduction: 2_400_000 },
        { taxableBaseUpTo: 2_500_000_000, rate: 0.013, quickDeduction: 6_000_000 },
        { taxableBaseUpTo: 5_000_000_000, rate: 0.015, quickDeduction: 11_000_000 },
        { taxableBaseUpTo: 9_400_000_000, rate: 0.02, quickDeduction: 36_000_000 },
        { taxableBaseUpTo: null, rate: 0.027, quickDeduction: 101_800_000 },
      ],
      threePlusHomeBrackets: [
        { taxableBaseUpTo: 300_000_000, rate: 0.005, quickDeduction: 0 },
        { taxableBaseUpTo: 600_000_000, rate: 0.007, quickDeduction: 600_000 },
        { taxableBaseUpTo: 1_200_000_000, rate: 0.01, quickDeduction: 2_400_000 },
        { taxableBaseUpTo: 2_500_000_000, rate: 0.02, quickDeduction: 14_400_000 },
        { taxableBaseUpTo: 5_000_000_000, rate: 0.03, quickDeduction: 39_400_000 },
        { taxableBaseUpTo: 9_400_000_000, rate: 0.04, quickDeduction: 89_400_000 },
        { taxableBaseUpTo: null, rate: 0.05, quickDeduction: 183_400_000 },
      ],
    },
  },
  notes: [
    '미래 거래연도에도 이 정책의 현재 세율을 그대로 적용하는 참고 추정입니다.',
    '실제 비과세·중과·감면·필요경비·조정대상지역 여부는 별도 확인해야 합니다.',
    '연간 보유세는 입력한 공시가격과 명의 지분을 바탕으로 재산세·지방교육세·도시지역분·종합부동산세·농어촌특별세를 단순 추정하며 세부담상한·고령자·장기보유·합산배제·감면은 반영하지 않습니다.',
  ],
};

export const REAL_ESTATE_ROUGH_POLICY_ID =
  DEFAULT_REAL_ESTATE_COST_POLICY.policyId;

export type OwnershipSettings = {
  jointOwnership: boolean;
  ownerAShareRate: number;
};

export type HoldingTaxSettings = OwnershipSettings & {
  enabled: boolean;
  includeInCashflow: boolean;
  assessedValue: number;
  householdHomeCount: 1 | 2 | 3;
  oneHouseholdOneHome: boolean;
  soleOwner: 'a' | 'b';
  includeUrbanAreaTax: boolean;
};

export type HoldingTaxPropertyInput = {
  id: string;
  name: string;
  marketValue: number;
  settings: HoldingTaxSettings;
};

export type HoldingTaxEstimate = {
  policyId: string;
  propertyTax: number;
  localEducationTax: number;
  urbanAreaTax: number;
  comprehensiveRealEstateTax: number;
  ruralSpecialTax: number;
  annualTotal: number;
  monthlyAverage: number;
  perProperty: {
    id: string;
    propertyTax: number;
    localEducationTax: number;
    urbanAreaTax: number;
    comprehensiveRealEstateTax: number;
    ruralSpecialTax: number;
    annualTotal: number;
  }[];
  assumptions: string[];
};

export type SaleCostAutoSettings = OwnershipSettings & {
  enabled: boolean;
  acquisitionYear: number;
  acquisitionPrice: number;
  residenceYears: number;
  necessaryExpenses: number;
  householdHomeCountAtSale: 1 | 2 | 3;
  regulatedArea: boolean;
  oneHouseExemptionEligible: boolean;
  includeBrokerageVat: boolean;
};

export type PurchaseHomeCount =
  | 'one_or_temporary_two'
  | 'two'
  | 'three'
  | 'four_plus';

export type PurchaseCostAutoSettings = OwnershipSettings & {
  enabled: boolean;
  homeCountAfterPurchase: PurchaseHomeCount;
  regulatedArea: boolean;
  exclusiveAreaOver85: boolean;
  includeBrokerageVat: boolean;
};

export type BrokerageEstimate = {
  rate: number;
  amountBeforeVat: number;
  vat: number;
  total: number;
};

export type SaleCostEstimate = {
  policyId: string;
  projectedSalePrice: number;
  brokerage: BrokerageEstimate;
  capitalGainsTax: number;
  localIncomeTax: number;
  totalCapitalGainsTaxes: number;
  totalSellingCosts: number;
  grossGain: number;
  taxableGainAfterExemption: number;
  longTermDeductionRate: number;
  ownerATax: number;
  ownerBTax: number;
  assumptions: string[];
};

export type PurchaseCostEstimate = {
  policyId: string;
  purchasePrice: number;
  acquisitionTaxRate: number;
  acquisitionTax: number;
  localEducationTax: number;
  ruralSpecialTax: number;
  brokerage: BrokerageEstimate;
  totalPurchaseCosts: number;
  ownerACostShare: number;
  ownerBCostShare: number;
  assumptions: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isRate = (value: unknown) =>
  isFiniteNumber(value) && value >= 0 && value <= 1;
const isDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function validateRealEstateCostPolicy(
  input: unknown,
): RealEstateCostPolicy {
  if (!isRecord(input) || input.schemaVersion !== '1.0')
    throw new Error('부동산 비용 정책 스키마는 1.0이어야 합니다.');
  const policy = input as unknown as RealEstateCostPolicy;
  if (
    typeof policy.policyId !== 'string' ||
    policy.policyId.length < 3 ||
    policy.policyId.length > 100 ||
    !isDate(policy.effectiveDate)
  )
    throw new Error('정책 ID 또는 시행 기준일(YYYY-MM-DD)을 확인하세요.');
  if (
    !Array.isArray(policy.sources) ||
    policy.sources.length === 0 ||
    policy.sources.length > 20 ||
    policy.sources.some(
      (source) =>
        !isRecord(source) ||
        typeof source.title !== 'string' ||
        source.title.length === 0 ||
        source.title.length > 200 ||
        typeof source.url !== 'string' ||
        !source.url.startsWith('https://') ||
        !isDate(source.checkedAt),
    )
  )
    throw new Error(
      '정책 출처는 제목·HTTPS URL·확인일을 포함해 한 건 이상 입력해야 합니다.',
    );
  if (!isRecord(policy.brokerage) || !isRate(policy.brokerage.vatRate))
    throw new Error('중개보수 VAT 비율을 확인하세요.');
  const brokerageBrackets = policy.brokerage.brackets;
  if (
    !Array.isArray(brokerageBrackets) ||
    brokerageBrackets.length === 0 ||
    brokerageBrackets.length > 20 ||
    brokerageBrackets.at(-1)?.priceBelow !== null ||
    brokerageBrackets.slice(0, -1).some((bracket, index) => {
      const threshold = bracket.priceBelow;
      return (
        !isRecord(bracket) ||
        !isFiniteNumber(threshold) ||
        threshold <=
          (index === 0 ? 0 : (brokerageBrackets[index - 1].priceBelow ?? 0))
      );
    }) ||
    brokerageBrackets.some(
      (bracket) =>
        !isRecord(bracket) ||
        !isRate(bracket.upperRate) ||
        (bracket.feeCap !== null &&
          (!isFiniteNumber(bracket.feeCap) || bracket.feeCap < 0)),
    )
  )
    throw new Error(
      '중개보수 구간은 오름차순이며 마지막 상한은 null이어야 합니다.',
    );
  if (!isRecord(policy.acquisition) || !isRecord(policy.acquisition.standard))
    throw new Error('취득 관련 세율 설정이 없습니다.');
  const acquisitionRateKeys = Object.keys(
    DEFAULT_REAL_ESTATE_COST_POLICY.acquisition,
  ).filter((key) => key !== 'standard') as Array<
    Exclude<keyof RealEstateCostPolicy['acquisition'], 'standard'>
  >;
  if (acquisitionRateKeys.some((key) => !isRate(policy.acquisition[key])))
    throw new Error('취득 관련 세율은 0~1 사이 소수로 입력하세요.');
  const standard = policy.acquisition.standard;
  if (
    !isFiniteNumber(standard.lowPriceMax) ||
    standard.lowPriceMax <= 0 ||
    !isRate(standard.lowRate) ||
    !isFiniteNumber(standard.transitionPriceMax) ||
    standard.transitionPriceMax <= standard.lowPriceMax ||
    !isFiniteNumber(standard.transitionPriceUnit) ||
    standard.transitionPriceUnit <= 0 ||
    !isFiniteNumber(standard.transitionMultiplier) ||
    !isFiniteNumber(standard.transitionOffset) ||
    !isRate(standard.highRate)
  )
    throw new Error('일반 취득세율 구간·산식을 확인하세요.');
  if (!isRecord(policy.capitalGains))
    throw new Error('양도소득세 설정이 없습니다.');
  const gains = policy.capitalGains;
  if (
    !isFiniteNumber(gains.oneHomeExemptionThreshold) ||
    gains.oneHomeExemptionThreshold < 0 ||
    !isFiniteNumber(gains.basicDeductionPerOwner) ||
    gains.basicDeductionPerOwner < 0
  )
    throw new Error('1주택 비과세 기준 또는 명의자별 기본공제를 확인하세요.');
  const gainRateKeys = Object.keys(
    DEFAULT_REAL_ESTATE_COST_POLICY.capitalGains,
  ).filter(
    (key) =>
      key !== 'oneHomeExemptionThreshold' &&
      key !== 'basicDeductionPerOwner' &&
      key !== 'progressiveBrackets' &&
      key !== 'oneHomeMinimumResidenceYears',
  ) as Array<
    Exclude<
      keyof RealEstateCostPolicy['capitalGains'],
      | 'oneHomeExemptionThreshold'
      | 'basicDeductionPerOwner'
      | 'progressiveBrackets'
      | 'oneHomeMinimumResidenceYears'
    >
  >;
  if (
    gainRateKeys.some((key) => !isRate(gains[key])) ||
    !isFiniteNumber(gains.oneHomeMinimumResidenceYears) ||
    gains.oneHomeMinimumResidenceYears < 0
  )
    throw new Error('양도소득세율·공제율은 0~1 사이 소수로 입력하세요.');
  const taxBrackets = gains.progressiveBrackets;
  if (
    !Array.isArray(taxBrackets) ||
    taxBrackets.length === 0 ||
    taxBrackets.length > 20 ||
    taxBrackets.at(-1)?.taxableBaseUpTo !== null ||
    taxBrackets.slice(0, -1).some((bracket, index) => {
      const threshold = bracket.taxableBaseUpTo;
      return (
        !isRecord(bracket) ||
        !isFiniteNumber(threshold) ||
        threshold <=
          (index === 0 ? 0 : (taxBrackets[index - 1].taxableBaseUpTo ?? 0))
      );
    }) ||
    taxBrackets.some(
      (bracket) =>
        !isRecord(bracket) ||
        !isRate(bracket.rate) ||
        !isFiniteNumber(bracket.quickDeduction) ||
        bracket.quickDeduction < 0,
    )
  )
    throw new Error('양도소득세 누진 구간을 확인하세요.');
  if (
    !Array.isArray(policy.notes) ||
    policy.notes.length > 30 ||
    policy.notes.some((note) => typeof note !== 'string' || note.length > 500)
  )
    throw new Error('정책 주석은 500자 이하 문자열 배열이어야 합니다.');
  const holding = policy.holding ?? DEFAULT_REAL_ESTATE_COST_POLICY.holding!;
  const holdingBrackets = [
    holding.propertyTaxBrackets,
    holding.comprehensive?.standardBrackets,
    holding.comprehensive?.threePlusHomeBrackets,
  ];
  if (
    !isRecord(holding) ||
    !isRate(holding.propertyTaxFairMarketValueRatio) ||
    !isFiniteNumber(holding.oneHomeSpecialPriceMax) ||
    holding.oneHomeSpecialPriceMax < 0 ||
    !isRate(holding.oneHomeRateReduction) ||
    !isRate(holding.localEducationTaxRate) ||
    !isRate(holding.urbanAreaTaxRate) ||
    !isRecord(holding.comprehensive) ||
    !isRate(holding.comprehensive.fairMarketValueRatio) ||
    !isRate(holding.comprehensive.propertyTaxCreditRate) ||
    !isRate(holding.comprehensive.ruralSpecialTaxRate) ||
    holdingBrackets.some(
      (brackets) =>
        !Array.isArray(brackets) ||
        brackets.length === 0 ||
        brackets.at(-1)?.taxableBaseUpTo !== null ||
        brackets.some(
          (bracket) =>
            !isRecord(bracket) ||
            !isRate(bracket.rate) ||
            !isFiniteNumber(bracket.quickDeduction) ||
            bracket.quickDeduction < 0,
        ),
    )
  )
    throw new Error('재산세·종합부동산세 러프 계산 정책을 확인하세요.');
  return JSON.parse(
    JSON.stringify({ ...policy, holding }),
  ) as RealEstateCostPolicy;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));
const round = (value: number) => Math.round(Number.isFinite(value) ? value : 0);
const shareA = (ownership: OwnershipSettings) =>
  ownership.jointOwnership ? clamp(ownership.ownerAShareRate, 0, 100) / 100 : 1;

const progressiveTax = (
  taxableBase: number,
  brackets: {
    taxableBaseUpTo: number | null;
    rate: number;
    quickDeduction: number;
  }[],
) => {
  const value = Math.max(0, taxableBase);
  const bracket =
    brackets.find(
      (item) => item.taxableBaseUpTo == null || value <= item.taxableBaseUpTo,
    ) ?? brackets.at(-1)!;
  return Math.max(0, value * bracket.rate - bracket.quickDeduction);
};

export function estimateAnnualResidentialHoldingTaxes(
  propertyInputs: HoldingTaxPropertyInput[],
  policy: RealEstateCostPolicy = DEFAULT_REAL_ESTATE_COST_POLICY,
): HoldingTaxEstimate {
  const holding = policy.holding ?? DEFAULT_REAL_ESTATE_COST_POLICY.holding!;
  const properties = propertyInputs.filter(
    (property) => property.settings.enabled && property.marketValue > 0,
  );
  const directTaxes = properties.map((property) => {
    const assessedValue = Math.max(
      0,
      property.settings.assessedValue || property.marketValue * 0.7,
    );
    const taxableBase =
      assessedValue * holding.propertyTaxFairMarketValueRatio;
    const standardTax = progressiveTax(
      taxableBase,
      holding.propertyTaxBrackets,
    );
    const oneHomeSpecial =
      property.settings.oneHouseholdOneHome &&
      assessedValue <= holding.oneHomeSpecialPriceMax;
    const propertyTax = oneHomeSpecial
      ? Math.max(
          0,
          progressiveTax(taxableBase, holding.propertyTaxBrackets) -
            taxableBase * holding.oneHomeRateReduction,
        )
      : standardTax;
    const localEducationTax = propertyTax * holding.localEducationTaxRate;
    const urbanAreaTax = property.settings.includeUrbanAreaTax
      ? taxableBase * holding.urbanAreaTaxRate
      : 0;
    return {
      id: property.id,
      assessedValue,
      propertyTax,
      localEducationTax,
      urbanAreaTax,
    };
  });
  const ownerAssessedValues = { a: 0, b: 0 };
  for (const [index, property] of properties.entries()) {
    const assessedValue = directTaxes[index].assessedValue;
    if (property.settings.jointOwnership) {
      const ownerAShare = shareA(property.settings);
      ownerAssessedValues.a += assessedValue * ownerAShare;
      ownerAssessedValues.b += assessedValue * (1 - ownerAShare);
    } else {
      ownerAssessedValues[property.settings.soleOwner] += assessedValue;
    }
  }
  const householdHomeCount = properties.reduce(
    (maximum, property) =>
      Math.max(maximum, property.settings.householdHomeCount),
    1,
  );
  const onlyProperty = properties.length === 1 ? properties[0] : null;
  const comprehensiveTaxes = (['a', 'b'] as const).map((owner) => {
    const ownsSoleOneHome = Boolean(
      onlyProperty?.settings.oneHouseholdOneHome &&
        !onlyProperty.settings.jointOwnership &&
        onlyProperty.settings.soleOwner === owner,
    );
    const deduction = ownsSoleOneHome
      ? holding.comprehensive.oneHouseholdOneHomeDeduction
      : holding.comprehensive.basicDeductionPerOwner;
    const taxableBase =
      Math.max(0, ownerAssessedValues[owner] - deduction) *
      holding.comprehensive.fairMarketValueRatio;
    const brackets =
      householdHomeCount >= 3
        ? holding.comprehensive.threePlusHomeBrackets
        : holding.comprehensive.standardBrackets;
    const grossTax = progressiveTax(taxableBase, brackets);
    const roughPropertyTaxCredit = Math.min(
      grossTax,
      taxableBase *
        holding.propertyTaxFairMarketValueRatio *
        holding.comprehensive.propertyTaxCreditRate,
    );
    return Math.max(0, grossTax - roughPropertyTaxCredit);
  });
  const comprehensiveRealEstateTax =
    comprehensiveTaxes[0] + comprehensiveTaxes[1];
  const ruralSpecialTax =
    comprehensiveRealEstateTax * holding.comprehensive.ruralSpecialTaxRate;
  const totalAssessedValue = directTaxes.reduce(
    (sum, property) => sum + property.assessedValue,
    0,
  );
  const perProperty = directTaxes.map((property) => {
    const allocationRate =
      totalAssessedValue > 0 ? property.assessedValue / totalAssessedValue : 0;
    const allocatedComprehensive =
      comprehensiveRealEstateTax * allocationRate;
    const allocatedRural = ruralSpecialTax * allocationRate;
    const annualTotal =
      property.propertyTax +
      property.localEducationTax +
      property.urbanAreaTax +
      allocatedComprehensive +
      allocatedRural;
    return {
      id: property.id,
      propertyTax: round(property.propertyTax),
      localEducationTax: round(property.localEducationTax),
      urbanAreaTax: round(property.urbanAreaTax),
      comprehensiveRealEstateTax: round(allocatedComprehensive),
      ruralSpecialTax: round(allocatedRural),
      annualTotal: round(annualTotal),
    };
  });
  const totals = perProperty.reduce(
    (sum, property) => ({
      propertyTax: sum.propertyTax + property.propertyTax,
      localEducationTax: sum.localEducationTax + property.localEducationTax,
      urbanAreaTax: sum.urbanAreaTax + property.urbanAreaTax,
      comprehensiveRealEstateTax:
        sum.comprehensiveRealEstateTax + property.comprehensiveRealEstateTax,
      ruralSpecialTax: sum.ruralSpecialTax + property.ruralSpecialTax,
      annualTotal: sum.annualTotal + property.annualTotal,
    }),
    {
      propertyTax: 0,
      localEducationTax: 0,
      urbanAreaTax: 0,
      comprehensiveRealEstateTax: 0,
      ruralSpecialTax: 0,
      annualTotal: 0,
    },
  );
  return {
    policyId: policy.policyId,
    ...totals,
    monthlyAverage: round(totals.annualTotal / 12),
    perProperty,
    assumptions: [
      '보유세는 별도 세목이 아니라 재산세와 종합부동산세 등을 묶어 부르는 일반 표현입니다.',
      '입력한 공시가격·주택 수·명의 지분을 기준으로 재산세·지방교육세·도시지역분·종합부동산세·농어촌특별세를 단순 추정했습니다.',
      '세부담상한, 고령자·장기보유 공제, 합산배제, 감면, 과세기준일과 지방자치단체별 차이는 반영하지 않았습니다.',
      '공시가격을 입력하지 않으면 현재가치의 70%를 임시 공시가격으로 사용합니다.',
    ],
  };
}

export function estimateHousingBrokerage(
  transactionPrice: number,
  includeVat: boolean,
  policy: RealEstateCostPolicy = DEFAULT_REAL_ESTATE_COST_POLICY,
): BrokerageEstimate {
  const price = Math.max(0, transactionPrice);
  const bracket =
    policy.brokerage.brackets.find(
      (item) => item.priceBelow == null || price < item.priceBelow,
    ) ?? policy.brokerage.brackets.at(-1)!;
  const rate = bracket.upperRate;
  const cap = bracket.feeCap;
  const raw = price * rate;
  const amountBeforeVat = round(cap == null ? raw : Math.min(raw, cap));
  const vat = includeVat
    ? round(amountBeforeVat * policy.brokerage.vatRate)
    : 0;
  return {
    rate: rate * 100,
    amountBeforeVat,
    vat,
    total: amountBeforeVat + vat,
  };
}

function progressiveIncomeTax(
  taxableBase: number,
  policy: RealEstateCostPolicy,
) {
  const value = Math.max(0, taxableBase);
  const bracket =
    policy.capitalGains.progressiveBrackets.find(
      (item) => item.taxableBaseUpTo == null || value <= item.taxableBaseUpTo,
    ) ?? policy.capitalGains.progressiveBrackets.at(-1)!;
  return value * bracket.rate - bracket.quickDeduction;
}

export function estimateHomeSaleCosts({
  projectedSalePrice,
  saleYear,
  settings,
  policy = DEFAULT_REAL_ESTATE_COST_POLICY,
}: {
  projectedSalePrice: number;
  saleYear: number;
  settings: SaleCostAutoSettings;
  policy?: RealEstateCostPolicy;
}): SaleCostEstimate {
  const salePrice = Math.max(0, projectedSalePrice);
  const brokerage = estimateHousingBrokerage(
    salePrice,
    settings.includeBrokerageVat,
    policy,
  );
  const holdingYears = Math.max(0, saleYear - settings.acquisitionYear);
  const grossGain = Math.max(
    0,
    salePrice -
      Math.max(0, settings.acquisitionPrice) -
      Math.max(0, settings.necessaryExpenses) -
      brokerage.total,
  );
  const oneHouseExemption =
    settings.householdHomeCountAtSale === 1 &&
    settings.oneHouseExemptionEligible;
  const taxableGainAfterExemption = oneHouseExemption
    ? salePrice <= policy.capitalGains.oneHomeExemptionThreshold
      ? 0
      : grossGain *
        ((salePrice - policy.capitalGains.oneHomeExemptionThreshold) /
          salePrice)
    : grossGain;
  const multiHouseSurcharge =
    settings.regulatedArea && settings.householdHomeCountAtSale >= 2;
  const longTermDeductionRate = multiHouseSurcharge
    ? 0
    : oneHouseExemption &&
        settings.residenceYears >=
          policy.capitalGains.oneHomeMinimumResidenceYears
      ? Math.min(
          policy.capitalGains.oneHomeHoldingMaximumRate * 100,
          holdingYears >= 3
            ? holdingYears * policy.capitalGains.oneHomeHoldingAnnualRate * 100
            : 0,
        ) +
        Math.min(
          policy.capitalGains.oneHomeResidenceMaximumRate * 100,
          settings.residenceYears *
            policy.capitalGains.oneHomeResidenceAnnualRate *
            100,
        )
      : holdingYears >= 3
        ? Math.min(
            policy.capitalGains.generalLongTermMaximumRate * 100,
            holdingYears * policy.capitalGains.generalLongTermAnnualRate * 100,
          )
        : 0;
  const gainAfterLongTermDeduction = Math.max(
    0,
    taxableGainAfterExemption * (1 - longTermDeductionRate / 100),
  );
  const ownerAShare = shareA(settings);
  const ownerShares = settings.jointOwnership
    ? [ownerAShare, 1 - ownerAShare]
    : [1, 0];
  const taxes = ownerShares.map((ownerShare) => {
    if (ownerShare <= 0) return 0;
    const taxableBase = Math.max(
      0,
      gainAfterLongTermDeduction * ownerShare -
        policy.capitalGains.basicDeductionPerOwner,
    );
    const baseTax = progressiveIncomeTax(taxableBase, policy);
    const surchargePoints = multiHouseSurcharge
      ? settings.householdHomeCountAtSale >= 3
        ? policy.capitalGains.regulatedThreePlusHomeSurchargeRate
        : policy.capitalGains.regulatedTwoHomeSurchargeRate
      : 0;
    const longHoldingTax = baseTax + taxableBase * surchargePoints;
    const shortHoldingTax =
      holdingYears < 1
        ? taxableBase * policy.capitalGains.shortHoldingUnderOneYearRate
        : holdingYears < 2
          ? taxableBase * policy.capitalGains.shortHoldingUnderTwoYearsRate
          : 0;
    return Math.max(longHoldingTax, shortHoldingTax);
  });
  const capitalGainsTax = round(taxes[0] + taxes[1]);
  const localIncomeTax = round(
    capitalGainsTax * policy.capitalGains.localIncomeTaxRate,
  );
  return {
    policyId: policy.policyId,
    projectedSalePrice: round(salePrice),
    brokerage,
    capitalGainsTax,
    localIncomeTax,
    totalCapitalGainsTaxes: capitalGainsTax + localIncomeTax,
    totalSellingCosts: brokerage.total + capitalGainsTax + localIncomeTax,
    grossGain: round(grossGain),
    taxableGainAfterExemption: round(taxableGainAfterExemption),
    longTermDeductionRate,
    ownerATax: round(taxes[0] * (1 + policy.capitalGains.localIncomeTaxRate)),
    ownerBTax: round(taxes[1] * (1 + policy.capitalGains.localIncomeTaxRate)),
    assumptions: [
      '현재 입력값만으로 필요경비·비과세·장기보유특별공제·다주택 중과를 단순 추정',
      oneHouseExemption
        ? '1세대 1주택 비과세 요건을 충족한다고 사용자가 확인한 것으로 가정'
        : '1세대 1주택 비과세를 적용하지 않음',
      settings.jointOwnership
        ? `공동명의 지분별로 양도차익을 나누고 각 명의자에게 기본공제 ${round(policy.capitalGains.basicDeductionPerOwner).toLocaleString('ko-KR')}원 적용`
        : `단독명의 기본공제 ${round(policy.capitalGains.basicDeductionPerOwner).toLocaleString('ko-KR')}원 적용`,
      `양도소득세의 ${policy.capitalGains.localIncomeTaxRate * 100}%를 지방소득세로 추가 추정`,
    ],
  };
}

function standardAcquisitionTaxRate(
  price: number,
  policy: RealEstateCostPolicy,
) {
  const standard = policy.acquisition.standard;
  if (price <= standard.lowPriceMax) return standard.lowRate;
  if (price <= standard.transitionPriceMax)
    return (
      clamp(
        (price / standard.transitionPriceUnit) * standard.transitionMultiplier +
          standard.transitionOffset,
        standard.lowRate * 100,
        standard.highRate * 100,
      ) / 100
    );
  return standard.highRate;
}

export function estimateHomePurchaseCosts({
  purchasePrice,
  settings,
  policy = DEFAULT_REAL_ESTATE_COST_POLICY,
}: {
  purchasePrice: number;
  settings: PurchaseCostAutoSettings;
  policy?: RealEstateCostPolicy;
}): PurchaseCostEstimate {
  const price = Math.max(0, purchasePrice);
  const standardRate = standardAcquisitionTaxRate(price, policy);
  const acquisitionTaxRate =
    settings.homeCountAfterPurchase === 'one_or_temporary_two'
      ? standardRate
      : settings.homeCountAfterPurchase === 'two'
        ? settings.regulatedArea
          ? policy.acquisition.regulatedTwoHomeRate
          : standardRate
        : settings.homeCountAfterPurchase === 'three'
          ? settings.regulatedArea
            ? policy.acquisition.regulatedThreeHomeRate
            : policy.acquisition.nonRegulatedThreeHomeRate
          : policy.acquisition.fourPlusHomeRate;
  const acquisitionTax = round(price * acquisitionTaxRate);
  const localEducationRate =
    acquisitionTaxRate >= policy.acquisition.regulatedTwoHomeRate
      ? policy.acquisition.localEducationRateForSurcharge
      : acquisitionTaxRate *
        policy.acquisition.localEducationStandardMultiplier;
  const localEducationTax = round(price * localEducationRate);
  const ruralRate =
    acquisitionTaxRate === policy.acquisition.regulatedTwoHomeRate
      ? policy.acquisition.ruralSpecialRateEightPercent
      : acquisitionTaxRate === policy.acquisition.regulatedThreeHomeRate
        ? policy.acquisition.ruralSpecialRateTwelvePercent
        : settings.exclusiveAreaOver85
          ? policy.acquisition.ruralSpecialRateStandardLargeArea
          : 0;
  const ruralSpecialTax = round(price * ruralRate);
  const brokerage = estimateHousingBrokerage(
    price,
    settings.includeBrokerageVat,
    policy,
  );
  const totalPurchaseCosts =
    acquisitionTax + localEducationTax + ruralSpecialTax + brokerage.total;
  const ownerAShare = shareA(settings);
  return {
    policyId: policy.policyId,
    purchasePrice: round(price),
    acquisitionTaxRate: acquisitionTaxRate * 100,
    acquisitionTax,
    localEducationTax,
    ruralSpecialTax,
    brokerage,
    totalPurchaseCosts,
    ownerACostShare: round(totalPurchaseCosts * ownerAShare),
    ownerBCostShare: round(totalPurchaseCosts * (1 - ownerAShare)),
    assumptions: [
      '취득세·지방교육세·농어촌특별세와 주택 중개보수 상한을 단순 추정',
      '일시적 2주택·중과 제외·감면 자격은 선택값을 충족한다고 가정',
      settings.jointOwnership
        ? `공동명의 본인 지분 ${settings.ownerAShareRate}%로 비용을 배분했으며 총 취득세 자체는 지분 합계 기준 동일`
        : '단독명의로 가정',
    ],
  };
}
