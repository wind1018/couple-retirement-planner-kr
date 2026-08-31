using System.Security.Cryptography;
using System.Text;
using NpsSimulator.Domain;
using NpsSimulator.Policy;

namespace NpsSimulator.Simulation;

public sealed class HouseholdSimulator(PolicyResolver policy)
{
    public HouseholdSimulationResult Simulate(
        HouseholdProfile household,
        HouseholdStrategy strategy,
        SimulationAssumptions assumptions)
    {
        var errors = household.Validate().Concat(strategy.Validate(household)).ToArray();
        if (errors.Length > 0) throw new ArgumentException(string.Join(Environment.NewLine, errors));

        var warnings = new List<string>();
        var planA = BuildPersonPlan(household.PersonA, strategy.PersonA, assumptions, warnings);
        var planB = BuildPersonPlan(household.PersonB, strategy.PersonB, assumptions, warnings);
        if (household.PersonA.ExpectedSurvivorPensionFromSpouseKrw is null && household.PersonB.IsIncluded && household.PersonB.HasNationalPension)
            warnings.Add($"{household.PersonA.Alias}: {household.PersonB.Alias} 사망 시 유족연금은 공단 확인값이 없어 예상 노령연금·가입기간과 정책 지급률로 자동 추정했습니다.");
        if (household.PersonB.IsIncluded && household.PersonB.ExpectedSurvivorPensionFromSpouseKrw is null && household.PersonA.HasNationalPension)
            warnings.Add($"{household.PersonB.Alias}: {household.PersonA.Alias} 사망 시 유족연금은 공단 확인값이 없어 예상 노령연금·가입기간과 정책 지급률로 자동 추정했습니다.");
        var deathEndMonth = !household.PersonB.IsIncluded || planA.DeathMonth >= planB.DeathMonth ? planA.DeathMonth : planB.DeathMonth;
        var assumptionEndA = DomainDate.AgeMonth(household.PersonA.BirthDate, assumptions.SimulationEndAgeYears * 12);
        var assumptionEndMonth = household.PersonB.IsIncluded
            ? Max(assumptionEndA, DomainDate.AgeMonth(household.PersonB.BirthDate, assumptions.SimulationEndAgeYears * 12))
            : assumptionEndA;
        var endMonth = deathEndMonth <= assumptionEndMonth ? deathEndMonth : assumptionEndMonth;
        var ledger = new List<MonthlyLedgerRow>();
        decimal cumulative = 0;

        for (var month = assumptions.ValuationMonth; month <= endMonth; month = month.AddMonths(1))
        {
            var ownA = CalculateOwnCashflow(planA, month, assumptions);
            var ownB = CalculateOwnCashflow(planB, month, assumptions);
            var survivorA = CalculateSurvivorAddition(planA, planB, month, ownA.Pension);
            var survivorB = CalculateSurvivorAddition(planB, planA, month, ownB.Pension);
            var net = ownA.Pension + ownB.Pension + survivorA + survivorB
                - ownA.Contribution - ownB.Contribution - ownA.BackPayment - ownB.BackPayment;
            cumulative += net;

            ledger.Add(new(
                month,
                DomainDate.AgeMonthsAt(household.PersonA.BirthDate, month),
                household.PersonB.IsIncluded ? DomainDate.AgeMonthsAt(household.PersonB.BirthDate, month) : -1,
                ownA.Contribution,
                ownB.Contribution,
                ownA.BackPayment,
                ownB.BackPayment,
                ownA.Pension,
                ownB.Pension,
                survivorA,
                survivorB,
                net,
                cumulative));
        }

        return new(
            strategy.Name,
            policy.Pack.PolicyPackId,
            ComputePolicyHash(policy.Pack),
            Summarize(planA, ledger, true),
            Summarize(planB, ledger, false),
            ledger,
            warnings.Distinct(StringComparer.Ordinal).ToArray());
    }

