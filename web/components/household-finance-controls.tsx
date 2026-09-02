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

const currentYear = new Date().getFullYear();
const moneyNumber = (value: string) => Number(value.replace(/\D/g, '')) || 0;

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
const housingSurplusReturnModeLabels: Record<
  HousingSurplusReturnMode,
  string
> = {
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
          {value.assets.map((asset) => {
            const rentalEnabled = Boolean(asset.rental?.enabled);
            const saleEnabled = Boolean(asset.salePlan?.enabled);
            const housingMoveEnabled = Boolean(asset.housingMovePlan?.enabled);
            const usePlan = resolveAssetUsePlan(asset, currentYear);
            const currentNetSaleEstimate = Math.max(
              0,
              asset.currentValue *
                (1 - (asset.salePlan?.sellingCostRate ?? 0) / 100) -
                (asset.salePlan?.capitalGainsTaxEstimate ?? 0),
            );
            const replacementPurchaseEstimate = asset.housingMovePlan?.enabled
              ? Math.max(
                  0,
                  asset.housingMovePlan.purchasePrice *
                    (1 +
                      (asset.housingMovePlan.purchaseCostRate ?? 0) / 100) +
                    (asset.housingMovePlan.purchaseTaxEstimate ?? 0),
                )
              : 0;
            return (
              <section
                key={asset.id}
                className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"
              >
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
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                  <p className="mb-3 text-xs font-bold text-blue-900">
                    {housingMoveEnabled
                      ? '아래 방식은 새 주택 구입 후 남은 예금·투자자금에 적용됩니다.'
                      : '이 자산을 은퇴 생활비에 어떻게 사용할지 정하세요.'}{' '}
                    자동 충당은 생활비가 부족한 연도에만 필요한 만큼 인출합니다.
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
                        {Object.entries(assetUseModeLabels).map(([key, label]) => (
                          <NativeSelectOption key={key} value={key}>
                            {label}
                          </NativeSelectOption>
                        ))}
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
                                  retirementUse: { ...usePlan, monthlyAmount },
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
                        현금화 가능한 연도가 없으므로 아직 인출되지 않습니다. 아래
                        ‘매각·현금화 계획’을 켜고 연도를 입력하세요.
                      </p>
                    )}
                </div>
                <div className="mt-4 flex flex-wrap gap-5 border-t border-emerald-100 pt-4">
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
                                startYear:
                                  asset.housingMovePlan?.enabled
                                    ? asset.housingMovePlan.purchaseYear
                                    : (asset.salePlan?.year ?? currentYear + 10),
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
                  <div className="mt-4 grid gap-3 rounded-lg bg-white p-3 md:grid-cols-3">
                    <Field label="매각 예정연도">
                      <Input
                        inputMode="numeric"
                        value={asset.salePlan.year}
                        onChange={(event) => {
                          const year = moneyNumber(event.target.value);
                          patchAsset(asset.id, {
                            salePlan: {
                              ...asset.salePlan!,
                              year,
                            },
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
                    <Field label="매각 비용률(%)">
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
                    <Field label="양도세 추정액">
                      <MoneyField
                        value={asset.salePlan.capitalGainsTaxEstimate ?? 0}
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
                                asset.housingMovePlan?.purchaseTaxEstimate ?? 0,
                              replacementAnnualAppreciationRate:
                                asset.housingMovePlan
                                  ?.replacementAnnualAppreciationRate ?? 0,
                              interimAnnualReturnRate:
                                asset.housingMovePlan?.interimAnnualReturnRate ??
                                0,
                              surplusName:
                                asset.housingMovePlan?.surplusName ??
                                '주택 교체 후 잔여자금',
                              surplusType:
                                asset.housingMovePlan?.surplusType ?? 'deposit',
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
                      기존 주택 매각대금에서 새 주택 가격·취득비용을 차감하고 남는
                      금액을 예금 또는 투자자산으로 자동 전환합니다.
                    </p>
                    {housingMoveEnabled && asset.housingMovePlan && (
                      <>
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
                          <Field label="취득 부대비용률(%)">
                            <DecimalField
                              value={asset.housingMovePlan.purchaseCostRate}
                              onChange={(purchaseCostRate) =>
                                patchAsset(asset.id, {
                                  housingMovePlan: {
                                    ...asset.housingMovePlan!,
                                    purchaseCostRate: purchaseCostRate ?? 0,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="취득세·기타 고정비용">
                            <MoneyField
                              value={
                                asset.housingMovePlan.purchaseTaxEstimate ?? 0
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
                                  asset.housingMovePlan.surplusAnnualReturnRate
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
                            생활비 인출 방식·시작연도·최소잔액은 위의 ‘생활비 활용
                            방식’ 설정을 따릅니다.
                          </p>
                        </div>
                        <div className="mt-3 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-950">
                          현재 입력금액 단순 비교: 매각 순액{' '}
                          {currentNetSaleEstimate.toLocaleString('ko-KR')}원 - 새 주택
                          구입 총액{' '}
                          {replacementPurchaseEstimate.toLocaleString('ko-KR')}원 ={' '}
                          {currentNetSaleEstimate >= replacementPurchaseEstimate
                            ? `예상 현금 차액 ${(currentNetSaleEstimate - replacementPurchaseEstimate).toLocaleString('ko-KR')}원`
                            : `별도 조달 필요 ${(replacementPurchaseEstimate - currentNetSaleEstimate).toLocaleString('ko-KR')}원`}
                          <small className="mt-1 block font-normal leading-5 text-slate-500">
                            실제 결과는 매각연도까지의 가치변동과 매각~구입 사이
                            대기자금 수익을 다시 반영합니다.
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
                      })
                    }
                  >
                    <Trash2 /> 삭제
                  </Button>
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
                원금은 순자산에서 차감합니다. 상환정보가 없으면 월 현금흐름에는
                임의 금액을 넣지 않고 미완성 경고를 표시합니다.
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
              </div>
              <div className="mt-3 flex justify-end">
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
