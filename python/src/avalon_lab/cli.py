"""The local experiment command."""

import argparse
from pathlib import Path

from .counter import record_counter
from .experiment import run_experiment
from .gym_recorder import BUILTIN_ENVIRONMENTS, record_builtin
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
    args = parser.parse_args()
    if args.command == "experiment":
        run_experiment(output=args.output, seed=args.seed)
    elif args.command == "record-gym":
        write_snapshot(args.output, record_builtin(environment_id=args.environment, seed=args.seed, episodes=args.episodes, max_steps=args.max_steps))
    else:
        write_snapshot(args.output, record_counter(seed=args.seed))


if __name__ == "__main__":
    main()
