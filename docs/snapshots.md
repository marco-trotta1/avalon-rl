# Experience snapshots

An experience snapshot records transitions at one pipeline stage.
The format is `avalon.snapshot/v1`.
The stage is `source`, `recorded`, or `learner`.

```json
{
  "format": "avalon.snapshot/v1",
  "stage": "source",
  "producer": {"name": "counter-world", "version": "1"},
  "seed": 7,
  "evidence": "synthetic",
  "episodes": [{
    "id": "episode-1",
    "task": "counter",
    "steps": [{
      "index": 0,
      "observation": {"counter": 0},
      "action": "increment",
      "reward": 1,
      "next_observation": {"counter": 1},
      "terminated": true,
      "truncated": false
    }]
  }]
}
```

Each step preserves both observations, the action, the reward, and both ending signals.
The optional `bootstrap_mask` is `0` or `1`.
Each episode can include a JSON `metadata` object.
Metadata can preserve a mission or other categorical context.
Unknown fields fail parsing.
The `__proto__` property fails parsing at every depth.
The underlying JSON schema cannot preserve that property.
The boundary rejects it instead of silently removing evidence.
Each file has a 10 MiB limit and a 20,000-transition limit.

Termination identifies a terminal state in the task.
Truncation identifies an external stop condition.
Neither signal establishes success.
See the [Gymnasium time limit documentation](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/).

The parser checks the data format.
The audit checks episode continuity and preservation between stages.
This separation lets a report explain a malformed sequence without discarding its evidence.
Keep actual experience snapshots private.
