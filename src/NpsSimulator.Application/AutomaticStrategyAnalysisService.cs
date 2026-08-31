using NpsSimulator.Domain;
using NpsSimulator.Policy;
using NpsSimulator.Simulation;

namespace NpsSimulator.Application;

public sealed record AutomaticStrategyRow(
    string SubjectAlias,
    string StrategyName,
    int ContinueUntilAgeYears,
    decimal ContinuationStandardMonthlyIncomeKrw,
    decimal ContinuationMonthlyPremiumKrw,
    decimal ContinuationFinalMonthlyPremiumKrw,
    decimal AdditionalContributionKrw,
    YearMonth ClaimMonth,
    decimal MonthlyPensionGrossKrw,
    decimal MonthlyPensionNetEstimateKrw,
    string AdvantageWindow,
    decimal DifferenceAt75Krw,
    decimal DifferenceAt80Krw,
    decimal DifferenceAt85Krw,
    decimal DifferenceAt90Krw,
    decimal DifferenceAt95Krw,
    string RecommendedForAges,
    string Evaluation);

public sealed record AutomaticStrategyReport(
    string PolicyPackId,
    DateTimeOffset GeneratedAt,
    HouseholdSimulationResult Baseline,
    IReadOnlyList<AutomaticStrategyRow> Rows,
    IReadOnlyList<string> BestStrategySummaries,
    IReadOnlyList<string> Warnings);

public sealed class AutomaticStrategyAnalysisService
{
    private static readonly int[] EvaluationAges = [75, 80, 85, 90, 95];

