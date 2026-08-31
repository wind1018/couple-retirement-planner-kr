namespace NpsSimulator.Policy;

public sealed class PolicyValidator
{
    private static readonly string[] OfficialHosts = ["law.go.kr", "www.law.go.kr", "nps.or.kr", "www.nps.or.kr", "m.nps.or.kr", "mohw.go.kr", "www.mohw.go.kr", "nts.go.kr", "www.nts.go.kr"];

    public PolicyValidationResult Validate(PolicyPack pack)
    {
        var issues = new List<PolicyValidationIssue>();

        if (string.IsNullOrWhiteSpace(pack.PolicyPackId)) Error("PACK_ID_REQUIRED", "policyPackId가 없습니다.");
        if (pack.Currency != "KRW") Error("CURRENCY_UNSUPPORTED", "현재 엔진은 KRW 정책만 지원합니다.");
        if (pack.ContributionRates.Count == 0) Error("RATE_REQUIRED", "보험료율 규칙이 없습니다.");
        if (pack.StandardIncomeLimits.Count == 0) Error("LIMIT_REQUIRED", "기준소득월액 상·하한 규칙이 없습니다.");
        if (pack.NormalClaimAges.Count == 0) Error("CLAIM_AGE_REQUIRED", "정상 수급연령 규칙이 없습니다.");
        if (pack.VoluntaryContinuationIncomes is not { Count: > 0 }) Error("VOLUNTARY_CONTINUATION_INCOME_REQUIRED", "임의계속가입 기준소득월액 선택표가 없습니다.");

        ValidateTimeline(pack.ContributionRates, rule => rule.ValidFrom, rule => rule.ValidToExclusive, rule => rule.RuleId, issues);
        ValidateTimeline(pack.StandardIncomeLimits, rule => rule.ValidFrom, rule => rule.ValidToExclusive, rule => rule.RuleId, issues);
        if (pack.VoluntaryContinuationIncomes is { Count: > 0 } voluntaryRules)
            ValidateTimeline(voluntaryRules, rule => rule.ValidFrom, rule => rule.ValidToExclusive, rule => rule.RuleId, issues);

        foreach (var rule in pack.ContributionRates)
        {
            ValidateRate(rule.TotalRate, "보험료율", rule.RuleId, issues, max: 0.25m);
            ValidateRate(rule.WorkplaceEmployeeShare, "가입자 부담률", rule.RuleId, issues, max: 0.25m);
            ValidateRate(rule.WorkplaceEmployerShare, "사용자 부담률", rule.RuleId, issues, max: 0.25m);

            var split = rule.WorkplaceEmployeeShare.DecimalValue + rule.WorkplaceEmployerShare.DecimalValue;
            if (split != rule.TotalRate.DecimalValue)
            {
                issues.Add(new("RATE_SPLIT_MISMATCH", "사업장 가입자의 가입자·사용자 부담률 합계가 총 보험료율과 다릅니다.", true, rule.RuleId));
            }

            if (rule.ApplicationClock != ApplicationClock.ContributionMonth)
            {
                issues.Add(new("RATE_CLOCK_UNEXPECTED", "일반 보험료율의 적용 기준은 CONTRIBUTION_MONTH여야 합니다.", true, rule.RuleId));
            }
        }

        foreach (var rule in pack.StandardIncomeLimits)
        {
            if (rule.MinimumKrw <= 0 || rule.MaximumKrw <= rule.MinimumKrw)
            {
                issues.Add(new("INVALID_INCOME_LIMIT", "기준소득월액은 0 < 하한 < 상한이어야 합니다.", true, rule.RuleId));
            }
        }

        foreach (var rule in pack.VoluntaryContinuationIncomes ?? [])
        {
            if (rule.ApplicationClock != ApplicationClock.ContributionMonth)
                issues.Add(new("VOLUNTARY_INCOME_CLOCK_UNEXPECTED", "임의계속가입 기준소득월액 적용 기준은 CONTRIBUTION_MONTH여야 합니다.", true, rule.RuleId));
            if (rule.DefaultStandardMonthlyIncomeKrw <= 0 || rule.SuggestedStandardMonthlyIncomesKrw.Count == 0)
                issues.Add(new("VOLUNTARY_INCOME_INVALID", "임의계속가입 기본 기준소득월액과 선택지를 확인하세요.", true, rule.RuleId));
            if (!rule.SuggestedStandardMonthlyIncomesKrw.Contains(rule.DefaultStandardMonthlyIncomeKrw)
                || rule.SuggestedStandardMonthlyIncomesKrw.Any(value => value <= 0 || value > 100_000_000)
                || rule.SuggestedStandardMonthlyIncomesKrw.Distinct().Count() != rule.SuggestedStandardMonthlyIncomesKrw.Count)
                issues.Add(new("VOLUNTARY_INCOME_CHOICES_INVALID", "기본 기준소득월액은 중복 없는 양수 선택지에 포함되어야 합니다.", true, rule.RuleId));
        }

        ValidateRate(pack.PensionAdjustment.EarlyReductionPerMonth, "조기 감액률", "earlyPension.reductionPerMonth", issues, max: 0.02m);
        ValidateRate(pack.PensionAdjustment.DeferredBonusPerMonth, "연기 가산률", "deferredPension.bonusPerMonth", issues, max: 0.02m);
        ValidateRate(pack.DuplicateBenefit.UnselectedSurvivorPensionAdditionalRate, "유족연금 추가 지급률", "duplicateBenefit.survivorAdditionalRate", issues, max: 1m);

        var survivorBenefit = pack.SurvivorBenefit;
        if (survivorBenefit is null)
        {
            issues.Add(new("SURVIVOR_POLICY_LEGACY_DEFAULT", "이전 정책 파일이라 유족연금 추정 규칙은 프로그램의 호환 기본값을 사용합니다.", false));
        }
        else
        {
            ValidateRate(survivorBenefit.OldAgePensionRateAtMinimumContribution, "노령연금 최소가입 지급률", "survivorBenefit.oldAgeBaseRate", issues, max: 2m);
            ValidateRate(survivorBenefit.OldAgePensionAdditionalRatePerMonth, "노령연금 월별 가산 지급률", "survivorBenefit.oldAgeAdditionalRatePerMonth", issues, max: 0.02m);
            ValidateSurvivorRates(survivorBenefit.PensionRates, issues);
        }

        ValidatePensionIncomeTax(pack.PensionIncomeTax, issues);

        if (pack.PensionAdjustment.MaximumEarlyMonths is < 0 or > 120) Error("INVALID_EARLY_MONTHS", "최대 조기 개월이 허용 범위를 벗어났습니다.");
        if (pack.PensionAdjustment.MaximumDeferredMonths is < 0 or > 120) Error("INVALID_DEFER_MONTHS", "최대 연기 개월이 허용 범위를 벗어났습니다.");
        if (pack.Qualification.MinimumContributionMonths is < 1 or > 1200) Error("INVALID_MINIMUM_MONTHS", "최소 가입기간이 허용 범위를 벗어났습니다.");
        if (pack.Qualification.MaximumBackPaymentMonths is < 0 or > 1200) Error("INVALID_BACKPAY_MONTHS", "최대 추납 개월이 허용 범위를 벗어났습니다.");

        ValidateClaimAges(pack.NormalClaimAges, issues);
        ValidateSources(pack, issues);

        return new(issues);

        void Error(string code, string message) => issues.Add(new(code, message, true));
    }

