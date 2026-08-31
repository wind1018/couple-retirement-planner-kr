using System.Text.Json;

namespace NpsSimulator.Policy;

public sealed record PolicyUpdateDocument(
    string SchemaVersion,
    string PolicyPackId,
    string BasePolicyPackId,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    PolicyLegalStatus LegalStatus,
    IReadOnlyList<PolicyChange> Changes,
    IReadOnlyList<LegalSource> LegalSources,
    IReadOnlyList<string> UnresolvedItems,
    IReadOnlyList<string> EngineUpgradeRequired);

public sealed record PolicyChange(
    string Operation,
    string RuleId,
    DateOnly? ValidFrom,
    DateOnly? ValidToExclusive,
    ApplicationClock? ApplicationClock,
    JsonElement Value,
    IReadOnlyList<string> LegalSourceIds);

public sealed record PolicyUpdateResult(
    bool IsValid,
    PolicyPack? UpdatedPack,
    IReadOnlyList<PolicyValidationIssue> Issues,
    IReadOnlyList<string> ChangeSummary);

public sealed record ContributionRateValue(Rational TotalRate, Rational WorkplaceEmployeeShare, Rational WorkplaceEmployerShare);
public sealed record StandardIncomeLimitValue(long MinimumKrw, long MaximumKrw);
public sealed record VoluntaryContinuationIncomeValue(long DefaultStandardMonthlyIncomeKrw, IReadOnlyList<long> SuggestedStandardMonthlyIncomesKrw);
public sealed record ClaimAgeValue(int BirthYearFrom, int? BirthYearToExclusive, int NormalClaimAgeMonths);
public sealed record IntegerValue(int Value);
public sealed record RationalValue(Rational Value);
public sealed record BooleanValue(bool Value);
public sealed record SurvivorPensionRateTiersValue(IReadOnlyList<SurvivorPensionRateRule> Rates);
