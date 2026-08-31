# 국민연금 시뮬레이터 정책 분리 설계안

> 분석 대상: `CODEX_국민연금_부부_종합_시뮬레이터_개발명세.md`
>
> 분석 기준일: 2026-08-29
>
> 이 문서는 첨부 명세 안의 작업 지시를 실행한 결과가 아니라, 사용자의 요청에 따라 명세의 정책 관리 구조를 검토하고 보완한 제안서다.

## 1. 결론

기존 명세의 `RuleSet` 분리 방향은 옳다. 다만 현재 제시된 `kr-nps-2026.json` 같은 연도별 단일 파일 구조만으로는 실제 제도 변경을 안전하게 반영하고 과거 계산을 재현하기 어렵다.

권장 구조는 다음과 같다.

- 사용자에게는 하나의 논리적 **Policy Pack**으로 보이게 한다.
- 내부에서는 보험료, 급여, 추납, 수급 자격, 유족급여, 고시값을 도메인별 파일로 나눈다.
- 각 규칙에 효력기간뿐 아니라 **어떤 날짜를 기준으로 적용하는지**를 기록한다.
- 정책 파일은 수정하지 않고 새 버전을 추가하는 불변 방식으로 관리한다.
- JSON Schema 검증, 정책 간 충돌 검사, Golden Test, 변경 영향 분석, 전자서명 검증을 통과한 팩만 활성화한다.
- 계산 결과에는 Policy Pack ID와 파일 해시를 저장하여 과거 결과를 항상 재현할 수 있게 한다.

이 구조를 적용하면 보험료율·상하한·A값·감액률·자격조건·경과규정 등 기존 정책 언어로 표현 가능한 변경은 애플리케이션 재배포 없이 정책 팩 교체만으로 반영할 수 있다.

단, 완전히 새로운 급여 종류나 현재 정책 표현식이 지원하지 않는 계산 개념이 법에 신설되면 엔진 및 정책 스키마의 버전 상승이 필요하다. “어떤 법 개정이든 무조건 파일만 바꾸면 된다”는 목표는 안전하지 않으므로 지원 경계를 명시해야 한다.

## 2. 기존 명세 평가

### 잘 설계된 부분

- 법정 파라미터 하드코딩 금지
- 월 단위 타임라인과 현금흐름 원장
- 과거 기간에는 당시 규칙을 적용한다는 원칙
- `appliedRuleSetIds`를 결과에 저장하는 재현성 요구
- Anchor Mode와 Full Formula Mode 분리
- 추정값과 공단 확인값의 구분
- 법령 변경에 대한 Golden Test 요구

### 보완이 필요한 부분

1. `PensionRuleResolver.resolve(date)`는 적용 기준을 지나치게 단순화한다.
   - 가입월, 신청일, 납부기한월, 실제 납부월, 수급권 발생일, 사망일 등 서로 다른 기준시점이 존재한다.
2. `effectiveFrom/effectiveTo`만으로는 경과조치와 출생 코호트 조건을 표현하기 어렵다.
3. 한 해 중 7월에 바뀌는 기준소득월액 상·하한처럼 연도 단위 파일명과 실제 효력기간이 일치하지 않는다.
4. 유족연금·중복급여·소득 있는 업무 감액은 단일 숫자가 아니라 조건표와 계산식이다.
5. 법령, 시행령, 고시, 공단 안내의 출처와 검증 상태를 추적하는 필드가 없다.
6. 잘못된 정책 파일의 즉시 반영을 막는 스키마 검증, 충돌 검사, 승인, 롤백 규칙이 없다.
7. 과거 파일을 덮어쓰면 이미 발행한 리포트를 재현할 수 없다.
8. 공식 정책과 사용자가 가정한 미래 정책이 섞일 위험이 있다.
9. 정책 파일과 계산 엔진의 호환성 계약이 없다.
10. 금액의 절사·반올림 순서와 단위를 정책으로 표현하는 공통 규약이 없다.

## 3. 권장 개념: Policy Pack

Policy Pack은 특정 시점까지 공표된 국민연금 정책을 계산 가능한 형태로 묶은 불변 배포 단위다.

예시 구조:

