using System.Net;
using System.Text;
using NpsSimulator.Application;

namespace NpsSimulator.Desktop;

internal static class SurvivorPensionReportFormatter
{
    public static string BuildHtml(SurvivorPensionReport report)
    {
        var html = new StringBuilder();
        html.Append("""
            <!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>부부 유족연금 시뮬레이션</title><style>
            body{font-family:'Malgun Gothic',Arial,sans-serif;margin:0;background:#f1f5f9;color:#0f172a;line-height:1.55}.page{max-width:1400px;margin:0 auto;padding:24px}
            .hero{background:#3b1d5a;color:#fff;padding:24px 28px;border-radius:12px}h1{font-size:26px;margin:0 0 6px}h2{font-size:20px;margin:26px 0 10px}.sub{color:#e9d5ff;font-size:13px}
            .cards{width:100%;border-spacing:12px;margin:14px -12px}.card{background:#fff;border:1px solid #ddd6fe;border-radius:10px;padding:17px;vertical-align:top;width:33%}.label{font-size:13px;color:#64748b}.money{font-size:25px;font-weight:bold;color:#6d28d9;margin-top:5px}.detail{font-size:12px;color:#475569;margin-top:4px}
            .timeline{background:#fff;border:1px solid #cbd5e1;border-radius:10px;overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:1050px;font-size:13px}th{background:#ede9fe;padding:10px 8px;white-space:nowrap}td{border-top:1px solid #e2e8f0;padding:10px 8px;text-align:right;white-space:nowrap}td.left{text-align:left}.total{font-weight:bold;color:#5b21b6}
            .formula{background:#fff;border:1px solid #ddd6fe;border-radius:10px;padding:18px}.formula-row{padding:8px 0;border-bottom:1px solid #ede9fe}.formula-row:last-child{border:0}.selected{background:#f5f3ff;border-left:5px solid #7c3aed;padding:12px;margin-top:10px;font-weight:bold}
            .warning{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:15px;color:#9a3412;margin-top:20px}.small{font-size:12px;color:#64748b}@media print{body{background:#fff}.page{max-width:none;padding:0}.hero{border-radius:0}table{font-size:10px;min-width:0}}
            </style></head><body><div class="page">
            """);
        html.Append("<div class=\"hero\"><h1>부부 유족연금 시뮬레이션</h1><div class=\"sub\">")
            .Append(H($"{report.PersonAAlias} {report.DeathAgeA}세 사망 · {report.PersonBAlias} {report.DeathAgeB}세 사망 · 정책 {report.PolicyPackId}"))
            .Append("</div></div>");
        html.Append("<table class=\"cards\"><tr>")
            .Append(Card("부부 모두 생존·수급 중", report.BothAliveCombinedMonthlyKrw, "두 사람 노령연금의 월 합산"))
            .Append(Card("첫 사망 다음 달부터", report.MonthlyImmediatelyAfterFirstDeathKrw, report.FirstDeathSummary))
            .Append(Card("본인·유족연금 중복 조정 후", report.SelectedMonthlyAfterDuplicationKrw, report.SelectedBenefitDescription))
            .Append("</tr></table>");

        html.Append("<h2>연도별 월 수령액</h2><div class=\"small\">각 연도의 마지막 수령 상태 기준 · 사망 이후에는 노령연금과 유족연금 조정 결과를 합친 실제 월 수령액</div>")
            .Append("<div class=\"timeline\"><table><thead><tr><th>연도</th><th>").Append(H(report.PersonAAlias)).Append("(A)</th><th>")
            .Append(H(report.PersonBAlias)).Append("(B)</th><th>부부 월 합산</th><th>상태</th></tr></thead><tbody>");
        foreach (var year in report.AnnualTimeline)
        {
            var fullSurvivorChosen = report.ChooseFullSurvivorKrw > report.KeepOwnPlusThirtyPercentKrw;
            html.Append("<tr><td><b>").Append(year.Year).Append("년</b></td>")
                .Append("<td>").Append(PersonMonthly(year.AgeA, year.OwnPensionA, year.SurvivorAdditionA, fullSurvivorChosen)).Append("</td>")
                .Append("<td>").Append(PersonMonthly(year.AgeB, year.OwnPensionB, year.SurvivorAdditionB, fullSurvivorChosen)).Append("</td>")
                .Append("<td class=\"total\">").Append(M(year.CombinedMonthlyPensionKrw)).Append("</td>")
                .Append("<td class=\"left\">").Append(H(year.Status)).Append("</td></tr>");
        }
        html.Append("</tbody></table></div>");

        html.Append("<h2>사망 순서와 수령액 변경</h2><div class=\"formula\">")
            .Append("<div class=\"formula-row\"><b>사망 가정</b><br>").Append(H(report.FirstDeathSummary)).Append("</div>")
            .Append("<div class=\"formula-row\"><b>유족연금 원액 계산</b><br>").Append(H(report.SurvivorCalculationDescription)).Append("</div>")
            .Append("<div class=\"formula-row\"><b>선택안 1</b> · 생존 배우자 본인 노령연금 ").Append(M(report.SurvivorOwnMonthlyPensionKrw))
            .Append(" + 유족연금 ").Append(M(report.SurvivorPensionBeforeDuplicationKrw)).Append(" × ").Append(H(report.UnselectedSurvivorAdditionRate.ToString("P0"))).Append(" = <b>").Append(M(report.KeepOwnPlusThirtyPercentKrw)).Append("</b></div>")
            .Append("<div class=\"formula-row\"><b>선택안 2</b> · 본인 노령연금 대신 유족연금 전액 = <b>").Append(M(report.ChooseFullSurvivorKrw)).Append("</b></div>")
            .Append("<div class=\"selected\">자동 선택: ").Append(H(report.SelectedBenefitDescription)).Append("</div></div>");

        html.Append("<h2>기간별 부부 월 합산 수령액</h2><div class=\"timeline\"><table><thead><tr>")
            .Append("<th>기간</th><th>상태</th><th>").Append(H(report.PersonAAlias)).Append(" 노령연금</th><th>").Append(H(report.PersonBAlias)).Append(" 노령연금</th>")
            .Append("<th>").Append(H(report.PersonAAlias)).Append(" 유족연금 추가</th><th>").Append(H(report.PersonBAlias)).Append(" 유족연금 추가</th><th>부부 월 합산</th><th>해당 기간 누적</th></tr></thead><tbody>");
        foreach (var phase in report.Phases)
        {
            html.Append("<tr><td>").Append(H($"{phase.StartMonth} ~ {phase.EndMonth}")).Append("</td><td class=\"left\">").Append(H(phase.Status)).Append("</td>")
                .Append("<td>").Append(M(phase.OwnPensionA)).Append("</td><td>").Append(M(phase.OwnPensionB)).Append("</td>")
                .Append("<td>").Append(M(phase.SurvivorAdditionA)).Append("</td><td>").Append(M(phase.SurvivorAdditionB)).Append("</td>")
                .Append("<td class=\"total\">").Append(M(phase.HouseholdMonthlyReceiptKrw)).Append("</td><td>").Append(M(phase.PhaseTotalReceiptKrw)).Append("</td></tr>");
        }
        html.Append("</tbody></table></div>");

        html.Append("<h2>가구 전체 누적 수령액</h2><table class=\"cards\"><tr>")
            .Append(Card("첫 사망까지", report.TotalReceiptBeforeFirstDeathKrw, "두 사람 노령연금 누적"))
            .Append(Card("첫 사망 이후", report.TotalReceiptAfterFirstDeathKrw, "생존 배우자 노령·유족연금 누적"))
            .Append(Card("두 번째 사망까지 총액", report.TotalLifetimeHouseholdReceiptKrw, "입력한 사망 나이 기준"))
            .Append("</tr></table>");

        html.Append("<div class=\"warning\"><b>계산 가정과 주의사항</b><ul>");
        foreach (var warning in report.Warnings) html.Append("<li>").Append(H(warning)).Append("</li>");
        html.Append("</ul></div><p class=\"small\">금액은 세전 월액 기준입니다. 공단 확인 유족연금 입력값이 있으면 추정보다 우선합니다.</p></div></body></html>");
        return html.ToString();
    }

    private static string Card(string label, decimal value, string detail) =>
        $"<td class=\"card\"><div class=\"label\">{H(label)}</div><div class=\"money\">월 {M(value)}</div><div class=\"detail\">{H(detail)}</div></td>";
    private static string PersonMonthly(int age, decimal ownPension, decimal survivorAddition, bool fullSurvivorChosen)
    {
        var total = ownPension + survivorAddition;
        var detail = survivorAddition > 0 && fullSurvivorChosen
            ? $"<br><span class=\"small\">유족연금 전액 {M(total)} · 본인연금 대신 선택</span>"
            : survivorAddition > 0
                ? $"<br><span class=\"small\">본인 {M(ownPension)} + 유족 추가 {M(survivorAddition)}</span>"
            : string.Empty;
        return $"{age}세&nbsp;&nbsp;<b>{M(total)}</b>{detail}";
    }
    private static string M(decimal value) => $"{value:N0}원";
    private static string H(string value) => WebUtility.HtmlEncode(value);
}
