'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { resolveAssetUsePlan } from '@/lib/household-cashflow';
import type {
  AssetType,
  AssetUseMode,
  DebtRepaymentType,
  HouseholdAsset,
  HouseholdDebt,
  HouseholdFinanceSettings,
  HousingSurplusReturnMode,
  HousingSurplusType,
  RecurringIncome,
  RetirementLiquidity,
} from '@/lib/household-cashflow';
import {
  DEFAULT_REAL_ESTATE_COST_POLICY,
  estimateAnnualResidentialHoldingTaxes,
  estimateHomePurchaseCosts,
  estimateHomeSaleCosts,
  type HoldingTaxSettings,
  type PurchaseCostAutoSettings,
  type SaleCostAutoSettings,
} from '@/lib/real-estate-costs';

const currentYear = new Date().getFullYear();
const moneyNumber = (value: string) => Number(value.replace(/\D/g, '')) || 0;
const formatMoney = (value: number) =>
  `${Math.round(value).toLocaleString('ko-KR')}원`;

const defaultSaleAutoSettings = (
  asset: HouseholdAsset,
): SaleCostAutoSettings => ({
  enabled: true,
  acquisitionYear: currentYear - 10,
  acquisitionPrice: Math.round(asset.currentValue * 0.7),
  residenceYears: 0,
  necessaryExpenses: 0,
  householdHomeCountAtSale: 1,
  regulatedArea: false,
  oneHouseExemptionEligible: false,
  includeBrokerageVat: true,
  jointOwnership: false,
  ownerAShareRate: 50,
});

const defaultPurchaseAutoSettings = (): PurchaseCostAutoSettings => ({
  enabled: true,
  homeCountAfterPurchase: 'one_or_temporary_two',
  regulatedArea: false,
  exclusiveAreaOver85: false,
  includeBrokerageVat: true,
  jointOwnership: false,
  ownerAShareRate: 50,
});

const defaultHoldingTaxSettings = (
  asset: HouseholdAsset,
): HoldingTaxSettings => ({
  enabled: true,
  includeInCashflow: false,
  assessedValue: Math.round(asset.currentValue * 0.7),
  householdHomeCount: 1,
  oneHouseholdOneHome: true,
  soleOwner: 'a',
  jointOwnership: false,
  ownerAShareRate: 50,
  includeUrbanAreaTax: true,
});

const assetTypeLabels: Record<AssetType, string> = {
  cash: '현금·예금',
  financial: '금융·투자자산',
  primary_home: '실거주 주택',
  rental_property: '임대 부동산',
  officetel: '오피스텔',
  jeonse_deposit: '회수 가능한 전세보증금',
  other: '기타 자산',
};
const liquidityLabels: Record<RetirementLiquidity, string> = {
  liquid: '즉시 활용 가능',
  sellable: '매각하면 활용 가능',
  illiquid: '당장 현금화 어려움',
  exclude: '은퇴재원에서 제외',
};
const assetUseModeLabels: Record<AssetUseMode, string> = {
  cover_gap: '생활비 부족분 자동 충당',
  fixed_monthly: '매월 정액 인출',
  hold: '보유만 함 · 현금흐름 미사용',
};
const housingSurplusTypeLabels: Record<HousingSurplusType, string> = {
  deposit: '예금·현금성 운용',
  investment: '투자자산 운용',
};
const housingSurplusReturnModeLabels: Record<HousingSurplusReturnMode, string> =
  {
    reinvest: '수익 재투자 · 잔액 복리 증가',
    cash_income: '수익을 생활비 현금으로 사용',
  };

function MoneyField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      inputMode="numeric"
      disabled={disabled}
      value={value ? value.toLocaleString('ko-KR') : ''}
      placeholder="0"
      onChange={(event) => onChange(moneyNumber(event.target.value))}
    />
  );
}