```text
data/
└─ policies/
   ├─ schemas/
   │  ├─ policy-manifest.schema.json
   │  ├─ timeline-rule.schema.json
   │  ├─ decision-table.schema.json
   │  └─ formula.schema.json
   ├─ packs/
   │  └─ kr-nps/
   │     └─ 2026.08.1/
   │        ├─ manifest.json
   │        ├─ contribution-rates.json
   │        ├─ standard-income-limits.json
   │        ├─ old-age-pension.json
   │        ├─ early-and-deferred-pension.json
   │        ├─ back-payment.json
   │        ├─ survivor-and-duplicate-benefits.json
   │        ├─ credits.json
   │        ├─ earned-income-adjustment.json
   │        ├─ indexation.json
   │        ├─ legal-sources.json
   │        ├─ policy-tests.json
   │        └─ signature.json
   ├─ active-policy.json
   └─ registry.json
```

관리 화면이나 업데이트 API에서는 이 디렉터리를 하나의 `.npspolicy` 압축 파일로 취급할 수 있다. 즉, 논리적으로는 정책 파일 하나지만 저장소에서는 리뷰와 충돌 방지를 위해 도메인별로 분리한다.

## 4. Manifest 설계

```json
{
  "schemaVersion": "1.0.0",
  "policyPackId": "KR-NPS-2026.08.1",
  "jurisdiction": "KR",
  "program": "NPS",
  "status": "ENACTED",
  "publishedAt": "2026-08-20T09:00:00+09:00",
  "supersedes": "KR-NPS-2026.07.0",
  "minimumEngineVersion": "1.3.0",
  "maximumEngineVersionExclusive": "2.0.0",
  "defaultCurrency": "KRW",
  "defaultTimeZone": "Asia/Seoul",
  "monthlyBoundaryRule": "CALENDAR_MONTH",
  "files": [
    {
      "path": "contribution-rates.json",
      "sha256": "..."
    }
  ],
  "releaseNotes": [
    "2026-07 기준소득월액 상·하한 반영"
  ]
}
```

`status`는 최소 다음을 구분한다.

- `ENACTED`: 공포되어 효력이 확정된 공식 정책
- `ANNOUNCED`: 공식 발표되었으나 시행 전인 정책
- `DRAFT`: 입법예고·법안 등 확정되지 않은 정책
- `SCENARIO`: 사용자가 만드는 가정 정책
- `REVOKED`: 오류 또는 철회로 사용 중지된 팩

기본 계산은 `ENACTED`만 사용한다. `ANNOUNCED`와 `SCENARIO`를 사용한 결과에는 “확정 정책이 아닌 가정” 배지를 붙인다.

## 5. 규칙 공통 모델

모든 규칙은 최소한 다음 필드를 갖는다.

```json
{
  "ruleId": "contribution.rate.total",
  "ruleVersion": 1,
  "validFrom": "2026-01-01",
  "validToExclusive": "2027-01-01",
  "applicationClock": "CONTRIBUTION_MONTH",
  "priority": 100,
  "when": {
    "memberType": ["WORKPLACE", "REGIONAL", "VOLUNTARY", "VOLUNTARY_CONTINUED"]
  },
  "value": {
    "type": "RATIONAL",
    "numerator": 95,
    "denominator": 1000
  },
  "rounding": {
    "mode": "TRUNCATE",
    "unitKrw": 10,
    "stage": "AFTER_MULTIPLICATION"
  },
  "legalSourceIds": ["NPS-REFORM-2025", "NPA-20903-ART88-SUPP4"],
  "verification": {
    "status": "VERIFIED",
    "verifiedAt": "2026-08-20",
    "verifiedBy": "policy-maintainer"
  }
}
```

중요 원칙:

- 비율은 부동소수점 대신 정수 분수 또는 basis point 형태로 저장한다.
- 종료일은 포함 여부가 모호하지 않도록 `validToExclusive`를 사용한다.
- 금액 절사·반올림은 계산식과 별도로 명시한다.
- 동일 조건에서 같은 우선순위 규칙이 둘 이상 매칭되면 계산을 중단한다. 임의로 하나를 고르면 안 된다.
- 법적 근거가 없는 규칙은 `UNVERIFIED`로 표시하고 공식 모드에서 사용할 수 없게 한다.

## 6. 적용 기준일(applicationClock)

하나의 `resolve(date)` 대신 다음과 같은 정책 컨텍스트를 사용한다.

