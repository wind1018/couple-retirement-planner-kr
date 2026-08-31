using NpsSimulator.Domain;

namespace NpsSimulator.Simulation;

public sealed class StrategyComparer
{
    public StrategyComparisonResult Compare(
        HouseholdProfile household,
        HouseholdSimulationResult baseline,
        HouseholdSimulationResult alternative)
    {
        var baselineByMonth = baseline.Ledger.ToDictionary(row => row.Month);
        var alternativeByMonth = alternative.Ledger.ToDictionary(row => row.Month);
        var months = baselineByMonth.Keys.Union(alternativeByMonth.Keys).OrderBy(month => month).ToArray();
        var points = new List<BreakEvenPoint>();
        decimal previousDifference = 0;
        var hasBeenNegative = false;

        foreach (var month in months)
        {
            var baselineCumulative = baselineByMonth.TryGetValue(month, out var baselineRow)
                ? baselineRow.CumulativeNetCashflow
                : baseline.Ledger.LastOrDefault(row => row.Month < month)?.CumulativeNetCashflow ?? 0;
            var alternativeCumulative = alternativeByMonth.TryGetValue(month, out var alternativeRow)
                ? alternativeRow.CumulativeNetCashflow
                : alternative.Ledger.LastOrDefault(row => row.Month < month)?.CumulativeNetCashflow ?? 0;
            var difference = alternativeCumulative - baselineCumulative;

            if (difference < 0) hasBeenNegative = true;
            if (hasBeenNegative && previousDifference < 0 && difference >= 0)
            {
                points.Add(new(
                    month,
                    DomainDate.AgeMonthsAt(household.PersonA.BirthDate, month),
                    household.PersonB.IsIncluded ? DomainDate.AgeMonthsAt(household.PersonB.BirthDate, month) : -1,
                    false));
            }

            previousDifference = difference;
        }

        BreakEvenPoint? permanent = null;
        foreach (var point in points)
        {
            var remainsAhead = months.Where(month => month >= point.Month).All(month =>
                Cumulative(alternative, month) - Cumulative(baseline, month) >= 0);
            if (!remainsAhead) continue;
            permanent = point with { IsPermanent = true };
            break;
        }

        var both85 = BothReachedAge(household, 85);
        var both90 = BothReachedAge(household, 90);
        return new(
            baseline,
            alternative,
            points.Select(point => permanent is not null && point.Month == permanent.Month ? point with { IsPermanent = true } : point).ToArray(),
            permanent,
            Cumulative(alternative, both85) - Cumulative(baseline, both85),
            Cumulative(alternative, both90) - Cumulative(baseline, both90));
    }

    private static YearMonth BothReachedAge(HouseholdProfile household, int age)
    {
        var a = DomainDate.AgeMonth(household.PersonA.BirthDate, age * 12);
        if (!household.PersonB.IsIncluded) return a;
        var b = DomainDate.AgeMonth(household.PersonB.BirthDate, age * 12);
        return a >= b ? a : b;
    }

    private static decimal Cumulative(HouseholdSimulationResult result, YearMonth month) => result.CumulativeAt(month);
}
