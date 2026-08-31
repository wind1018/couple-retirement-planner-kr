using NpsSimulator.Domain;
using NpsSimulator.Policy;
using NpsSimulator.Simulation;

namespace NpsSimulator.Application;

public sealed record SurvivorPensionPhase(
    YearMonth StartMonth,
    YearMonth EndMonth,
    string Status,
    decimal OwnPensionA,
    decimal OwnPensionB,
    decimal SurvivorAdditionA,
    decimal SurvivorAdditionB,
    decimal HouseholdMonthlyReceiptKrw,
    decimal PhaseTotalReceiptKrw);

public sealed record SurvivorAnnualPensionSnapshot(
    int Year,
    int AgeA,
    decimal OwnPensionA,
    decimal SurvivorAdditionA,
    int AgeB,
    decimal OwnPensionB,
    decimal SurvivorAdditionB,
    decimal CombinedMonthlyPensionKrw,
    string Status);

public sealed record SurvivorPensionReport(
    string PolicyPackId,
    DateTimeOffset GeneratedAt,
    string PersonAAlias,
    string PersonBAlias,
    int DeathAgeA,
    int DeathAgeB,
    YearMonth DeathMonthA,
    YearMonth DeathMonthB,
    string FirstDeathSummary,
    string SurvivorAlias,
    YearMonth? SurvivorTransitionMonth,
    decimal BothAliveCombinedMonthlyKrw,
    decimal MonthlyImmediatelyAfterFirstDeathKrw,
    decimal SurvivorPensionBeforeDuplicationKrw,
    decimal UnselectedSurvivorAdditionRate,
    decimal SurvivorOwnMonthlyPensionKrw,
    decimal KeepOwnPlusThirtyPercentKrw,
    decimal ChooseFullSurvivorKrw,
    decimal SelectedMonthlyAfterDuplicationKrw,
    string SelectedBenefitDescription,
    string SurvivorCalculationDescription,
    decimal TotalReceiptBeforeFirstDeathKrw,
    decimal TotalReceiptAfterFirstDeathKrw,
    decimal TotalLifetimeHouseholdReceiptKrw,
    IReadOnlyList<SurvivorPensionPhase> Phases,
    IReadOnlyList<SurvivorAnnualPensionSnapshot> AnnualTimeline,
    IReadOnlyList<string> Warnings);

