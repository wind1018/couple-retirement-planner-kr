using System.Text.Json;

namespace NpsSimulator.Policy;

public sealed class PolicyUpdateService(PolicyValidator validator)
{
    private static readonly HashSet<string> AllowedRuleIds = new(StringComparer.Ordinal)
    {
        "contribution.rate.total",
        "standardIncome.limits",
        "voluntaryContinuation.standardIncomeChoices",
        "oldAge.normalClaimAge",
        "earlyPension.maximumMonths",
        "earlyPension.reductionPerMonth",
        "deferredPension.maximumMonths",
        "deferredPension.bonusPerMonth",
        "qualification.minimumContributionMonths",
        "backPayment.maximumMonths",
        "duplicateBenefit.survivorAdditionalRate",
        "survivorBenefit.oldAgeBaseRate",
        "survivorBenefit.oldAgeAdditionalRatePerMonth",
        "survivorBenefit.pensionRateTiers",
        "survivorBenefit.capAtDeceasedOldAgePension",
        "pensionIncomeTax.estimation"
    };

    public PolicyUpdateDocument DeserializeUpdate(string json) =>
        JsonSerializer.Deserialize<PolicyUpdateDocument>(json, PolicyJson.Options)
        ?? throw new InvalidDataException("정책 업데이트 파일이 비어 있습니다.");

    public PolicyUpdateResult Apply(PolicyPack basePack, PolicyUpdateDocument update)
    {
        var issues = new List<PolicyValidationIssue>();
        var summaries = new List<string>();

        if (!string.Equals(update.BasePolicyPackId, basePack.PolicyPackId, StringComparison.Ordinal))
        {
            issues.Add(new("BASE_POLICY_MISMATCH", $"기준 정책이 다릅니다. 필요: {update.BasePolicyPackId}, 현재: {basePack.PolicyPackId}", true));
        }

        if (string.IsNullOrWhiteSpace(update.PolicyPackId) || update.PolicyPackId == basePack.PolicyPackId)
        {
            issues.Add(new("NEW_POLICY_ID_REQUIRED", "새로운 policyPackId가 필요합니다.", true));
        }

        if (!string.Equals(update.CreatedBy, "AI_ASSISTED", StringComparison.Ordinal))
        {
            issues.Add(new("CREATOR_INVALID", "AI 업데이트 파일의 createdBy는 AI_ASSISTED여야 합니다.", true));
        }

        if (update.LegalStatus == PolicyLegalStatus.Draft)
        {
            issues.Add(new("DRAFT_NOT_ACTIVATABLE", "초안 정책은 활성화할 수 없습니다. 공식 확정 또는 사용자 시나리오로 구분하세요.", true));
        }

        if (update.UnresolvedItems.Count > 0)
        {
            issues.Add(new("TODO_LEGAL_REMAINS", $"확인되지 않은 법적 항목이 {update.UnresolvedItems.Count}건 있습니다.", true));
        }

        if (update.EngineUpgradeRequired.Count > 0)
        {
            issues.Add(new("ENGINE_UPGRADE_REQUIRED", $"프로그램 업데이트가 필요한 항목이 {update.EngineUpgradeRequired.Count}건 있습니다.", true));
        }

        foreach (var change in update.Changes.Where(change => !AllowedRuleIds.Contains(change.RuleId)))
        {
            issues.Add(new("UNKNOWN_RULE_ID", $"현재 프로그램이 지원하지 않는 규칙입니다: {change.RuleId}", true, change.RuleId));
        }

        if (issues.Any(issue => issue.IsError)) return new(false, null, issues, summaries);

        var pack = basePack with
        {
            PolicyPackId = update.PolicyPackId,
            Supersedes = basePack.PolicyPackId,
            PublishedAt = update.CreatedAt,
            LegalStatus = update.LegalStatus,
            LegalSources = basePack.LegalSources.Concat(update.LegalSources)
                .GroupBy(source => source.Id, StringComparer.Ordinal)
                .Select(group => group.Last())
                .ToArray()
        };

        foreach (var change in update.Changes)
        {
            if (!string.Equals(change.Operation, "ADD_RULE_VERSION", StringComparison.Ordinal))
            {
                issues.Add(new("UNSUPPORTED_OPERATION", $"지원하지 않는 작업입니다: {change.Operation}", true, change.RuleId));
                continue;
            }

            try
            {
                pack = ApplyChange(pack, change, summaries);
            }
            catch (Exception exception) when (exception is JsonException or InvalidOperationException or ArgumentException)
            {
                issues.Add(new("CHANGE_APPLY_FAILED", exception.Message, true, change.RuleId));
            }
        }

        if (issues.Any(issue => issue.IsError)) return new(false, null, issues, summaries);

        issues.AddRange(validator.Validate(pack).Issues);
        return new(!issues.Any(issue => issue.IsError), pack, issues, summaries);
    }

