using NpsSimulator.Domain;
using NpsSimulator.Policy;
using NpsSimulator.Simulation;

namespace NpsSimulator.Application;

public sealed record SelectedPersonStrategySummary(
    string Alias,
    bool IsIncluded,
    bool HasNationalPension,
    int ContinuationYears,
    decimal ContinuationMonthlyPremiumKrw,
    int ClaimOffsetYears,
    YearMonth BaselineClaimMonth,
    YearMonth SelectedClaimMonth,
    decimal BaselineMonthlyPensionKrw,
    decimal SelectedMonthlyPensionKrw,
    decimal AdditionalContributionKrw);

public sealed record AnnualPensionSnapshot(
    int Year,
    int AgeA,
    decimal MonthlyPensionA,
    int? AgeB,
    decimal MonthlyPensionB,
    decimal CombinedMonthlyPensionKrw,
    string Status);

public sealed record SelectedStrategyReport(
    string PolicyPackId,
    DateTimeOffset GeneratedAt,
    HouseholdProfile Household,
    HouseholdStrategy SelectedStrategy,
    StrategyComparisonResult Comparison,
    IReadOnlyList<SelectedPersonStrategySummary> People,
    decimal BaselineCombinedMonthlyPensionKrw,
    decimal SelectedCombinedMonthlyPensionKrw,
    decimal TotalAdditionalContributionKrw,
    string BreakEvenDescription,
    IReadOnlyDictionary<int, decimal> DifferencesByAge,
    IReadOnlyList<AnnualPensionSnapshot> AnnualTimeline,
    IReadOnlyList<string> Warnings);

public sealed class SelectedStrategyAnalysisService
{
    private static readonly int[] EvaluationAges = [75, 80, 85, 90, 95];

    public SelectedStrategyReport Run(
        PolicyPack policyPack,
        HouseholdProfile household,
        HouseholdStrategy selectedStrategy,
        SimulationAssumptions assumptions)
    {
        var comparison = new SimulationApplicationService().RunComparison(policyPack, household, selectedStrategy, assumptions);
        var people = new[]
        {
            PersonSummary(household.PersonA, selectedStrategy.PersonA, comparison.Baseline.PersonA, comparison.Alternative.PersonA),
            PersonSummary(household.PersonB, selectedStrategy.PersonB, comparison.Baseline.PersonB, comparison.Alternative.PersonB)
        }.Where(person => person.IsIncluded).ToArray();
        var differences = EvaluationAges.ToDictionary(
            age => age,
            age =>
            {
                var month = DomainDate.AgeMonth(household.PersonA.BirthDate, age * 12);
                return comparison.Alternative.CumulativeAt(month) - comparison.Baseline.CumulativeAt(month);
            });
        var baselineMonthly = IncludedPension(comparison.Baseline.PersonA) + IncludedPension(comparison.Baseline.PersonB);
        var selectedMonthly = IncludedPension(comparison.Alternative.PersonA) + IncludedPension(comparison.Alternative.PersonB);
        var additionalContribution = people.Sum(person => person.AdditionalContributionKrw);
        var annualTimeline = BuildAnnualTimeline(household, comparison.Alternative);
        var breakEven = comparison.PermanentAdvantageStarts?.Description
                        ?? "입력한 생존기간 안에 선택 전략이 정상수령 기준을 영구 추월하지 않음";
        var warnings = comparison.Baseline.Warnings
            .Concat(comparison.Alternative.Warnings)
            .Concat(policyPack.Notes)
            .Append("월 납입 예상액을 직접 입력한 경우 추가 연금은 현재 보험료 대비 입력 보험료와 추가 가입개월을 반영한 Anchor Mode 근사입니다.")
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return new(
            policyPack.PolicyPackId,
            DateTimeOffset.Now,
            household,
            selectedStrategy,
            comparison,
            people,
            baselineMonthly,
            selectedMonthly,
            additionalContribution,
            breakEven,
            differences,
            annualTimeline,
            warnings);
    }

    private static SelectedPersonStrategySummary PersonSummary(
        PersonProfile profile,
        PersonStrategy strategy,
        PersonSimulationSummary baseline,
        PersonSimulationSummary selected) => new(
        profile.Alias,
        profile.IsIncluded,
        profile.HasNationalPension,
        Math.Max(0, strategy.ContinueUntilAgeYears - 60),
        strategy.ContinuationMonthlyPremiumKrw,
        strategy.ClaimOffsetMonths / 12,
        baseline.ActualClaimMonth,
        selected.ActualClaimMonth,
        baseline.EstimatedMonthlyPensionKrw,
        selected.EstimatedMonthlyPensionKrw,
        selected.TotalFutureContributionKrw + selected.TotalBackPaymentKrw
        - baseline.TotalFutureContributionKrw - baseline.TotalBackPaymentKrw);

    private static decimal IncludedPension(PersonSimulationSummary person) =>
        person.IsIncluded && person.HasNationalPension ? person.EstimatedMonthlyPensionKrw : 0;

    private static IReadOnlyList<AnnualPensionSnapshot> BuildAnnualTimeline(
        HouseholdProfile household,
        HouseholdSimulationResult simulation)
    {
        var age95A = DomainDate.AgeMonth(household.PersonA.BirthDate, 95 * 12);
        var endMonth = household.PersonB.IsIncluded
            ? Max(age95A, DomainDate.AgeMonth(household.PersonB.BirthDate, 95 * 12))
            : age95A;
        return simulation.Ledger
            .Where(row => row.Month <= endMonth && MonthlyReceipt(row) > 0)
            .GroupBy(row => row.Month.Year)
            .Select(year => year.Last())
            .Select(row =>
            {
                var monthlyA = row.PensionA + row.SurvivorPensionA;
                var monthlyB = row.PensionB + row.SurvivorPensionB;
                var status = monthlyA > 0 && monthlyB > 0
                    ? "부부 모두 수령"
                    : monthlyA > 0 ? $"{household.PersonA.Alias}만 수령" : $"{household.PersonB.Alias}만 수령";
                return new AnnualPensionSnapshot(
                    row.Month.Year,
                    row.AgeMonthsA / 12,
                    monthlyA,
                    household.PersonB.IsIncluded ? row.AgeMonthsB / 12 : null,
                    monthlyB,
                    monthlyA + monthlyB,
                    status);
            })
            .ToArray();
    }

    private static decimal MonthlyReceipt(MonthlyLedgerRow row) =>
        row.PensionA + row.PensionB + row.SurvivorPensionA + row.SurvivorPensionB;

    private static YearMonth Max(YearMonth left, YearMonth right) => left >= right ? left : right;
}