public sealed class SurvivorPensionAnalysisService
{
    public SurvivorPensionReport Run(
        PolicyPack policyPack,
        HouseholdProfile household,
        int deathAgeA,
        int deathAgeB,
        DateOnly valuationDate,
        HouseholdStrategy? selectedRetirementStrategy = null)
    {
        if (!household.PersonB.IsIncluded)
            throw new ArgumentException("유족연금 시뮬레이션에는 배우자(B) 정보가 필요합니다.");

        var strategy = selectedRetirementStrategy is null
            ? new HouseholdStrategy(
                "유족연금 사망 나이 시나리오",
                new(0, 60, 0, 0, deathAgeA),
                new(0, 60, 0, 0, deathAgeB))
            : selectedRetirementStrategy with
            {
                Name = "선택 전략 + 유족연금 사망 나이 시나리오",
                PersonA = selectedRetirementStrategy.PersonA with { DeathAgeYears = deathAgeA },
                PersonB = selectedRetirementStrategy.PersonB with { DeathAgeYears = deathAgeB }
            };
        var resolver = new PolicyResolver(policyPack);
        var result = new HouseholdSimulator(resolver).Simulate(
            household,
            strategy,
            new(valuationDate, Math.Max(deathAgeA, deathAgeB)));

        var sameMonth = result.PersonA.DeathMonth == result.PersonB.DeathMonth;
        var aDiesFirst = result.PersonA.DeathMonth < result.PersonB.DeathMonth;
        var firstDeathMonth = sameMonth ? result.PersonA.DeathMonth : aDiesFirst ? result.PersonA.DeathMonth : result.PersonB.DeathMonth;
        var secondDeathMonth = sameMonth ? result.PersonA.DeathMonth : aDiesFirst ? result.PersonB.DeathMonth : result.PersonA.DeathMonth;
        var deceasedProfile = aDiesFirst ? household.PersonA : household.PersonB;
        var survivorProfile = aDiesFirst ? household.PersonB : household.PersonA;
        var deceasedSummary = aDiesFirst ? result.PersonA : result.PersonB;
        var survivorSummary = aDiesFirst ? result.PersonB : result.PersonA;
        var deceasedStrategy = aDiesFirst ? strategy.PersonA : strategy.PersonB;
        YearMonth? transitionMonth = sameMonth ? null : firstDeathMonth.AddMonths(1);

        decimal rawSurvivor = 0;
        decimal ownPension = 0;
        decimal ownPlusAdditional = 0;
        decimal fullSurvivor = 0;
        decimal selectedAfterDuplication = 0;
        var survivorAdditionRate = policyPack.DuplicateBenefit.UnselectedSurvivorPensionAdditionalRate.DecimalValue;
        string selection = "같은 달 사망 가정으로 생존 배우자 유족연금 기간이 없습니다.";
        string calculation = "동월 사망 가정: 배우자 생존기간이 없어 유족연금 전환을 계산하지 않습니다.";
        var survivorAlias = sameMonth ? "해당 없음" : survivorProfile.Alias;

        if (!sameMonth)
        {
            rawSurvivor = survivorProfile.ExpectedSurvivorPensionFromSpouseKrw
                          ?? EstimateSurvivorPension(resolver, deceasedSummary, deceasedStrategy.ClaimOffsetMonths, out calculation);
            if (survivorProfile.ExpectedSurvivorPensionFromSpouseKrw is { } confirmed)
                calculation = $"공단 확인 유족연금 입력값 {confirmed:N0}원을 우선 적용";

            ownPension = survivorSummary.EstimatedMonthlyPensionKrw;
            fullSurvivor = rawSurvivor;
            ownPlusAdditional = Round(ownPension + (rawSurvivor * survivorAdditionRate));
            selectedAfterDuplication = Math.Max(ownPlusAdditional, fullSurvivor);
            selection = ownPension <= 0
                ? $"본인 노령연금이 없으므로 유족연금 전액 {fullSurvivor:N0}원 선택"
                : ownPlusAdditional >= fullSurvivor
                    ? $"본인 노령연금 + 유족연금 {survivorAdditionRate:P0}가 더 큼: {ownPlusAdditional:N0}원 선택"
                    : $"유족연금 전액이 더 큼: {fullSurvivor:N0}원 선택";
        }

        var bothAliveRow = result.Ledger
            .Where(row => row.Month <= firstDeathMonth && row.PensionA > 0 && row.PensionB > 0)
            .LastOrDefault();
        var bothAliveCombined = bothAliveRow is null
            ? result.Ledger.Where(row => row.Month <= firstDeathMonth).Select(Receipt).DefaultIfEmpty(0).Max()
            : Receipt(bothAliveRow);
        var beforeTotal = result.Ledger.Where(row => row.Month <= firstDeathMonth).Sum(Receipt);
        var afterTotal = sameMonth ? 0 : result.Ledger.Where(row => row.Month > firstDeathMonth && row.Month <= secondDeathMonth).Sum(Receipt);
        var monthlyImmediatelyAfterFirstDeath = transitionMonth is { } firstSurvivorMonth
            ? result.Ledger.Where(row => row.Month == firstSurvivorMonth).Select(Receipt).FirstOrDefault()
            : 0;
        var phases = BuildPhases(result.Ledger, firstDeathMonth, secondDeathMonth, sameMonth, deceasedProfile.Alias, survivorAlias);
        var annualTimeline = result.Ledger
            .Where(row => row.Month <= secondDeathMonth && Receipt(row) > 0)
            .GroupBy(row => row.Month.Year)
            .Select(year => year.Last())
            .Select(row => new SurvivorAnnualPensionSnapshot(
                row.Month.Year,
                row.AgeMonthsA / 12,
                row.PensionA,
                row.SurvivorPensionA,
                row.AgeMonthsB / 12,
                row.PensionB,
                row.SurvivorPensionB,
                Receipt(row),
                sameMonth || row.Month <= firstDeathMonth
                    ? "부부 생존"
                    : $"{deceasedProfile.Alias} 사망 후 · {survivorAlias} 수령"))
            .ToArray();
        var firstDeathSummary = sameMonth
            ? $"두 사람 모두 {firstDeathMonth}에 사망하는 것으로 계산"
            : $"{deceasedProfile.Alias}이(가) 먼저 사망: {firstDeathMonth} · {survivorAlias} 유족연금 전환: {transitionMonth}";
        var warnings = result.Warnings
            .Concat(policyPack.Notes)
            .Append("사망 나이는 입력한 나이의 생일이 있는 달로 가정하고, 유족연금은 그 다음 달부터 반영합니다.")
            .Append("‘유족연금 전액’은 사망자의 노령연금 100%가 아니라 법정 산식으로 계산된 유족연금액의 100%를 뜻합니다.")
            .Append("배우자의 유족연금 수급 자격·생계유지 요건과 실제 확정액은 국민연금공단 판단이 우선합니다.")
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return new(
            policyPack.PolicyPackId,
            DateTimeOffset.Now,
            household.PersonA.Alias,
            household.PersonB.Alias,
            deathAgeA,
            deathAgeB,
            result.PersonA.DeathMonth,
            result.PersonB.DeathMonth,
            firstDeathSummary,
            survivorAlias,
            transitionMonth,
            bothAliveCombined,
            monthlyImmediatelyAfterFirstDeath,
            rawSurvivor,
            survivorAdditionRate,
            ownPension,
            ownPlusAdditional,
            fullSurvivor,
            selectedAfterDuplication,
            selection,
            calculation,
            beforeTotal,
            afterTotal,
            beforeTotal + afterTotal,
            phases,
            annualTimeline,
            warnings);
    }

