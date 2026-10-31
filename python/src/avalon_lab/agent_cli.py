"""Expose the bounded Gymnasium adapter through the local Python CLI."""

import argparse
import json
import os
from pathlib import Path
import sys

from .gym_training import (
    ENVIRONMENT, TrainConfig, audit_credit, evaluate_checkpoint,
    record_probabilities, train_policy,
)
from .sampling_report import write_sampling_json


AGENT_COMMANDS = ("gym-train", "gym-eval", "gym-probs", "credit-audit")


def add_agent_commands(commands: argparse._SubParsersAction) -> None:
    train = commands.add_parser("gym-train", help="Train a bounded NumPy policy on built-in CartPole.")
    train.add_argument("--environment", choices=(ENVIRONMENT,), default=ENVIRONMENT)
    train.add_argument("--seed", type=int, default=7)
    train.add_argument("--episodes", type=int, default=30)
    train.add_argument("--max-steps", type=int, default=200)
    train.add_argument("--learning-rate", type=float, default=0.01)
    train.add_argument("--discount", type=float, default=0.99)
    train.add_argument("--output", type=Path, required=True)
    evaluate = commands.add_parser("gym-eval", help="Compare a frozen policy with random and heuristic controls.")
    evaluate.add_argument("--checkpoint", type=Path, required=True)
    evaluate.add_argument("--seeds", required=True, help="Supply 2 to 64 distinct uint32 seeds, separated by commas.")
    evaluate.add_argument("--max-steps", type=int, default=500)
    evaluate.add_argument("--output", type=Path, required=True)
    capture = commands.add_parser("gym-probs", help="Capture actual categorical actions and independently replay their probabilities.")
    capture.add_argument("--checkpoint", type=Path, required=True)
    capture.add_argument("--seed", type=int, default=2001)
    capture.add_argument("--episodes", type=int, default=2)
    capture.add_argument("--max-steps", type=int, default=100)
    capture.add_argument("--output", type=Path, required=True)
    credit = commands.add_parser("credit-audit", help="Replay capped REINFORCE returns, advantages, masks, and groups.")
    credit.add_argument("--source", type=Path, required=True)
    credit.add_argument("--tolerance", type=float, default=1e-9)
    credit.add_argument("--output", type=Path, required=True)


def _new_output(path: Path) -> None:
    try:
        os.lstat(path)
    except FileNotFoundError:
        return
    raise FileExistsError("The output path already exists. Select a new output path.")


def _evaluation_seeds(value: str) -> tuple[int, ...]:
    if len(value) > 1024:
        raise ValueError("The evaluation seed list exceeds 1024 characters.")
    parts = value.split(",")
    if not 2 <= len(parts) <= 64 or any(not part.isascii() or not part.isdigit() or len(part) > 10 for part in parts):
        raise ValueError("Supply 2 to 64 unsigned decimal seeds, separated by commas.")
    return tuple(int(part) for part in parts)


def _dispatch(args: argparse.Namespace) -> int:
    if args.command == "gym-train":
        config = TrainConfig(
            environment=args.environment, seed=args.seed, episodes=args.episodes,
            max_steps=args.max_steps, learning_rate=args.learning_rate, discount=args.discount,
        )
        report = train_policy(output=args.output, config=config)
        print(json.dumps({"status": "complete", "training": report["training"], "artifacts": ["training.json", "checkpoint.json", "credit.json"]}, sort_keys=True))
        return 0
    if args.command == "gym-eval":
        _new_output(args.output)
        report = evaluate_checkpoint(checkpoint=args.checkpoint, seeds=_evaluation_seeds(args.seeds), max_steps=args.max_steps)
        write_sampling_json(args.output, report)
        print(json.dumps({"status": "complete", "sample_count": len(report["seeds"]), "comparisons": report["comparisons"]}, sort_keys=True))
        return 0
    if args.command == "gym-probs":
        report = record_probabilities(checkpoint=args.checkpoint, output=args.output, seed=args.seed, episodes=args.episodes, max_steps=args.max_steps)
        print(json.dumps({"status": report["status"], "summary": report["summary"], "artifacts": ["source.json", "target.json", "rollout.json", "report.json"]}, sort_keys=True))
        return {"pass": 0, "fail": 4, "inconclusive": 5}[report["status"]]
    if args.command == "credit-audit":
        _new_output(args.output)
        report = audit_credit(source=args.source, tolerance=args.tolerance)
        write_sampling_json(args.output, report)
        print(json.dumps({"status": report["status"], "summary": report["summary"]}, sort_keys=True))
        return 0 if report["status"] == "pass" else 4
    raise ValueError("Select a supported Gymnasium command.")


def dispatch_agent_command(args: argparse.Namespace) -> int:
    try:
        return _dispatch(args)
    except (OSError, ValueError, TypeError, RecursionError) as error:
        if isinstance(error, ValueError):
            message = str(error)
        else:
            message = "Check the supported formats, recorded limits, and new output paths."
        print(f"The local Gymnasium workflow cannot complete. {message}", file=sys.stderr)
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Execute the bounded local Gymnasium adapter.")
    commands = parser.add_subparsers(dest="command", required=True)
    add_agent_commands(commands)
    return dispatch_agent_command(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
