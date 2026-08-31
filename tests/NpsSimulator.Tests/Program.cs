using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Text.Json;
using NpsSimulator.Application;
using NpsSimulator.Domain;
using NpsSimulator.Policy;
using NpsSimulator.Simulation;
using NpsSimulator.Storage;

var tests = new (string Name, Func<Task> Run)[]
{
    ("정책 JSON 로드와 의미 검증", PolicyLoadsAndValidates),
    ("보험료율 효력기간 경계", ContributionRateBoundaries),
    ("기준소득월액 7월 경계", StandardIncomeBoundary),
    ("조기·연기 Golden Test", EarlyAndDeferredGoldenTest),
    ("출생연도별 정상 수급연령", ClaimAgeCohorts),
    ("생일 다음 달 정상 수급 시작", PensionStartsMonthAfterBirthday),
    ("60세 예상 가입개월 자동 계산", ExpectedContributionMonthsProjection),
    ("NPS 가입기간 공백 후보 계산", NpsStatementGapCandidate),
    ("NPS 표시문구 자동 인식", NpsStatementTextParsing),
    ("추납개월 공단 확인 필수", BackPaymentConfirmationRequired),
    ("NPS 수급 시작월 앵커 적용", NpsClaimMonthAnchor),
    ("월별 부부 시뮬레이션", MonthlyHouseholdSimulation),
    ("사망 후 유족연금 중복조정", SurvivorBenefitAfterDeath),
    ("미입력 유족연금 자동 추정", SurvivorBenefitAutoEstimate),
    ("부부 사망 순서별 유족연금 월 합산", SurvivorPensionScenarioAnalysis),
    ("장기가입 유족연금 전액·중복조정 계산", LongContributionSurvivorBenefit),
    ("외벌이 배우자 국민연금 미가입", NonParticipatingSpouse),
    ("배우자 없는 1인 계산", SinglePersonWithoutSpouse),
    ("세전 연금에서 세후 추정", PensionTaxEstimate),
    ("전략 손익분기 비교", BreakEvenComparison),
    ("직접 입력 전략 부부 합산 보고서", SelectedStrategyAnalysis),
    ("조기·정상·연기·임의계속 자동 종합 분석", AutomaticStrategyAnalysis),
    ("AI 정책 업데이트 적용", PolicyUpdateApplies),
    ("임의계속가입 기준소득 선택표 정책 업데이트", VoluntaryContinuationIncomeUpdateApplies),
    ("알 수 없는 AI 규칙 차단", UnknownPolicyRuleRejected),
    ("AI 업데이트 키트 개인정보 배제", AiKitContainsNoProfileData),
    ("암호화 프로필 저장·복원", EncryptedProfileRoundTrip),
    ("정책 활성화와 롤백", PolicyStoreRollback),
    ("새 내장 정책 자동 전환", BuiltInPolicyAutoUpgrade)
};

var failures = new List<string>();
foreach (var test in tests)
{
    try
    {
        await test.Run();
        Console.WriteLine($"PASS  {test.Name}");
    }
    catch (Exception exception)
    {
        failures.Add($"{test.Name}: {exception.Message}");
        Console.WriteLine($"FAIL  {test.Name}");
        Console.WriteLine($"      {exception}");
    }
}

Console.WriteLine();
Console.WriteLine($"RESULT  {tests.Length - failures.Count}/{tests.Length} passed");
if (failures.Count > 0)
{
    Environment.ExitCode = 1;
}

return;

static Task PolicyLoadsAndValidates()
{
    var policy = LoadPolicy();
    var result = new PolicyValidator().Validate(policy);
    Assert.True(result.IsValid, string.Join(" | ", result.Errors.Select(error => error.Message)));
    Assert.Equal(1_013_000L, new PolicyResolver(policy).ResolveVoluntaryContinuationIncome(new(2026, 8, 1)).DefaultStandardMonthlyIncomeKrw);
    Assert.Equal(1m, new PolicyResolver(policy).ResolveOldAgePensionRate(418));
    return Task.CompletedTask;
}

