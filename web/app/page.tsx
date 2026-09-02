'use client';

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  FilePlus2,
  FileKey,
  LockKeyhole,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { HouseholdFinanceControls } from '@/components/household-finance-controls';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  annuityPaymentEndDate,
  accountTenureMonthsAtStart,
  AdditionalPensionInput,
  claimAgeOptions,
  defaultNationalPensionInflationSettings,
  DEFAULT_POLICY,
  NationalPensionInflationSettings,
  normalClaimAge,
  parseBirth,
  pensionAtClaimAge,
  PersonInput,
  Policy,
  previewAdditionalPension,
  recommendedAnnuityPaymentTermYears,
  simulate,
  SimulationResult,
  validatePolicy,
} from '@/lib/nps-engine';
import {
  legacyGoalsToTimelines,
  PensionGoalRange,
  PensionGoalTimelines,
} from '@/lib/pension-goal';
import {
  buildIncomeTimelineEvents,
  incomeTimelineSnapshot,
  type IncomeTimelineEventGroup,
} from '@/lib/income-timeline';
import {
  addBasicPensionToResult,
  BasicPensionSettings,
  basicPensionBothAliveMonthly,
  defaultBasicPensionSettings,
  defaultLivingCostSettings,
  livingCostLabel,
  LivingCostSettings,
  livingCostMonthly,
} from '@/lib/public-pension';
import {
  clearEncryptedSession,
  createEncryptedProfileFile,
  hasEncryptedSession,
  loadEncryptedSession,
  readEncryptedProfileFile,
  saveEncryptedSession,
} from '@/lib/secure-session';
import { buildAiAnalysisMarkdown } from '@/lib/ai-analysis-markdown';
import {
  buildPolicyUpdateMarkdown,
  parsePolicyUpdateMarkdown,
  type PolicyUpdatePackage,
} from '@/lib/real-estate-policy-markdown';
import {
  DEFAULT_REAL_ESTATE_COST_POLICY,
  validateRealEstateCostPolicy,
} from '@/lib/real-estate-costs';
import {
  buildHouseholdCashflow,
  defaultHouseholdFinanceSettings,
  resolveAssetUsePlan,
  type HouseholdCashflowRow,
  type HouseholdFinanceSettings,
} from '@/lib/household-cashflow';

type FormState = {
  a: PersonInput;
  b: PersonInput;
  additionalPensions: AdditionalPensionInput[];
  pensionGoalTimelines: PensionGoalTimelines;
  plannerNetReturnRate: number;
  includeLateLifeGap: boolean;
  npsInflation: NationalPensionInflationSettings;
  basicPension: BasicPensionSettings;
  livingCost: LivingCostSettings;
  householdFinance: HouseholdFinanceSettings;
};
type SavedForm = Omit<
  FormState,
  'pensionGoalTimelines' | 'householdFinance'
> & {
  pensionGoalTimelines?: PensionGoalTimelines;
  pensionGoals?: PensionGoalRange[];
  householdFinance?: HouseholdFinanceSettings;
};
type SavedProfile = {
  formSchemaVersion?: '2.0';
  form: SavedForm;
  policy: Policy;
};
type ProfileFileMode = 'none' | 'direct' | 'download';
type ProfileDialogMode = 'save' | 'load' | 'save-as' | null;
type ProfileSaveKind = 'json' | 'session' | null;
type ProfileFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  queryPermission?: (options: {
    mode: 'readwrite';
  }) => Promise<PermissionState>;
  requestPermission?: (options: {
    mode: 'readwrite';
  }) => Promise<PermissionState>;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ProfileFileHandle>;
  showOpenFilePicker?: (options: {
    multiple: boolean;
    types: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ProfileFileHandle[]>;
};
const encryptedProfileFileTypes = [
  {
    description: '암호화된 부부 연금 프로필',
    accept: { 'application/json': ['.json'] },
  },
];
const emptyPerson = (name: string, enabled: boolean): PersonInput => ({
  enabled,
  hasNps: name === '본인',
  name,
  birth: '',
  anchoredMonthlyPension: 0,
  totalExpectedContribution: 0,
  expectedMonths: 0,
  currentMonthlyPremium: 0,
  periodStartYear: '',
  periodStartMonth: '',
  periodEndYear: '',
  periodEndMonth: '',
  continuationYears: 0,
  continuationPremium: 150000,
  claimAge: 65,
  employmentIncomeEnabled: enabled,
  retirementAge: 60,
  preRetirementMonthlyIncome: 0,
  deathAge: name === '본인' ? 85 : 90,
});
const initialForm = (): FormState => ({
  a: emptyPerson('본인', true),
  b: emptyPerson('배우자', true),
  additionalPensions: [],
  pensionGoalTimelines: {
    a: [
      { id: 'a-goal-65', endAge: 65, monthly: 0 },
      { id: 'a-goal-life', endAge: null, monthly: 1500000 },
    ],
    b: [
      { id: 'b-goal-65', endAge: 65, monthly: 0 },
      { id: 'b-goal-life', endAge: null, monthly: 1500000 },
    ],
  },
  plannerNetReturnRate: 2,
  includeLateLifeGap: false,
  npsInflation: defaultNationalPensionInflationSettings(),
  basicPension: defaultBasicPensionSettings(),
  livingCost: defaultLivingCostSettings(),
  householdFinance: defaultHouseholdFinanceSettings(),
});
const money = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

const cashflowPhaseMeta = (phase: string) => {
  const phases: Record<string, { label: string; className: string }> = {
    working: {
      label: '은퇴 전',
      className: 'border-slate-300 bg-slate-100 text-slate-800',
    },
    partial_retirement: {
      label: '한 사람 은퇴 후',
      className: 'border-amber-300 bg-amber-100 text-amber-900',
    },
    full_retirement: {
      label: '가구 은퇴 후',
      className: 'border-violet-300 bg-violet-100 text-violet-900',
    },
    survivor: {
      label: '첫 사망 이후',
      className: 'border-rose-300 bg-rose-100 text-rose-900',
    },
  };
  return (
    phases[phase] ?? {
      label: phase,
      className: 'border-slate-300 bg-slate-100 text-slate-800',
    }
  );
};

function CompactFormulaLine({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'result';
}) {
  const valueColor = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-800',
    negative: 'text-rose-900',
    result: 'text-blue-800',
  }[tone];
  return (
    <span
      data-slot="formula-line"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
    >
      <span className="min-w-0 text-slate-600">{label}</span>
      <b className={`whitespace-nowrap text-right ${valueColor}`}>{value}</b>
    </span>
  );
}
type CashflowChartPoint = {
  year: number;
  ageA: number;
  ageB: number | null;
  label: string;
  employmentIncome: number;
  nationalPension: number;
  basicPension: number;
  privatePension: number;
  rentalIncomeNet: number;
  otherIncome: number;
  incomeBeforeDebt: number;
  debtService: number;
  propertyHoldingTax: number;
  propertyHoldingTaxDetails: HouseholdCashflowRow['propertyHoldingTaxDetails'];
  assetWithdrawal: number;
  assetWithdrawalDetails: { assetId: string; name: string; amount: number }[];
  assetReturnIncome: number;
  assetReturnIncomeDetails: {
    assetId: string;
    name: string;
    amount: number;
  }[];
  assetReinvestedReturn: number;
  assetTransactionDetails: HouseholdCashflowRow['assetTransactionDetails'];
  remainingRetirementAssets: number;
  cashAndFinancialAssetBalance: number;
  replacementHousingValue: number;
  actual: number;
  essential: number;
  gap: number;
  surplus: number;
};

function CashflowYearAgeTick({
  x = 0,
  y = 0,
  payload,
  chartData,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: number | string };
  chartData: CashflowChartPoint[];
}) {
  const year = Number(payload?.value);
  const point = chartData.find((item) => item.year === year);
  if (!point) return null;
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text textAnchor="middle" fill="#475569" fontSize={10}>
        <tspan x="0" dy="12" fontWeight={800}>
          {year}년
        </tspan>
      </text>
      {point.ageB == null ? (
        <text
          x="0"
          y="27"
          textAnchor="middle"
          fill="#2563eb"
          fontSize={10}
          fontWeight={800}
        >
          {point.ageA}세
        </text>
      ) : (
        <>
          <text
            x="-5"
            y="27"
            textAnchor="end"
            fill="#2563eb"
            fontSize={10}
            fontWeight={800}
          >
            {point.ageA}세
          </text>
          <text x="0" y="27" textAnchor="middle" fill="#94a3b8" fontSize={9}>
            /
          </text>
          <text
            x="5"
            y="27"
            textAnchor="start"
            fill="#7c3aed"
            fontSize={10}
            fontWeight={800}
          >
            {point.ageB}세
          </text>
        </>
      )}
    </g>
  );
}