    private static void ValidateSurvivorRates(IReadOnlyList<SurvivorPensionRateRule> rules, ICollection<PolicyValidationIssue> issues)
    {
        if (rules.Count == 0)
        {
            issues.Add(new("SURVIVOR_RATE_REQUIRED", "유족연금 가입기간별 지급률이 없습니다.", true, "survivorBenefit.pensionRateTiers"));
            return;
        }

        var ordered = rules.OrderBy(rule => rule.ContributionMonthsFrom).ToArray();
        if (ordered[0].ContributionMonthsFrom != 0)
            issues.Add(new("SURVIVOR_RATE_GAP", "유족연금 지급률은 가입 0개월부터 정의되어야 합니다.", true, "survivorBenefit.pensionRateTiers"));

        for (var index = 0; index < ordered.Length; index++)
        {
            var rule = ordered[index];
            ValidateRate(rule.Rate, "유족연금 지급률", "survivorBenefit.pensionRateTiers", issues, max: 1m);
            if (rule.ContributionMonthsFrom < 0 || (rule.ContributionMonthsToExclusive is not null && rule.ContributionMonthsToExclusive <= rule.ContributionMonthsFrom))
                issues.Add(new("INVALID_SURVIVOR_RATE_PERIOD", "유족연금 가입기간 구간이 올바르지 않습니다.", true, "survivorBenefit.pensionRateTiers"));
            if (index == 0) continue;
            var previous = ordered[index - 1];
            if (previous.ContributionMonthsToExclusive != rule.ContributionMonthsFrom)
                issues.Add(new("SURVIVOR_RATE_GAP_OR_OVERLAP", "유족연금 가입기간별 지급률 구간이 이어지지 않습니다.", true, "survivorBenefit.pensionRateTiers"));
        }

        if (ordered[^1].ContributionMonthsToExclusive is not null)
            issues.Add(new("SURVIVOR_RATE_OPEN_END_REQUIRED", "마지막 유족연금 지급률 구간은 종료 개월이 없어야 합니다.", true, "survivorBenefit.pensionRateTiers"));
    }