static Task ContributionRateBoundaries()
{
    var resolver = new PolicyResolver(LoadPolicy());
    Assert.Equal(0.09m, resolver.ResolveContributionRate(new(2025, 12, 1)).TotalRate.DecimalValue);
    Assert.Equal(0.095m, resolver.ResolveContributionRate(new(2026, 1, 1)).TotalRate.DecimalValue);
    Assert.Equal(0.125m, resolver.ResolveContributionRate(new(2032, 12, 1)).TotalRate.DecimalValue);
    Assert.Equal(0.13m, resolver.ResolveContributionRate(new(2033, 1, 1)).TotalRate.DecimalValue);
    return Task.CompletedTask;
}

static Task StandardIncomeBoundary()
{
    var resolver = new PolicyResolver(LoadPolicy());
    var june = resolver.ResolveStandardIncomeLimits(new(2026, 6, 1));
    var july = resolver.ResolveStandardIncomeLimits(new(2026, 7, 1));
    Assert.Equal(400_000L, june.MinimumKrw);
    Assert.Equal(6_370_000L, june.MaximumKrw);
    Assert.Equal(410_000L, july.MinimumKrw);
    Assert.Equal(6_590_000L, july.MaximumKrw);
    return Task.CompletedTask;
}

static Task EarlyAndDeferredGoldenTest()
{
    var resolver = new PolicyResolver(LoadPolicy());
    Assert.Equal(0.70m, resolver.ResolveClaimAdjustmentFactor(-60));
    Assert.Equal(1.00m, resolver.ResolveClaimAdjustmentFactor(0));
    Assert.Equal(1.36m, resolver.ResolveClaimAdjustmentFactor(60));
    Assert.Equal(700_000m, 1_000_000m * resolver.ResolveClaimAdjustmentFactor(-60));
    Assert.Equal(1_360_000m, 1_000_000m * resolver.ResolveClaimAdjustmentFactor(60));
    return Task.CompletedTask;
}

static Task ClaimAgeCohorts()
{
    var resolver = new PolicyResolver(LoadPolicy());
    Assert.Equal(720, resolver.ResolveNormalClaimAgeMonths(new(1952, 12, 31)));
    Assert.Equal(732, resolver.ResolveNormalClaimAgeMonths(new(1953, 1, 1)));
    Assert.Equal(768, resolver.ResolveNormalClaimAgeMonths(new(1968, 12, 31)));
    Assert.Equal(780, resolver.ResolveNormalClaimAgeMonths(new(1969, 1, 1)));
    return Task.CompletedTask;
}

static Task PensionStartsMonthAfterBirthday()
{
    var resolver = new PolicyResolver(LoadPolicy());
    var birthDate = new DateOnly(1975, 2, 15);
    Assert.Equal(new YearMonth(2040, 3), DomainDate.PensionStartMonth(birthDate, resolver.ResolveNormalClaimAgeMonths(birthDate)));
    return Task.CompletedTask;
}

static Task ExpectedContributionMonthsProjection()
{
    Assert.Equal(401, ContributionProjection.EstimateAtAge60(new(1970, 1, 15), 360, new(2026, 8, 29)));
    Assert.Equal(360, ContributionProjection.EstimateAtAge60(new(1960, 1, 15), 360, new(2026, 8, 29)));
    return Task.CompletedTask;
}

static Task NpsStatementGapCandidate()
{
    Assert.Equal(13, ContributionProjection.CalculateUncreditedGapCandidate(new(1999, 4, 1), new(2035, 2, 1), 418));
    return Task.CompletedTask;
}

static Task NpsStatementTextParsing()
{
    var period = NpsStatementTextParser.ParseContributionPeriod("1999년 04월~2035년 02월  총 418개월", "가입기간");
    Assert.Equal(new DateOnly(1999, 4, 1), period.StartMonth);
    Assert.Equal(new DateOnly(2035, 2, 1), period.EndMonth);
    Assert.Equal(418, period.TotalContributionMonths);
    var claim = NpsStatementTextParser.ParseClaimStart("2040년 3월(65세)부터", "수급시기");
    Assert.Equal(new DateOnly(2040, 3, 1), claim.ClaimStartMonth);
    Assert.Equal(65, claim.ClaimAgeYears);
    Assert.True(NpsStatementTextParser.TryParseContributionPeriod("1999-04 ~ 2035-02 총418개월", out _));
    return Task.CompletedTask;
}