function DecimalField({
  value,
  onChange,
  placeholder = '0',
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? (value == null ? '' : String(value));

  const commit = (raw: string) => {
    if (raw === '') {
      onChange(undefined);
      return;
    }
    if (raw === '-' || raw === '.' || raw === '-.' || raw.endsWith('.')) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) onChange(parsed);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={displayedValue}
      onChange={(event) => {
        const raw = event.target.value.replace(',', '.');
        if (!/^-?\d*(?:\.\d*)?$/.test(raw)) return;
        setDraft(raw);
        commit(raw);
      }}
      onBlur={() => {
        if (
          displayedValue === '' ||
          displayedValue === '-' ||
          displayedValue === '.' ||
          displayedValue === '-.' ||
          displayedValue.endsWith('.')
        ) {
          setDraft(null);
          return;
        }
        commit(displayedValue);
        setDraft(null);
      }}
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function HouseholdFinanceControls({
  value,
  onChange,
}: {
  value: HouseholdFinanceSettings;
  onChange: (value: HouseholdFinanceSettings) => void;
}) {
  const realEstateCostPolicy =
    value.realEstateCostPolicy ?? DEFAULT_REAL_ESTATE_COST_POLICY;
  const patchAsset = (id: string, patch: Partial<HouseholdAsset>) =>
    onChange({
      ...value,
      assets: value.assets.map((asset) =>
        asset.id === id ? { ...asset, ...patch } : asset,
      ),
    });
  const patchDebt = (id: string, patch: Partial<HouseholdDebt>) =>
    onChange({
      ...value,
      debts: value.debts.map((debt) =>
        debt.id === id ? { ...debt, ...patch } : debt,
      ),
    });
  const patchIncome = (id: string, patch: Partial<RecurringIncome>) =>
    onChange({
      ...value,
      recurringIncomes: value.recurringIncomes.map((income) =>
        income.id === id ? { ...income, ...patch } : income,
      ),
    });
  const addAsset = () => {
    const asset: HouseholdAsset = {
      id: `asset-${Date.now()}`,
      name: '새 자산',
      type: 'cash',
      currentValue: 0,
      retirementLiquidity: 'liquid',
      retirementUse: {
        mode: 'cover_gap',
        startYear: currentYear,
        reserveAmount: 0,
      },
    };
    onChange({ ...value, assets: [...value.assets, asset] });
  };
  const addDebt = () => {
    const debt: HouseholdDebt = {
      id: `debt-${Date.now()}`,
      name: '새 대출',
      principal: 0,
    };
    onChange({ ...value, debts: [...value.debts, debt] });
  };
  const addIncome = () => {
    const income: RecurringIncome = {
      id: `income-${Date.now()}`,
      name: '기타 반복소득',
      monthlyAmount: 0,
      startYear: currentYear,
      endYear: null,
    };
    onChange({
      ...value,
      recurringIncomes: [...value.recurringIncomes, income],
    });
  };

  return (
    <div className="grid gap-5">
      <Card className="border-emerald-200">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>가구 자산</CardTitle>
              <CardDescription>
                순자산과 실제 은퇴에 활용 가능한 자산을 구분합니다. 실거주
                주택은 기본적으로 은퇴재원에서 제외됩니다.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addAsset}>
              <Plus /> 자산 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {value.assets.length === 0 && (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
              등록된 자산이 없습니다. 현금·금융자산과 부동산을 구분해
              입력하세요.
            </p>
          )}
          {value.assets.map((asset, assetIndex) => {
            const rentalEnabled = Boolean(asset.rental?.enabled);
            const saleEnabled = Boolean(asset.salePlan?.enabled);
            const housingMoveEnabled = Boolean(asset.housingMovePlan?.enabled);
            const isResidentialRealEstate = [
              'primary_home',
              'rental_property',
              'officetel',
            ].includes(asset.type);
            const holdingTaxEnabled = Boolean(asset.holdingTax?.enabled);
            const householdHoldingTaxEstimate =
              estimateAnnualResidentialHoldingTaxes(
                value.assets.flatMap((property) =>
                  property.holdingTax?.enabled
                    ? [
                        {
                          id: property.id,
                          name: property.name,
                          marketValue: property.currentValue,
                          settings: property.holdingTax,
                        },
                      ]
                    : [],
                ),
                realEstateCostPolicy,
              );
            const assetHoldingTaxEstimate =
              householdHoldingTaxEstimate.perProperty.find(
                (estimate) => estimate.id === asset.id,
              );
            const usePlan = resolveAssetUsePlan(asset, currentYear);
            const projectedSaleValue =
              asset.currentValue *
              (1 + (asset.annualAppreciationRate ?? 0) / 100) **
                Math.max(
                  0,
                  (asset.salePlan?.year ?? currentYear) - currentYear,
                );
            const saleAutoEstimate = asset.salePlan?.autoCostSettings?.enabled
              ? estimateHomeSaleCosts({
                  projectedSalePrice: projectedSaleValue,
                  saleYear: asset.salePlan.year,
                  settings: asset.salePlan.autoCostSettings,
                  policy: realEstateCostPolicy,
                })
              : null;
            const currentNetSaleEstimate = Math.max(
              0,
              projectedSaleValue -
                (saleAutoEstimate?.totalSellingCosts ??
                  projectedSaleValue *
                    ((asset.salePlan?.sellingCostRate ?? 0) / 100) +
                    (asset.salePlan?.capitalGainsTaxEstimate ?? 0)),
            );
            const purchaseAutoEstimate = asset.housingMovePlan
              ?.purchaseAutoCostSettings?.enabled
              ? estimateHomePurchaseCosts({
                  purchasePrice: asset.housingMovePlan.purchasePrice,
                  settings: asset.housingMovePlan.purchaseAutoCostSettings,
                  policy: realEstateCostPolicy,
                })
              : null;
            const replacementPurchaseEstimate = asset.housingMovePlan?.enabled
              ? Math.max(
                  0,
                  asset.housingMovePlan.purchasePrice +
                    (purchaseAutoEstimate?.totalPurchaseCosts ??
                      asset.housingMovePlan.purchasePrice *
                        ((asset.housingMovePlan.purchaseCostRate ?? 0) / 100) +
                        (asset.housingMovePlan.purchaseTaxEstimate ?? 0)),
                )
              : 0;
            return (
              <section
                key={asset.id}
                className="overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white shadow-md ring-1 ring-emerald-100"
              >
                <div className="flex items-center gap-3 border-b-2 border-emerald-200 bg-emerald-100/80 px-4 py-3">
                  <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-black text-white">
                    자산 {assetIndex + 1}
                  </span>
                  <strong className="text-base text-emerald-950">
                    {asset.name || '이름 없는 자산'}
                  </strong>
                  <span className="text-xs font-semibold text-emerald-800">
                    {assetTypeLabels[asset.type]}
                  </span>
                </div>
                <div className="p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="자산 유형">
                      <NativeSelect
                        value={asset.type}
                        onChange={(event) => {
                          const type = event.target.value as AssetType;
                          patchAsset(asset.id, {
                            type,
                            retirementLiquidity:
                              type === 'primary_home'
                                ? 'exclude'
                                : asset.retirementLiquidity,
                            retirementUse:
                              type === 'primary_home'
                                ? { ...usePlan, mode: 'hold' }
                                : usePlan,
                          });
                        }}
                      >
                        {Object.entries(assetTypeLabels).map(([key, label]) => (
                          <NativeSelectOption key={key} value={key}>
                            {label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="표시 이름">
                      <Input
                        value={asset.name}
                        onChange={(event) =>
                          patchAsset(asset.id, { name: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="현재 가치">
                      <MoneyField
                        value={asset.currentValue}
                        onChange={(currentValue) =>
                          patchAsset(asset.id, { currentValue })
                        }
                      />
                    </Field>
                    <Field label="현재 현금화 상태">
                      <NativeSelect
                        value={asset.retirementLiquidity}
                        onChange={(event) =>
                          patchAsset(asset.id, {
                            retirementLiquidity: event.target
                              .value as RetirementLiquidity,
                          })
                        }
                      >
                        {Object.entries(liquidityLabels).map(([key, label]) => (
                          <NativeSelectOption key={key} value={key}>
                            {label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  </div>
                  {isResidentialRealEstate && (
                    <div className="mt-4 rounded-xl border-2 border-rose-200 bg-rose-50/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <label className="flex items-center gap-2 text-sm font-black text-rose-950">
                            <Checkbox
                              checked={holdingTaxEnabled}
                              onCheckedChange={(checked) =>
                                patchAsset(asset.id, {
                                  holdingTax: checked
                                    ? asset.holdingTax
                                      ? { ...asset.holdingTax, enabled: true }
                                      : defaultHoldingTaxSettings(asset)
                                    : asset.holdingTax
                                      ? { ...asset.holdingTax, enabled: false }
                                      : undefined,
                                })
                              }
                            />
                            재산세·종합부동산세 자동 러프 계산
                          </label>
                          <p className="mt-1 text-xs leading-5 text-rose-800">
                            보유세는 별도 세목이 아니라 재산세와 종합부동산세 등을
                            묶어 부르는 표현입니다. 공시가격·명의·주택 수로 연간
                            금액을 거칠게 추정합니다.
                          </p>
                        </div>
                        {holdingTaxEnabled && asset.holdingTax && (
                          <label className="flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-black text-rose-950">
                            <Checkbox
                              checked={asset.holdingTax.includeInCashflow}
                              onCheckedChange={(checked) =>
                                patchAsset(asset.id, {
                                  holdingTax: {
                                    ...asset.holdingTax!,
                                    includeInCashflow: Boolean(checked),
                                  },
                                })
                              }
                            />
                            전체 분석에 월 비용으로 반영
                          </label>
                        )}
                      </div>
                      {holdingTaxEnabled && asset.holdingTax && (
                        <>
                          <div className="mt-3 rounded-lg border border-orange-300 bg-orange-100 px-3 py-2 text-xs font-bold leading-5 text-orange-950">
                            {realEstateCostPolicy.policyId} 기준의 계획용 추정입니다.
                            세부담상한·고령자/장기보유 공제·감면·합산배제·과세기준일은
                            반영하지 않습니다. 실제 고지액과 다를 수 있습니다.
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <Field label="현재 공시가격">
                              <MoneyField
                                value={asset.holdingTax.assessedValue}
                                onChange={(assessedValue) =>
                                  patchAsset(asset.id, {
                                    holdingTax: {
                                      ...asset.holdingTax!,
                                      assessedValue,
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="가구 전체 주택 수">
                              <NativeSelect
                                value={String(asset.holdingTax.householdHomeCount)}
                                onChange={(event) =>
                                  patchAsset(asset.id, {
                                    holdingTax: {
                                      ...asset.holdingTax!,
                                      householdHomeCount: Number(
                                        event.target.value,
                                      ) as 1 | 2 | 3,
                                    },
                                  })
                                }
                              >
                                <NativeSelectOption value="1">1주택</NativeSelectOption>
                                <NativeSelectOption value="2">2주택</NativeSelectOption>
                                <NativeSelectOption value="3">
                                  3주택 이상
                                </NativeSelectOption>
                              </NativeSelect>
                            </Field>
                            {!asset.holdingTax.jointOwnership && (
                              <Field label="단독 명의자">
                                <NativeSelect
                                  value={asset.holdingTax.soleOwner}
                                  onChange={(event) =>
                                    patchAsset(asset.id, {
                                      holdingTax: {
                                        ...asset.holdingTax!,
                                        soleOwner: event.target.value as 'a' | 'b',
                                      },
                                    })
                                  }
                                >
                                  <NativeSelectOption value="a">본인</NativeSelectOption>
                                  <NativeSelectOption value="b">배우자</NativeSelectOption>
                                </NativeSelect>
                              </Field>
                            )}
                            {asset.holdingTax.jointOwnership && (
                              <Field label="본인 지분율(%)">
                                <DecimalField
                                  value={asset.holdingTax.ownerAShareRate}
                                  onChange={(ownerAShareRate) =>
                                    patchAsset(asset.id, {
                                      holdingTax: {
                                        ...asset.holdingTax!,
                                        ownerAShareRate: ownerAShareRate ?? 50,
                                      },
                                    })
                                  }
                                />
                              </Field>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-5 text-sm font-bold text-slate-800">
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={asset.holdingTax.oneHouseholdOneHome}
                                onCheckedChange={(checked) =>
                                  patchAsset(asset.id, {
                                    holdingTax: {
                                      ...asset.holdingTax!,
                                      oneHouseholdOneHome: Boolean(checked),
                                    },
                                  })
                                }
                              />
                              1세대 1주택으로 가정
                            </label>
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={asset.holdingTax.jointOwnership}
                                onCheckedChange={(checked) =>
                                  patchAsset(asset.id, {
                                    holdingTax: {
                                      ...asset.holdingTax!,
                                      jointOwnership: Boolean(checked),
                                    },
                                  })
                                }
                              />
                              공동명의
                            </label>
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={asset.holdingTax.includeUrbanAreaTax}
                                onCheckedChange={(checked) =>
                                  patchAsset(asset.id, {
                                    holdingTax: {
                                      ...asset.holdingTax!,
                                      includeUrbanAreaTax: Boolean(checked),
                                    },
                                  })
                                }
                              />
                              도시지역분 포함
                            </label>
                          </div>
                          {assetHoldingTaxEstimate && (
                            <div className="mt-3 grid gap-2 rounded-lg border border-rose-200 bg-white p-3 text-xs md:grid-cols-3 xl:grid-cols-6">
                              <span>
                                재산세{' '}
                                <b>{formatMoney(assetHoldingTaxEstimate.propertyTax)}</b>
                              </span>
                              <span>
                                지방교육세{' '}
                                <b>
                                  {formatMoney(
                                    assetHoldingTaxEstimate.localEducationTax,
                                  )}
                                </b>
                              </span>
                              <span>
                                도시지역분{' '}
                                <b>{formatMoney(assetHoldingTaxEstimate.urbanAreaTax)}</b>
                              </span>
                              <span>
                                종합부동산세{' '}
                                <b>
                                  {formatMoney(
                                    assetHoldingTaxEstimate.comprehensiveRealEstateTax,
                                  )}
                                </b>
                              </span>
                              <span>
                                농어촌특별세{' '}
                                <b>{formatMoney(assetHoldingTaxEstimate.ruralSpecialTax)}</b>
                              </span>
                              <b className="text-rose-900">
                                연 {formatMoney(assetHoldingTaxEstimate.annualTotal)} · 월평균{' '}
                                {formatMoney(assetHoldingTaxEstimate.annualTotal / 12)}
                              </b>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                    <p className="mb-3 text-xs font-bold text-blue-900">
                      {housingMoveEnabled
                        ? '아래 방식은 새 주택 구입 후 남은 예금·투자자금에 적용됩니다.'
                        : '이 자산을 은퇴 생활비에 어떻게 사용할지 정하세요.'}{' '}
                      자동 충당은 생활비가 부족한 연도에만 필요한 만큼
                      인출합니다.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <Field label="생활비 활용 방식">
                        <NativeSelect
                          value={usePlan.mode}
                          onChange={(event) =>
                            patchAsset(asset.id, {
                              retirementUse: {
                                ...usePlan,
                                mode: event.target.value as AssetUseMode,
                              },
                            })
                          }
                        >
                          {Object.entries(assetUseModeLabels).map(
                            ([key, label]) => (
                              <NativeSelectOption key={key} value={key}>
                                {label}
                              </NativeSelectOption>
                            ),
                          )}
                        </NativeSelect>
                      </Field>
                      {usePlan.mode !== 'hold' && (
                        <>
                          <Field label="활용 시작연도">
                            <Input
                              inputMode="numeric"
                              value={usePlan.startYear}
                              onChange={(event) =>
                                patchAsset(asset.id, {
                                  retirementUse: {
                                    ...usePlan,
                                    startYear: moneyNumber(event.target.value),
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="활용 종료연도(선택)">
                            <Input
                              inputMode="numeric"
                              value={usePlan.endYear ?? ''}
                              placeholder="마지막 분석연도까지"
                              onChange={(event) =>
                                patchAsset(asset.id, {
                                  retirementUse: {
                                    ...usePlan,
                                    endYear: event.target.value
                                      ? moneyNumber(event.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </Field>
                          {usePlan.mode === 'fixed_monthly' && (
                            <Field label="매월 인출액">
                              <MoneyField
                                value={usePlan.monthlyAmount ?? 0}
                                onChange={(monthlyAmount) =>
                                  patchAsset(asset.id, {
                                    retirementUse: {
                                      ...usePlan,
                                      monthlyAmount,
                                    },
                                  })
                                }
                              />
                            </Field>
                          )}
                          <Field label="남겨둘 최소 잔액">
                            <MoneyField
                              value={usePlan.reserveAmount ?? 0}
                              onChange={(reserveAmount) =>
                                patchAsset(asset.id, {
                                  retirementUse: { ...usePlan, reserveAmount },
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                    </div>
                    {usePlan.mode !== 'hold' &&
                      asset.retirementLiquidity !== 'liquid' &&
                      !saleEnabled && (
                        <p className="mt-2 text-xs font-bold text-amber-800">
                          현금화 가능한 연도가 없으므로 아직 인출되지 않습니다.
                          아래 ‘매각·현금화 계획’을 켜고 연도를 입력하세요.
                        </p>
                      )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-5 border-t-2 border-emerald-200 pt-4">
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <Checkbox
                        checked={rentalEnabled}
                        onCheckedChange={(checked) =>
                          patchAsset(asset.id, {
                            rental: {
                              enabled: Boolean(checked),
                              grossMonthlyRent:
                                asset.rental?.grossMonthlyRent ?? 0,
                              annualRentGrowthRate:
                                asset.rental?.annualRentGrowthRate,
                              vacancyRate: asset.rental?.vacancyRate,
                              operatingExpenseRate:
                                asset.rental?.operatingExpenseRate,
                              estimatedTaxRate: asset.rental?.estimatedTaxRate,
                              startYear: asset.rental?.startYear ?? currentYear,
                              endYear: asset.rental?.endYear ?? null,
                            },
                          })
                        }
                      />
                      임대소득 있음
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <Checkbox
                        checked={saleEnabled}
                        onCheckedChange={(checked) =>
                          patchAsset(asset.id, {
                            retirementLiquidity: checked
                              ? 'sellable'
                              : asset.retirementLiquidity,
                            salePlan: {
                              enabled: Boolean(checked),
                              year: asset.salePlan?.year ?? currentYear + 10,
                              sellingCostRate:
                                asset.salePlan?.sellingCostRate ?? 0,
                              capitalGainsTaxEstimate:
                                asset.salePlan?.capitalGainsTaxEstimate ?? 0,
                              autoCostSettings:
                                asset.salePlan?.autoCostSettings,
                            },
                            housingMovePlan: checked
                              ? asset.housingMovePlan
                              : asset.housingMovePlan
                                ? { ...asset.housingMovePlan, enabled: false }
                                : undefined,
                            retirementUse: checked
                              ? {
                                  ...usePlan,
                                  mode:
                                    usePlan.mode === 'hold'
                                      ? 'cover_gap'
                                      : usePlan.mode,
                                  startYear: asset.housingMovePlan?.enabled
                                    ? asset.housingMovePlan.purchaseYear
                                    : (asset.salePlan?.year ??
                                      currentYear + 10),
                                }
                              : asset.retirementLiquidity === 'liquid'
                                ? usePlan
                                : { ...usePlan, mode: 'hold' },
                          })
                        }
                      />
                      매각·현금화 계획 있음
                    </label>
                  </div>
                  {rentalEnabled && asset.rental && (
                    <div className="mt-4 grid gap-3 rounded-lg bg-white p-3 md:grid-cols-3 xl:grid-cols-6">
                      <Field label="월 임대료">
                        <MoneyField
                          value={asset.rental.grossMonthlyRent}
                          onChange={(grossMonthlyRent) =>
                            patchAsset(asset.id, {
                              rental: { ...asset.rental!, grossMonthlyRent },
                            })
                          }
                        />
                      </Field>
                      {(
                        [
                          ['연 임대료 상승률(%)', 'annualRentGrowthRate'],
                          ['공실률(%)', 'vacancyRate'],
                          ['운영비율(%)', 'operatingExpenseRate'],
                          ['예상 세율(%)', 'estimatedTaxRate'],
                        ] as const
                      ).map(([label, key]) => (
                        <Field key={key} label={label}>
                          <DecimalField
                            placeholder="미입력"
                            value={asset.rental?.[key]}
                            onChange={(nextValue) =>
                              patchAsset(asset.id, {
                                rental: {
                                  ...asset.rental!,
                                  [key]: nextValue,
                                },
                              })
                            }
                          />
                        </Field>
                      ))}
                      <Field label="임대 종료연도">
                        <Input
                          inputMode="numeric"
                          placeholder="계속"
                          value={asset.rental.endYear ?? ''}
                          onChange={(event) =>
                            patchAsset(asset.id, {
                              rental: {
                                ...asset.rental!,
                                endYear: event.target.value
                                  ? moneyNumber(event.target.value)
                                  : null,
                              },
                            })
                          }
                        />
                      </Field>
                    </div>
                  )}
                  {saleEnabled && asset.salePlan && (
                    <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50/60 p-4">
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="min-w-48 flex-1">
                          <Field label="매각 예정연도">
                            <Input
                              inputMode="numeric"
                              value={asset.salePlan.year}
                              onChange={(event) => {
                                const year = moneyNumber(event.target.value);
                                patchAsset(asset.id, {
                                  salePlan: { ...asset.salePlan!, year },
                                  retirementUse: {
                                    ...usePlan,
                                    startYear: asset.housingMovePlan?.enabled
                                      ? asset.housingMovePlan.purchaseYear
                                      : year,
                                  },
                                });
                              }}
                            />
                          </Field>
                        </div>
                        <label className="mb-2 flex items-center gap-2 text-sm font-black text-amber-950">
                          <Checkbox
                            checked={Boolean(
                              asset.salePlan.autoCostSettings?.enabled,
                            )}
                            onCheckedChange={(checked) =>
                              patchAsset(asset.id, {
                                salePlan: {
                                  ...asset.salePlan!,
                                  autoCostSettings: checked
                                    ? asset.salePlan?.autoCostSettings
                                      ? {
                                          ...asset.salePlan.autoCostSettings,
                                          enabled: true,
                                        }
                                      : defaultSaleAutoSettings(asset)
                                    : asset.salePlan?.autoCostSettings
                                      ? {
                                          ...asset.salePlan.autoCostSettings,
                                          enabled: false,
                                        }
                                      : undefined,
                                },
                              })
                            }
                          />
                          세금·중개보수 자동 러프 계산
                        </label>
                      </div>
                      {asset.salePlan.autoCostSettings?.enabled ? (
                        <>
                          <div className="mt-3 rounded-lg border border-orange-300 bg-orange-100 px-3 py-2 text-xs font-bold leading-5 text-orange-950">
                            {realEstateCostPolicy.policyId} 참고 계산입니다.
                            현재 규정을 미래 매각연도에도 그대로 적용하며 신고용
                            계산이 아닙니다. 비과세·중과·감면·필요경비는 반드시
                            별도로 확인하세요.
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                            <Field label="취득연도">
                              <Input
                                inputMode="numeric"
                                value={
                                  asset.salePlan.autoCostSettings
                                    .acquisitionYear
                                }
                                onChange={(event) =>
                                  patchAsset(asset.id, {
                                    salePlan: {
                                      ...asset.salePlan!,
                                      autoCostSettings: {
                                        ...asset.salePlan!.autoCostSettings!,
                                        acquisitionYear: moneyNumber(
                                          event.target.value,
                                        ),
                                      },
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="실제 취득가액">
                              <MoneyField
                                value={
                                  asset.salePlan.autoCostSettings
                                    .acquisitionPrice
                                }
                                onChange={(acquisitionPrice) =>
                                  patchAsset(asset.id, {
                                    salePlan: {
                                      ...asset.salePlan!,
                                      autoCostSettings: {
                                        ...asset.salePlan!.autoCostSettings!,
                                        acquisitionPrice,
                                      },
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="실거주 연수">
                              <DecimalField
                                value={
                                  asset.salePlan.autoCostSettings.residenceYears
                                }
                                onChange={(residenceYears) =>
                                  patchAsset(asset.id, {
                                    salePlan: {
                                      ...asset.salePlan!,
                                      autoCostSettings: {
                                        ...asset.salePlan!.autoCostSettings!,
                                        residenceYears: residenceYears ?? 0,
                                      },
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="기타 필요경비">
                              <MoneyField
                                value={
                                  asset.salePlan.autoCostSettings
                                    .necessaryExpenses
                                }
                                onChange={(necessaryExpenses) =>
                                  patchAsset(asset.id, {
                                    salePlan: {
                                      ...asset.salePlan!,
                                      autoCostSettings: {
                                        ...asset.salePlan!.autoCostSettings!,
                                        necessaryExpenses,
                                      },
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="매각 당시 가구 주택 수">
                              <NativeSelect
                                value={String(
                                  asset.salePlan.autoCostSettings
                                    .householdHomeCountAtSale,
                                )}
                                onChange={(event) =>
                                  patchAsset(asset.id, {
                                    salePlan: {
                                      ...asset.salePlan!,
                                      autoCostSettings: {
                                        ...asset.salePlan!.autoCostSettings!,
                                        householdHomeCountAtSale: Number(
                                          event.target.value,
                                        ) as 1 | 2 | 3,
                                      },
                                    },
                                  })
                                }
                              >
                                <NativeSelectOption value="1">
                                  1주택
                                </NativeSelectOption>
                                <NativeSelectOption value="2">
                                  2주택
                                </NativeSelectOption>
                                <NativeSelectOption value="3">
                                  3주택 이상
                                </NativeSelectOption>
                              </NativeSelect>
                            </Field>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-5 text-sm font-bold">
                            {[
                              ['regulatedArea', '조정대상지역'],
                              [
                                'oneHouseExemptionEligible',
                                '1세대 1주택 비과세 요건 충족',
                              ],
                              ['jointOwnership', '공동명의'],
                              ['includeBrokerageVat', '중개보수 VAT 포함'],
                            ].map(([key, label]) => (
                              <label
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  checked={Boolean(
                                    asset.salePlan!.autoCostSettings![
                                      key as keyof SaleCostAutoSettings
                                    ],
                                  )}
                                  onCheckedChange={(checked) =>
                                    patchAsset(asset.id, {
                                      salePlan: {
                                        ...asset.salePlan!,
                                        autoCostSettings: {
                                          ...asset.salePlan!.autoCostSettings!,
                                          [key]: Boolean(checked),
                                        },
                                      },
                                    })
                                  }
                                />
                                {label}
                              </label>
                            ))}
                            {asset.salePlan.autoCostSettings.jointOwnership && (
                              <label className="flex items-center gap-2">
                                본인 지분
                                <span className="w-24">
                                  <DecimalField
                                    value={
                                      asset.salePlan.autoCostSettings
                                        .ownerAShareRate
                                    }
                                    onChange={(ownerAShareRate) =>
                                      patchAsset(asset.id, {
                                        salePlan: {
                                          ...asset.salePlan!,
                                          autoCostSettings: {
                                            ...asset.salePlan!
                                              .autoCostSettings!,
                                            ownerAShareRate:
                                              ownerAShareRate ?? 50,
                                          },
                                        },
                                      })
                                    }
                                  />
                                </span>
                                % · 배우자{' '}
                                {100 -
                                  asset.salePlan.autoCostSettings
                                    .ownerAShareRate}
                                %
                              </label>
                            )}
                          </div>
                          {saleAutoEstimate && (
                            <div className="mt-3 grid gap-2 rounded-lg border border-amber-300 bg-white p-3 text-sm md:grid-cols-4">
                              <b>
                                예상 매도가 {formatMoney(projectedSaleValue)}
                              </b>
                              <span>
                                중개보수{' '}
                                {formatMoney(saleAutoEstimate.brokerage.total)}
                              </span>
                              <span>
                                양도세·지방세{' '}
                                {formatMoney(
                                  saleAutoEstimate.totalCapitalGainsTaxes,
                                )}
                              </span>
                              <b className="text-amber-900">
                                매각 순액 {formatMoney(currentNetSaleEstimate)}
                              </b>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <Field label="직접 입력 매각 비용률(%)">
                            <DecimalField
                              value={asset.salePlan.sellingCostRate}
                              onChange={(sellingCostRate) =>
                                patchAsset(asset.id, {
                                  salePlan: {
                                    ...asset.salePlan!,
                                    sellingCostRate: sellingCostRate ?? 0,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="직접 입력 양도세·지방세 총액">
                            <MoneyField
                              value={
                                asset.salePlan.capitalGainsTaxEstimate ?? 0
                              }
                              onChange={(capitalGainsTaxEstimate) =>
                                patchAsset(asset.id, {
                                  salePlan: {
                                    ...asset.salePlan!,
                                    capitalGainsTaxEstimate,
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}
                  {saleEnabled && asset.salePlan && (
                    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/70 p-3">
                      <label className="flex items-center gap-2 text-sm font-bold text-violet-950">
                        <Checkbox
                          checked={housingMoveEnabled}
                          onCheckedChange={(checked) => {
                            const purchaseYear =
                              asset.housingMovePlan?.purchaseYear ??
                              asset.salePlan!.year;
                            patchAsset(asset.id, {
                              housingMovePlan: {
                                enabled: Boolean(checked),
                                purchaseYear,
                                replacementName:
                                  asset.housingMovePlan?.replacementName ??
                                  '새 거주주택',
                                purchasePrice:
                                  asset.housingMovePlan?.purchasePrice ?? 0,
                                purchaseCostRate:
                                  asset.housingMovePlan?.purchaseCostRate ?? 0,
                                purchaseTaxEstimate:
                                  asset.housingMovePlan?.purchaseTaxEstimate ??
                                  0,
                                purchaseAutoCostSettings:
                                  asset.housingMovePlan
                                    ?.purchaseAutoCostSettings,
                                replacementAnnualAppreciationRate:
                                  asset.housingMovePlan
                                    ?.replacementAnnualAppreciationRate ?? 0,
                                interimAnnualReturnRate:
                                  asset.housingMovePlan
                                    ?.interimAnnualReturnRate ?? 0,
                                surplusName:
                                  asset.housingMovePlan?.surplusName ??
                                  '주택 교체 후 잔여자금',
                                surplusType:
                                  asset.housingMovePlan?.surplusType ??
                                  'deposit',
                                surplusAnnualReturnRate:
                                  asset.housingMovePlan
                                    ?.surplusAnnualReturnRate ?? 3,
                                surplusReturnMode:
                                  asset.housingMovePlan?.surplusReturnMode ??
                                  'reinvest',
                              },
                              retirementUse: checked
                                ? {
                                    ...usePlan,
                                    mode:
                                      usePlan.mode === 'hold'
                                        ? 'cover_gap'
                                        : usePlan.mode,
                                    startYear: purchaseYear,
                                  }
                                : usePlan,
                            });
                          }}
                        />
                        매각 후 다른 주택을 구입하는 주거 이전 계획
                      </label>
                      <p className="mt-1 text-xs leading-5 text-violet-800">
                        기존 주택 매각대금에서 새 주택 가격·취득비용을 차감하고
                        남는 금액을 예금 또는 투자자산으로 자동 전환합니다.
                      </p>
                      {housingMoveEnabled && asset.housingMovePlan && (
                        <>
                          <label className="mt-3 flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-black text-orange-950">
                            <Checkbox
                              checked={Boolean(
                                asset.housingMovePlan.purchaseAutoCostSettings
                                  ?.enabled,
                              )}
                              onCheckedChange={(checked) =>
                                patchAsset(asset.id, {
                                  housingMovePlan: {
                                    ...asset.housingMovePlan!,
                                    purchaseAutoCostSettings: checked
                                      ? asset.housingMovePlan
                                          ?.purchaseAutoCostSettings
                                        ? {
                                            ...asset.housingMovePlan
                                              .purchaseAutoCostSettings,
                                            enabled: true,
                                          }
                                        : defaultPurchaseAutoSettings()
                                      : asset.housingMovePlan
                                            ?.purchaseAutoCostSettings
                                        ? {
                                            ...asset.housingMovePlan
                                              .purchaseAutoCostSettings,
                                            enabled: false,
                                          }
                                        : undefined,
                                  },
                                })
                              }
                            />
                            취득세·중개보수 자동 러프 계산
                          </label>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <Field label="새 주택 구입연도">
                              <Input
                                inputMode="numeric"
                                value={asset.housingMovePlan.purchaseYear}
                                onChange={(event) => {
                                  const purchaseYear = moneyNumber(
                                    event.target.value,
                                  );
                                  patchAsset(asset.id, {
                                    housingMovePlan: {
                                      ...asset.housingMovePlan!,
                                      purchaseYear,
                                    },
                                    retirementUse: {
                                      ...usePlan,
                                      startYear: purchaseYear,
                                    },
                                  });
                                }}
                              />
                            </Field>
                            <Field label="새 주택 표시 이름">
                              <Input
                                value={asset.housingMovePlan.replacementName}
                                onChange={(event) =>
                                  patchAsset(asset.id, {
                                    housingMovePlan: {
                                      ...asset.housingMovePlan!,
                                      replacementName: event.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="구입연도 예상 가격">
                              <MoneyField
                                value={asset.housingMovePlan.purchasePrice}
                                onChange={(purchasePrice) =>
                                  patchAsset(asset.id, {
                                    housingMovePlan: {
                                      ...asset.housingMovePlan!,
                                      purchasePrice,
                                    },
                                  })
                                }
                              />
                            </Field>
                            {!asset.housingMovePlan.purchaseAutoCostSettings
                              ?.enabled && (
                              <>
                                <Field label="직접 입력 취득 부대비용률(%)">
                                  <DecimalField
                                    value={
                                      asset.housingMovePlan.purchaseCostRate
                                    }
                                    onChange={(purchaseCostRate) =>
                                      patchAsset(asset.id, {
                                        housingMovePlan: {
                                          ...asset.housingMovePlan!,
                                          purchaseCostRate:
                                            purchaseCostRate ?? 0,
                                        },
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="직접 입력 취득세·기타 비용">
                                  <MoneyField
                                    value={
                                      asset.housingMovePlan
                                        .purchaseTaxEstimate ?? 0
                                    }
                                    onChange={(purchaseTaxEstimate) =>
                                      patchAsset(asset.id, {
                                        housingMovePlan: {
                                          ...asset.housingMovePlan!,
                                          purchaseTaxEstimate,
                                        },
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            )}
                            <Field label="새 주택 연 가치변동률(%)">
                              <DecimalField
                                value={
                                  asset.housingMovePlan
                                    .replacementAnnualAppreciationRate
                                }
                                onChange={(replacementAnnualAppreciationRate) =>
                                  patchAsset(asset.id, {
                                    housingMovePlan: {
                                      ...asset.housingMovePlan!,
                                      replacementAnnualAppreciationRate:
                                        replacementAnnualAppreciationRate ?? 0,
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="매각~구입 대기자금 연수익률(%)">
                              <DecimalField
                                value={
                                  asset.housingMovePlan.interimAnnualReturnRate
                                }
                                onChange={(interimAnnualReturnRate) =>
                                  patchAsset(asset.id, {
                                    housingMovePlan: {
                                      ...asset.housingMovePlan!,
                                      interimAnnualReturnRate:
                                        interimAnnualReturnRate ?? 0,
                                    },
                                  })
                                }
                              />
                            </Field>
                          </div>
                          {asset.housingMovePlan.purchaseAutoCostSettings
                            ?.enabled && (
                            <div className="mt-3 rounded-xl border-2 border-orange-300 bg-orange-50 p-3">
                              <p className="text-xs font-bold leading-5 text-orange-950">
                                {realEstateCostPolicy.policyId} 참고 계산입니다.
                                현재 세율을 구입연도에도 그대로 적용하며, 일시적
                                2주택·중과 제외·감면 여부는 직접 확인해야
                                합니다.
                              </p>
                              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <Field label="취득 후 가구 주택 수">
                                  <NativeSelect
                                    value={
                                      asset.housingMovePlan
                                        .purchaseAutoCostSettings
                                        .homeCountAfterPurchase
                                    }
                                    onChange={(event) =>
                                      patchAsset(asset.id, {
                                        housingMovePlan: {
                                          ...asset.housingMovePlan!,
                                          purchaseAutoCostSettings: {
                                            ...asset.housingMovePlan!
                                              .purchaseAutoCostSettings!,
                                            homeCountAfterPurchase: event.target
                                              .value as PurchaseCostAutoSettings['homeCountAfterPurchase'],
                                          },
                                        },
                                      })
                                    }
                                  >
                                    <NativeSelectOption value="one_or_temporary_two">
                                      1주택 또는 일시적 2주택
                                    </NativeSelectOption>
                                    <NativeSelectOption value="two">
                                      2주택
                                    </NativeSelectOption>
                                    <NativeSelectOption value="three">
                                      3주택
                                    </NativeSelectOption>
                                    <NativeSelectOption value="four_plus">
                                      4주택 이상
                                    </NativeSelectOption>
                                  </NativeSelect>
                                </Field>
                                <div className="flex flex-wrap items-end gap-4 pb-2 text-sm font-bold md:col-span-2 xl:col-span-3">
                                  {[
                                    ['regulatedArea', '조정대상지역'],
                                    ['exclusiveAreaOver85', '전용 85㎡ 초과'],
                                    ['jointOwnership', '공동명의'],
                                    [
                                      'includeBrokerageVat',
                                      '중개보수 VAT 포함',
                                    ],
                                  ].map(([key, label]) => (
                                    <label
                                      key={key}
                                      className="flex items-center gap-2"
                                    >
                                      <Checkbox
                                        checked={Boolean(
                                          asset.housingMovePlan!
                                            .purchaseAutoCostSettings![
                                            key as keyof PurchaseCostAutoSettings
                                          ],
                                        )}
                                        onCheckedChange={(checked) =>
                                          patchAsset(asset.id, {
                                            housingMovePlan: {
                                              ...asset.housingMovePlan!,
                                              purchaseAutoCostSettings: {
                                                ...asset.housingMovePlan!
                                                  .purchaseAutoCostSettings!,
                                                [key]: Boolean(checked),
                                              },
                                            },
                                          })
                                        }
                                      />
                                      {label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              {asset.housingMovePlan.purchaseAutoCostSettings
                                .jointOwnership && (
                                <label className="mt-3 flex max-w-md items-center gap-2 text-sm font-bold">
                                  본인 지분
                                  <span className="w-24">
                                    <DecimalField
                                      value={
                                        asset.housingMovePlan
                                          .purchaseAutoCostSettings
                                          .ownerAShareRate
                                      }
                                      onChange={(ownerAShareRate) =>
                                        patchAsset(asset.id, {
                                          housingMovePlan: {
                                            ...asset.housingMovePlan!,
                                            purchaseAutoCostSettings: {
                                              ...asset.housingMovePlan!
                                                .purchaseAutoCostSettings!,
                                              ownerAShareRate:
                                                ownerAShareRate ?? 50,
                                            },
                                          },
                                        })
                                      }
                                    />
                                  </span>
                                  % · 배우자{' '}
                                  {100 -
                                    asset.housingMovePlan
                                      .purchaseAutoCostSettings.ownerAShareRate}
                                  %
                                </label>
                              )}
                              {purchaseAutoEstimate && (
                                <div className="mt-3 grid gap-2 rounded-lg bg-white p-3 text-sm md:grid-cols-4">
                                  <span>
                                    취득 관련 세금{' '}
                                    {formatMoney(
                                      purchaseAutoEstimate.acquisitionTax +
                                        purchaseAutoEstimate.localEducationTax +
                                        purchaseAutoEstimate.ruralSpecialTax,
                                    )}
                                  </span>
                                  <span>
                                    중개보수{' '}
                                    {formatMoney(
                                      purchaseAutoEstimate.brokerage.total,
                                    )}
                                  </span>
                                  <b>
                                    부대비용 합계{' '}
                                    {formatMoney(
                                      purchaseAutoEstimate.totalPurchaseCosts,
                                    )}
                                  </b>
                                  <b className="text-orange-900">
                                    구입 총액{' '}
                                    {formatMoney(replacementPurchaseEstimate)}
                                  </b>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="mt-3 rounded-lg border border-violet-100 bg-white p-3">
                            <p className="mb-3 text-xs font-black text-violet-950">
                              새 주택 구입 후 남는 현금 운용
                            </p>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <Field label="잔여자금 표시 이름">
                                <Input
                                  value={asset.housingMovePlan.surplusName}
                                  onChange={(event) =>
                                    patchAsset(asset.id, {
                                      housingMovePlan: {
                                        ...asset.housingMovePlan!,
                                        surplusName: event.target.value,
                                      },
                                    })
                                  }
                                />
                              </Field>
                              <Field label="운용 유형">
                                <NativeSelect
                                  value={asset.housingMovePlan.surplusType}
                                  onChange={(event) =>
                                    patchAsset(asset.id, {
                                      housingMovePlan: {
                                        ...asset.housingMovePlan!,
                                        surplusType: event.target
                                          .value as HousingSurplusType,
                                      },
                                    })
                                  }
                                >
                                  {Object.entries(housingSurplusTypeLabels).map(
                                    ([key, label]) => (
                                      <NativeSelectOption key={key} value={key}>
                                        {label}
                                      </NativeSelectOption>
                                    ),
                                  )}
                                </NativeSelect>
                              </Field>
                              <Field label="예상 연수익률(%)">
                                <DecimalField
                                  value={
                                    asset.housingMovePlan
                                      .surplusAnnualReturnRate
                                  }
                                  onChange={(surplusAnnualReturnRate) =>
                                    patchAsset(asset.id, {
                                      housingMovePlan: {
                                        ...asset.housingMovePlan!,
                                        surplusAnnualReturnRate:
                                          surplusAnnualReturnRate ?? 0,
                                      },
                                    })
                                  }
                                />
                              </Field>
                              <Field label="수익 처리 방식">
                                <NativeSelect
                                  value={
                                    asset.housingMovePlan.surplusReturnMode
                                  }
                                  onChange={(event) =>
                                    patchAsset(asset.id, {
                                      housingMovePlan: {
                                        ...asset.housingMovePlan!,
                                        surplusReturnMode: event.target
                                          .value as HousingSurplusReturnMode,
                                      },
                                    })
                                  }
                                >
                                  {Object.entries(
                                    housingSurplusReturnModeLabels,
                                  ).map(([key, label]) => (
                                    <NativeSelectOption key={key} value={key}>
                                      {label}
                                    </NativeSelectOption>
                                  ))}
                                </NativeSelect>
                              </Field>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              생활비 인출 방식·시작연도·최소잔액은 위의 ‘생활비
                              활용 방식’ 설정을 따릅니다.
                            </p>
                          </div>
                          <div className="mt-3 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-950">
                            현재 입력금액 단순 비교: 매각 순액{' '}
                            {currentNetSaleEstimate.toLocaleString('ko-KR')}원 -
                            새 주택 구입 총액{' '}
                            {replacementPurchaseEstimate.toLocaleString(
                              'ko-KR',
                            )}
                            원 ={' '}
                            {currentNetSaleEstimate >=
                            replacementPurchaseEstimate
                              ? `예상 현금 차액 ${(currentNetSaleEstimate - replacementPurchaseEstimate).toLocaleString('ko-KR')}원`
                              : `별도 조달 필요 ${(replacementPurchaseEstimate - currentNetSaleEstimate).toLocaleString('ko-KR')}원`}
                            <small className="mt-1 block font-normal leading-5 text-slate-500">
                              실제 결과는 매각연도까지의 가치변동과 매각~구입
                              사이 대기자금 수익을 다시 반영합니다.
                            </small>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onChange({
                          ...value,
                          assets: value.assets.filter(
                            (item) => item.id !== asset.id,
                          ),
                          debts: value.debts.map((debt) =>
                            debt.linkedAssetId === asset.id
                              ? {
                                  ...debt,
                                  linkedAssetId: undefined,
                                  payoffOnLinkedAssetSale: false,
                                }
                              : debt,
                          ),
                        })
                      }
                    >
                      <Trash2 /> 삭제
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-rose-200">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>가구 부채</CardTitle>
              <CardDescription>
                원금은 순자산에서 차감합니다. 주택담보대출처럼 자산에 연결된
                대출은 해당 자산 매각 시 추정 잔액을 자동상환할 수 있습니다.
                상환정보가 없으면 월 현금흐름에는 임의 금액을 넣지 않습니다.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addDebt}>
              <Plus /> 부채 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {value.debts.length === 0 && (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
              등록된 부채가 없습니다.
            </p>
          )}
          {value.debts.map((debt) => (
            <section
              key={debt.id}
              className="rounded-xl border border-rose-100 bg-rose-50/40 p-4"
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="표시 이름">
                  <Input
                    value={debt.name}
                    onChange={(event) =>
                      patchDebt(debt.id, { name: event.target.value })
                    }
                  />
                </Field>
                <Field label="대출 잔액">
                  <MoneyField
                    value={debt.principal}
                    onChange={(principal) => patchDebt(debt.id, { principal })}
                  />
                </Field>
                <Field label="상환 방식">
                  <NativeSelect
                    value={debt.repaymentType ?? 'unknown'}
                    onChange={(event) =>
                      patchDebt(debt.id, {
                        repaymentType:
                          event.target.value === 'unknown'
                            ? undefined
                            : (event.target.value as DebtRepaymentType),
                      })
                    }
                  >
                    <NativeSelectOption value="unknown">
                      상환정보 미입력
                    </NativeSelectOption>
                    <NativeSelectOption value="interest_only">
                      이자만 상환
                    </NativeSelectOption>
                    <NativeSelectOption value="amortizing">
                      원리금 분할상환
                    </NativeSelectOption>
                    <NativeSelectOption value="manual_monthly_payment">
                      월 상환액 직접 입력
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                {debt.repaymentType === 'manual_monthly_payment' ? (
                  <Field label="월 원리금">
                    <MoneyField
                      value={debt.manualMonthlyPayment ?? 0}
                      onChange={(manualMonthlyPayment) =>
                        patchDebt(debt.id, { manualMonthlyPayment })
                      }
                    />
                  </Field>
                ) : (
                  <Field label="연 금리(%)">
                    <DecimalField
                      placeholder="미입력"
                      value={debt.annualInterestRate}
                      onChange={(annualInterestRate) =>
                        patchDebt(debt.id, {
                          annualInterestRate,
                        })
                      }
                    />
                  </Field>
                )}
                {debt.repaymentType === 'amortizing' && (
                  <Field label="남은 상환개월">
                    <Input
                      inputMode="numeric"
                      value={debt.remainingMonths ?? ''}
                      onChange={(event) =>
                        patchDebt(debt.id, {
                          remainingMonths: event.target.value
                            ? moneyNumber(event.target.value)
                            : undefined,
                        })
                      }
                    />
                  </Field>
                )}
                <Field label="만기연도">
                  <Input
                    inputMode="numeric"
                    placeholder="미입력"
                    value={debt.maturityYear ?? ''}
                    onChange={(event) =>
                      patchDebt(debt.id, {
                        maturityYear: event.target.value
                          ? moneyNumber(event.target.value)
                          : undefined,
                      })
                    }
                  />
                </Field>
                <Field label="연결 자산">
                  <NativeSelect
                    value={debt.linkedAssetId ?? 'none'}
                    onChange={(event) => {
                      const linkedAssetId =
                        event.target.value === 'none'
                          ? undefined
                          : event.target.value;
                      patchDebt(debt.id, {
                        linkedAssetId,
                        payoffOnLinkedAssetSale: linkedAssetId
                          ? debt.payoffOnLinkedAssetSale
                          : false,
                      });
                    }}
                  >
                    <NativeSelectOption value="none">
                      연결 자산 없음
                    </NativeSelectOption>
                    {value.assets.map((asset) => (
                      <NativeSelectOption key={asset.id} value={asset.id}>
                        {asset.name}
                        {asset.salePlan?.enabled
                          ? ` · ${asset.salePlan.year}년 매각`
                          : ' · 매각계획 없음'}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-rose-200 pt-3">
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-rose-950">
                    <Checkbox
                      disabled={!debt.linkedAssetId}
                      checked={Boolean(
                        debt.linkedAssetId && debt.payoffOnLinkedAssetSale,
                      )}
                      onCheckedChange={(checked) =>
                        patchDebt(debt.id, {
                          payoffOnLinkedAssetSale: Boolean(checked),
                        })
                      }
                    />
                    연결 자산 매각 시 남은 대출잔액 자동상환
                  </label>
                  {debt.linkedAssetId && debt.payoffOnLinkedAssetSale && (
                    <p className="mt-1 text-xs leading-5 text-rose-800">
                      매각연도 초 상환으로 계산합니다. 원리금 분할상환은 매각
                      시점의 추정 잔액, 그 외 방식은 입력한 현재 잔액을
                      매각대금에서 먼저 차감합니다.
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onChange({
                      ...value,
                      debts: value.debts.filter((item) => item.id !== debt.id),
                    })
                  }
                >
                  <Trash2 /> 삭제
                </Button>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>기타 반복소득</CardTitle>
              <CardDescription>
                연금이나 임대료가 아닌 지속적인 사업·기타소득을 입력합니다.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addIncome}>
              <Plus /> 소득 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {value.recurringIncomes.map((income) => (
            <section
              key={income.id}
              className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-2 xl:grid-cols-6"
            >
              <Field label="표시 이름">
                <Input
                  value={income.name}
                  onChange={(event) =>
                    patchIncome(income.id, { name: event.target.value })
                  }
                />
              </Field>
              <Field label="월 금액">
                <MoneyField
                  value={income.monthlyAmount}
                  onChange={(monthlyAmount) =>
                    patchIncome(income.id, { monthlyAmount })
                  }
                />
              </Field>
              <Field label="시작연도">
                <Input
                  inputMode="numeric"
                  value={income.startYear}
                  onChange={(event) =>
                    patchIncome(income.id, {
                      startYear: moneyNumber(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="종료연도">
                <Input
                  inputMode="numeric"
                  placeholder="계속"
                  value={income.endYear ?? ''}
                  onChange={(event) =>
                    patchIncome(income.id, {
                      endYear: event.target.value
                        ? moneyNumber(event.target.value)
                        : null,
                    })
                  }
                />
              </Field>
              <Field label="연 상승률(%)">
                <DecimalField
                  value={income.annualGrowthRate}
                  onChange={(annualGrowthRate) =>
                    patchIncome(income.id, {
                      annualGrowthRate: annualGrowthRate ?? 0,
                    })
                  }
                />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="예상 세율(%)">
                  <DecimalField
                    placeholder="미입력"
                    value={income.estimatedTaxRate}
                    onChange={(estimatedTaxRate) =>
                      patchIncome(income.id, {
                        estimatedTaxRate,
                      })
                    }
                  />
                </Field>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${income.name} 삭제`}
                  onClick={() =>
                    onChange({
                      ...value,
                      recurringIncomes: value.recurringIncomes.filter(
                        (item) => item.id !== income.id,
                      ),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
