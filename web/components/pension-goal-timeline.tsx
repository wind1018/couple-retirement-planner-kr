'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type {
  PensionGoalPoint,
  PensionGoalTimelines,
} from '@/lib/pension-goal';

const money = (value: number) =>
  `${Math.round(value).toLocaleString('ko-KR')}원`;
const shortMoney = (value: number) => {
  if (value === 0) return '0원';
  if (value >= 10000 && value % 10000 === 0)
    return `${(value / 10000).toLocaleString('ko-KR')}만`;
  return money(value);
};
const digits = (value: string) => Number(value.replace(/\D/g, '')) || 0;

type TimelinePerson = {
  name: string;
  enabled: boolean;
  birthYear: number;
  currentAge: number;
  deathAge: number;
  hasNps: boolean;
  claimAge: number;
  employmentIncomeEnabled: boolean;
  retirementAge: number;
  preRetirementMonthlyIncome: number;
};

function TimelineLane({
  owner,
  name,
  enabled,
  birthYear,
  currentAge,
  deathAge,
  timelineStartYear,
  timelineEndYear,
  selectedYear,
  points,
  setPoints,
}: {
  owner: 'a' | 'b';
  name: string;
  enabled: boolean;
  birthYear: number;
  currentAge: number;
  deathAge: number;
  timelineStartYear: number;
  timelineEndYear: number;
  selectedYear: number;
  points: PensionGoalPoint[];
  setPoints: (points: PensionGoalPoint[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const editorDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!editingId) return;
    amountInput.current?.focus();
    amountInput.current?.select();

    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || editorDialog.current?.contains(target)) return;
      const trigger = target.closest<HTMLElement>('[data-goal-trigger]');
      if (trigger?.dataset.goalTrigger === editingId) return;
      setEditingId(null);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingId(null);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromEscape);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromEscape);
    };
  }, [editingId]);
  const minimumAge = Math.min(currentAge, deathAge - 1);
  const timelineRange = Math.max(1, timelineEndYear - timelineStartYear);
  const effectiveAge = (point: PensionGoalPoint) => point.endAge ?? deathAge;
  const sorted = points
    .filter(
      (point) =>
        point.endAge == null ||
        (point.endAge > minimumAge && point.endAge < deathAge),
    )
    .sort((left, right) => effectiveAge(left) - effectiveAge(right));
  const segments = sorted.map((point, index) => ({
    point,
    startAge: index === 0 ? minimumAge : effectiveAge(sorted[index - 1]),
    endAge: effectiveAge(point),
  }));
  const positionYear = (year: number) =>
    Math.min(
      100,
      Math.max(0, ((year - timelineStartYear) / timelineRange) * 100),
    );
  const position = (age: number) => positionYear(birthYear + age);
  const patchPoint = (id: string, patch: Partial<PensionGoalPoint>) =>
    setPoints(
      points.map((point) => (point.id === id ? { ...point, ...patch } : point)),
    );
  const addAtAge = (requestedAge: number) => {
    if (!enabled || deathAge - minimumAge < 2) return;
    let age = Math.min(deathAge - 1, Math.max(minimumAge + 1, requestedAge));
    const occupied = new Set(
      points
        .filter((point) => point.endAge != null)
        .map((point) => point.endAge as number),
    );
    while (occupied.has(age) && age < deathAge - 1) age++;
    if (occupied.has(age)) return;
    const following = sorted.find((point) => effectiveAge(point) > age);
    let id = `${owner}-goal-${age}`;
    let suffix = 1;
    while (points.some((point) => point.id === id)) {
      id = `${owner}-goal-${age}-${suffix}`;
      suffix++;
    }
    const newPoint: PensionGoalPoint = {
      id,
      endAge: age,
      monthly: following?.monthly ?? 0,
    };
    setPoints([...points, newPoint]);
    setEditingId(newPoint.id);
  };
  const addWidestSegment = () => {
    const boundaries = [minimumAge, ...sorted.map(effectiveAge)];
    let bestStart = minimumAge;
    let bestEnd = deathAge;
    let bestWidth = -1;
    for (let index = 0; index < boundaries.length - 1; index++) {
      const width = boundaries[index + 1] - boundaries[index];
      if (width > bestWidth) {
        bestStart = boundaries[index];
        bestEnd = boundaries[index + 1];
        bestWidth = width;
      }
    }
    addAtAge(Math.round((bestStart + bestEnd) / 2));
  };
  const addFromPointer = (clientX: number, rect: DOMRect) => {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    addAtAge(Math.round(timelineStartYear + ratio * timelineRange) - birthYear);
  };
  const laneStart = position(minimumAge);
  const laneEnd = position(deathAge);
  const selectedYearInLane =
    selectedYear >= birthYear + minimumAge &&
    selectedYear <= birthYear + deathAge;
  return (
    <section
      className={`relative rounded-xl border bg-white p-4 ${
        editingId ? 'z-20' : 'z-0'
      } ${enabled ? 'border-slate-200' : 'border-slate-200 opacity-50'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black">
            {name}({owner.toUpperCase()}) 목표 월연금
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {minimumAge}세({birthYear + minimumAge}년)부터 {deathAge}세(
            {birthYear + deathAge}년)까지 · 금액은 해당 점 직전 구간에 적용
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!enabled}
          onClick={addWidestSegment}
        >
          <Plus /> 구간점 추가
        </Button>
      </div>

      <div
        className="relative mt-5 h-28 select-none px-2"
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button, dialog')) return;
          addFromPointer(
            event.clientX,
            event.currentTarget.getBoundingClientRect(),
          );
        }}
      >
        <div
          className="absolute inset-x-0 top-[58px] h-2 rounded-full bg-slate-200"
          aria-hidden="true"
        />
        {selectedYearInLane && (
          <div
            className="pointer-events-none absolute top-[43px] z-10 h-12 w-0 border-l-2 border-dashed border-amber-500"
            style={{ left: `${positionYear(selectedYear)}%` }}
          />
        )}
        {segments.map(({ point, startAge, endAge }) => {
          const start = position(startAge);
          const width = Math.max(0, position(endAge) - start);
          return (
            <div
              key={`segment-${point.id}`}
              className={`absolute top-[58px] h-2 ${
                owner === 'a' ? 'bg-blue-400' : 'bg-violet-400'
              }`}
              style={{ left: `${start}%`, width: `${width}%` }}
            />
          );
        })}
        <span
          className="absolute top-[77px] text-[10px] font-bold leading-3 text-slate-500"
          style={{
            left: `${laneStart}%`,
            transform: laneStart < 4 ? undefined : 'translateX(-50%)',
          }}
        >
          {minimumAge}세
          <br />({birthYear + minimumAge}년)
        </span>
        <span
          className="absolute top-[77px] text-right text-[10px] font-bold leading-3 text-slate-500"
          style={{
            left: `${laneEnd}%`,
            transform: laneEnd > 96 ? 'translateX(-100%)' : 'translateX(-50%)',
          }}
        >
          {deathAge}세 사망
          <br />({birthYear + deathAge}년)
        </span>
        {sorted.map((point) => {
          const age = effectiveAge(point);
          const fixed = point.endAge == null;
          return (
            <div
              key={point.id}
              className="absolute top-0 -translate-x-1/2 text-center"
              style={{ left: `${position(age)}%` }}
            >
              <button
                type="button"
                data-goal-trigger={point.id}
                className={`max-w-28 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-xs font-black shadow-sm ${
                  editingId === point.id
                    ? owner === 'a'
                      ? 'border-blue-500 text-blue-700 ring-2 ring-blue-100'
                      : 'border-violet-500 text-violet-700 ring-2 ring-violet-100'
                    : 'border-slate-200 text-slate-700'
                }`}
                title="클릭 또는 더블클릭하여 금액 수정"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingId(point.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditingId(point.id);
                }}
              >
                {shortMoney(point.monthly)}
              </button>
              <button
                type="button"
                aria-label={`${age}세 구간점${fixed ? ' 고정' : ' 이동'}`}
                title={
                  fixed ? '사망 시점은 고정입니다.' : '좌우로 끌어 나이 변경'
                }
                className={`mx-auto mt-2 block size-4 rotate-45 border-2 border-white shadow ${
                  owner === 'a' ? 'bg-blue-600' : 'bg-violet-600'
                } ${fixed ? 'cursor-default' : 'cursor-ew-resize'}`}
                style={{ touchAction: 'none' }}
                onPointerDown={(event) => {
                  if (!enabled || fixed) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (
                    fixed ||
                    !event.currentTarget.hasPointerCapture(event.pointerId)
                  )
                    return;
                  const track =
                    event.currentTarget.parentElement?.parentElement;
                  if (!track) return;
                  const rect = track.getBoundingClientRect();
                  const ratio = Math.min(
                    1,
                    Math.max(0, (event.clientX - rect.left) / rect.width),
                  );
                  const nextAge = Math.min(
                    deathAge - 1,
                    Math.max(
                      minimumAge + 1,
                      Math.round(timelineStartYear + ratio * timelineRange) -
                        birthYear,
                    ),
                  );
                  if (
                    points.some(
                      (other) =>
                        other.id !== point.id && other.endAge === nextAge,
                    )
                  )
                    return;
                  patchPoint(point.id, { endAge: nextAge });
                }}
                onKeyDown={(event) => {
                  if (fixed) return;
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    const step = event.key === 'ArrowLeft' ? -1 : 1;
                    patchPoint(point.id, {
                      endAge: Math.min(
                        deathAge - 1,
                        Math.max(minimumAge + 1, age + step),
                      ),
                    });
                  }
                  if (event.key === 'Delete')
                    setPoints(points.filter((item) => item.id !== point.id));
                }}
              />
              <span className="absolute left-1/2 top-[76px] z-10 block -translate-x-1/2 whitespace-nowrap rounded bg-white/95 px-1 text-[10px] font-bold leading-3 text-slate-600">
                {fixed ? `${deathAge}세까지` : `${age}세 전까지`}
                <br />({birthYear + age}년)
              </span>
              {editingId === point.id && (
                <dialog
                  ref={editorDialog}
                  open
                  aria-label={`${age}세 목표 월연금 수정`}
                  className={`absolute top-[110px] z-50 m-0 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-slate-950 shadow-2xl ${
                    position(age) < 18
                      ? 'left-1/2'
                      : position(age) > 82
                        ? 'right-1/2'
                        : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <p className="text-xs font-black text-slate-700">
                    {age}세({birthYear + age}년)까지 적용할 세후 월 목표
                  </p>
                  <Input
                    ref={amountInput}
                    className="mt-2"
                    inputMode="numeric"
                    value={point.monthly.toLocaleString('ko-KR')}
                    onChange={(event) =>
                      patchPoint(point.id, {
                        monthly: digits(event.target.value),
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape')
                        setEditingId(null);
                    }}
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    {!fixed && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPoints(
                            points.filter((item) => item.id !== point.id),
                          );
                          setEditingId(null);
                        }}
                      >
                        <Trash2 /> 삭제
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      적용
                    </Button>
                  </div>
                </dialog>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {sorted.map((point, index) => {
          const startAge =
            index === 0 ? minimumAge : effectiveAge(sorted[index - 1]);
          const endAge = effectiveAge(point);
          return (
            <Badge key={`summary-${point.id}`} variant="outline">
              {startAge}~{point.endAge == null ? endAge : endAge - 1}세{' '}
              <span className="text-slate-400">
                ({birthYear + startAge}~
                {birthYear + (point.endAge == null ? endAge : endAge - 1)}년)
              </span>{' '}
              {money(point.monthly)}
            </Badge>
          );
        })}
      </div>
    </section>
  );
}

function goalAtYear(
  points: PensionGoalPoint[],
  birthYear: number,
  currentAge: number,
  deathAge: number,
  year: number,
) {
  const age = year - birthYear;
  if (age < currentAge || age >= deathAge) return null;
  const sorted = [...points]
    .filter(
      (point) =>
        point.endAge == null ||
        (point.endAge > currentAge && point.endAge <= deathAge),
    )
    .sort(
      (left, right) => (left.endAge ?? deathAge) - (right.endAge ?? deathAge),
    );
  return sorted.find((point) => (point.endAge ?? deathAge) > age)?.monthly ?? 0;
}

function SharedYearAxis({
  startYear,
  endYear,
  selectedYear,
  setSelectedYear,
  people,
  timelines,
}: {
  startYear: number;
  endYear: number;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  people: { a: TimelinePerson; b: TimelinePerson };
  timelines: PensionGoalTimelines;
}) {
  const range = Math.max(1, endYear - startYear);
  const ticks = Array.from(
    new Set([
      startYear,
      ...Array.from(
        { length: Math.floor(endYear / 5) - Math.ceil(startYear / 5) + 1 },
        (_, index) => Math.ceil(startYear / 5) * 5 + index * 5,
      ),
      endYear,
    ]),
  ).filter((year) => year >= startYear && year <= endYear);
  const position = (year: number) => ((year - startYear) / range) * 100;
  const amountA = people.a.enabled
    ? goalAtYear(
        timelines.a,
        people.a.birthYear,
        people.a.currentAge,
        people.a.deathAge,
        selectedYear,
      )
    : null;
  const amountB = people.b.enabled
    ? goalAtYear(
        timelines.b,
        people.b.birthYear,
        people.b.currentAge,
        people.b.deathAge,
        selectedYear,
      )
    : null;
  const ageA = selectedYear - people.a.birthYear;
  const ageB = selectedYear - people.b.birthYear;
  const householdPeople = [people.a, people.b].filter(
    (person) => person.enabled,
  );
  const retirementEvents = (['a', 'b'] as const)
    .filter(
      (owner) => people[owner].enabled && people[owner].employmentIncomeEnabled,
    )
    .map((owner) => ({
      owner,
      person: people[owner],
      year: people[owner].birthYear + people[owner].retirementAge,
    }))
    .sort((left, right) => left.year - right.year);
  const firstRetirementYear = retirementEvents.length
    ? retirementEvents[0].year
    : null;
  const householdRetirementYear = retirementEvents.length
    ? Math.max(...retirementEvents.map((event) => event.year))
    : null;
  const retirementMarkers = Array.from(
    new Set(retirementEvents.map((event) => event.year)),
  ).map((year) => {
    const events = retirementEvents.filter((event) => event.year === year);
    const owners = events.map((event) => event.owner.toUpperCase()).join('·');
    const isHouseholdRetirement = year === householdRetirementYear;
    return {
      year,
      owners,
      isHouseholdRetirement,
      label: `${owners}${isHouseholdRetirement ? '·가구' : ''} 은퇴 ${year}년`,
    };
  });
  const retirementSummary = retirementMarkers
    .map((marker) => marker.label)
    .join(' → ');
  const npsStartYears = householdPeople
    .filter((person) => person.hasNps)
    .map((person) => person.birthYear + person.claimAge);
  const firstNpsYear = npsStartYears.length ? Math.min(...npsStartYears) : null;
  const householdGapYears =
    householdRetirementYear != null && firstNpsYear != null
      ? Math.max(0, firstNpsYear - householdRetirementYear)
      : null;
  const householdStatus = (() => {
    if (householdRetirementYear == null) return '가구 근로소득 참여자 미설정';
    if (firstRetirementYear != null && selectedYear < firstRetirementYear)
      return '가구 근로소득 유지';
    if (selectedYear < householdRetirementYear) {
      const retired = retirementEvents
        .filter((event) => event.year <= selectedYear)
        .map((event) => `${event.person.name}(${event.owner.toUpperCase()})`)
        .join('·');
      const working = retirementEvents
        .filter((event) => event.year > selectedYear)
        .map((event) => `${event.person.name}(${event.owner.toUpperCase()})`)
        .join('·');
      return `부분 은퇴 · ${retired} 은퇴, ${working} 소득활동 유지`;
    }
    if (firstNpsYear == null) return '가구 은퇴 · 국민연금 없음';
    if (selectedYear < firstNpsYear) return '가구 은퇴 · 국민연금 공백';
    return '가구 은퇴 · 국민연금 수령 구간';
  })();
  const personStatus = (person: TimelinePerson) => {
    if (!person.enabled) return '미사용';
    const age = selectedYear - person.birthYear;
    if (age < person.currentAge) return '현재 시점 이전';
    if (age >= person.deathAge) return '예상 생존 구간 밖';
    if (person.employmentIncomeEnabled && age < person.retirementAge)
      return '재직·소득활동 중';
    if (person.hasNps && age >= person.claimAge) return '국민연금 수령 중';
    if (!person.employmentIncomeEnabled) return '가구 근로소득 참여 안 함';
    if (person.hasNps) return '은퇴·국민연금 공백';
    return '은퇴·국민연금 없음';
  };
  const employmentIncomeAtSelectedYear = (person: TimelinePerson) => {
    const age = selectedYear - person.birthYear;
    return person.enabled &&
      person.employmentIncomeEnabled &&
      age >= person.currentAge &&
      age < person.retirementAge
      ? person.preRetirementMonthlyIncome
      : 0;
  };
  const markerInRange = (year: number | null) =>
    year != null && year >= startYear && year <= endYear;
  const gapStartsInRange =
    householdRetirementYear != null &&
    firstNpsYear != null &&
    householdGapYears != null &&
    householdGapYears > 0 &&
    firstNpsYear >= startYear &&
    householdRetirementYear <= endYear;
  return (
    <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-black text-emerald-950">공통 연도 확인</h3>
          <p className="mt-0.5 text-xs text-emerald-800">
            막대를 움직여 같은 연도의 부부 나이와 목표 월연금을 비교하세요.
          </p>
        </div>
        <Badge className="bg-emerald-700 px-3 py-1 text-white">
          {selectedYear}년
        </Badge>
      </div>
      <Input
        className="mt-3 h-3 cursor-ew-resize border-0 bg-transparent p-0 accent-emerald-700 shadow-none"
        type="range"
        min={startYear}
        max={endYear}
        step={1}
        value={selectedYear}
        aria-label="비교할 연도"
        onChange={(event) => setSelectedYear(Number(event.target.value))}
      />
      <div className="relative mt-8 hidden h-12 md:block">
        <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-emerald-300" />
        {gapStartsInRange && (
          <div
            className="absolute top-2 h-1 bg-amber-500"
            style={{
              left: `${position(Math.max(startYear, householdRetirementYear))}%`,
              width: `${position(Math.min(endYear, firstNpsYear)) - position(Math.max(startYear, householdRetirementYear))}%`,
            }}
          />
        )}
        {ticks.map((year) => (
          <div
            key={year}
            className="absolute top-0 text-center"
            style={{
              left: `${position(year)}%`,
              transform:
                year === startYear
                  ? undefined
                  : year === endYear
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            <span className="mx-auto block h-4 w-px bg-emerald-500" />
            <span className="block whitespace-nowrap text-[10px] font-bold text-slate-600">
              {year}년
            </span>
          </div>
        ))}
        {retirementMarkers.map((marker, index) =>
          markerInRange(marker.year) ? (
            <div
              key={`${marker.year}-${marker.owners}`}
              className={`absolute z-10 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-black ${
                marker.isHouseholdRetirement
                  ? 'bg-amber-100 text-amber-900'
                  : marker.owners === 'A'
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-violet-100 text-violet-900'
              }`}
              style={{
                left: `${position(marker.year)}%`,
                top: index % 2 === 0 ? '-18px' : '-38px',
              }}
            >
              {marker.label}
            </div>
          ) : null,
        )}
        {firstNpsYear != null && markerInRange(firstNpsYear) && (
          <div
            className="absolute top-6 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-900"
            style={{ left: `${position(firstNpsYear)}%` }}
          >
            첫 국민연금 {firstNpsYear}년
          </div>
        )}
      </div>
      <div
        className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
          householdStatus.includes('공백')
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : householdStatus.includes('부분 은퇴')
              ? 'border-blue-200 bg-blue-50 text-blue-950'
              : 'border-emerald-200 bg-white text-emerald-950'
        }`}
      >
        <b>{householdStatus}</b>
        <span className="ml-2 text-xs">
          {householdRetirementYear == null
            ? '외벌이는 소득활동자 한 명만 체크하면 그 사람의 은퇴가 가구 은퇴가 됩니다.'
            : firstNpsYear == null
              ? `${retirementSummary} · 국민연금 개시 정보 없음`
              : householdGapYears && householdGapYears > 0
                ? `${retirementSummary} → 첫 국민연금 ${firstNpsYear}년 · 가구 은퇴 후 ${householdGapYears}년 공백`
                : `${retirementSummary} · 첫 국민연금 ${firstNpsYear}년 · 가구 은퇴 후 공백 없음`}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm">
          <b className="text-blue-800">{people.a.name}(A)</b>
          <span className="ml-2 text-slate-600">
            {ageA}세 · {amountA == null ? '생존구간 밖' : shortMoney(amountA)}
          </span>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {personStatus(people.a)}
            {employmentIncomeAtSelectedYear(people.a) > 0 &&
              ` · 세후 월소득 ${shortMoney(employmentIncomeAtSelectedYear(people.a))}`}
          </p>
        </div>
        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm">
          <b className="text-violet-800">{people.b.name}(B)</b>
          <span className="ml-2 text-slate-600">
            {!people.b.enabled
              ? '미사용'
              : `${ageB}세 · ${amountB == null ? '생존구간 밖' : shortMoney(amountB)}`}
          </span>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {personStatus(people.b)}
            {employmentIncomeAtSelectedYear(people.b) > 0 &&
              ` · 세후 월소득 ${shortMoney(employmentIncomeAtSelectedYear(people.b))}`}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm">
          <b className="text-emerald-800">부부 합산 목표</b>
          <span className="ml-2 font-black text-slate-800">
            {shortMoney((amountA ?? 0) + (amountB ?? 0))}
          </span>
        </div>
      </div>
    </section>
  );
}

export function PensionGoalTimelineEditor({
  timelines,
  people,
  netReturnRate,
  includeLateLifeGap,
  setTimelines,
  setRetirementPerson,
  setNetReturnRate,
  setIncludeLateLifeGap,
}: {
  timelines: PensionGoalTimelines;
  people: { a: TimelinePerson; b: TimelinePerson };
  netReturnRate: number;
  includeLateLifeGap: boolean;
  setTimelines: (timelines: PensionGoalTimelines) => void;
  setRetirementPerson: (
    owner: 'a' | 'b',
    patch: Partial<
      Pick<
        TimelinePerson,
        | 'employmentIncomeEnabled'
        | 'retirementAge'
        | 'preRetirementMonthlyIncome'
      >
    >,
  ) => void;
  setNetReturnRate: (rate: number) => void;
  setIncludeLateLifeGap: (enabled: boolean) => void;
}) {
  const activePeople = [people.a, people.b].filter((person) => person.enabled);
  const visiblePeople = activePeople.length ? activePeople : [people.a];
  const timelineStartYear = Math.min(
    ...visiblePeople.map((person) => person.birthYear + person.currentAge),
  );
  const rawTimelineEndYear = Math.max(
    ...visiblePeople.map((person) => person.birthYear + person.deathAge),
  );
  const timelineEndYear = Math.max(timelineStartYear + 1, rawTimelineEndYear);
  const [selectedYear, setSelectedYear] = useState(timelineStartYear);
  const visibleSelectedYear = Math.min(
    timelineEndYear,
    Math.max(timelineStartYear, selectedYear),
  );
  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="border-b border-emerald-100">
        <CardTitle>슬라이드로 정하는 목표 월연금</CardTitle>
        <CardDescription>
          부부를 같은 달력 연도로 맞춰 비교합니다. 가운데 연도 막대로 목표액과
          개인별 은퇴·부분 은퇴·가구 은퇴·국민연금 공백을 확인하세요. 금액점은
          앞 구간부터 해당 나이 직전까지 적용됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="font-black text-slate-950">
              가구 소득활동·은퇴 설정
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              국민연금뿐 아니라 근로소득 종료와 개인·퇴직연금 개시 전후의 가구
              현금흐름에 함께 적용됩니다. 외벌이는 소득활동자 한 명만
              체크하세요.
            </p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {(['a', 'b'] as const).map((owner) => {
              const person = people[owner];
              const gapYears = person.hasNps
                ? Math.max(0, person.claimAge - person.retirementAge)
                : null;
              return (
                <div
                  key={owner}
                  className={`grid gap-3 rounded-xl border p-4 ${
                    owner === 'a'
                      ? 'border-blue-200 bg-blue-50/40'
                      : 'border-violet-200 bg-violet-50/40'
                  } ${person.enabled ? '' : 'opacity-50'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-black text-slate-900">
                      <Checkbox
                        disabled={!person.enabled}
                        checked={person.employmentIncomeEnabled}
                        onCheckedChange={(value) =>
                          setRetirementPerson(owner, {
                            employmentIncomeEnabled: value === true,
                          })
                        }
                      />
                      {person.name}({owner.toUpperCase()}) 가구 근로·사업소득
                      참여
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="whitespace-nowrap text-xs font-bold text-slate-600">
                          은퇴 전 예상 세후 월소득
                        </span>
                        <Input
                          className="h-9 bg-white"
                          disabled={
                            !person.enabled || !person.employmentIncomeEnabled
                          }
                          inputMode="numeric"
                          value={person.preRetirementMonthlyIncome.toLocaleString(
                            'ko-KR',
                          )}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            setRetirementPerson(owner, {
                              preRetirementMonthlyIncome: digits(
                                event.target.value,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="whitespace-nowrap text-xs font-bold text-slate-600">
                          예상·실제 은퇴 나이
                        </span>
                        <Input
                          className="h-9 bg-white"
                          disabled={
                            !person.enabled || !person.employmentIncomeEnabled
                          }
                          inputMode="numeric"
                          value={person.retirementAge || ''}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            setRetirementPerson(owner, {
                              retirementAge: digits(event.target.value),
                            })
                          }
                          onBlur={(event) =>
                            setRetirementPerson(owner, {
                              retirementAge: Math.min(
                                80,
                                Math.max(40, digits(event.target.value)),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                  {person.employmentIncomeEnabled &&
                    person.preRetirementMonthlyIncome <= 0 && (
                      <p className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                        은퇴 전 예상 세후 월소득을 입력하면 은퇴 시점의 소득
                        감소와 연금 준비액을 계산할 수 있습니다.
                      </p>
                    )}
                  <p className="text-xs leading-5 text-slate-600">
                    {!person.employmentIncomeEnabled
                      ? '가구 근로소득 참여자에서 제외합니다.'
                      : person.hasNps
                        ? gapYears && gapYears > 0
                          ? `${person.retirementAge}세 은퇴부터 ${person.claimAge}세 국민연금 개시까지 ${gapYears}년의 개인 소득 공백이 있습니다.`
                          : '선택한 은퇴 시점과 국민연금 개시 사이의 개인 소득 공백이 없습니다.'
                        : `${person.retirementAge}세 은퇴 이후 국민연금 외의 개인·퇴직연금과 생활비 흐름을 함께 확인하세요.`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
        <TimelineLane
          owner="a"
          {...people.a}
          timelineStartYear={timelineStartYear}
          timelineEndYear={timelineEndYear}
          selectedYear={visibleSelectedYear}
          points={timelines.a}
          setPoints={(a) => setTimelines({ ...timelines, a })}
        />
        <SharedYearAxis
          startYear={timelineStartYear}
          endYear={timelineEndYear}
          selectedYear={visibleSelectedYear}
          setSelectedYear={setSelectedYear}
          people={people}
          timelines={timelines}
        />
        <TimelineLane
          owner="b"
          {...people.b}
          timelineStartYear={timelineStartYear}
          timelineEndYear={timelineEndYear}
          selectedYear={visibleSelectedYear}
          points={timelines.b}
          setPoints={(b) => setTimelines({ ...timelines, b })}
        />
        <div className="grid gap-4 rounded-xl border border-emerald-100 bg-white p-4 lg:grid-cols-[220px_1fr] lg:items-center">
          <label className="grid gap-1.5">
            <span className="text-xs font-bold text-slate-600">
              부족재원 설계 기대 순수익률
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={netReturnRate}
                onChange={(event) =>
                  setNetReturnRate(
                    Math.min(10, Math.max(0, Number(event.target.value) || 0)),
                  )
                }
              />
              <span className="text-sm font-bold">%</span>
            </div>
          </label>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm font-bold">
              <Checkbox
                checked={includeLateLifeGap}
                onCheckedChange={(value) =>
                  setIncludeLateLifeGap(value === true)
                }
              />
              개인·퇴직연금 기간 종료 후 후기 노후 부족분까지 보완안 제시
            </label>
            <p className="text-xs leading-5 text-slate-500">
              기본값은 기간형 연금 종료 후의 자연스러운 감소분을 추가 적립
              제안에서 제외합니다.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