static Task BackPaymentConfirmationRequired()
{
    var strategy = new PersonStrategy(13, 60, 0, 0, 90);
    Assert.True(strategy.Validate("본인").Any(error => error.Contains("공단에서 확인", StringComparison.Ordinal)));
    Assert.True((strategy with { BackPaymentMonthsConfirmed = true }).Validate("본인").Count == 0);
    return Task.CompletedTask;
}

static Task NpsClaimMonthAnchor()
{
    var (household, comparison, assumptions) = SampleScenario();
    var statement = new NpsStatementAnchor(
        new(2040, 3, 1), null, null, 180_890_000,
        new(1999, 4, 1), new(2035, 2, 1), true);
    household = household with
    {
        PersonA = household.PersonA with
        {
            CurrentContributionMonths = null,
            ExpectedContributionMonthsAt60 = 418,
            CurrentMonthlyPremiumKrw = decimal.Round(180_890_000m / 418m, 0),
            NpsStatement = statement
        }
    };
    var result = new SimulationApplicationService().RunComparison(LoadPolicy(), household, comparison, assumptions);
    Assert.Equal(new YearMonth(2040, 3), result.Baseline.PersonA.NormalClaimMonth);
    Assert.True(result.Baseline.Warnings.Any(warning => warning.Contains("월평균", StringComparison.Ordinal)));
    return Task.CompletedTask;
}

static Task MonthlyHouseholdSimulation()
{
    var (household, comparison, assumptions) = SampleScenario();
    var result = new SimulationApplicationService().RunComparison(LoadPolicy(), household, comparison, assumptions);
    Assert.True(result.Alternative.Ledger.Count > 400, "월별 원장이 충분한 기간을 포함해야 합니다.");
    Assert.True(result.Alternative.PersonA.EstimatedMonthlyPensionKrw > result.Baseline.PersonA.EstimatedMonthlyPensionKrw);
    Assert.True(result.Alternative.PersonA.TotalBackPaymentKrw > 0);
    Assert.Equal("KR-NPS-2026.08.4", result.Alternative.PolicyPackId);
    Assert.True(result.Alternative.Warnings.Any(warning => warning.Contains("Anchor Mode", StringComparison.Ordinal)));
    return Task.CompletedTask;
}

static Task SurvivorBenefitAfterDeath()
{
    var (household, comparison, assumptions) = SampleScenario();
    var earlyDeath = comparison with { PersonB = comparison.PersonB with { DeathAgeYears = 75 } };
    var result = new SimulationApplicationService().RunComparison(LoadPolicy(), household, earlyDeath, assumptions);
    var afterDeath = DomainDate.AgeMonth(household.PersonB.BirthDate, 75 * 12).AddMonths(1);
    var row = result.Alternative.Ledger.Single(item => item.Month == afterDeath);
    Assert.Equal(0m, row.PensionB);
    Assert.True(row.SurvivorPensionA > 0, "생존 배우자의 유족연금 추가분이 필요합니다.");
    return Task.CompletedTask;
}

static Task SurvivorBenefitAutoEstimate()
{
    var (household, comparison, assumptions) = SampleScenario();
    household = household with
    {
        PersonA = household.PersonA with { ExpectedSurvivorPensionFromSpouseKrw = null },
        PersonB = household.PersonB with { ExpectedSurvivorPensionFromSpouseKrw = null }
    };
    var earlyDeath = comparison with { PersonB = comparison.PersonB with { DeathAgeYears = 75 } };
    var result = new SimulationApplicationService().RunComparison(LoadPolicy(), household, earlyDeath, assumptions);
    var afterDeath = DomainDate.AgeMonth(household.PersonB.BirthDate, 75 * 12).AddMonths(1);
    var row = result.Alternative.Ledger.Single(item => item.Month == afterDeath);
    Assert.True(row.SurvivorPensionA > 0, "유족연금 직접 입력이 없어도 추정액이 계산되어야 합니다.");
    Assert.True(result.Alternative.Warnings.Any(warning => warning.Contains("자동 추정", StringComparison.Ordinal)));
    return Task.CompletedTask;
}

