namespace NpsSimulator.Domain;

public enum AccuracyGrade
{
    A,
    B,
    C
}

public sealed record NpsStatementAnchor(
    DateOnly? ExpectedClaimStartMonth,
    decimal? ExpectedMonthlyPensionAfterTaxKrw,
    decimal? ExpectedAnnualPensionAfterTaxKrw,
    decimal? TotalExpectedContributionKrw,
    DateOnly? ContributionPeriodStartMonth,
    DateOnly? ContributionPeriodEndMonth,
    bool MonthlyContributionEstimatedFromTotal,
    bool BirthMonthEstimatedFromClaimInfo = false);

public sealed record PersonProfile(
    string Alias,
    DateOnly BirthDate,
    int? CurrentContributionMonths,
    int ExpectedContributionMonthsAt60,
    decimal CurrentMonthlyPremiumKrw,
    decimal AnchoredMonthlyPensionKrw,
    decimal? ExpectedSurvivorPensionFromSpouseKrw,
    NpsStatementAnchor? NpsStatement = null,
    bool HasNationalPension = true,
    bool IsIncluded = true)
{
    public IReadOnlyList<string> Validate()
    {
        var errors = new List<string>();

        if (!IsIncluded) return errors;
        if (string.IsNullOrWhiteSpace(Alias)) errors.Add("별칭을 입력하세요.");
        if (BirthDate > DateOnly.FromDateTime(DateTime.Today)) errors.Add($"{Alias}: 생년월일이 미래입니다.");
        if (ExpectedSurvivorPensionFromSpouseKrw < 0) errors.Add($"{Alias}: 예상 유족연금은 0 이상이어야 합니다.");
        if (!HasNationalPension) return errors;

        if (CurrentContributionMonths < 0) errors.Add($"{Alias}: 현재 가입개월은 0 이상이어야 합니다.");
        if (CurrentContributionMonths is { } currentMonths && ExpectedContributionMonthsAt60 < currentMonths)
            errors.Add($"{Alias}: 공단 총 예상 가입개월은 현재 가입개월 이상이어야 합니다.");
        if (ExpectedContributionMonthsAt60 <= 0) errors.Add($"{Alias}: 60세 예상 가입개월을 입력하세요.");
        if (CurrentMonthlyPremiumKrw < 0) errors.Add($"{Alias}: 현재 보험료는 0 이상이어야 합니다.");
        if (AnchoredMonthlyPensionKrw < 0) errors.Add($"{Alias}: 공단 예상연금은 0 이상이어야 합니다.");
        if (NpsStatement is { } statement)
        {
            if (statement.TotalExpectedContributionKrw < 0) errors.Add($"{Alias}: 총 예상납부액은 0 이상이어야 합니다.");
            if (statement.ExpectedMonthlyPensionAfterTaxKrw < 0) errors.Add($"{Alias}: 세후 월 예상연금은 0 이상이어야 합니다.");
            if (statement.ExpectedAnnualPensionAfterTaxKrw < 0) errors.Add($"{Alias}: 세후 연 예상연금은 0 이상이어야 합니다.");
            if (statement.ContributionPeriodStartMonth is { } start && statement.ContributionPeriodEndMonth is { } end && start > end)
                errors.Add($"{Alias}: 예상 가입기간 종료월은 시작월 이후여야 합니다.");
            if (statement.MonthlyContributionEstimatedFromTotal && statement.TotalExpectedContributionKrw is null)
                errors.Add($"{Alias}: 월 보험료를 자동 추정하려면 총 예상납부액이 필요합니다.");
        }

        return errors;
    }
}

public sealed record HouseholdProfile(PersonProfile PersonA, PersonProfile PersonB)
{
    public IReadOnlyList<string> Validate() => PersonA.Validate().Concat(PersonB.Validate()).ToArray();
}