```ts
interface PolicyContext {
  contributionMonth?: YearMonth;
  coveredMonth?: YearMonth;
  applicationDate?: LocalDate;
  dueMonth?: YearMonth;
  paymentDate?: LocalDate;
  entitlementDate?: LocalDate;
  claimDate?: LocalDate;
  deathDate?: LocalDate;
  birthDate?: LocalDate;
  memberType?: MemberType;
}
```

권장 적용 시계:

| 값 | 의미 | 대표 사용처 |
|---|---|---|
| `CONTRIBUTION_MONTH` | 정기 보험료가 부과되는 월 | 일반 보험료율 |
| `COVERED_MONTH` | 가입기간으로 인정될 과거 월 | 과거 가입기간 산식 |
| `APPLICATION_DATE` | 신청일 | 신청 자격 |
| `DUE_MONTH` | 납부기한이 속하는 월 | 추납 보험료율 |
| `PAYMENT_DATE` | 실제 납부일 | 추납에 적용할 소득대체율 등 |
| `ENTITLEMENT_DATE` | 수급권 발생일 | 노령·유족급여 자격 |
| `CLAIM_DATE` | 청구일 | 청구 시 적용되는 절차 규정 |
| `DEATH_DATE` | 사망일 | 유족급여 전환 |
| `BIRTH_COHORT` | 출생일/출생연도 | 정상 수급연령 |

Resolver 예시:

```ts
policyResolver.resolve("backPayment.contributionRate", {
  applicationDate,
  dueMonth,
  paymentDate,
  memberType
});
```

Resolver의 반환값에는 값만 주지 말고 추적정보를 함께 포함한다.

```ts
interface ResolvedPolicyValue<T> {
  value: T;
  policyPackId: string;
  ruleId: string;
  legalSourceIds: string[];
  matchedBy: Record<string, unknown>;
  warnings: string[];
}
```

## 7. 정책 표현 방식

### 7.1 시계열 값

보험료율, A값, 상·하한, 물가변동률처럼 날짜에 따라 값이 바뀌는 항목이다.

```json
{
  "ruleSet": "contribution-rate",
  "entries": [
    {
      "validFrom": "2026-01-01",
      "validToExclusive": "2027-01-01",
      "applicationClock": "CONTRIBUTION_MONTH",
      "rate": { "numerator": 95, "denominator": 1000 }
    }
  ]
}
```

### 7.2 조건표

출생연도별 정상 수급연령, 가입자 유형별 부담 주체, 중복급여 선택처럼 조건이 여러 개인 항목은 decision table로 관리한다.

```json
{
  "tableId": "old-age.normal-claim-age",
  "hitPolicy": "UNIQUE",
  "rows": [
    {
      "when": { "birthYear": { "gte": 1969 } },
      "then": { "ageMonths": 780 },
      "legalSourceIds": ["NPA-ARTICLE-61"]
    }
  ]
}
```

### 7.3 제한된 계산식 DSL

계산식은 JavaScript, C# 코드 문자열이나 `eval`로 넣지 않는다. 허용된 연산만 있는 AST 또는 제한된 DSL을 사용한다.

```json
{
  "formulaId": "early-pension-adjustment",
  "inputs": ["baseMonthlyPension", "earlyMonths"],
  "expression": {
    "op": "multiply",
    "args": [
      { "var": "baseMonthlyPension" },
      {
        "op": "subtract",
        "args": [
          1,
          {
            "op": "multiply",
            "args": [
              { "var": "earlyMonths" },
              { "rule": "earlyPension.reductionPerMonth" }
            ]
          }
        ]
      }
    ]
  }
}
```

허용 연산, 타입, 범위, 반올림 위치를 스키마에서 제한해야 한다. 정책 팩은 데이터이면서도 계산 결과를 바꿀 수 있으므로 실행 코드와 같은 수준으로 검토한다.

### 7.4 경과조치

법 개정 전 가입기간에는 종전 규정을 적용하는 사례를 표현하기 위해 다음 조건을 지원한다.

- `coveredMonth` 범위
- `entitlementDate` 범위
- 출생 코호트
- 가입자 유형
- 기존 수급권 보유 여부
- 신청일·납부기한·실제 납부일 조합
- 선행 정책에서 승계할 rule ID

경과조치는 일반 규칙보다 우선순위가 높고, 매칭 이유가 결과 설명에 남아야 한다.

## 8. 계산 엔진과 정책 파일의 경계

### 정책 파일만 바꾸어 처리할 수 있는 변경

