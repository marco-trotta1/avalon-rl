"""The local experiment command."""

import argparse
from pathlib import Path

from .counter import record_counter
from .snapshot import write_snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description="Record a local synthetic RL snapshot.")
    commands = parser.add_subparsers(dest="command", required=True)
    record = commands.add_parser("record-counter")
    record.add_argument("--output", type=Path, required=True)
    record.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    write_snapshot(args.output, record_counter(seed=args.seed))


if __name__ == "__main__":
    main()