    private static PolicyPack ApplyChange(PolicyPack pack, PolicyChange change, ICollection<string> summaries) => change.RuleId switch
    {
        "contribution.rate.total" => ApplyContributionRate(pack, change, summaries),
        "standardIncome.limits" => ApplyIncomeLimits(pack, change, summaries),
        "voluntaryContinuation.standardIncomeChoices" => ApplyVoluntaryContinuationIncome(pack, change, summaries),
        "oldAge.normalClaimAge" => ApplyClaimAge(pack, change, summaries),
        "earlyPension.maximumMonths" => ApplyEarlyMaximum(pack, change, summaries),
        "earlyPension.reductionPerMonth" => ApplyEarlyRate(pack, change, summaries),
        "deferredPension.maximumMonths" => ApplyDeferredMaximum(pack, change, summaries),
        "deferredPension.bonusPerMonth" => ApplyDeferredRate(pack, change, summaries),
        "qualification.minimumContributionMonths" => ApplyMinimumContribution(pack, change, summaries),
        "backPayment.maximumMonths" => ApplyBackPaymentMaximum(pack, change, summaries),
        "duplicateBenefit.survivorAdditionalRate" => ApplyDuplicateRate(pack, change, summaries),
        "survivorBenefit.oldAgeBaseRate" => ApplySurvivorOldAgeBaseRate(pack, change, summaries),
        "survivorBenefit.oldAgeAdditionalRatePerMonth" => ApplySurvivorOldAgeAdditionalRate(pack, change, summaries),
        "survivorBenefit.pensionRateTiers" => ApplySurvivorRateTiers(pack, change, summaries),
        "survivorBenefit.capAtDeceasedOldAgePension" => ApplySurvivorCap(pack, change, summaries),
        "pensionIncomeTax.estimation" => ApplyPensionIncomeTax(pack, change, summaries),
        _ => throw new InvalidOperationException($"지원하지 않는 ruleId입니다: {change.RuleId}")
    };

    private static PolicyPack ApplyContributionRate(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        EnsureTimelineChange(change, ApplicationClock.ContributionMonth);
        var value = DeserializeValue<ContributionRateValue>(change);
        var newRule = new ContributionRateRule(
            change.RuleId,
            change.ValidFrom!.Value,
            change.ValidToExclusive,
            change.ApplicationClock!.Value,
            value.TotalRate,
            value.WorkplaceEmployeeShare,
            value.WorkplaceEmployerShare,
            change.LegalSourceIds);
        var rules = ReplacePeriod(pack.ContributionRates, newRule, r => r.ValidFrom, r => r.ValidToExclusive,
            (r, from, to) => r with { ValidFrom = from, ValidToExclusive = to });
        summaries.Add($"보험료율 {newRule.ValidFrom:yyyy-MM-dd}부터 {value.TotalRate.DecimalValue:P2}");
        return pack with { ContributionRates = rules };
    }

