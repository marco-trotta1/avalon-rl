"""Freeze a project baseline and compare policies with minimal command setup."""

import argparse
from html import escape
import json
from pathlib import Path
import uuid

from .replay_cli import MAX_BYTES, read_json, write_json, write_text
from .replay_contract import parse_files
from .replay_project_contract import parse_project, project_hash, project_to_dict
from .replay_project_demo import project_demo
from .replay_benchmark import compare_benchmark, freeze_benchmark, validate_benchmark
from .replay_episodes import render_episode_html


def _directory(path: Path) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.mkdir(mode=0o700)


def _bounded_write(path: Path, value: object) -> None:
    rendered = json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    if len(rendered.encode("utf-8")) > MAX_BYTES:
        raise ValueError("The benchmark exceeds the 10 MiB command limit. Reduce the context or case count.")
    write_text(path, rendered)


def _candidates(values: list[str], receipt: dict) -> dict[str, dict[str, str]]:
    if not 1 <= len(values) <= 10:
        raise ValueError("Supply one through ten candidate files.")
    project = parse_project(receipt["project"])
    result = {}
    for value in values:
        name, separator, file = value.partition("=")
        if not separator:
            file = name
            name = Path(file).stem
        if not name.strip() or len(name) > 120 or name in result:
            raise ValueError("Supply unique candidate names with at most 120 characters.")
        path = Path(file)
        if path.suffix == ".py":
            # Use the same bounded, regular-file reader as JSON through a separate text boundary.
            import os
            import stat
            descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
            with os.fdopen(descriptor, "rb") as source:
                if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                    raise ValueError("Supply a regular policy file.")
                data = source.read(65_537)
            if len(data) > 65_536:
                raise ValueError("Keep the policy source within 64 KiB.")
            files = dict(project.task.snapshots.observed)
            files[project.task.policy.file] = data.decode("utf-8")
        else:
            files = read_json(path)
        result[name] = dict(parse_files(files))
    return result


def _comparison_html(report: dict) -> str:
    rows = []
    for candidate in report["paired_deltas"]:
        for pair in candidate["pairs"]:
            values = (candidate["id"], candidate["relative_outcome"], pair["id"], pair["baseline_return"], pair["candidate_return"], pair["return_delta"])
            rows.append("<tr>" + "".join("<td>" + escape(str(value)) + "</td>" for value in values) + "</tr>")
    summary = ("<section><h2>Compared with the frozen current process</h2>"
               "<p>Accepted means the goal checks pass. Positive deltas mean greater return on these cases. Uncertainty is not estimated.</p>"
               "<div class='scroll'><table><thead><tr><th>Candidate</th><th>Relative outcome</th><th>Case</th><th>Frozen baseline</th>"
               "<th>Candidate return</th><th>Return delta</th></tr></thead><tbody>" + "".join(rows) +
               "</tbody></table></div></section>")
    return render_episode_html(report["candidate_report"]).replace("<main>", "<main>" + summary, 1)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Freeze the current process, develop on separate cases, and compare a candidate.")
    commands = parser.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("project-demo", help="Write an authored project template and policies.")
    demo.add_argument("--output", type=Path, required=True)
    freeze = commands.add_parser("freeze", help="Freeze the benchmark and measure the current process.")
    freeze.add_argument("--project", type=Path, default=Path("avalon-project.json"))
    freeze.add_argument("--output", type=Path, default=Path(".avalon/benchmark"))
    freeze.add_argument("--image", default="python:3.11.15-slim")
    freeze.add_argument("--timeout", type=int, default=5)
    for command in ("develop", "compare"):
        operation = commands.add_parser(command, help="Use development cases." if command == "develop" else "Compare one candidate on holdout cases.")
        operation.add_argument("--benchmark", type=Path, default=Path(".avalon/benchmark"))
        operation.add_argument("--candidate", action="append", required=True, metavar="[NAME=]FILE")
        operation.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "project-demo":
            project = project_demo()
            _directory(args.output)
            _bounded_write(args.output / "avalon-project.json", project_to_dict(project))
            write_text(args.output / "candidate.py", project.task.snapshots.reference[project.task.policy.file])
            write_text(args.output / "baseline.py", project.task.snapshots.observed[project.task.policy.file])
            print(f"Project template: {args.output / 'avalon-project.json'}")
            return 0
        if args.command == "freeze":
            project = parse_project(read_json(args.project))
            receipt_path = args.output / "benchmark.json"
            if args.output.exists():
                receipt = validate_benchmark(read_json(receipt_path))
                if (receipt["project_hash"] != project_hash(project) or receipt["image_requested"] != args.image
                        or receipt["timeout_seconds"] != args.timeout):
                    raise ValueError("This directory contains a different benchmark. Select a new output directory.")
                print(f"Reuse the frozen baseline: {receipt_path}")
                return 0
            if not 1 <= args.timeout <= 60:
                raise ValueError("Set the timeout between one and sixty seconds.")
            _directory(args.output)
            receipt = freeze_benchmark(project, image=args.image, timeout_seconds=args.timeout)
            _bounded_write(receipt_path, receipt)
            if receipt["baseline_report"] is not None:
                write_text(args.output / "baseline.html", render_episode_html(receipt["baseline_report"]))
            print(f"Benchmark {receipt['status']}: {receipt_path}")
            if receipt["status"] != "frozen":
                print(f"Reason: {receipt.get('reason', 'baseline-incomplete-or-invalid')}. Check the runtime and report, then use a new output path.")
            return 0 if receipt["status"] == "frozen" else 5
        receipt_path = args.benchmark / "benchmark.json" if args.benchmark.is_dir() else args.benchmark
        receipt = validate_benchmark(read_json(receipt_path))
        if args.command == "compare" and len(args.candidate) != 1:
            raise ValueError("Select one candidate before the holdout comparison. Use develop for candidate selection.")
        candidates = _candidates(args.candidate, receipt)
        output = args.output or Path(".avalon/results") / uuid.uuid4().hex[:12]
        _directory(output)
        report = compare_benchmark(receipt, candidates, split="development" if args.command == "develop" else "holdout")
        write_json(output / "report.json", report)
        write_text(output / "report.html", _comparison_html(report))
        print(f"Comparison {report['status']}: {output / 'report.json'}")
        return {"accepted": 0, "rejected": 4, "inconclusive": 5}[report["status"]]
    except (OSError, ValueError, RuntimeError, RecursionError) as error:
        parser.exit(1, f"Replay cannot complete: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
