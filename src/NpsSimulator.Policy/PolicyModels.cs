using System.Text.Json.Serialization;

namespace NpsSimulator.Policy;

public enum PolicyLegalStatus
{
    Enacted,
    Announced,
    Draft,
    Scenario
}

public enum ApplicationClock
{
    ContributionMonth,
    CoveredMonth,
    ApplicationDate,
    DueMonth,
    PaymentDate,
    EntitlementDate,
    ClaimDate,
    DeathDate,
    BirthCohort
}

public sealed record Rational(int Numerator, int Denominator)
{
    [JsonIgnore]
    public decimal DecimalValue => Denominator == 0
        ? throw new DivideByZeroException("정책 비율의 분모가 0입니다.")
        : (decimal)Numerator / Denominator;
}

public sealed record LegalSource(
    string Id,
    string Publisher,
    string Title,
    string Url,
    DateOnly? PublishedDate,
    DateOnly? EffectiveDate,
    string? Article);

public sealed record ContributionRateRule(
    string RuleId,
    DateOnly ValidFrom,
    DateOnly? ValidToExclusive,
    ApplicationClock ApplicationClock,
    Rational TotalRate,
    Rational WorkplaceEmployeeShare,
    Rational WorkplaceEmployerShare,
    IReadOnlyList<string> LegalSourceIds);

public sealed record StandardIncomeLimitRule(
    string RuleId,
    DateOnly ValidFrom,
    DateOnly? ValidToExclusive,
    ApplicationClock ApplicationClock,
    long MinimumKrw,
    long MaximumKrw,
    IReadOnlyList<string> LegalSourceIds);

public sealed record VoluntaryContinuationIncomeRule(
    string RuleId,
    DateOnly ValidFrom,
    DateOnly? ValidToExclusive,
    ApplicationClock ApplicationClock,
    long DefaultStandardMonthlyIncomeKrw,
    IReadOnlyList<long> SuggestedStandardMonthlyIncomesKrw,
    IReadOnlyList<string> LegalSourceIds);

public sealed record ClaimAgeRule(
    int BirthYearFrom,
    int? BirthYearToExclusive,
    int NormalClaimAgeMonths,
    IReadOnlyList<string> LegalSourceIds);

public sealed record PensionAdjustmentPolicy(
    int MaximumEarlyMonths,
    Rational EarlyReductionPerMonth,
    int MaximumDeferredMonths,
    Rational DeferredBonusPerMonth,
    IReadOnlyList<string> LegalSourceIds);

public sealed record QualificationPolicy(
    int MinimumContributionMonths,
    int MaximumBackPaymentMonths,
    IReadOnlyList<string> LegalSourceIds);

public sealed record DuplicateBenefitPolicy(
    Rational UnselectedSurvivorPensionAdditionalRate,
    IReadOnlyList<string> LegalSourceIds);

public sealed record SurvivorPensionRateRule(
    int ContributionMonthsFrom,
    int? ContributionMonthsToExclusive,
    Rational Rate,
    IReadOnlyList<string> LegalSourceIds);

public sealed record SurvivorBenefitPolicy(
    Rational OldAgePensionRateAtMinimumContribution,
    Rational OldAgePensionAdditionalRatePerMonth,
    IReadOnlyList<SurvivorPensionRateRule> PensionRates,
    bool CapAtDeceasedOldAgePension,
    IReadOnlyList<string> LegalSourceIds);

public sealed record PensionIncomeDeductionTier(
    long? AnnualPensionToInclusiveKrw,
    long BaseDeductionKrw,
    long ExcessThresholdKrw,
    Rational ExcessDeductionRate);

public sealed record IncomeTaxBracket(
    long? TaxBaseToInclusiveKrw,
    Rational Rate,
    long ProgressiveDeductionKrw);

public sealed record PensionIncomeTaxPolicy(
    int AssumedBasicDeductionPersons,
    long BasicDeductionPerPersonKrw,
    long StandardTaxCreditKrw,
    long MaximumPensionIncomeDeductionKrw,
    Rational LocalIncomeTaxRate,
    Rational AssumedTaxablePensionRate,
    IReadOnlyList<PensionIncomeDeductionTier> PensionIncomeDeductionTiers,
    IReadOnlyList<IncomeTaxBracket> IncomeTaxBrackets,
    IReadOnlyList<string> LegalSourceIds);

public sealed record PolicyPack(
    string SchemaVersion,
    string PolicyPackId,
    PolicyLegalStatus LegalStatus,
    DateTimeOffset PublishedAt,
    string? Supersedes,
    string MinimumEngineVersion,
    string Currency,
    string TimeZone,
    IReadOnlyList<ContributionRateRule> ContributionRates,
    IReadOnlyList<StandardIncomeLimitRule> StandardIncomeLimits,
    IReadOnlyList<ClaimAgeRule> NormalClaimAges,
    PensionAdjustmentPolicy PensionAdjustment,
    QualificationPolicy Qualification,
    DuplicateBenefitPolicy DuplicateBenefit,
    IReadOnlyList<LegalSource> LegalSources,
    IReadOnlyList<string> Notes,
    SurvivorBenefitPolicy? SurvivorBenefit = null,
    PensionIncomeTaxPolicy? PensionIncomeTax = null,
    IReadOnlyList<VoluntaryContinuationIncomeRule>? VoluntaryContinuationIncomes = null);

public sealed record PolicyValidationIssue(string Code, string Message, bool IsError, string? RuleId = null);

public sealed record PolicyValidationResult(IReadOnlyList<PolicyValidationIssue> Issues)
{
    public bool IsValid => Issues.All(issue => !issue.IsError);
    public IReadOnlyList<PolicyValidationIssue> Errors => Issues.Where(issue => issue.IsError).ToArray();
    public IReadOnlyList<PolicyValidationIssue> Warnings => Issues.Where(issue => !issue.IsError).ToArray();
}
