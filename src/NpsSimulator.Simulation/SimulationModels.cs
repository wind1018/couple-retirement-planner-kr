using NpsSimulator.Domain;

namespace NpsSimulator.Simulation;

public sealed record PersonSimulationSummary(
    string Alias,
    YearMonth NormalClaimMonth,
    YearMonth ActualClaimMonth,
    YearMonth DeathMonth,
    int CreditedContributionMonths,
    decimal EstimatedMonthlyPensionKrw,
    decimal TotalFutureContributionKrw,
    decimal TotalBackPaymentKrw,
    decimal TotalPensionReceivedKrw,
    decimal TotalSurvivorPensionReceivedKrw,
    AccuracyGrade AccuracyGrade,
    bool HasNationalPension,
    bool IsIncluded);

public sealed record MonthlyLedgerRow(
    YearMonth Month,
    int AgeMonthsA,
    int AgeMonthsB,
    decimal ContributionA,
    decimal ContributionB,
    decimal BackPaymentA,
    decimal BackPaymentB,
    decimal PensionA,
    decimal PensionB,
    decimal SurvivorPensionA,
    decimal SurvivorPensionB,
    decimal HouseholdNetCashflow,
    decimal CumulativeNetCashflow)
{
    public string MonthText => Month.ToString();
    public string AgeAText => $"{AgeMonthsA / 12}세 {AgeMonthsA % 12}개월";
    public string AgeBText => AgeMonthsB < 0 ? "-" : $"{AgeMonthsB / 12}세 {AgeMonthsB % 12}개월";
}

public sealed record HouseholdSimulationResult(
    string StrategyName,
    string PolicyPackId,
    string PolicyContentHash,
    PersonSimulationSummary PersonA,
    PersonSimulationSummary PersonB,
    IReadOnlyList<MonthlyLedgerRow> Ledger,
    IReadOnlyList<string> Warnings)
{
    public decimal FinalCumulativeNetCashflow => Ledger.Count == 0 ? 0 : Ledger[^1].CumulativeNetCashflow;

    public decimal CumulativeAt(YearMonth month)
    {
        var row = Ledger.LastOrDefault(item => item.Month <= month);
        return row?.CumulativeNetCashflow ?? 0;
    }
}

public sealed record BreakEvenPoint(YearMonth Month, int AgeMonthsA, int AgeMonthsB, bool IsPermanent)
{
    public string Description => AgeMonthsB < 0
        ? $"{Month} · A {AgeMonthsA / 12}세 {AgeMonthsA % 12}개월"
        : $"{Month} · A {AgeMonthsA / 12}세 {AgeMonthsA % 12}개월 / B {AgeMonthsB / 12}세 {AgeMonthsB % 12}개월";
}

public sealed record StrategyComparisonResult(
    HouseholdSimulationResult Baseline,
    HouseholdSimulationResult Alternative,
    IReadOnlyList<BreakEvenPoint> Crossovers,
    BreakEvenPoint? PermanentAdvantageStarts,
    decimal DifferenceAtBothAge85,
    decimal DifferenceAtBothAge90);
