"""The local experiment command."""

import argparse
from pathlib import Path

from .counter import record_counter
from .comparison import run_comparison
from .experiment import run_experiment
from .gym_recorder import BUILTIN_ENVIRONMENTS, record_builtin
from .local_export import export_local
from .snapshot import write_snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description="Record a local synthetic RL snapshot.")
    commands = parser.add_subparsers(dest="command", required=True)
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
    args = parser.parse_args()
    if args.command == "compare":
        run_comparison(experiment=args.experiment, avalon_cli=args.avalon_cli, output=args.output)
    elif args.command == "experiment":
        run_experiment(output=args.output, seed=args.seed)
    elif args.command == "export-minari":
        write_snapshot(args.output, export_local(path=args.dataset_path, seed=args.seed, task=args.task))
    elif args.command == "record-gym":
        write_snapshot(args.output, record_builtin(environment_id=args.environment, seed=args.seed, episodes=args.episodes, max_steps=args.max_steps))
    else:
        write_snapshot(args.output, record_counter(seed=args.seed))


if __name__ == "__main__":
    main()
