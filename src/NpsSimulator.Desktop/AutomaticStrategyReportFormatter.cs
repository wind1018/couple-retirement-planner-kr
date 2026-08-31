using System.Net;
using System.Text;
using NpsSimulator.Application;

namespace NpsSimulator.Desktop;

internal static class AutomaticStrategyReportFormatter
{
    public static string BuildHtml(AutomaticStrategyReport report)
    {
        var html = new StringBuilder();
        html.Append("""
            <!doctype html><html lang="ko"><head><meta charset="utf-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>국민연금 자동 전략 분석 보고서</title>
            <style>
            body{font-family:'Malgun Gothic',Arial,sans-serif;margin:0;background:#f1f5f9;color:#0f172a;line-height:1.55}
            .page{max-width:1500px;margin:0 auto;padding:24px}.hero{background:#0f172a;color:#fff;padding:24px 28px;border-radius:12px}
            h1{font-size:26px;margin:0 0 6px}h2{font-size:20px;margin:26px 0 10px}.sub{color:#cbd5e1;font-size:13px}
            .notice{margin-top:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:14px;color:#1e3a8a}
            .cards{width:100%;border-spacing:10px;margin:12px -10px}.card{background:#fff;border:1px solid #dbeafe;border-radius:9px;padding:13px;vertical-align:top;min-width:190px}
            .card b{color:#1d4ed8}.table-wrap{overflow-x:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px}
            table.report{border-collapse:collapse;width:100%;min-width:1380px;font-size:13px}table.report th{background:#e2e8f0;padding:10px 8px;border-bottom:1px solid #94a3b8;white-space:nowrap}
            table.report td{padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;text-align:right;white-space:nowrap}
            table.report td.left{text-align:left;white-space:normal;min-width:150px}.recommended{background:#eff6ff}.positive{color:#047857;font-weight:bold}.negative{color:#b91c1c;font-weight:bold}.neutral{color:#475569}
            .assumptions{background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:15px;color:#9a3412;margin-top:20px}.small{font-size:12px;color:#64748b}.print-note{margin-top:18px}
            @media print{body{background:#fff}.page{max-width:none;padding:0}.hero{border-radius:0}.table-wrap{overflow:visible}table.report{font-size:9px;min-width:0}.print-note{display:none}}
            </style></head><body><div class="page">
            """);
        html.Append("<div class=\"hero\"><h1>국민연금 자동 전략 분석 보고서</h1><div class=\"sub\">")
            .Append(H(report.GeneratedAt.ToString("yyyy-MM-dd HH:mm")))
            .Append(" 생성 · 적용 정책 ").Append(H(report.PolicyPackId))
            .Append(" · 입력정보는 외부로 전송되지 않음</div></div>");
        html.Append("<div class=\"notice\"><b>읽는 방법</b><br>‘정상수령’을 기준으로 보험료 납부와 연금 수령을 모두 합산했습니다. 초록색은 기준보다 더 받는 금액, 빨간색은 덜 받는 금액입니다. 월별 입출금표 대신 전략 판단에 필요한 손익분기 나이와 생존 나이별 누적 차이만 표시합니다.</div>");

        foreach (var group in report.Rows.GroupBy(row => row.SubjectAlias, StringComparer.Ordinal))
        {
            html.Append("<h2>").Append(H(group.Key)).Append(" 자동 비교 결론</h2><table class=\"cards\"><tr>");
            foreach (var summary in report.BestStrategySummaries.Where(value => value.StartsWith(group.Key + " ", StringComparison.Ordinal)))
                html.Append("<td class=\"card\"><b>").Append(H(summary)).Append("</b></td>");
            html.Append("</tr></table>");
            html.Append("<div class=\"table-wrap\"><table class=\"report\"><thead><tr>")
                .Append("<th>전략</th><th>임의계속가입</th><th>추가 납부액</th><th>수령 시작</th><th>월연금(세전)</th><th>월연금(세후 추정)</th><th>언제 유리한가</th>")
                .Append("<th>75세</th><th>80세</th><th>85세</th><th>90세</th><th>95세</th><th>자동 판정</th></tr></thead><tbody>");
            foreach (var row in group)
            {
                var css = string.IsNullOrWhiteSpace(row.RecommendedForAges) ? string.Empty : " class=\"recommended\"";
                html.Append("<tr").Append(css).Append("><td class=\"left\"><b>").Append(H(row.StrategyName)).Append("</b></td>")
                    .Append("<td>").Append(row.ContinueUntilAgeYears > 60 ? ContinuationText(row) : "없음").Append("</td>")
                    .Append("<td>").Append(Money(row.AdditionalContributionKrw)).Append("</td>")
                    .Append("<td>").Append(H(row.ClaimMonth.ToString())).Append("</td>")
                    .Append("<td>").Append(Money(row.MonthlyPensionGrossKrw)).Append("</td>")
                    .Append("<td>").Append(Money(row.MonthlyPensionNetEstimateKrw)).Append("</td>")
                    .Append("<td class=\"left\"><b>").Append(H(row.AdvantageWindow)).Append("</b></td>")
                    .Append(SignedCell(row.DifferenceAt75Krw)).Append(SignedCell(row.DifferenceAt80Krw))
                    .Append(SignedCell(row.DifferenceAt85Krw)).Append(SignedCell(row.DifferenceAt90Krw)).Append(SignedCell(row.DifferenceAt95Krw))
                    .Append("<td class=\"left\">").Append(H(row.Evaluation)).Append("</td></tr>");
            }
            html.Append("</tbody></table></div>");
        }

        html.Append("<div class=\"assumptions\"><b>계산 가정과 주의사항</b><ul>");
        foreach (var warning in report.Warnings)
            html.Append("<li>").Append(H(warning)).Append("</li>");
        html.Append("<li>세후 금액은 정책 파일의 간이 추정이며 실제 과세·공제 결과와 다를 수 있습니다.</li>")
            .Append("<li>본 보고서는 의사결정 지원용 추정치이며 국민연금공단의 가입 가능 여부와 최종 산정 결과가 우선합니다.</li></ul></div>")
            .Append("<p class=\"small print-note\">HTML로 저장하면 이 화면을 그대로 보관할 수 있으며, 개인 PC의 브라우저에서만 열립니다.</p></div></body></html>");
        return html.ToString();
    }