    private static decimal EstimateSurvivorPension(
        PolicyResolver resolver,
        PersonSimulationSummary deceased,
        int claimOffsetMonths,
        out string description)
    {
        if (!deceased.HasNationalPension || deceased.EstimatedMonthlyPensionKrw <= 0)
        {
            description = "사망 배우자의 노령연금이 없어 추정 유족연금 0원";
            return 0;
        }

        var oldAgeRate = resolver.ResolveOldAgePensionRate(deceased.CreditedContributionMonths);
        var survivorRate = resolver.ResolveSurvivorPensionRate(deceased.CreditedContributionMonths);
        if (oldAgeRate <= 0)
        {
            description = "최소 가입기간 미달로 추정 유족연금 0원";
            return 0;
        }

        var claimAdjustment = resolver.ResolveClaimAdjustmentFactor(claimOffsetMonths);
        var estimatedNormalOldAgePension = claimAdjustment > 0
            ? deceased.EstimatedMonthlyPensionKrw / claimAdjustment
            : deceased.EstimatedMonthlyPensionKrw;
        var estimatedBasicPension = estimatedNormalOldAgePension / oldAgeRate;
        var beforeCap = Round(estimatedBasicPension * survivorRate);
        var deceasedWasReceiving = deceased.DeathMonth >= deceased.ActualClaimMonth;
        var estimated = resolver.SurvivorBenefit.CapAtDeceasedOldAgePension && deceasedWasReceiving
            ? Math.Min(beforeCap, deceased.EstimatedMonthlyPensionKrw)
            : beforeCap;
        description = $"사망자 추정 기본연금액 {estimatedBasicPension:N0}원 × 가입기간별 유족 지급률 {survivorRate:P0} = {beforeCap:N0}원"
                      + (estimated != beforeCap ? $", 사망자가 받던 노령연금 상한 적용 → {estimated:N0}원" : string.Empty);
        return estimated;
    }

    private static IReadOnlyList<SurvivorPensionPhase> BuildPhases(
        IReadOnlyList<MonthlyLedgerRow> ledger,
        YearMonth firstDeathMonth,
        YearMonth secondDeathMonth,
        bool sameMonth,
        string deceasedAlias,
        string survivorAlias)
    {
        var source = ledger.Where(row => row.Month <= secondDeathMonth && Receipt(row) > 0).ToArray();
        if (source.Length == 0) return [];
        var phases = new List<SurvivorPensionPhase>();
        var start = source[0];
        var previous = start;
        var status = Status(start.Month);

        foreach (var row in source.Skip(1))
        {
            var rowStatus = Status(row.Month);
            var consecutive = previous.Month.AddMonths(1) == row.Month;
            var sameAmounts = previous.PensionA == row.PensionA && previous.PensionB == row.PensionB
                              && previous.SurvivorPensionA == row.SurvivorPensionA && previous.SurvivorPensionB == row.SurvivorPensionB;
            if (!consecutive || !sameAmounts || rowStatus != status)
            {
                phases.Add(CreatePhase(start, previous, status));
                start = row;
                status = rowStatus;
            }
            previous = row;
        }
        phases.Add(CreatePhase(start, previous, status));
        return phases;

        string Status(YearMonth month) => sameMonth || month <= firstDeathMonth
            ? "부부 생존"
            : $"{deceasedAlias} 사망 후 · {survivorAlias} 생존";

        static SurvivorPensionPhase CreatePhase(MonthlyLedgerRow startRow, MonthlyLedgerRow endRow, string phaseStatus)
        {
            var months = startRow.Month.MonthsUntil(endRow.Month) + 1;
            var monthly = Receipt(startRow);
            return new(startRow.Month, endRow.Month, phaseStatus, startRow.PensionA, startRow.PensionB,
                startRow.SurvivorPensionA, startRow.SurvivorPensionB, monthly, monthly * months);
        }
    }

    private static decimal Receipt(MonthlyLedgerRow row) => row.PensionA + row.PensionB + row.SurvivorPensionA + row.SurvivorPensionB;
    private static decimal Round(decimal value) => decimal.Round(value, 0, MidpointRounding.AwayFromZero);
}
