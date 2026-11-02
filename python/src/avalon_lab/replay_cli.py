"""The standalone Avalon Replay command."""

import argparse
import json
import math
import os
import stat
from pathlib import Path

from .replay_contract import parse_files, parse_replay_task, task_to_dict
from .replay_demo import ALTERNATIVE, OVERFIT, demo_task, files


MAX_BYTES = 10 * 1024 * 1024


def read_json(path: Path) -> object:
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
            raise ValueError("Use a regular JSON file.")
        data = source.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("The JSON file exceeds 10 MiB.")
    return json.loads(data.decode("utf-8"), parse_constant=_reject_constant, parse_float=_finite_float, object_pairs_hook=_unique_object)


def _finite_float(value: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Use finite JSON numbers.")
    return result


def _reject_constant(value: str) -> None:
    raise ValueError("Use finite JSON numbers.")


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Use unique JSON keys.")
        result[key] = value
    return result


def write_text(path: Path, text: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(text)


def write_json(path: Path, value: object) -> None:
    write_text(path, json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Avalon Replay: execute failures and evaluate repairs locally.")
    commands = parser.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo", help="Write an authored task and repair candidates.")
    demo.add_argument("--output", type=Path, required=True)
    demo.add_argument("--environment", choices=("CartPole-v1", "FrozenLake-v1"), help="Write a multi-step episode task.")
    validate = commands.add_parser("validate", help="Validate a task without running code.")
    validate.add_argument("--task", type=Path, required=True)
    run = commands.add_parser("run", help="Execute a campaign in restricted Docker containers.")
    run.add_argument("--task", type=Path, required=True)
    run.add_argument("--candidate", action="append", default=[], metavar="NAME=JSON")
    run.add_argument("--image", default="python:3.11.15-slim")
    run.add_argument("--timeout", type=int, default=5)
    run.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "demo":
            if args.environment:
                from .replay_episode_demo import BAD_POLICY, episode_demo
                from .replay_episode_contract import episode_task_to_dict
                task = episode_demo(args.environment)
                args.output.mkdir(mode=0o700)
                write_json(args.output / "task.json", episode_task_to_dict(task))
                write_json(args.output / "repair.json", dict(task.snapshots.reference))
                write_json(args.output / "baseline.json", {"policy.py": BAD_POLICY})
                print("The private episode demo contains a task, a controller, and an always-left baseline.")
                return 0
            task = demo_task()
            args.output.mkdir(mode=0o700)
            write_json(args.output / "task.json", task_to_dict(task))
            write_json(args.output / "repair.json", files(ALTERNATIVE))
            write_json(args.output / "overfit.json", files(OVERFIT))
            print("The private demo contains a task, a valid repair, and an overfit candidate.")
            return 0
        raw = read_json(args.task)
        episode = isinstance(raw, dict) and raw.get("format") == "avalon.replay-episode.v1"
        if episode:
            from .replay_episode_contract import parse_episode_task, episode_task_hash
            task = parse_episode_task(raw)
            digest = episode_task_hash(task)
        else:
            from .replay_contract import task_hash
            task = parse_replay_task(raw)
            digest = task_hash(task)
        if args.command == "validate":
            print(json.dumps({"format": "avalon.replay-validation.v1", "task_hash": digest, "status": "valid"}))
            return 0
        from .replay_campaign import render_campaign_html, run_campaign
        if not args.candidate or len(args.candidate) > 10:
            raise ValueError("Supply between one and ten candidates.")
        if not args.image.strip() or args.image.startswith("-") or len(args.image) > 300:
            raise ValueError("Supply a local Docker image name or digest.")
        candidates: dict[str, dict[str, str]] = {}
        for specification in args.candidate:
            name, separator, path = specification.partition("=")
            if not separator or not name.strip() or name in candidates or len(name) > 120:
                raise ValueError("Supply unique NAME=JSON candidates.")
            value = read_json(Path(path))
            candidates[name] = dict(parse_files(value))
        if not 1 <= args.timeout <= 60:
            raise ValueError("Set the timeout between one and sixty seconds.")
        args.output.mkdir(mode=0o700)
        if episode:
            from .replay_episodes import render_episode_html, run_episode_campaign
            report = run_episode_campaign(task=task, candidates=candidates, image=args.image, timeout_seconds=args.timeout)
            rendered = render_episode_html(report)
        else:
            report = run_campaign(task=task, candidates=candidates, image=args.image, timeout_seconds=args.timeout)
            rendered = render_campaign_html(report)
        write_json(args.output / "report.json", report)
        write_text(args.output / "report.html", rendered)
        print("The private campaign report is written as JSON and HTML.")
        return {"accepted": 0, "rejected": 4, "inconclusive": 5}[report["status"]]
    except (OSError, ValueError, RuntimeError, RecursionError):
        parser.exit(1, "Replay cannot complete. Check the inputs, Docker runtime, cached image, and new output path.\n")


if __name__ == "__main__":
    raise SystemExit(main())