- 보험료율과 사용자/가입자 분담률 변경
- 기준소득월액 상·하한 변경
- A값, 재평가율, 물가연동 값 변경
- 조기 감액률, 연기 가산률, 최대 개월 변경
- 최소 가입기간, 추납 최대 개월 변경
- 출생연도별 수급연령 변경
- 기존 입력변수로 표현 가능한 자격조건 변경
- 기존 DSL로 표현 가능한 급여 계산식과 중복조정 변경
- 시행일과 경과조치 변경

### 엔진 또는 스키마 변경이 필요한 경우

- 새로운 급여 종류 또는 새로운 가입 상태가 신설됨
- 일 단위 계산처럼 월 단위 원장 자체가 바뀜
- 현재 수집하지 않는 새 개인정보·소득정보가 자격요건에 필요함
- DSL에 없는 반복, 누적, 외부지표 조회 방식이 필요함
- 결과 모델이나 리포트에 새로운 법정 구분을 반드시 저장해야 함

이 경우 새 `schemaVersion`과 `minimumEngineVersion`을 발행하고, 구버전 앱은 해당 정책 팩 활성화를 거부하면서 업데이트 필요 사유를 보여준다.

## 9. 업데이트 방식

### 9.1 수동 업데이트 — MVP 권장

1. 정책 담당자가 새 팩을 별도 버전으로 작성한다.
2. 공식 법령·고시·공단 자료 URL과 공포/시행일을 등록한다.
3. `policy validate`로 JSON Schema, 필수 출처, 타입, 날짜를 검사한다.
4. `policy lint`로 기간 공백·중복·도달 불가능 조건·모순을 검사한다.
5. `policy test`로 정책 자체 테스트와 계산 엔진 Golden Test를 실행한다.
6. `policy impact`로 기존 활성 팩과 결과 차이를 비교한다.
7. 검토자가 변경 요약을 승인하고 팩에 서명한다.
8. 관리 화면에서 `.npspolicy` 파일을 업로드한다.
9. 앱이 해시·서명·엔진 호환성을 다시 검증한다.
10. 즉시 또는 예약한 효력일에 원자적으로 활성화한다.
11. 문제가 있으면 `active-policy.json` 포인터만 이전 팩으로 되돌린다.

활성화 전에 보여줄 영향 요약 예:

```text
KR-NPS-2026.07.0 → KR-NPS-2026.08.1

변경 규칙: 3개
- standardIncome.minimum: 400,000 → 410,000
- standardIncome.maximum: 6,370,000 → 6,590,000
- legal source metadata: 1건 추가

영향 샘플: 42/500건
최대 월 보험료 차이: +20,900원
과거 확정기간 재계산: 없음
검증: 128/128 통과
```

### 9.2 자동 업데이트 — 운영 단계

- 앱은 HTTPS 정책 레지스트리의 `registry.json`만 주기적으로 확인한다.
- ETag/If-None-Match로 불필요한 다운로드를 줄인다.
- 새 팩을 임시 영역에 받은 뒤 SHA-256과 공개키 서명을 검증한다.
- 검증과 테스트가 끝나기 전에는 활성 팩을 교체하지 않는다.
- 같은 팩을 반복 적용해도 결과가 같은 idempotent 방식으로 동작한다.
- `security patch`는 자동 활성화할 수 있지만 계산 결과를 바꾸는 `policy change`는 기본적으로 관리자 승인을 받는다.
- 업데이트 실패 시 현재 활성 팩을 그대로 유지하고 관리자에게 원인만 알린다.
- 마지막으로 정상 동작한 최소 2개 팩을 로컬에 보존한다.

### 9.3 개발 저장소에서의 권장 명령 계약

실제 기술 스택에 맞춰 명령은 바꿀 수 있지만 다음 역할은 고정한다.

```text
policy validate <pack>
policy lint <pack>
policy test <pack>
policy impact --from <old> --to <new>
policy pack <directory>
policy sign <pack>
policy install <pack>
policy activate <policyPackId>
policy rollback <policyPackId>
```

## 10. 검증 게이트

정책 팩 활성화에는 다음 검사가 모두 필요하다.

### 구조 검증

- JSON Schema 일치
- 알 수 없는 필드 거부
- 통화, 시간대, 날짜 형식 검증
- `minimumEngineVersion` 호환성
- 모든 참조 rule/source/formula ID 존재

