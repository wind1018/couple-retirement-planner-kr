namespace NpsSimulator.Policy;

public sealed class PolicyResolver(PolicyPack pack)
{
    public static SurvivorBenefitPolicy LegacySurvivorBenefitPolicy { get; } = new(
        new(50, 100),
        new(5, 1200),
        [
            new(0, 120, new(40, 100), []),
            new(120, 240, new(50, 100), []),
            new(240, null, new(60, 100), [])
        ],
        true,
        []);

    public PolicyPack Pack { get; } = pack;

    public SurvivorBenefitPolicy SurvivorBenefit => Pack.SurvivorBenefit ?? LegacySurvivorBenefitPolicy;

    public ContributionRateRule ResolveContributionRate(DateOnly contributionMonth) =>
        ResolveTimeline(Pack.ContributionRates, contributionMonth, rule => rule.ValidFrom, rule => rule.ValidToExclusive, "보험료율");

    public StandardIncomeLimitRule ResolveStandardIncomeLimits(DateOnly contributionMonth) =>
        ResolveTimeline(Pack.StandardIncomeLimits, contributionMonth, rule => rule.ValidFrom, rule => rule.ValidToExclusive, "기준소득월액 상·하한");

    public VoluntaryContinuationIncomeRule ResolveVoluntaryContinuationIncome(DateOnly contributionMonth) =>
        ResolveTimeline(Pack.VoluntaryContinuationIncomes ?? [], contributionMonth, rule => rule.ValidFrom, rule => rule.ValidToExclusive, "임의계속가입 기준소득월액 선택표");

    public int ResolveNormalClaimAgeMonths(DateOnly birthDate)
    {
        var matches = Pack.NormalClaimAges
            .Where(rule => birthDate.Year >= rule.BirthYearFrom && (rule.BirthYearToExclusive is null || birthDate.Year < rule.BirthYearToExclusive))
            .ToArray();
        return matches.Length == 1
            ? matches[0].NormalClaimAgeMonths
            : throw new InvalidOperationException($"{birthDate.Year}년생의 정상 수급연령 규칙을 하나로 결정할 수 없습니다.");
    }

    public decimal ResolveClaimAdjustmentFactor(int offsetMonths)
    {
        if (offsetMonths < 0)
        {
            var earlyMonths = Math.Min(-offsetMonths, Pack.PensionAdjustment.MaximumEarlyMonths);
            return 1m - (earlyMonths * Pack.PensionAdjustment.EarlyReductionPerMonth.DecimalValue);
        }

        var deferredMonths = Math.Min(offsetMonths, Pack.PensionAdjustment.MaximumDeferredMonths);
        return 1m + (deferredMonths * Pack.PensionAdjustment.DeferredBonusPerMonth.DecimalValue);
    }

    public decimal ResolveOldAgePensionRate(int contributionMonths)
    {
        if (contributionMonths < Pack.Qualification.MinimumContributionMonths) return 0;
        var additionalMonths = contributionMonths - Pack.Qualification.MinimumContributionMonths;
        return Math.Min(
            1m,
            SurvivorBenefit.OldAgePensionRateAtMinimumContribution.DecimalValue
            + (additionalMonths * SurvivorBenefit.OldAgePensionAdditionalRatePerMonth.DecimalValue));
    }

    public decimal ResolveSurvivorPensionRate(int contributionMonths)
    {
        var matches = SurvivorBenefit.PensionRates
            .Where(rule => contributionMonths >= rule.ContributionMonthsFrom
                && (rule.ContributionMonthsToExclusive is null || contributionMonths < rule.ContributionMonthsToExclusive))
            .ToArray();
        return matches.Length == 1
            ? matches[0].Rate.DecimalValue
            : throw new InvalidOperationException($"가입기간 {contributionMonths}개월의 유족연금 지급률을 하나로 결정할 수 없습니다.");
    }

    private static T ResolveTimeline<T>(
        IEnumerable<T> rules,
        DateOnly date,
        Func<T, DateOnly> from,
        Func<T, DateOnly?> to,
        string label)
    {
        var matches = rules.Where(rule => date >= from(rule) && (to(rule) is null || date < to(rule))).ToArray();
        return matches.Length == 1
            ? matches[0]
            : throw new InvalidOperationException($"{date:yyyy-MM-dd}의 {label} 규칙을 하나로 결정할 수 없습니다.");
    }
}