public sealed record PersonStrategy(
    int BackPaymentMonths,
    int ContinueUntilAgeYears,
    decimal ContinuationMonthlyPremiumKrw,
    int ClaimOffsetMonths,
    int DeathAgeYears,
    bool BackPaymentMonthsConfirmed = false,
    decimal? ContinuationStandardMonthlyIncomeKrw = null)
{
    public IReadOnlyList<string> Validate(string alias)
    {
        var errors = new List<string>();
        if (BackPaymentMonths < 0) errors.Add($"{alias}: 추납개월은 0 이상이어야 합니다.");
        if (BackPaymentMonths > 0 && !BackPaymentMonthsConfirmed)
            errors.Add($"{alias}: 추납개월을 공단에서 확인한 뒤 ‘공단 확인 완료’를 체크하세요.");
        if (ContinueUntilAgeYears is < 60 or > 65) errors.Add($"{alias}: 임의계속가입 종료 나이는 60~65세여야 합니다.");
        if (ContinuationMonthlyPremiumKrw < 0) errors.Add($"{alias}: 임의계속 보험료는 0 이상이어야 합니다.");
        if (ContinuationStandardMonthlyIncomeKrw < 0) errors.Add($"{alias}: 임의계속 기준소득월액은 0 이상이어야 합니다.");
        if (ClaimOffsetMonths is < -60 or > 60) errors.Add($"{alias}: 수령시점은 정상연령 기준 ±60개월 이내여야 합니다.");
        if (DeathAgeYears is < 60 or > 120) errors.Add($"{alias}: 사망가정 나이는 60~120세여야 합니다.");
        return errors;
    }
}

public sealed record HouseholdStrategy(string Name, PersonStrategy PersonA, PersonStrategy PersonB)
{
    public IReadOnlyList<string> Validate(HouseholdProfile profile) =>
        PersonA.Validate(profile.PersonA.Alias)
            .Concat(profile.PersonB.IsIncluded ? PersonB.Validate(profile.PersonB.Alias) : [])
            .ToArray();
}

public sealed record SimulationAssumptions(
    DateOnly ValuationDate,
    int SimulationEndAgeYears = 100,
    bool IncludeRegularContributionsToAge60 = true)
{
    public YearMonth ValuationMonth => YearMonth.FromDate(ValuationDate);
}

public static class DomainDate
{
    public static YearMonth AgeMonth(DateOnly birthDate, int ageMonths) =>
        YearMonth.FromDate(birthDate.AddMonths(ageMonths));

    public static int AgeMonthsAt(DateOnly birthDate, YearMonth month)
    {
        var birthMonth = YearMonth.FromDate(birthDate);
        return birthMonth.MonthsUntil(month);
    }

    public static YearMonth PensionStartMonth(DateOnly birthDate, int claimAgeMonths) =>
        AgeMonth(birthDate, claimAgeMonths).AddMonths(1);
}

public static class ContributionProjection
{
    public static int EstimateAtAge60(DateOnly birthDate, int currentContributionMonths, DateOnly valuationDate)
    {
        if (currentContributionMonths < 0) throw new ArgumentOutOfRangeException(nameof(currentContributionMonths));
        var valuationMonth = YearMonth.FromDate(valuationDate);
        var age60Month = DomainDate.AgeMonth(birthDate, 60 * 12);
        var futureContributionMonths = Math.Max(0, valuationMonth.MonthsUntil(age60Month));
        return checked(currentContributionMonths + futureContributionMonths);
    }

    public static int CalculateUncreditedGapCandidate(DateOnly periodStartMonth, DateOnly periodEndMonth, int creditedMonths)
    {
        if (periodEndMonth < periodStartMonth) throw new ArgumentException("가입기간 종료월은 시작월 이후여야 합니다.");
        if (creditedMonths < 0) throw new ArgumentOutOfRangeException(nameof(creditedMonths));
        var start = YearMonth.FromDate(periodStartMonth);
        var end = YearMonth.FromDate(periodEndMonth);
        var calendarMonths = checked(start.MonthsUntil(end) + 1);
        return Math.Max(0, calendarMonths - creditedMonths);
    }
}