    private PersonPlan BuildPersonPlan(
        PersonProfile person,
        PersonStrategy strategy,
        SimulationAssumptions assumptions,
        ICollection<string> warnings)
    {
        if (!person.IsIncluded)
        {
            warnings.Add("배우자를 포함하지 않은 1인 기준으로 계산했습니다.");
            return new(
                person,
                strategy,
                assumptions.ValuationMonth,
                assumptions.ValuationMonth,
                assumptions.ValuationMonth,
                assumptions.ValuationMonth,
                assumptions.ValuationMonth,
                assumptions.ValuationMonth,
                0, 0, 0, 0, 0);
        }

        var normalAgeMonths = policy.ResolveNormalClaimAgeMonths(person.BirthDate);
        var actualOffset = Math.Clamp(
            strategy.ClaimOffsetMonths,
            -policy.Pack.PensionAdjustment.MaximumEarlyMonths,
            policy.Pack.PensionAdjustment.MaximumDeferredMonths);
        var policyNormalClaimMonth = DomainDate.PensionStartMonth(person.BirthDate, normalAgeMonths);
        var normalClaimMonth = person.NpsStatement?.ExpectedClaimStartMonth is { } confirmedClaimMonth
            ? YearMonth.FromDate(confirmedClaimMonth)
            : policyNormalClaimMonth;
        var claimMonth = normalClaimMonth.AddMonths(actualOffset);
        var regularContributionEndMonth = person.NpsStatement?.ContributionPeriodEndMonth is { } confirmedEndMonth
            ? YearMonth.FromDate(confirmedEndMonth).AddMonths(1)
            : DomainDate.AgeMonth(person.BirthDate, 720);
        var continuationMonths = person.HasNationalPension ? Math.Max(0, (strategy.ContinueUntilAgeYears - 60) * 12) : 0;
        var permittedBackPayment = person.HasNationalPension
            ? Math.Min(strategy.BackPaymentMonths, policy.Pack.Qualification.MaximumBackPaymentMonths)
            : 0;
        var creditedMonths = person.HasNationalPension
            ? person.ExpectedContributionMonthsAt60 + permittedBackPayment + continuationMonths
            : 0;
        var qualifies = person.HasNationalPension && creditedMonths >= policy.Pack.Qualification.MinimumContributionMonths;
        var pensionEquivalentContinuationMonths = (decimal)continuationMonths;
        if (continuationMonths > 0 && strategy.ContinuationStandardMonthlyIncomeKrw is { } continuationIncome && continuationIncome > 0)
        {
            var valuationRate = policy.ResolveContributionRate(assumptions.ValuationDate).TotalRate.DecimalValue;
            var anchoredStandardIncome = valuationRate > 0 && person.CurrentMonthlyPremiumKrw > 0
                ? person.CurrentMonthlyPremiumKrw / valuationRate
                : continuationIncome;
            pensionEquivalentContinuationMonths *= continuationIncome / anchoredStandardIncome;
        }
        else if (continuationMonths > 0 && strategy.ContinuationMonthlyPremiumKrw > 0 && person.CurrentMonthlyPremiumKrw > 0)
        {
            pensionEquivalentContinuationMonths *= strategy.ContinuationMonthlyPremiumKrw / person.CurrentMonthlyPremiumKrw;
        }
        var pensionEquivalentMonths = person.ExpectedContributionMonthsAt60 + permittedBackPayment + pensionEquivalentContinuationMonths;
        var basePension = person.ExpectedContributionMonthsAt60 == 0
            ? 0
            : person.AnchoredMonthlyPensionKrw * pensionEquivalentMonths / person.ExpectedContributionMonthsAt60;
        var adjustedPension = qualifies
            ? RoundKrw(basePension * policy.ResolveClaimAdjustmentFactor(actualOffset))
            : 0;

        if (DomainDate.AgeMonth(person.BirthDate, strategy.DeathAgeYears * 12) < assumptions.ValuationMonth)
            throw new ArgumentException($"{person.Alias}: 사망가정 나이가 현재 나이보다 작습니다.");

        if (!person.HasNationalPension)
            warnings.Add($"{person.Alias}: 국민연금 미가입으로 본인 노령연금과 보험료 납부를 0원으로 처리했습니다. 배우자 사망에 따른 유족연금은 별도로 계산합니다.");
        else if (strategy.BackPaymentMonths > permittedBackPayment)
            warnings.Add($"{person.Alias}: 추납 {strategy.BackPaymentMonths}개월 중 정책상 최대 {permittedBackPayment}개월만 반영했습니다.");
        if (person.HasNationalPension && !qualifies)
            warnings.Add($"{person.Alias}: 예상 가입기간이 최소 가입기간에 미달하여 노령연금을 0원으로 처리했습니다.");
        if (strategy.ClaimOffsetMonths != actualOffset)
            warnings.Add($"{person.Alias}: 요청한 수령시점이 정책 범위를 벗어나 {actualOffset}개월로 조정되었습니다.");
        if (normalClaimMonth != policyNormalClaimMonth)
            warnings.Add($"{person.Alias}: 정상 수급 시작월은 계산값 대신 NPS 앱 확인값 {normalClaimMonth}을 사용했습니다.");
        if (person.NpsStatement?.MonthlyContributionEstimatedFromTotal == true)
            warnings.Add($"{person.Alias}: 납부 비용은 총 예상납부액을 총 예상 가입개월로 나눈 월평균 {person.CurrentMonthlyPremiumKrw:N0}원으로 근사했습니다.");
        if (person.NpsStatement?.ContributionPeriodStartMonth is { } periodStart
            && person.NpsStatement.ContributionPeriodEndMonth is { } periodEnd)
        {
            var gapCandidate = ContributionProjection.CalculateUncreditedGapCandidate(periodStart, periodEnd, person.ExpectedContributionMonthsAt60);
            if (gapCandidate > 0)
                warnings.Add($"{person.Alias}: 가입기간 달력 공백 {gapCandidate}개월은 추납 가능 후보일 뿐이며, 확정 추납개월은 사용자 확인값만 사용합니다.");
        }
        if (person.HasNationalPension)
            warnings.Add(strategy.ContinuationStandardMonthlyIncomeKrw is > 0
                ? $"{person.Alias}: 추가 가입의 연금 증가는 공단 예상연금을 가입개월과 선택 기준소득월액에 비례시킨 Anchor Mode 근사입니다. 실제 연금 산식의 전체 가입이력 평균과 다를 수 있습니다."
                : strategy.ContinuationMonthlyPremiumKrw > 0
                    ? $"{person.Alias}: 추가 가입의 연금 증가는 공단 예상연금을 가입개월과 입력 월 보험료에 비례시킨 Anchor Mode 근사입니다. 실제 연금 산식의 전체 가입이력 평균과 다를 수 있습니다."
                : $"{person.Alias}: 추가 가입기간의 연금 증가는 공단 예상연금을 가입개월에 비례시킨 Anchor Mode 추정입니다.");

        return new(
            person,
            strategy,
            assumptions.ValuationMonth,
            regularContributionEndMonth,
            DomainDate.AgeMonth(person.BirthDate, strategy.ContinueUntilAgeYears * 12),
            normalClaimMonth,
            claimMonth,
            DomainDate.AgeMonth(person.BirthDate, strategy.DeathAgeYears * 12),
            permittedBackPayment,
            continuationMonths,
            creditedMonths,
            RoundKrw(qualifies ? basePension : 0),
            adjustedPension);
    }

