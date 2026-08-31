using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using Microsoft.Win32;
using NpsSimulator.Application;
using NpsSimulator.Domain;
using NpsSimulator.Policy;
using NpsSimulator.Simulation;
using NpsSimulator.Storage;

namespace NpsSimulator.Desktop;

public partial class MainWindow : Window
{
    private readonly SelectedStrategyAnalysisService _selectedStrategyAnalysisService = new();
    private readonly SurvivorPensionAnalysisService _survivorAnalysisService = new();
    private readonly EncryptedProfileStore _profileStore = new();
    private readonly PolicyManagementService _policyService;
    private readonly string _aiGuide;
    private SelectedStrategyReport? _lastAutomaticReport;
    private string? _lastReportHtml;
    private SurvivorPensionReport? _lastSurvivorReport;
    private string? _lastSurvivorReportHtml;
    private int _gapCandidateA;
    private int _gapCandidateB;

    public MainWindow()
    {
        InitializeComponent();
        ConfigureSelectors();
        UpdatePensionParticipationStates();

        var validator = new PolicyValidator();
        var policyRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NpsSimulator",
            "policies");
        _policyService = new(
            new LocalPolicyStore(policyRoot, validator),
            new PolicyUpdateService(validator),
            new AiPolicyKitService());
        var builtInPolicy = ReadEmbeddedText("policy-pack.json");
        _aiGuide = ReadEmbeddedText("AI_POLICY_UPDATE_GUIDE.md");

