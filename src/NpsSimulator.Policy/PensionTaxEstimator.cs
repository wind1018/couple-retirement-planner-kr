namespace NpsSimulator.Policy;

public sealed record PensionTaxEstimate(
    decimal GrossMonthlyKrw,
    decimal EstimatedIncomeTaxMonthlyKrw,
    decimal EstimatedLocalIncomeTaxMonthlyKrw,
    decimal EstimatedNetMonthlyKrw,
    string Assumption);

public static class PensionTaxEstimator
{
    public static PensionTaxEstimate? EstimateMonthly(PolicyPack pack, decimal grossMonthlyKrw)
    {
        var policy = pack.PensionIncomeTax;
        if (policy is null || grossMonthlyKrw < 0) return null;

        var taxableAnnual = grossMonthlyKrw * 12 * policy.AssumedTaxablePensionRate.DecimalValue;
        var deductionTier = policy.PensionIncomeDeductionTiers.FirstOrDefault(tier =>
            tier.AnnualPensionToInclusiveKrw is null || taxableAnnual <= tier.AnnualPensionToInclusiveKrw.Value);
        if (deductionTier is null) return null;

        var pensionDeduction = deductionTier.BaseDeductionKrw
                               + Math.Max(0, taxableAnnual - deductionTier.ExcessThresholdKrw)
                               * deductionTier.ExcessDeductionRate.DecimalValue;
        pensionDeduction = Math.Min(pensionDeduction, policy.MaximumPensionIncomeDeductionKrw);
        var taxBase = Math.Max(0,
            taxableAnnual
            - pensionDeduction
            - policy.AssumedBasicDeductionPersons * policy.BasicDeductionPerPersonKrw);
        var bracket = policy.IncomeTaxBrackets.FirstOrDefault(item =>
            item.TaxBaseToInclusiveKrw is null || taxBase <= item.TaxBaseToInclusiveKrw.Value);
        if (bracket is null) return null;

        var annualIncomeTax = Math.Max(0,
            taxBase * bracket.Rate.DecimalValue
            - bracket.ProgressiveDeductionKrw
            - policy.StandardTaxCreditKrw);
        var annualLocalIncomeTax = annualIncomeTax * policy.LocalIncomeTaxRate.DecimalValue;
        var monthlyIncomeTax = RoundKrw(annualIncomeTax / 12);
        var monthlyLocalIncomeTax = RoundKrw(annualLocalIncomeTax / 12);
        return new(
            grossMonthlyKrw,
            monthlyIncomeTax,
            monthlyLocalIncomeTax,
            Math.Max(0, RoundKrw(grossMonthlyKrw - monthlyIncomeTax - monthlyLocalIncomeTax)),
            $"과세대상 {policy.AssumedTaxablePensionRate.DecimalValue:P0}·기본공제 {policy.AssumedBasicDeductionPersons}인 가정");
    }

    private static decimal RoundKrw(decimal value) => decimal.Round(value, 0, MidpointRounding.AwayFromZero);
}
