'use client';

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
import type {
  AssetType,
  DebtRepaymentType,
  HouseholdAsset,
  HouseholdDebt,
  HouseholdFinanceSettings,
  RecurringIncome,
  RetirementLiquidity,
} from '@/lib/household-cashflow';

const currentYear = new Date().getFullYear();
const moneyNumber = (value: string) => Number(value.replace(/\D/g, '')) || 0;
const decimalNumber = (value: string) =>
  Number(value.replace(/[^\d.-]/g, '')) || 0;

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
  sellable: '현금화 가능',
  illiquid: '비유동 자산',
  exclude: '은퇴재원에서 제외',
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
                  <Field label="은퇴재원 활용">
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
                          salePlan: {
                            enabled: Boolean(checked),
                            year: asset.salePlan?.year ?? currentYear + 10,
                            sellingCostRate:
                              asset.salePlan?.sellingCostRate ?? 0,
                            capitalGainsTaxEstimate:
                              asset.salePlan?.capitalGainsTaxEstimate ?? 0,
                          },
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
                        <Input
                          inputMode="decimal"
                          placeholder="미입력"
                          value={asset.rental?.[key] ?? ''}
                          onChange={(event) =>
                            patchAsset(asset.id, {
                              rental: {
                                ...asset.rental!,
                                [key]: event.target.value
                                  ? decimalNumber(event.target.value)
                                  : undefined,
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
                        onChange={(event) =>
                          patchAsset(asset.id, {
                            salePlan: {
                              ...asset.salePlan!,
                              year: moneyNumber(event.target.value),
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="매각 비용률(%)">
                      <Input
                        inputMode="decimal"
                        value={asset.salePlan.sellingCostRate ?? 0}
                        onChange={(event) =>
                          patchAsset(asset.id, {
                            salePlan: {
                              ...asset.salePlan!,
                              sellingCostRate: decimalNumber(
                                event.target.value,
                              ),
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
                    <Input
                      inputMode="decimal"
                      placeholder="미입력"
                      value={debt.annualInterestRate ?? ''}
                      onChange={(event) =>
                        patchDebt(debt.id, {
                          annualInterestRate: event.target.value
                            ? decimalNumber(event.target.value)
                            : undefined,
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
                <Input
                  inputMode="decimal"
                  value={income.annualGrowthRate ?? 0}
                  onChange={(event) =>
                    patchIncome(income.id, {
                      annualGrowthRate: decimalNumber(event.target.value),
                    })
                  }
                />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="예상 세율(%)">
                  <Input
                    inputMode="decimal"
                    placeholder="미입력"
                    value={income.estimatedTaxRate ?? ''}
                    onChange={(event) =>
                      patchIncome(income.id, {
                        estimatedTaxRate: event.target.value
                          ? decimalNumber(event.target.value)
                          : undefined,
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