    private static void ValidatePensionIncomeTax(PensionIncomeTaxPolicy? policy, ICollection<PolicyValidationIssue> issues)
    {
        if (policy is null)
        {
            issues.Add(new("PENSION_TAX_POLICY_MISSING", "세후 예상액 정책이 없어 세후 추정을 표시하지 않습니다.", false));
            return;
        }
        if (policy.AssumedBasicDeductionPersons < 1 || policy.BasicDeductionPerPersonKrw < 0 || policy.MaximumPensionIncomeDeductionKrw < 0)
            issues.Add(new("PENSION_TAX_ASSUMPTION_INVALID", "연금소득세 기본공제 가정이 올바르지 않습니다.", true));
        if (policy.PensionIncomeDeductionTiers.Count == 0 || policy.IncomeTaxBrackets.Count == 0)
            issues.Add(new("PENSION_TAX_TIERS_REQUIRED", "연금소득공제 또는 소득세율 구간이 없습니다.", true));
        ValidateRate(policy.LocalIncomeTaxRate, "지방소득세율", "pensionIncomeTax.estimation", issues, max: 1m);
        ValidateRate(policy.AssumedTaxablePensionRate, "과세대상 연금 비율 가정", "pensionIncomeTax.estimation", issues, max: 1m);
        for (var index = 0; index < policy.PensionIncomeDeductionTiers.Count; index++)
        {
            var tier = policy.PensionIncomeDeductionTiers[index];
            ValidateRate(tier.ExcessDeductionRate, "연금소득공제율", "pensionIncomeTax.estimation", issues, max: 1m);
            if (tier.BaseDeductionKrw < 0 || tier.ExcessThresholdKrw < 0
                || (index < policy.PensionIncomeDeductionTiers.Count - 1 && tier.AnnualPensionToInclusiveKrw is null))
                issues.Add(new("PENSION_DEDUCTION_TIER_INVALID", "연금소득공제 구간의 금액 또는 종료값이 올바르지 않습니다.", true));
            if (index > 0 && tier.AnnualPensionToInclusiveKrw is { } upper
                && policy.PensionIncomeDeductionTiers[index - 1].AnnualPensionToInclusiveKrw is { } previousUpper
                && upper <= previousUpper)
                issues.Add(new("PENSION_DEDUCTION_TIER_ORDER", "연금소득공제 구간은 오름차순이어야 합니다.", true));
        }
        if (policy.PensionIncomeDeductionTiers.Count > 0 && policy.PensionIncomeDeductionTiers[^1].AnnualPensionToInclusiveKrw is not null)
            issues.Add(new("PENSION_DEDUCTION_OPEN_END_REQUIRED", "마지막 연금소득공제 구간은 상한이 없어야 합니다.", true));

        for (var index = 0; index < policy.IncomeTaxBrackets.Count; index++)
        {
            var bracket = policy.IncomeTaxBrackets[index];
            ValidateRate(bracket.Rate, "소득세율", "pensionIncomeTax.estimation", issues, max: 1m);
            if (bracket.ProgressiveDeductionKrw < 0 || (index < policy.IncomeTaxBrackets.Count - 1 && bracket.TaxBaseToInclusiveKrw is null))
                issues.Add(new("INCOME_TAX_BRACKET_INVALID", "소득세율 구간의 금액 또는 종료값이 올바르지 않습니다.", true));
            if (index > 0 && bracket.TaxBaseToInclusiveKrw is { } upper
                && policy.IncomeTaxBrackets[index - 1].TaxBaseToInclusiveKrw is { } previousUpper
                && upper <= previousUpper)
                issues.Add(new("INCOME_TAX_BRACKET_ORDER", "소득세율 구간은 오름차순이어야 합니다.", true));
        }
        if (policy.IncomeTaxBrackets.Count > 0 && policy.IncomeTaxBrackets[^1].TaxBaseToInclusiveKrw is not null)
            issues.Add(new("INCOME_TAX_OPEN_END_REQUIRED", "마지막 소득세율 구간은 상한이 없어야 합니다.", true));
    }

