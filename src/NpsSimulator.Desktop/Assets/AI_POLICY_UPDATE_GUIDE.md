# 국민연금 정책 업데이트 파일 작성 지침

이 ZIP의 `current-policy.snapshot.json`, `policy-update.schema.json`, `allowed-rule-catalog.json`을 기준으로 작업하세요.

1. 국가법령정보센터, 보건복지부, 국민연금공단의 공식 원문만 정책 근거로 사용하세요.
2. 검색 결과 요약이나 기억만으로 값을 확정하지 마세요.
3. 현재 정책을 덮어쓰지 말고 새 `policyPackId`로 `policy-update.json`을 만드세요.
4. 변경되지 않은 규칙은 다시 작성하지 마세요.
5. 시행일과 `applicationClock`을 구분하세요.
6. 비율은 정수 분자·분모로, 금액은 정수 KRW로 작성하세요.
7. 불확실한 값은 추측하지 말고 `unresolvedItems`에 기록하세요.
8. 현재 catalog에 없는 제도는 `engineUpgradeRequired`에 기록하세요.
9. 개인정보, 실행 코드, 스크립트, 외부 파일 경로를 포함하지 마세요.
10. 결과는 순수 JSON인 `policy-update.json`과 설명용 `POLICY_UPDATE_REPORT.md`로 제공하세요.

AI가 작성한 파일은 프로그램의 로컬 검증과 사용자 승인을 통과해야 하며 국민연금공단의 인증 결과로 표현하면 안 됩니다.