static Task NonParticipatingSpouse()
{
    var (household, comparison, assumptions) = SampleScenario();
    household = household with
    {
        PersonB = household.PersonB with
        {
            CurrentContributionMonths = null,
            ExpectedContributionMonthsAt60 = 0,
            CurrentMonthlyPremiumKrw = 0,
            AnchoredMonthlyPensionKrw = 0,
            ExpectedSurvivorPensionFromSpouseKrw = null,
            NpsStatement = null,
            HasNationalPension = false
        }
    };
    comparison = comparison with
    {
        PersonA = comparison.PersonA with { DeathAgeYears = 75 },
        PersonB = new(0, 60, 0, 0, 95)
    };
    var result = new SimulationApplicationService().RunComparison(LoadPolicy(), household, comparison, assumptions);
    Assert.Equal(0m, result.Alternative.PersonB.EstimatedMonthlyPensionKrw);
    var afterDeath = DomainDate.AgeMonth(household.PersonA.BirthDate, 75 * 12).AddMonths(1);
    var row = result.Alternative.Ledger.Single(item => item.Month == afterDeath);
    Assert.True(row.SurvivorPensionB > 0, "국민연금 미가입 배우자도 유족연금 추정이 필요합니다.");
    return Task.CompletedTask;
}

static Task SinglePersonWithoutSpouse()
{
    var (household, comparison, assumptions) = SampleScenario();
    household = household with
    {
        PersonB = new("배우자 없음", DateOnly.MinValue, null, 0, 0, 0, null, null, false, false)
    };
    comparison = comparison with { PersonB = new(0, 60, 0, 0, 120) };
    var result = new SimulationApplicationService().RunComparison(LoadPolicy(), household, comparison, assumptions);
    Assert.False(result.Alternative.PersonB.IsIncluded);
    Assert.Equal(0m, result.Alternative.PersonB.EstimatedMonthlyPensionKrw);
    Assert.True(result.Alternative.Ledger.All(row => row.PensionB == 0 && row.SurvivorPensionB == 0));
    Assert.True(result.Alternative.Ledger.All(row => row.AgeMonthsB == -1));
    return Task.CompletedTask;
}

static Task PensionTaxEstimate()
{
    var estimate = PensionTaxEstimator.EstimateMonthly(LoadPolicy(), 1_850_000m);
    Assert.True(estimate is not null);
    Assert.True(estimate!.EstimatedNetMonthlyKrw < estimate.GrossMonthlyKrw);
    Assert.True(estimate.EstimatedNetMonthlyKrw > 1_750_000m);
    return Task.CompletedTask;
}

static Task SurvivorPensionScenarioAnalysis()
{
    var (household, _, _) = SampleScenario();
    var service = new SurvivorPensionAnalysisService();
    var aFirst = service.Run(LoadPolicy(), household, 80, 90, new(2026, 8, 1));
    Assert.True(aFirst.FirstDeathSummary.Contains(household.PersonA.Alias, StringComparison.Ordinal));
    Assert.Equal(household.PersonA.AnchoredMonthlyPensionKrw + household.PersonB.AnchoredMonthlyPensionKrw, aFirst.BothAliveCombinedMonthlyKrw);
    Assert.True(aFirst.MonthlyImmediatelyAfterFirstDeathKrw > 0);
    Assert.Equal(Math.Max(aFirst.KeepOwnPlusThirtyPercentKrw, aFirst.ChooseFullSurvivorKrw), aFirst.SelectedMonthlyAfterDuplicationKrw);
    Assert.True(aFirst.Phases.Any(phase => phase.Status.Contains("사망 후", StringComparison.Ordinal)));
    Assert.True(aFirst.AnnualTimeline.Any(year => year.Status.Contains("사망 후", StringComparison.Ordinal)));
    Assert.True(aFirst.AnnualTimeline.All(year => year.CombinedMonthlyPensionKrw
        == year.OwnPensionA + year.SurvivorAdditionA + year.OwnPensionB + year.SurvivorAdditionB));
    Assert.True(aFirst.TotalReceiptAfterFirstDeathKrw > 0);

    var bFirst = service.Run(LoadPolicy(), household, 90, 80, new(2026, 8, 1));
    Assert.True(bFirst.FirstDeathSummary.Contains(household.PersonB.Alias, StringComparison.Ordinal));
    Assert.True(bFirst.MonthlyImmediatelyAfterFirstDeathKrw > 0);
    return Task.CompletedTask;
}