### 의미 검증

- 같은 조건과 우선순위에서 기간 중복 없음
- 필요한 기간에 정책 공백 없음
- `validFrom < validToExclusive`
- 비율과 금액이 허용 범위 내에 있음
- 상한이 하한보다 큼
- 최대 개월이 음수가 아님
- decision table의 `UNIQUE` 조건 위반 없음
- 경과조치가 기본규칙을 의도대로 덮어쓰는지 확인

### 회귀 검증

- 정책 파일에 포함된 예제 테스트 통과
- 엔진 단위 테스트 통과
- 공단 확인값 기반 Golden Test 통과
- 기존 대표 부부 시나리오 변화량 확인
- 효력일 전 월의 결과가 바뀌지 않는지 확인
- 변경 사유 없는 과거 결과가 달라지면 활성화 차단

## 11. 런타임 반영과 재현성

- 시뮬레이션 시작 시 활성 Policy Pack을 한 번 고정하여 실행 중 교체 영향을 받지 않게 한다.
- 새 정책은 다음 시뮬레이션부터 적용한다.
- 이미 저장한 결과는 자동 덮어쓰지 않는다.
- 사용자가 원할 때만 “최신 정책으로 다시 계산”하고 변경 비교표를 만든다.
- 각 결과에 다음 정보를 저장한다.

```json
{
  "policySnapshot": {
    "policyPackId": "KR-NPS-2026.08.1",
    "contentSha256": "...",
    "schemaVersion": "1.0.0",
    "engineVersion": "1.3.2",
    "calculatedAt": "2026-08-29T14:20:00+09:00",
    "appliedRuleIds": [
      "contribution.rate.total@1",
      "standard-income.limit@3"
    ]
  }
}
```

- 리포트에는 Policy Pack ID, 기준일, 공식/가정 상태, 주요 출처, 경고를 표시한다.
- 공식 정책 팩은 수정·삭제하지 않고 폐기 상태만 부여한다.

## 12. 공식 정책과 사용자 가정 분리

향후 정책을 미리 시뮬레이션할 수 있도록 공식 팩 위에 별도 overlay를 허용한다.

```json
{
  "overlayId": "USER-SCENARIO-2030-RATE-12",
  "basePolicyPackId": "KR-NPS-2026.08.1",
  "status": "SCENARIO",
  "overrides": [
    {
      "ruleId": "contribution.rate.total",
      "validFrom": "2030-01-01",
      "value": { "numerator": 120, "denominator": 1000 }
    }
  ]
}
```

규칙:

- 공식 팩 원본을 수정하지 않는다.
- 화면과 PDF에 “사용자 가정 정책”을 명확히 표시한다.
- 가정 overlay에는 법적 확정값 배지를 붙일 수 없다.
- 공식 결과와 가정 결과를 나란히 비교할 수 있게 한다.

## 13. 명세에 바로 반영할 변경사항

### 3장 RuleSet 설계 교체

- `RuleSet`을 `Policy Pack > Domain Rule Set > Rule` 3계층으로 확장한다.
- 단일 `resolve(date)`를 `resolve(ruleId, PolicyContext)`로 변경한다.
- 모든 규칙에 `applicationClock`, `legalSourceIds`, `verification`을 추가한다.
- 공식·발표·초안·사용자 가정 상태를 분리한다.
- 경과조치 및 decision table 요구를 추가한다.

### 20장 계산 엔진 추가

```text
PolicyPackLoader
PolicySchemaValidator
PolicySemanticValidator
PolicyCompatibilityChecker
PolicyResolver
DecisionTableEvaluator
FormulaEvaluator
PolicyImpactAnalyzer
PolicyAuditLogger
```

### 28장 폴더 구조 변경

기존 `data/rules/kr-nps-YYYY.json` 대신 본 문서 3장의 Policy Pack 구조를 사용한다.

### 30장 테스트 추가

- 효력기간 경계 전후 테스트
- 같은 해 7월 고시값 변경 테스트
- 추납 신청월·납부기한월·납부월이 다른 테스트
- 출생 코호트 경계 테스트
- 규칙 중복·공백 시 활성화 실패 테스트
- 구버전 엔진과 신버전 정책 팩 비호환 테스트
- 정책 팩 서명 변조 테스트
- 롤백 후 동일 결과 재현 테스트

### 39장 API 응답 변경

