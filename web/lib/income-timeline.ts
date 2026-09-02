import type { AnnualRow, SimulationResult } from './nps-engine';

export type IncomeEventKind =
  | 'current'
  | 'retirement'
  | 'householdRetirement'
  | 'nationalPensionStart'
  | 'basicPensionStart'
  | 'additionalPensionStart'
  | 'additionalPensionEnd'
  | 'housingSale'
  | 'housingPurchase'
  | 'survivorTransition';

export type IncomeTimelineEvent = {
  id: string;
  year: number;
  kind: IncomeEventKind;
  title: string;
  description: string;
};

export type IncomeTimelineEventGroup = {
  id: string;
  year: number;
  title: string;
  events: IncomeTimelineEvent[];
};

export type IncomeTimelineSnapshot = {
  year: number;
  ageA: number;
  ageB: number | null;
  employmentA: number;
  employmentB: number;
  nationalA: number;
  nationalB: number;
  basicA: number;
  basicB: number;
  additionalA: number;
  additionalB: number;
  pensionNetA: number;
  pensionNetB: number;
  householdIncome: number;
  livingCost: number;
  gap: number;
  surplus: number;
  status: string;
};

const rowBasicPension = (row: AnnualRow, owner: 'a' | 'b') => {
  const pension = owner === 'a' ? row.pensionA : row.pensionB;
  const national = owner === 'a' ? row.nationalPensionA : row.nationalPensionB;
  const additional =
    owner === 'a' ? row.additionalPensionA : row.additionalPensionB;
  return Math.max(0, pension - national - additional);
};

const employmentIncomeAtYear = (
  person: SimulationResult['a'] | SimulationResult['b'],
  year: number,
) => {
  if (!person?.enabled || !person.employmentIncomeEnabled) return 0;
  const age = year - person.birthDate.getFullYear();
  return age >= 0 && age < (person.retirementAge ?? 60)
    ? (person.preRetirementMonthlyIncome ?? 0)
    : 0;
};

export function incomeTimelineSnapshot(
  result: SimulationResult,
  year: number,
  livingCost: number,
): IncomeTimelineSnapshot {
  const row = result.rows.find((item) => item.year === year);
  const employmentA = employmentIncomeAtYear(result.a, year);
  const employmentB = employmentIncomeAtYear(result.b, year);
  const pensionNetA = row?.estimatedNetA ?? 0;
  const pensionNetB = row?.estimatedNetB ?? 0;
  const householdIncome = employmentA + employmentB + pensionNetA + pensionNetB;
  return {
    year,
    ageA: year - result.a.birthDate.getFullYear(),
    ageB: result.b ? year - result.b.birthDate.getFullYear() : null,
    employmentA,
    employmentB,
    nationalA: row?.nationalPensionA ?? 0,
    nationalB: row?.nationalPensionB ?? 0,
    basicA: row ? rowBasicPension(row, 'a') : 0,
    basicB: row ? rowBasicPension(row, 'b') : 0,
    additionalA: row?.additionalPensionA ?? 0,
    additionalB: row?.additionalPensionB ?? 0,
    pensionNetA,
    pensionNetB,
    householdIncome,
    livingCost,
    gap: Math.max(0, livingCost - householdIncome),
    surplus: Math.max(0, householdIncome - livingCost),
    status: row?.status ?? '계산 구간 밖',
  };
}