static Task LongContributionSurvivorBenefit()
{
    var household = new HouseholdProfile(
        new("본인", new(1975, 2, 22), null, 418, 400_000, 1_854_240, null),
        new("배우자", new(1979, 6, 10), null, 360, 250_000, 1_171_368, null));
    var report = new SurvivorPensionAnalysisService().Run(LoadPolicy(), household, 85, 95, new(2026, 8, 29));

    Assert.Equal(1_112_544m, report.SurvivorPensionBeforeDuplicationKrw);
    Assert.Equal(1_505_131m, report.KeepOwnPlusThirtyPercentKrw);
    Assert.Equal(1_112_544m, report.ChooseFullSurvivorKrw);
    Assert.Equal(1_505_131m, report.SelectedMonthlyAfterDuplicationKrw);
    Assert.True(report.SelectedBenefitDescription.Contains("본인 노령연금 + 유족연금", StringComparison.Ordinal));
    return Task.CompletedTask;
}

static Task BreakEvenComparison()
{
    var (household, comparison, assumptions) = SampleScenario();
    var result = new SimulationApplicationService().RunComparison(LoadPolicy(), household, comparison, assumptions);
    Assert.True(result.Crossovers.Count > 0, "비교전략이 기준전략을 추월해야 합니다.");
    Assert.True(result.PermanentAdvantageStarts is not null, "영구 우위 시점을 찾아야 합니다.");
    Assert.True(result.DifferenceAtBothAge90 > 0, "90세 기준 비교전략이 우위여야 합니다.");
    return Task.CompletedTask;
}

static Task SelectedStrategyAnalysis()
{
    var (household, _, assumptions) = SampleScenario();
    var selected = new HouseholdStrategy(
        "사용자 선택 전략",
        new(0, 63, 150_000, 24, 100),
        new(0, 62, 100_000, 12, 100));
    var report = new SelectedStrategyAnalysisService().Run(
        LoadPolicy(), household, selected, assumptions with { SimulationEndAgeYears = 100 });

    Assert.Equal(2, report.People.Count);
    Assert.Equal(3, report.People.Single(person => person.Alias == "본인").ContinuationYears);
    Assert.Equal(150_000m, report.People.Single(person => person.Alias == "본인").ContinuationMonthlyPremiumKrw);
    Assert.True(report.TotalAdditionalContributionKrw > 0);
    Assert.True(report.SelectedCombinedMonthlyPensionKrw > report.BaselineCombinedMonthlyPensionKrw);
    Assert.True(report.AnnualTimeline.Count > 0);
    Assert.Equal(0m, report.AnnualTimeline[0].MonthlyPensionB);
    Assert.True(report.AnnualTimeline.All(year => year.CombinedMonthlyPensionKrw == year.MonthlyPensionA + year.MonthlyPensionB));

    var early = selected with
    {
        PersonA = new(0, 60, 0, -60, 100),
        PersonB = new(0, 60, 0, 0, 100)
    };
    var earlyReport = new SelectedStrategyAnalysisService().Run(
        LoadPolicy(), household, early, assumptions with { SimulationEndAgeYears = 100 });
    var earlyPersonA = earlyReport.People.Single(person => person.Alias == "본인");
    Assert.Equal(-5, earlyPersonA.ClaimOffsetYears);
    Assert.True(earlyPersonA.SelectedClaimMonth < earlyPersonA.BaselineClaimMonth);
    Assert.True(earlyPersonA.SelectedMonthlyPensionKrw < earlyPersonA.BaselineMonthlyPensionKrw);

    var baselineSurvivor = new SurvivorPensionAnalysisService().Run(LoadPolicy(), household, 80, 90, new(2026, 8, 1));
    var selectedSurvivor = new SurvivorPensionAnalysisService().Run(LoadPolicy(), household, 80, 90, new(2026, 8, 1), selected);
    Assert.True(selectedSurvivor.BothAliveCombinedMonthlyKrw > baselineSurvivor.BothAliveCombinedMonthlyKrw,
        "유족연금 보고서의 부부 생존 월 합산에도 같은 선택 전략이 적용되어야 합니다.");
    return Task.CompletedTask;
}