    public AutomaticStrategyReport Run(
        PolicyPack policyPack,
        HouseholdProfile household,
        SimulationAssumptions assumptions,
        decimal? continuationStandardIncomeA = null,
        decimal? continuationStandardIncomeB = null)
    {
        var resolver = new PolicyResolver(policyPack);
        var simulator = new HouseholdSimulator(resolver);
        var baselineStrategy = new HouseholdStrategy(
            "기준: 60세 납부종료 + 정상수령",
            BaselinePersonStrategy(household.PersonA),
            BaselinePersonStrategy(household.PersonB));
        var baseline = simulator.Simulate(household, baselineStrategy, assumptions);
        var rows = new List<AutomaticStrategyRow>();

        var incomeRule = resolver.ResolveVoluntaryContinuationIncome(assumptions.ValuationDate);
        AddPersonScenarios(true, household.PersonA, household.PersonB, baselineStrategy, continuationStandardIncomeA ?? incomeRule.DefaultStandardMonthlyIncomeKrw);
        if (household.PersonB.IsIncluded && household.PersonB.HasNationalPension)
            AddPersonScenarios(false, household.PersonB, household.PersonA, baselineStrategy, continuationStandardIncomeB ?? incomeRule.DefaultStandardMonthlyIncomeKrw);

        var summaries = new List<string>();
        var rankedRows = rows.ToArray();
        foreach (var subjectGroup in rows.GroupBy(row => row.SubjectAlias, StringComparer.Ordinal))
        {
            foreach (var age in EvaluationAges)
            {
                var bestValue = subjectGroup.Max(row => DifferenceAt(row, age));
                var best = subjectGroup
                    .Where(row => DifferenceAt(row, age) == bestValue)
                    .OrderBy(row => row.AdditionalContributionKrw)
                    .ThenByDescending(row => row.MonthlyPensionGrossKrw)
                    .First();
                summaries.Add($"{best.SubjectAlias} {age}세 기준: {best.StrategyName} ({SignedMoney(bestValue)})");
                for (var index = 0; index < rankedRows.Length; index++)
                {
                    if (rankedRows[index].SubjectAlias != best.SubjectAlias || rankedRows[index].StrategyName != best.StrategyName) continue;
                    var ages = string.IsNullOrWhiteSpace(rankedRows[index].RecommendedForAges)
                        ? $"{age}세"
                        : rankedRows[index].RecommendedForAges + $", {age}세";
                    rankedRows[index] = rankedRows[index] with { RecommendedForAges = ages };
                    break;
                }
            }
        }

        rankedRows = rankedRows.Select(row => row with
        {
            Evaluation = !string.IsNullOrWhiteSpace(row.RecommendedForAges)
                ? $"{row.RecommendedForAges} 기준 최다 수령"
                : row.DifferenceAt90Krw > 0 ? "장수할수록 유리할 수 있음"
                : row.DifferenceAt90Krw < 0 ? "90세 기준 기준전략보다 불리"
                : "기준전략과 동일"
        }).ToArray();

        var warnings = baseline.Warnings
            .Concat(["자동 비교는 추납을 제외하고, 선택한 임의계속가입 기준소득월액에 각 납부월의 정책 보험료율을 적용합니다."])
            .Concat(["임의계속가입 중에는 노령연금을 받지 않는 조건으로, 수령 시작이 가입 종료보다 빠른 조합은 제외했습니다."])
            .Concat(rankedRows.Where(row => row.ContinueUntilAgeYears > 60)
                .Select(row => $"{row.SubjectAlias}: 임의계속가입 기준소득월액 {row.ContinuationStandardMonthlyIncomeKrw:N0}원 선택을 적용했습니다. 실제 가입 유형·확인 소득에 따른 공단 결정값이 우선합니다."))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        return new(policyPack.PolicyPackId, DateTimeOffset.Now, baseline, rankedRows, summaries, warnings);

        void AddPersonScenarios(bool isPersonA, PersonProfile subject, PersonProfile _, HouseholdStrategy baselineHouseholdStrategy, decimal continuationStandardIncome)
        {
            if (!subject.IsIncluded || !subject.HasNationalPension) return;
            var normalAgeMonths = resolver.ResolveNormalClaimAgeMonths(subject.BirthDate);
            var scenarios = BuildScenarioDefinitions(normalAgeMonths);
            foreach (var scenario in scenarios)
            {
                var personStrategy = new PersonStrategy(
                    0,
                    scenario.ContinueUntilAgeYears,
                    0,
                    scenario.ClaimOffsetMonths,
                    100,
                    false,
                    scenario.ContinueUntilAgeYears > 60 ? continuationStandardIncome : null);
                var comparisonStrategy = isPersonA
                    ? baselineHouseholdStrategy with { Name = scenario.Name, PersonA = personStrategy }
                    : baselineHouseholdStrategy with { Name = scenario.Name, PersonB = personStrategy };
                var alternative = simulator.Simulate(household, comparisonStrategy, assumptions);
                var subjectBaseline = isPersonA ? baseline.PersonA : baseline.PersonB;
                var subjectAlternative = isPersonA ? alternative.PersonA : alternative.PersonB;
                var net = PensionTaxEstimator.EstimateMonthly(policyPack, subjectAlternative.EstimatedMonthlyPensionKrw)?.EstimatedNetMonthlyKrw
                          ?? subjectAlternative.EstimatedMonthlyPensionKrw;
                var differenceSeries = DifferenceSeries(baseline, alternative);
                var firstContinuationMonth = Max(assumptions.ValuationMonth, DomainDate.AgeMonth(subject.BirthDate, 60 * 12));
                var finalContinuationMonth = DomainDate.AgeMonth(subject.BirthDate, scenario.ContinueUntilAgeYears * 12).AddMonths(-1);
                var firstPremium = scenario.ContinueUntilAgeYears > 60 ? ContinuationPremium(continuationStandardIncome, firstContinuationMonth) : 0;
                var finalPremium = scenario.ContinueUntilAgeYears > 60 ? ContinuationPremium(continuationStandardIncome, finalContinuationMonth) : 0;
                rows.Add(new(
                    subject.Alias,
                    scenario.Name,
                    scenario.ContinueUntilAgeYears,
                    scenario.ContinueUntilAgeYears > 60 ? continuationStandardIncome : 0,
                    firstPremium,
                    finalPremium,
                    subjectAlternative.TotalFutureContributionKrw + subjectAlternative.TotalBackPaymentKrw
                    - subjectBaseline.TotalFutureContributionKrw - subjectBaseline.TotalBackPaymentKrw,
                    subjectAlternative.ActualClaimMonth,
                    subjectAlternative.EstimatedMonthlyPensionKrw,
                    net,
                    AdvantageWindow(subject.BirthDate, differenceSeries),
                    DifferenceAtAge(subject.BirthDate, baseline, alternative, 75),
                    DifferenceAtAge(subject.BirthDate, baseline, alternative, 80),
                    DifferenceAtAge(subject.BirthDate, baseline, alternative, 85),
                    DifferenceAtAge(subject.BirthDate, baseline, alternative, 90),
                    DifferenceAtAge(subject.BirthDate, baseline, alternative, 95),
                    string.Empty,
                    string.Empty));
            }
        }

        decimal ContinuationPremium(decimal selectedIncome, YearMonth month)
        {
            var limits = resolver.ResolveStandardIncomeLimits(month.FirstDay);
            var income = Math.Clamp(selectedIncome, limits.MinimumKrw, limits.MaximumKrw);
            return decimal.Round(income * resolver.ResolveContributionRate(month.FirstDay).TotalRate.DecimalValue, 0, MidpointRounding.AwayFromZero);
        }
    }