    private static PolicyPack ApplyIncomeLimits(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        EnsureTimelineChange(change, ApplicationClock.ContributionMonth);
        var value = DeserializeValue<StandardIncomeLimitValue>(change);
        var newRule = new StandardIncomeLimitRule(
            change.RuleId,
            change.ValidFrom!.Value,
            change.ValidToExclusive,
            change.ApplicationClock!.Value,
            value.MinimumKrw,
            value.MaximumKrw,
            change.LegalSourceIds);
        var rules = ReplacePeriod(pack.StandardIncomeLimits, newRule, r => r.ValidFrom, r => r.ValidToExclusive,
            (r, from, to) => r with { ValidFrom = from, ValidToExclusive = to });
        summaries.Add($"기준소득월액 {newRule.ValidFrom:yyyy-MM-dd}부터 {value.MinimumKrw:N0}~{value.MaximumKrw:N0}원");
        return pack with { StandardIncomeLimits = rules };
    }

    private static PolicyPack ApplyVoluntaryContinuationIncome(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        EnsureTimelineChange(change, ApplicationClock.ContributionMonth);
        var value = DeserializeValue<VoluntaryContinuationIncomeValue>(change);
        var newRule = new VoluntaryContinuationIncomeRule(
            change.RuleId,
            change.ValidFrom!.Value,
            change.ValidToExclusive,
            change.ApplicationClock!.Value,
            value.DefaultStandardMonthlyIncomeKrw,
            value.SuggestedStandardMonthlyIncomesKrw,
            change.LegalSourceIds);
        var rules = ReplacePeriod(pack.VoluntaryContinuationIncomes ?? [], newRule, r => r.ValidFrom, r => r.ValidToExclusive,
            (r, from, to) => r with { ValidFrom = from, ValidToExclusive = to });
        summaries.Add($"임의계속가입 기본 기준소득월액 {newRule.ValidFrom:yyyy-MM-dd}부터 {value.DefaultStandardMonthlyIncomeKrw:N0}원");
        return pack with { VoluntaryContinuationIncomes = rules };
    }

    private static PolicyPack ApplyClaimAge(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<ClaimAgeValue>(change);
        var newRule = new ClaimAgeRule(value.BirthYearFrom, value.BirthYearToExclusive, value.NormalClaimAgeMonths, change.LegalSourceIds);
        var remaining = pack.NormalClaimAges.Where(rule =>
            (rule.BirthYearToExclusive ?? int.MaxValue) <= value.BirthYearFrom ||
            (value.BirthYearToExclusive ?? int.MaxValue) <= rule.BirthYearFrom).ToList();
        remaining.Add(newRule);
        summaries.Add($"{value.BirthYearFrom}년생부터 정상 수급연령 {value.NormalClaimAgeMonths / 12}세");
        return pack with { NormalClaimAges = remaining.OrderBy(rule => rule.BirthYearFrom).ToArray() };
    }