static Task AutomaticStrategyAnalysis()
{
    var (sample, _, assumptions) = SampleScenario();
    var household = sample with
    {
        PersonB = new("배우자 없음", DateOnly.MinValue, null, 0, 0, 0, null, null, false, false)
    };
    const decimal selectedIncome = 2_000_000m;
    var report = new AutomaticStrategyAnalysisService().Run(LoadPolicy(), household, assumptions with { SimulationEndAgeYears = 100 }, selectedIncome);

    Assert.Equal(5, report.Rows.Count);
    Assert.True(report.Rows.Any(row => row.StrategyName == "5년 조기수령" && row.AdvantageWindow.Contains("전까지 이득", StringComparison.Ordinal)));
    Assert.True(report.Rows.Any(row => row.StrategyName == "정상수령" && row.DifferenceAt95Krw == 0));
    Assert.True(report.Rows.Any(row => row.StrategyName.Contains("임의계속가입", StringComparison.Ordinal)
                                       && row.ContinuationStandardMonthlyIncomeKrw == selectedIncome
                                       && row.ContinuationFinalMonthlyPremiumKrw >= row.ContinuationMonthlyPremiumKrw
                                       && row.AdditionalContributionKrw > 0));
    Assert.Equal(5, report.BestStrategySummaries.Count);
    Assert.True(report.Rows.Any(row => !string.IsNullOrWhiteSpace(row.RecommendedForAges)));
    var higherIncomeReport = new AutomaticStrategyAnalysisService().Run(LoadPolicy(), household, assumptions with { SimulationEndAgeYears = 100 }, 3_000_000m);
    var continuedAtSelectedIncome = report.Rows.Single(row => row.StrategyName == "65세까지 임의계속가입 후 수령");
    var continuedAtHigherIncome = higherIncomeReport.Rows.Single(row => row.StrategyName == "65세까지 임의계속가입 후 수령");
    Assert.True(continuedAtHigherIncome.AdditionalContributionKrw > continuedAtSelectedIncome.AdditionalContributionKrw);
    Assert.True(continuedAtHigherIncome.MonthlyPensionGrossKrw > continuedAtSelectedIncome.MonthlyPensionGrossKrw);
    return Task.CompletedTask;
}

static Task PolicyUpdateApplies()
{
    var basePack = LoadPolicy();
    var service = new PolicyUpdateService(new());
    var update = service.DeserializeUpdate(CreateIncomeLimitUpdateJson(basePack.PolicyPackId, "KR-NPS-USER-TEST-1"));
    var result = service.Apply(basePack, update);
    Assert.True(result.IsValid, string.Join(" | ", result.Issues.Select(issue => issue.Message)));
    var resolver = new PolicyResolver(result.UpdatedPack!);
    Assert.Equal(410_000L, resolver.ResolveStandardIncomeLimits(new(2026, 12, 1)).MinimumKrw);
    Assert.Equal(420_000L, resolver.ResolveStandardIncomeLimits(new(2027, 7, 1)).MinimumKrw);
    return Task.CompletedTask;
}

static Task VoluntaryContinuationIncomeUpdateApplies()
{
    var basePack = LoadPolicy();
    using var valueDocument = JsonDocument.Parse("{\"defaultStandardMonthlyIncomeKrw\":1020000,\"suggestedStandardMonthlyIncomesKrw\":[1020000,2000000,3000000]}");
    var source = new LegalSource(
        "NPS-VOLUNTARY-TEST-2027", "국민연금공단", "테스트 임의계속 기준소득",
        "https://www.nps.or.kr/test", new(2027, 3, 1), new(2027, 4, 1), null);
    var update = new PolicyUpdateDocument(
        "1.0.0", "KR-NPS-USER-VOLUNTARY-TEST", basePack.PolicyPackId, DateTimeOffset.Now, "AI_ASSISTED", PolicyLegalStatus.Enacted,
        [new("ADD_RULE_VERSION", "voluntaryContinuation.standardIncomeChoices", new(2027, 4, 1), null, ApplicationClock.ContributionMonth, valueDocument.RootElement.Clone(), [source.Id])],
        [source], [], []);
    var result = new PolicyUpdateService(new()).Apply(basePack, update);
    Assert.True(result.IsValid, string.Join(" | ", result.Issues.Select(issue => issue.Message)));
    var rule = new PolicyResolver(result.UpdatedPack!).ResolveVoluntaryContinuationIncome(new(2027, 5, 1));
    Assert.Equal(1_020_000L, rule.DefaultStandardMonthlyIncomeKrw);
    return Task.CompletedTask;
}