    private static PersonStrategy BaselinePersonStrategy(PersonProfile person) =>
        new(0, 60, 0, 0, person.IsIncluded ? 100 : 120);

    private static IReadOnlyList<ScenarioDefinition> BuildScenarioDefinitions(int normalAgeMonths)
    {
        var continueTo65ClaimOffset = Math.Clamp(65 * 12 - normalAgeMonths, -60, 60);
        return new[]
        {
            new ScenarioDefinition("5년 조기수령", 60, -60),
            new ScenarioDefinition("정상수령", 60, 0),
            new ScenarioDefinition("5년 연기수령", 60, 60),
            new ScenarioDefinition("65세까지 임의계속가입 후 수령", 65, continueTo65ClaimOffset),
            new ScenarioDefinition("65세까지 임의계속가입 + 최대 연기", 65, 60)
        }
        .Where(item => normalAgeMonths + item.ClaimOffsetMonths >= item.ContinueUntilAgeYears * 12)
        .DistinctBy(item => (item.ContinueUntilAgeYears, item.ClaimOffsetMonths))
        .ToArray();
    }

    private static IReadOnlyList<(YearMonth Month, decimal Difference)> DifferenceSeries(
        HouseholdSimulationResult baseline,
        HouseholdSimulationResult alternative)
    {
        var months = baseline.Ledger.Select(row => row.Month)
            .Union(alternative.Ledger.Select(row => row.Month))
            .OrderBy(month => month);
        return months.Select(month => (month, alternative.CumulativeAt(month) - baseline.CumulativeAt(month))).ToArray();
    }

    private static string AdvantageWindow(DateOnly birthDate, IReadOnlyList<(YearMonth Month, decimal Difference)> series)
    {
        var nonZero = series.Select((item, index) => (item, index)).Where(value => value.item.Difference != 0).ToArray();
        if (nonZero.Length == 0) return "기준전략과 동일";
        var first = nonZero[0];
        var final = nonZero[^1];

        if (first.item.Difference < 0 && final.item.Difference > 0)
        {
            var crossing = series.Skip(first.index).First(item => item.Difference > 0);
            return $"{AgeText(birthDate, crossing.Month)}부터 이득";
        }
        if (first.item.Difference > 0 && final.item.Difference < 0)
        {
            var crossing = series.Skip(first.index).First(item => item.Difference < 0);
            return $"{AgeText(birthDate, crossing.Month)} 전까지 이득, 이후 손해";
        }
        if (final.item.Difference > 0) return "분석기간 동안 기준보다 이득";
        return "분석기간 동안 기준보다 손해";
    }

    private static decimal DifferenceAtAge(
        DateOnly birthDate,
        HouseholdSimulationResult baseline,
        HouseholdSimulationResult alternative,
        int ageYears)
    {
        var month = DomainDate.AgeMonth(birthDate, ageYears * 12);
        return alternative.CumulativeAt(month) - baseline.CumulativeAt(month);
    }

    private static decimal DifferenceAt(AutomaticStrategyRow row, int age) => age switch
    {
        75 => row.DifferenceAt75Krw,
        80 => row.DifferenceAt80Krw,
        85 => row.DifferenceAt85Krw,
        90 => row.DifferenceAt90Krw,
        95 => row.DifferenceAt95Krw,
        _ => throw new ArgumentOutOfRangeException(nameof(age))
    };

    private static string AgeText(DateOnly birthDate, YearMonth month)
    {
        var ageMonths = DomainDate.AgeMonthsAt(birthDate, month);
        return ageMonths % 12 == 0 ? $"{ageMonths / 12}세" : $"{ageMonths / 12}세 {ageMonths % 12}개월";
    }

    private static string SignedMoney(decimal value) => value switch
    {
        > 0 => $"+{value:N0}원",
        < 0 => $"{value:N0}원",
        _ => "차이 없음"
    };

    private static YearMonth Max(YearMonth left, YearMonth right) => left >= right ? left : right;

    private sealed record ScenarioDefinition(string Name, int ContinueUntilAgeYears, int ClaimOffsetMonths);
}