    private static PolicyPack ApplyEarlyMaximum(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<IntegerValue>(change).Value;
        summaries.Add($"최대 조기수령 {value}개월");
        return pack with { PensionAdjustment = pack.PensionAdjustment with { MaximumEarlyMonths = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplyEarlyRate(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<RationalValue>(change).Value;
        summaries.Add($"월 조기 감액률 {value.DecimalValue:P2}");
        return pack with { PensionAdjustment = pack.PensionAdjustment with { EarlyReductionPerMonth = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplyDeferredMaximum(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<IntegerValue>(change).Value;
        summaries.Add($"최대 연기수령 {value}개월");
        return pack with { PensionAdjustment = pack.PensionAdjustment with { MaximumDeferredMonths = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplyDeferredRate(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<RationalValue>(change).Value;
        summaries.Add($"월 연기 가산률 {value.DecimalValue:P2}");
        return pack with { PensionAdjustment = pack.PensionAdjustment with { DeferredBonusPerMonth = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplyMinimumContribution(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<IntegerValue>(change).Value;
        summaries.Add($"최소 가입기간 {value}개월");
        return pack with { Qualification = pack.Qualification with { MinimumContributionMonths = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplyBackPaymentMaximum(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<IntegerValue>(change).Value;
        summaries.Add($"최대 추납기간 {value}개월");
        return pack with { Qualification = pack.Qualification with { MaximumBackPaymentMonths = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplyDuplicateRate(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<RationalValue>(change).Value;
        summaries.Add($"선택하지 않은 유족연금 추가 지급률 {value.DecimalValue:P0}");
        return pack with { DuplicateBenefit = pack.DuplicateBenefit with { UnselectedSurvivorPensionAdditionalRate = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static SurvivorBenefitPolicy CurrentSurvivorPolicy(PolicyPack pack) =>
        pack.SurvivorBenefit ?? PolicyResolver.LegacySurvivorBenefitPolicy;

    private static PolicyPack ApplySurvivorOldAgeBaseRate(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<RationalValue>(change).Value;
        summaries.Add($"노령연금 최소가입 지급률 {value.DecimalValue:P2}");
        return pack with { SurvivorBenefit = CurrentSurvivorPolicy(pack) with { OldAgePensionRateAtMinimumContribution = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplySurvivorOldAgeAdditionalRate(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<RationalValue>(change).Value;
        summaries.Add($"노령연금 가입 1개월당 가산 지급률 {value.DecimalValue:P4}");
        return pack with { SurvivorBenefit = CurrentSurvivorPolicy(pack) with { OldAgePensionAdditionalRatePerMonth = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplySurvivorRateTiers(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<SurvivorPensionRateTiersValue>(change);
        summaries.Add($"유족연금 가입기간별 지급률 {value.Rates.Count}개 구간");
        return pack with { SurvivorBenefit = CurrentSurvivorPolicy(pack) with { PensionRates = value.Rates, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplySurvivorCap(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<BooleanValue>(change).Value;
        summaries.Add($"노령연금 수급자 사망 시 유족연금 상한 {(value ? "적용" : "미적용")}");
        return pack with { SurvivorBenefit = CurrentSurvivorPolicy(pack) with { CapAtDeceasedOldAgePension = value, LegalSourceIds = change.LegalSourceIds } };
    }

    private static PolicyPack ApplyPensionIncomeTax(PolicyPack pack, PolicyChange change, ICollection<string> summaries)
    {
        var value = DeserializeValue<PensionIncomeTaxPolicy>(change) with { LegalSourceIds = change.LegalSourceIds };
        summaries.Add("세후 월 예상연금 추정 규칙 변경");
        return pack with { PensionIncomeTax = value };
    }

    private static T DeserializeValue<T>(PolicyChange change) =>
        change.Value.Deserialize<T>(PolicyJson.Options)
        ?? throw new JsonException($"{change.RuleId}의 value가 비어 있습니다.");

    private static void EnsureTimelineChange(PolicyChange change, ApplicationClock expectedClock)
    {
        if (change.ValidFrom is null) throw new InvalidOperationException($"{change.RuleId}: validFrom이 필요합니다.");
        if (change.ValidToExclusive is not null && change.ValidToExclusive <= change.ValidFrom)
            throw new InvalidOperationException($"{change.RuleId}: 종료일은 시작일보다 뒤여야 합니다.");
        if (change.ApplicationClock != expectedClock)
            throw new InvalidOperationException($"{change.RuleId}: applicationClock은 {expectedClock}이어야 합니다.");
    }

    private static IReadOnlyList<T> ReplacePeriod<T>(
        IReadOnlyList<T> existing,
        T replacement,
        Func<T, DateOnly> from,
        Func<T, DateOnly?> to,
        Func<T, DateOnly, DateOnly?, T> copyRange)
    {
        var newFrom = from(replacement);
        var newTo = to(replacement);
        var result = new List<T>();

        foreach (var item in existing)
        {
            var itemFrom = from(item);
            var itemTo = to(item);
            var overlaps = itemFrom < (newTo ?? DateOnly.MaxValue) && newFrom < (itemTo ?? DateOnly.MaxValue);
            if (!overlaps)
            {
                result.Add(item);
                continue;
            }

            if (itemFrom < newFrom) result.Add(copyRange(item, itemFrom, newFrom));
            if (newTo is not null && (itemTo is null || itemTo > newTo)) result.Add(copyRange(item, newTo.Value, itemTo));
        }

        result.Add(replacement);
        return result.OrderBy(from).ToArray();
    }
}