    private PersonCashflow CalculateOwnCashflow(PersonPlan plan, YearMonth month, SimulationAssumptions assumptions)
    {
        var deathEffectiveMonth = plan.DeathMonth.AddMonths(1);
        if (month >= deathEffectiveMonth) return new(0, 0, 0);

        decimal contribution = 0;
        if (assumptions.IncludeRegularContributionsToAge60 && month < plan.Age60Month)
            contribution = plan.Person.CurrentMonthlyPremiumKrw;
        else if (month >= plan.Age60Month && month < plan.ContinueUntilMonth)
            contribution = CalculateContinuationPremium(plan.Strategy, month);

        var backPayment = month == plan.ValuationMonth
            ? plan.PermittedBackPaymentMonths * plan.Person.CurrentMonthlyPremiumKrw
            : 0;
        var pension = month >= plan.ClaimMonth ? plan.EstimatedMonthlyPensionKrw : 0;
        return new(contribution, backPayment, pension);
    }

    private decimal CalculateContinuationPremium(PersonStrategy strategy, YearMonth contributionMonth)
    {
        if (strategy.ContinuationStandardMonthlyIncomeKrw is not { } selectedIncome || selectedIncome <= 0)
            return strategy.ContinuationMonthlyPremiumKrw;

        var limits = policy.ResolveStandardIncomeLimits(contributionMonth.FirstDay);
        var standardIncome = Math.Clamp(selectedIncome, limits.MinimumKrw, limits.MaximumKrw);
        var rate = policy.ResolveContributionRate(contributionMonth.FirstDay).TotalRate.DecimalValue;
        return RoundKrw(standardIncome * rate);
    }