static Task UnknownPolicyRuleRejected()
{
    var basePack = LoadPolicy();
    using var valueDocument = JsonDocument.Parse("{\"value\":1}");
    var update = new PolicyUpdateDocument(
        "1.0.0", "KR-NPS-USER-BAD", basePack.PolicyPackId, DateTimeOffset.Now, "AI_ASSISTED", PolicyLegalStatus.Enacted,
        [new("ADD_RULE_VERSION", "unknown.rule", null, null, null, valueDocument.RootElement.Clone(), [])], [], [], []);
    var result = new PolicyUpdateService(new()).Apply(basePack, update);
    Assert.False(result.IsValid);
    Assert.True(result.Issues.Any(issue => issue.Code == "UNKNOWN_RULE_ID"));
    return Task.CompletedTask;
}

static Task AiKitContainsNoProfileData()
{
    var root = CreateTemporaryDirectory();
    try
    {
        var path = Path.Combine(root, "kit.zip");
        new AiPolicyKitService().ExportUpdateKit(path, LoadPolicy(), "guide");
        using var archive = ZipFile.OpenRead(path);
        var names = archive.Entries.Select(entry => entry.FullName).ToArray();
        Assert.True(names.Contains("policy-update.schema.json", StringComparer.Ordinal));
        Assert.True(names.Contains("current-policy.snapshot.json", StringComparer.Ordinal));
        foreach (var entry in archive.Entries)
        {
            using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
            var content = reader.ReadToEnd();
            Assert.False(content.Contains("\"birthDate\"", StringComparison.OrdinalIgnoreCase));
            Assert.False(content.Contains("\"expectedPension\"", StringComparison.OrdinalIgnoreCase));
        }
    }
    finally
    {
        Directory.Delete(root, true);
    }
    return Task.CompletedTask;
}

static async Task EncryptedProfileRoundTrip()
{
    var root = CreateTemporaryDirectory();
    try
    {
        var (household, strategy, assumptions) = SampleScenario();
        var saved = new SavedProfile(household, strategy, assumptions, DateTimeOffset.Now);
        var path = Path.Combine(root, "profile.npsprofile");
        var store = new EncryptedProfileStore();
        await store.SaveAsync(path, saved, "correct-password");
        var bytes = await File.ReadAllBytesAsync(path);
        Assert.False(Encoding.UTF8.GetString(bytes).Contains("본인", StringComparison.Ordinal));
        var loaded = await store.LoadAsync(path, "correct-password");
        Assert.Equal(saved.Household.PersonA.Alias, loaded.Household.PersonA.Alias);
        await Assert.ThrowsAsync<IOException>(() => store.SaveAsync(path, saved, "correct-password"));
        var single = saved with
        {
            Household = saved.Household with
            {
                PersonB = new("배우자 없음", DateOnly.MinValue, null, 0, 0, 0, null, null, false, false)
            }
        };
        var singlePath = Path.Combine(root, "single-profile.npsprofile");
        await store.SaveAsync(singlePath, single, "correct-password");
        var loadedSingle = await store.LoadAsync(singlePath, "correct-password");
        Assert.False(loadedSingle.Household.PersonB.IsIncluded);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => store.LoadAsync(path, "wrong-password"));
    }
    finally
    {
        Directory.Delete(root, true);
    }
}

static Task PolicyStoreRollback()
{
    var root = CreateTemporaryDirectory();
    try
    {
        var validator = new PolicyValidator();
        var store = new LocalPolicyStore(root, validator);
        var original = store.Initialize(PolicyJson.SerializePack(LoadPolicy()));
        var updateService = new PolicyUpdateService(validator);
        var update = updateService.DeserializeUpdate(CreateIncomeLimitUpdateJson(original.PolicyPackId, "KR-NPS-USER-ROLLBACK"));
        var updated = updateService.Apply(original, update).UpdatedPack!;
        store.InstallAndActivate(updated);
        Assert.Equal(updated.PolicyPackId, store.LoadActive().PolicyPackId);
        Assert.Equal(original.PolicyPackId, store.Rollback().PolicyPackId);
    }
    finally
    {
        Directory.Delete(root, true);
    }
    return Task.CompletedTask;
}

