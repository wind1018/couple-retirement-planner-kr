using System.Net;
using System.Text;
using NpsSimulator.Application;

namespace NpsSimulator.Desktop;

internal static class SelectedStrategyReportFormatter
{
    public static string BuildHtml(SelectedStrategyReport report)
    {
        var html = new StringBuilder();
        html.Append("""
            <!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>국민연금 선택 전략 보고서</title><style>
            body{font-family:'Malgun Gothic',Arial,sans-serif;margin:0;background:#f1f5f9;color:#0f172a;line-height:1.55}.page{max-width:1350px;margin:0 auto;padding:24px}.hero{background:#0f172a;color:#fff;padding:24px 28px;border-radius:12px}
            h1{font-size:26px;margin:0 0 6px}h2{font-size:20px;margin:26px 0 10px}.sub{color:#cbd5e1;font-size:13px}.cards{width:100%;border-spacing:10px;margin:14px -10px}.card{background:#fff;border:1px solid #dbeafe;border-radius:10px;padding:15px;vertical-align:top}.label{font-size:12px;color:#64748b}.money{font-size:22px;font-weight:bold;color:#1d4ed8;margin-top:4px}.detail{font-size:12px;color:#475569}
            table.report{border-collapse:collapse;width:100%;background:#fff;border:1px solid #cbd5e1;font-size:13px}th{background:#e2e8f0;padding:10px 8px;white-space:nowrap}td{padding:10px 8px;border-top:1px solid #e2e8f0;text-align:right}td.left{text-align:left}.positive{color:#047857;font-weight:bold}.negative{color:#b91c1c;font-weight:bold}.neutral{color:#475569}.break{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:15px;color:#1e3a8a}.warning{background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:15px;color:#9a3412;margin-top:20px}
            @media print{body{background:#fff}.page{max-width:none;padding:0}.hero{border-radius:0}}</style></head><body><div class="page">
            """);
        html.Append("<div class=\"hero\"><h1>국민연금 선택 전략 보고서</h1><div class=\"sub\">")
            .Append(H($"{report.GeneratedAt:yyyy-MM-dd HH:mm} · 정책 {report.PolicyPackId} · 입력값은 외부 전송되지 않음"))
            .Append("</div></div><table class=\"cards\"><tr>")
            .Append(Card("정상수령 기준 부부 월 합산", report.BaselineCombinedMonthlyPensionKrw, "두 사람 모두 수령 시작 후"))
            .Append(Card("선택 전략 부부 월 합산", report.SelectedCombinedMonthlyPensionKrw, "두 사람 모두 수령 시작 후·입력 전략 동시 적용"))
            .Append(Card("월 합산 증감", report.SelectedCombinedMonthlyPensionKrw - report.BaselineCombinedMonthlyPensionKrw, "선택 전략 - 정상수령 기준", true))
            .Append(Card("총 추가 납부액", report.TotalAdditionalContributionKrw, "두 사람 합계"))
            .Append("</tr></table>");

        html.Append("<h2>연도별 월 수령액</h2><div class=\"detail\">각 연도의 마지막 수령 상태 기준 · 아직 수령 전인 사람은 0원</div>")
            .Append("<table class=\"report\"><thead><tr><th>연도</th><th>").Append(H(report.Household.PersonA.Alias)).Append("(A)</th><th>")
            .Append(H(report.Household.PersonB.IsIncluded ? report.Household.PersonB.Alias : "배우자(B) 미포함")).Append("</th><th>부부 월 합산</th><th>상태</th></tr></thead><tbody>");
        foreach (var year in report.AnnualTimeline)
        {
            html.Append("<tr><td><b>").Append(year.Year).Append("년</b></td>")
                .Append("<td>").Append(PersonMonthly(year.AgeA, year.MonthlyPensionA)).Append("</td>")
                .Append("<td>").Append(year.AgeB is { } ageB ? PersonMonthly(ageB, year.MonthlyPensionB) : "-").Append("</td>")
                .Append("<td class=\"positive\">").Append(M(year.CombinedMonthlyPensionKrw)).Append("</td>")
                .Append("<td class=\"left\">").Append(H(year.Status)).Append("</td></tr>");
        }
        html.Append("</tbody></table>");

        html.Append("<div class=\"break\"><b>손익분기 판단</b><br>").Append(H(report.BreakEvenDescription)).Append("</div>")
            .Append("<h2>사람별 선택과 계산 결과</h2><table class=\"report\"><thead><tr><th>대상</th><th>임의계속가입</th><th>월 납입액</th><th>수령 선택</th><th>수령 시작</th><th>정상 월연금</th><th>선택 후 월연금</th><th>추가 납부 총액</th></tr></thead><tbody>");
        foreach (var person in report.People)
        {
            html.Append("<tr><td class=\"left\"><b>").Append(H(person.Alias)).Append("</b></td>")
                .Append("<td>").Append(person.HasNationalPension ? $"{person.ContinuationYears}년" : "미가입").Append("</td>")
                .Append("<td>").Append(person.ContinuationYears > 0 ? M(person.ContinuationMonthlyPremiumKrw) : "해당 없음").Append("</td>")
                .Append("<td>").Append(person.HasNationalPension ? H(ClaimChoice(person.ClaimOffsetYears)) : "해당 없음").Append("</td>")
                .Append("<td>").Append(H(person.SelectedClaimMonth.ToString())).Append("</td>")
                .Append("<td>").Append(M(person.BaselineMonthlyPensionKrw)).Append("</td><td>").Append(M(person.SelectedMonthlyPensionKrw)).Append("</td>")
                .Append("<td>").Append(M(person.AdditionalContributionKrw)).Append("</td></tr>");
        }
        html.Append("</tbody></table><h2>본인(A) 생존 나이별 정상수령 대비 가구 누적 차이</h2><table class=\"report\"><thead><tr>");
        foreach (var age in report.DifferencesByAge.Keys) html.Append("<th>").Append(age).Append("세</th>");
        html.Append("</tr></thead><tbody><tr>");
        foreach (var value in report.DifferencesByAge.Values)
        {
            var css = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
            html.Append("<td class=\"").Append(css).Append("\">").Append(H(Signed(value))).Append("</td>");
        }
        html.Append("</tr></tbody></table><div class=\"warning\"><b>계산 가정과 주의사항</b><ul>");
        foreach (var warning in report.Warnings) html.Append("<li>").Append(H(warning)).Append("</li>");
        html.Append("<li>유족연금 결과는 다음 탭에서 같은 선택 전략과 별도 사망 나이를 함께 적용해 계산합니다.</li></ul></div></div></body></html>");
        return html.ToString();
    }

