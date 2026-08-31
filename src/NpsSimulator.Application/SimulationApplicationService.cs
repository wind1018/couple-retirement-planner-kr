using NpsSimulator.Domain;
using NpsSimulator.Policy;
using NpsSimulator.Simulation;

namespace NpsSimulator.Application;

public sealed class SimulationApplicationService
{
    public StrategyComparisonResult RunComparison(
        PolicyPack policyPack,
        HouseholdProfile household,
        HouseholdStrategy comparisonStrategy,
        SimulationAssumptions assumptions)
    {
        var baseline = new HouseholdStrategy(
            "기준: 60세 종료 + 정상수령",
            new(0, 60, 0, 0, comparisonStrategy.PersonA.DeathAgeYears),
            new(0, 60, 0, 0, comparisonStrategy.PersonB.DeathAgeYears));
        var simulator = new HouseholdSimulator(new(policyPack));
        var baselineResult = simulator.Simulate(household, baseline, assumptions);
        var comparisonResult = simulator.Simulate(household, comparisonStrategy, assumptions);
        return new StrategyComparer().Compare(household, baselineResult, comparisonResult);
    }
}
