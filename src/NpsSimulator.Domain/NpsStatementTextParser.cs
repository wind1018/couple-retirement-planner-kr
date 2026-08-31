using System.Globalization;
using System.Text.RegularExpressions;

namespace NpsSimulator.Domain;

public sealed record NpsContributionPeriodInput(DateOnly StartMonth, DateOnly EndMonth, int TotalContributionMonths);
public sealed record NpsClaimStartInput(DateOnly ClaimStartMonth, int? ClaimAgeYears);

public static partial class NpsStatementTextParser
{
    public static NpsClaimStartInput ParseClaimStart(string text, string label)
    {
        var month = ParseYearMonth(text, label);
        var ageMatch = ClaimAgeRegex().Match(text);
        int? age = ageMatch.Success
            && int.TryParse(ageMatch.Groups["age"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsedAge)
            ? parsedAge
            : null;
        if (age is < 55 or > 75) throw new ArgumentException($"{label}의 수급 나이가 올바르지 않습니다.");
        return new(month, age);
    }

    public static DateOnly ParseYearMonth(string text, string label)
    {
        if (!TryParseYearMonth(text, out var value))
            throw new ArgumentException($"{label}에서 연·월을 찾을 수 없습니다. 예: 2040년 3월(65세)부터");
        return value;
    }

    public static bool TryParseYearMonth(string? text, out DateOnly value)
    {
        value = default;
        if (string.IsNullOrWhiteSpace(text)) return false;

        if (DateOnly.TryParseExact(text.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var exact))
        {
            value = new(exact.Year, exact.Month, 1);
            return true;
        }

        var match = YearMonthRegex().Match(text);
        return match.Success && TryCreateMonth(match, out value);
    }

    public static NpsContributionPeriodInput ParseContributionPeriod(string text, string label)
    {
        if (!TryParseContributionPeriod(text, out var value))
            throw new ArgumentException($"{label}을 공단 표시 형식으로 입력하세요. 예: 1999년 04월~2035년 02월 총 418개월");
        return value!;
    }

    public static bool TryParseContributionPeriod(string? text, out NpsContributionPeriodInput? value)
    {
        value = null;
        if (string.IsNullOrWhiteSpace(text)) return false;

        var monthMatches = YearMonthRegex().Matches(text);
        var creditedMatch = CreditedMonthsRegex().Match(text);
        if (monthMatches.Count < 2 || !creditedMatch.Success) return false;
        if (!TryCreateMonth(monthMatches[0], out var start) || !TryCreateMonth(monthMatches[1], out var end)) return false;
        if (!int.TryParse(creditedMatch.Groups["months"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var months)) return false;
        if (months <= 0 || end < start) return false;

        var calendarMonths = YearMonth.FromDate(start).MonthsUntil(YearMonth.FromDate(end)) + 1;
        if (months > calendarMonths) return false;
        value = new(start, end, months);
        return true;
    }

    private static bool TryCreateMonth(Match match, out DateOnly value)
    {
        value = default;
        if (!int.TryParse(match.Groups["year"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var year)
            || !int.TryParse(match.Groups["month"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var month)
            || year is < 1900 or > 2200 || month is < 1 or > 12) return false;
        value = new(year, month, 1);
        return true;
    }

    [GeneratedRegex(@"(?<year>\d{4})\s*(?:년|[-./])\s*(?<month>\d{1,2})\s*월?", RegexOptions.CultureInvariant)]
    private static partial Regex YearMonthRegex();

    [GeneratedRegex(@"(?:총\s*)?(?<months>\d{1,4})\s*개월", RegexOptions.CultureInvariant)]
    private static partial Regex CreditedMonthsRegex();

    [GeneratedRegex(@"\(\s*(?<age>\d{2,3})\s*세\s*\)", RegexOptions.CultureInvariant)]
    private static partial Regex ClaimAgeRegex();
}