    public static string BuildPlainText(SelectedStrategyReport report)
    {
        var text = new StringBuilder();
        text.AppendLine("국민연금 선택 전략 보고서")
            .AppendLine($"정상수령 기준 부부 월 합산: {M(report.BaselineCombinedMonthlyPensionKrw)}")
            .AppendLine($"선택 전략 부부 월 합산: {M(report.SelectedCombinedMonthlyPensionKrw)}")
            .AppendLine($"총 추가 납부액: {M(report.TotalAdditionalContributionKrw)}")
            .AppendLine($"손익분기: {report.BreakEvenDescription}");
        foreach (var person in report.People)
            text.AppendLine($"{person.Alias}: 임의계속 {person.ContinuationYears}년, 월 {M(person.ContinuationMonthlyPremiumKrw)}, {ClaimChoice(person.ClaimOffsetYears)}, {person.SelectedClaimMonth}부터 월 {M(person.SelectedMonthlyPensionKrw)}");
        foreach (var difference in report.DifferencesByAge)
            text.AppendLine($"본인 {difference.Key}세 기준 누적 차이: {Signed(difference.Value)}");
        foreach (var warning in report.Warnings) text.AppendLine("• " + warning);
        return text.ToString();
    }

    private static string Card(string label, decimal value, string detail, bool signed = false) =>
        $"<td class=\"card\"><div class=\"label\">{H(label)}</div><div class=\"money\">{(signed ? H(Signed(value)) : M(value))}</div><div class=\"detail\">{H(detail)}</div></td>";
    private static string ClaimChoice(int offsetYears) => offsetYears switch
    {
        < 0 => $"{-offsetYears}년 조기수령",
        > 0 => $"{offsetYears}년 연기수령",
        _ => "정상수령"
    };
    private static string PersonMonthly(int age, decimal amount) => $"{age}세&nbsp;&nbsp;<b>{M(amount)}</b>";
    private static string Signed(decimal value) => value switch { > 0 => $"+{value:N0}원", < 0 => $"{value:N0}원", _ => "차이 없음" };
    private static string M(decimal value) => $"{value:N0}원";
    private static string H(string value) => WebUtility.HtmlEncode(value);
}