function CashflowChartTooltip({
  active,
  payload,
  result,
  livingCostLegend,
  pinned = false,
  onPin,
  onUnpin,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CashflowChartPoint }>;
  result: SimulationResult;
  livingCostLegend: string;
  pinned?: boolean;
  onPin?: (point: CashflowChartPoint) => void;
  onUnpin?: () => void;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const pensionIncome =
    point.nationalPension + point.basicPension + point.privatePension;
  const balance = point.surplus - point.gap;
  return (
    <div
      data-cashflow-tooltip-pinned={pinned ? 'true' : undefined}
      className={`pointer-events-auto relative z-50 w-[330px] max-w-[calc(100vw-3rem)] overflow-y-auto overscroll-contain rounded-xl border bg-white p-4 text-xs shadow-xl ${
        pinned
          ? 'cursor-default border-emerald-500 ring-2 ring-emerald-200'
          : 'border-slate-200'
      }`}
      style={{ maxHeight: 'min(380px, calc(100vh - 4rem))' }}
    >
      {pinned ? (
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black text-emerald-900">
          <span>상세창 고정됨 · 안쪽을 스크롤하세요</span>
          <button
            type="button"
            className="shrink-0 rounded-md border border-emerald-300 bg-white px-2 py-1 text-emerald-900 hover:bg-emerald-100"
            onClick={() => onUnpin?.()}
          >
            고정 해제
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 block w-[calc(100%+2rem)] border-b border-violet-100 bg-violet-50 px-4 py-2 text-left text-[11px] font-black text-violet-900 hover:bg-violet-100"
          onClick={() => onPin?.(point)}
        >
          클릭하면 상세창 고정 · 내부 스크롤 가능
        </button>
      )}
      <p className="font-black text-slate-950">
        {point.year}년 · {result.a.name} {point.ageA}세
        {point.ageB == null
          ? ''
          : ` · ${result.b?.name ?? '배우자'} ${point.ageB}세`}
      </p>
      <div className="mt-3 grid gap-2">
        <div className="flex justify-between gap-4">
          <span className="font-bold text-slate-700">① 총 월소득</span>
          <b className="text-blue-700">{money(point.incomeBeforeDebt)}</b>
        </div>
        <p className="pl-3 text-[11px] leading-5 text-slate-500">
          근로 {money(point.employmentIncome)} + 연금 {money(pensionIncome)} +
          임대·기타 {money(point.rentalIncomeNet + point.otherIncome)}
        </p>
        <div className="flex justify-between gap-4">
          <span className="font-bold text-slate-700">
            ② 그해 월 대출 원리금
          </span>
          <b className="text-rose-700">-{money(point.debtService)}</b>
        </div>
        <div className="flex justify-between gap-4">
          <span className="font-bold text-slate-700">③ 월 부동산 보유세</span>
          <b className="text-rose-700">-{money(point.propertyHoldingTax)}</b>
        </div>
        {point.propertyHoldingTaxDetails.length > 0 && (
          <p className="pl-3 text-[11px] leading-5 text-rose-700">
            {point.propertyHoldingTaxDetails
              .map((detail) => `${detail.name} ${money(detail.amount)}`)
              .join(' + ')}
          </p>
        )}
        <div className="flex justify-between gap-4">
          <span className="font-bold text-slate-700">
            ④ 현금으로 받는 운용수익
          </span>
          <b className="text-emerald-700">+{money(point.assetReturnIncome)}</b>
        </div>
        {point.assetReturnIncomeDetails.length > 0 && (
          <p className="pl-3 text-[11px] leading-5 text-emerald-700">
            {point.assetReturnIncomeDetails
              .map((detail) => `${detail.name} ${money(detail.amount)}`)
              .join(' + ')}
          </p>
        )}
        <div className="flex justify-between gap-4">
          <span className="font-bold text-slate-700">⑤ 자산 원금 인출</span>
          <b className="text-violet-700">+{money(point.assetWithdrawal)}</b>
        </div>
        {point.assetWithdrawalDetails.length > 0 && (
          <p className="pl-3 text-[11px] leading-5 text-violet-700">
            {point.assetWithdrawalDetails
              .map((detail) => `${detail.name} ${money(detail.amount)}`)
              .join(' + ')}
          </p>
        )}
        <div className="flex justify-between gap-4 rounded-md bg-blue-50 px-2 py-1.5">
          <span className="font-black text-blue-950">
            ⑥ 생활비로 쓸 수 있는 현금
          </span>
          <b className="text-blue-700">{money(point.actual)}</b>
        </div>
        <p className="pl-3 text-[11px] text-slate-500">
          현금·금융자산 잔액 {money(point.cashAndFinancialAssetBalance)} · 생활비
          인출계획 잔액 {money(point.remainingRetirementAssets)} · 새 거주주택{' '}
          {money(point.replacementHousingValue)} · 그해 재투자수익{' '}
          {money(point.assetReinvestedReturn)}
        </p>
        <div className="flex justify-between gap-4 rounded-md bg-teal-50 px-2 py-1.5 text-teal-900">
          <span className="font-black">현재 현금·금융자산 잔액</span>
          <b>{money(point.cashAndFinancialAssetBalance)}</b>
        </div>
        {point.assetTransactionDetails.map((detail) => (
          <div
            key={`${detail.assetId}-${detail.transactionKind}`}
            className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 leading-5 text-violet-950"
          >
            <b>
              {detail.transactionKind === 'sale'
                ? `${detail.soldAssetName} 매각`
                : detail.transactionKind === 'sale_and_purchase'
                  ? `${detail.soldAssetName} 매각 → ${detail.purchasedAssetName ?? '새 주택'} 구입`
                  : `${detail.purchasedAssetName ?? '새 주택'} 구입`}
            </b>
            :{' '}
            {detail.saleProceedsBeforeDebtPayoff != null
              ? '비용·세금 차감 후 매각대금'
              : '매각·대기자금'}{' '}
            {money(detail.saleProceedsBeforeDebtPayoff ?? detail.saleProceeds)}
            {(detail.linkedDebtPayoff ?? 0) > 0 && (
              <>
                {' '}
                - 연결대출 상환 {money(detail.linkedDebtPayoff ?? 0)} = 상환 후{' '}
                {money(detail.saleProceeds)}
              </>
            )}
            {detail.purchaseCost != null && (
              <> - 구입비용 {money(detail.purchaseCost)}</>
            )}
            {' = '}잔여 운용자금 {money(detail.investableSurplus)}
            {detail.transactionKind === 'sale' &&
              detail.investableSurplus === 0 && <> · 새 주택 구입 전 대기</>}
            {detail.fundingShortfall > 0 && (
              <> · 별도 조달 필요 {money(detail.fundingShortfall)}</>
            )}
            {(detail.debtPayoffFundingShortfall ?? 0) > 0 && (
              <>
                {' '}
                · 대출상환 별도자금 필요{' '}
                {money(detail.debtPayoffFundingShortfall ?? 0)}
              </>
            )}
            {(detail.linkedDebtPayoffDetails?.length ?? 0) > 0 && (
              <small className="mt-1 block text-[11px] font-normal text-rose-800">
                {detail.linkedDebtPayoffDetails
                  ?.map((debt) => `${debt.name} ${money(debt.amount)}`)
                  .join(' · ')}
              </small>
            )}
            {(detail.saleBrokerage != null ||
              detail.capitalGainsTaxes != null ||
              detail.purchaseBrokerage != null ||
              detail.acquisitionTaxes != null) && (
              <small className="mt-1 block text-[11px] font-normal text-violet-800">
                {[
                  detail.saleBrokerage != null
                    ? `매도 중개보수 ${money(detail.saleBrokerage)}`
                    : '',
                  detail.capitalGainsTaxes != null
                    ? `양도세·지방세 ${money(detail.capitalGainsTaxes)}`
                    : '',
                  detail.purchaseBrokerage != null
                    ? `매수 중개보수 ${money(detail.purchaseBrokerage)}`
                    : '',
                  detail.acquisitionTaxes != null
                    ? `취득 관련 세금 ${money(detail.acquisitionTaxes)}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                {detail.roughEstimatePolicyId
                  ? ` · ${detail.roughEstimatePolicyId} 참고 추정`
                  : ''}
              </small>
            )}
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <span className="font-bold text-slate-700">⑦ {livingCostLegend}</span>
          <b className="text-orange-700">-{money(point.essential)}</b>
        </div>
        <div
          className={`flex justify-between gap-4 border-t pt-2 text-sm ${
            balance < 0 ? 'text-rose-800' : 'text-emerald-800'
          }`}
        >
          <span className="font-black">⑧ 생활비 후 최종 차이</span>
          <b>
            {balance < 0
              ? `-${money(Math.abs(balance))}`
              : `+${money(balance)}`}
          </b>
        </div>
      </div>
    </div>
  );
}

const digits = (value: string) => Number(value.replace(/\D/g, '')) || 0;
const currentAge = (birth: string) => {
  if (birth.length !== 8) return 55;
  try {
    const date = parseBirth(birth);
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    if (
      today.getMonth() < date.getMonth() ||
      (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())
    )
      age--;
    return Math.max(0, age);
  } catch {
    return 55;
  }
};
const additionalPensionsForSimulation = (form: FormState) =>
  (form.additionalPensions ?? []).map((account) => ({
    ...account,
    balanceBaseAge: currentAge(form[account.owner].birth),
    contributionEndAge:
      account.contributionEndAge ??
      (account.kind === 'retirementIrp' || account.kind === 'dbdc'
        ? Math.min(60, account.startAge)
        : account.startAge),
  }));

function MoneyInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Input
      disabled={disabled}
      inputMode="numeric"
      value={value ? value.toLocaleString('ko-KR') : ''}
      placeholder={placeholder}
      onChange={(e) => onChange(digits(e.target.value))}
    />
  );
}

function HouseholdBasicInfo({
  form,
  policy,
  update,
}: {
  form: FormState;
  policy: Policy;
  update: (who: 'a' | 'b', person: PersonInput) => void;
}) {
  const personBlock = (who: 'a' | 'b', person: PersonInput) => {
    let summary = '생년월일을 입력하면 모든 탭의 나이를 자동 계산합니다.';
    let ageLabel = '—';
    if (person.birth.length === 8) {
      try {
        const birthDate = parseBirth(person.birth);
        ageLabel = `${currentAge(person.birth)}세`;
        summary = `국민연금 정상 수령 ${normalClaimAge(birthDate.getFullYear(), policy)}세`;
      } catch {
        summary = '생년월일을 확인하세요.';
      }
    }
    return (
      <section className="grid gap-3 rounded-xl border border-blue-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">
              {person.name}({who === 'a' ? 'A' : 'B'})
            </p>
            <p className="mt-1 text-xs text-slate-500">{summary}</p>
          </div>
          {who === 'b' && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <Checkbox
                checked={person.enabled}
                onCheckedChange={(value) =>
                  update('b', { ...person, enabled: value === true })
                }
              />
              배우자 있음
            </label>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <label className="grid gap-1.5">
            <span className="field-label">생년월일 8자리</span>
            <Input
              disabled={!person.enabled}
              inputMode="numeric"
              maxLength={8}
              value={person.birth}
              placeholder="19800101"
              onChange={(event) => {
                const birth = event.target.value.replace(/\D/g, '').slice(0, 8);
                let claimAge = person.claimAge;
                if (birth.length === 8) {
                  try {
                    claimAge = normalClaimAge(
                      parseBirth(birth).getFullYear(),
                      policy,
                    );
                  } catch {}
                }
                update(who, { ...person, birth, claimAge });
              }}
            />
          </label>
          <div className="grid gap-1.5">
            <span className="field-label">현재 만나이</span>
            <div
              className={`flex min-h-10 items-center rounded-md border px-3 text-base font-extrabold ${
                person.enabled && ageLabel !== '—'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              {ageLabel}
            </div>
          </div>
        </div>
      </section>
    );
  };
  return (
    <Card className="mb-5 border-blue-200 bg-blue-50/60 shadow-sm">
      <CardHeader className="border-b border-blue-100">
        <CardTitle>부부 공통 기본정보</CardTitle>
        <CardDescription>
          여기 입력한 생년월일 하나로 국민연금 수급연령, 개인·퇴직연금 개시연도,
          현재 나이, 예상 사망연도와 유족연금을 모두 계산합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 lg:grid-cols-2">
        {personBlock('a', form.a)}
        {personBlock('b', form.b)}
      </CardContent>
    </Card>
  );
}

function PersonCard({
  person,
  setPerson,
  optional,
}: {
  person: PersonInput;
  setPerson: (p: PersonInput) => void;
  optional?: boolean;
}) {
  const patch = <K extends keyof PersonInput>(key: K, value: PersonInput[K]) =>
    setPerson({ ...person, [key]: value });
  return (
    <Card
      className={`border-blue-100 shadow-sm ${!person.enabled ? 'bg-slate-50' : ''}`}
    >
      <CardHeader className="border-b border-blue-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>
              {person.name}({person.name === '본인' ? 'A' : 'B'})
            </CardTitle>
            <CardDescription>
              {optional
                ? '연금 미가입 배우자도 유족연금 계산을 위해 포함할 수 있습니다.'
                : 'NPS 앱에 표시된 값을 그대로 입력하세요.'}
            </CardDescription>
          </div>
          {optional && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <Checkbox
                disabled={!person.enabled}
                checked={person.hasNps}
                onCheckedChange={(v) => patch('hasNps', v === true)}
              />
              배우자 본인 국민연금 있음
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="field-label">공단 세전 월 예상연금</span>
          <MoneyInput
            disabled={!person.enabled || !person.hasNps}
            value={person.anchoredMonthlyPension}
            placeholder="1,234,567"
            onChange={(n) => patch('anchoredMonthlyPension', n)}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="field-label">공단 총 예상 가입개월</span>
          <Input
            disabled={!person.enabled || !person.hasNps}
            inputMode="numeric"
            value={person.expectedMonths || ''}
            placeholder="360"
            onChange={(e) =>
              patch('expectedMonths', Math.min(999, digits(e.target.value)))
            }
          />
        </label>
        <label className="grid gap-1.5">
          <span className="field-label">공단 총 예상납부액</span>
          <MoneyInput
            disabled={!person.enabled || !person.hasNps}
            value={person.totalExpectedContribution}
            placeholder="123,456,789"
            onChange={(n) => patch('totalExpectedContribution', n)}
          />
        </label>
        <div className="grid gap-1.5 sm:col-span-2">
          <span className="field-label">총 예상 가입기간</span>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-24"
              disabled={!person.enabled || !person.hasNps}
              inputMode="numeric"
              maxLength={4}
              value={person.periodStartYear}
              placeholder="2000"
              onChange={(e) =>
                patch(
                  'periodStartYear',
                  e.target.value.replace(/\D/g, '').slice(0, 4),
                )
              }
            />
            <span>년</span>
            <Input
              className="w-16"
              disabled={!person.enabled || !person.hasNps}
              inputMode="numeric"
              maxLength={2}
              value={person.periodStartMonth}
              placeholder="01"
              onChange={(e) =>
                patch(
                  'periodStartMonth',
                  e.target.value.replace(/\D/g, '').slice(0, 2),
                )
              }
            />
            <span>월 ~</span>
            <Input
              className="w-24"
              disabled={!person.enabled || !person.hasNps}
              inputMode="numeric"
              maxLength={4}
              value={person.periodEndYear}
              placeholder="2029"
              onChange={(e) =>
                patch(
                  'periodEndYear',
                  e.target.value.replace(/\D/g, '').slice(0, 4),
                )
              }
            />
            <span>년</span>
            <Input
              className="w-16"
              disabled={!person.enabled || !person.hasNps}
              inputMode="numeric"
              maxLength={2}
              value={person.periodEndMonth}
              placeholder="12"
              onChange={(e) =>
                patch(
                  'periodEndMonth',
                  e.target.value.replace(/\D/g, '').slice(0, 2),
                )
              }
            />
            <span>월 · 총 {person.expectedMonths || 0}개월</span>
          </div>
        </div>
        <label className="grid gap-1.5">
          <span className="field-label">현재 월 보험료(선택)</span>
          <MoneyInput
            disabled={!person.enabled || !person.hasNps}
            value={person.currentMonthlyPremium}
            placeholder="모르면 비워두세요"
            onChange={(n) => patch('currentMonthlyPremium', n)}
          />
        </label>
        <div className="sm:col-span-2 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
          {!person.hasNps && person.enabled
            ? '배우자 본인 노령연금은 0원으로 두되, 생년월일과 사망 나이를 이용해 가입자인 배우자 사망 후 유족연금을 계산합니다.'
            : '세후 월 예상연금은 입력하지 않습니다. 전략 비교는 공단의 세전 예상액을 기준으로 계산합니다.'}
        </div>
      </CardContent>
    </Card>
  );
}

function NpsPolicyGuide({ policy }: { policy: Policy }) {
  const guides = policy.npsGuides;
  const [selected, setSelected] = useState(guides[0]?.id ?? 'normal');
  return (
    <Card className="border-blue-200 shadow-sm">
      <CardHeader className="border-b border-blue-100 bg-blue-50/60">
        <CardTitle>국민연금 수령 정책 안내</CardTitle>
        <CardDescription>
          정상·조기·연기 수령과 임의계속가입, 배우자 사망 후 유족연금의 차이를
          확인하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <Tabs value={selected} onValueChange={setSelected}>
          <TabsList className="mb-4 h-auto w-full flex-wrap justify-start bg-slate-100 p-1">
            {guides.map((guide) => (
              <TabsTrigger key={guide.id} value={guide.id}>
                {guide.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {guides.map((guide) => (
            <TabsContent key={guide.id} value={guide.id}>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    누가 받을 수 있나
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.qualification}
                  </p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    언제부터·언제까지
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.timing}
                  </p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    연금액 적용 기준
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.amountRule}
                  </p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    이 프로그램에서는
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.simulatorTip}
                  </p>
                </section>
              </div>
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-start sm:justify-between">
                <p className="leading-6">
                  <b>공단 확인 필요:</b> {guide.caution}
                </p>
                <a
                  className="inline-flex shrink-0 items-center gap-1 font-bold text-blue-700 underline underline-offset-4"
                  href={guide.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {guide.sourceLabel}
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ClaimAgeBar({
  person,
  policy,
  setPerson,
}: {
  person: PersonInput;
  policy: Policy;
  setPerson: (p: PersonInput) => void;
}) {
  const options = claimAgeOptions(
    person.birth,
    person.continuationYears,
    policy,
  );
  const normalAge = options.find((option) => option.normal)?.age ?? 65;
  const adjustmentRate = (age: number) => {
    const offset = age - normalAge;
    return offset < 0
      ? offset * 12 * policy.earlyReductionPerMonth * 100
      : offset * 12 * policy.deferredBonusPerMonth * 100;
  };
  const selectedRate = adjustmentRate(person.claimAge);
  let selectedMonthly = 0;
  try {
    selectedMonthly = pensionAtClaimAge(
      person,
      policy,
      person.claimAge,
    ).selectedMonthlyPension;
  } catch {
    /* 입력 중에는 금액 요약을 숨김 */
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="field-label">연금 수령 나이</span>
        <span className="text-xs text-slate-500">정상 {normalAge}세</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 xl:grid-cols-11">
        {options.map((option) => {
          const rate = adjustmentRate(option.age);
          const selected = person.claimAge === option.age;
          const compactRate = Number.isInteger(rate)
            ? rate.toFixed(0)
            : rate.toFixed(1);
          const rateLabel =
            rate === 0 ? '' : `(${rate > 0 ? '+' : ''}${compactRate}%)`;
          return (
            <Button
              type="button"
              key={option.age}
              size="sm"
              variant={selected ? 'default' : 'outline'}
              disabled={!person.enabled || !person.hasNps || option.disabled}
              className={`h-11 flex-col gap-0 px-0.5 text-[11px] ${option.normal ? 'ring-2 ring-blue-200' : ''}`}
              onClick={() => setPerson({ ...person, claimAge: option.age })}
            >
              <span className="font-bold">{option.age}세</span>
              {rateLabel && (
                <span
                  className={`text-[10px] font-semibold ${
                    rate < 0
                      ? selected
                        ? 'text-rose-200'
                        : 'text-rose-600'
                      : selected
                        ? 'text-emerald-200'
                        : 'text-emerald-700'
                  }`}
                >
                  {rateLabel}
                </span>
              )}
            </Button>
          );
        })}
      </div>
      {person.enabled && person.hasNps && selectedMonthly > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-900">
            <b>{person.claimAge}세 선택</b> ·{' '}
            <span
              className={
                selectedRate < 0
                  ? 'font-bold text-rose-700'
                  : selectedRate > 0
                    ? 'font-bold text-emerald-700'
                    : 'font-bold text-slate-700'
              }
            >
              {selectedRate < 0
                ? `조기수령 ${selectedRate.toFixed(1)}%`
                : selectedRate > 0
                  ? `연기수령 +${selectedRate.toFixed(1)}%`
                  : '정상수령 기준 0%'}
            </span>
          </p>
          <p className="text-sm font-black text-blue-800">
            월 예상 연금 {money(selectedMonthly)}{' '}
            <span className="text-[11px] font-medium">(개시 첫해·세전)</span>
          </p>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        조기수령은 1년 <span className="font-bold text-rose-600">-6.0%</span>,
        연기수령은 1년 <span className="font-bold text-emerald-700">+7.2%</span>
        이며 최대 5년까지 적용됩니다. 임의계속가입 종료 전 나이는 선택할 수
        없습니다.
      </p>
    </div>
  );
}

export function PensionGoalEditor({
  goals,
  personA,
  personB,
  netReturnRate,
  includeLateLifeGap,
  setGoals,
  setNetReturnRate,
  setIncludeLateLifeGap,
}: {
  goals: PensionGoalRange[];
  personA: PersonInput;
  personB: PersonInput;
  netReturnRate: number;
  includeLateLifeGap: boolean;
  setGoals: (goals: PensionGoalRange[]) => void;
  setNetReturnRate: (rate: number) => void;
  setIncludeLateLifeGap: (enabled: boolean) => void;
}) {
  const birthYearA =
    personA.birth.length === 8 ? Number(personA.birth.slice(0, 4)) : null;
  const birthYearB =
    personB.enabled && personB.birth.length === 8
      ? Number(personB.birth.slice(0, 4))
      : null;
  const patchGoal = (id: string, patch: Partial<PensionGoalRange>) =>
    setGoals(
      goals.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)),
    );
  const addGoal = () => {
    const sorted = [...goals].sort(
      (left, right) => left.startAge - right.startAge,
    );
    const last = sorted[sorted.length - 1];
    const startAge = last?.endAge ?? Math.min(95, (last?.startAge ?? 60) + 5);
    setGoals([
      ...goals,
      {
        id: `goal-${Date.now()}`,
        startAge,
        endAge: Math.min(100, startAge + 5),
        monthlyA: 0,
        monthlyB: 0,
      },
    ]);
  };

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="border-b border-emerald-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>구간별 목표 월연금</CardTitle>
            <CardDescription>
              본인 나이 구간을 기준으로 세후 목표액을 각각 입력하세요. 부부 합산
              목표는 자동 계산됩니다.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={addGoal}>
            <Plus /> 목표 구간 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        {goals.length === 0 && (
          <div className="rounded-lg border border-dashed border-emerald-200 bg-white p-6 text-center text-sm text-slate-500">
            목표 구간을 추가하면 현재 연금과 비교해 부족액을 계산합니다.
          </div>
        )}
        {goals
          .slice()
          .sort((left, right) => left.startAge - right.startAge)
          .map((goal) => {
            const spouseAgeOffset =
              birthYearA != null && birthYearB != null
                ? birthYearA - birthYearB
                : null;
            const endDisplay = goal.endAge == null ? null : goal.endAge - 1;
            const calendarStart =
              birthYearA == null ? null : birthYearA + goal.startAge;
            const calendarEnd =
              birthYearA == null || goal.endAge == null
                ? null
                : birthYearA + goal.endAge - 1;
            return (
              <section
                key={goal.id}
                className="grid gap-4 rounded-xl border border-emerald-100 bg-white p-4 xl:grid-cols-[minmax(150px,.75fr)_minmax(150px,.75fr)_minmax(190px,1fr)_minmax(190px,1fr)_minmax(180px,.9fr)_auto] xl:items-end"
              >
                <label className="grid gap-1.5">
                  <span className="field-label">본인 시작 나이</span>
                  <Input
                    inputMode="numeric"
                    value={goal.startAge}
                    onChange={(event) => {
                      const startAge = Math.min(
                        120,
                        Math.max(0, digits(event.target.value)),
                      );
                      patchGoal(goal.id, {
                        startAge,
                        endAge:
                          goal.endAge != null && goal.endAge <= startAge
                            ? Math.min(120, startAge + 5)
                            : goal.endAge,
                      });
                    }}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">종료</span>
                  <NativeSelect
                    value={goal.endAge ?? 'life'}
                    onChange={(event) =>
                      patchGoal(goal.id, {
                        endAge:
                          event.target.value === 'life'
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  >
                    {Array.from(
                      { length: Math.max(0, 101 - goal.startAge) },
                      (_, index) => goal.startAge + index + 1,
                    ).map((age) => (
                      <NativeSelectOption key={age} value={age}>
                        {age}세 전까지
                      </NativeSelectOption>
                    ))}
                    <NativeSelectOption value="life">
                      부부 모두 사망까지
                    </NativeSelectOption>
                  </NativeSelect>
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">본인 세후 월 목표</span>
                  <MoneyInput
                    value={goal.monthlyA}
                    placeholder="1,500,000"
                    onChange={(monthlyA) => patchGoal(goal.id, { monthlyA })}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">배우자 세후 월 목표</span>
                  <MoneyInput
                    disabled={!personB.enabled}
                    value={personB.enabled ? goal.monthlyB : 0}
                    placeholder="1,500,000"
                    onChange={(monthlyB) => patchGoal(goal.id, { monthlyB })}
                  />
                </label>
                <div className="grid gap-1.5">
                  <span className="field-label">부부 합산 목표</span>
                  <div className="flex min-h-10 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 font-extrabold text-emerald-800">
                    {money(
                      goal.monthlyA + (personB.enabled ? goal.monthlyB : 0),
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="목표 구간 삭제"
                  onClick={() =>
                    setGoals(goals.filter((item) => item.id !== goal.id))
                  }
                >
                  <Trash2 />
                </Button>
                <p className="text-xs text-slate-500 xl:col-span-6">
                  본인 {goal.startAge}세 ~{' '}
                  {endDisplay == null ? '마지막 생존' : `${endDisplay}세`}
                  {spouseAgeOffset != null && (
                    <>
                      {' '}
                      · 배우자 {goal.startAge + spouseAgeOffset}세 ~{' '}
                      {endDisplay == null
                        ? '마지막 생존'
                        : `${endDisplay + spouseAgeOffset}세`}
                    </>
                  )}
                  {calendarStart != null && (
                    <>
                      {' '}
                      · {calendarStart}년 ~{' '}
                      {calendarEnd == null
                        ? '부부 모두 사망 시'
                        : `${calendarEnd}년`}
                    </>
                  )}
                </p>
              </section>
            );
          })}
        <div className="grid gap-4 rounded-xl border border-emerald-100 bg-white p-4 lg:grid-cols-[220px_1fr] lg:items-center">
          <label className="grid gap-1.5">
            <span className="field-label">부족재원 설계 기대 순수익률</span>
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
              기본값은 기간형 연금이 끝난 뒤의 자연스러운 감소분을 추가 적립
              제안에서 제외합니다. 체크하면 마지막 생존 시점까지 필요한 재원도
              계산합니다.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StrategyCard({
  person,
  policy,
  setPerson,
}: {
  person: PersonInput;
  policy: Policy;
  setPerson: (p: PersonInput) => void;
}) {
  const disabled = !person.enabled || !person.hasNps;
  return (
    <Card className={!person.enabled ? 'opacity-55' : ''}>
      <CardHeader>
        <CardTitle>{person.name} 선택 전략</CardTitle>
        <CardDescription>
          {!person.hasNps && person.enabled
            ? '본인 연금 전략은 없지만 예상 사망 나이는 유족연금 계산에 반영됩니다.'
            : '조건만 고르면 보고서 전체에 자동 반영됩니다.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="field-label">임의계속가입 기간</span>
            <NativeSelect
              disabled={disabled}
              value={person.continuationYears}
              onChange={(e) => {
                const years = Number(e.target.value);
                setPerson({
                  ...person,
                  continuationYears: years,
                  claimAge: Math.max(person.claimAge, 60 + years),
                });
              }}
            >
              {[0, 1, 2, 3, 4, 5].map((y) => (
                <NativeSelectOption key={y} value={y}>
                  {y}년
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5">
            <span className="field-label">임의계속가입 월 납입액</span>
            <MoneyInput
              disabled={disabled}
              value={person.continuationPremium}
              onChange={(n) => setPerson({ ...person, continuationPremium: n })}
            />
          </label>
        </div>
        <ClaimAgeBar person={person} policy={policy} setPerson={setPerson} />
        <label className="grid max-w-44 gap-1.5">
          <span className="field-label">예상 사망 나이</span>
          <Input
            disabled={!person.enabled}
            inputMode="numeric"
            value={person.deathAge || ''}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) =>
              setPerson({
                ...person,
                deathAge: digits(event.target.value),
              })
            }
            onBlur={(event) =>
              setPerson({
                ...person,
                deathAge: Math.min(
                  120,
                  Math.max(60, digits(event.target.value)),
                ),
              })
            }
          />
        </label>
      </CardContent>
    </Card>
  );
}

function NpsInflationControls({
  settings,
  setSettings,
}: {
  settings: NationalPensionInflationSettings;
  setSettings: (settings: NationalPensionInflationSettings) => void;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <label className="flex min-w-64 flex-1 items-start gap-3">
          <Checkbox
            checked={settings.enabled}
            onCheckedChange={(value) =>
              setSettings({ ...settings, enabled: value === true })
            }
          />
          <span>
            <b className="block text-lg font-black tracking-tight">
              국민연금 물가상승률 연동 적용
            </b>
            <small className="mt-1 block leading-5 text-slate-600">
              체크하면 수령 개시 다음 해부터 매년 1월 연금액이 설정한 예상
              물가상승률만큼 증가합니다. 해제하면 최초 월액을 계속 유지합니다.
            </small>
          </span>
        </label>
        <label className="grid w-48 gap-1.5">
          <span className="field-label">연평균 예상 물가상승률</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="-10"
              max="20"
              step="0.1"
              disabled={!settings.enabled}
              value={settings.annualRate}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  annualRate: Math.min(
                    20,
                    Math.max(-10, Number(event.target.value) || 0),
                  ),
                })
              }
            />
            <span className="font-bold">%</span>
          </div>
        </label>
        <p className="w-full border-t border-blue-100 pt-3 text-xs leading-5 text-blue-950">
          공단은 실제 전년도 전국 소비자물가변동률을 반영합니다. 2026년 지급액은
          2025년 물가를 반영해 2.1% 인상됐습니다.
          <a
            className="ml-1 font-bold text-blue-700 underline underline-offset-2"
            href="https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?pstId=ZZ202600000000000024"
            target="_blank"
            rel="noreferrer"
          >
            국민연금공단 기준 확인
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function AdditionalPensionStrategyControls({
  accounts,
  people,
  policy,
  setAccounts,
}: {
  accounts: AdditionalPensionInput[];
  people: { a: PersonInput; b: PersonInput };
  policy: Policy;
  setAccounts: (accounts: AdditionalPensionInput[]) => void;
}) {
  const replace = (updated: AdditionalPensionInput) =>
    setAccounts(accounts.map((x) => (x.id === updated.id ? updated : x)));
  const visibleAccounts = accounts.filter(
    (account) => account.owner === 'a' || people.b.enabled,
  );
  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="border-b border-indigo-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>개인·퇴직연금 수령 전략</CardTitle>
            <CardDescription>
              기본 계좌 정보는 유지하고 수령 개시와 기간을 바꾸어 전체 보고서를
              비교하세요. 적립금 방식의 월액은 조건에 따라 다시 계산됩니다.
            </CardDescription>
          </div>
          <Badge className="bg-indigo-700 text-white">
            변경 즉시 자동 반영
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-5">
        {visibleAccounts.length === 0 && (
          <div className="rounded-lg border border-dashed border-indigo-200 bg-white p-6 text-center text-sm text-slate-500">
            등록된 개인·퇴직연금이 없습니다. 2번 탭에서 계좌를 추가하면 이곳에
            수령 전략이 표시됩니다.
          </div>
        )}
        {visibleAccounts.map((account) => {
          const owner = people[account.owner];
          const birthYear =
            owner.birth.length === 8 ? Number(owner.birth.slice(0, 4)) : 0;
          const minimumAge =
            account.kind === 'annuityInsurance'
              ? 45
              : policy.privatePension.minimumStartAge;
          const fixedQuote = account.calculationMode === 'monthly';
          const contributionFrequency =
            account.contributionFrequency ??
            ((account.monthlyContributionUntilStart ?? 0) > 0
              ? 'monthly'
              : 'none');
          const contributionAmount =
            account.contributionAmount ??
            account.monthlyContributionUntilStart ??
            0;
          const contributionEndAge =
            account.contributionEndAge ??
            (account.kind === 'retirementIrp' || account.kind === 'dbdc'
              ? Math.min(60, account.startAge)
              : account.startAge);
          const ageOptions = Array.from(
            { length: 91 - minimumAge },
            (_, index) => minimumAge + index,
          );
          if (!ageOptions.includes(account.startAge))
            ageOptions.push(account.startAge);
          ageOptions.sort((a, b) => a - b);
          const patch = <K extends keyof AdditionalPensionInput>(
            key: K,
            value: AdditionalPensionInput[K],
          ) => replace({ ...account, [key]: value });
          let preview: ReturnType<typeof previewAdditionalPension> | null =
            null;
          try {
            if (account.enabled)
              preview = previewAdditionalPension(account, owner, policy);
          } catch {
            /* 입력이 완성되면 종합 계산과 함께 표시 */
          }
          return (
            <section
              key={account.id}
              className={`grid gap-4 rounded-xl border bg-white p-4 lg:grid-cols-[minmax(300px,1.6fr)_minmax(150px,.8fr)_minmax(140px,.7fr)_minmax(280px,1.4fr)] lg:items-end ${
                account.enabled
                  ? 'border-indigo-100'
                  : 'border-slate-200 opacity-65'
              }`}
            >
              <div className="self-center">
                <label className="flex items-center gap-2 font-bold">
                  <Checkbox
                    checked={account.enabled}
                    onCheckedChange={(value) =>
                      patch('enabled', value === true)
                    }
                  />
                  {owner.name} · {account.name}
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  {pensionKindLabels[account.kind]}
                </p>
                {fixedQuote ? (
                  <p className="mt-2 text-sm font-bold text-slate-700">
                    금융기관 등록 월액 {money(account.directMonthlyAmount)}
                  </p>
                ) : (
                  <div className="mt-2 grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-md bg-slate-100 px-2 py-1">
                        현재 <b>{money(account.expectedBalance)}</b>
                      </span>
                      <span className="font-black text-indigo-500">→</span>
                      <span className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-950">
                        개시 예상{' '}
                        <b>
                          {preview?.projectedStartBalance != null
                            ? money(preview.projectedStartBalance)
                            : '계산 대기'}
                        </b>
                      </span>
                    </div>
                    {preview?.projectedStartBalance != null && (
                      <p className="text-[11px] leading-4 text-slate-600">
                        {contributionFrequency === 'none' ||
                        contributionAmount <= 0 ? (
                          <b>추가납입 없음</b>
                        ) : (
                          <>
                            <b>
                              {
                                contributionFrequencyLabels[
                                  contributionFrequency
                                ]
                              }{' '}
                              {money(contributionAmount)} · {contributionEndAge}
                              세까지{' '}
                              {Math.round(
                                (preview.projectedContributionUntilStart ?? 0) /
                                  contributionAmount,
                              )}
                              회
                            </b>{' '}
                            = 추가납입 합계{' '}
                            <b>
                              {money(
                                preview.projectedContributionUntilStart ?? 0,
                              )}
                            </b>
                          </>
                        )}{' '}
                        · 개시 전 운용손익{' '}
                        <b
                          className={
                            (preview.projectedInvestmentGainBeforeStart ?? 0) >=
                            0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }
                        >
                          {(preview.projectedInvestmentGainBeforeStart ?? 0) > 0
                            ? '+'
                            : ''}
                          {money(
                            preview.projectedInvestmentGainBeforeStart ?? 0,
                          )}
                        </b>{' '}
                        · 개시 전 순 기대수익률{' '}
                        <b>
                          {(
                            (account.annualReturnRateBeforeStart ?? 0) -
                            account.annualFeeRate
                          ).toFixed(1)}
                          %
                        </b>
                      </p>
                    )}
                  </div>
                )}
              </div>
              <label className="grid gap-1.5">
                <span className="field-label">수령 개시</span>
                <NativeSelect
                  disabled={!account.enabled || fixedQuote}
                  value={account.startAge}
                  onChange={(event) => {
                    const startAge = Number(event.target.value);
                    replace({
                      ...account,
                      startAge,
                      contributionEndAge: Math.min(
                        contributionEndAge,
                        startAge,
                      ),
                    });
                  }}
                >
                  {ageOptions.map((age) => (
                    <NativeSelectOption key={age} value={age}>
                      {age}세{birthYear ? ` · ${birthYear + age}년` : ''}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5">
                <span className="field-label">수령기간</span>
                <NativeSelect
                  disabled={!account.enabled || fixedQuote}
                  value={account.payoutYears}
                  onChange={(event) =>
                    patch('payoutYears', Number(event.target.value))
                  }
                >
                  {account.calculationMode === 'monthly' && (
                    <NativeSelectOption value={0}>
                      종신·미지정
                    </NativeSelectOption>
                  )}
                  {[5, 10, 15, 20, 30].map((years) => (
                    <NativeSelectOption key={years} value={years}>
                      {years}년
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                <p className="text-[11px] font-bold text-indigo-700">
                  {fixedQuote
                    ? '금융기관 예상 세전 월 지급액'
                    : `${account.payoutYears}년 균등 인출 계획액`}
                </p>
                <p className="mt-0.5 text-lg font-black text-indigo-950">
                  {preview ? money(preview.grossMonthly) : '계산 대기'}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-slate-600">
                  {!account.enabled
                    ? '계산에서 제외된 계좌입니다.'
                    : fixedQuote
                      ? '금융기관에서 입력한 고정 월액입니다.'
                      : preview?.projectedStartBalance != null
                        ? `원금과 운용수익을 함께 인출 · 수령 중 순 기대수익률 ${(account.annualReturnRate - account.annualFeeRate).toFixed(1)}% 유지 시 마지막 지급 후 예상 잔액 약 0원. 실제 수익률이 달라지면 월액 또는 최종 잔액도 달라집니다.`
                        : '개시·기간 변경 시 자동 재계산됩니다.'}
                </p>
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PublicPensionAndLivingCostControls({
  people,
  policy,
  basicPension,
  livingCost,
  setBasicPension,
  setLivingCost,
}: {
  people: { a: PersonInput; b: PersonInput };
  policy: Policy;
  basicPension: BasicPensionSettings;
  livingCost: LivingCostSettings;
  setBasicPension: (settings: BasicPensionSettings) => void;
  setLivingCost: (settings: LivingCostSettings) => void;
}) {
  const recipients =
    Number(basicPension.a) + Number(people.b.enabled && basicPension.b);
  const eachAmount =
    recipients >= 2
      ? policy.basicPension.coupleEachMonthly
      : policy.basicPension.standardMonthly;
  const livingCostBase = livingCostMonthly(
    livingCost,
    policy.livingCostBenchmarks.general.baseYear,
    false,
    policy,
  );
  const retiredCouple = livingCost.reference === 'retiredCouple';
  const customLivingCost = livingCost.reference === 'custom';
  return (
    <Card className="border-cyan-200 bg-cyan-50/30">
      <CardHeader className="border-b border-cyan-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>기초연금·국가 생활비 비교 기준</CardTitle>
            <CardDescription>
              실제 자격을 확정하는 기능은 아니며, 선택한 수급 가정과 국가 공식
              생활비 기준을 종합 보고서에 즉시 반영합니다.
            </CardDescription>
          </div>
          <Badge className="bg-cyan-800 text-white">
            정책 {policy.policyId}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 xl:grid-cols-2">
        <section className="rounded-xl border border-cyan-100 bg-white p-4">
          <h3 className="font-black">기초연금 적용 여부</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            만 65세부터 적용합니다. 부부가 모두 선택되면 각각 20% 감액한 월{' '}
            {money(policy.basicPension.coupleEachMonthly)}을 반영합니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
              <Checkbox
                checked={basicPension.a}
                onCheckedChange={(value) =>
                  setBasicPension({ ...basicPension, a: value === true })
                }
              />
              <span>
                <b>{people.a.name} 기초연금 적용</b>
                <small className="mt-1 block text-slate-500">
                  65세부터 월 {money(eachAmount)} 가정
                </small>
              </span>
            </label>
            <label
              className={`flex items-start gap-2 rounded-lg border border-slate-200 p-3 ${
                people.b.enabled ? '' : 'opacity-50'
              }`}
            >
              <Checkbox
                disabled={!people.b.enabled}
                checked={people.b.enabled && basicPension.b}
                onCheckedChange={(value) =>
                  setBasicPension({ ...basicPension, b: value === true })
                }
              />
              <span>
                <b>{people.b.name} 기초연금 적용</b>
                <small className="mt-1 block text-slate-500">
                  65세부터 월 {money(eachAmount)} 가정
                </small>
              </span>
            </label>
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            {policy.basicPension.baseYear}년 기준 단독 최대 월{' '}
            {money(policy.basicPension.standardMonthly)}. 실제 금액은
            소득인정액·국민연금액·부부감액 심사에 따라 달라집니다.
            <a
              className="ml-1 font-bold text-blue-700 underline underline-offset-2"
              href="https://basicpension.mohw.go.kr/menu.es?mid=a10103010000"
              target="_blank"
              rel="noreferrer"
            >
              보건복지부 기준 확인
            </a>
          </p>
        </section>

        <section className="rounded-xl border border-cyan-100 bg-white p-4">
          <h3 className="font-black">그래프에 표시할 국가 생활비 기준</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            일반 가구의 공적 기준 또는 국민연금연구원이 조사한 노후 부부
            생활비를 선택하고, 기대 물가상승률로 매년 증가시켜 표시합니다.
          </p>
          <fieldset
            className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"
            aria-label="생활비 조사 대상"
          >
            <Button
              type="button"
              variant={
                livingCost.reference === 'general' ? 'default' : 'outline'
              }
              className="h-auto min-h-12 flex-col py-2"
              aria-pressed={livingCost.reference === 'general'}
              onClick={() =>
                setLivingCost({ ...livingCost, reference: 'general' })
              }
            >
              <span className="font-black">일반 가구</span>
              <span className="text-[11px] opacity-80">
                가구원 수별 공적 기준
              </span>
            </Button>
            <Button
              type="button"
              variant={retiredCouple ? 'default' : 'outline'}
              className="h-auto min-h-12 flex-col py-2"
              aria-pressed={retiredCouple}
              onClick={() =>
                setLivingCost({ ...livingCost, reference: 'retiredCouple' })
              }
            >
              <span className="font-black">노후 부부</span>
              <span className="text-[11px] opacity-80">
                은퇴 후 최소·적정 생활비
              </span>
            </Button>
            <Button
              type="button"
              variant={customLivingCost ? 'default' : 'outline'}
              className="h-auto min-h-12 flex-col py-2"
              aria-pressed={customLivingCost}
              onClick={() =>
                setLivingCost({ ...livingCost, reference: 'custom' })
              }
            >
              <span className="font-black">우리 집 실제 생활비</span>
              <span className="text-[11px] opacity-80">직접 입력 기준</span>
            </Button>
          </fieldset>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {customLivingCost ? (
              <label className="grid gap-1.5">
                <span className="field-label">기준연도</span>
                <Input
                  inputMode="numeric"
                  value={livingCost.customBaseYear ?? 2026}
                  onChange={(event) =>
                    setLivingCost({
                      ...livingCost,
                      customBaseYear: digits(event.target.value),
                    })
                  }
                />
              </label>
            ) : retiredCouple ? (
              <div className="grid gap-1.5">
                <span className="field-label">가구 구성</span>
                <div className="flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
                  은퇴 후 부부 2인
                </div>
              </div>
            ) : (
              <label className="grid gap-1.5">
                <span className="field-label">가구원 수</span>
                <NativeSelect
                  value={livingCost.householdSize}
                  onChange={(event) =>
                    setLivingCost({
                      ...livingCost,
                      householdSize: Number(event.target.value),
                    })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((size) => (
                    <NativeSelectOption key={size} value={size}>
                      {size}인 가구
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            )}
            {customLivingCost ? (
              <label className="grid gap-1.5">
                <span className="field-label">현재 월 생활비</span>
                <Input
                  inputMode="numeric"
                  value={(livingCost.customMonthlyAmount ?? 0).toLocaleString(
                    'ko-KR',
                  )}
                  onChange={(event) =>
                    setLivingCost({
                      ...livingCost,
                      customMonthlyAmount: digits(event.target.value),
                    })
                  }
                />
              </label>
            ) : (
              <label className="grid gap-1.5">
                <span className="field-label">비교 기준</span>
                <NativeSelect
                  value={livingCost.basis}
                  onChange={(event) =>
                    setLivingCost({
                      ...livingCost,
                      basis: event.target.value as LivingCostSettings['basis'],
                    })
                  }
                >
                  <NativeSelectOption value="minimum">
                    {retiredCouple ? '노후 최소생활비' : '생계급여 기준 32%'}
                  </NativeSelectOption>
                  <NativeSelectOption value="median">
                    {retiredCouple ? '노후 적정생활비' : '기준중위소득 100%'}
                  </NativeSelectOption>
                </NativeSelect>
              </label>
            )}
            <label className="grid gap-1.5">
              <span className="field-label">기대 물가상승률</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={livingCost.annualInflationRate}
                  onChange={(event) =>
                    setLivingCost({
                      ...livingCost,
                      annualInflationRate: Math.min(
                        10,
                        Math.max(0, Number(event.target.value) || 0),
                      ),
                    })
                  }
                />
                <span className="text-sm font-bold">%</span>
              </div>
            </label>
          </div>
          <p className="mt-3 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-semibold leading-5 text-cyan-950">
            {customLivingCost ? (
              <>
                직접 입력한 월 생활비를 2026년 가치로 환산하면{' '}
                <b>{money(livingCostBase)}</b>
              </>
            ) : retiredCouple ? (
              <>
                국민연금연구원 2024년 조사 기준 · 부부{' '}
                {livingCost.basis === 'minimum' ? '최소' : '적정'} 생활비를
                2026년 물가로 환산하면 월 {money(livingCostBase)}
              </>
            ) : (
              <>
                2026년 {livingCost.householdSize}인 일반 가구{' '}
                {livingCost.basis === 'minimum'
                  ? '생계급여 선정기준'
                  : '기준중위소득'}{' '}
                월 {money(livingCostBase)}
              </>
            )}
            {!customLivingCost && (
              <a
                className="ml-1 text-blue-700 underline underline-offset-2"
                href={
                  retiredCouple
                    ? 'https://www.nps.or.kr/pnsgdnc/nscvrgdata/getOHAE0002M1.do?hmpgBbsCd=BS20240145&hmpgCd=01&menuId=MN24000898&pageIndex=1&pstId=ZZ202500000000001624&sortSe=FR'
                    : 'https://www.mohw.go.kr/menu.es?mid=a10708010300'
                }
                target="_blank"
                rel="noreferrer"
              >
                {retiredCouple
                  ? '국민연금공단 조사 확인'
                  : '보건복지부 기준 확인'}
              </a>
            )}
          </p>
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <h4 className="font-black text-violet-950">
              첫 사망 후 생존자 1인 생활비
            </h4>
            <p className="mt-1 text-xs leading-5 text-violet-800">
              예상 사망 나이가 되는 연도 말까지 생존한 것으로 보고, 다음
              연도부터 선택한 1인 생활비를 적용합니다.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="field-label">적용 방식</span>
                <NativeSelect
                  value={livingCost.survivorMode ?? 'same_as_couple'}
                  onChange={(event) =>
                    setLivingCost({
                      ...livingCost,
                      survivorMode: event.target
                        .value as LivingCostSettings['survivorMode'],
                    })
                  }
                >
                  <NativeSelectOption value="same_as_couple">
                    부부 생활비와 동일
                  </NativeSelectOption>
                  <NativeSelectOption value="ratio">
                    부부 생활비의 비율
                  </NativeSelectOption>
                  <NativeSelectOption value="custom">
                    월 생활비 직접 입력
                  </NativeSelectOption>
                </NativeSelect>
              </label>
              {(livingCost.survivorMode ?? 'same_as_couple') === 'ratio' && (
                <label className="grid gap-1.5">
                  <span className="field-label">부부 생활비 대비 비율(%)</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={livingCost.survivorRatio ?? 75}
                    onChange={(event) =>
                      setLivingCost({
                        ...livingCost,
                        survivorRatio: Math.min(
                          100,
                          Math.max(0, Number(event.target.value) || 0),
                        ),
                      })
                    }
                  />
                </label>
              )}
              {(livingCost.survivorMode ?? 'same_as_couple') === 'custom' && (
                <>
                  <label className="grid gap-1.5">
                    <span className="field-label">1인 생활비 기준연도</span>
                    <Input
                      inputMode="numeric"
                      value={livingCost.survivorBaseYear ?? 2026}
                      onChange={(event) =>
                        setLivingCost({
                          ...livingCost,
                          survivorBaseYear: digits(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="field-label">1인 월 생활비</span>
                    <Input
                      inputMode="numeric"
                      value={(
                        livingCost.survivorMonthlyAmount ?? 0
                      ).toLocaleString('ko-KR')}
                      onChange={(event) =>
                        setLivingCost({
                          ...livingCost,
                          survivorMonthlyAmount: digits(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

const pensionKindLabels: Record<AdditionalPensionInput['kind'], string> = {
  pensionSavings: '연금저축',
  irpPersonal: 'IRP 개인납입분',
  retirementIrp: '퇴직급여 IRP',
  dbdc: 'DB·DC 퇴직연금',
  annuityInsurance: '일반 연금보험',
};

const contributionFrequencyLabels: Record<
  NonNullable<AdditionalPensionInput['contributionFrequency']>,
  string
> = {
  none: '추가납입 없음',
  monthly: '월납',
  quarterly: '분기납',
  semiannual: '반기납',
  annual: '연납',
};

function newAdditionalPension(
  owner: 'a' | 'b',
  sequence: number,
  ownerBirth: string,
): AdditionalPensionInput {
  const baseAge = currentAge(ownerBirth);
  const startAge = Math.max(55, baseAge);
  return {
    id: `${owner}-${Date.now()}-${sequence}`,
    owner,
    enabled: true,
    kind: 'pensionSavings',
    name: `연금저축 ${sequence}`,
    calculationMode: 'balance',
    expectedBalance: 0,
    balanceBaseAge: baseAge,
    monthlyContributionUntilStart: 0,
    contributionFrequency: 'none',
    contributionAmount: 0,
    contributionEndAge: startAge,
    annualReturnRateBeforeStart: 3,
    directMonthlyAmount: 0,
    startAge,
    payoutYears: 10,
    annualReturnRate: 2,
    annualFeeRate: 0.5,
    accountYearsAtStart: 0,
    accountOpenDate: '',
    annuityPaymentTermYears: 5,
    annuityPaymentTermKnown: false,
    annuityPremiumPaying: true,
    deferredRetirementTax: 0,
  };
}

function AdditionalPensionCard({
  owner,
  ownerName,
  ownerEnabled,
  ownerBirth,
  accounts,
  setAccounts,
}: {
  owner: 'a' | 'b';
  ownerName: string;
  ownerEnabled: boolean;
  ownerBirth: string;
  accounts: AdditionalPensionInput[];
  setAccounts: (accounts: AdditionalPensionInput[]) => void;
}) {
  const ownerAccounts = accounts.filter((x) => x.owner === owner);
  const replace = (updated: AdditionalPensionInput) =>
    setAccounts(accounts.map((x) => (x.id === updated.id ? updated : x)));
  const remove = (id: string) =>
    setAccounts(accounts.filter((x) => x.id !== id));
  return (
    <Card className={!ownerEnabled ? 'opacity-55' : 'border-indigo-100'}>
      <CardHeader className="border-b border-indigo-50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{ownerName}의 개인·퇴직연금</CardTitle>
            <CardDescription>
              계좌가 여러 개면 각각 추가하세요. 없는 경우 비워두면 됩니다.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!ownerEnabled}
            onClick={() =>
              setAccounts([
                ...accounts,
                newAdditionalPension(
                  owner,
                  ownerAccounts.length + 1,
                  ownerBirth,
                ),
              ])
            }
          >
            <Plus /> 연금 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {ownerAccounts.length === 0 && (
          <div className="rounded-lg border border-dashed p-7 text-center text-sm text-slate-500">
            등록된 개인·퇴직연금이 없습니다.
          </div>
        )}
        {ownerAccounts.map((account) => {
          const patch = <K extends keyof AdditionalPensionInput>(
            key: K,
            value: AdditionalPensionInput[K],
          ) => replace({ ...account, [key]: value });
          const retirement =
            account.kind === 'retirementIrp' || account.kind === 'dbdc';
          const insurance = account.kind === 'annuityInsurance';
          const annuityPaymentTermKnown =
            account.annuityPaymentTermKnown ?? false;
          const recommendedAnnuityTerm = recommendedAnnuityPaymentTermYears(
            account.accountOpenDate,
            true,
          );
          const annuityPaymentTermYears = annuityPaymentTermKnown
            ? (account.annuityPaymentTermYears ?? recommendedAnnuityTerm)
            : recommendedAnnuityTerm;
          const annuityPaymentEnd = annuityPaymentEndDate(
            account.accountOpenDate,
            annuityPaymentTermYears,
          );
          let tenureText = '계좌 개설 연월을 입력하면 자동 계산됩니다.';
          if (account.accountOpenDate && ownerBirth.length === 8) {
            try {
              const months = accountTenureMonthsAtStart(account, ownerBirth);
              tenureText =
                months < 0
                  ? '수령 시작보다 늦은 개설일입니다.'
                  : `수령 시작 시 가입기간 ${Math.floor(months / 12)}년 ${months % 12}개월`;
            } catch {
              tenureText = '계좌 개설 연월을 확인하세요.';
            }
          }
          return (
            <section
              key={account.id}
              className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Checkbox
                    checked={account.enabled}
                    onCheckedChange={(v) => patch('enabled', v === true)}
                  />
                  계산에 포함
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(account.id)}
                  aria-label={`${account.name} 삭제`}
                >
                  <Trash2 /> 삭제
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="field-label">연금 종류</span>
                  <NativeSelect
                    value={account.kind}
                    onChange={(e) => {
                      const kind = e.target
                        .value as AdditionalPensionInput['kind'];
                      replace({
                        ...account,
                        kind,
                        name: pensionKindLabels[kind],
                        contributionEndAge:
                          kind === 'retirementIrp' || kind === 'dbdc'
                            ? Math.min(60, account.startAge)
                            : account.startAge,
                        calculationMode:
                          kind === 'annuityInsurance'
                            ? 'monthly'
                            : account.calculationMode,
                        annuityPaymentTermYears:
                          kind === 'annuityInsurance'
                            ? recommendedAnnuityPaymentTermYears(
                                account.accountOpenDate,
                                true,
                              )
                            : account.annuityPaymentTermYears,
                        annuityPaymentTermKnown:
                          kind === 'annuityInsurance'
                            ? false
                            : account.annuityPaymentTermKnown,
                        annuityPremiumPaying:
                          kind === 'annuityInsurance'
                            ? (account.annuityPremiumPaying ?? true)
                            : account.annuityPremiumPaying,
                      });
                    }}
                  >
                    {Object.entries(pensionKindLabels).map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">표시 이름</span>
                  <Input
                    value={account.name}
                    maxLength={30}
                    onChange={(e) => patch('name', e.target.value)}
                    placeholder="예: OO은행 IRP"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">월액 계산 방법</span>
                  <NativeSelect
                    value={account.calculationMode}
                    onChange={(e) =>
                      patch(
                        'calculationMode',
                        e.target
                          .value as AdditionalPensionInput['calculationMode'],
                      )
                    }
                  >
                    <NativeSelectOption value="monthly">
                      금융기관 제시 월액 고정
                    </NativeSelectOption>
                    {!insurance && (
                      <NativeSelectOption value="balance">
                        현재 적립금으로 전략 계산(권장)
                      </NativeSelectOption>
                    )}
                  </NativeSelect>
                </label>
                {account.calculationMode === 'monthly' ? (
                  <label className="grid gap-1.5">
                    <span className="field-label">세전 월 예상 수령액</span>
                    <MoneyInput
                      value={account.directMonthlyAmount}
                      placeholder="500,000"
                      onChange={(n) => patch('directMonthlyAmount', n)}
                    />
                  </label>
                ) : (
                  <label className="grid gap-1.5">
                    <span className="field-label">현재 적립금</span>
                    <MoneyInput
                      value={account.expectedBalance}
                      placeholder="100,000,000"
                      onChange={(n) => patch('expectedBalance', n)}
                    />
                  </label>
                )}
                <label className="grid gap-1.5">
                  <span className="field-label">수령 시작 나이</span>
                  <Input
                    inputMode="numeric"
                    value={account.startAge || ''}
                    onChange={(event) => {
                      const startAge = Math.min(
                        100,
                        digits(event.target.value),
                      );
                      replace({
                        ...account,
                        startAge,
                        contributionEndAge: Math.min(
                          account.contributionEndAge ?? startAge,
                          startAge,
                        ),
                      });
                    }}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">수령기간</span>
                  <NativeSelect
                    value={account.payoutYears}
                    onChange={(e) =>
                      patch('payoutYears', Number(e.target.value))
                    }
                  >
                    {account.calculationMode === 'monthly' && (
                      <NativeSelectOption value={0}>
                        종신·기간 미지정
                      </NativeSelectOption>
                    )}
                    {[5, 10, 15, 20, 30].map((years) => (
                      <NativeSelectOption key={years} value={years}>
                        {years}년
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                {insurance && (
                  <section className="grid gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:col-span-2 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="field-label">보험 계약 시작 연월</span>
                      <Input
                        type="month"
                        value={account.accountOpenDate ?? ''}
                        onChange={(event) => {
                          const accountOpenDate = event.target.value;
                          const recommended =
                            recommendedAnnuityPaymentTermYears(
                              accountOpenDate,
                              true,
                            );
                          replace({
                            ...account,
                            accountOpenDate,
                            annuityPaymentTermYears: annuityPaymentTermKnown
                              ? annuityPaymentTermYears
                              : recommended,
                          });
                        }}
                      />
                    </label>
                    <div className="grid gap-2">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <Checkbox
                          checked={annuityPaymentTermKnown}
                          onCheckedChange={(value) => {
                            const known = value === true;
                            replace({
                              ...account,
                              annuityPaymentTermKnown: known,
                              annuityPaymentTermYears: known
                                ? annuityPaymentTermYears
                                : recommendedAnnuityTerm,
                            });
                          }}
                        />
                        약정 납입기간을 정확히 알고 있음
                      </label>
                      <label className="grid gap-1.5">
                        <span className="field-label">보험료 납입기간</span>
                        <NativeSelect
                          disabled={!annuityPaymentTermKnown}
                          value={annuityPaymentTermYears}
                          onChange={(event) =>
                            patch(
                              'annuityPaymentTermYears',
                              Number(event.target.value),
                            )
                          }
                        >
                          {[5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(
                            (years) => (
                              <NativeSelectOption key={years} value={years}>
                                {years}년납
                              </NativeSelectOption>
                            ),
                          )}
                        </NativeSelect>
                        {!annuityPaymentTermKnown && (
                          <small className="font-semibold text-blue-700">
                            자동 선택: {annuityPaymentTermYears}년납
                          </small>
                        )}
                      </label>
                    </div>
                    <p className="text-xs leading-5 text-sky-900 sm:col-span-2">
                      {account.accountOpenDate
                        ? `약정 납입 종료 연월은 단순 계산으로 ${annuityPaymentEnd.replace('-', '년 ')}월입니다.`
                        : '시작 연월을 입력하지 않으면 일반적인 최소 납입기간인 5년납을 기본 가정합니다.'}{' '}
                      기간을 모르면 현재까지 보험료를 납입 중인 것으로 보고 이미
                      지난 기간보다 짧지 않은 5년 단위 기간을 자동 선택합니다.
                      정확히 알면 체크한 뒤 보험증권의 약정기간을 선택하세요.
                    </p>
                  </section>
                )}
                {account.calculationMode === 'balance' && (
                  <>
                    <div className="grid gap-4 sm:col-span-2 lg:grid-cols-3">
                      <label className="grid gap-1.5">
                        <span className="field-label">
                          개시 전 추가납입 주기
                        </span>
                        <NativeSelect
                          value={
                            account.contributionFrequency ??
                            ((account.monthlyContributionUntilStart ?? 0) > 0
                              ? 'monthly'
                              : 'none')
                          }
                          onChange={(event) =>
                            patch(
                              'contributionFrequency',
                              event.target
                                .value as AdditionalPensionInput['contributionFrequency'],
                            )
                          }
                        >
                          <NativeSelectOption value="none">
                            추가납입 없음
                          </NativeSelectOption>
                          <NativeSelectOption value="monthly">
                            월납
                          </NativeSelectOption>
                          <NativeSelectOption value="quarterly">
                            분기납
                          </NativeSelectOption>
                          <NativeSelectOption value="semiannual">
                            반기납
                          </NativeSelectOption>
                          <NativeSelectOption value="annual">
                            연납
                          </NativeSelectOption>
                        </NativeSelect>
                      </label>
                      <label className="grid gap-1.5">
                        <span className="field-label">회당 추가납입액</span>
                        <MoneyInput
                          disabled={
                            (account.contributionFrequency ??
                              ((account.monthlyContributionUntilStart ?? 0) > 0
                                ? 'monthly'
                                : 'none')) === 'none'
                          }
                          value={
                            account.contributionAmount ??
                            account.monthlyContributionUntilStart ??
                            0
                          }
                          placeholder="납입 1회 금액"
                          onChange={(n) => patch('contributionAmount', n)}
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="field-label">추가납입 종료 나이</span>
                        <NativeSelect
                          disabled={
                            (account.contributionFrequency ??
                              ((account.monthlyContributionUntilStart ?? 0) > 0
                                ? 'monthly'
                                : 'none')) === 'none'
                          }
                          value={
                            account.contributionEndAge ??
                            (retirement
                              ? Math.min(60, account.startAge)
                              : account.startAge)
                          }
                          onChange={(event) =>
                            patch(
                              'contributionEndAge',
                              Number(event.target.value),
                            )
                          }
                        >
                          {Array.from(
                            {
                              length:
                                Math.max(
                                  0,
                                  account.startAge - currentAge(ownerBirth),
                                ) + 1,
                            },
                            (_, index) => currentAge(ownerBirth) + index,
                          ).map((age) => (
                            <NativeSelectOption key={age} value={age}>
                              {age}세
                              {retirement && age === 60 ? ' · 퇴직 기본' : ''}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                    </div>
                    <div className="grid gap-4 sm:col-span-2 lg:grid-cols-3">
                      <label className="grid gap-1.5">
                        <span className="field-label">
                          개시 전 기대 수익률(%)
                        </span>
                        <Input
                          type="number"
                          min="-10"
                          max="20"
                          step="0.1"
                          value={account.annualReturnRateBeforeStart ?? 0}
                          onChange={(e) =>
                            patch(
                              'annualReturnRateBeforeStart',
                              Number(e.target.value) || 0,
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="field-label">
                          수령 중 기대 수익률(%)
                        </span>
                        <Input
                          type="number"
                          min="-10"
                          max="20"
                          step="0.1"
                          value={account.annualReturnRate}
                          onChange={(e) =>
                            patch(
                              'annualReturnRate',
                              Number(e.target.value) || 0,
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="field-label">연 수수료(%)</span>
                        <Input
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                          value={account.annualFeeRate}
                          onChange={(e) =>
                            patch('annualFeeRate', Number(e.target.value) || 0)
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
                {!insurance && !retirement && (
                  <label className="grid gap-1.5">
                    <span className="field-label">계좌 개설 연월</span>
                    <Input
                      type="month"
                      value={account.accountOpenDate ?? ''}
                      onChange={(event) =>
                        patch('accountOpenDate', event.target.value)
                      }
                    />
                    <small
                      className={
                        tenureText.includes('늦은') ||
                        tenureText.includes('확인')
                          ? 'text-red-600'
                          : 'text-blue-700'
                      }
                    >
                      {tenureText}
                    </small>
                  </label>
                )}
                {retirement && (
                  <label className="grid gap-1.5">
                    <span className="field-label">
                      일시금 수령 시 예상 퇴직소득세(선택)
                    </span>
                    <MoneyInput
                      value={account.deferredRetirementTax}
                      placeholder="모르면 비워두세요"
                      onChange={(n) => patch('deferredRetirementTax', n)}
                    />
                  </label>
                )}
              </div>
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-900">
                {insurance
                  ? '연금보험은 상품별 예정이율·보증기간·종신 조건이 다르므로 보험사가 제시한 월 예상액을 입력합니다.'
                  : retirement
                    ? '퇴직급여가 들어간 연금계좌는 5년 가입기간 요건의 예외로 계산합니다.'
                    : '연금저축·개인납입 IRP는 만 55세 이상, 계좌 가입 5년 이상 조건을 확인합니다.'}
              </p>
              {account.calculationMode === 'monthly' && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  입력한 월액은 현재 선택한 개시 나이·수령기간에 대한 금융기관
                  견적으로 고정됩니다. 다른 조건을 비교하려면 금융기관의 새
                  월액을 입력하거나 적립금 계산 방식으로 전환하세요.
                </p>
              )}
              {account.kind === 'dbdc' &&
                account.calculationMode === 'balance' && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
                    DC형은 회사 규약에 따라 월납·분기납·반기납·연납을 선택해
                    반영할 수 있습니다. DB형은 개인 계좌에 같은 방식으로
                    추가납입하는 구조가 아니므로 추가납입 없음으로 두고 회사가
                    제시한 예상 퇴직급여를 사용하세요.
                  </p>
                )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AdditionalPensionGuide({ policy }: { policy: Policy }) {
  const guides = policy.privatePension.guides;
  const [selected, setSelected] = useState<AdditionalPensionInput['kind']>(
    guides[0]?.kind ?? 'pensionSavings',
  );
  return (
    <Card className="border-indigo-200 shadow-sm">
      <CardHeader className="border-b border-indigo-100 bg-indigo-50/60">
        <CardTitle>연금 종류별 수령 기준 안내</CardTitle>
        <CardDescription>
          연금 이름을 선택하면 수령 가능 시점·기간·일시금 여부와 입력 방법을
          확인할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <Tabs
          value={selected}
          onValueChange={(value) =>
            setSelected(value as AdditionalPensionInput['kind'])
          }
        >
          <TabsList className="mb-4 h-auto w-full flex-wrap justify-start bg-slate-100 p-1">
            {guides.map((guide) => (
              <TabsTrigger key={guide.kind} value={guide.kind}>
                {guide.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {guides.map((guide) => (
            <TabsContent key={guide.kind} value={guide.kind}>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    언제부터 받을 수 있나
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.receiptStart}
                  </p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    몇 년 동안 받나
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.receiptPeriod}
                  </p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    연금·일시금 선택
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.receiptMethod}
                  </p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    이 프로그램에는 무엇을 입력하나
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.simulatorTip}
                  </p>
                </section>
              </div>
              <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  수령 개시를 늦추면 유리한가
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-950">
                  {guide.delayEffect}
                </p>
              </section>
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-start sm:justify-between">
                <p className="leading-6">
                  <b>주의:</b> {guide.caution}
                </p>
                <a
                  className="inline-flex shrink-0 items-center gap-1 font-bold text-blue-700 underline underline-offset-4"
                  href={guide.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {guide.sourceLabel}
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <Card className={tone === 'danger' ? 'border-rose-200' : 'border-blue-100'}>
      <CardContent className="pt-5 text-center">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p
          className={`mt-2 text-2xl font-black tracking-tight ${
            tone === 'danger' ? 'text-rose-800' : 'text-blue-700'
          }`}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-slate-500">{note}</p>
      </CardContent>
    </Card>
  );
}

type SummaryTableRow = {
  group: string;
  item: string;
  value: string;
  note: string;
  tone?: 'default' | 'danger' | 'success';
};

const cashflowWarningLabels: Record<string, string> = {
  DEBT_SERVICE_MISSING: '대출 상환정보 미입력',
  RENTAL_NET_INCOME_PARTIAL: '임대 순수입 부분 추정',
  SURVIVOR_LIVING_COST_UNCHANGED: '첫 사망 후 생활비 확인',
  TAX_ESTIMATE_PARTIAL: '연금 세금 부분 추정',
  ASSET_USE_NOT_CONVERTIBLE: '자산 현금화 계획 확인',
  LINKED_DEBT_ASSET_MISSING: '대출 연결 자산 확인',
  LINKED_DEBT_SALE_NOT_SCHEDULED: '연결 자산 매각연도 확인',
  LINKED_DEBT_PAYOFF_SHORTFALL: '매각대금 대비 대출잔액 부족',
  HOUSING_PURCHASE_BEFORE_SALE: '주택 구입·매각 순서 확인',
  HOUSING_PURCHASE_FUNDING_SHORTFALL: '새 주택 구입자금 부족',
  REAL_ESTATE_COST_ROUGH_ESTIMATE: '부동산 세금·중개보수 참고 추정',
};

function SummaryTable({
  rows,
  valueHeading = '금액·상태',
}: {
  rows: SummaryTableRow[];
  valueHeading?: string;
}) {
  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-slate-100">
            <TableHead className="w-36 font-black text-slate-800">
              구분
            </TableHead>
            <TableHead className="w-56 font-black text-slate-800">
              항목
            </TableHead>
            <TableHead className="w-52 text-right font-black text-slate-800">
              {valueHeading}
            </TableHead>
            <TableHead className="font-black text-slate-800">
              계산 의미
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const previousGroup = rows[index - 1]?.group;
            return (
              <TableRow
                key={`${row.group}-${row.item}`}
                className={previousGroup !== row.group ? 'border-t-2' : ''}
              >
                <TableCell className="font-black text-slate-700">
                  {previousGroup === row.group ? '' : row.group}
                </TableCell>
                <TableCell className="font-semibold text-slate-800">
                  {row.item}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap text-right text-base font-black ${
                    row.tone === 'danger'
                      ? 'text-rose-800'
                      : row.tone === 'success'
                        ? 'text-emerald-700'
                        : 'text-blue-700'
                  }`}
                >
                  {row.value}
                </TableCell>
                <TableCell className="text-xs leading-5 text-slate-600">
                  {row.note}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function HouseholdRetirementSettings({
  people,
  setPerson,
  netReturnRate,
  setNetReturnRate,
  includeLateLifeGap,
  setIncludeLateLifeGap,
}: {
  people: { a: PersonInput; b: PersonInput };
  setPerson: (
    owner: 'a' | 'b',
    patch: Pick<
      PersonInput,
      'employmentIncomeEnabled' | 'retirementAge' | 'preRetirementMonthlyIncome'
    >,
  ) => void;
  netReturnRate: number;
  setNetReturnRate: (rate: number) => void;
  includeLateLifeGap: boolean;
  setIncludeLateLifeGap: (enabled: boolean) => void;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="border-b border-emerald-100">
        <CardTitle>가구 소득활동·은퇴 설정</CardTitle>
        <CardDescription>
          은퇴 전 실제 세후 월소득과 종료 시점을 입력합니다. 이후 분석은 희망
          목표액이 아니라 실제 예상 연금소득과 선택한 생활비 기준의 차이로
          계산합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        <div className="grid gap-3 lg:grid-cols-2">
          {(['a', 'b'] as const).map((owner) => {
            const person = people[owner];
            const employmentIncomeEnabled =
              person.employmentIncomeEnabled ?? person.enabled;
            const retirementAge = person.retirementAge ?? 60;
            const gapYears = person.hasNps
              ? Math.max(0, person.claimAge - retirementAge)
              : null;
            const applyPatch = (
              patch: Partial<
                Pick<
                  PersonInput,
                  | 'employmentIncomeEnabled'
                  | 'retirementAge'
                  | 'preRetirementMonthlyIncome'
                >
              >,
            ) =>
              setPerson(owner, {
                employmentIncomeEnabled,
                retirementAge,
                preRetirementMonthlyIncome:
                  person.preRetirementMonthlyIncome ?? 0,
                ...patch,
              });
            return (
              <section
                key={owner}
                className={`rounded-xl border p-4 ${
                  owner === 'a'
                    ? 'border-blue-200 bg-blue-50/40'
                    : 'border-violet-200 bg-violet-50/40'
                } ${person.enabled ? '' : 'opacity-50'}`}
              >
                <label className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Checkbox
                    disabled={!person.enabled}
                    checked={employmentIncomeEnabled}
                    onCheckedChange={(value) =>
                      applyPatch({ employmentIncomeEnabled: value === true })
                    }
                  />
                  {person.name} 가구 근로·사업소득 참여
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="field-label">
                      은퇴 전 예상 세후 월소득
                    </span>
                    <Input
                      disabled={!person.enabled || !employmentIncomeEnabled}
                      inputMode="numeric"
                      value={(
                        person.preRetirementMonthlyIncome ?? 0
                      ).toLocaleString('ko-KR')}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        applyPatch({
                          preRetirementMonthlyIncome: digits(
                            event.target.value,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="field-label">예상·실제 은퇴 나이</span>
                    <Input
                      disabled={!person.enabled || !employmentIncomeEnabled}
                      inputMode="numeric"
                      value={retirementAge || ''}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        applyPatch({
                          retirementAge: digits(event.target.value),
                        })
                      }
                      onBlur={(event) =>
                        applyPatch({
                          retirementAge: Math.min(
                            80,
                            Math.max(40, digits(event.target.value)),
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  {!employmentIncomeEnabled
                    ? '가구 근로소득 참여자에서 제외합니다.'
                    : person.hasNps
                      ? gapYears && gapYears > 0
                        ? `${retirementAge}세 은퇴부터 ${person.claimAge}세 국민연금 개시까지 ${gapYears}년의 전환 구간이 있습니다.`
                        : '은퇴 시점과 국민연금 개시 사이의 개인 공백이 없습니다.'
                      : `${retirementAge}세 은퇴 이후 개인·퇴직연금과 가구 생활비의 차이를 분석합니다.`}
                </p>
              </section>
            );
          })}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1.5 rounded-xl border border-emerald-100 bg-white p-4">
            <span className="field-label">생활비 공백 준비 기대 순수익률</span>
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
          <label className="flex items-start gap-3 rounded-xl border border-violet-200 bg-white p-4">
            <Checkbox
              checked={includeLateLifeGap}
              onCheckedChange={(value) => setIncludeLateLifeGap(value === true)}
            />
            <span>
              <b className="block text-sm text-violet-950">
                첫 사망 이후 후기 부족까지 기본 필요재원에 포함
              </b>
              <small className="mt-1 block leading-5 text-slate-500">
                해제하면 첫 사망 이후 부족은 별도 후기 위험으로 표시하고 기본
                준비재원에서는 분리합니다.
              </small>
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeEventTimeline({
  result,
  policy,
  livingCost,
  chartData,
  livingCostLegend,
  cashflowRows,
}: {
  result: SimulationResult;
  policy: Policy;
  livingCost: LivingCostSettings;
  chartData: CashflowChartPoint[];
  livingCostLegend: string;
  cashflowRows: HouseholdCashflowRow[];
}) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear;
  const endYear = Math.max(
    startYear + 1,
    cashflowRows.at(-1)?.year ?? startYear + 1,
  );
  const eventGroups = useMemo(() => {
    const groups = buildIncomeTimelineEvents(result, startYear).filter(
      (group) => group.year >= startYear && group.year <= endYear,
    );
    const merged = new Map<number, IncomeTimelineEventGroup>(
      groups.map((group) => [group.year, group]),
    );
    for (const row of cashflowRows) {
      if (!row.assetTransactionDetails.length) continue;
      const transactionEvents = row.assetTransactionDetails.map(
        (detail, index) => {
          const purchaseText = detail.purchasedAssetName
            ? `${detail.purchasedAssetName} 구입비용 ${money(detail.purchaseCost ?? 0)}, 구입 후 운용 가능 잔여금 ${money(detail.investableSurplus)}`
            : `순매각대금 ${money(detail.saleProceeds)}`;
          const debtPayoffText =
            (detail.linkedDebtPayoff ?? 0) > 0
              ? `, 연결대출 ${money(detail.linkedDebtPayoff ?? 0)} 자동상환 후 금액`
              : '';
          return {
            id: `asset-transaction-${row.year}-${detail.assetId}-${index}`,
            year: row.year,
            kind: detail.purchasedAssetName
              ? ('housingPurchase' as const)
              : ('housingSale' as const),
            title: detail.purchasedAssetName
              ? detail.transactionKind === 'sale_and_purchase'
                ? `${detail.soldAssetName} 매각 → ${detail.purchasedAssetName} 구입`
                : `${detail.purchasedAssetName} 구입`
              : `${detail.soldAssetName} 매각`,
            description: `${purchaseText}${debtPayoffText}${detail.fundingShortfall > 0 ? `, 별도 조달 필요액 ${money(detail.fundingShortfall)}` : ''}${(detail.debtPayoffFundingShortfall ?? 0) > 0 ? `, 대출상환 별도자금 ${money(detail.debtPayoffFundingShortfall ?? 0)} 필요` : ''}`,
          };
        },
      );
      const existing = merged.get(row.year);
      merged.set(row.year, {
        id: existing?.id ?? `asset-events-${row.year}`,
        year: row.year,
        title: existing
          ? `${existing.title} · 주거이전`
          : transactionEvents.map((event) => event.title).join(' · '),
        events: [...(existing?.events ?? []), ...transactionEvents],
      });
    }
    return [...merged.values()].sort((a, b) => a.year - b.year);
  }, [cashflowRows, endYear, result, startYear]);
  const [selectedYear, setSelectedYear] = useState(startYear);
  const [selectedEventId, setSelectedEventId] = useState(
    eventGroups[0]?.id ?? '',
  );
  const [pinnedTooltipYear, setPinnedTooltipYear] = useState<number | null>(
    null,
  );
  const pinnedTooltipPoint =
    pinnedTooltipYear == null
      ? null
      : (chartData.find((point) => point.year === pinnedTooltipYear) ?? null);
  useEffect(() => {
    if (pinnedTooltipYear == null) return;
    const releasePinnedTooltip = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-cashflow-tooltip-pinned="true"]')
      )
        return;
      setPinnedTooltipYear(null);
    };
    document.addEventListener('pointerdown', releasePinnedTooltip);
    return () =>
      document.removeEventListener('pointerdown', releasePinnedTooltip);
  }, [pinnedTooltipYear]);
  const visibleSelectedYear = Math.min(
    endYear,
    Math.max(startYear, selectedYear),
  );
  const visibleSelectedEventId = eventGroups.some(
    (group) => group.id === selectedEventId,
  )
    ? selectedEventId
    : (eventGroups[0]?.id ?? '');
  const selectedCashflow =
    cashflowRows.find((row) => row.year === visibleSelectedYear) ??
    cashflowRows[0];
  const selectedSnapshot = incomeTimelineSnapshot(
    result,
    visibleSelectedYear,
    selectedCashflow?.livingCost ??
      livingCostMonthly(livingCost, visibleSelectedYear, false, policy),
  );
  const selectedEvents = eventGroups.find(
    (group) => group.year === visibleSelectedYear,
  );
  const range = Math.max(1, endYear - startYear);
  const position = (year: number) => ((year - startYear) / range) * 100;
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
  const selectEvent = (id: string) => {
    setSelectedEventId(id);
    const group = eventGroups.find((event) => event.id === id);
    if (group) setSelectedYear(group.year);
  };
  const selectYear = (year: number) => {
    setSelectedYear(year);
    const event = eventGroups.find((group) => group.year === year);
    if (event) setSelectedEventId(event.id);
  };
  return (
    <section
      data-print-section="cashflow-chart"
      className="min-w-0 max-w-full overflow-visible rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4 shadow-sm"
    >
      <div className="grid min-w-0 max-w-full gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-emerald-950">
            2. 연도별 소득·생활비·현금자산 통합 분석
          </h3>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            위 그래프의 소득·생활비 차이와 아래 사건 설명은 같은 연도 데이터를
            사용합니다. 막대 표식이나 탭을 누르면 그래프에도 선택 연도가
            표시됩니다.
          </p>
        </div>
        <Badge
          data-print="hide"
          className="w-fit max-w-full bg-emerald-700 px-3 py-1 text-white"
        >
          {visibleSelectedYear}년 · {result.a.name}{' '}
          {selectedCashflow?.ageA ?? selectedSnapshot.ageA}세
          {(selectedCashflow?.ageB ?? selectedSnapshot.ageB) == null
            ? ''
            : ` · ${result.b?.name ?? '배우자'} ${selectedCashflow?.ageB ?? selectedSnapshot.ageB}세`}
        </Badge>
      </div>
      <div
        data-print-block="cashflow-chart"
        className="mt-4 min-w-0 max-w-full overflow-visible rounded-xl border border-emerald-100 bg-white p-4"
      >
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="font-black text-slate-950">
              연도·부부 나이별 월 가구 현금흐름과 생활비 차이
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              파란선은 총소득에서 그해 대출 원리금을 빼고, 등록한 계획에 따른
              자산 운용수익과 계획 인출액을 더해 실제 생활비로 쓸 수 있는 월
              현금입니다. 초록 점선은 현금으로 받는 운용수익, 보라 점선은 자산
              원금 인출액, 주황 점선은 생활비 기준입니다. 진한 청록선은 오른쪽
              축으로 읽는 현금·금융자산 잔액이며 실거주 중인 주택 가치는
              포함하지 않습니다.
            </p>
            <p
              data-print="hide"
              className="mt-2 w-fit rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-900"
            >
              사용법: 선 위에서 움직여 확인하고, 원하는 연도를 클릭하면 상세창이
              고정되어 안쪽을 스크롤할 수 있습니다. 바깥을 클릭하면 고정이
              해제됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1 text-blue-700">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> 본인 나이
            </span>
            <span className="flex items-center gap-1 text-violet-700">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-600" /> 배우자 나이
            </span>
            <Badge variant="outline">단위: 월 원</Badge>
          </div>
        </div>
        <div
          data-print="chart-canvas"
          className="relative z-10 h-[420px] w-full min-w-0 max-w-full overflow-visible"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 14, right: 30, left: 16, bottom: 34 }}
              onClick={(state) => {
                const index = Number(state.activeTooltipIndex);
                if (Number.isInteger(index) && chartData[index])
                  setPinnedTooltipYear(chartData[index].year);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ec" />
              <XAxis
                dataKey="year"
                minTickGap={46}
                height={48}
                tick={(props) => (
                  <CashflowYearAgeTick {...props} chartData={chartData} />
                )}
                axisLine={{ stroke: '#94a3b8' }}
              />
              <YAxis
                yAxisId="monthly"
                width={72}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) =>
                  value >= 1000000
                    ? `${(value / 1000000).toFixed(1)}백만`
                    : `${Math.round(value / 10000)}만`
                }
                axisLine={{ stroke: '#94a3b8' }}
              />
              <YAxis
                yAxisId="assets"
                orientation="right"
                width={76}
                tick={{ fontSize: 10, fill: '#0f766e' }}
                tickFormatter={(value) =>
                  value >= 100000000
                    ? `${(value / 100000000).toFixed(1)}억`
                    : `${Math.round(value / 10000)}만`
                }
                axisLine={{ stroke: '#0f766e' }}
              />
              <Tooltip
                active={pinnedTooltipPoint ? false : undefined}
                allowEscapeViewBox={{ x: false, y: false }}
                wrapperStyle={{ zIndex: 50, pointerEvents: 'auto' }}
                content={(props) => (
                  <CashflowChartTooltip
                    active={props.active}
                    payload={
                      props.payload as unknown as Array<{
                        payload?: CashflowChartPoint;
                      }>
                    }
                    result={result}
                    livingCostLegend={livingCostLegend}
                    onPin={(point) => setPinnedTooltipYear(point.year)}
                  />
                )}
              />
              <Area
                yAxisId="monthly"
                type="monotone"
                dataKey="gap"
                fill="#fecaca"
                stroke="#ef4444"
                fillOpacity={0.45}
                strokeWidth={1.5}
              />
              <Line
                yAxisId="monthly"
                type="stepAfter"
                dataKey="assetReturnIncome"
                stroke="#059669"
                strokeWidth={2}
                strokeDasharray="7 4"
                dot={false}
              />
              <Line
                yAxisId="monthly"
                type="stepAfter"
                dataKey="assetWithdrawal"
                stroke="#7c3aed"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                yAxisId="monthly"
                type="monotone"
                dataKey="actual"
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="monthly"
                type="monotone"
                dataKey="essential"
                stroke="#d97706"
                strokeWidth={2.5}
                strokeDasharray="7 5"
                dot={false}
              />
              <Line
                yAxisId="assets"
                type="monotone"
                dataKey="cashAndFinancialAssetBalance"
                stroke="#0f766e"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <ReferenceLine
                yAxisId="monthly"
                x={visibleSelectedYear}
                stroke="#047857"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `${visibleSelectedYear}년`,
                  position: 'insideTopRight',
                  fill: '#047857',
                  fontSize: 11,
                  fontWeight: 800,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {pinnedTooltipPoint && (
            <div className="absolute right-3 top-3 z-[70]">
              <CashflowChartTooltip
                active
                payload={[{ payload: pinnedTooltipPoint }]}
                result={result}
                livingCostLegend={livingCostLegend}
                pinned
                onUnpin={() => setPinnedTooltipYear(null)}
              />
            </div>
          )}
        </div>
        <div
          className="mt-3 grid min-w-0 max-w-full grid-cols-1 gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="그래프 범례"
        >
          {[
            {
              label: '생활비 사용 가능 현금(순소득 + 운용수익 + 자산인출)',
              color: '#2563eb',
              style: 'solid',
            },
            {
              label: '현금으로 받는 자산 운용수익',
              color: '#059669',
              style: 'dashed',
            },
            {
              label: '계획 자산 원금 인출액',
              color: '#7c3aed',
              style: 'dashed',
            },
            {
              label: '현금·금융자산 잔액(오른쪽 축)',
              color: '#0f766e',
              style: 'solid',
            },
            {
              label: livingCostLegend,
              color: '#d97706',
              style: 'dashed',
            },
            {
              label: '생활비 기준 부족액',
              color: '#ef4444',
              style: 'area',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex min-w-0 items-start gap-2 text-[11px] font-bold leading-4 text-slate-700"
            >
              {item.style === 'area' ? (
                <span
                  className="mt-1 h-2.5 w-5 shrink-0 rounded-sm border"
                  style={{
                    borderColor: item.color,
                    backgroundColor: '#fecaca',
                  }}
                />
              ) : (
                <span
                  className="mt-2 w-5 shrink-0 border-t-2"
                  style={{
                    borderColor: item.color,
                    borderTopStyle:
                      item.style === 'dashed' ? 'dashed' : 'solid',
                  }}
                />
              )}
              <span className="min-w-0 break-words">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div data-print="hide">
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-black text-emerald-950">연도와 소득 사건 선택</h4>
        <span className="text-xs text-emerald-800">
          선택 결과는 위 그래프·아래 금액·사건 설명에 함께 적용
        </span>
      </div>
      <Input
        className="mt-3 h-3 cursor-ew-resize border-0 bg-transparent p-0 accent-emerald-700 shadow-none"
        type="range"
        min={startYear}
        max={endYear}
        step={1}
        value={visibleSelectedYear}
        aria-label="소득을 비교할 연도"
        onChange={(event) => selectYear(Number(event.target.value))}
      />
      <div className="relative mt-11 hidden h-16 md:block">
        <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-emerald-300" />
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
        {eventGroups.map((group, index) => {
          const selected = group.id === visibleSelectedEventId;
          return (
            <button
              type="button"
              key={group.id}
              title={`${group.year}년 · ${group.events.map((event) => event.title).join(' · ')}`}
              className={`absolute z-10 -translate-x-1/2 rounded-md border px-1.5 py-0.5 text-[10px] font-black shadow-sm transition ${
                selected
                  ? 'border-amber-500 bg-amber-100 text-amber-950 ring-2 ring-amber-200'
                  : 'border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50'
              }`}
              style={{
                left: `${position(group.year)}%`,
                top: index % 2 === 0 ? '-22px' : '-42px',
              }}
              onClick={() => selectEvent(group.id)}
            >
              {group.year} · {group.title}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Metric
          label={`${visibleSelectedYear}년 생활비 사용 가능 현금`}
          value={money(
            selectedCashflow?.householdCashAvailableAfterAsset ??
              selectedSnapshot.householdIncome,
          )}
          note={
            selectedCashflow
              ? `근로 ${money(selectedCashflow.employmentIncome)} + 연금 ${money(selectedCashflow.nationalPension + selectedCashflow.basicPension + selectedCashflow.privatePension)} + 임대·기타 ${money(selectedCashflow.rentalIncomeNet + selectedCashflow.otherIncome)} - 부채상환 ${money(selectedCashflow.debtService)} + 운용수익 ${money(selectedCashflow.assetReturnIncome)} + 자산인출 ${money(selectedCashflow.assetWithdrawal)} · 현금·금융자산 잔액 ${money(selectedCashflow.cashAndFinancialAssetBalance)} · 생활비 인출계획 잔액 ${money(selectedCashflow.remainingRetirementAssets)}`
              : `근로 ${money(selectedSnapshot.employmentA + selectedSnapshot.employmentB)} + 연금 ${money(selectedSnapshot.pensionNetA + selectedSnapshot.pensionNetB)}`
          }
        />
        <Metric
          label={`${visibleSelectedYear}년 ${livingCostLabel(livingCost)}`}
          value={money(
            selectedCashflow?.livingCost ?? selectedSnapshot.livingCost,
          )}
          note="선택한 물가상승률을 반영한 해당 연도 명목금액"
        />
        <Metric
          label="생활비 기준과의 월 차이"
          value={
            (selectedCashflow?.monthlyGap ?? selectedSnapshot.gap) > 0
              ? `-${money(selectedCashflow?.monthlyGap ?? selectedSnapshot.gap)}`
              : money(
                  selectedCashflow?.monthlySurplus ?? selectedSnapshot.surplus,
                )
          }
          note={
            (selectedCashflow?.monthlyGap ?? selectedSnapshot.gap) > 0
              ? '이 연도에만 해당하는 부족 추정액'
              : '이 연도 생활비 기준을 넘는 여유액'
          }
          tone={
            (selectedCashflow?.monthlyGap ?? selectedSnapshot.gap) > 0
              ? 'danger'
              : 'default'
          }
        />
      </div>
      <div
        className={`mt-3 rounded-lg border px-4 py-3 text-sm leading-6 ${
          (selectedCashflow?.monthlyGap ?? selectedSnapshot.gap) > 0
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : 'border-emerald-300 bg-white text-emerald-950'
        }`}
      >
        <b>
          {visibleSelectedYear}년 기준{' '}
          {(selectedCashflow?.monthlyGap ?? selectedSnapshot.gap) > 0
            ? `생활비보다 월 ${money(selectedCashflow?.monthlyGap ?? selectedSnapshot.gap)} 적게 예상됩니다.`
            : `생활비보다 월 ${money(selectedCashflow?.monthlySurplus ?? selectedSnapshot.surplus)} 여유가 예상됩니다.`}
        </b>
        <span className="ml-2 text-xs">
          이 차이는 평생 고정되지 않으며 은퇴·연금 개시·수령 종료 사건마다
          달라집니다.
        </span>
        {selectedEvents && (
          <p className="mt-1 text-xs font-bold">
            이 연도의 사건:{' '}
            {selectedEvents.events.map((event) => event.title).join(' · ')}
          </p>
        )}
      </div>
      {eventGroups.length > 0 && (
        <Tabs
          className="mt-4"
          value={visibleSelectedEventId}
          onValueChange={selectEvent}
        >
          <TabsList className="grid h-auto w-full min-w-0 max-w-full grid-cols-1 gap-1 bg-white p-1 sm:grid-cols-2 xl:grid-cols-4">
            {eventGroups.map((group) => (
              <TabsTrigger
                key={group.id}
                value={group.id}
                className="h-auto w-full min-w-0 flex-col gap-0.5 whitespace-normal px-3 py-2"
              >
                <span className="font-black">{group.year}년</span>
                <span className="text-[10px]">{group.title}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {eventGroups.map((group) => {
            const cashflow = cashflowRows.find(
              (row) => row.year === group.year,
            );
            const previousCashflow = cashflowRows.find(
              (row) => row.year === Math.max(startYear, group.year - 1),
            );
            const snapshot = incomeTimelineSnapshot(
              result,
              group.year,
              cashflow?.livingCost ??
                livingCostMonthly(livingCost, group.year, false, policy),
            );
            const previous = incomeTimelineSnapshot(
              result,
              Math.max(startYear, group.year - 1),
              livingCostMonthly(
                livingCost,
                Math.max(startYear, group.year - 1),
                false,
                policy,
              ),
            );
            return (
              <TabsContent
                key={group.id}
                value={group.id}
                className="rounded-xl border border-emerald-200 bg-white p-4"
              >
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <h4 className="text-lg font-black text-slate-950">
                      {group.year}년 ({result.a.name} {snapshot.ageA}세
                      {snapshot.ageB == null
                        ? ''
                        : ` · ${result.b?.name ?? '배우자'} ${snapshot.ageB}세`}
                      )
                    </h4>
                    <p className="mt-1 text-sm font-bold text-emerald-800">
                      {group.events.map((event) => event.title).join(' · ')}
                    </p>
                  </div>
                  <Badge variant="outline">가구 현금흐름 사건</Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  {group.events.map((event) => (
                    <p
                      key={event.id}
                      className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700"
                    >
                      <b>{event.title}:</b> {event.description}
                    </p>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-sm">
                    <b className="text-blue-900">{result.a.name} 소득 구성</b>
                    <p className="mt-2 leading-6 text-slate-700">
                      근로 {money(snapshot.employmentA)}
                      <br />
                      국민연금 {money(snapshot.nationalA)} · 기초연금{' '}
                      {money(snapshot.basicA)}
                      <br />
                      개인·퇴직연금 {money(snapshot.additionalA)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-sm">
                    <b className="text-violet-900">
                      {result.b?.name ?? '배우자'} 소득 구성
                    </b>
                    <p className="mt-2 leading-6 text-slate-700">
                      근로 {money(snapshot.employmentB)}
                      <br />
                      국민연금 {money(snapshot.nationalB)} · 기초연금{' '}
                      {money(snapshot.basicB)}
                      <br />
                      개인·퇴직연금 {money(snapshot.additionalB)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
                    <b className="text-emerald-900">전년도 대비 가구 변화</b>
                    <p className="mt-2 leading-6 text-slate-700">
                      근로소득{' '}
                      {money(
                        snapshot.employmentA +
                          snapshot.employmentB -
                          previous.employmentA -
                          previous.employmentB,
                      )}
                      <br />
                      세후 연금소득{' '}
                      {money(
                        snapshot.pensionNetA +
                          snapshot.pensionNetB -
                          previous.pensionNetA -
                          previous.pensionNetB,
                      )}
                      <br />
                      가구 합산{' '}
                      {money(
                        (cashflow?.householdCashAvailableAfterAsset ??
                          snapshot.householdIncome) -
                          (previousCashflow?.householdCashAvailableAfterAsset ??
                            previous.householdIncome),
                      )}
                      {cashflow && (
                        <>
                          <br />
                          임대·기타소득{' '}
                          {money(
                            cashflow.rentalIncomeNet + cashflow.otherIncome,
                          )}
                          <br />
                          월 부채상환 -{money(cashflow.debtService)}
                          <br />
                          현금 운용수익 +{money(cashflow.assetReturnIncome)}
                          <br />
                          월 자산인출 +{money(cashflow.assetWithdrawal)}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  {group.year}년 생활비{' '}
                  {money(cashflow?.livingCost ?? snapshot.livingCost)} 대비 그해
                  월 부채상환을 빼고 운용수익·계획 자산인출을 더한 생활비 사용
                  가능 현금{' '}
                  {money(
                    cashflow?.householdCashAvailableAfterAsset ??
                      snapshot.householdIncome,
                  )}
                  로, 월{' '}
                  {(cashflow?.monthlyGap ?? snapshot.gap) > 0
                    ? `${money(cashflow?.monthlyGap ?? snapshot.gap)} 부족`
                    : `${money(cashflow?.monthlySurplus ?? snapshot.surplus)} 여유`}
                  입니다. 이 값은 해당 연도의 명목금액이며 다음 사건에서 다시
                  바뀝니다.
                </p>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
      </div>
    </section>
  );
}

/*
 * 이전의 임의 목표 월연금 기반 보고서입니다.
 * 현재 UI와 번들에서는 제외하고 저장 프로필 마이그레이션 기간 동안만 소스 이력을
 * 남깁니다. 새 분석은 아래 LivingCostIncomeReport를 사용합니다.
 *
function PensionGoalReport({
  result,
  goals,
  netReturnRate,
  includeLateLifeGap,
  livingCost,
}: {
  result: SimulationResult;
  goals: PensionGoalRange[];
  netReturnRate: number;
  includeLateLifeGap: boolean;
  livingCost: LivingCostSettings;
}) {
  const currentYear = new Date().getFullYear();
  const plan = useMemo(
    () =>
      analyzePensionGoals(
        goals,
        result,
        netReturnRate,
        currentYear,
        includeLateLifeGap,
      ),
    [currentYear, goals, includeLateLifeGap, netReturnRate, result],
  );
  const allGuides = plan.ranges.flatMap((range) => range.guides);
  const selectedLivingCostLabel = livingCostLabel(livingCost);
  const householdRetirement = useMemo(
    () =>
      analyzeHouseholdRetirement(
        goals,
        result,
        netReturnRate,
        (year) => livingCostMonthly(livingCost, year),
        currentYear,
      ),
    [currentYear, goals, livingCost, netReturnRate, result],
  );
  const totalRequiredCapital = allGuides.reduce(
    (sum, guide) => sum + guide.requiredCapital,
    0,
  );
  const totalMonthlyContribution = allGuides.reduce(
    (sum, guide) => sum + guide.monthlyContribution,
    0,
  );
  const chartData = useMemo(() => {
    if (goals.length === 0) return [];
    const birthYearA = result.a.birthDate.getFullYear();
    const finalYear = Math.max(
      result.a.deathYear,
      result.b?.deathYear ?? result.a.deathYear,
    );
    const firstYear = Math.min(
      ...goals.map((goal) => birthYearA + goal.startAge),
    );
    const rowByYear = new Map(result.rows.map((row) => [row.year, row]));
    const sortedGoals = [...goals].sort(
      (left, right) => left.startAge - right.startAge,
    );
    return Array.from(
      { length: Math.max(0, finalYear - firstYear + 1) },
      (_, index) => {
        const year = firstYear + index;
        const ageA = year - birthYearA;
        const goal = sortedGoals.find(
          (item) =>
            ageA >= item.startAge &&
            (item.endAge == null || ageA < item.endAge),
        );
        const targetA = year <= result.a.deathYear ? (goal?.monthlyA ?? 0) : 0;
        const targetB =
          result.b && year <= result.b.deathYear ? (goal?.monthlyB ?? 0) : 0;
        const pensionIncome = rowByYear.get(year)?.estimatedNetCombined ?? 0;
        const employmentIncome =
          employmentIncomeAtYear(result.a, year) +
          employmentIncomeAtYear(result.b, year);
        const actual = pensionIncome + employmentIncome;
        const target = targetA + targetB;
        return {
          year,
          ageA,
          ageB: result.b ? year - result.b.birthDate.getFullYear() : null,
          label: `${ageA}세`,
          actual,
          pensionIncome,
          employmentIncome,
          target,
          gap: Math.max(0, target - actual),
          livingCost: livingCostMonthly(livingCost, year),
        };
      },
    );
  }, [goals, livingCost, result]);
  const milestoneCards = useMemo(() => {
    const events = new Map<number, string[]>();
    events.set(currentYear, ['현재 기준']);
    const participants = [result.a, result.b].filter(
      (person) => person?.enabled && person.employmentIncomeEnabled,
    );
    const retirementYears = participants.map(
      (person) =>
        person!.birthDate.getFullYear() + (person!.retirementAge ?? 60),
    );
    const householdRetirementYear = retirementYears.length
      ? Math.max(...retirementYears)
      : null;
    participants.forEach((person) => {
      if (!person) return;
      const owner = person === result.a ? 'A' : 'B';
      const year =
        person.birthDate.getFullYear() + (person.retirementAge ?? 60);
      const labels = events.get(year) ?? [];
      labels.push(
        `${person.name}(${owner}) 은퇴${year === householdRetirementYear ? ' · 가구 은퇴' : ' · 부분 은퇴'}`,
      );
      events.set(year, labels);
    });
    [result.a, result.b].forEach((person) => {
      if (!person?.enabled || !person.hasNps) return;
      const owner = person === result.a ? 'A' : 'B';
      const labels = events.get(person.claimYear) ?? [];
      labels.push(`${person.name}(${owner}) 국민연금 개시`);
      events.set(person.claimYear, labels);
    });
    return [...events.entries()]
      .filter(([year]) => year >= currentYear)
      .sort(([left], [right]) => left - right)
      .map(([year, labels]) => {
        const point = chartData.find((item) => item.year === year);
        return point ? { ...point, eventLabel: labels.join(' · ') } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item != null);
  }, [chartData, currentYear, result]);

  if (goals.length === 0) return null;

  return (
    <Card className="w-full min-w-0 max-w-full border-emerald-200">
      <CardHeader className="border-b border-emerald-100 bg-emerald-50/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>목표 연금 충족도와 종합 가이드</CardTitle>
            <CardDescription>
              은퇴 전 예상 세후 근로소득과 국민·개인·퇴직연금을 입력한 목표와
              비교합니다. 부족재원은 연 {netReturnRate.toFixed(1)}% 순수익률,
              현재 금액 기준으로 계산한 시뮬레이션입니다.
            </CardDescription>
          </div>
          <Badge
            className={plan.allGoalsMet ? 'bg-emerald-700' : 'bg-amber-700'}
          >
            {plan.allGoalsMet ? '설정 목표 충족' : '보완 구간 있음'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 max-w-full gap-5 pt-5 [&>*]:min-w-0 [&>*]:max-w-full">
        {plan.errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {plan.errors.map((error) => (
              <p key={error}>· {error}</p>
            ))}
          </div>
        )}
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div>
            <h3 className="font-black text-indigo-950">
              은퇴 전 소득에서 연금으로 바뀌는 시점
            </h3>
            <p className="mt-1 text-xs leading-5 text-indigo-800">
              각 시점의 두 사람 나이와 예상 월소득을 풀어서 표시합니다.
              근로소득은 입력한 은퇴 연도부터 제외됩니다.
            </p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {milestoneCards.map((milestone) => (
              <div
                key={`${milestone.year}-${milestone.eventLabel}`}
                className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm"
              >
                <p className="text-sm font-black text-indigo-950">
                  {milestone.year}년 (본인 {milestone.ageA}세
                  {milestone.ageB == null
                    ? ''
                    : ` · 배우자 ${milestone.ageB}세`}
                  )
                </p>
                <p className="mt-1 text-xs font-bold text-indigo-700">
                  {milestone.eventLabel}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  근로소득 {money(milestone.employmentIncome)} + 연금{' '}
                  {money(milestone.pensionIncome)}
                </p>
                <p className="text-base font-black text-slate-900">
                  예상 월소득 {money(milestone.actual)}
                </p>
                {milestone.target > 0 && (
                  <p
                    className={`mt-1 text-xs font-bold ${
                      milestone.gap > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    목표 {money(milestone.target)} · 공백 {money(milestone.gap)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
        {householdRetirement && (
          <section className="rounded-xl border-2 border-rose-200 bg-rose-50/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-rose-950">
                  가구 은퇴 생활비 안전선 분석
                </h3>
                <p className="mt-1 text-sm font-bold text-rose-800">
                  {householdRetirement.retirementYear}년 ({result.a.name}{' '}
                  {householdRetirement.ageA}세
                  {householdRetirement.ageB == null
                    ? ''
                    : ` · ${result.b?.name ?? '배우자'} ${householdRetirement.ageB}세`}
                  ) · 두 사람의 근로소득이 모두 끝나는 시점
                </p>
              </div>
              <Badge className="bg-rose-700">개인별 목표와 별도 계산</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Metric
                label={selectedLivingCostLabel}
                value={money(householdRetirement.essentialMonthlyAtRetirement)}
                note={`${householdRetirement.retirementYear}년 물가상승 반영`}
              />
              <Metric
                label="가구 은퇴 시 예상 연금소득"
                value={money(householdRetirement.expectedMonthlyAtRetirement)}
                note="국민·기초·개인·퇴직연금 합산"
              />
              <Metric
                label="필수생활비 월 공백"
                value={
                  householdRetirement.monthlyGapAtRetirement > 0
                    ? `-${money(householdRetirement.monthlyGapAtRetirement)}`
                    : money(0)
                }
                note="개인 목표를 낮춰도 남는 생활비 기준 공백"
                tone={
                  householdRetirement.monthlyGapAtRetirement > 0
                    ? 'danger'
                    : 'default'
                }
              />
            </div>
            {householdRetirement.monthlyGapAtRetirement > 0 ? (
              <>
                <div className="mt-4 rounded-xl border-2 border-rose-300 bg-white p-4 text-center">
                  <p className="text-sm font-bold text-slate-600">
                    가구 은퇴 직후 필수생활비가
                  </p>
                  <p className="mt-1 text-2xl font-black text-rose-700">
                    매월 {money(householdRetirement.monthlyGapAtRetirement)}{' '}
                    부족
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    이후 물가와 연금 개시 시점에 따라 최대 월{' '}
                    {money(householdRetirement.maximumMonthlyGap)}까지 부족할 수
                    있습니다.
                  </p>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border border-violet-200 bg-white p-4">
                    <p className="font-black text-violet-900">
                      1. 기존 퇴직·개인연금 조기 개시 비교
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {householdRetirement.suggestedEarlyAccount ? (
                        <>
                          {householdRetirement.suggestedEarlyAccount.ownerName}
                          의{' '}
                          <b>
                            {householdRetirement.suggestedEarlyAccount.name}
                          </b>
                          은 현재{' '}
                          {
                            householdRetirement.suggestedEarlyAccount
                              .currentStartYear
                          }
                          년(
                          {
                            householdRetirement.suggestedEarlyAccount
                              .currentStartAge
                          }
                          세) 개시입니다. 가구 은퇴 연도로 앞당긴 경우를 2번
                          탭에서 비교하세요.
                        </>
                      ) : (
                        <>
                          가구 은퇴보다 늦게 개시하는 등록 계좌가 없습니다. 2번
                          탭에서 퇴직연금·IRP·연금저축의 실제 개시 가능 연령을
                          확인하세요.
                        </>
                      )}
                    </p>
                    <p className="mt-2 text-xs font-bold text-violet-700">
                      조기 개시는 당장 공백을 줄이지만 이후 월액과 잔액이 감소할
                      수 있습니다.
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white p-4">
                    <p className="font-black text-blue-900">
                      2. 가구 공백 전용 연금 준비
                    </p>
                    {householdRetirement.monthlyContribution > 0 ? (
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        지금부터 <b>{householdRetirement.savingYears}년간</b>{' '}
                        매월{' '}
                        <b className="text-blue-700">
                          {money(householdRetirement.monthlyContribution)}
                        </b>
                        을 준비하면, {householdRetirement.firstGapYear}년부터{' '}
                        {householdRetirement.payoutYears}년간 최대 월{' '}
                        {money(householdRetirement.maximumMonthlyGap)}의 생활비
                        공백을 메우는 보수적 안과 비교할 수 있습니다.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        공백이 이미 시작되었거나 적립기간이 없습니다. 약{' '}
                        <b>{money(householdRetirement.requiredCapital)}</b>의
                        기존 자산 배치안을 우선 비교하세요.
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-white p-4">
                    <p className="font-black text-emerald-900">
                      3. 개인별 목표 조정 가능 범위
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {householdRetirement.adjustableGoalAboveEssential > 0 ? (
                        <>
                          가구 은퇴 시 개인 목표 합계는 월{' '}
                          {money(householdRetirement.combinedGoalAtRetirement)}
                          입니다. 생활비 기준선보다 높은 월{' '}
                          <b>
                            {money(
                              householdRetirement.adjustableGoalAboveEssential,
                            )}
                          </b>
                          까지는 목표 조정 후보로 볼 수 있습니다.
                        </>
                      ) : (
                        <>
                          현재 개인 목표 합계가 가구 생활비 기준선보다 높지
                          않습니다. 개인 목표를 더 낮춰도 필수생활비 공백은
                          해결되지 않습니다.
                        </>
                      )}
                    </p>
                    <p className="mt-2 text-xs font-bold text-emerald-700">
                      생활비 기준선 아래로 목표를 낮추는 것은 별도의 지출 축소
                      계획이 있을 때만 검토하세요.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-sm font-bold text-emerald-800">
                가구 은퇴 시점의 예상 연금소득이 선택한 생활비 기준을
                충족합니다. 개인별 목표는 여유생활비와 목적자금 관점에서 별도로
                조정하세요.
              </div>
            )}
          </section>
        )}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-black">나이별 세후 월소득 흐름</h3>
              <p className="mt-1 text-xs text-slate-500">
                근로소득과 국민·개인·퇴직연금을 합산하여 목표, 부족액과 국가
                생활비 기준을 함께 표시합니다.
              </p>
            </div>
            <Badge variant="outline">단위: 월 원</Badge>
          </div>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 18, left: 16, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ec" />
                <XAxis
                  dataKey="label"
                  minTickGap={22}
                  tick={{ fontSize: 11 }}
                  axisLine={{ stroke: '#94a3b8' }}
                />
                <YAxis
                  width={72}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) =>
                    value >= 1000000
                      ? `${(value / 1000000).toFixed(1)}백만`
                      : `${Math.round(value / 10000)}만`
                  }
                  axisLine={{ stroke: '#94a3b8' }}
                />
                <Tooltip
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as
                      | { year?: number; ageA?: number; ageB?: number | null }
                      | undefined;
                    return point
                      ? `${point.year}년 · ${result.a.name} ${point.ageA}세${point.ageB == null ? '' : ` · ${result.b?.name ?? '배우자'} ${point.ageB}세`}`
                      : '';
                  }}
                  formatter={(value, name) => [
                    money(Number(value)),
                    name === 'actual'
                      ? '예상 세후 월소득(근로+연금)'
                      : name === 'target'
                        ? '목표 합산'
                        : name === 'livingCost'
                          ? selectedLivingCostLabel
                          : '부족액',
                  ]}
                />
                <Legend
                  formatter={(value) =>
                    value === 'actual'
                      ? '예상 세후 월소득(근로+연금)'
                      : value === 'target'
                        ? '목표 합산'
                        : value === 'livingCost'
                          ? selectedLivingCostLabel
                          : '부족액'
                  }
                />
                <Area
                  type="monotone"
                  dataKey="gap"
                  fill="#fecaca"
                  stroke="#ef4444"
                  fillOpacity={0.5}
                  strokeWidth={1.5}
                />
                <Line
                  type="stepAfter"
                  dataKey="target"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="livingCost"
                  stroke="#d97706"
                  strokeWidth={2.5}
                  strokeDasharray="7 5"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <div className="overflow-auto rounded-xl border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>목표 기간</TableHead>
                <TableHead className="text-right">
                  본인 목표 / 예상 소득
                </TableHead>
                <TableHead className="text-right">
                  배우자 목표 / 예상 소득
                </TableHead>
                <TableHead className="text-right">
                  부부 목표 / 예상 소득
                </TableHead>
                <TableHead className="text-right">최대 부족</TableHead>
                <TableHead className="text-right">충족률</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.ranges.map((range) => (
                <TableRow key={range.goal.id}>
                  <TableCell>
                    <b>
                      {range.startYear}년 ~ {range.endYear}년
                    </b>
                    <small className="block text-slate-500">
                      본인 {range.goal.startAge}세 ~{' '}
                      {range.goal.endAge == null
                        ? '마지막 생존'
                        : `${range.goal.endAge - 1}세`}
                      {range.spouseStartAge != null && (
                        <>
                          {' '}
                          · 배우자 {range.spouseStartAge}세 ~{' '}
                          {range.spouseEndAge}세
                        </>
                      )}
                    </small>
                    {range.lateLifeGapExcluded && (
                      <Badge variant="outline" className="mt-2 text-[11px]">
                        후기 노후 보완 제안 제외
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <b>{money(range.goal.monthlyA)}</b>
                    <small className="block text-slate-500">
                      평균 예상 {money(range.averageNetA)}
                    </small>
                  </TableCell>
                  <TableCell className="text-right">
                    <b>{money(result.b ? range.goal.monthlyB : 0)}</b>
                    <small className="block text-slate-500">
                      평균 예상 {money(range.averageNetB)}
                    </small>
                  </TableCell>
                  <TableCell className="text-right">
                    <b>
                      {money(
                        range.goal.monthlyA +
                          (result.b ? range.goal.monthlyB : 0),
                      )}
                    </b>
                    <small className="block text-slate-500">
                      평균 예상 {money(range.averageNetCombined)}
                    </small>
                  </TableCell>
                  <TableCell
                    className={`text-right font-black ${
                      range.maximumCombinedGap > 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {money(range.maximumCombinedGap)}
                    {(range.maximumGapA > 0 || range.maximumGapB > 0) && (
                      <small className="block font-normal text-slate-500">
                        본인 {money(range.maximumGapA)} · 배우자{' '}
                        {money(range.maximumGapB)}
                      </small>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {range.coverageRate.toFixed(0)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {allGuides.length > 0 ? (
          <section className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric
                label="보수적 필요 적립금 합계"
                value={money(totalRequiredCapital)}
                note="각 부족 구간의 최대 부족액을 유지하는 가정"
              />
              <Metric
                label="목표 시점까지 월 추가납입 합계"
                value={
                  totalMonthlyContribution > 0
                    ? money(totalMonthlyContribution)
                    : '목표 시점 도래'
                }
                note="본인·배우자 제안액 합계"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {allGuides.map((guide, index) => (
                <section
                  key={`${guide.owner}-${guide.firstGapYear}-${index}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-black text-amber-950">
                        {guide.firstGapYear}년 (본인 {guide.ageAAtStart}세
                        {guide.ageBAtStart == null
                          ? ''
                          : ` · 배우자 ${guide.ageBAtStart}세`}
                        )
                      </h3>
                      <p className="mt-1 text-sm font-bold text-amber-800">
                        {guide.ownerName}의 목표 월소득 공백 준비
                      </p>
                    </div>
                    <Badge className="bg-amber-700">개인연금 준비안</Badge>
                  </div>
                  {guide.monthsUntilStart > 0 ? (
                    <div className="mt-4 grid items-center gap-2 rounded-xl border-2 border-amber-300 bg-white p-4 text-center md:grid-cols-[1fr_auto_1fr]">
                      <div>
                        <p className="text-xs font-bold text-slate-500">
                          지금부터 {guide.savingYears}년간
                        </p>
                        <p className="mt-1 text-xl font-black text-blue-700">
                          매월 {money(guide.monthlyContribution)} 적립
                        </p>
                      </div>
                      <span className="text-2xl font-black text-amber-600">
                        →
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-500">
                          {guide.firstGapYear}년부터 {guide.payoutYears}년간
                        </p>
                        <p className="mt-1 text-xl font-black text-amber-800">
                          월 {money(guide.maximumMonthlyGap)} 개인연금 목표
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border-2 border-red-200 bg-white p-4">
                      <p className="font-black text-red-800">
                        공백 구간이 이미 시작되었습니다. 월 적립보다 약{' '}
                        {money(guide.requiredCapital)}의 기존 재원 배치안을 먼저
                        비교하세요.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-amber-950">
                    <p>
                      {guide.firstGapYear}년부터 {guide.lastGapYear}년까지의 월
                      최대 공백을 메우는 보수적 필요 재원은{' '}
                      <b>{money(guide.requiredCapital)}</b>입니다.
                    </p>
                    <p>
                      {guide.suggestedAccountName ? (
                        <>
                          등록한 <b>{guide.suggestedAccountName}</b>을{' '}
                          <b>{guide.suggestedStartAge}세에 개시</b>하는 경우와
                          비교해 보세요. 개시를 앞당기면 이후 월액은 줄 수
                          있습니다.
                        </>
                      ) : (
                        <>
                          현재 등록된 개시 후보 계좌가 없습니다.
                          연금저축·IRP·연금보험 중 실제 개시 가능 연령과
                          수수료를 확인해 준비안을 비교하세요.
                        </>
                      )}
                    </p>
                  </div>
                </section>
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
            {plan.allGoalsMet
              ? '현재 설정만으로 입력한 목표 월연금을 충족합니다.'
              : '부족액은 있지만 기간형 개인·퇴직연금 종료 이후의 후기 노후 구간만 남아 있어 기본 보완 제안에서는 제외했습니다. 필요하면 위 체크박스를 켜세요.'}
          </div>
        )}
        <div className="rounded-lg bg-slate-100 p-4 text-xs leading-5 text-slate-600">
          이 가이드는 특정 금융상품 매수 권유가 아닙니다. 물가상승률, 투자손실,
          실제 세금, 중도해지 비용과 금융기관별 연금개시 요건은 반영되지 않을 수
          있습니다. 연금계좌는 일반적으로 만 55세 및 가입기간 요건과
          연금수령한도 확인이 필요하므로 실제 개시 전 금융기관·세무 전문가에게
          확인하세요.
        </div>
      </CardContent>
    </Card>
  );
}
*/

function PensionCompositionSummary({
  result,
  basicPensionMonthly,
}: {
  result: SimulationResult;
  basicPensionMonthly: number;
}) {
  return (
    <section className="rounded-xl border-2 border-violet-200 bg-violet-50/50 p-5">
      <div>
        <h3 className="text-lg font-black text-violet-950">4. 연금 구성 상세</h3>
        <p className="mt-1 text-xs leading-5 text-violet-800">
          다음 생활비 부족 분석에 들어가는 부부 생존 시 월 연금과 첫 사망 후
          전환액을 먼저 확인합니다.
        </p>
      </div>
      <div className="mt-4">
        <SummaryTable
          valueHeading="예상 금액"
          rows={[
            {
              group: '부부 생존 시 월액',
              item: '국민연금',
              value: money(result.bothAliveNationalMonthly),
              note: '두 사람의 선택한 수령 전략 합계',
            },
            {
              group: '부부 생존 시 월액',
              item: '기초연금',
              value: money(basicPensionMonthly),
              note: '두 사람 모두 65세 이상이고 수급한다고 가정한 시점',
            },
            {
              group: '부부 생존 시 월액',
              item: '개인·퇴직연금',
              value: money(result.bothAliveAdditionalMonthly),
              note: '모든 등록 계좌의 해당 시점 합계',
            },
            {
              group: '부부 생존 시 월액',
              item: '전체 연금 합계',
              value: money(result.bothAliveMonthly),
              note: '국민연금 + 기초연금 + 개인·퇴직연금',
            },
            {
              group: '세금 반영 후',
              item:
                result.overallTaxEstimateStatus === 'complete'
                  ? '예상 세후 월 합계'
                  : result.overallTaxEstimateStatus === 'partial'
                    ? '세후 부분 추정 월 합계'
                    : '세금 미반영 항목 포함 합계',
              value: money(result.estimatedBothAliveNetMonthly),
              note: `세금 추정 상태: ${result.overallTaxEstimateStatus}`,
              tone:
                result.overallTaxEstimateStatus === 'complete'
                  ? ('success' as const)
                  : ('danger' as const),
            },
            ...(result.afterFirstDeath
              ? [
                  {
                    group: `첫 사망 후 · ${result.afterFirstDeath.year}년`,
                    item: '생존자 국민연금 선택액',
                    value: money(result.afterFirstDeath.selectedNationalPension),
                    note: result.afterFirstDeath.decisionText,
                  },
                  {
                    group: `첫 사망 후 · ${result.afterFirstDeath.year}년`,
                    item: '생존자 기초연금',
                    value: money(result.afterFirstDeath.basicPension),
                    note: '전환연도 수급 자격을 충족한다고 가정',
                  },
                  {
                    group: `첫 사망 후 · ${result.afterFirstDeath.year}년`,
                    item: '생존자 개인·퇴직연금',
                    value: money(
                      result.afterFirstDeath.additionalPrivatePension,
                    ),
                    note: '생존자에게 남아 있는 등록 계좌 합계',
                  },
                  {
                    group: `첫 사망 후 · ${result.afterFirstDeath.year}년`,
                    item: '생존자 전체 연금',
                    value: money(result.afterFirstDeath.totalNetPension),
                    note: '국민연금 선택액 + 기초·개인·퇴직연금',
                  },
                ]
              : [
                  {
                    group: '첫 사망 후 월액',
                    item: '생존자 전체 연금',
                    value: '해당 없음',
                    note: '배우자를 포함한 경우 계산됩니다.',
                  },
                ]),
            {
              group: '추가 납부',
              item: '국민연금 임의계속가입 납부액',
              value: money(result.totalAdditionalContribution),
              note: '본인·배우자의 선택한 추가 납부 합계',
            },
          ]}
        />
      </div>
    </section>
  );
}

function LivingCostIncomeReport({
  result,
  policy,
  netReturnRate,
  livingCost,
  householdFinance,
  includeLateLifeGap,
  basicPensionMonthly,
}: {
  result: SimulationResult;
  policy: Policy;
  netReturnRate: number;
  livingCost: LivingCostSettings;
  householdFinance: HouseholdFinanceSettings;
  includeLateLifeGap: boolean;
  basicPensionMonthly: number;
}) {
  const currentYear = new Date().getFullYear();
  const cashflow = useMemo(
    () =>
      buildHouseholdCashflow({
        result,
        livingCost,
        finance: householdFinance,
        annualNetReturnRate: netReturnRate,
        includeLateLifeGap,
        currentYear,
        policy,
      }),
    [
      currentYear,
      householdFinance,
      includeLateLifeGap,
      livingCost,
      netReturnRate,
      policy,
      result,
    ],
  );
  const chartData = useMemo(
    () =>
      cashflow.rows.map((row) => ({
        year: row.year,
        ageA: row.ageA,
        ageB: row.ageB,
        label: `${row.ageA}세`,
        employmentIncome: row.employmentIncome,
        nationalPension: row.nationalPension,
        basicPension: row.basicPension,
        privatePension: row.privatePension,
        rentalIncomeNet: row.rentalIncomeNet,
        otherIncome: row.otherIncome,
        incomeBeforeDebt: row.householdIncomeBeforeDebt,
        debtService: row.debtService,
        propertyHoldingTax: row.propertyHoldingTax,
        propertyHoldingTaxDetails: row.propertyHoldingTaxDetails,
        assetWithdrawal: row.assetWithdrawal,
        assetWithdrawalDetails: row.assetWithdrawalDetails,
        assetReturnIncome: row.assetReturnIncome,
        assetReturnIncomeDetails: row.assetReturnIncomeDetails,
        assetReinvestedReturn: row.assetReinvestedReturn,
        assetTransactionDetails: row.assetTransactionDetails,
        remainingRetirementAssets: row.remainingRetirementAssets,
        cashAndFinancialAssetBalance: row.cashAndFinancialAssetBalance,
        replacementHousingValue: row.replacementHousingValue,
        actual: row.householdCashAvailableAfterAsset,
        essential: row.livingCost,
        gap: row.monthlyGap,
        surplus: row.monthlySurplus,
      })),
    [cashflow.rows],
  );
  const selectedLivingCostLabel = livingCostLabel(livingCost);
  const employedPeople = [result.a, result.b].filter(
    (person): person is NonNullable<typeof person> =>
      Boolean(person?.enabled && person.employmentIncomeEnabled),
  );
  const householdRetirementYear = employedPeople.length
    ? Math.max(
        ...employedPeople.map(
          (person) =>
            person.birthDate.getFullYear() + (person.retirementAge ?? 60),
        ),
      )
    : null;
  const householdRetirementRow =
    householdRetirementYear == null
      ? null
      : (cashflow.rows.find((row) => row.year === householdRetirementYear) ??
        null);
  const firstGapRow = cashflow.firstGapYear
    ? (cashflow.rows.find((row) => row.year === cashflow.firstGapYear) ?? null)
    : null;
  const maximumGapRow = cashflow.rows.reduce<HouseholdCashflowRow | null>(
    (maximum, row) =>
      row.monthlyGap > (maximum?.monthlyGap ?? 0) ? row : maximum,
    null,
  );
  const financialMilestones = useMemo(() => {
    const labelsByYear = new Map<number, Set<string>>();
    const add = (year: number | null | undefined, label: string) => {
      if (year == null || !cashflow.rows.some((row) => row.year === year)) return;
      const labels = labelsByYear.get(year) ?? new Set<string>();
      labels.add(label);
      labelsByYear.set(year, labels);
    };
    add(currentYear, '현재');
    if (result.a.employmentIncomeEnabled)
      add(
        result.a.birthDate.getFullYear() + (result.a.retirementAge ?? 60),
        '본인 은퇴',
      );
    if (result.b?.employmentIncomeEnabled)
      add(
        result.b.birthDate.getFullYear() + (result.b.retirementAge ?? 60),
        '배우자 은퇴',
      );
    add(householdRetirementYear, '가구 은퇴');
    if (result.a.hasNps) add(result.a.claimYear, '본인 국민연금');
    if (result.b?.hasNps) add(result.b.claimYear, '배우자 국민연금');
    return [...labelsByYear.entries()]
      .sort(([left], [right]) => left - right)
      .map(([year, labels]) => ({
        year,
        labels: [...labels],
        row: cashflow.rows.find((item) => item.year === year),
      }))
      .filter(
        (milestone): milestone is {
          year: number;
          labels: string[];
          row: HouseholdCashflowRow;
        } => Boolean(milestone.row),
      );
  }, [cashflow.rows, currentYear, householdRetirementYear, result]);
  const [selectedFinancialMilestoneYear, setSelectedFinancialMilestoneYear] =
    useState(currentYear);
  const selectedFinancialMilestoneIndex = Math.max(
    0,
    financialMilestones.findIndex(
      (milestone) => milestone.year === selectedFinancialMilestoneYear,
    ),
  );
  const selectedFinancialMilestone =
    financialMilestones[selectedFinancialMilestoneIndex] ??
    financialMilestones[0];
  const currentCashAndFinancialAssets = householdFinance.assets
    .filter((asset) => asset.type === 'cash' || asset.type === 'financial')
    .reduce((sum, asset) => sum + Math.max(0, asset.currentValue), 0);
  const financialMilestoneRows: {
    group: '재무상태' | '월 현금흐름';
    item: string;
    value: (milestone: (typeof financialMilestones)[number]) => number;
    display: 'normal' | 'inflow' | 'negative' | 'difference';
    showAssetBalanceDeduction?: boolean;
  }[] = [
    {
      group: '재무상태',
      item: '총자산',
      value: (milestone) =>
        milestone.year === currentYear
          ? cashflow.finance.grossAssets
          : milestone.row.grossAssetBalance,
      display: 'normal',
    },
    {
      group: '재무상태',
      item: '총부채',
      value: (milestone) =>
        milestone.year === currentYear
          ? cashflow.finance.liabilities
          : milestone.row.liabilityBalance,
      display: 'negative',
    },
    {
      group: '재무상태',
      item: '순자산',
      value: (milestone) =>
        milestone.year === currentYear
          ? cashflow.finance.netWorth
          : milestone.row.netWorthBalance,
      display: 'normal',
    },
    {
      group: '재무상태',
      item: '현금·금융자산 잔액',
      value: (milestone) =>
        milestone.year === currentYear
          ? currentCashAndFinancialAssets
          : milestone.row.cashAndFinancialAssetBalance,
      display: 'normal',
    },
    {
      group: '월 현금흐름',
      item: '근로·사업소득',
      value: (milestone) => milestone.row.employmentIncome,
      display: 'inflow',
    },
    {
      group: '월 현금흐름',
      item: '국민·기초·개인연금',
      value: (milestone) =>
        milestone.row.nationalPension +
        milestone.row.basicPension +
        milestone.row.privatePension,
      display: 'inflow',
    },
    {
      group: '월 현금흐름',
      item: '임대·기타 반복소득',
      value: (milestone) =>
        milestone.row.rentalIncomeNet + milestone.row.otherIncome,
      display: 'inflow',
    },
    {
      group: '월 현금흐름',
      item: '대출 원리금',
      value: (milestone) => milestone.row.debtService,
      display: 'negative',
    },
    {
      group: '월 현금흐름',
      item: '부동산 보유세',
      value: (milestone) => milestone.row.propertyHoldingTax,
      display: 'negative',
    },
    {
      group: '월 현금흐름',
      item: '자산 원금 인출',
      value: (milestone) => milestone.row.assetWithdrawal,
      display: 'inflow',
      showAssetBalanceDeduction: true,
    },
    {
      group: '월 현금흐름',
      item: '현금으로 받는 운용수익',
      value: (milestone) => milestone.row.assetReturnIncome,
      display: 'inflow',
    },
    {
      group: '월 현금흐름',
      item: '생활비 사용 가능 현금',
      value: (milestone) => milestone.row.householdCashAvailableAfterAsset,
      display: 'normal',
    },
    {
      group: '월 현금흐름',
      item: '생활비 기준',
      value: (milestone) => milestone.row.livingCost,
      display: 'negative',
    },
    {
      group: '월 현금흐름',
      item: '생활비 후 월 차이',
      value: (milestone) =>
        milestone.row.monthlySurplus - milestone.row.monthlyGap,
      display: 'difference',
    },
  ];
  const assetFundingPlans = useMemo(
    () =>
      cashflow.gapPeriodsBeforeAssets.map((period) => {
        const rows = cashflow.rows.filter(
          (row) => row.year >= period.startYear && row.year <= period.endYear,
        );
        const firstRow = rows[0];
        const lastRow = rows.at(-1);
        const withdrawalRows = rows.filter((row) => row.assetWithdrawal > 0);
        const firstWithdrawalRow = withdrawalRows[0];
        const lastWithdrawalRow = withdrawalRows.at(-1);
        const sourceTotals = new Map<string, number>();
        for (const row of withdrawalRows) {
          for (const detail of row.assetWithdrawalDetails) {
            sourceTotals.set(
              detail.name,
              (sourceTotals.get(detail.name) ?? 0) + detail.amount * 12,
            );
          }
        }
        const totalNeed = rows.reduce(
          (sum, row) => sum + row.monthlyGapBeforeAsset * 12,
          0,
        );
        const totalWithdrawal = rows.reduce(
          (sum, row) => sum + row.assetWithdrawal * 12,
          0,
        );
        const residualRows = rows.filter((row) => row.monthlyGap > 0);
        return {
          ...period,
          firstRow,
          lastRow,
          firstWithdrawalRow,
          lastWithdrawalRow,
          sources: [...sourceTotals.entries()].map(([name, total]) => ({
            name,
            total,
          })),
          totalNeed,
          totalWithdrawal,
          coverageRate:
            totalNeed > 0
              ? Math.min(100, Math.round((totalWithdrawal / totalNeed) * 100))
              : 0,
          maximumWithdrawal: withdrawalRows.length
            ? Math.max(...withdrawalRows.map((row) => row.assetWithdrawal))
            : 0,
          firstResidualYear: residualRows[0]?.year ?? null,
          maximumResidual: residualRows.length
            ? Math.max(...residualRows.map((row) => row.monthlyGap))
            : 0,
        };
      }),
    [cashflow.gapPeriodsBeforeAssets, cashflow.rows],
  );
  return (
    <Card className="w-full min-w-0 max-w-full border-emerald-200">
      <CardHeader className="border-b border-emerald-100 bg-emerald-50/50">
        <CardTitle>생활비 대비 실제 예상소득 분석</CardTitle>
        <CardDescription>
          입력한 근로소득과 국민·기초·개인·퇴직연금의 실제 발생 시점을 합산해
          선택한 국가 생활비 기준과 비교합니다. 임의의 목표 월연금은 사용하지
          않습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 max-w-full gap-5 pt-5 [&>*]:min-w-0 [&>*]:max-w-full">
        <section className="rounded-xl border-2 border-blue-300 bg-blue-50/70 p-5 shadow-sm">
          <div className="grid min-w-0 gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black tracking-wide text-blue-700">
                1. 먼저 보는 결론
              </p>
              <h3 className="mt-1 text-xl font-black text-blue-950">
                언제 무엇이 필요한가
              </h3>
            </div>
            <Badge
              className={`w-fit max-w-full ${firstGapRow ? 'bg-rose-800' : 'bg-emerald-700'}`}
            >
              {firstGapRow
                ? `${firstGapRow.year}년 첫 부족`
                : '분석기간 생활비 기준 충족'}
            </Badge>
          </div>
          {firstGapRow ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-blue-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-500">첫 부족 시점</p>
                <p className="mt-1 text-lg font-black text-rose-900">
                  {firstGapRow.year}년 · 본인 {firstGapRow.ageA}세
                  {firstGapRow.ageB == null
                    ? ''
                    : ` · 배우자 ${firstGapRow.ageB}세`}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  생활비 대비 월 <b>-{money(firstGapRow.monthlyGap)}</b>
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-500">
                  등록 자산 사용 후 필요한 재원
                </p>
                <p className="mt-1 text-lg font-black text-blue-800">
                  {money(cashflow.exactGapPresentValueAfterAssets)}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {cashflow.baseYear}년 현재가치 · 첫 부족 시 현금·금융자산{' '}
                  <b>{money(firstGapRow.cashAndFinancialAssetBalance)}</b>
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-500">지금부터의 준비안</p>
                <p className="mt-1 text-lg font-black text-blue-800">
                  {firstGapRow.year > currentYear &&
                  cashflow.suggestedMonthlyContribution > 0
                    ? `월 ${money(cashflow.suggestedMonthlyContribution)} 적립 비교`
                    : '즉시 소득·지출·자산 계획 재조정'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  최대 부족은{' '}
                  {maximumGapRow
                    ? `${maximumGapRow.year}년 (본인 ${maximumGapRow.ageA}세${maximumGapRow.ageB == null ? '' : ` · 배우자 ${maximumGapRow.ageB}세`}) 월 -${money(maximumGapRow.monthlyGap)}`
                    : '없음'}
                  입니다.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-sm font-bold leading-6 text-emerald-900">
              현재 입력과 자산 사용 계획에서는 마지막 생존 시점까지 선택한 생활비
              기준을 충족합니다. 아래 사건별 표에서 은퇴·연금 개시 때의 반복소득과
              현금·금융자산 잔액 변화를 확인하세요.
            </p>
          )}
        </section>

        <IncomeEventTimeline
          result={result}
          policy={policy}
          livingCost={livingCost}
          chartData={chartData}
          livingCostLegend={selectedLivingCostLabel}
          cashflowRows={cashflow.rows}
        />

        <section className="rounded-xl border-2 border-slate-200 bg-slate-50/60 p-5">
          <div className="grid min-w-0 max-w-full gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-950">
                3. 주요 사건별 자산·부채·소득 통합 비교
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                현재, 각자 은퇴, 가구 은퇴와 연금 개시 시점의 재무상태와 월
                현금흐름을 사건 탭으로 바꾸어 확인합니다. 실거주 주택은
                총자산에는 포함하지만 매각 계획이 없으면 생활비에 쓸 현금에서는
                제외합니다.
              </p>
            </div>
            <Badge
              className={
                cashflow.finance.completeness.debtService === 'incomplete'
                  ? 'w-fit max-w-full bg-rose-700'
                  : 'w-fit max-w-full bg-emerald-700'
              }
            >
              현금흐름 완성도{' '}
              {cashflow.finance.completeness.debtService === 'incomplete'
                ? '확인 필요'
                : '계산 가능'}
            </Badge>
          </div>
          <div
            className="mt-4 grid min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
            role="tablist"
            aria-label="재무상태를 확인할 주요 사건"
          >
            {financialMilestones.map((milestone) => {
              const selected =
                milestone.year === selectedFinancialMilestone?.year;
              return (
                <button
                  key={milestone.year}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`min-w-0 rounded-lg border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-blue-600 bg-blue-700 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() =>
                    setSelectedFinancialMilestoneYear(milestone.year)
                  }
                >
                  <b className="block break-words text-sm">
                    {milestone.labels.join(' · ')}
                  </b>
                  <span
                    className={`mt-1 block break-words text-[11px] ${
                      selected ? 'text-blue-100' : 'text-slate-500'
                    }`}
                  >
                    {milestone.year}년 · 본인 {milestone.row.ageA}세
                    {milestone.row.ageB == null
                      ? ''
                      : ` · 배우자 ${milestone.row.ageB}세`}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedFinancialMilestone && (
            <div
              role="tabpanel"
              className="mt-3 min-w-0 max-w-full rounded-xl border-2 border-blue-200 bg-white p-4"
            >
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="text-xs font-black text-blue-700">선택한 시점</p>
                  <h4 className="mt-1 break-words text-lg font-black text-slate-950">
                    {selectedFinancialMilestone.labels.join(' · ')} ·{' '}
                    {selectedFinancialMilestone.year}년
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    본인 {selectedFinancialMilestone.row.ageA}세
                    {selectedFinancialMilestone.row.ageB == null
                      ? ''
                      : ` · 배우자 ${selectedFinancialMilestone.row.ageB}세`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedFinancialMilestoneIndex <= 0}
                    onClick={() => {
                      const previous =
                        financialMilestones[selectedFinancialMilestoneIndex - 1];
                      if (previous)
                        setSelectedFinancialMilestoneYear(previous.year);
                    }}
                  >
                    ← 이전
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      selectedFinancialMilestoneIndex >=
                      financialMilestones.length - 1
                    }
                    onClick={() => {
                      const next =
                        financialMilestones[selectedFinancialMilestoneIndex + 1];
                      if (next) setSelectedFinancialMilestoneYear(next.year);
                    }}
                  >
                    다음 →
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
                {(['재무상태', '월 현금흐름'] as const).map((group) => (
                  <section
                    key={group}
                    className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <h5 className="font-black text-slate-950">{group}</h5>
                    <dl className="mt-2 grid min-w-0 gap-1.5">
                      {financialMilestoneRows
                        .filter((metric) => metric.group === group)
                        .map((metric) => {
                          const value = metric.value(selectedFinancialMilestone);
                          const negative =
                            metric.display === 'negative' && value > 0;
                          const inflowPositive =
                            metric.display === 'inflow' && value > 0;
                          const differenceNegative =
                            metric.display === 'difference' && value < 0;
                          const differencePositive =
                            metric.display === 'difference' && value >= 0;
                          return (
                            <div
                              key={metric.item}
                              className="grid min-w-0 grid-cols-2 items-center gap-3 rounded-lg bg-white px-3 py-2"
                            >
                              <dt className="min-w-0 break-words text-xs font-bold text-slate-600">
                                {metric.item}
                                {metric.showAssetBalanceDeduction && value > 0 && (
                                  <span className="ml-1 text-[11px] font-bold text-rose-900">
                                    (현금성 자산 잔액 -{money(value)})
                                  </span>
                                )}
                              </dt>
                              <dd
                                className={`min-w-0 break-all text-right text-sm font-black ${
                                   negative || differenceNegative
                                     ? 'text-rose-900'
                                     : inflowPositive || differencePositive
                                       ? 'text-emerald-800'
                                      : group === '재무상태'
                                        ? 'text-blue-800'
                                        : 'text-slate-900'
                                }`}
                              >
                                {negative
                                  ? `-${money(value)}`
                                  : inflowPositive
                                    ? `+${money(value)}`
                                    : metric.display === 'difference'
                                      ? `${value >= 0 ? '+' : '-'}${money(Math.abs(value))}`
                                      : money(value)}
                              </dd>
                            </div>
                          );
                        })}
                    </dl>
                  </section>
                ))}
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            현재 자산·부채는 입력 시점 금액이고, 이후 시점은 해당 연도 말 예상
            잔액입니다. 월 현금흐름은 각 연도의 대표 월 금액입니다.
          </p>
          <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer font-black text-slate-800">
              누계·거래·계산 완성도 세부 보기
            </summary>
            <div className="mt-3">
              <SummaryTable
              rows={[
                {
                  group: '현재 재무상태',
                  item: '총자산',
                  value: money(cashflow.finance.grossAssets),
                  note: `실거주 주택 ${money(cashflow.finance.primaryHomeValue)} 포함`,
                },
                {
                  group: '현재 재무상태',
                  item: '총부채',
                  value: `-${money(cashflow.finance.liabilities)}`,
                  note: '등록한 대출잔액 합계',
                  tone:
                    cashflow.finance.liabilities > 0
                      ? ('danger' as const)
                      : ('default' as const),
                },
                {
                  group: '현재 재무상태',
                  item: '순자산',
                  value: money(cashflow.finance.netWorth),
                  note: '총자산 - 총부채',
                },
                {
                  group: '현재 재무상태',
                  item: '은퇴 활용 가능 자산',
                  value: money(cashflow.finance.retirementAvailableAssets),
                  note: '생활비 사용 계획과 현금화 시점이 지정된 현재 자산가치',
                },
                {
                  group: '기준연도 월 흐름',
                  item: '대출 원리금 상환',
                  value: `-${money(cashflow.finance.monthlyDebtServiceAtBaseYear)}`,
                  note: '기준연도 가구 현금소득에서 매월 차감',
                  tone:
                    cashflow.finance.monthlyDebtServiceAtBaseYear > 0
                      ? ('danger' as const)
                      : ('default' as const),
                },
                {
                  group: '기준연도 월 흐름',
                  item: '부동산 보유세',
                  value: `-${money(cashflow.finance.monthlyPropertyHoldingTaxAtBaseYear)}`,
                  note:
                    cashflow.finance.monthlyPropertyHoldingTaxAtBaseYear > 0
                      ? '분석 반영을 선택한 주택의 재산세·종부세 등을 연간 추정액의 월평균으로 차감'
                      : '분석 반영을 선택한 주택 없음',
                  tone:
                    cashflow.finance.monthlyPropertyHoldingTaxAtBaseYear > 0
                      ? ('danger' as const)
                      : ('default' as const),
                },
                {
                  group: '기준연도 월 흐름',
                  item: '임대 순수입',
                  value: money(
                    cashflow.finance.monthlyRentalIncomeNetAtBaseYear,
                  ),
                  note: `세전 임대료 ${money(cashflow.finance.monthlyRentalIncomeGrossAtBaseYear)} · ${cashflow.finance.completeness.rentalNetIncome === 'partial' ? '비용·세금 일부 미입력' : '입력 항목 차감 완료'}`,
                },
                {
                  group: '기준연도 월 흐름',
                  item: '기타 반복소득',
                  value: money(cashflow.finance.monthlyOtherIncomeAtBaseYear),
                  note: '등록한 사업·기타 반복소득',
                },
                {
                  group: '계산 완성도',
                  item: '연금 세금 반영',
                  value:
                    result.overallTaxEstimateStatus === 'complete'
                      ? '세후 추정 완료'
                      : result.overallTaxEstimateStatus === 'unknown'
                        ? '세금 미반영 항목 있음'
                        : '세후 부분 추정',
                  note: '퇴직소득세 등 입력 여부 기준',
                  tone:
                    result.overallTaxEstimateStatus === 'complete'
                      ? ('success' as const)
                      : ('danger' as const),
                },
                {
                  group: '계획기간 누계',
                  item: '생활비에 투입한 자산인출',
                  value: money(cashflow.finance.plannedAssetWithdrawals),
                  note: '매각·운용 결과를 반영해 실제 생활비에 투입한 합계',
                },
                {
                  group: '계획기간 누계',
                  item: '부동산 보유세 반영액',
                  value: `-${money(cashflow.finance.plannedPropertyHoldingTaxes)}`,
                  note: '분석 반영을 선택한 보유기간의 재산세·종부세 등 월평균 합계',
                  tone:
                    cashflow.finance.plannedPropertyHoldingTaxes > 0
                      ? ('danger' as const)
                      : ('default' as const),
                },
                {
                  group: '계획기간 누계',
                  item: '현금으로 받은 운용수익',
                  value: money(cashflow.finance.plannedAssetReturnIncome),
                  note: '생활비 사용 가능 현금에 포함한 수익 합계',
                },
                {
                  group: '계획기간 누계',
                  item: '재투자한 운용수익',
                  value: money(cashflow.finance.plannedAssetReinvestedReturns),
                  note: '인출하지 않고 운용잔액에 더한 수익 합계',
                },
                ...(cashflow.finance.linkedDebtPayoffsAtSale > 0
                  ? [
                      {
                        group: '자산 매각·대출',
                        item: '연결대출 자동상환',
                        value: money(cashflow.finance.linkedDebtPayoffsAtSale),
                        note: '연결 자산의 매각대금에서 먼저 상환한 추정 잔액 합계',
                      },
                      ...(cashflow.finance.linkedDebtPayoffFundingShortfall > 0
                        ? [
                            {
                              group: '자산 매각·대출',
                              item: '대출상환 별도 필요자금',
                              value: money(
                                cashflow.finance
                                  .linkedDebtPayoffFundingShortfall,
                              ),
                              note: '비용·세금 차감 후 매각대금으로 대출을 모두 갚지 못하는 금액',
                              tone: 'danger' as const,
                            },
                          ]
                        : []),
                    ]
                  : []),
                ...(householdFinance.assets.some(
                  (asset) => asset.housingMovePlan?.enabled,
                )
                  ? [
                      {
                        group: '주거 이전',
                        item: '주택 교체 후 생성된 운용자금',
                        value: money(
                          cashflow.finance.housingMoveInvestableSurplus,
                        ),
                        note: '예상 매각대금 - 새 주택 가격·취득비용',
                      },
                      {
                        group: '주거 이전',
                        item: '새 주택 구입 별도 필요자금',
                        value: money(
                          cashflow.finance.housingPurchaseFundingShortfall,
                        ),
                        note: '매각대금보다 구입비용이 큰 경우의 일시 부족액',
                        tone:
                          cashflow.finance.housingPurchaseFundingShortfall > 0
                            ? ('danger' as const)
                            : ('default' as const),
                      },
                      {
                        group: '분석 종료시점',
                        item: '새 주택 예상가치',
                        value: money(
                          cashflow.finance.replacementHousingValueAtEnd,
                        ),
                        note: '입력한 새 주택 연 가치변동률 반영',
                      },
                    ]
                  : []),
                {
                  group: '분석 종료시점',
                  item: '남은 활용자산',
                  value: money(cashflow.finance.remainingPlannedAssetsAtEnd),
                  note: '보유만 하기로 한 자산은 제외',
                },
              ]}
              />
            </div>
          </details>
          {householdFinance.assets.length > 0 && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <h4 className="font-black text-violet-950">
                자산별 생활비 사용계획
              </h4>
              <p className="mt-1 text-xs leading-5 text-violet-800">
                자산가치를 한꺼번에 부족재원에서 빼지 않고, 아래 시점과 방식대로
                해당 연도의 현금흐름에 넣습니다.
              </p>
              <div className="mt-3 overflow-x-auto rounded-lg border border-violet-200 bg-white">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow className="bg-violet-100/70">
                      <TableHead className="font-black">자산</TableHead>
                      <TableHead className="font-black">
                        생활비 활용 방식
                      </TableHead>
                      <TableHead className="font-black">
                        활용 시기·유지액
                      </TableHead>
                      <TableHead className="font-black">
                        매각·주거 이전
                      </TableHead>
                      <TableHead className="text-right font-black">
                        계산 결과
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {householdFinance.assets.map((asset) => {
                      const plan = resolveAssetUsePlan(asset, currentYear);
                      const drawRows = cashflow.rows.filter((row) =>
                        row.assetWithdrawalDetails.some(
                          (detail) => detail.assetId === asset.id,
                        ),
                      );
                      const assetTransactions = cashflow.rows.flatMap((row) =>
                        row.assetTransactionDetails
                          .filter((detail) => detail.assetId === asset.id)
                          .map((detail) => ({ year: row.year, ...detail })),
                      );
                      const purchaseTransaction = assetTransactions.find(
                        (detail) => detail.purchasedAssetName,
                      );
                      const saleTransaction = assetTransactions.find(
                        (detail) =>
                          detail.transactionKind === 'sale' ||
                          detail.transactionKind === 'sale_and_purchase',
                      );
                      const totalDraw = drawRows.reduce(
                        (sum, row) =>
                          sum +
                          (row.assetWithdrawalDetails.find(
                            (detail) => detail.assetId === asset.id,
                          )?.amount ?? 0) *
                            12,
                        0,
                      );
                      const modeText =
                        plan.mode === 'cover_gap'
                          ? '생활비가 부족한 해에 필요한 금액만 인출'
                          : plan.mode === 'fixed_monthly'
                            ? `매월 ${money(plan.monthlyAmount ?? 0)} 인출`
                            : '생활비 현금흐름에는 사용하지 않고 보유';
                      const periodText =
                        plan.mode === 'hold'
                          ? '해당 없음'
                          : `${plan.startYear}년${plan.endYear == null ? '부터' : `~${plan.endYear}년`} · 최소 ${money(plan.reserveAmount ?? 0)} 유지`;
                      const transactionText = asset.salePlan?.enabled
                        ? `${asset.salePlan.year}년 매각${(saleTransaction?.linkedDebtPayoff ?? 0) > 0 ? ` · 연결대출 ${money(saleTransaction?.linkedDebtPayoff ?? 0)} 상환` : ''}${asset.housingMovePlan?.enabled ? ` → ${asset.housingMovePlan.purchaseYear}년 ${asset.housingMovePlan.replacementName} 구입` : ' 후 순매각액 사용'}`
                        : '매각 계획 없음';
                      const purchaseText =
                        asset.housingMovePlan?.enabled && purchaseTransaction
                          ? ` · ${purchaseTransaction.year}년 운용자금 ${money(purchaseTransaction.investableSurplus)}${purchaseTransaction.fundingShortfall > 0 ? `, 별도 조달 ${money(purchaseTransaction.fundingShortfall)}` : ''}`
                          : '';
                      const resultText =
                        plan.mode === 'hold'
                          ? '실제 인출 없음'
                          : drawRows.length
                            ? `${drawRows[0].year}년부터 총 ${money(totalDraw)} 인출`
                            : '인출 가능 시점 또는 생활비 부족이 없어 0원';
                      return (
                        <TableRow key={asset.id}>
                          <TableCell className="font-black text-slate-950">
                            {asset.name}
                          </TableCell>
                          <TableCell className="text-xs leading-5">
                            {modeText}
                          </TableCell>
                          <TableCell className="text-xs leading-5">
                            {periodText}
                          </TableCell>
                          <TableCell className="text-xs leading-5">
                            {transactionText}
                            {purchaseText}
                          </TableCell>
                          <TableCell className="text-right text-xs font-black leading-5 text-violet-800">
                            {resultText}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </section>

        <PensionCompositionSummary
          result={result}
          basicPensionMonthly={basicPensionMonthly}
        />

        <section className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-amber-950">
                5. 생활비 부족구간과 필요재원 상세
              </h3>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                현재연도부터 부분은퇴·가구은퇴·연금 종료·첫 사망 이후를 모두
                계산하고, 흑자 연도가 끼면 부족구간을 따로 나눕니다.
              </p>
            </div>
            <Badge className="bg-amber-700">
              현재가치 기준 {cashflow.baseYear}년 · 할인율 연{' '}
              {cashflow.discountRate}%
            </Badge>
          </div>
          <div className="mt-4 rounded-xl border border-amber-300 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-black text-amber-950">부족구간 전체 흐름</h4>
              <Badge
                variant="outline"
                className={
                  cashflow.exactGapPresentValueAfterAssets > 0
                    ? 'border-rose-300 bg-rose-100 text-rose-900'
                    : 'border-emerald-300 bg-emerald-100 text-emerald-900'
                }
              >
                {cashflow.exactGapPresentValueAfterAssets > 0
                  ? '자산 사용 후에도 부족'
                  : '등록 자산으로 전 구간 충당'}
              </Badge>
            </div>
            {assetFundingPlans.length > 0 ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {assetFundingPlans.map((plan) => {
                    const phaseMeta = cashflowPhaseMeta(plan.phase);
                    return (
                      <div
                        key={`gap-summary-${plan.startYear}-${plan.phase}`}
                        className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="text-sm text-slate-950">
                            {plan.startYear}
                            {plan.endYear === plan.startYear
                              ? '년'
                              : `~${plan.endYear}년`}
                          </b>
                          <Badge
                            variant="outline"
                            className={phaseMeta.className}
                          >
                            {phaseMeta.label}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          월 부족 {money(plan.firstRow?.monthlyGapBeforeAsset ?? 0)}
                          {plan.lastRow &&
                          plan.lastRow.monthlyGapBeforeAsset !==
                            plan.firstRow?.monthlyGapBeforeAsset
                            ? ` → ${money(plan.lastRow.monthlyGapBeforeAsset)}`
                            : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 grid gap-2 border-t border-amber-200 pt-3 text-xs leading-5 text-slate-700 md:grid-cols-3">
                  <p>
                    <b className="block text-slate-950">자산 사용 전 부족</b>
                    {money(cashflow.exactGapPresentValue)}
                    <span className="block text-[11px] text-slate-500">
                      {cashflow.baseYear}년 현재가치
                    </span>
                  </p>
                  <p>
                    <b className="block text-slate-950">기간 전체 자산 인출</b>
                    {money(
                      assetFundingPlans.reduce(
                        (sum, plan) => sum + plan.totalWithdrawal,
                        0,
                      ),
                    )}
                    <span className="block text-[11px] text-slate-500">
                      각 구간 인출액의 단순 명목 합계
                    </span>
                  </p>
                  <p>
                    <b className="block text-slate-950">자산 사용 후 남는 부족</b>
                    <span
                      className={
                        cashflow.exactGapPresentValueAfterAssets > 0
                          ? 'font-black text-rose-900'
                          : 'font-black text-emerald-800'
                      }
                    >
                      {money(cashflow.exactGapPresentValueAfterAssets)}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {cashflow.baseYear}년 현재가치
                    </span>
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm font-bold text-emerald-800">
                분석기간에 생활비 부족구간이 없습니다.
              </p>
            )}
          </div>
          {assetFundingPlans.length > 0 ? (
            <div className="mt-5 rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4">
              <div>
                <h4 className="font-black text-blue-950">
                  부족재원은 등록한 자산에서 이렇게 충당합니다
                </h4>
                <p className="mt-1 text-xs leading-5 text-blue-800">
                  연금·반복소득만으로 모자라는 금액과 실제 자산 인출을 구간별로
                  연결했습니다. 총액은 해당 기간의 단순 명목 합계입니다.
                </p>
              </div>
              <div
                data-print-table="funding"
                className="mt-3 max-w-full overflow-x-auto rounded-xl border border-blue-200 bg-white"
              >
                <Table className="min-w-[1400px]">
                  <TableHeader>
                    <TableRow className="bg-blue-100/70">
                      <TableHead className="w-[135px]">부족 발생 연도</TableHead>
                      <TableHead className="w-[135px]">생애 단계</TableHead>
                      <TableHead className="w-[235px]">부부 나이</TableHead>
                      <TableHead className="w-[225px]">필요한 월 보충액</TableHead>
                      <TableHead className="w-[210px]">충당 자산</TableHead>
                      <TableHead className="w-[225px]">월 인출 흐름</TableHead>
                      <TableHead className="w-[270px]">충당 결과</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetFundingPlans.map((plan) => {
                      const phaseMeta = cashflowPhaseMeta(plan.phase);
                      const periodLabel = `${plan.startYear}${
                        plan.endYear === plan.startYear
                          ? '년'
                          : `~${plan.endYear}년`
                      }`;
                      return (
                        <TableRow key={`${plan.startYear}-${plan.phase}`}>
                          <TableCell className="align-top">
                            <b className="block text-blue-950">
                              {periodLabel}
                            </b>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant="outline"
                              className={phaseMeta.className}
                            >
                              {phaseMeta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top text-xs leading-5">
                            <div className="grid gap-1">
                              <CompactFormulaLine
                                label={`시작 ${plan.startYear}년`}
                                value={`본인 ${plan.firstRow?.ageA}세${
                                  plan.firstRow?.ageB == null
                                    ? ''
                                    : ` · 배우자 ${plan.firstRow.ageB}세`
                                }`}
                              />
                              <CompactFormulaLine
                                label={`종료 ${plan.endYear}년`}
                                value={`본인 ${plan.lastRow?.ageA}세${
                                  plan.lastRow?.ageB == null
                                    ? ''
                                    : ` · 배우자 ${plan.lastRow.ageB}세`
                                }`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-xs leading-5">
                            <div className="grid gap-1">
                              <CompactFormulaLine
                                label="시작 월 부족"
                                value={`-${money(plan.firstRow?.monthlyGapBeforeAsset ?? 0)}`}
                                tone="negative"
                              />
                              <CompactFormulaLine
                                label="종료 월 부족"
                                value={`-${money(plan.lastRow?.monthlyGapBeforeAsset ?? 0)}`}
                                tone="negative"
                              />
                              <CompactFormulaLine
                                label="구간 최대 부족"
                                value={`-${money(plan.maxMonthlyGap)}`}
                                tone="negative"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-xs leading-5">
                            <div className="grid gap-1">
                            {plan.totalWithdrawal > 0 ? (
                              plan.sources.map((source) => (
                                <CompactFormulaLine
                                  key={source.name}
                                  label={source.name}
                                  value={`+${money(source.total)}`}
                                  tone="positive"
                                />
                              ))
                            ) : (
                              <CompactFormulaLine
                                label="인출 자산"
                                value="미지정"
                                tone="negative"
                              />
                            )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-xs leading-5">
                            <div className="grid gap-1">
                            {plan.totalWithdrawal > 0 ? (
                              <>
                                <CompactFormulaLine
                                  label={`시작 ${plan.firstWithdrawalRow?.year}년`}
                                  value={`+${money(plan.firstWithdrawalRow?.assetWithdrawal ?? 0)}`}
                                  tone="positive"
                                />
                                <CompactFormulaLine
                                  label={`종료 ${plan.lastWithdrawalRow?.year}년`}
                                  value={`+${money(plan.lastWithdrawalRow?.assetWithdrawal ?? 0)}`}
                                  tone="positive"
                                />
                                <CompactFormulaLine
                                  label="구간 최대 인출"
                                  value={`+${money(plan.maximumWithdrawal)}`}
                                  tone="positive"
                                />
                              </>
                            ) : (
                              <>
                                <CompactFormulaLine
                                  label={`시작 ${plan.startYear}년`}
                                  value="+0원"
                                />
                                <CompactFormulaLine
                                  label={`종료 ${plan.endYear}년`}
                                  value="+0원"
                                />
                                <CompactFormulaLine
                                  label="구간 최대 인출"
                                  value="+0원"
                                />
                              </>
                            )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-xs leading-5">
                            <Badge
                              variant="outline"
                              className={
                                plan.maximumResidual > 0
                                  ? 'border-rose-300 bg-rose-100 text-rose-900'
                                  : 'border-emerald-300 bg-emerald-100 text-emerald-900'
                              }
                            >
                              {plan.maximumResidual > 0
                                ? `${plan.coverageRate}% 충당`
                                : '100% 충당'}
                            </Badge>
                            <div className="mt-2 grid gap-1 border-b border-slate-200 pb-2">
                              <CompactFormulaLine
                                label="필요재원"
                                value={`-${money(plan.totalNeed)}`}
                                tone="negative"
                              />
                              <CompactFormulaLine
                                label="자산인출"
                                value={`+${money(plan.totalWithdrawal)}`}
                                tone="positive"
                              />
                              <CompactFormulaLine
                                label="미충당액"
                                value={`=${money(Math.max(0, plan.totalNeed - plan.totalWithdrawal))}`}
                                tone={
                                  plan.totalNeed - plan.totalWithdrawal > 0
                                    ? 'negative'
                                    : 'result'
                                }
                              />
                              <CompactFormulaLine
                                label="구간 말 자산잔액"
                                value={money(
                                  plan.lastRow?.cashAndFinancialAssetBalance ?? 0,
                                )}
                              />
                            </div>
                            <b
                              className={`mt-1 block ${
                                plan.maximumResidual > 0
                                  ? 'text-rose-900'
                                  : 'text-emerald-800'
                              }`}
                            >
                              {plan.maximumResidual > 0
                                ? `${plan.firstResidualYear}년부터 최대 월 ${money(plan.maximumResidual)} 부족`
                                : '등록 자산으로 모두 충당'}
                            </b>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              연금·반복소득만으로 생활비를 충족하므로 현금자산에서 가져올 필요재원이
              없습니다.
            </p>
          )}
          <div className="mt-5">
            <h4 className="font-black text-amber-950">
              자산을 사용한 뒤에도 남는 부족구간
            </h4>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              위 인출 계획을 적용하고도 생활비를 다 채우지 못한 기간만 표시합니다.
            </p>
          </div>
          {cashflow.gapPeriods.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {cashflow.gapPeriods.map((period) => (
                <div
                  key={`${period.startYear}-${period.phase}`}
                  className="rounded-xl border border-amber-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-amber-950">
                      {period.startYear}
                      {period.endYear === period.startYear
                        ? '년'
                        : `~${period.endYear}년`}
                    </p>
                    <Badge
                      variant="outline"
                      className={cashflowPhaseMeta(period.phase).className}
                    >
                      {cashflowPhaseMeta(period.phase).label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    최대 월 부족 <b>{money(period.maxMonthlyGap)}</b> · 이
                    구간의 {cashflow.baseYear}년 기준 현재가치{' '}
                    <b>{money(period.exactPresentValue)}</b>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-white p-4 text-sm font-bold text-emerald-800">
              현재 입력 가정에서는 마지막 생존 시점까지 생활비 부족구간이
              없습니다.
            </p>
          )}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-200 bg-white p-4">
              <p className="font-black text-blue-950">
                자산 사용 계획 반영 결과
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                자산을 쓰지 않을 때 부족액 현재가치는{' '}
                {money(cashflow.exactGapPresentValue)}입니다. 등록한
                시작연도·매각 시점·인출방식에 따라 총{' '}
                <b>{money(cashflow.finance.plannedAssetWithdrawals)}</b>을
                생활비에 투입한 뒤에도 남는 부족액 현재가치는{' '}
                <b>{money(cashflow.exactGapPresentValueAfterAssets)}</b>입니다.
                마지막 분석연도에 남는 활용 예정 자산은{' '}
                {money(cashflow.finance.remainingPlannedAssetsAtEnd)}입니다.
                {cashflow.suggestedMonthlyContribution > 0 && (
                  <>
                    {' '}
                    첫 부족연도 전까지 월{' '}
                    <b>{money(cashflow.suggestedMonthlyContribution)}</b>{' '}
                    적립안과 비교할 수 있습니다.
                  </>
                )}
              </p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-white p-4">
              <p className="font-black text-violet-950">자본계획 포함 범위</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {includeLateLifeGap
                  ? '마지막 생존자의 예상 사망연도까지 모든 부족구간을 필요재원에 포함했습니다.'
                  : '첫 사망 이후의 후기 부족은 위험구간으로 표시하되 기본 필요재원에서는 분리했습니다.'}{' '}
                첫 사망 이후 부족구간은 {cashflow.lateLifeGapPeriods.length}
                개입니다.
              </p>
            </div>
          </div>
        </section>

        {householdRetirementRow && householdRetirementYear && (
          <section className="rounded-xl border border-orange-200 bg-orange-50/50 p-5">
            <h3 className="text-lg font-black text-orange-950">
              가구 은퇴 첫해 확인 · {householdRetirementYear}년 (본인{' '}
              {householdRetirementRow.ageA}세
              {householdRetirementRow.ageB == null
                ? ''
                : ` · 배우자 ${householdRetirementRow.ageB}세`}
              )
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {householdRetirementYear}년 월 부채상환을 빼고 운용수익·자산인출을
              더한 생활비 사용 가능 현금{' '}
              <b>
                {money(householdRetirementRow.householdCashAvailableAfterAsset)}
              </b>{' '}
              (운용수익 +{money(householdRetirementRow.assetReturnIncome)} ·
              자산인출 +{money(householdRetirementRow.assetWithdrawal)}) ·
              생활비 <b>{money(householdRetirementRow.livingCost)}</b> · 월{' '}
              {householdRetirementRow.monthlyGap > 0
                ? `${money(householdRetirementRow.monthlyGap)} 부족`
                : `${money(householdRetirementRow.monthlySurplus)} 여유`}
            </p>
          </section>
        )}

        {cashflow.warnings.length > 0 && (
          <section className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-4">
            <h3 className="font-black text-amber-950">계산 전 확인할 항목</h3>
            <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200 bg-white">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="bg-amber-100/70">
                    <TableHead className="w-24 font-black">중요도</TableHead>
                    <TableHead className="w-60 font-black">확인 항목</TableHead>
                    <TableHead className="font-black">설명</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashflow.warnings.map((warning) => (
                    <TableRow key={warning.code}>
                      <TableCell
                        className={`font-black ${warning.severity === 'critical' ? 'text-rose-800' : 'text-amber-800'}`}
                      >
                        {warning.severity === 'critical'
                          ? '필수 확인'
                          : '참고 확인'}
                      </TableCell>
                      <TableCell className="font-bold text-slate-900">
                        {cashflowWarningLabels[warning.code] ?? warning.code}
                      </TableCell>
                      <TableCell className="text-sm leading-6 text-slate-700">
                        {warning.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        <div className="rounded-lg bg-slate-100 p-4 text-xs leading-5 text-slate-600">
          생활비는 선택한 조사 기준을 물가상승률로 단순 환산한 비교선이며 실제
          가구 지출과 다를 수 있습니다. 연금액·세금·투자수익·수수료와 제도는
          변동될 수 있으므로 사건별 금액은 계획 점검용으로 사용하세요.
        </div>
      </CardContent>
    </Card>
  );
}

function Report({
  result: sourceResult,
  policy,
  netReturnRate,
  basicPension,
  livingCost,
  householdFinance,
  includeLateLifeGap,
}: {
  result: SimulationResult;
  policy: Policy;
  netReturnRate: number;
  basicPension: BasicPensionSettings;
  livingCost: LivingCostSettings;
  householdFinance: HouseholdFinanceSettings;
  includeLateLifeGap: boolean;
}) {
  const result = useMemo(
    () => addBasicPensionToResult(sourceResult, basicPension, policy),
    [basicPension, policy, sourceResult],
  );
  const basicPensionMonthly = basicPensionBothAliveMonthly(
    sourceResult,
    basicPension,
    policy,
  );
  return (
    <div
      data-print="report"
      className="grid w-full min-w-0 max-w-full gap-5 print-area"
    >
      <LivingCostIncomeReport
        result={result}
        policy={policy}
        netReturnRate={netReturnRate}
        livingCost={livingCost}
        householdFinance={householdFinance}
        includeLateLifeGap={includeLateLifeGap}
        basicPensionMonthly={basicPensionMonthly}
      />
      {result.additionalPensions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>개인·퇴직연금 계산 결과</CardTitle>
            <CardDescription>
              적립금 계산은 선택한 기대수익률과 수수료가 수령기간 동안
              유지된다고 가정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>대상·연금</TableHead>
                  <TableHead>수령 시작</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">세전 월액</TableHead>
                  <TableHead className="text-right">첫해 세후 추정</TableHead>
                  <TableHead>수령한도</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.additionalPensions.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <b>{account.ownerName}</b> · {account.name}
                      <small className="block text-slate-500">
                        {pensionKindLabels[account.kind]}
                      </small>
                    </TableCell>
                    <TableCell>
                      {account.startYear}년 · {account.startAge}세
                      {account.projectedStartBalance != null && (
                        <small className="block text-indigo-600">
                          개시 예상 적립금{' '}
                          {money(account.projectedStartBalance)}
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.payoutYears > 0
                        ? `${account.payoutYears}년`
                        : '종신·미지정'}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {money(account.grossMonthly)}
                    </TableCell>
                    <TableCell className="text-right text-blue-700">
                      {money(account.firstYearEstimatedNetMonthly)}
                    </TableCell>
                    <TableCell
                      className={account.limitExceeded ? 'text-red-700' : ''}
                    >
                      {account.firstYearAnnualPensionLimit == null
                        ? '상품계약 확인'
                        : `첫해 연 ${money(account.firstYearAnnualPensionLimit)}`}
                      {account.limitExceeded && (
                        <small className="block font-bold">초과 가능</small>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {result.survivorDecision && (
        <Card className="border-violet-200 bg-violet-50">
          <CardHeader>
            <CardTitle>유족연금 자동 선택 결과</CardTitle>
            <CardDescription>{result.survivorDecision}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-violet-950">
            {result.survivorCalculation}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>연도별 부부 월 수령액</CardTitle>
          <CardDescription>
            각 연도의 대표 월 금액입니다. 사망 다음 연도부터 유족연금 전환을
            단순화해 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[620px] overflow-auto">
            <Table className="min-w-[860px]">
              <TableHeader className="sticky top-0 bg-slate-100">
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead>본인</TableHead>
                  <TableHead>배우자</TableHead>
                  <TableHead className="text-right">부부 합산</TableHead>
                  <TableHead className="text-right">세후 추정 합산</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.year}>
                    <TableCell className="font-bold">{row.year}년</TableCell>
                    <TableCell>
                      {row.ageA}세 <b>{money(row.pensionA)}</b>
                      {row.additionalPensionA > 0 && (
                        <small className="block text-indigo-600">
                          국민 {money(row.nationalPensionA)} + 기타{' '}
                          {money(row.additionalPensionA)}
                        </small>
                      )}
                      {row.detailA && (
                        <small className="block text-slate-500">
                          {row.detailA}
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.ageB == null ? (
                        '—'
                      ) : (
                        <>
                          {row.ageB}세 <b>{money(row.pensionB)}</b>
                          {row.additionalPensionB > 0 && (
                            <small className="block text-indigo-600">
                              국민 {money(row.nationalPensionB)} + 기타{' '}
                              {money(row.additionalPensionB)}
                            </small>
                          )}
                          {row.detailB && (
                            <small className="block text-slate-500">
                              {row.detailB}
                            </small>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-black text-blue-700">
                      {money(row.combined)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">
                      {money(row.estimatedNetCombined)}
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>계산 전 반드시 확인</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Home() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [tab, setTab] = useState('input');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sessionExists, setSessionExists] = useState(false);
  const [lastSaveKind, setLastSaveKind] = useState<ProfileSaveKind>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [profileFileName, setProfileFileName] = useState('');
  const [profileFileMode, setProfileFileMode] =
    useState<ProfileFileMode>('none');
  const [profileFileWriteReady, setProfileFileWriteReady] = useState(false);
  const [profileDialogMode, setProfileDialogMode] =
    useState<ProfileDialogMode>(null);
  const [profileDialogFileName, setProfileDialogFileName] = useState('');
  const [profileDialogPassword, setProfileDialogPassword] = useState('');
  const [profileDialogPasswordConfirm, setProfileDialogPasswordConfirm] =
    useState('');
  const [profileDialogError, setProfileDialogError] = useState('');
  const [showProfileDialogPasswords, setShowProfileDialogPasswords] =
    useState(false);
  const [pendingProfileFile, setPendingProfileFile] = useState<File | null>(
    null,
  );
  const [saveAsCurrentPassword, setSaveAsCurrentPassword] = useState('');
  const [saveAsNewPassword, setSaveAsNewPassword] = useState('');
  const [saveAsNewPasswordConfirm, setSaveAsNewPasswordConfirm] = useState('');
  const [pendingPolicyUpdate, setPendingPolicyUpdate] =
    useState<PolicyUpdatePackage | null>(null);
  const policyMarkdownInput = useRef<HTMLInputElement>(null);
  const profileInput = useRef<HTMLInputElement>(null);
  const profileFileHandle = useRef<ProfileFileHandle | null>(null);
  const pendingProfileFileHandle = useRef<ProfileFileHandle | null>(null);
  const profileFilePassword = useRef('');
  const saveProfileShortcut = useRef<() => Promise<void>>(async () => {});
  const dirtyTrackingStarted = useRef(false);
  const suppressNextDirtyCheck = useRef(false);
  const update = (who: 'a' | 'b', value: PersonInput) =>
    setForm((prev) => ({ ...prev, [who]: value }));
  const canSimulate = useMemo(
    () =>
      form.a.birth.length === 8 &&
      form.a.anchoredMonthlyPension > 0 &&
      form.a.expectedMonths > 0,
    [form],
  );
  useEffect(() => {
    const id = window.setTimeout(
      () => setSessionExists(hasEncryptedSession()),
      0,
    );
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!dirtyTrackingStarted.current) {
      dirtyTrackingStarted.current = true;
      return;
    }
    if (suppressNextDirtyCheck.current) {
      suppressNextDirtyCheck.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [form, policy]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(''), 4000);
    return () => window.clearTimeout(id);
  }, [message]);
  useEffect(() => {
    if (tab !== 'report' || !canSimulate) return;
    const id = window.setTimeout(() => {
      try {
        setResult(
          simulate(
            form.a,
            form.b,
            policy,
            additionalPensionsForSimulation(form),
            form.npsInflation,
          ),
        );
        setMessage('선택 조건 변경을 종합 보고서에 자동 반영했습니다.');
      } catch (error) {
        setResult(null);
        setMessage(
          error instanceof Error ? error.message : '입력값을 확인하세요.',
        );
      }
    }, 80);
    return () => window.clearTimeout(id);
  }, [canSimulate, form, policy, tab]);
  const run = () => {
    try {
      setResult(
        simulate(
          form.a,
          form.b,
          policy,
          additionalPensionsForSimulation(form),
          form.npsInflation,
        ),
      );
      setMessage('선택 조건으로 보고서를 계산했습니다.');
      setTab('report');
    } catch (e) {
      setResult(null);
      setMessage(e instanceof Error ? e.message : '입력값을 확인하세요.');
    }
  };
  const applySavedProfile = (saved: SavedProfile) => {
    if (!saved?.form?.a || !saved.form.b || !saved.policy)
      throw new Error('저장 파일에 필요한 프로필 정보가 없습니다.');
    const birthYearA = Number(saved.form.a.birth.slice(0, 4)) || 1970;
    const birthYearB = Number(saved.form.b.birth.slice(0, 4)) || birthYearA;
    const pensionGoalTimelines =
      saved.form.pensionGoalTimelines ??
      (saved.form.pensionGoals
        ? legacyGoalsToTimelines(
            saved.form.pensionGoals,
            birthYearA,
            birthYearB,
          )
        : initialForm().pensionGoalTimelines);
    suppressNextDirtyCheck.current = true;
    setForm({
      a: {
        ...saved.form.a,
        hasNps: saved.form.a.hasNps ?? true,
        employmentIncomeEnabled: saved.form.a.employmentIncomeEnabled ?? true,
        retirementAge: saved.form.a.retirementAge ?? 60,
        preRetirementMonthlyIncome:
          saved.form.a.preRetirementMonthlyIncome ?? 0,
      },
      b: {
        ...saved.form.b,
        hasNps: saved.form.b.hasNps ?? saved.form.b.anchoredMonthlyPension > 0,
        employmentIncomeEnabled:
          saved.form.b.employmentIncomeEnabled ?? saved.form.b.enabled,
        retirementAge: saved.form.b.retirementAge ?? 60,
        preRetirementMonthlyIncome:
          saved.form.b.preRetirementMonthlyIncome ?? 0,
      },
      additionalPensions: (saved.form.additionalPensions ?? []).map(
        (account) => ({
          ...account,
          balanceBaseAge:
            account.balanceBaseAge ??
            currentAge(saved.form[account.owner].birth),
          monthlyContributionUntilStart:
            account.monthlyContributionUntilStart ?? 0,
          contributionFrequency:
            account.contributionFrequency ??
            ((account.monthlyContributionUntilStart ?? 0) > 0
              ? 'monthly'
              : 'none'),
          contributionAmount:
            account.contributionAmount ??
            account.monthlyContributionUntilStart ??
            0,
          contributionEndAge:
            account.contributionEndAge ??
            (account.kind === 'retirementIrp' || account.kind === 'dbdc'
              ? Math.min(60, account.startAge)
              : account.startAge),
          annualReturnRateBeforeStart: account.annualReturnRateBeforeStart ?? 0,
          annuityPaymentTermYears: account.annuityPaymentTermKnown
            ? (account.annuityPaymentTermYears ?? 5)
            : recommendedAnnuityPaymentTermYears(account.accountOpenDate, true),
          annuityPaymentTermKnown: account.annuityPaymentTermKnown ?? false,
          annuityPremiumPaying: account.annuityPremiumPaying ?? true,
        }),
      ),
      pensionGoalTimelines,
      plannerNetReturnRate: saved.form.plannerNetReturnRate ?? 2,
      includeLateLifeGap: saved.form.includeLateLifeGap ?? false,
      npsInflation: {
        ...defaultNationalPensionInflationSettings(),
        ...saved.form.npsInflation,
      },
      basicPension: saved.form.basicPension ?? defaultBasicPensionSettings(),
      livingCost: {
        ...defaultLivingCostSettings(),
        ...saved.form.livingCost,
      },
      householdFinance: {
        ...defaultHouseholdFinanceSettings(),
        ...saved.form.householdFinance,
        realEstateCostPolicy: saved.form.householdFinance?.realEstateCostPolicy
          ? validateRealEstateCostPolicy(
              saved.form.householdFinance.realEstateCostPolicy,
            )
          : DEFAULT_REAL_ESTATE_COST_POLICY,
      },
    });
    setPolicy(validatePolicy(saved.policy));
  };
  const markProfileSaved = (kind: Exclude<ProfileSaveKind, null>) => {
    setLastSaveKind(kind);
    setLastSavedAt(new Date());
    setHasUnsavedChanges(false);
  };
  const saveSession = async () => {
    try {
      await saveEncryptedSession(
        { formSchemaVersion: '2.0', form, policy },
        password,
      );
      setSessionExists(true);
      markProfileSaved('session');
      setPassword('');
      setMessage(
        '이 탭의 sessionStorage에 암호화하여 저장했습니다. 탭을 닫으면 사라집니다.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const loadSession = async () => {
    try {
      const saved = await loadEncryptedSession<SavedProfile>(password);
      applySavedProfile(saved);
      markProfileSaved('session');
      setPassword('');
      setMessage('암호화 세션을 복원했습니다.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const queryProfileWritePermission = async (handle: ProfileFileHandle) => {
    try {
      return handle.queryPermission
        ? await handle.queryPermission({ mode: 'readwrite' })
        : ('granted' as PermissionState);
    } catch {
      return 'prompt' as PermissionState;
    }
  };
  const ensureProfileWritePermission = async (handle: ProfileFileHandle) => {
    let permission = await queryProfileWritePermission(handle);
    if (permission !== 'granted' && handle.requestPermission) {
      try {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      } catch {
        permission = 'denied';
      }
    }
    if (permission !== 'granted')
      throw new Error(
        `${handle.name}의 쓰기 권한이 필요합니다. 권한 요청에서 허용한 뒤 다시 Ctrl+S를 눌러주세요.`,
      );
    setProfileFileWriteReady(true);
  };
  const writeEncryptedProfile = async (
    handle: ProfileFileHandle,
    content: string,
  ) => {
    await ensureProfileWritePermission(handle);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  };
  const suggestedProfileFileName = () => {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `부부연금종합시뮬레이터_암호화프로필_${date}.json`;
  };
  const closeProfileDialog = () => {
    setProfileDialogMode(null);
    setProfileDialogFileName('');
    setProfileDialogPassword('');
    setProfileDialogPasswordConfirm('');
    setSaveAsCurrentPassword('');
    setSaveAsNewPassword('');
    setSaveAsNewPasswordConfirm('');
    setShowProfileDialogPasswords(false);
    setProfileDialogError('');
    setPendingProfileFile(null);
    pendingProfileFileHandle.current = null;
  };
  const openNewProfileSaveDialog = () => {
    setProfileDialogFileName(suggestedProfileFileName());
    setProfileDialogPassword('');
    setProfileDialogPasswordConfirm('');
    setShowProfileDialogPasswords(false);
    setProfileDialogError('');
    setProfileDialogMode('save');
  };
  const openSaveAsProfileDialog = () => {
    if (!profileFileName || !profileFilePassword.current) {
      setMessage('먼저 암호화 JSON 파일을 저장하거나 불러오세요.');
      return;
    }
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const baseName =
      profileFileName.replace(/\.json$/i, '') ||
      '부부연금종합시뮬레이터_암호화프로필';
    setProfileDialogFileName(`${baseName}_사본_${date}.json`);
    setSaveAsCurrentPassword('');
    setSaveAsNewPassword('');
    setSaveAsNewPasswordConfirm('');
    setShowProfileDialogPasswords(false);
    setProfileDialogError('');
    setProfileDialogMode('save-as');
  };
  const exportEncryptedProfile = async (options?: {
    password?: string;
    suggestedName?: string;
    forceNew?: boolean;
  }) => {
    try {
      const encryptionPassword =
        options?.password ?? profileFilePassword.current;
      if (encryptionPassword.length < 8) {
        openNewProfileSaveDialog();
        return false;
      }
      let handle = options?.forceNew ? null : profileFileHandle.current;
      if (
        !handle &&
        (options?.forceNew === true || profileFileMode !== 'download')
      ) {
        const picker = (window as FilePickerWindow).showSaveFilePicker;
        if (picker) {
          handle = await picker({
            suggestedName:
              options?.suggestedName || suggestedProfileFileName(),
            types: encryptedProfileFileTypes,
          });
        }
      }
      const profile = await createEncryptedProfileFile(
        { formSchemaVersion: '2.0', form, policy },
        encryptionPassword,
      );
      const content = JSON.stringify(profile, null, 2);
      if (handle) {
        await writeEncryptedProfile(handle, content);
        profileFileHandle.current = handle;
        profileFilePassword.current = encryptionPassword;
        setProfileFileName(handle.name);
        setProfileFileMode('direct');
        setPassword('');
        setMessage(
          profileFileName && !options?.forceNew
            ? `${handle.name}에 현재 내용을 바로 저장했습니다.`
            : `${handle.name}에 저장하고 현재 탭과 연결했습니다. 이제 Ctrl+S로 바로 저장할 수 있습니다.`,
        );
        markProfileSaved('json');
        return true;
      }
      const blob = new Blob([content], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const downloadName =
        options?.suggestedName ||
        profileFileName ||
        `부부연금종합시뮬레이터_암호화프로필_${date}.json`;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(link.href);
      profileFilePassword.current = encryptionPassword;
      setProfileFileName(downloadName);
      setProfileFileMode('download');
      setProfileFileWriteReady(false);
      setPassword('');
      setMessage(
        profileFileName && !options?.forceNew
          ? `${downloadName} 이름으로 현재 내용을 다시 내려받았습니다.`
          : `${downloadName}을 내려받고 Ctrl+S 작업 파일로 기억했습니다. 이 브라우저는 원본 직접 덮어쓰기를 지원하지 않아 같은 이름으로 다시 내려받습니다.`,
      );
      markProfileSaved('json');
      return true;
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === 'AbortError'
          ? '파일 저장을 취소했습니다.'
          : (error as Error).message,
      );
      return false;
    }
  };
  const saveEncryptedProfileAs = async () => {
    try {
      if (!profileFileName || !profileFilePassword.current)
        throw new Error('먼저 암호화 JSON 파일을 저장하거나 불러오세요.');
      if (saveAsCurrentPassword.length < 8)
        throw new Error('현재 파일 암호를 8자 이상 입력하세요.');
      if (saveAsCurrentPassword !== profileFilePassword.current)
        throw new Error('현재 파일 암호가 일치하지 않습니다.');
      if (saveAsNewPassword.length < 8)
        throw new Error('새 파일 암호를 8자 이상 입력하세요.');
      if (saveAsNewPassword === saveAsCurrentPassword)
        throw new Error('새 파일 암호는 현재 암호와 다르게 입력하세요.');
      if (saveAsNewPassword !== saveAsNewPasswordConfirm)
        throw new Error('새 파일 암호 확인이 일치하지 않습니다.');
      if (!profileDialogFileName.trim())
        throw new Error('새 파일명을 입력하세요.');
      const saved = await exportEncryptedProfile({
        password: saveAsNewPassword,
        suggestedName: profileDialogFileName.trim().endsWith('.json')
          ? profileDialogFileName.trim()
          : `${profileDialogFileName.trim()}.json`,
        forceNew: true,
      });
      if (saved) closeProfileDialog();
    } catch (error) {
      setProfileDialogError((error as Error).message);
    }
  };
  const exportAiAnalysisMarkdown = () => {
    try {
      if (!result) throw new Error('먼저 종합 보고서를 계산한 뒤 저장하세요.');
      const content = buildAiAnalysisMarkdown({
        result,
        policy,
        npsInflation: form.npsInflation,
        basicPension: form.basicPension,
        livingCost: form.livingCost,
        plannerNetReturnRate: form.plannerNetReturnRate,
        householdFinance: form.householdFinance,
        includeLateLifeGap: form.includeLateLifeGap,
      });
      const blob = new Blob([content], {
        type: 'text/markdown;charset=utf-8',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      link.download = `부부연금_AI상담용_종합현황_${date}.md`;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage(
        'AI 상담용 Markdown을 저장했습니다. 평문 파일이므로 공유 전에 내용을 확인하세요.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  useEffect(() => {
    saveProfileShortcut.current = async () => {
      await exportEncryptedProfile();
    };
  });
  useEffect(() => {
    const saveFromKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's')
        return;
      event.preventDefault();
      if (
        !profileFileHandle.current &&
        !profileFileName &&
        !profileFilePassword.current
      ) {
        setTab('privacy');
        openNewProfileSaveDialog();
        return;
      }
      void saveProfileShortcut.current();
    };
    window.addEventListener('keydown', saveFromKeyboard);
    return () => window.removeEventListener('keydown', saveFromKeyboard);
  }, [profileFileName]);
  const restoreEncryptedProfile = async (
    file: File,
    handle: ProfileFileHandle | null,
    decryptionPassword: string,
  ) => {
    if (decryptionPassword.length < 8)
      throw new Error('파일을 불러올 암호를 8자 이상 입력하세요.');
    const saved = await readEncryptedProfileFile<SavedProfile>(
      JSON.parse(await file.text()),
      decryptionPassword,
    );
    applySavedProfile(saved);
    if (handle) {
      profileFileHandle.current = handle;
      profileFilePassword.current = decryptionPassword;
      setProfileFileName(handle.name);
      setProfileFileMode('direct');
      const permission = await queryProfileWritePermission(handle);
      setProfileFileWriteReady(permission === 'granted');
    } else {
      profileFileHandle.current = null;
      profileFilePassword.current = decryptionPassword;
      setProfileFileName(file.name);
      setProfileFileMode('download');
      setProfileFileWriteReady(false);
    }
    setMessage(
      handle
        ? `${file.name}을 복원하고 현재 탭과 연결했습니다. 다음 저장부터 이 파일에 바로 저장합니다.`
        : `${file.name}의 전체 프로필을 복원하고 Ctrl+S 작업 파일로 기억했습니다. 이 브라우저에서는 같은 이름으로 즉시 다시 내려받습니다.`,
    );
    markProfileSaved('json');
  };
  const prepareEncryptedProfileLoad = (
    file: File,
    handle: ProfileFileHandle | null,
  ) => {
    setPendingProfileFile(file);
    pendingProfileFileHandle.current = handle;
    setProfileDialogFileName(file.name);
    setProfileDialogPassword('');
    setProfileDialogPasswordConfirm('');
    setShowProfileDialogPasswords(false);
    setProfileDialogError('');
    setProfileDialogMode('load');
  };
  const chooseEncryptedProfile = async () => {
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) {
      profileInput.current?.click();
      return;
    }
    try {
      const [handle] = await picker({
        multiple: false,
        types: encryptedProfileFileTypes,
      });
      if (!handle) return;
      prepareEncryptedProfileLoad(await handle.getFile(), handle);
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === 'AbortError'
          ? '파일 불러오기를 취소했습니다.'
          : error instanceof SyntaxError
            ? 'JSON 파일 형식이 올바르지 않습니다.'
            : (error as Error).message,
      );
    }
  };
  const importEncryptedProfile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    prepareEncryptedProfileLoad(file, null);
    event.target.value = '';
  };
  const confirmProfileDialog = async () => {
    setProfileDialogError('');
    try {
      if (profileDialogMode === 'load') {
        if (!pendingProfileFile)
          throw new Error('불러올 JSON 파일을 다시 선택하세요.');
        await restoreEncryptedProfile(
          pendingProfileFile,
          pendingProfileFileHandle.current,
          profileDialogPassword,
        );
        closeProfileDialog();
        return;
      }
      if (profileDialogMode === 'save') {
        if (!profileDialogFileName.trim())
          throw new Error('저장할 파일명을 입력하세요.');
        if (profileDialogPassword.length < 8)
          throw new Error('파일 암호를 8자 이상 입력하세요.');
        if (profileDialogPassword !== profileDialogPasswordConfirm)
          throw new Error('파일 암호 확인이 일치하지 않습니다.');
        const saved = await exportEncryptedProfile({
          password: profileDialogPassword,
          suggestedName: profileDialogFileName.trim().endsWith('.json')
            ? profileDialogFileName.trim()
            : `${profileDialogFileName.trim()}.json`,
          forceNew: true,
        });
        if (saved) closeProfileDialog();
        return;
      }
      if (profileDialogMode === 'save-as')
        await saveEncryptedProfileAs();
    } catch (error) {
      setProfileDialogError(
        error instanceof SyntaxError
          ? 'JSON 파일 형식이 올바르지 않습니다.'
          : (error as Error).message,
      );
    }
  };
  const exportPolicyUpdateMarkdown = () => {
    const content = buildPolicyUpdateMarkdown(
      policy,
      form.householdFinance.realEstateCostPolicy ??
        DEFAULT_REAL_ESTATE_COST_POLICY,
    );
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    link.download = `부부연금_통합정책_AI업데이트요청_${date}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage(
      '연금·부동산 통합 정책 업데이트 요청 Markdown을 내려받았습니다.',
    );
  };
  const importPolicyUpdateMarkdown = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const updatePackage = parsePolicyUpdateMarkdown(await file.text());
      setPendingPolicyUpdate(updatePackage);
      setMessage(
        `${file.name}을 검증했습니다. 아래 변경 요약과 출처를 확인한 뒤 적용하세요.`,
      );
    } catch (error) {
      setPendingPolicyUpdate(null);
      setMessage((error as Error).message);
    } finally {
      event.target.value = '';
    }
  };
  const applyPendingPolicyUpdate = () => {
    if (!pendingPolicyUpdate) return;
    const nextPensionPolicy = validatePolicy(pendingPolicyUpdate.pensionPolicy);
    const nextRealEstatePolicy = validateRealEstateCostPolicy(
      pendingPolicyUpdate.realEstatePolicy,
    );
    setPolicy(nextPensionPolicy);
    setForm((previous) => ({
      ...previous,
      householdFinance: {
        ...previous.householdFinance,
        realEstateCostPolicy: nextRealEstatePolicy,
      },
    }));
    setPendingPolicyUpdate(null);
    setMessage(
      `${nextPensionPolicy.policyId} · ${nextRealEstatePolicy.policyId} 정책을 함께 적용했습니다.`,
    );
  };
  const saveStatusLabel = hasUnsavedChanges
    ? '저장되지 않은 변경 있음'
    : lastSaveKind === 'json'
      ? `JSON 저장됨${profileFileName ? ` · ${profileFileName}` : ''}`
      : lastSaveKind === 'session'
        ? '임시 저장됨'
        : sessionExists
          ? '복원 가능한 임시 저장 있음'
          : '저장 기록 없음';
  const saveStatusTitle = lastSavedAt
    ? `마지막 저장 ${lastSavedAt.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : saveStatusLabel;

  return (
    <main className="min-h-screen max-w-full overflow-x-clip bg-[#f3f7fb] text-slate-950">
      <Dialog
        open={profileDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeProfileDialog();
        }}
      >
        <DialogContent
          className={`max-h-[calc(100vh-2rem)] overflow-y-auto border-2 sm:max-w-lg ${
            profileDialogMode === 'load'
              ? 'border-emerald-400'
              : profileDialogMode === 'save-as'
                ? 'border-violet-400'
                : 'border-blue-400'
          }`}
        >
          <DialogHeader>
            <DialogTitle
              className={`flex items-center gap-2 text-lg font-black ${
                profileDialogMode === 'load'
                  ? 'text-emerald-900'
                  : profileDialogMode === 'save-as'
                    ? 'text-violet-900'
                    : 'text-blue-900'
              }`}
            >
              {profileDialogMode === 'load' ? (
                <Upload className="size-5" />
              ) : profileDialogMode === 'save-as' ? (
                <FilePlus2 className="size-5" />
              ) : (
                <Save className="size-5" />
              )}
              {profileDialogMode === 'load'
                ? '암호화 JSON 파일 열기'
                : profileDialogMode === 'save-as'
                  ? '다른 이름·새 암호로 저장'
                  : '암호화 JSON 파일 저장'}
            </DialogTitle>
            <DialogDescription>
              {profileDialogMode === 'load'
                ? '선택한 파일의 암호를 입력하고 확인을 누르면 전체 프로필을 복원합니다.'
                : profileDialogMode === 'save-as'
                  ? '파일명과 새 암호를 확인한 뒤 Windows 저장 창에서 새 위치를 선택합니다.'
                  : '파일명과 8자 이상의 암호를 입력한 뒤 Windows 저장 창에서 위치를 선택합니다.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {profileDialogMode === 'save-as' && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                <span className="font-bold">현재 파일</span>
                <span className="mt-1 block break-all">{profileFileName}</span>
              </div>
            )}
            <label className="grid gap-1.5">
              <span className="field-label">
                {profileDialogMode === 'load' ? '선택한 파일' : '파일명'}
              </span>
              <Input
                value={profileDialogFileName}
                readOnly={profileDialogMode === 'load'}
                className={
                  profileDialogMode === 'load'
                    ? 'border-emerald-200 bg-emerald-50 font-bold text-emerald-950'
                    : 'bg-white'
                }
                onChange={(event) =>
                  setProfileDialogFileName(event.target.value)
                }
              />
            </label>

            {profileDialogMode === 'save-as' ? (
              <>
                <label className="grid gap-1.5">
                  <span className="field-label">현재 파일 암호</span>
                  <Input
                    type={showProfileDialogPasswords ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={saveAsCurrentPassword}
                    placeholder="현재 암호 8자 이상"
                    onChange={(event) =>
                      setSaveAsCurrentPassword(event.target.value)
                    }
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="field-label">새 파일 암호</span>
                    <Input
                      type={showProfileDialogPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={saveAsNewPassword}
                      placeholder="새 암호 8자 이상"
                      onChange={(event) =>
                        setSaveAsNewPassword(event.target.value)
                      }
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="field-label">새 파일 암호 확인</span>
                    <Input
                      type={showProfileDialogPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={saveAsNewPasswordConfirm}
                      placeholder="새 암호 다시 입력"
                      onChange={(event) =>
                        setSaveAsNewPasswordConfirm(event.target.value)
                      }
                    />
                  </label>
                </div>
              </>
            ) : (
              <div
                className={`grid gap-3 ${profileDialogMode === 'save' ? 'sm:grid-cols-2' : ''}`}
              >
                <label className="grid gap-1.5">
                  <span className="field-label">파일 암호</span>
                  <Input
                    type={showProfileDialogPasswords ? 'text' : 'password'}
                    autoComplete={
                      profileDialogMode === 'load'
                        ? 'current-password'
                        : 'new-password'
                    }
                    value={profileDialogPassword}
                    placeholder="8자 이상 암호"
                    onChange={(event) =>
                      setProfileDialogPassword(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        profileDialogMode === 'load' &&
                        profileDialogPassword.length >= 8
                      )
                        void confirmProfileDialog();
                    }}
                  />
                </label>
                {profileDialogMode === 'save' && (
                  <label className="grid gap-1.5">
                    <span className="field-label">파일 암호 확인</span>
                    <Input
                      type={showProfileDialogPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={profileDialogPasswordConfirm}
                      placeholder="암호 다시 입력"
                      onChange={(event) =>
                        setProfileDialogPasswordConfirm(event.target.value)
                      }
                    />
                  </label>
                )}
              </div>
            )}

            <label
              className={`flex items-center gap-2 text-xs font-semibold ${
                profileDialogMode === 'load'
                  ? 'text-emerald-900'
                  : profileDialogMode === 'save-as'
                    ? 'text-violet-900'
                    : 'text-blue-900'
              }`}
            >
              <Checkbox
                checked={showProfileDialogPasswords}
                onCheckedChange={(value) =>
                  setShowProfileDialogPasswords(value === true)
                }
              />
              입력한 암호 표시
            </label>
            {profileDialogError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
                {profileDialogError}
              </p>
            )}
            {(profileDialogMode === 'save' ||
              profileDialogMode === 'save-as') && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs font-semibold leading-5 ${
                  profileDialogMode === 'save-as'
                    ? 'border-violet-200 bg-violet-50 text-violet-900'
                    : 'border-blue-200 bg-blue-50 text-blue-900'
                }`}
              >
                아래 ‘저장 위치 선택 후 저장’을 누르면 Windows 파일 저장 창이
                열립니다. 그 창에서 폴더와 파일명을 최종 지정할 수 있습니다.
                파일 직접 저장을 지원하지 않는 브라우저에서는 브라우저의 기본
                다운로드 위치를 사용합니다.
              </div>
            )}
            <p className="text-xs leading-5 text-slate-500">
              암호는 저장되지 않으며, 잊으면 이 파일을 복구할 수 없습니다.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeProfileDialog}>
              취소
            </Button>
            <Button
              type="button"
              className={
                profileDialogMode === 'load'
                  ? 'bg-emerald-700 font-bold hover:bg-emerald-800'
                  : profileDialogMode === 'save-as'
                    ? 'bg-violet-700 font-bold hover:bg-violet-800'
                    : 'bg-blue-700 font-bold hover:bg-blue-800'
              }
              disabled={
                profileDialogMode === 'load'
                  ? profileDialogPassword.length < 8
                  : profileDialogMode === 'save-as'
                    ? saveAsCurrentPassword.length < 8 ||
                      saveAsNewPassword.length < 8 ||
                      saveAsNewPasswordConfirm.length < 8 ||
                      saveAsNewPassword !== saveAsNewPasswordConfirm ||
                      !profileDialogFileName.trim()
                    : profileDialogPassword.length < 8 ||
                      profileDialogPasswordConfirm.length < 8 ||
                      profileDialogPassword !== profileDialogPasswordConfirm ||
                      !profileDialogFileName.trim()
              }
              onClick={() => void confirmProfileDialog()}
            >
              {profileDialogMode === 'load' ? (
                <Upload />
              ) : profileDialogMode === 'save-as' ? (
                <FilePlus2 />
              ) : (
                <Save />
              )}
              {profileDialogMode === 'load'
                ? '확인하고 열기'
                : profileDialogMode === 'save-as'
                  ? '저장 위치 선택 후 사본 저장'
                  : '저장 위치 선택 후 저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <header
        data-print="hide"
        className="border-b border-slate-800 bg-[#091525] text-white"
      >
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-9">
          <div>
            <p className="text-xl font-bold tracking-tight">
              부부 연금 종합 시뮬레이터
            </p>
            <p className="mt-1 text-xs text-blue-200">
              국민·기초·개인·퇴직·유족연금 통합 · 브라우저 내부 계산 · 서버 전송
              없음
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              title={saveStatusTitle}
              className={`h-8 max-w-[min(26rem,80vw)] gap-2 px-3 ${
                hasUnsavedChanges
                  ? 'bg-amber-300 text-amber-950'
                  : lastSaveKind === 'json'
                    ? 'bg-blue-600 text-white'
                    : lastSaveKind === 'session' || sessionExists
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700 text-slate-100'
              }`}
            >
              {hasUnsavedChanges ? (
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-950" />
              ) : lastSaveKind === 'session' || sessionExists ? (
                <LockKeyhole className="size-3.5 shrink-0" />
              ) : (
                <Save className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{saveStatusLabel}</span>
            </Badge>
            <Badge className="h-8 bg-emerald-950 px-3 text-emerald-200">
              <ShieldCheck /> 개인정보 로컬 처리
            </Badge>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full min-w-0 max-w-[1480px] px-4 py-5 lg:px-9">
        <section
          data-print="hide"
          className="mb-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-blue-700" />
            <div>
              <b>서버를 사용하지 않는 독립형 · 민감정보 보호 모드</b>
              <p className="mt-1 text-blue-800">
                이 HTML은 별도 서버 없이 실행되며 입력과 계산은 현재 브라우저
                안에서만 처리됩니다. JSON 파일은 암호화해 PC에 저장하고, 탭 임시
                저장은 sessionStorage에 암호문으로 남아 탭을 닫으면 삭제됩니다.
              </p>
            </div>
          </div>
          <Badge variant="outline">정책 {policy.policyId}</Badge>
        </section>
        {message && (
          <output
            data-print="hide"
            aria-live="polite"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
          >
            <span>{message}</span>
            <button
              type="button"
              aria-label="알림 닫기"
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => setMessage('')}
            >
              <X className="size-4" />
            </button>
          </output>
        )}
        <div data-print="hide">
          <HouseholdBasicInfo form={form} policy={policy} update={update} />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList
            data-print="hide"
            className="mb-7 grid min-h-16 w-full grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-5"
          >
            <TabsTrigger
              value="input"
              className="min-h-12 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 hover:bg-blue-100 data-active:border-blue-700 data-active:bg-blue-700 data-active:text-white"
            >
              1. 공단 정보 입력
            </TabsTrigger>
            <TabsTrigger
              value="additional"
              className="min-h-12 rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-black text-violet-800 hover:bg-violet-100 data-active:border-violet-700 data-active:bg-violet-700 data-active:text-white"
            >
              2. 개인·퇴직연금
            </TabsTrigger>
            <TabsTrigger
              value="finance"
              className="min-h-12 rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-900 hover:bg-cyan-100 data-active:border-cyan-700 data-active:bg-cyan-700 data-active:text-white"
            >
              3. 자산·부채·기타소득
            </TabsTrigger>
            <TabsTrigger
              value="report"
              className="min-h-12 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 hover:bg-emerald-100 data-active:border-emerald-700 data-active:bg-emerald-700 data-active:text-white"
            >
              4. 전략·종합 보고서
            </TabsTrigger>
            <TabsTrigger
              value="privacy"
              className="min-h-12 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900 hover:bg-amber-100 data-active:border-amber-600 data-active:bg-amber-500 data-active:text-slate-950"
            >
              5. 정책·보안 관리
            </TabsTrigger>
          </TabsList>
          <TabsContent value="input" className="grid gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                NPS 앱의 값 그대로
              </p>
              <h1 className="mt-1 text-2xl font-bold">
                부부의 예상연금 정보를 입력하세요
              </h1>
            </div>
            <section className="grid gap-5 xl:grid-cols-2">
              <PersonCard person={form.a} setPerson={(p) => update('a', p)} />
              <PersonCard
                person={form.b}
                setPerson={(p) => update('b', p)}
                optional
              />
            </section>
            <NpsPolicyGuide policy={policy} />
            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={!canSimulate}
                onClick={() => setTab('additional')}
              >
                다음: 개인·퇴직연금
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="additional" className="grid gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">
                선택 입력 · 없는 경우 건너뛰기
              </p>
              <h1 className="mt-1 text-2xl font-bold">
                개인연금과 퇴직연금을 추가하세요
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                금융기관에서 월 예상액을 확인했다면 직접 입력이 가장 정확합니다.
                현재 적립금만 아는 경우 개시 전 운용기간과 추가납입,
                수령기간·기대수익률·수수료로 월액을 계산합니다.
              </p>
            </div>
            <section className="grid gap-5 xl:grid-cols-2">
              <AdditionalPensionCard
                owner="a"
                ownerName={form.a.name}
                ownerEnabled={form.a.enabled}
                ownerBirth={form.a.birth}
                accounts={form.additionalPensions}
                setAccounts={(additionalPensions) =>
                  setForm((prev) => ({ ...prev, additionalPensions }))
                }
              />
              <AdditionalPensionCard
                owner="b"
                ownerName={form.b.name}
                ownerEnabled={form.b.enabled}
                ownerBirth={form.b.birth}
                accounts={form.additionalPensions}
                setAccounts={(additionalPensions) =>
                  setForm((prev) => ({ ...prev, additionalPensions }))
                }
              />
            </section>
            <AdditionalPensionGuide policy={policy} />
            <div className="flex justify-end">
              <Button size="lg" onClick={() => setTab('finance')}>
                다음: 자산·부채·기타소득
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="finance" className="grid gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">
                은퇴 현금흐름 완성
              </p>
              <h1 className="mt-1 text-2xl font-bold">
                자산·부채와 연금 외 반복소득을 입력하세요
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                실거주 주택은 순자산에는 포함하지만 별도 매각 계획이 없으면 은퇴
                생활비 재원으로 자동 사용하지 않습니다. 대출 상환정보가 비어
                있으면 부족액 계산에 반영하지 못했다는 경고를 표시합니다.
              </p>
            </div>
            <HouseholdFinanceControls
              value={form.householdFinance}
              onChange={(householdFinance) =>
                setForm((prev) => ({ ...prev, householdFinance }))
              }
            />
            <div className="flex justify-end">
              <Button size="lg" onClick={() => setTab('report')}>
                다음: 전략·종합 보고서
              </Button>
            </div>
          </TabsContent>
          <TabsContent
            value="report"
            className="grid w-full min-w-0 max-w-full gap-5"
          >
            <div
              data-print="only"
              className="hidden border-b-2 border-slate-900 pb-3"
            >
              <p className="text-xs font-bold text-slate-600">
                정책 {policy.policyId} · 출력일{' '}
                {new Date().toLocaleDateString('ko-KR')}
              </p>
              <h1 className="mt-1 text-2xl font-black">
                부부 연금·은퇴 종합 분석 보고서
              </h1>
              <p className="mt-1 text-xs text-slate-600">
                입력 조건에 따른 연금·생활비·자산·부채와 주요 사건별 현금흐름
                분석
              </p>
            </div>
            <div
              data-print="hide"
              className="flex flex-wrap items-end justify-between gap-4"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                  한 화면에서 조건 선택
                </p>
                <h1 className="mt-1 text-2xl font-bold">
                  국민·기초·개인·퇴직연금과 유족연금을 함께 비교합니다
                </h1>
              </div>
              <div className="ml-auto grid justify-items-end gap-2">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-11 w-40 border-slate-300 bg-white font-bold"
                    onClick={() => window.print()}
                  >
                    <Printer /> 인쇄
                  </Button>
                  <Button
                    size="lg"
                    className="h-11 w-40 bg-blue-700 font-bold hover:bg-blue-800"
                    disabled={!canSimulate}
                    onClick={run}
                  >
                    지금 다시 계산
                  </Button>
                </div>
                <p className="max-w-[21rem] text-right text-[11px] leading-4 text-slate-500">
                  인쇄 설정에서 ‘머리글과 바닥글’을 끄면 파일 경로와 페이지 번호가
                  나오지 않습니다.
                </p>
              </div>
            </div>
            <Card
              data-print="hide"
              className="overflow-hidden border-2 border-violet-400 bg-gradient-to-br from-violet-50 via-white to-blue-50 shadow-md"
            >
              <CardContent className="grid gap-5 py-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="grid gap-4">
                  <div className="flex gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-white shadow-sm">
                    <FileText className="size-5" />
                    </div>
                    <div>
                      <Badge className="mb-1 bg-violet-700 text-white">
                        계산 결과를 AI와 함께 점검
                      </Badge>
                      <p className="text-lg font-black text-violet-950">
                        AI 상담용 종합 현황을 저장하세요
                      </p>
                      <p className="mt-1 max-w-4xl text-sm leading-6 text-violet-900">
                        연금액만 전달하는 파일이 아니라, 은퇴·연금 개시·주택 매각과
                        대출상환·자산 인출 전후 부족·현금잔액 변화를 한 번에 담아
                        AI가 <b>언제 무엇을 준비해야 하는지</b> 분석할 수 있게 합니다.
                      </p>
                    </div>
                  </div>
                  <ol className="grid gap-2 text-xs leading-5 text-slate-700 sm:grid-cols-3">
                    {[
                      ['1', '계산 확정', '입력값을 확인한 뒤 ‘지금 다시 계산’을 누릅니다.'],
                      ['2', 'MD 저장', '오른쪽 버튼으로 최신 계산 결과를 내려받습니다.'],
                      ['3', 'AI에 첨부', '새 대화에 MD를 첨부하고 아래 예시처럼 질문합니다.'],
                    ].map(([step, title, description]) => (
                      <li
                        key={step}
                        className="flex gap-2 rounded-lg border border-violet-200 bg-white/90 p-3"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-700 font-black text-white">
                          {step}
                        </span>
                        <span>
                          <b className="block text-violet-950">{title}</b>
                          {description}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950">
                    <b>AI 질문 예시</b> · “이 파일을 기준으로 핵심 결론, 시점별로
                    필요한 행동, 자산 인출 전후 부족, 현금 고갈 위험과 민감도를
                    순서대로 설명해줘.”
                  </div>
                  <p className="text-[11px] leading-5 text-rose-700">
                    금액·자산 정보가 포함된 암호화되지 않은 평문 파일입니다.
                    생년월일 전체와 저장 암호는 제외되지만 외부 공유 전 내용을
                    확인하세요.
                  </p>
                </div>
                <div className="grid gap-2 lg:min-w-56">
                  <Button
                    type="button"
                    size="lg"
                    className="h-13 shrink-0 bg-violet-700 px-6 text-base font-black shadow-md hover:bg-violet-800"
                    disabled={!result}
                    onClick={exportAiAnalysisMarkdown}
                  >
                    <Download /> AI 상담용 MD 저장
                  </Button>
                  <span className="text-center text-[11px] font-semibold text-violet-800">
                    현재 화면의 최신 계산 결과로 생성
                  </span>
                </div>
              </CardContent>
            </Card>
            <div data-print="hide" className="grid gap-5">
              <HouseholdRetirementSettings
                people={{ a: form.a, b: form.b }}
                netReturnRate={form.plannerNetReturnRate}
                setPerson={(owner, patch) =>
                  setForm((prev) => ({
                    ...prev,
                    [owner]: { ...prev[owner], ...patch },
                  }))
                }
                setNetReturnRate={(plannerNetReturnRate) =>
                  setForm((prev) => ({ ...prev, plannerNetReturnRate }))
                }
                includeLateLifeGap={form.includeLateLifeGap}
                setIncludeLateLifeGap={(includeLateLifeGap) =>
                  setForm((prev) => ({ ...prev, includeLateLifeGap }))
                }
              />
              <NpsInflationControls
                settings={form.npsInflation}
                setSettings={(npsInflation) =>
                  setForm((prev) => ({ ...prev, npsInflation }))
                }
              />
              <section className="grid gap-5 xl:grid-cols-2">
                <StrategyCard
                  person={form.a}
                  policy={policy}
                  setPerson={(p) => update('a', p)}
                />
                <StrategyCard
                  person={form.b}
                  policy={policy}
                  setPerson={(p) => update('b', p)}
                />
              </section>
              <AdditionalPensionStrategyControls
                accounts={form.additionalPensions}
                people={{ a: form.a, b: form.b }}
                policy={policy}
                setAccounts={(additionalPensions) =>
                  setForm((prev) => ({ ...prev, additionalPensions }))
                }
              />
              <PublicPensionAndLivingCostControls
                people={{ a: form.a, b: form.b }}
                policy={policy}
                basicPension={form.basicPension}
                livingCost={form.livingCost}
                setBasicPension={(basicPension) =>
                  setForm((prev) => ({ ...prev, basicPension }))
                }
                setLivingCost={(livingCost) =>
                  setForm((prev) => ({ ...prev, livingCost }))
                }
              />
            </div>
            {result ? (
              <Report
                result={result}
                policy={policy}
                netReturnRate={form.plannerNetReturnRate}
                basicPension={form.basicPension}
                livingCost={form.livingCost}
                householdFinance={form.householdFinance}
                includeLateLifeGap={form.includeLateLifeGap}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center text-slate-500">
                  입력값을 확인하면 종합 보고서가 자동으로 표시됩니다.
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="privacy" className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <FileKey className="mr-2 inline size-5" />
                  전체 프로필 저장·불러오기
                </CardTitle>
                <CardDescription>
                  AES-256-GCM + PBKDF2-SHA256(250,000회). 암호 자체는 저장하지
                  않습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <section className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div>
                    <h3 className="font-black text-blue-950">로컬 JSON 파일</h3>
                    <p className="mt-1 text-xs leading-5 text-blue-800">
                      모든 입력값·목표·연금계좌·정책을 하나의 암호화 JSON 파일로
                      내려받습니다. 다른 PC의 같은 HTML에서도 불러올 수
                      있습니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-blue-700 font-bold hover:bg-blue-800"
                      onClick={() => {
                        if (profileFileName && profileFilePassword.current)
                          void exportEncryptedProfile();
                        else openNewProfileSaveDialog();
                      }}
                    >
                      {profileFileMode === 'direct' ? <Save /> : <Download />}
                      {profileFileMode === 'direct'
                        ? profileFileWriteReady
                          ? '현재 파일에 바로 저장 (Ctrl+S)'
                          : '현재 파일 쓰기 권한 확인'
                        : profileFileMode === 'download'
                          ? '같은 이름으로 다시 저장 (Ctrl+S)'
                          : 'JSON 파일 저장'}
                    </Button>
                    <Button
                      className="bg-emerald-700 font-bold hover:bg-emerald-800"
                      onClick={chooseEncryptedProfile}
                    >
                      <Upload /> JSON 파일 불러오기
                    </Button>
                    <Button
                      className="bg-violet-700 font-bold hover:bg-violet-800"
                      disabled={!profileFileName}
                      onClick={openSaveAsProfileDialog}
                    >
                      <FilePlus2 /> 현재 파일을 다른 이름으로 저장
                    </Button>
                    <input
                      ref={profileInput}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={importEncryptedProfile}
                    />
                  </div>
                  <p className="text-xs text-blue-800">
                    저장한 암호를 잊으면 파일을 복구할 수 없습니다. JSON 안에는
                    평문 개인정보가 아닌 암호문만 기록됩니다.
                  </p>
                  <p className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-blue-900">
                    {profileFileMode === 'direct'
                      ? profileFileWriteReady
                        ? `현재 연결된 파일: ${profileFileName} · 암호는 현재 탭 메모리에만 유지됩니다. Ctrl+S로 같은 파일에 즉시 저장하며, 탭을 닫거나 새로고침하면 연결과 암호가 해제됩니다.`
                        : `현재 기억한 파일: ${profileFileName} · Ctrl+S를 누르면 새 저장 위치를 묻지 않고 이 파일의 쓰기 권한만 확인합니다.`
                      : profileFileMode === 'download'
                        ? `현재 작업 파일: ${profileFileName} · 이 브라우저는 원본 파일 직접 덮어쓰기를 지원하지 않습니다. Ctrl+S는 저장 위치를 다시 묻지 않고 같은 파일명으로 암호화 JSON을 내려받습니다.`
                        : '파일을 한 번 저장하거나 불러오면 지원 브라우저에서는 원본에 바로 저장하고, 그 외 브라우저에서는 같은 이름으로 즉시 다시 내려받습니다.'}
                  </p>
                </section>
                <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h3 className="font-bold">이 탭 임시 저장</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      탭을 닫기 전 잠깐 보관할 때만 사용하세요.
                    </p>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="field-label">임시 저장 암호</span>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        className="bg-white pr-12"
                        placeholder="8자 이상 암호"
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? '암호 숨기기' : '암호 보기'}
                        className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                        onClick={() => setShowPassword((visible) => !visible)}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={saveSession}>
                      <LockKeyhole /> 탭 임시 저장
                    </Button>
                    <Button variant="outline" onClick={loadSession}>
                      탭 임시 불러오기
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        try {
                          clearEncryptedSession();
                          setSessionExists(false);
                          if (lastSaveKind === 'session') {
                            setLastSaveKind(null);
                            setLastSavedAt(null);
                            setHasUnsavedChanges(true);
                          }
                          setMessage('암호화 세션을 삭제했습니다.');
                        } catch (error) {
                          setMessage((error as Error).message);
                        }
                      }}
                    >
                      <RotateCcw /> 임시 저장 삭제
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    현재 임시 저장:{' '}
                    {sessionExists ? '이 탭에 암호문 있음' : '없음'} · 브라우저
                    확장 프로그램이나 감염된 기기까지 방어하는 기능은 아닙니다.
                  </p>
                </section>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>연금·부동산 통합 정책 업데이트</CardTitle>
                <CardDescription>
                  연금·부동산 정책을 AI 업데이트 요청 Markdown으로 내보내고,
                  돌려받은 파일을 검증·미리보기한 뒤 함께 적용할 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="rounded-lg bg-slate-100 p-3 text-sm">
                  <b>연금: {policy.policyId}</b>
                  <span className="ml-2 text-slate-500">
                    시행 기준 {policy.effectiveDate}
                  </span>
                  <br />
                  <b>
                    부동산:{' '}
                    {
                      (
                        form.householdFinance.realEstateCostPolicy ??
                        DEFAULT_REAL_ESTATE_COST_POLICY
                      ).policyId
                    }
                  </b>
                  <span className="ml-2 text-slate-500">
                    시행 기준{' '}
                    {
                      (
                        form.householdFinance.realEstateCostPolicy ??
                        DEFAULT_REAL_ESTATE_COST_POLICY
                      ).effectiveDate
                    }
                  </span>
                </div>
                <input
                  ref={policyMarkdownInput}
                  className="hidden"
                  type="file"
                  accept="text/markdown,.md"
                  onChange={importPolicyUpdateMarkdown}
                />
                <section className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
                  <p className="font-black text-blue-950">
                    AI로 연금·부동산 정책 함께 업데이트
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-blue-900">
                    <li>업데이트 요청 Markdown을 내려받습니다.</li>
                    <li>
                      GPT 등 웹 검색이 가능한 AI에 첨부해 공식자료 기준
                      업데이트를 요청합니다.
                    </li>
                    <li>
                      AI가 돌려준 Markdown을 불러와 변경 요약·출처를 확인합니다.
                    </li>
                    <li>
                      검토 후 ‘두 정책 적용’을 눌러야 실제 계산에 반영됩니다.
                    </li>
                  </ol>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={exportPolicyUpdateMarkdown}>
                      <Download /> AI 업데이트 요청 MD
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => policyMarkdownInput.current?.click()}
                    >
                      <Upload /> AI 결과 MD 불러오기
                    </Button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-blue-800">
                    Markdown의 일반 문장은 실행하지 않습니다. 고정 표식 안의
                    JSON 정책 블록만 읽고 스키마·숫자 범위·HTTPS 출처를
                    검사합니다.
                  </p>
                </section>
                {pendingPolicyUpdate && (
                  <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-amber-950">
                          적용 전 미리보기
                        </p>
                        <p className="mt-1 text-xs text-amber-800">
                          연금 {policy.policyId} →{' '}
                          {pendingPolicyUpdate.pensionPolicy.policyId} · 부동산{' '}
                          {
                            (
                              form.householdFinance.realEstateCostPolicy ??
                              DEFAULT_REAL_ESTATE_COST_POLICY
                            ).policyId
                          }{' '}
                          → {pendingPolicyUpdate.realEstatePolicy.policyId}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={applyPendingPolicyUpdate}>
                          두 정책 적용
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setPendingPolicyUpdate(null)}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-black text-amber-950">
                      변경 요약
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
                      {pendingPolicyUpdate.changeSummary.map((summary) => (
                        <li key={summary}>{summary}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs font-black text-amber-950">
                      확인할 출처 ({pendingPolicyUpdate.researchSources.length}
                      건)
                    </p>
                    <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-xs leading-5">
                      {pendingPolicyUpdate.researchSources.map((source) => (
                        <li key={`${source.url}-${source.checkedAt}`}>
                          <a
                            className="font-bold text-blue-700 underline"
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.title}
                          </a>{' '}
                          · 확인 {source.checkedAt}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  <p className="text-xs leading-5 text-amber-700">
                    AI 결과는 출처·시행일·정책 ID를 확인한 뒤 적용하세요.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPolicy(DEFAULT_POLICY);
                      setForm((previous) => ({
                        ...previous,
                        householdFinance: {
                          ...previous.householdFinance,
                          realEstateCostPolicy: DEFAULT_REAL_ESTATE_COST_POLICY,
                        },
                      }));
                      setPendingPolicyUpdate(null);
                      setMessage(
                        '연금·부동산 내장 기본 정책으로 되돌렸습니다.',
                      );
                    }}
                  >
                    문제 발생 시 기본값 복원
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