static Task BuiltInPolicyAutoUpgrade()
{
    var root = CreateTemporaryDirectory();
    try
    {
        var validator = new PolicyValidator();
        var current = LoadPolicy();
        var old = current with
        {
            PolicyPackId = "KR-NPS-2026.08.1",
            PublishedAt = current.PublishedAt.AddHours(-1),
            SurvivorBenefit = null
        };
        var store = new LocalPolicyStore(root, validator);
        Assert.Equal(old.PolicyPackId, store.Initialize(PolicyJson.SerializePack(old)).PolicyPackId);
        Assert.Equal(current.PolicyPackId, store.Initialize(PolicyJson.SerializePack(current)).PolicyPackId);
    }
    finally
    {
        Directory.Delete(root, true);
    }
    return Task.CompletedTask;
}

static (HouseholdProfile Household, HouseholdStrategy Strategy, SimulationAssumptions Assumptions) SampleScenario()
{
    var household = new HouseholdProfile(
        new("본인", new(1970, 1, 15), 240, 360, 200_000, 1_200_000, 700_000),
        new("배우자", new(1972, 6, 20), 236, 395, 139_930, 973_000, 900_000));
    var strategy = new HouseholdStrategy(
        "비교전략",
        new(36, 65, 400_000, 24, 90, true),
        new(0, 60, 0, 0, 95));
    return (household, strategy, new(new(2026, 8, 1)));
}

static string CreateIncomeLimitUpdateJson(string baseId, string newId) => $$"""
{
  "schemaVersion": "1.0.0",
  "policyPackId": "{{newId}}",
  "basePolicyPackId": "{{baseId}}",
  "createdAt": "2026-08-29T15:00:00+09:00",
  "createdBy": "AI_ASSISTED",
  "legalStatus": "ENACTED",
  "changes": [
    {
      "operation": "ADD_RULE_VERSION",
      "ruleId": "standardIncome.limits",
      "validFrom": "2027-07-01",
      "validToExclusive": null,
      "applicationClock": "CONTRIBUTION_MONTH",
      "value": { "minimumKrw": 420000, "maximumKrw": 6800000 },
      "legalSourceIds": ["MOHW-TEST-2027"]
    }
  ],
  "legalSources": [
    {
      "id": "MOHW-TEST-2027",
      "publisher": "보건복지부",
      "title": "테스트 정책",
      "url": "https://www.mohw.go.kr/test",
      "publishedDate": "2027-03-01",
      "effectiveDate": "2027-07-01",
      "article": null
    }
  ],
  "unresolvedItems": [],
  "engineUpgradeRequired": []
}
""";

static PolicyPack LoadPolicy()
{
    var assembly = Assembly.GetExecutingAssembly();
    var name = assembly.GetManifestResourceNames().Single(item => item.EndsWith("policy-pack.json", StringComparison.OrdinalIgnoreCase));
    using var stream = assembly.GetManifestResourceStream(name) ?? throw new InvalidOperationException("정책 리소스 없음");
    using var reader = new StreamReader(stream, Encoding.UTF8);
    return PolicyJson.DeserializePack(reader.ReadToEnd());
}

static string CreateTemporaryDirectory()
{
    var path = Path.Combine(Path.GetTempPath(), "nps-simulator-tests", Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(path);
    return path;
}

static class Assert
{
    public static void True(bool condition, string? message = null)
    {
        if (!condition) throw new InvalidOperationException(message ?? "참이어야 합니다.");
    }

    public static void False(bool condition, string? message = null) => True(!condition, message ?? "거짓이어야 합니다.");

    public static void Equal<T>(T expected, T actual)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
            throw new InvalidOperationException($"기대값: {expected}, 실제값: {actual}");
    }

    public static async Task ThrowsAsync<TException>(Func<Task> action) where TException : Exception
    {
        try
        {
            await action();
        }
        catch (TException)
        {
            return;
        }
        throw new InvalidOperationException($"{typeof(TException).Name} 예외가 필요합니다.");
    }
}