`appliedRuleSetIds`만 저장하지 말고 `policySnapshot`과 적용 rule ID 목록을 저장한다.

## 14. 구현 우선순위

### 1단계 — 안전한 파라미터 분리

- Manifest와 JSON Schema
- 보험료율, 상·하한, A값, 조기·연기 비율
- 효력기간 Resolver
- 정책 스냅샷 저장
- 수동 업로드, 검증, 활성화, 롤백

### 2단계 — 복합 규칙

- decision table
- 출생 코호트와 자격조건
- 추납의 복수 적용 시계
- 유족연금·중복급여 조정
- 경과조치
- 영향 분석

### 3단계 — 운영 자동화

- 제한된 수식 DSL
- 서명된 원격 Registry
- 예약 활성화와 알림
- 정책 변경 전후 대량 회귀 비교
- 정책 관리 UI와 승인 이력

## 15. 완료 기준

- 정책 팩만 바꿔 2030년 이후 보험료율을 변경했을 때 그 이전 월의 결과가 변하지 않는다.
- 6월/7월 기준소득 상·하한 경계가 정확히 적용된다.
- 추납의 신청일, 납부기한, 실제 납부일이 서로 다른 경우 각 규칙이 올바른 시계를 사용한다.
- 서로 충돌하는 두 규칙이 있으면 활성화를 거부한다.
- 구버전 정책 팩으로 과거 리포트를 동일하게 재현할 수 있다.
- 서명이 깨진 정책 팩은 설치되지 않는다.
- 업데이트 실패 시 기존 정책으로 계속 계산된다.
- 공식 정책과 사용자 가정이 결과와 리포트에서 명확히 구분된다.
- 정책 변경 전후의 대표 시나리오 차이를 활성화 전에 확인할 수 있다.

## 16. 확인한 공식 근거

아래 자료는 초기 정책 팩을 만들 때의 출처 후보이며, 각 정책 값은 해당 법령의 시행일과 경과조항까지 다시 확인해 등록해야 한다.

- [국민연금공단: 2025년 연금개혁 주요내용](https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0104M0.do)
- [국민연금공단: 추납보험료 산정기준 변경](https://www.nps.or.kr/pnsgdnc/nscvrgdata/getOHAE0002M1.do?pstId=ZZ202500000000001465)
- [국가법령정보센터: 국민연금법 제88조 및 부칙 개정이력](https://law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001781&lsRvsGubun=all)
- [국민연금공단: 조기·연기연금 안내](https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0100M0.do)
- [보건복지부: 가입대상 및 연금보험료](https://www.mohw.go.kr/menu.es?mid=a10714010100)

## 17. 최종 권고

명세의 `RuleSet`은 유지하되 이름과 책임을 다음처럼 명확히 하는 것이 좋다.

```text
Policy Pack
  ├─ 법적 출처와 배포/호환성 정보
  ├─ 효력기간별 Domain Rule Set
  ├─ 조건표와 제한된 계산식
  ├─ 정책 자체 테스트
  └─ 해시와 전자서명

Policy Engine
  ├─ 적용 기준일 해석
  ├─ 규칙 선택과 충돌 검출
  ├─ 조건표/수식 실행
  └─ 적용 근거 추적

Simulation Engine
  ├─ 월별 타임라인
  ├─ 가입·납부·수급 이벤트
  ├─ 현금흐름 원장
  └─ 손익분기/부부 전략 분석
```

핵심은 정책 값을 코드 밖으로 옮기는 데 그치지 않고, **효력기간·적용 기준일·법적 출처·검증·승인·재현성·롤백까지 정책 배포 체계로 만드는 것**이다.

독립 실행과 개인정보 보호에 관한 상세 설계는 `docs/STANDALONE_PRIVACY_ARCHITECTURE.md`를 따른다. 정책 업데이트 모듈은 공개 정책 팩만 다루며, 사용자 프로필과 시뮬레이션 결과 저장소를 참조하지 않게 분리한다.

개발자 재배포 없이 사용자가 AI의 도움을 받아 정책 파일을 갱신하는 절차는 `docs/POLICY_UPDATE_WITH_AI.md`를 따른다. 앱은 개인정보 없는 업데이트 키트만 내보내고, AI 생성 정책은 사용자 가져오기 정책으로 분리하여 내장 검증과 사용자 승인을 거친 뒤 활성화한다.
