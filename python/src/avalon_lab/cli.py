"""The local experiment command."""

import argparse
from pathlib import Path

from .agent_cli import AGENT_COMMANDS, add_agent_commands, dispatch_agent_command
from .counter import record_counter
from .comparison import run_comparison
from .experiment import run_experiment
from .gym_recorder import BUILTIN_ENVIRONMENTS, record_builtin
from .local_export import export_local
from .snapshot import write_snapshot


def _frontier_command(args: argparse.Namespace) -> int:
    from .sampling import read_sampling_receipt
    from .sampling_report import sampling_report_dict, sampling_witness_dict, write_sampling_json

    if args.command == "sampling-benchmark":
        from .sampling_benchmark import run_sampling_benchmark
        write_sampling_json(args.output, run_sampling_benchmark(seed=args.seed))
        return 0
    if args.command == "policy-experiment":
        from .policy_experiment import run_policy_experiment
        run_policy_experiment(train_paths=tuple(args.train), same_family_paths=tuple(args.same_family), family_paths=tuple(args.family), output=args.output)
        return 0
    source = read_sampling_receipt(args.source)
    target = read_sampling_receipt(args.target)
    if args.command == "sampling-witness":
        witness = sampling_witness_dict(source=source, target=target, key=(args.sample, args.position))
        write_sampling_json(args.output, witness)
        return 0 if witness["kind"] == "available" else 5
    report = sampling_report_dict(source=source, target=target, tolerance=args.tolerance)
    write_sampling_json(args.output, report)
    return {"pass": 0, "fail": 4, "inconclusive": 5}[report["status"]]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run local RL audits and bounded policy experiments.")
    commands = parser.add_subparsers(dest="command", required=True)
    add_agent_commands(commands)
    record = commands.add_parser("record-counter")
    record.add_argument("--output", type=Path, required=True)
    record.add_argument("--seed", type=int, default=7)
    experiment = commands.add_parser("experiment")
    experiment.add_argument("--output", type=Path, required=True)
    experiment.add_argument("--seed", type=int, default=7)
    builtin = commands.add_parser("record-gym")
    builtin.add_argument("--environment", choices=tuple(BUILTIN_ENVIRONMENTS), required=True)
    builtin.add_argument("--output", type=Path, required=True)
    builtin.add_argument("--seed", type=int, default=7)
    builtin.add_argument("--episodes", type=int, default=2)
    builtin.add_argument("--max-steps", type=int, default=100)
    export = commands.add_parser("export-minari")
    export.add_argument("--dataset-path", type=Path, required=True)
    export.add_argument("--task", required=True)
    export.add_argument("--seed", type=int, required=True)
    export.add_argument("--output", type=Path, required=True)
    compare = commands.add_parser("compare")
    compare.add_argument("--experiment", type=Path, required=True)
    compare.add_argument("--avalon-cli", type=Path, required=True)
    compare.add_argument("--output", type=Path, required=True)
    audit = commands.add_parser("sampling-audit")
    audit.add_argument("--source", type=Path, required=True)
    audit.add_argument("--target", type=Path, required=True)
    audit.add_argument("--output", type=Path, required=True)
    audit.add_argument("--tolerance", type=float, default=1e-9)
    witness = commands.add_parser("sampling-witness")
    witness.add_argument("--source", type=Path, required=True)
    witness.add_argument("--target", type=Path, required=True)
    witness.add_argument("--sample", required=True)
    witness.add_argument("--position", type=int, required=True)
    witness.add_argument("--output", type=Path, required=True)
    benchmark = commands.add_parser("sampling-benchmark")
    benchmark.add_argument("--seed", type=int, default=7)
    benchmark.add_argument("--output", type=Path, required=True)
    policy = commands.add_parser("policy-experiment")
    policy.add_argument("--train", type=Path, action="append", required=True)
    policy.add_argument("--same-family", type=Path, action="append", required=True)
    policy.add_argument("--family", type=Path, action="append", required=True)
    policy.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command in AGENT_COMMANDS:
        try:
            return dispatch_agent_command(args)
        except (OSError, ValueError, KeyError, RecursionError):
            parser.exit(1, "The agent workflow cannot complete. Check the documented inputs and output paths.\n")
    if args.command in ("sampling-audit", "sampling-witness", "sampling-benchmark", "policy-experiment"):
        try:
            return _frontier_command(args)
        except (OSError, ValueError, KeyError, RecursionError):
            parser.exit(1, "The local workflow cannot complete. Check the documented inputs and output paths.\n")
    elif args.command == "compare":
        run_comparison(experiment=args.experiment, avalon_cli=args.avalon_cli, output=args.output)
    elif args.command == "experiment":
        run_experiment(output=args.output, seed=args.seed)
    elif args.command == "export-minari":
        write_snapshot(args.output, export_local(path=args.dataset_path, seed=args.seed, task=args.task))
    elif args.command == "record-gym":
        write_snapshot(args.output, record_builtin(environment_id=args.environment, seed=args.seed, episodes=args.episodes, max_steps=args.max_steps))
    else:
        write_snapshot(args.output, record_counter(seed=args.seed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
