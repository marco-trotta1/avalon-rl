# Avalon strategy

## The ambition

Build worlds that reveal what agents actually learn.
Avalon should connect environment construction, verifier challenges, data preservation, and evidence-driven task selection.
Each proposed improvement needs evidence outside the component that proposes it.

The first product loop is operational:

```text
Construct a world
Record experience
Find a disagreement
Preserve a counterexample
Improve the check or task
Evaluate again under explicit limits
```

The current CLI and SDK implement this loop for a small synthetic operations world.
The Python experiment adds an executed Gymnasium, Minari, and NumPy path.
No UI or site is in scope.

## Why this direction

The [Breakout List](https://breakoutlist.com/) highlights companies that perform concrete work in difficult domains.
Our interpretation is to pursue a capability with a visible operational result.
For Avalon, that result is a reproducible explanation of where an agent's feedback stops matching its task.

The public project starts with a narrow promise that a contributor can test locally.
The longer-term opportunity is a laboratory that improves learning worlds while preserving an independent account of success.
This is a product thesis. It is not a demonstrated research novelty.

## Existing work and differentiation

[Minari](https://github.com/Farama-Foundation/Minari) supplies offline dataset infrastructure.
[Verifiers](https://github.com/PrimeIntellect-ai/verifiers) supplies RL environments and evaluation interfaces.
Avalon should integrate with established tools and contribute reproducible failures when it finds them.
It should not replace those ecosystems without evidence of a distinct need.

The candidate distinction is the connection between a task, its feedback, its converted experience, and a reproducing counterexample.
The first controlled experiment does not establish better detection than a simple exact assertion.
Any stronger claim needs independent workflows, realistic costs, and a measured user benefit.

## Open source first

Keep the core CLI, SDK, contracts, synthetic worlds, adapters, and regression cases under MIT.
Make one useful contribution easy to understand and verify.
Publish negative results alongside successful demonstrations.
Treat stars as attention. Measure adoption through actual use, reproducible issues, and outside contributions.
Do not manufacture interaction, submit duplicate PRs, or claim that internal agent work represents outside adoption.

## A possible specialist agency

Sell a defined environment or audit deliverable when a buyer has a concrete workflow and acceptance criteria.
Potential deliverables include an executable environment, task families, verifier counterexamples, and a reproducibility package.
Private customer data and authorized domain expertise can remain private.
The free core should keep working without a hosted account.

This build does not validate a buyer, price, margin, sales cycle, or recurring contract.
A possible revenue scenario is 50 customers at 50,000 USD per month.
That equals 30,000,000 USD in annual recurring revenue before costs.
This is arithmetic, not a forecast or observed price.
An agency must separately establish repeatable delivery and recurring customer value.

## The next evidence gates

1. Reproduce one useful boundary mismatch from an independent user's workflow with permission.
2. Compare the diagnosis with the simplest assertion on the same evidence and interaction budget.
3. Test a policy on independently authored task families after verifier improvements.
4. Improve curriculum selection only when a frozen comparison beats both fixed and random schedules.
5. Obtain a paid scoped engagement with a written outcome and a measured delivery cost.

Proceed because the evidence supports a result, not because the contribution count reaches a target.

The [wave 2 results](wave2/results.md) execute the finite policy and curriculum comparisons.
History-aware rewards improve the selected invoice outcomes under the recorded budget.
Curriculum selection shows no gain. The held-out ticket family shows no transfer advantage.
These synthetic results leave independent workflow and adoption evidence open.