    private decimal CalculateSurvivorAddition(PersonPlan survivor, PersonPlan deceased, YearMonth month, decimal survivorOwnPension)
    {
        if (!survivor.Person.IsIncluded || !deceased.Person.IsIncluded) return 0;
        if (month < deceased.DeathMonth.AddMonths(1) || month >= survivor.DeathMonth.AddMonths(1)) return 0;
        var survivorPension = survivor.Person.ExpectedSurvivorPensionFromSpouseKrw ?? EstimateSurvivorPension(deceased);
        if (survivorPension <= 0) return 0;

        if (survivorOwnPension <= 0) return survivorPension;
        var ownPlusAdditional = survivorOwnPension + (survivorPension * policy.Pack.DuplicateBenefit.UnselectedSurvivorPensionAdditionalRate.DecimalValue);
        var selectedTotal = Math.Max(ownPlusAdditional, survivorPension);
        return RoundKrw(selectedTotal - survivorOwnPension);
    }

    private decimal EstimateSurvivorPension(PersonPlan deceased)
    {
        var oldAgePensionRate = policy.ResolveOldAgePensionRate(deceased.CreditedContributionMonths);
        if (oldAgePensionRate <= 0 || deceased.EstimatedNormalMonthlyPensionKrw <= 0) return 0;

        var estimatedBasicPension = deceased.EstimatedNormalMonthlyPensionKrw / oldAgePensionRate;
        var survivorRate = policy.ResolveSurvivorPensionRate(deceased.CreditedContributionMonths);
        var estimate = estimatedBasicPension * survivorRate;

        var deceasedWasReceivingOldAgePension = deceased.DeathMonth >= deceased.ClaimMonth;
        if (policy.SurvivorBenefit.CapAtDeceasedOldAgePension && deceasedWasReceivingOldAgePension)
            estimate = Math.Min(estimate, deceased.EstimatedMonthlyPensionKrw);

        return RoundKrw(estimate);
    }

    private static PersonSimulationSummary Summarize(PersonPlan plan, IReadOnlyList<MonthlyLedgerRow> ledger, bool isA)
    {
        decimal Sum(Func<MonthlyLedgerRow, decimal> selector) => ledger.Sum(selector);
        return new(
            plan.Person.Alias,
            plan.NormalClaimMonth,
            plan.ClaimMonth,
            plan.DeathMonth,
            plan.CreditedContributionMonths,
            plan.EstimatedMonthlyPensionKrw,
            isA ? Sum(row => row.ContributionA) : Sum(row => row.ContributionB),
            isA ? Sum(row => row.BackPaymentA) : Sum(row => row.BackPaymentB),
            isA ? Sum(row => row.PensionA) : Sum(row => row.PensionB),
            isA ? Sum(row => row.SurvivorPensionA) : Sum(row => row.SurvivorPensionB),
            AccuracyGrade.B,
            plan.Person.HasNationalPension,
            plan.Person.IsIncluded);
    }

    private static YearMonth Max(YearMonth left, YearMonth right) => left >= right ? left : right;

    private static decimal RoundKrw(decimal value) => decimal.Round(value, 0, MidpointRounding.AwayFromZero);

    private static string ComputePolicyHash(PolicyPack pack)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(PolicyJson.SerializePack(pack)));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private sealed record PersonPlan(
        PersonProfile Person,
        PersonStrategy Strategy,
        YearMonth ValuationMonth,
        YearMonth Age60Month,
        YearMonth ContinueUntilMonth,
        YearMonth NormalClaimMonth,
        YearMonth ClaimMonth,
        YearMonth DeathMonth,
        int PermittedBackPaymentMonths,
        int ContinuationMonths,
        int CreditedContributionMonths,
        decimal EstimatedNormalMonthlyPensionKrw,
        decimal EstimatedMonthlyPensionKrw);

    private readonly record struct PersonCashflow(decimal Contribution, decimal BackPayment, decimal Pension);
}