    public static string BuildPlainText(AutomaticStrategyReport report)
    {
        var text = new StringBuilder();
        text.AppendLine("국민연금 자동 전략 분석 보고서")
            .AppendLine($"적용 정책: {report.PolicyPackId}")
            .AppendLine($"생성: {report.GeneratedAt:yyyy-MM-dd HH:mm}")
            .AppendLine()
            .AppendLine("[생존 나이별 추천]");
        foreach (var summary in report.BestStrategySummaries) text.AppendLine("• " + summary);
        foreach (var group in report.Rows.GroupBy(row => row.SubjectAlias, StringComparer.Ordinal))
        {
            text.AppendLine().AppendLine($"[{group.Key} 전략 비교]");
            foreach (var row in group)
            {
                var continuation = row.ContinueUntilAgeYears > 60
                    ? $"기준소득 {Money(row.ContinuationStandardMonthlyIncomeKrw)}, {row.ContinueUntilAgeYears}세까지 보험료 {PremiumRange(row)}"
                    : "없음";
                text.AppendLine($"• {row.StrategyName} | 임의계속 {continuation} | 추가납부 {Money(row.AdditionalContributionKrw)} | {row.ClaimMonth} 수령 | 월 세전 {Money(row.MonthlyPensionGrossKrw)} | {row.AdvantageWindow}");
                text.AppendLine($"  정상수령 대비: 75세 {Signed(row.DifferenceAt75Krw)}, 80세 {Signed(row.DifferenceAt80Krw)}, 85세 {Signed(row.DifferenceAt85Krw)}, 90세 {Signed(row.DifferenceAt90Krw)}, 95세 {Signed(row.DifferenceAt95Krw)}");
            }
        }
        text.AppendLine().AppendLine("[계산 가정과 주의사항]");
        foreach (var warning in report.Warnings) text.AppendLine("• " + warning);
        text.AppendLine("• 본 보고서는 의사결정 지원용 추정치이며 국민연금공단의 최종 산정 결과가 우선합니다.");
        return text.ToString();
    }

    public static string Signed(decimal value) => value switch
    {
        > 0 => $"+{value:N0}원",
        < 0 => $"{value:N0}원",
        _ => "차이 없음"
    };

    private static string SignedCell(decimal value)
    {
        var css = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
        return $"<td class=\"{css}\">{H(Signed(value))}</td>";
    }

    private static string Money(decimal value) => $"{value:N0}원";
    private static string PremiumRange(AutomaticStrategyRow row) => row.ContinuationMonthlyPremiumKrw == row.ContinuationFinalMonthlyPremiumKrw
        ? Money(row.ContinuationMonthlyPremiumKrw)
        : $"{Money(row.ContinuationMonthlyPremiumKrw)} → {Money(row.ContinuationFinalMonthlyPremiumKrw)}";
    private static string ContinuationText(AutomaticStrategyRow row) =>
        $"기준소득 {Money(row.ContinuationStandardMonthlyIncomeKrw)}<br>{row.ContinueUntilAgeYears}세까지<br>월 {PremiumRange(row)}";
    private static string H(string value) => WebUtility.HtmlEncode(value);
}
