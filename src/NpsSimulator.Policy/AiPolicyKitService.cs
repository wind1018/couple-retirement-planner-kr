using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace NpsSimulator.Policy;

public sealed class AiPolicyKitService
{
    private static readonly string[] ForbiddenPersonalKeys =
    [
        "\"name\"", "\"birthDate\"", "\"profileId\"", "\"expectedPension\"",
        "\"contributionHistory\"", "\"reportPath\""
    ];

    public void ExportUpdateKit(string destinationPath, PolicyPack currentPack, string guideMarkdown)
    {
        var snapshot = PolicyJson.SerializePack(currentPack);
        EnsureNoPersonalData(snapshot);

        using var file = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
        using var archive = new ZipArchive(file, ZipArchiveMode.Create);
        AddText(archive, "AI_POLICY_UPDATE_GUIDE.md", guideMarkdown);
        AddText(archive, "current-policy.snapshot.json", snapshot);
        AddText(archive, "policy-update.schema.json", PolicyUpdateSchema);
        AddText(archive, "allowed-rule-catalog.json", AllowedRuleCatalog);
        AddText(archive, "immutable-validation-summary.json", ImmutableValidationSummary);
        AddText(archive, "example-policy-update.json", ExamplePolicyUpdate(currentPack.PolicyPackId));
        AddText(archive, "POLICY_CHANGE_REQUEST_TEMPLATE.md", ChangeRequestTemplate);
    }

    public void ExportFixKit(
        string destinationPath,
        string rejectedPolicyJson,
        IReadOnlyList<PolicyValidationIssue> issues,
        PolicyPack currentPack)
    {
        EnsureNoPersonalData(rejectedPolicyJson);
        var errorDocument = JsonSerializer.Serialize(new
        {
            validatorVersion = "1.0.0",
            errors = issues.Select(issue => new
            {
                code = issue.Code,
                ruleId = issue.RuleId,
                message = issue.Message,
                severity = issue.IsError ? "ERROR" : "WARNING"
            })
        }, PolicyJson.Options);

        using var file = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
        using var archive = new ZipArchive(file, ZipArchiveMode.Create);
        AddText(archive, "AI_POLICY_FIX_GUIDE.md", FixGuide);
        AddText(archive, "rejected-policy-update.json", rejectedPolicyJson);
        AddText(archive, "validation-errors.json", errorDocument);
        AddText(archive, "policy-update.schema.json", PolicyUpdateSchema);
        AddText(archive, "allowed-rule-catalog.json", AllowedRuleCatalog);
        AddText(archive, "current-policy.snapshot.json", PolicyJson.SerializePack(currentPack));
    }