    private static void ValidateTimeline<T>(
        IEnumerable<T> rules,
        Func<T, DateOnly> from,
        Func<T, DateOnly?> to,
        Func<T, string> id,
        ICollection<PolicyValidationIssue> issues)
    {
        var ordered = rules.OrderBy(from).ToArray();
        for (var index = 0; index < ordered.Length; index++)
        {
            var current = ordered[index];
            var end = to(current);
            if (end is not null && end <= from(current))
            {
                issues.Add(new("INVALID_PERIOD", "정책 종료일은 시작일보다 뒤여야 합니다.", true, id(current)));
            }

            if (index == 0) continue;
            var previous = ordered[index - 1];
            var previousEnd = to(previous);
            if (previousEnd is null || previousEnd > from(current))
            {
                issues.Add(new("POLICY_PERIOD_OVERLAP", "같은 종류의 정책 기간이 겹칩니다.", true, id(current)));
            }
            else if (previousEnd < from(current))
            {
                issues.Add(new("POLICY_PERIOD_GAP", "같은 종류의 정책 기간에 공백이 있습니다.", false, id(current)));
            }
        }
    }

    private static void ValidateRate(Rational rate, string label, string ruleId, ICollection<PolicyValidationIssue> issues, decimal max)
    {
        if (rate.Denominator <= 0 || rate.Numerator < 0)
        {
            issues.Add(new("INVALID_RATIONAL", $"{label}의 분자·분모가 올바르지 않습니다.", true, ruleId));
            return;
        }

        if (rate.DecimalValue > max)
        {
            issues.Add(new("RATE_OUT_OF_RANGE", $"{label}이 허용 범위를 벗어났습니다.", true, ruleId));
        }
    }

    private static void ValidateClaimAges(IReadOnlyList<ClaimAgeRule> rules, ICollection<PolicyValidationIssue> issues)
    {
        var ordered = rules.OrderBy(rule => rule.BirthYearFrom).ToArray();
        for (var index = 0; index < ordered.Length; index++)
        {
            var rule = ordered[index];
            if (rule.NormalClaimAgeMonths is < 600 or > 900)
            {
                issues.Add(new("CLAIM_AGE_OUT_OF_RANGE", "정상 수급연령이 허용 범위를 벗어났습니다.", true, "oldAge.normalClaimAge"));
            }

            if (index == 0) continue;
            var previous = ordered[index - 1];
            if (previous.BirthYearToExclusive is null || previous.BirthYearToExclusive > rule.BirthYearFrom)
            {
                issues.Add(new("CLAIM_AGE_OVERLAP", "출생연도별 정상 수급연령 구간이 겹칩니다.", true, "oldAge.normalClaimAge"));
            }
            else if (previous.BirthYearToExclusive < rule.BirthYearFrom)
            {
                issues.Add(new("CLAIM_AGE_GAP", "출생연도별 정상 수급연령 구간에 공백이 있습니다.", true, "oldAge.normalClaimAge"));
            }
        }
    }

    private static void ValidateSources(PolicyPack pack, ICollection<PolicyValidationIssue> issues)
    {
        var ids = pack.LegalSources.Select(source => source.Id).ToHashSet(StringComparer.Ordinal);
        var usedIds = pack.ContributionRates.SelectMany(rule => rule.LegalSourceIds)
            .Concat(pack.StandardIncomeLimits.SelectMany(rule => rule.LegalSourceIds))
            .Concat(pack.VoluntaryContinuationIncomes?.SelectMany(rule => rule.LegalSourceIds) ?? [])
            .Concat(pack.NormalClaimAges.SelectMany(rule => rule.LegalSourceIds))
            .Concat(pack.PensionAdjustment.LegalSourceIds)
            .Concat(pack.Qualification.LegalSourceIds)
            .Concat(pack.DuplicateBenefit.LegalSourceIds)
            .Concat(pack.SurvivorBenefit?.LegalSourceIds ?? [])
            .Concat(pack.SurvivorBenefit?.PensionRates.SelectMany(rule => rule.LegalSourceIds) ?? [])
            .Concat(pack.PensionIncomeTax?.LegalSourceIds ?? [])
            .Distinct(StringComparer.Ordinal);

        foreach (var id in usedIds.Where(id => !ids.Contains(id)))
        {
            issues.Add(new("SOURCE_NOT_FOUND", $"참조한 공식 출처 '{id}'가 legalSources에 없습니다.", true));
        }

        foreach (var source in pack.LegalSources)
        {
            if (!Uri.TryCreate(source.Url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            {
                issues.Add(new("SOURCE_URL_INVALID", $"출처 URL이 유효한 HTTPS 주소가 아닙니다: {source.Id}", true));
                continue;
            }

            if (!OfficialHosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase))
            {
                issues.Add(new("SOURCE_NOT_OFFICIAL", $"공식 출처 허용 목록 밖의 도메인입니다: {source.Url}", false));
            }
        }
    }
}