        try
        {
            _policyService.Initialize(builtInPolicy);
            UpdatePolicyDisplay("내장 정책을 불러왔습니다.");
            UpdateClaimMonthPreviews();
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "정책 초기화 실패", MessageBoxButton.OK, MessageBoxImage.Error);
            StatusText.Text = "정책을 불러오지 못했습니다.";
            MainTabs.IsEnabled = false;
        }
    }

    private void BirthDateInput_Changed(object sender, TextChangedEventArgs e)
    {
        if (sender is TextBox input && input.IsKeyboardFocused && TryReadBirthDate(input.Text, out _)) MoveToNextInput(input);
        if (_policyService is null) return;
        UpdateClaimMonthPreviews();
        UpdateClaimAgeSelectors();
    }

    private void UpdateClaimMonthPreviews()
    {
        UpdateClaimMonthPreview(true, HasPensionAInput.IsChecked == true, BirthDateAInput, ClaimMonthAInfo);
        UpdateClaimMonthPreview(IncludeSpouseBInput.IsChecked == true, HasPensionBInput.IsChecked == true, BirthDateBInput, ClaimMonthBInfo);
    }

    private void UpdateClaimMonthPreview(bool isIncluded, bool hasNationalPension, TextBox birthDate, TextBlock output)
    {
        if (!isIncluded)
        {
            output.Text = "배우자 미포함: B 입력 없이 1인 기준으로 계산";
            return;
        }
        if (!hasNationalPension)
        {
            output.Text = "본인 노령연금 없음 · 생년월일은 유족연금 계산에 사용";
            return;
        }

        if (birthDate is null || !TryReadBirthDate(birthDate.Text, out var date) || output is null)
        {
            if (output is not null) output.Text = "정상 수급 시작월: 생년월일 입력 후 자동 계산";
            return;
        }

        var resolver = new PolicyResolver(_policyService.CurrentPolicy);
        var ageMonths = resolver.ResolveNormalClaimAgeMonths(date);
        var startMonth = DomainDate.PensionStartMonth(date, ageMonths);
        output.Text = $"정상 수급 시작월: {startMonth} ({ageMonths / 12}세 생일의 다음 달)";
    }

    private void PensionParticipation_Changed(object sender, RoutedEventArgs e)
    {
        if (HasPensionAInput is null || HasPensionBInput is null || ContributionStartYearAInput is null || ContributionStartYearBInput is null) return;
        UpdatePensionParticipationStates();
        if (_policyService is not null) UpdateClaimMonthPreviews();
    }

    private void SpouseInclusion_Changed(object sender, RoutedEventArgs e)
    {
        if (IncludeSpouseBInput is null || HasPensionBInput is null || AliasBInput is null) return;
        UpdatePensionParticipationStates();
        if (_policyService is not null) UpdateClaimMonthPreviews();
    }

    private void UpdatePensionParticipationStates()
    {
        SetPensionParticipationState(
            HasPensionAInput.IsChecked == true,
            ContributionStartYearAInput, ContributionStartMonthAInput, ContributionEndYearAInput, ContributionEndMonthAInput,
            ExpectedMonthsAInput, AnchorPensionAInput, TotalContributionAInput, PremiumAInput,
            BackpayAInput, BackpayConfirmedAInput, ContinueAgeAInput, ContinuePremiumAInput, ClaimOffsetAInput, UseGapCandidateAButton);
        var pensionAEnabled = HasPensionAInput.IsChecked == true;
        ContinuationIncomeAInput.IsEnabled = pensionAEnabled;
        CustomContinuationIncomeAInput.IsEnabled = pensionAEnabled;
        SelectedContinueYearsAInput.IsEnabled = pensionAEnabled;
        SelectedMonthlyPremiumAInput.IsEnabled = pensionAEnabled;
        if (ClaimAgeAOptionsPanel is not null) ClaimAgeAOptionsPanel.IsEnabled = pensionAEnabled;
        var includeSpouse = IncludeSpouseBInput.IsChecked == true;
        HasPensionBInput.IsEnabled = includeSpouse;
        AliasBInput.IsEnabled = includeSpouse;
        BirthDateBInput.IsEnabled = includeSpouse;
        SurvivorBInput.IsEnabled = includeSpouse;
        DeathAgeBInput.IsEnabled = includeSpouse;
        SetPensionParticipationState(
            includeSpouse && HasPensionBInput.IsChecked == true,
            ContributionStartYearBInput, ContributionStartMonthBInput, ContributionEndYearBInput, ContributionEndMonthBInput,
            ExpectedMonthsBInput, AnchorPensionBInput, TotalContributionBInput, PremiumBInput,
            BackpayBInput, BackpayConfirmedBInput, ContinueAgeBInput, ContinuePremiumBInput, ClaimOffsetBInput, UseGapCandidateBButton);
        var pensionBEnabled = includeSpouse && HasPensionBInput.IsChecked == true;
        ContinuationIncomeBInput.IsEnabled = pensionBEnabled;
        CustomContinuationIncomeBInput.IsEnabled = pensionBEnabled;
        SelectedContinueYearsBInput.IsEnabled = pensionBEnabled;
        SelectedMonthlyPremiumBInput.IsEnabled = pensionBEnabled;
        if (ClaimAgeBOptionsPanel is not null) ClaimAgeBOptionsPanel.IsEnabled = pensionBEnabled;

        if (HasPensionAInput.IsChecked != true)
        {
            _gapCandidateA = 0;
            SetNoPensionText(GapCandidateAInfo, BackpayCandidateAInfo);
        }
        if (!includeSpouse)
        {
            _gapCandidateB = 0;
            SetNoSpouseText(GapCandidateBInfo, BackpayCandidateBInfo);
        }
        else if (HasPensionBInput.IsChecked != true)
        {
            _gapCandidateB = 0;
            SetNoPensionText(GapCandidateBInfo, BackpayCandidateBInfo);
        }
        UpdateEstimatedNetPensionPreviews();
        UpdateContinuationPremiumPreviews();
        if (_policyService is not null) UpdateClaimAgeSelectors();
    }

    private void UpdateEstimatedNetPensionPreviews()
    {
        if (_policyService is null || EstimatedNetPensionAInfo is null || EstimatedNetPensionBInfo is null) return;
        SetEstimatedNetPensionText(true, HasPensionAInput.IsChecked == true, AnchorPensionAInput, EstimatedNetPensionAInfo);
        SetEstimatedNetPensionText(IncludeSpouseBInput.IsChecked == true, HasPensionBInput.IsChecked == true, AnchorPensionBInput, EstimatedNetPensionBInfo);
    }

    private void SetEstimatedNetPensionText(bool isIncluded, bool hasNationalPension, TextBox grossInput, TextBlock output)
    {
        if (!isIncluded)
        {
            output.Text = "세후 추정: 배우자 미포함";
            return;
        }
        if (!hasNationalPension)
        {
            output.Text = "세후 추정: 본인 노령연금 없음";
            return;
        }
        if (!decimal.TryParse(NormalizeNumber(grossInput.Text), NumberStyles.Number, CultureInfo.InvariantCulture, out var gross))
        {
            output.Text = "세후 추정: 세전액 입력 후 자동 계산";
            return;
        }
        var estimate = PensionTaxEstimator.EstimateMonthly(_policyService.CurrentPolicy, gross);
        output.Text = estimate is null
            ? "세후 추정: 현재 정책 파일에 세금 규칙 없음"
            : $"세후 추정 약 {estimate.EstimatedNetMonthlyKrw:N0}원/월 · {estimate.Assumption} (실제 공단값 우선)";
    }

    private static void SetPensionParticipationState(bool enabled, params UIElement[] controls)
    {
        foreach (var control in controls) control.IsEnabled = enabled;
        if (enabled) return;

        foreach (var textBox in controls.OfType<TextBox>())
        {
            if (textBox.Name.StartsWith("Backpay", StringComparison.Ordinal) || textBox.Name.StartsWith("ContinuePremium", StringComparison.Ordinal))
                textBox.Text = "0";
        }
        foreach (var checkBox in controls.OfType<CheckBox>()) checkBox.IsChecked = false;
        foreach (var comboBox in controls.OfType<ComboBox>())
        {
            if (comboBox.Name.StartsWith("ContinueAge", StringComparison.Ordinal)) comboBox.SelectedItem = 60;
            if (comboBox.Name.StartsWith("ClaimOffset", StringComparison.Ordinal))
                comboBox.SelectedItem = comboBox.Items.Cast<ClaimOption>().SingleOrDefault(option => option.OffsetMonths == 0);
        }
    }

    private static void SetNoPensionText(TextBlock inputInfo, TextBlock strategyInfo)
    {
        const string text = "국민연금 미가입: 가입기간·예상연금·납부액·추납 입력 불필요";
        inputInfo.Text = text;
        strategyInfo.Text = text;
    }

    private static void SetNoSpouseText(TextBlock inputInfo, TextBlock strategyInfo)
    {
        const string text = "배우자 미포함: B의 모든 입력 불필요";
        inputInfo.Text = text;
        strategyInfo.Text = text;
    }

    private void NpsPeriodParts_Changed(object sender, TextChangedEventArgs e)
    {
        if (sender is TextBox input) TryAdvancePeriodInput(input);
        UpdateLivePeriodParts(ContributionStartYearAInput, ContributionStartMonthAInput, ContributionEndYearAInput, ContributionEndMonthAInput, ExpectedMonthsAInput, GapCandidateAInfo, ref _gapCandidateA);
        UpdateLivePeriodParts(ContributionStartYearBInput, ContributionStartMonthBInput, ContributionEndYearBInput, ContributionEndMonthBInput, ExpectedMonthsBInput, GapCandidateBInfo, ref _gapCandidateB);
    }

    private static void TryAdvancePeriodInput(TextBox input)
    {
        if (!input.IsKeyboardFocused) return;
        var requiredLength = input.Name.StartsWith("ContributionStartYear", StringComparison.Ordinal)
                             || input.Name.StartsWith("ContributionEndYear", StringComparison.Ordinal)
            ? 4
            : input.Name.StartsWith("ContributionStartMonth", StringComparison.Ordinal)
              || input.Name.StartsWith("ContributionEndMonth", StringComparison.Ordinal)
                ? 2
                : 0;
        if (requiredLength > 0 && input.Text.Length == requiredLength && input.Text.All(char.IsDigit)) MoveToNextInput(input);
    }

    private static void MoveToNextInput(UIElement input) =>
        input.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));

    private static bool TryReadBirthDate(string text, out DateOnly date)
    {
        date = default;
        var digits = new string(text.Where(char.IsDigit).ToArray());
        return digits.Length == 8
               && DateOnly.TryParseExact(digits, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    private static void UpdateLivePeriodParts(
        TextBox startYearInput,
        TextBox startMonthInput,
        TextBox endYearInput,
        TextBox endMonthInput,
        TextBox monthsInput,
        TextBlock output,
        ref int gapCandidate)
    {
        if (startYearInput is null || startMonthInput is null || endYearInput is null || endMonthInput is null || monthsInput is null || output is null) return;
        if (!TryReadPeriodParts(startYearInput.Text, startMonthInput.Text, endYearInput.Text, endMonthInput.Text, monthsInput.Text, out var period)) return;
        var gap = ContributionProjection.CalculateUncreditedGapCandidate(period!.StartMonth, period.EndMonth, period.TotalContributionMonths);
        gapCandidate = gap;
        output.Text = PeriodRecognitionText(period, gap);
    }

    private static bool TryReadPeriodParts(
        string startYearText,
        string startMonthText,
        string endYearText,
        string endMonthText,
        string monthsText,
        out NpsContributionPeriodInput? period)
    {
        period = null;
        if (!int.TryParse(NormalizeNumber(startYearText), NumberStyles.Integer, CultureInfo.InvariantCulture, out var startYear)
            || !int.TryParse(NormalizeNumber(startMonthText), NumberStyles.Integer, CultureInfo.InvariantCulture, out var startMonth)
            || !int.TryParse(NormalizeNumber(endYearText), NumberStyles.Integer, CultureInfo.InvariantCulture, out var endYear)
            || !int.TryParse(NormalizeNumber(endMonthText), NumberStyles.Integer, CultureInfo.InvariantCulture, out var endMonth)
            || !int.TryParse(NormalizeNumber(monthsText), NumberStyles.Integer, CultureInfo.InvariantCulture, out var months)
            || startYear is < 1900 or > 2200 || endYear is < 1900 or > 2200
            || startMonth is < 1 or > 12 || endMonth is < 1 or > 12 || months <= 0) return false;
        var start = new DateOnly(startYear, startMonth, 1);
        var end = new DateOnly(endYear, endMonth, 1);
        if (end < start) return false;
        var calendarMonths = YearMonth.FromDate(start).MonthsUntil(YearMonth.FromDate(end)) + 1;
        if (months > calendarMonths) return false;
        period = new(start, end, months);
        return true;
    }

    private static string PeriodRecognitionText(NpsContributionPeriodInput period, int gap) =>
        $"자동 인식: {period.StartMonth:yyyy-MM}~{period.EndMonth:yyyy-MM}, 공단 인정 {period.TotalContributionMonths}개월 · 가입 공백 후보 {gap}개월";

    private void ConfigureSelectors()
    {
        var ages = Enumerable.Range(60, 6).ToArray();
        ContinueAgeAInput.ItemsSource = ages;
        ContinueAgeBInput.ItemsSource = ages;
        ContinueAgeAInput.SelectedItem = 60;
        ContinueAgeBInput.SelectedItem = 60;

        var claimOptions = Enumerable.Range(-5, 11)
            .Select(years => new ClaimOption(
                years switch
                {
                    < 0 => $"정상보다 {-years}년 조기",
                    0 => "정상수령",
                    _ => $"정상보다 {years}년 연기"
                },
                years * 12))
            .ToArray();
        ClaimOffsetAInput.ItemsSource = claimOptions;
        ClaimOffsetBInput.ItemsSource = claimOptions;
        ClaimOffsetAInput.SelectedItem = claimOptions.Single(option => option.OffsetMonths == 0);
        ClaimOffsetBInput.SelectedItem = claimOptions.Single(option => option.OffsetMonths == 0);

        var years = Enumerable.Range(0, 6).ToArray();
        SelectedContinueYearsAInput.ItemsSource = years;
        SelectedContinueYearsBInput.ItemsSource = years;
        SelectedContinueYearsAInput.SelectedItem = 0;
        SelectedContinueYearsBInput.SelectedItem = 0;
    }

    private void SelectedContinuationYears_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_policyService is null || ClaimAgeAOptionsPanel is null || ClaimAgeBOptionsPanel is null) return;
        UpdateClaimAgeSelectors();
    }

    private void UpdateClaimAgeSelectors()
    {
        SetClaimAgeOptions(
            true,
            HasPensionAInput.IsChecked == true,
            BirthDateAInput,
            SelectedContinueYearsAInput,
            ClaimAgeAOptionsPanel,
            ClaimAgeAHelp,
            "AClaimAge");
        SetClaimAgeOptions(
            IncludeSpouseBInput.IsChecked == true,
            HasPensionBInput.IsChecked == true,
            BirthDateBInput,
            SelectedContinueYearsBInput,
            ClaimAgeBOptionsPanel,
            ClaimAgeBHelp,
            "BClaimAge");
    }

    private void SetClaimAgeOptions(
        bool isIncluded,
        bool hasPension,
        TextBox birthDateInput,
        ComboBox continuationYearsInput,
        Panel optionsPanel,
        TextBlock helpText,
        string groupName)
    {
        var previousAge = optionsPanel.Children.OfType<RadioButton>()
            .Where(option => option.IsChecked == true)
            .Select(option => option.Tag is int age ? (int?)age : null)
            .FirstOrDefault();
        optionsPanel.Children.Clear();

        if (!isIncluded)
        {
            helpText.Text = "배우자 미포함: 수령 나이 선택 없음";
            return;
        }
        if (!hasPension)
        {
            helpText.Text = "국민연금 미가입: 본인 노령연금 수령 나이 선택 없음";
            return;
        }
        if (!TryReadBirthDate(birthDateInput.Text, out var birthDate))
        {
            helpText.Text = "생년월일 입력 후 조기·정상·연기 수령 나이가 자동 표시됩니다.";
            return;
        }

        var normalClaimAge = new PolicyResolver(_policyService.CurrentPolicy).ResolveNormalClaimAgeMonths(birthDate) / 12;
        var firstAge = normalClaimAge - 5;
        var lastAge = normalClaimAge + 5;
        var continuationYears = continuationYearsInput.SelectedItem is int years ? years : 0;
        var minimumSelectableAge = Math.Max(firstAge, 60 + continuationYears);
        var selectedAge = previousAge is >= 0 && previousAge >= minimumSelectableAge && previousAge <= lastAge
            ? previousAge.Value
            : Math.Max(normalClaimAge, minimumSelectableAge);

        for (var age = firstAge; age <= lastAge; age++)
        {
            var label = new StackPanel();
            label.Children.Add(new TextBlock
            {
                Text = age.ToString(CultureInfo.InvariantCulture),
                FontWeight = age == normalClaimAge ? FontWeights.Bold : FontWeights.Normal,
                HorizontalAlignment = HorizontalAlignment.Center
            });
            label.Children.Add(new TextBlock
            {
                Text = age == normalClaimAge ? "(기본)" : " ",
                FontSize = 9,
                HorizontalAlignment = HorizontalAlignment.Center
            });
            var option = new RadioButton
            {
                GroupName = groupName,
                Tag = age,
                Content = label,
                IsEnabled = age >= minimumSelectableAge,
                IsChecked = age == selectedAge,
                Style = (Style)FindResource("ClaimAgeOptionStyle"),
                ToolTip = age < minimumSelectableAge
                    ? $"임의계속가입이 {60 + continuationYears}세에 끝나므로 선택할 수 없습니다."
                    : age == normalClaimAge ? "정책상 정상 수급 나이" : age < normalClaimAge ? "조기수령" : "연기수령"
            };
            optionsPanel.Children.Add(option);
        }

        helpText.Text = continuationYears == 0
            ? $"{normalClaimAge}세가 정상수령(기본) · 왼쪽은 조기수령 · 오른쪽은 연기수령"
            : $"임의계속가입 종료: {60 + continuationYears}세 · 그보다 이른 수령 나이는 선택할 수 없습니다.";
    }

    private void ConfigureContinuationIncomeSelectors()
    {
        var resolver = new PolicyResolver(_policyService.CurrentPolicy);
        var rule = resolver.ResolveVoluntaryContinuationIncome(DateOnly.FromDateTime(DateTime.Today));
        var options = rule.SuggestedStandardMonthlyIncomesKrw
            .Select(value => new ContinuationIncomeOption(
                value == rule.DefaultStandardMonthlyIncomeKrw
                    ? $"공단 기본(기타 임의계속) {value:N0}원"
                    : $"월 소득 {value:N0}원 기준",
                value))
            .ToArray();
        var previousA = (ContinuationIncomeAInput.SelectedItem as ContinuationIncomeOption)?.StandardMonthlyIncomeKrw;
        var previousB = (ContinuationIncomeBInput.SelectedItem as ContinuationIncomeOption)?.StandardMonthlyIncomeKrw;
        ContinuationIncomeAInput.ItemsSource = options;
        ContinuationIncomeBInput.ItemsSource = options;
        ContinuationIncomeAInput.SelectedItem = options.FirstOrDefault(option => option.StandardMonthlyIncomeKrw == previousA)
                                                ?? options.First(option => option.StandardMonthlyIncomeKrw == rule.DefaultStandardMonthlyIncomeKrw);
        ContinuationIncomeBInput.SelectedItem = options.FirstOrDefault(option => option.StandardMonthlyIncomeKrw == previousB)
                                                ?? options.First(option => option.StandardMonthlyIncomeKrw == rule.DefaultStandardMonthlyIncomeKrw);
        UpdateContinuationPremiumPreviews();
    }

    private void ContinuationIncome_Changed(object sender, RoutedEventArgs e) => UpdateContinuationPremiumPreviews();

    private void CustomContinuationIncome_Changed(object sender, TextChangedEventArgs e)
    {
        MoneyInput_TextChanged(sender, e);
        UpdateContinuationPremiumPreviews();
    }

    private void UpdateContinuationPremiumPreviews()
    {
        if (_policyService is null || ContinuationIncomeAInput is null || ContinuationPremiumAInfo is null) return;
        SetContinuationPremiumPreview(true, HasPensionAInput.IsChecked == true, BirthDateAInput, ContinuationIncomeAInput, CustomContinuationIncomeAInput, ContinuationPremiumAInfo);
        SetContinuationPremiumPreview(IncludeSpouseBInput.IsChecked == true, HasPensionBInput.IsChecked == true, BirthDateBInput, ContinuationIncomeBInput, CustomContinuationIncomeBInput, ContinuationPremiumBInfo);
    }

    private void SetContinuationPremiumPreview(bool isIncluded, bool hasPension, TextBox birthDate, ComboBox selection, TextBox custom, TextBlock output)
    {
        if (!isIncluded) { output.Text = "배우자 미포함"; return; }
        if (!hasPension) { output.Text = "국민연금 미가입: 임의계속가입 비교 안 함"; return; }
        if (!TrySelectedContinuationIncome(selection, custom, out var income)) { output.Text = "기준소득월액을 선택하거나 직접 입력하세요."; return; }

        var start = YearMonth.FromDate(DateOnly.FromDateTime(DateTime.Today));
        if (TryReadBirthDate(birthDate.Text, out var birth))
        {
            var age60 = DomainDate.AgeMonth(birth, 60 * 12);
            if (age60 > start) start = age60;
        }
        var end = start.AddMonths(59);
        var resolver = new PolicyResolver(_policyService.CurrentPolicy);
        var firstPremium = ContinuationPremium(resolver, income, start);
        var finalPremium = ContinuationPremium(resolver, income, end);
        var premiumText = firstPremium == finalPremium ? $"월 {firstPremium:N0}원" : $"월 {firstPremium:N0}원 → {finalPremium:N0}원";
        output.Text = $"선택 기준소득월액 {income:N0}원 · 예상 보험료 {premiumText} (납부월 정책 보험료율 자동 적용)";
    }

    private static decimal ContinuationPremium(PolicyResolver resolver, decimal income, YearMonth month)
    {
        var limits = resolver.ResolveStandardIncomeLimits(month.FirstDay);
        var standardIncome = Math.Clamp(income, limits.MinimumKrw, limits.MaximumKrw);
        return decimal.Round(standardIncome * resolver.ResolveContributionRate(month.FirstDay).TotalRate.DecimalValue, 0, MidpointRounding.AwayFromZero);
    }

    private static bool TrySelectedContinuationIncome(ComboBox selection, TextBox custom, out decimal income)
    {
        if (!string.IsNullOrWhiteSpace(custom.Text)
            && decimal.TryParse(NormalizeNumber(custom.Text), NumberStyles.Number, CultureInfo.InvariantCulture, out income)
            && income > 0) return true;
        if (selection.SelectedItem is ContinuationIncomeOption option)
        {
            income = option.StandardMonthlyIncomeKrw;
            return true;
        }
        income = 0;
        return false;
    }

    private static decimal SelectedContinuationIncome(ComboBox selection, TextBox custom, string label) =>
        TrySelectedContinuationIncome(selection, custom, out var value)
            ? value
            : throw new ArgumentException($"{label}: 임의계속가입 기준소득월액을 선택하거나 직접 입력하세요.");

    private void GoToStrategy_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var household = BuildHousehold();
            UpdateGapCandidates(household);
            MainTabs.SelectedIndex = 1;
            StatusText.Text = "공단 입력값을 확인했습니다. 본인·배우자 전략을 입력하고 ‘선택 전략 계산’을 누르세요.";
        }
        catch (Exception exception)
        {
            ShowInputError(exception);
        }
    }

    private void RunSimulation_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var household = BuildHousehold();
            var strategy = BuildSelectedStrategy(household, 100, 100);
            var assumptions = new SimulationAssumptions(DateOnly.FromDateTime(DateTime.Today), 100);
            _lastAutomaticReport = _selectedStrategyAnalysisService.Run(_policyService.CurrentPolicy, household, strategy, assumptions);
            _lastReportHtml = SelectedStrategyReportFormatter.BuildHtml(_lastAutomaticReport);
            ResultSummaryText.Text = SelectedStrategyReportFormatter.BuildPlainText(_lastAutomaticReport);
            WarningsText.Text = string.Join(Environment.NewLine, _lastAutomaticReport.Warnings.Select(value => "• " + value));
            ReportBrowser.NavigateToString(_lastReportHtml);
            MainTabs.SelectedIndex = 1;
            StatusText.Text = "본인·배우자의 선택 전략을 동시에 적용해 계산했습니다. 유족연금 탭에도 같은 전략이 적용됩니다.";
        }
        catch (Exception exception)
        {
            ShowInputError(exception);
        }
    }

    private void RunSurvivorAnalysis_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (IncludeSpouseBInput.IsChecked != true)
            {
                var hasPensionEvidence = !string.IsNullOrWhiteSpace(AnchorPensionBInput.Text)
                                         || !string.IsNullOrWhiteSpace(ExpectedMonthsBInput.Text)
                                         || !string.IsNullOrWhiteSpace(TotalContributionBInput.Text)
                                         || !string.IsNullOrWhiteSpace(PremiumBInput.Text);
                IncludeSpouseBInput.IsChecked = true;
                if (!hasPensionEvidence) HasPensionBInput.IsChecked = false;
                UpdatePensionParticipationStates();
                UpdateClaimMonthPreviews();

                if (!TryReadBirthDate(BirthDateBInput.Text, out _))
                {
                    MainTabs.SelectedIndex = 0;
                    BirthDateBInput.Focus();
                    throw new ArgumentException("배우자를 유족연금 대상자로 자동 포함했습니다. 배우자 본인 국민연금이 없어도 되며, 배우자 생년월일 8자리만 입력한 뒤 다시 계산하세요.");
                }
            }
            var household = BuildHousehold();
            var deathAgeA = ParseInt(DeathAgeAInput.Text, "A 예상 사망 나이");
            var deathAgeB = ParseInt(DeathAgeBInput.Text, "B 예상 사망 나이");
            var selectedStrategy = BuildSelectedStrategy(household, deathAgeA, deathAgeB);
            _lastSurvivorReport = _survivorAnalysisService.Run(
                _policyService.CurrentPolicy,
                household,
                deathAgeA,
                deathAgeB,
                DateOnly.FromDateTime(DateTime.Today),
                selectedStrategy);
            _lastSurvivorReportHtml = SurvivorPensionReportFormatter.BuildHtml(_lastSurvivorReport);
            SurvivorReportBrowser.NavigateToString(_lastSurvivorReportHtml);
            StatusText.Text = $"유족연금 계산 완료: {_lastSurvivorReport.FirstDeathSummary}";
        }
        catch (Exception exception)
        {
            ShowInputError(exception);
        }
    }

    private void SwapDeathAges_Click(object sender, RoutedEventArgs e)
    {
        (DeathAgeAInput.Text, DeathAgeBInput.Text) = (DeathAgeBInput.Text, DeathAgeAInput.Text);
        StatusText.Text = "두 사람의 예상 사망 나이를 서로 바꿨습니다. 유족연금을 다시 계산하세요.";
    }

    private void ExportSurvivorHtml_Click(object sender, RoutedEventArgs e)
    {
        if (_lastSurvivorReport is null || string.IsNullOrWhiteSpace(_lastSurvivorReportHtml))
        {
            MessageBox.Show(this, "먼저 유족연금 자동 계산을 실행하세요.", "결과 없음", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (MessageBox.Show(this, "HTML에는 부부 연금과 사망 나이 계산값이 평문으로 저장됩니다. 계속하시겠습니까?", "민감정보 파일 경고", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        var dialog = new SaveFileDialog
        {
            Filter = "HTML 보고서 (*.html)|*.html",
            FileName = $"부부_유족연금_시뮬레이션_{DateTime.Today:yyyyMMdd}.html",
            AddExtension = true
        };
        if (dialog.ShowDialog(this) != true) return;
        File.WriteAllText(dialog.FileName, _lastSurvivorReportHtml, new UTF8Encoding(false));
        StatusText.Text = $"유족연금 HTML 보고서를 저장했습니다: {dialog.FileName}";
    }

    private HouseholdProfile BuildHousehold() => new(
        BuildPerson("A", true, HasPensionAInput, AliasAInput, BirthDateAInput, ContributionStartYearAInput, ContributionStartMonthAInput, ContributionEndYearAInput, ContributionEndMonthAInput, ExpectedMonthsAInput, AnchorPensionAInput,
            TotalContributionAInput, PremiumAInput, SurvivorAInput),
        BuildPerson("B", IncludeSpouseBInput.IsChecked == true, HasPensionBInput, AliasBInput, BirthDateBInput, ContributionStartYearBInput, ContributionStartMonthBInput, ContributionEndYearBInput, ContributionEndMonthBInput, ExpectedMonthsBInput, AnchorPensionBInput,
            TotalContributionBInput, PremiumBInput, SurvivorBInput));

    private HouseholdStrategy BuildSelectedStrategy(HouseholdProfile household, int deathAgeA, int deathAgeB) => new(
        "상단 입력 선택 전략",
        BuildSelectedPersonStrategy(household.PersonA, SelectedContinueYearsAInput, SelectedMonthlyPremiumAInput, ClaimAgeAOptionsPanel, deathAgeA),
        BuildSelectedPersonStrategy(household.PersonB, SelectedContinueYearsBInput, SelectedMonthlyPremiumBInput, ClaimAgeBOptionsPanel, deathAgeB));

    private PersonStrategy BuildSelectedPersonStrategy(
        PersonProfile person,
        ComboBox continuationYearsInput,
        TextBox monthlyPremiumInput,
        Panel claimAgeOptionsPanel,
        int deathAge)
    {
        if (!person.IsIncluded) return new(0, 60, 0, 0, 120);
        if (!person.HasNationalPension) return new(0, 60, 0, 0, deathAge);
        var continuationYears = SelectedInt(continuationYearsInput, $"{person.Alias} 임의계속가입 기간");
        var premium = continuationYears == 0 ? 0 : ParseDecimal(monthlyPremiumInput.Text, $"{person.Alias} 월 납입 예상액");
        if (continuationYears > 0 && premium <= 0)
            throw new ArgumentException($"{person.Alias}: 임의계속가입 기간을 선택한 경우 월 납입 예상액을 1원 이상 입력하세요.");
        var continueUntilAge = 60 + continuationYears;
        var normalClaimAgeMonths = new PolicyResolver(_policyService.CurrentPolicy).ResolveNormalClaimAgeMonths(person.BirthDate);
        var selectedClaimAge = SelectedClaimAge(claimAgeOptionsPanel, person.Alias);
        if (selectedClaimAge < continueUntilAge)
            throw new ArgumentException($"{person.Alias}: 임의계속가입 종료 나이보다 이른 연금 수령 나이는 선택할 수 없습니다.");
        var claimOffsetMonths = (selectedClaimAge * 12) - normalClaimAgeMonths;
        return new(0, continueUntilAge, premium, claimOffsetMonths, deathAge);
    }

    private static int SelectedClaimAge(Panel optionsPanel, string alias) =>
        optionsPanel.Children.OfType<RadioButton>()
            .Where(option => option.IsChecked == true && option.IsEnabled)
            .Select(option => option.Tag)
            .OfType<int>()
            .FirstOrDefault() is var age && age > 0
                ? age
                : throw new ArgumentException($"{alias}: 연금을 받을 나이를 선택하세요.");

    private static PersonProfile BuildPerson(
        string label,
        bool isIncluded,
        CheckBox hasNationalPension,
        TextBox alias,
        TextBox birthDate,
        TextBox contributionStartYear,
        TextBox contributionStartMonth,
        TextBox contributionEndYear,
        TextBox contributionEndMonth,
        TextBox expectedMonths,
        TextBox anchoredPension,
        TextBox totalContribution,
        TextBox premium,
        TextBox survivorPension)
    {
        if (!isIncluded) return new("배우자 없음", DateOnly.MinValue, null, 0, 0, 0, null, null, false, false);
        if (!TryReadBirthDate(birthDate.Text, out var dateOfBirth)) throw new ArgumentException($"{label}: 생년월일을 8자리로 입력하세요. 예: 19750222");
        var survivor = ParseOptionalDecimal(survivorPension.Text, $"{label} 예상 유족연금");
        if (hasNationalPension.IsChecked != true)
            return new(alias.Text.Trim(), dateOfBirth, null, 0, 0, 0, survivor, null, false, true);

        if (!TryReadPeriodParts(contributionStartYear.Text, contributionStartMonth.Text, contributionEndYear.Text, contributionEndMonth.Text, expectedMonths.Text, out var period))
            throw new ArgumentException($"{label}: 총 예상 가입기간의 시작월·종료월·총 개월을 확인하세요.");
        var expectedContributionMonths = period!.TotalContributionMonths;
        var totalExpectedContribution = ParseOptionalDecimal(totalContribution.Text, $"{label} 총 예상납부액");
        var enteredMonthlyPremium = ParseOptionalDecimal(premium.Text, $"{label} 현재 월 보험료");
        if (enteredMonthlyPremium is null && totalExpectedContribution is null)
            throw new ArgumentException($"{label}: 공단 총 예상납부액 또는 현재 월 보험료 중 하나를 입력하세요.");
        var monthlyPremium = enteredMonthlyPremium
            ?? decimal.Round(totalExpectedContribution!.Value / expectedContributionMonths, 0, MidpointRounding.AwayFromZero);

        var statement = new NpsStatementAnchor(
            null,
            null,
            null,
            totalExpectedContribution,
            period.StartMonth,
            period.EndMonth,
            enteredMonthlyPremium is null);

        return new(
            alias.Text.Trim(),
            dateOfBirth,
            null,
            expectedContributionMonths,
            monthlyPremium,
            ParseDecimal(anchoredPension.Text, $"{label} 공단 세전 예상 노령연금"),
            survivor,
            statement);
    }

    private void UpdateGapCandidates(HouseholdProfile household)
    {
        if (household.PersonA.HasNationalPension)
        {
            _gapCandidateA = GapCandidate(household.PersonA);
            SetGapCandidateText(GapCandidateAInfo, BackpayCandidateAInfo, _gapCandidateA);
        }
        else
        {
            _gapCandidateA = 0;
            SetNoPensionText(GapCandidateAInfo, BackpayCandidateAInfo);
        }

        if (!household.PersonB.IsIncluded)
        {
            _gapCandidateB = 0;
            SetNoSpouseText(GapCandidateBInfo, BackpayCandidateBInfo);
        }
        else if (household.PersonB.HasNationalPension)
        {
            _gapCandidateB = GapCandidate(household.PersonB);
            SetGapCandidateText(GapCandidateBInfo, BackpayCandidateBInfo, _gapCandidateB);
        }
        else
        {
            _gapCandidateB = 0;
            SetNoPensionText(GapCandidateBInfo, BackpayCandidateBInfo);
        }
    }

    private static int GapCandidate(PersonProfile person)
    {
        var statement = person.NpsStatement;
        if (statement?.ContributionPeriodStartMonth is not { } start || statement.ContributionPeriodEndMonth is not { } end) return 0;
        return ContributionProjection.CalculateUncreditedGapCandidate(start, end, person.ExpectedContributionMonthsAt60);
    }

    private static void SetGapCandidateText(TextBlock inputInfo, TextBlock strategyInfo, int months)
    {
        var text = months > 0
            ? $"가입 공백 후보: {months}개월 (추납 가능 여부는 공단 확인 필요)"
            : "가입 공백 후보: 0개월 또는 계산할 정보 없음";
        inputInfo.Text = text;
        strategyInfo.Text = text;
    }

    private void UseGapCandidateA_Click(object sender, RoutedEventArgs e) => UseGapCandidate(_gapCandidateA, BackpayAInput, "본인");
    private void UseGapCandidateB_Click(object sender, RoutedEventArgs e) => UseGapCandidate(_gapCandidateB, BackpayBInput, "배우자");

    private void UseGapCandidate(int months, TextBox target, string label)
    {
        if (months <= 0)
        {
            MessageBox.Show(this, "먼저 NPS 가입 시작월·종료월·총 예상 가입개월을 입력하세요.", "공백 후보 없음", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        target.Text = months.ToString(CultureInfo.InvariantCulture);
        if (ReferenceEquals(target, BackpayAInput)) BackpayConfirmedAInput.IsChecked = false;
        if (ReferenceEquals(target, BackpayBInput)) BackpayConfirmedBInput.IsChecked = false;
        StatusText.Text = $"{label}의 공백 후보 {months}개월을 비교전략에 넣었습니다. 실제 추납 가능기간은 공단에서 확인하세요.";
    }

    private HouseholdStrategy BuildComparisonStrategy() => new(
        "사용자 비교전략",
        BuildPersonStrategy(true, HasPensionAInput.IsChecked == true, "A", BackpayAInput, BackpayConfirmedAInput, ContinueAgeAInput, ContinuePremiumAInput, ClaimOffsetAInput, DeathAgeAInput,
            SelectedContinuationIncome(ContinuationIncomeAInput, CustomContinuationIncomeAInput, "A")),
        BuildPersonStrategy(IncludeSpouseBInput.IsChecked == true, HasPensionBInput.IsChecked == true, "B", BackpayBInput, BackpayConfirmedBInput, ContinueAgeBInput, ContinuePremiumBInput, ClaimOffsetBInput, DeathAgeBInput,
            SelectedContinuationIncome(ContinuationIncomeBInput, CustomContinuationIncomeBInput, "B")));

    private static PersonStrategy BuildPersonStrategy(
        bool isIncluded,
        bool hasNationalPension,
        string label,
        TextBox backpay,
        CheckBox backpayConfirmed,
        ComboBox continueAge,
        TextBox continuePremium,
        ComboBox claimOffset,
        TextBox deathAge,
        decimal continuationStandardIncome)
    {
        if (!isIncluded) return new(0, 60, 0, 0, 120, false);
        var expectedDeathAge = ParseInt(deathAge.Text, $"{label} 사망 나이");
        if (!hasNationalPension) return new(0, 60, 0, 0, expectedDeathAge, false);
        return new(
            ParseInt(backpay.Text, $"{label} 추납개월"),
            SelectedInt(continueAge, $"{label} 임의계속 종료 나이"),
            ParseDecimal(continuePremium.Text, $"{label} 임의계속 보험료"),
            SelectedClaimOffset(claimOffset),
            expectedDeathAge,
            backpayConfirmed.IsChecked == true,
            continuationStandardIncome);
    }

    private void DisplayResult(StrategyComparisonResult result)
    {
        var permanent = result.PermanentAdvantageStarts?.Description ?? "가정한 생존기간 안에 영구 우위 없음";
        var hasSpouse = result.Baseline.PersonB.IsIncluded;
        var claimMonths = hasSpouse
            ? $"{ClaimMonthText(result.Baseline.PersonA)}, {ClaimMonthText(result.Baseline.PersonB)}"
            : ClaimMonthText(result.Baseline.PersonA);
        var baselinePensions = PensionPairText(result.Baseline.PersonA, result.Baseline.PersonB);
        var comparisonPensions = PensionPairText(result.Alternative.PersonA, result.Alternative.PersonB);
        var baselineNetPensions = EstimatedNetPensionPairText(result.Baseline.PersonA, result.Baseline.PersonB);
        var comparisonNetPensions = EstimatedNetPensionPairText(result.Alternative.PersonA, result.Alternative.PersonB);
        var ageSubject = hasSpouse ? "두 사람 모두" : result.Baseline.PersonA.Alias;
        ResultSummaryText.Text = $"""
            적용 정책: {result.Alternative.PolicyPackId}
            정확도: B (공단 예상연금 Anchor + 가입개월 비례 추정)

            공단 기준 정상 수급월: {claimMonths}
            기준전략 월연금(세전): {baselinePensions}
            기준전략 월연금(세후 추정): {baselineNetPensions}
            비교전략 월연금(세전): {comparisonPensions}
            비교전략 월연금(세후 추정): {comparisonNetPensions}

            비교전략의 영구 우위 시작: {permanent}
            {ageSubject} 85세 도달 시 기준 대비: {SignedMoney(result.DifferenceAtBothAge85)}
            {ageSubject} 90세 도달 시 기준 대비: {SignedMoney(result.DifferenceAtBothAge90)}
            정책 해시: {result.Alternative.PolicyContentHash[..16]}…
            """;

        var warnings = result.Baseline.Warnings
            .Concat(result.Alternative.Warnings)
            .Concat(_policyService.CurrentPolicy.Notes)
            .Append(_policyService.CurrentTrustLevel == LocalPolicyTrustLevel.BuiltInVerified
                ? "정책 출처 등급: 내장 검증 정책"
                : "정책 출처 등급: 사용자 가져오기·기술 검증 통과 (공단 인증 아님)")
            .Distinct(StringComparer.Ordinal)
            .Select(message => "• " + message);
        WarningsText.Text = string.Join(Environment.NewLine, warnings) + Environment.NewLine +
                            "• 본 결과는 의사결정 지원용 추정치이며 국민연금공단의 최종 산정 결과가 우선합니다.";
        LedgerGrid.ItemsSource = result.Alternative.Ledger;
    }

    private static string ClaimMonthText(PersonSimulationSummary person) =>
        !person.IsIncluded ? "배우자 미포함"
        : person.HasNationalPension ? $"{person.Alias} {person.NormalClaimMonth}" : $"{person.Alias} 해당 없음(미가입)";

    private static string PensionPairText(PersonSimulationSummary personA, PersonSimulationSummary personB) =>
        personB.IsIncluded
            ? $"{personA.Alias} {Money(personA.EstimatedMonthlyPensionKrw)}, {personB.Alias} {Money(personB.EstimatedMonthlyPensionKrw)}"
            : $"{personA.Alias} {Money(personA.EstimatedMonthlyPensionKrw)}";

    private string EstimatedNetPensionPairText(PersonSimulationSummary personA, PersonSimulationSummary personB)
    {
        string PersonText(PersonSimulationSummary person)
        {
            var estimate = PensionTaxEstimator.EstimateMonthly(_policyService.CurrentPolicy, person.EstimatedMonthlyPensionKrw);
            return estimate is null ? $"{person.Alias} 추정 불가" : $"{person.Alias} 약 {Money(estimate.EstimatedNetMonthlyKrw)}";
        }

        return personB.IsIncluded ? $"{PersonText(personA)}, {PersonText(personB)}" : PersonText(personA);
    }

    private async void SaveProfile_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var household = BuildHousehold();
            var savedDeathAgeA = string.IsNullOrWhiteSpace(DeathAgeAInput.Text)
                ? 100
                : ParseInt(DeathAgeAInput.Text, "A 예상 사망 나이");
            var savedDeathAgeB = !household.PersonB.IsIncluded || string.IsNullOrWhiteSpace(DeathAgeBInput.Text)
                ? 100
                : ParseInt(DeathAgeBInput.Text, "B 예상 사망 나이");
            var strategy = BuildSelectedStrategy(
                household,
                savedDeathAgeA,
                savedDeathAgeB);
            var dialog = new SaveFileDialog
            {
                Title = "암호화 프로필 저장",
                Filter = "국민연금 암호화 프로필 (*.npsprofile)|*.npsprofile",
                FileName = $"국민연금프로필_{DateTime.Now:yyyyMMdd_HHmmssfff}.npsprofile",
                AddExtension = true,
                DefaultExt = ".npsprofile",
                CheckFileExists = false,
                CreatePrompt = false,
                OverwritePrompt = false
            };
            if (dialog.ShowDialog(this) != true) return;
            var savePath = CreateUniqueProfilePath(dialog.FileName);

            var password = PromptForPassword("프로필을 암호화할 비밀번호를 입력하세요.");
            if (password is null) return;
            var confirmation = PromptForPassword("같은 비밀번호를 다시 입력하세요.");
            if (confirmation is null) return;
            if (!string.Equals(password, confirmation, StringComparison.Ordinal))
                throw new ArgumentException("두 비밀번호가 일치하지 않습니다.");

            await _profileStore.SaveAsync(savePath, new(household, strategy, new(DateOnly.FromDateTime(DateTime.Today)), DateTimeOffset.Now), password);
            StatusText.Text = $"암호화 프로필을 저장했습니다: {savePath}";
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "프로필 저장 실패", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private static string CreateUniqueProfilePath(string requestedPath)
    {
        var fullPath = Path.GetFullPath(requestedPath);
        if (!File.Exists(fullPath)) return fullPath;

        var directory = Path.GetDirectoryName(fullPath) ?? throw new InvalidOperationException("프로필 저장 폴더를 확인할 수 없습니다.");
        var baseName = Path.GetFileNameWithoutExtension(fullPath);
        var extension = Path.GetExtension(fullPath);
        for (var sequence = 2; sequence <= 9999; sequence++)
        {
            var candidate = Path.Combine(directory, $"{baseName}_{sequence}{extension}");
            if (!File.Exists(candidate)) return candidate;
        }

        return Path.Combine(directory, $"{baseName}_{Guid.NewGuid():N}{extension}");
    }

    private async void LoadProfile_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "암호화 프로필 불러오기",
            Filter = "국민연금 암호화 프로필 (*.npsprofile)|*.npsprofile"
        };
        if (dialog.ShowDialog(this) != true) return;
        var password = PromptForPassword("프로필 비밀번호를 입력하세요.");
        if (password is null) return;

        try
        {
            var profile = await _profileStore.LoadAsync(dialog.FileName, password);
            PopulateProfile(profile);
            StatusText.Text = "암호화 프로필을 불러왔습니다.";
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "프로필 불러오기 실패", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void PopulateProfile(SavedProfile saved)
    {
        IncludeSpouseBInput.IsChecked = saved.Household.PersonB.IsIncluded;
        PopulatePerson(saved.Household.PersonA, HasPensionAInput, AliasAInput, BirthDateAInput, ContributionStartYearAInput, ContributionStartMonthAInput, ContributionEndYearAInput, ContributionEndMonthAInput, ExpectedMonthsAInput, AnchorPensionAInput,
            TotalContributionAInput, PremiumAInput, SurvivorAInput);
        PopulatePerson(saved.Household.PersonB, HasPensionBInput, AliasBInput, BirthDateBInput, ContributionStartYearBInput, ContributionStartMonthBInput, ContributionEndYearBInput, ContributionEndMonthBInput, ExpectedMonthsBInput, AnchorPensionBInput,
            TotalContributionBInput, PremiumBInput, SurvivorBInput);
        PopulateStrategy(saved.ComparisonStrategy.PersonA, BackpayAInput, BackpayConfirmedAInput, ContinueAgeAInput, ContinuePremiumAInput, ClaimOffsetAInput, DeathAgeAInput);
        PopulateStrategy(saved.ComparisonStrategy.PersonB, BackpayBInput, BackpayConfirmedBInput, ContinueAgeBInput, ContinuePremiumBInput, ClaimOffsetBInput, DeathAgeBInput);
        PopulateContinuationIncome(saved.ComparisonStrategy.PersonA, ContinuationIncomeAInput, CustomContinuationIncomeAInput);
        PopulateContinuationIncome(saved.ComparisonStrategy.PersonB, ContinuationIncomeBInput, CustomContinuationIncomeBInput);
        PopulateSelectedStrategy(saved.ComparisonStrategy.PersonA, SelectedContinueYearsAInput, SelectedMonthlyPremiumAInput);
        PopulateSelectedStrategy(saved.ComparisonStrategy.PersonB, SelectedContinueYearsBInput, SelectedMonthlyPremiumBInput);
        UpdatePensionParticipationStates();
        UpdateClaimAgeSelectors();
        SelectSavedClaimAge(saved.Household.PersonA, saved.ComparisonStrategy.PersonA, ClaimAgeAOptionsPanel);
        SelectSavedClaimAge(saved.Household.PersonB, saved.ComparisonStrategy.PersonB, ClaimAgeBOptionsPanel);
        UpdateGapCandidates(saved.Household);
        UpdateClaimMonthPreviews();
    }

    private static void PopulatePerson(
        PersonProfile person,
        CheckBox hasNationalPension,
        TextBox alias,
        TextBox birthDate,
        TextBox contributionStartYear,
        TextBox contributionStartMonth,
        TextBox contributionEndYear,
        TextBox contributionEndMonth,
        TextBox expectedMonths,
        TextBox pension,
        TextBox totalContribution,
        TextBox premium,
        TextBox survivor)
    {
        hasNationalPension.IsChecked = person.HasNationalPension;
        alias.Text = person.IsIncluded ? person.Alias : "배우자";
        birthDate.Text = person.IsIncluded ? person.BirthDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture) : string.Empty;
        pension.Text = person.HasNationalPension ? person.AnchoredMonthlyPensionKrw.ToString("0", CultureInfo.InvariantCulture) : string.Empty;
        survivor.Text = person.ExpectedSurvivorPensionFromSpouseKrw?.ToString("0", CultureInfo.InvariantCulture) ?? string.Empty;

        var statement = person.NpsStatement;
        totalContribution.Text = statement?.TotalExpectedContributionKrw?.ToString("0", CultureInfo.InvariantCulture) ?? string.Empty;
        contributionStartYear.Text = statement?.ContributionPeriodStartMonth?.Year.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
        contributionStartMonth.Text = statement?.ContributionPeriodStartMonth?.Month.ToString("00", CultureInfo.InvariantCulture) ?? string.Empty;
        contributionEndYear.Text = statement?.ContributionPeriodEndMonth?.Year.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
        contributionEndMonth.Text = statement?.ContributionPeriodEndMonth?.Month.ToString("00", CultureInfo.InvariantCulture) ?? string.Empty;
        expectedMonths.Text = person.HasNationalPension ? person.ExpectedContributionMonthsAt60.ToString(CultureInfo.InvariantCulture) : string.Empty;
        premium.Text = statement?.MonthlyContributionEstimatedFromTotal == true
            ? string.Empty
            : person.CurrentMonthlyPremiumKrw.ToString("0", CultureInfo.InvariantCulture);
    }

    private static void PopulateStrategy(PersonStrategy strategy, TextBox backpay, CheckBox backpayConfirmed, ComboBox continueAge, TextBox continuePremium, ComboBox claimOffset, TextBox deathAge)
    {
        backpay.Text = strategy.BackPaymentMonths.ToString(CultureInfo.InvariantCulture);
        backpayConfirmed.IsChecked = strategy.BackPaymentMonthsConfirmed;
        continueAge.SelectedItem = strategy.ContinueUntilAgeYears;
        continuePremium.Text = strategy.ContinuationMonthlyPremiumKrw.ToString("0", CultureInfo.InvariantCulture);
        claimOffset.SelectedItem = claimOffset.Items.Cast<ClaimOption>().Single(option => option.OffsetMonths == strategy.ClaimOffsetMonths);
        deathAge.Text = strategy.DeathAgeYears.ToString(CultureInfo.InvariantCulture);
    }

    private static void PopulateContinuationIncome(PersonStrategy strategy, ComboBox selection, TextBox custom)
    {
        if (strategy.ContinuationStandardMonthlyIncomeKrw is not { } income || income <= 0) return;
        var matching = selection.Items.Cast<ContinuationIncomeOption>().FirstOrDefault(option => option.StandardMonthlyIncomeKrw == income);
        if (matching is not null)
        {
            selection.SelectedItem = matching;
            custom.Text = string.Empty;
        }
        else
        {
            custom.Text = income.ToString("N0", CultureInfo.InvariantCulture);
        }
    }

    private static void PopulateSelectedStrategy(PersonStrategy strategy, ComboBox continuationYears, TextBox premium)
    {
        continuationYears.SelectedItem = Math.Clamp(strategy.ContinueUntilAgeYears - 60, 0, 5);
        premium.Text = strategy.ContinuationMonthlyPremiumKrw > 0
            ? strategy.ContinuationMonthlyPremiumKrw.ToString("N0", CultureInfo.InvariantCulture)
            : "150,000";
    }

    private void SelectSavedClaimAge(PersonProfile person, PersonStrategy strategy, Panel optionsPanel)
    {
        if (!person.IsIncluded || !person.HasNationalPension) return;
        var normalClaimAgeMonths = new PolicyResolver(_policyService.CurrentPolicy).ResolveNormalClaimAgeMonths(person.BirthDate);
        var savedClaimAge = (normalClaimAgeMonths + strategy.ClaimOffsetMonths) / 12;
        var option = optionsPanel.Children.OfType<RadioButton>()
            .FirstOrDefault(candidate => candidate.IsEnabled && candidate.Tag is int age && age == savedClaimAge);
        if (option is not null) option.IsChecked = true;
    }

    private void ExportAiKit_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog
        {
            Title = "AI 정책 업데이트 키트 저장",
            Filter = "ZIP 파일 (*.zip)|*.zip",
            FileName = $"NPS_POLICY_AI_UPDATE_KIT_{DateTime.Today:yyyyMMdd}.zip",
            AddExtension = true
        };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            _policyService.ExportAiUpdateKit(dialog.FileName, _aiGuide);
            StatusText.Text = $"개인정보 없는 AI 업데이트 키트를 만들었습니다: {dialog.FileName}";
            MessageBox.Show(this, "키트에는 공개 정책과 작성 규칙만 포함되며 개인 입력값은 들어가지 않습니다.", "키트 생성 완료", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "키트 생성 실패", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void ImportPolicy_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "AI가 만든 정책 업데이트 JSON 선택",
            Filter = "정책 업데이트 JSON (*.json)|*.json"
        };
        if (dialog.ShowDialog(this) != true) return;

        try
        {
            var json = File.ReadAllText(dialog.FileName);
            var result = _policyService.InspectUpdate(json);
            PolicyValidationText.Text = FormatValidationResult(result);
            ExportFixKitButton.IsEnabled = !result.IsValid;
            if (!result.IsValid)
            {
                StatusText.Text = "정책 검증에 실패했습니다. AI 수정 요청 키트를 만들 수 있습니다.";
                return;
            }

            var statusWarning = result.UpdatedPack!.LegalStatus == PolicyLegalStatus.Enacted
                ? "공식 시행 상태로 작성된 사용자 가져오기 정책입니다."
                : $"법적 상태: {result.UpdatedPack.LegalStatus}. 공식 확정 정책이 아닙니다.";
            var confirmation = MessageBox.Show(this,
                $"{statusWarning}{Environment.NewLine}{Environment.NewLine}{string.Join(Environment.NewLine, result.ChangeSummary)}{Environment.NewLine}{Environment.NewLine}이 정책을 활성화하시겠습니까?",
                "사용자 정책 활성화 확인",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);
            if (confirmation != MessageBoxResult.Yes) return;

            _policyService.ActivateInspectedUpdate();
            LedgerGrid.ItemsSource = null;
            ResultSummaryText.Text = "정책이 변경되었습니다. 시뮬레이션을 다시 실행하세요.";
            UpdatePolicyDisplay("사용자 가져오기 정책을 활성화했습니다.");
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "정책 가져오기 실패", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void ExportFixKit_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog
        {
            Title = "AI 정책 수정 요청 키트 저장",
            Filter = "ZIP 파일 (*.zip)|*.zip",
            FileName = $"NPS_POLICY_AI_FIX_KIT_{DateTime.Today:yyyyMMdd}.zip",
            AddExtension = true
        };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            _policyService.ExportAiFixKit(dialog.FileName);
            StatusText.Text = $"AI 수정 요청 키트를 만들었습니다: {dialog.FileName}";
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "수정 키트 생성 실패", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void RollbackPolicy_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show(this, "이전 정책으로 되돌리시겠습니까?", "정책 롤백", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        try
        {
            _policyService.Rollback();
            UpdatePolicyDisplay("이전 정책으로 되돌렸습니다.");
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "정책 롤백 실패", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private void ExportCsv_Click(object sender, RoutedEventArgs e)
    {
        if (_lastAutomaticReport is null)
        {
            MessageBox.Show(this, "먼저 선택 전략을 계산하세요.", "결과 없음", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (MessageBox.Show(this, "CSV에는 연금·보험료 계산값이 평문으로 저장됩니다. 계속하시겠습니까?", "민감정보 파일 경고", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

        var dialog = new SaveFileDialog { Filter = "CSV 파일 (*.csv)|*.csv", FileName = $"국민연금_선택전략비교_{DateTime.Today:yyyyMMdd}.csv", AddExtension = true };
        if (dialog.ShowDialog(this) != true) return;
        using var writer = new StreamWriter(dialog.FileName, false, new UTF8Encoding(true));
        writer.WriteLine("대상,임의계속가입년수,월납입예상액,정상대비수령시점년수,정상수령시작월,선택수령시작월,정상월연금,선택월연금,추가납부총액");
        foreach (var row in _lastAutomaticReport.People)
        {
            writer.WriteLine(string.Join(",",
                Csv(row.Alias), row.ContinuationYears,
                row.ContinuationMonthlyPremiumKrw.ToString(CultureInfo.InvariantCulture),
                row.ClaimOffsetYears, Csv(row.BaselineClaimMonth.ToString()), Csv(row.SelectedClaimMonth.ToString()),
                row.BaselineMonthlyPensionKrw.ToString(CultureInfo.InvariantCulture), row.SelectedMonthlyPensionKrw.ToString(CultureInfo.InvariantCulture),
                row.AdditionalContributionKrw.ToString(CultureInfo.InvariantCulture)));
        }
        StatusText.Text = $"CSV를 저장했습니다: {dialog.FileName}";
    }

    private void ExportHtml_Click(object sender, RoutedEventArgs e)
    {
        if (_lastAutomaticReport is null || string.IsNullOrWhiteSpace(_lastReportHtml))
        {
            MessageBox.Show(this, "먼저 선택 전략을 계산하세요.", "결과 없음", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (MessageBox.Show(this, "HTML에는 연금·보험료 계산값이 평문으로 저장됩니다. 계속하시겠습니까?", "민감정보 파일 경고", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

        var dialog = new SaveFileDialog
        {
            Filter = "HTML 보고서 (*.html)|*.html",
            FileName = $"국민연금_선택전략보고서_{DateTime.Today:yyyyMMdd}.html",
            AddExtension = true
        };
        if (dialog.ShowDialog(this) != true) return;
        File.WriteAllText(dialog.FileName, _lastReportHtml, new UTF8Encoding(false));
        StatusText.Text = $"HTML 보고서를 저장했습니다: {dialog.FileName}";
    }

    private void PrintResult_Click(object sender, RoutedEventArgs e)
    {
        if (_lastAutomaticReport is null)
        {
            MessageBox.Show(this, "먼저 선택 전략을 계산하세요.", "결과 없음", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var printDialog = new PrintDialog();
        if (printDialog.ShowDialog() != true) return;
        var document = new FlowDocument { PagePadding = new Thickness(45), FontFamily = new("Malgun Gothic"), FontSize = 12 };
        document.Blocks.Add(new Paragraph(new Run("국민연금 선택 전략 분석 보고서")) { FontSize = 20, FontWeight = FontWeights.Bold });
        document.Blocks.Add(new Paragraph(new Run(SelectedStrategyReportFormatter.BuildPlainText(_lastAutomaticReport))));
        printDialog.PrintDocument(((IDocumentPaginatorSource)document).DocumentPaginator, "국민연금 선택 전략 분석 보고서");
        StatusText.Text = "인쇄/PDF 작업을 보냈습니다.";
    }

    private static string Csv(string value) => $"\"{value.Replace("\"", "\"\"")}\"";

    private void UpdatePolicyDisplay(string status)
    {
        var pack = _policyService.CurrentPolicy;
        _lastAutomaticReport = null;
        _lastReportHtml = null;
        _lastSurvivorReport = null;
        _lastSurvivorReportHtml = null;
        if (ReportBrowser is not null)
            ReportBrowser.NavigateToString("<html><head><meta charset='utf-8'></head><body style=\"font-family:'Malgun Gothic';padding:36px;color:#475569\"><h2>상단에서 부부 전략을 입력하고 계산하세요.</h2><p>임의계속가입 기간·월 납입액·조기/정상/연기 수령 나이를 두 사람에게 동시에 적용합니다.</p></body></html>");
        if (SurvivorReportBrowser is not null)
            SurvivorReportBrowser.NavigateToString("<html><head><meta charset='utf-8'></head><body style=\"font-family:'Malgun Gothic';padding:36px;color:#475569\"><h2>부부 예상 사망 나이를 입력하고 유족연금을 계산하세요.</h2><p>전략 분석 보고서 상단에 입력한 임의계속가입·월 납입액·조기/정상/연기 수령 나이를 그대로 적용합니다.</p><p>부부 생존 시 월 합산과 첫 사망 이후 월 합산을 기간별로 표시합니다.</p></body></html>");
        var trustLabel = _policyService.CurrentTrustLevel == LocalPolicyTrustLevel.BuiltInVerified
            ? "내장 검증"
            : "사용자 가져오기";
        HeaderPolicyText.Text = $"정책 {pack.PolicyPackId} · {trustLabel}";
        PolicySummaryText.Text = $"""
            ID: {pack.PolicyPackId}
            법적 상태: {pack.LegalStatus}
            출처 등급: {trustLabel}
            Schema: {pack.SchemaVersion} / 최소 엔진: {pack.MinimumEngineVersion}
            출처: {pack.LegalSources.Count}건 / 보험료율 구간: {pack.ContributionRates.Count}개
            저장 위치: 이 PC의 사용자별 공개 정책 저장소
            """;
        PolicyValidationText.Text = status;
        ExportFixKitButton.IsEnabled = false;
        StatusText.Text = status;
        ConfigureContinuationIncomeSelectors();
        UpdateClaimAgeSelectors();
        UpdateEstimatedNetPensionPreviews();
    }

    private static string FormatValidationResult(PolicyUpdateResult result)
    {
        var builder = new StringBuilder();
        builder.AppendLine(result.IsValid ? "검증 통과" : "검증 실패");
        builder.AppendLine();
        foreach (var summary in result.ChangeSummary) builder.AppendLine("CHANGE  " + summary);
        foreach (var issue in result.Issues) builder.AppendLine($"{(issue.IsError ? "ERROR" : "WARN ")}  [{issue.Code}] {issue.Message}");
        if (result.IsValid) builder.AppendLine("WARN   국민연금공단 인증이 아닌 사용자 가져오기 정책입니다.");
        return builder.ToString();
    }

    private string? PromptForPassword(string prompt)
    {
        var window = new PasswordPromptWindow(prompt) { Owner = this };
        return window.ShowDialog() == true ? window.Password : null;
    }

    private static int SelectedInt(ComboBox input, string label) =>
        input.SelectedItem is int value ? value : throw new ArgumentException($"{label}을 선택하세요.");

    private static int SelectedClaimOffset(ComboBox input) =>
        input.SelectedItem is ClaimOption option ? option.OffsetMonths : throw new ArgumentException("수령 시점을 선택하세요.");

    private void MoneyInput_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (sender is not TextBox input) return;
        if (string.IsNullOrWhiteSpace(input.Text))
        {
            UpdateEstimatedNetPensionPreviews();
            return;
        }
        var original = input.Text;
        var normalized = NormalizeNumber(original);
        if (!decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
        {
            UpdateEstimatedNetPensionPreviews();
            return;
        }

        var formatted = decimal.Round(value, 0, MidpointRounding.AwayFromZero).ToString("N0", CultureInfo.InvariantCulture);
        if (!string.Equals(original, formatted, StringComparison.Ordinal))
        {
            var originalCaret = Math.Clamp(input.SelectionStart, 0, original.Length);
            var digitsBeforeCaret = original[..originalCaret].Count(char.IsDigit);
            input.Text = formatted;
            input.SelectionStart = CaretAfterDigitCount(formatted, digitsBeforeCaret);
        }
        UpdateEstimatedNetPensionPreviews();
    }

    private static int CaretAfterDigitCount(string text, int digitCount)
    {
        if (digitCount <= 0) return 0;
        var seen = 0;
        for (var index = 0; index < text.Length; index++)
        {
            if (!char.IsDigit(text[index])) continue;
            seen++;
            if (seen == digitCount) return index + 1;
        }
        return text.Length;
    }

    private static int ParseInt(string text, string label) =>
        int.TryParse(NormalizeNumber(text), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : throw new ArgumentException($"{label}에 올바른 숫자를 입력하세요.");

    private static int? ParseOptionalInt(string text, string label) =>
        string.IsNullOrWhiteSpace(text) ? null : ParseInt(text, label);

    private static decimal ParseDecimal(string text, string label) =>
        decimal.TryParse(NormalizeNumber(text), NumberStyles.Number, CultureInfo.InvariantCulture, out var value)
            ? value
            : throw new ArgumentException($"{label}에 올바른 금액을 입력하세요.");

    private static decimal? ParseOptionalDecimal(string text, string label) =>
        string.IsNullOrWhiteSpace(text) ? null : ParseDecimal(text, label);

    private static DateOnly? ParseOptionalYearMonth(string text, string label)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        return DateOnly.TryParseExact(text.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var value)
            ? new DateOnly(value.Year, value.Month, 1)
            : throw new ArgumentException($"{label}은 yyyy-MM 형식으로 입력하세요. 예: 2040-03");
    }

    private static string FormatYearMonth(DateOnly? value) => value is null
        ? string.Empty
        : value.Value.ToString("yyyy-MM", CultureInfo.InvariantCulture);

    private static string NormalizeNumber(string text) => text.Trim().Replace(",", string.Empty, StringComparison.Ordinal);
    private static string Money(decimal value) => $"{value:N0}원/월";
    private static string SignedMoney(decimal value) => $"{value:+#,##0;-#,##0;0}원";

    private void ShowInputError(Exception exception)
    {
        MessageBox.Show(this, exception.Message, "입력 확인", MessageBoxButton.OK, MessageBoxImage.Warning);
        StatusText.Text = "입력값을 확인하세요.";
    }

    private static string ReadEmbeddedText(string suffix)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = assembly.GetManifestResourceNames().Single(name => name.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));
        using var stream = assembly.GetManifestResourceStream(resourceName) ?? throw new InvalidOperationException($"내장 리소스를 찾을 수 없습니다: {suffix}");
        using var reader = new StreamReader(stream, Encoding.UTF8, true);
        return reader.ReadToEnd();
    }

    private sealed record ClaimOption(string Label, int OffsetMonths);
    private sealed record ContinuationIncomeOption(string Label, decimal StandardMonthlyIncomeKrw);
}