export function buildIncomeTimelineEvents(
  result: SimulationResult,
  currentYear: number,
): IncomeTimelineEventGroup[] {
  const events: IncomeTimelineEvent[] = [
    {
      id: `current-${currentYear}`,
      year: currentYear,
      kind: 'current',
      title: '현재 기준',
      description: '입력한 현재 소득과 연금 조건을 비교하는 시작점입니다.',
    },
  ];
  const people = [
    { owner: 'A' as const, person: result.a },
    ...(result.b ? [{ owner: 'B' as const, person: result.b }] : []),
  ];
  const retirementEvents = people
    .filter(({ person }) => person.employmentIncomeEnabled)
    .map(({ owner, person }) => ({
      owner,
      name: person.name,
      year: person.birthDate.getFullYear() + (person.retirementAge ?? 60),
      income: person.preRetirementMonthlyIncome ?? 0,
    }));
  retirementEvents.forEach((event) =>
    events.push({
      id: `retirement-${event.owner}-${event.year}`,
      year: event.year,
      kind: 'retirement',
      title: `${event.name} 은퇴`,
      description: `${event.name}의 은퇴 전 세후 월소득 ${Math.round(event.income).toLocaleString('ko-KR')}원이 이 연도부터 종료됩니다.`,
    }),
  );
  if (retirementEvents.length > 0) {
    const householdRetirementYear = Math.max(
      ...retirementEvents.map((event) => event.year),
    );
    events.push({
      id: `household-retirement-${householdRetirementYear}`,
      year: householdRetirementYear,
      kind: 'householdRetirement',
      title: '가구 은퇴',
      description:
        '가구의 근로·사업소득 참여자가 모두 은퇴하여 이후 생활비를 연금과 보유자산으로 충당해야 하는 시점입니다.',
    });
  }
  people.forEach(({ owner, person }) => {
    if (person.hasNps) {
      events.push({
        id: `nps-${owner}-${person.claimYear}`,
        year: person.claimYear,
        kind: 'nationalPensionStart',
        title: `${person.name} 국민연금 개시`,
        description: `${person.name}의 선택한 수령 전략에 따른 국민연금이 시작됩니다. 조기·연기 수령 조정률과 물가연동 설정이 반영됩니다.`,
      });
    }
  });
  people.forEach(({ owner, person }) => {
    const firstBasicRow = result.rows.find(
      (row) => rowBasicPension(row, owner.toLowerCase() as 'a' | 'b') > 0,
    );
    if (!firstBasicRow) return;
    events.push({
      id: `basic-${owner}-${firstBasicRow.year}`,
      year: firstBasicRow.year,
      kind: 'basicPensionStart',
      title: `${person.name} 기초연금 가정 개시`,
      description: `${person.name}에게 선택한 기초연금 가정액을 반영하기 시작합니다. 실제 수급 여부와 금액은 당시 자격 심사가 우선합니다.`,
    });
  });
  result.additionalPensions.forEach((account) => {
    events.push({
      id: `additional-start-${account.id}-${account.startYear}`,
      year: account.startYear,
      kind: 'additionalPensionStart',
      title: `${account.ownerName} ${account.name} 개시`,
      description: `${account.name}의 월 예상 지급액 ${Math.round(account.firstYearEstimatedNetMonthly).toLocaleString('ko-KR')}원을 세후 추정 연금소득에 반영하기 시작합니다.`,
    });
    if (account.payoutYears > 0) {
      const endYear = account.startYear + account.payoutYears;
      events.push({
        id: `additional-end-${account.id}-${endYear}`,
        year: endYear,
        kind: 'additionalPensionEnd',
        title: `${account.ownerName} ${account.name} 종료`,
        description: `${account.payoutYears}년 수령기간이 끝나 ${account.name}의 월 지급액이 이 연도부터 가구 연금소득에서 제외됩니다.`,
      });
    }
  });
  if (result.b) {
    const firstDeathYear = Math.min(result.a.deathYear, result.b.deathYear);
    const transitionYear = firstDeathYear + 1;
    events.push({
      id: `survivor-${transitionYear}`,
      year: transitionYear,
      kind: 'survivorTransition',
      title: '첫 사망 후 소득 전환',
      description:
        '첫 사망 다음 해부터 생존자의 본인 노령연금과 유족연금 중복급여 선택 및 남아 있는 개인·퇴직연금만 반영됩니다.',
    });
  }
  const byYear = new Map<number, IncomeTimelineEvent[]>();
  events
    .sort((left, right) => left.year - right.year)
    .forEach((event) => {
      const group = byYear.get(event.year) ?? [];
      if (!group.some((item) => item.id === event.id)) group.push(event);
      byYear.set(event.year, group);
    });
  return [...byYear.entries()].map(([year, grouped]) => ({
    id: `event-year-${year}`,
    year,
    title:
      grouped.length === 1
        ? grouped[0].title
        : `${grouped[0].title} 외 ${grouped.length - 1}건`,
    events: grouped,
  }));
}
