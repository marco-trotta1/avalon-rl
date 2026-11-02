# Replay project format

A Replay project records a task brief, explicit context, assumptions, a world implementation, and a frozen episode benchmark.
The format identifier is `avalon.replay-project.v1`.
The format contains no industry-specific fields.
A project can describe a domain when its world, actions, observations, and rewards can be represented by the supported protocol.

The project parser reads the supplied JSON object.
It does not inspect a repository, discover files, or collect local context.
Include only the context that the owner permits you to use.

## Required fields

| Field | Content |
| --- | --- |
| `format` | `avalon.replay-project.v1` |
| `brief` | The requested task and intended outcome |
| `assumptions` | Explicit assumptions used to construct the task |
| `split_rationale` | The reason for the development and holdout partition |
| `task` | A complete `avalon.replay-episode.v1` task |
| `world` | The world files and request function |
| `context` | Explicitly supplied text assets |

All fields are required. Unknown fields are rejected.
Use an empty context object when no assets are supplied.
The brief permits 20,000 characters.
Declare between one and 20 assumptions, with at most 1000 characters each.
The split rationale permits 4000 characters.

Explain relevant grouping and time boundaries in the split rationale.
For example, related episodes can share a source document, site, customer, scenario, or time period.
Distinct seeds do not establish independence between these groups.
The parser requires a nonempty rationale. It cannot verify that the explanation establishes a valid evaluation split.

## Task and world

The nested [episode task](../replay-episode-format.md) retains the policy snapshots, controls, provenance, permissions, seeds, and limits.
Its environment adapter must be `python-world` with an empty configuration object.
The environment identifier names the declared world.

The world declaration has this form:

```json
{
  "files":{"world.py":"...explicit world source..."},
  "entrypoint":{"file":"world.py","function":"act"}
}
```

The entrypoint must name a supplied Python file and a valid function identifier.
The world function receives one request and returns one response.
A reset request has this structure:

```json
{"op":"reset","seed":7}
```

Its response contains the initial observation:

```json
{"observation":{"target":1,"remaining_steps":2}}
```

A step request supplies the candidate action:

```json
{"op":"step","action":1}
```

Its response contains the next observation, world reward, and episode flags:

```json
{
  "observation":{"target":0,"remaining_steps":1},
  "reward":1,
  "terminated":false,
  "truncated":false
}
```

The world can retain state between requests within one episode.
The policy and world use separate execution sessions.
The policy receives observations and returns actions. It does not receive the world source through this protocol.
Review the world and its reward logic before accepting their results.
Execution isolation does not establish that the world accurately represents the intended domain.

## Explicit context

Context maps portable relative paths to text content:

```json
{"requirements.txt":"Allocate the resource to the requested target at each step.\n"}
```

World files, context files, and policy snapshots use the existing bounded file rules.
Each map permits 100 files and 1 MiB of UTF-8 content.
Each file permits 65,536 characters.
Paths reject traversal, absolute paths, reserved names, and file-directory collisions.
The complete project permits 10 MiB of JSON.

Context is evidence for the project description. It does not become candidate input merely because it appears in the manifest.
A world must explicitly expose information through observations when the task requires it.

## Freeze and identity

`parse_project(value)` returns a `Project` with frozen dataclasses and read-only mappings.
The parser copies the supplied input and rejects adapter configuration outside the project contract.
`project_to_dict(project)` returns an independent JSON representation.

`project_hash(project)` binds the complete project.
It includes the brief, assumptions, split rationale, context, task, and world.
`benchmark_hash(project)` binds the task and world separately.
Changing the world, seed roster, thresholds, controls, or policy evidence changes the benchmark hash.
Changing only narrative or context changes the project hash without changing the benchmark hash.

Both hashes use SHA-256 over canonical JSON.
Canonicalization sorts object keys and preserves array order.
Record both hashes with the baseline and subsequent results.
Do not compare a repair against a baseline from another benchmark identity.

A hash identifies content. It does not establish ownership, authenticate a contributor, or validate a scientific claim.

## Authored demonstration

`project_demo()` constructs a two-step resource allocation world.
The policy chooses between integer actions zero and one.
The observation identifies the requested target.
A correct allocation receives one reward unit, and the episode requires two reward units.

The baseline always selects target zero. The reference policy follows the observed target.
Both target orders repeat across the development and holdout splits.
The split rationale states this limitation explicitly.

The demonstration proves a workflow only when its execution passes the declared controls.
It does not train a model, establish domain realism, or demonstrate generalization.
It contains authored context and no external customer data.