    private static void AddText(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content);
    }

    private static void EnsureNoPersonalData(string content)
    {
        var found = ForbiddenPersonalKeys.FirstOrDefault(key => content.Contains(key, StringComparison.OrdinalIgnoreCase));
        if (found is not null)
        {
            throw new InvalidOperationException($"AI 정책 키트에 개인 프로필 필드가 포함될 수 없습니다: {found}");
        }
    }

    private static string ExamplePolicyUpdate(string basePolicyPackId) => $$"""
    {
      "schemaVersion": "1.0.0",
      "policyPackId": "KR-NPS-USER-YYYYMMDD-001",
      "basePolicyPackId": "{{basePolicyPackId}}",
      "createdAt": "2026-08-29T15:00:00+09:00",
      "createdBy": "AI_ASSISTED",
      "legalStatus": "ENACTED",
      "changes": [
        {
          "operation": "ADD_RULE_VERSION",
          "ruleId": "standardIncome.limits",
          "validFrom": "2026-07-01",
          "validToExclusive": "2027-07-01",
          "applicationClock": "CONTRIBUTION_MONTH",
          "value": { "minimumKrw": 410000, "maximumKrw": 6590000 },
          "legalSourceIds": ["MOHW-NPS-LIMITS-2026"]
        }
      ],
      "legalSources": [
        {
          "id": "MOHW-NPS-LIMITS-2026",
          "publisher": "보건복지부",
          "title": "공식 자료 제목",
          "url": "https://www.mohw.go.kr/...",
          "publishedDate": null,
          "effectiveDate": "2026-07-01",
          "article": null
        }
      ],
      "unresolvedItems": [],
      "engineUpgradeRequired": []
    }
    """;

    public const string AllowedRuleCatalog = """
    {
      "catalogVersion": "1.0.0",
      "rules": [
        { "ruleId": "contribution.rate.total", "applicationClock": "CONTRIBUTION_MONTH", "valueType": "ContributionRateValue" },
        { "ruleId": "standardIncome.limits", "applicationClock": "CONTRIBUTION_MONTH", "valueType": "StandardIncomeLimitValue" },
        { "ruleId": "voluntaryContinuation.standardIncomeChoices", "applicationClock": "CONTRIBUTION_MONTH", "valueType": "VoluntaryContinuationIncomeValue" },
        { "ruleId": "oldAge.normalClaimAge", "applicationClock": "BIRTH_COHORT", "valueType": "ClaimAgeValue" },
        { "ruleId": "earlyPension.maximumMonths", "valueType": "IntegerValue" },
        { "ruleId": "earlyPension.reductionPerMonth", "valueType": "RationalValue" },
        { "ruleId": "deferredPension.maximumMonths", "valueType": "IntegerValue" },
        { "ruleId": "deferredPension.bonusPerMonth", "valueType": "RationalValue" },
        { "ruleId": "qualification.minimumContributionMonths", "valueType": "IntegerValue" },
        { "ruleId": "backPayment.maximumMonths", "valueType": "IntegerValue" },
        { "ruleId": "duplicateBenefit.survivorAdditionalRate", "valueType": "RationalValue" },
        { "ruleId": "survivorBenefit.oldAgeBaseRate", "valueType": "RationalValue" },
        { "ruleId": "survivorBenefit.oldAgeAdditionalRatePerMonth", "valueType": "RationalValue" },
        { "ruleId": "survivorBenefit.pensionRateTiers", "valueType": "SurvivorPensionRateTiersValue" },
        { "ruleId": "survivorBenefit.capAtDeceasedOldAgePension", "valueType": "BooleanValue" },
        { "ruleId": "pensionIncomeTax.estimation", "valueType": "PensionIncomeTaxPolicy" }
      ]
    }
    """;

    public const string PolicyUpdateSchema = """
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "NPS Policy Update",
      "type": "object",
      "additionalProperties": false,
      "required": ["schemaVersion", "policyPackId", "basePolicyPackId", "createdAt", "createdBy", "legalStatus", "changes", "legalSources", "unresolvedItems", "engineUpgradeRequired"],
      "properties": {
        "schemaVersion": { "const": "1.0.0" },
        "policyPackId": { "type": "string", "minLength": 3 },
        "basePolicyPackId": { "type": "string", "minLength": 3 },
        "createdAt": { "type": "string", "format": "date-time" },
        "createdBy": { "const": "AI_ASSISTED" },
        "legalStatus": { "enum": ["ENACTED", "ANNOUNCED", "DRAFT", "SCENARIO"] },
        "changes": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/change" } },
        "legalSources": { "type": "array" },
        "unresolvedItems": { "type": "array", "items": { "type": "string" } },
        "engineUpgradeRequired": { "type": "array", "items": { "type": "string" } }
      },
      "$defs": {
        "change": {
          "type": "object",
          "additionalProperties": false,
          "required": ["operation", "ruleId", "validFrom", "validToExclusive", "applicationClock", "value", "legalSourceIds"],
          "properties": {
            "operation": { "const": "ADD_RULE_VERSION" },
            "ruleId": { "type": "string" },
            "validFrom": { "type": ["string", "null"], "format": "date" },
            "validToExclusive": { "type": ["string", "null"], "format": "date" },
            "applicationClock": { "type": ["string", "null"] },
            "value": { "type": "object" },
            "legalSourceIds": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    }
    """;

    private const string ImmutableValidationSummary = """
    {
      "validatorVersion": "1.0.0",
      "checks": [
        "strict-json-contract",
        "known-rule-id",
        "engine-compatibility",
        "timeline-overlap-and-gap",
        "rational-and-money-range",
        "official-source-metadata",
        "immutable-core-regression",
        "synthetic-impact-analysis"
      ],
      "note": "정책 파일은 이 검증 목록이나 구현을 변경할 수 없습니다."
    }
    """;

    private const string ChangeRequestTemplate = """
    # 정책 변경 요청

- 정책 기준일: YYYY-MM-DD
- 확인 대상: 국민연금 전체 정책
- 포함 범위: 공포·시행이 확정된 정책만
- 제외 범위: 개인 프로필 및 실제 시뮬레이션 데이터

첨부한 가이드와 현재 정책 스냅샷, Schema를 기준으로 공식 출처를 확인해
`policy-update.json`과 `POLICY_UPDATE_REPORT.md`를 만들어 주세요.
불확실한 값은 추측하지 말고 `unresolvedItems`에 기록해 주세요.
""";

    private const string FixGuide = """
    # AI 정책 파일 수정 지침

`validation-errors.json`의 오류만 수정해 `policy-update.json`을 다시 작성하세요.
법적 값이나 공식 출처를 임의로 바꾸지 마세요. 근거가 부족하면 `unresolvedItems`에 기록하세요.
실행 코드, 스크립트, 개인정보를 추가하지 마세요.
""";
}
