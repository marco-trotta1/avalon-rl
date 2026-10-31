"""Read inert sampling evidence without importing a trainer."""

from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import re
import stat
from typing import Literal


FORMAT = "avalon.sampling/v1"
MAX_BYTES = 4 * 1024 * 1024
MAX_TOKENS = 4096
MAX_VOCABULARY = 4096
MAX_LOGIT_VALUES = 131_072
type Role = Literal["policy", "tool", "context", "padding"]
type CheckStatus = Literal["match", "mismatch", "unknown"]
type AuditStatus = Literal["pass", "fail", "inconclusive"]


@dataclass(frozen=True)
class Known[T]:
    value: T


@dataclass(frozen=True)
class Unavailable:
    reason: str


@dataclass(frozen=True)
class CapturedSupport:
    token_ids: tuple[int, ...]


type Support = CapturedSupport | Unavailable
type NumberEvidence = Known[float] | Unavailable
type LogitEvidence = Known[tuple[float, ...]] | Unavailable


@dataclass(frozen=True)
class Producer:
    name: str
    version: str
    revision: str


@dataclass(frozen=True)
class Processor:
    name: str
    value: float
    token_ids: tuple[int, ...]


@dataclass(frozen=True)
class SamplingSample:
    sample_id: str
    group_id: str
    token_position: int
    sampled_token_id: int
    role: Role
    loss_mask: bool
    selected_logprob: NumberEvidence
    support: Support
    raw_logits: LogitEvidence
    processors: tuple[Processor, ...]

    @property
    def key(self) -> tuple[str, int]:
        return self.sample_id, self.token_position


@dataclass(frozen=True)
class SamplingReceipt:
    producer: Producer
    context_hash: str
    samples: tuple[SamplingSample, ...]


@dataclass(frozen=True)
class SamplingFinding:
    rule: str
    key: tuple[str, int] | None
    status: CheckStatus
    detail: str


@dataclass(frozen=True)
class SamplingDiagnostic:
    code: str
    key: tuple[str, int]
    detail: str


@dataclass(frozen=True)
class SamplingAudit:
    status: AuditStatus
    findings: tuple[SamplingFinding, ...]
    diagnostics: tuple[SamplingDiagnostic, ...] = ()


def audit_status(findings: tuple[SamplingFinding, ...]) -> AuditStatus:
    if any(finding.status == "mismatch" for finding in findings):
        return "fail"
    if any(finding.status == "unknown" for finding in findings):
        return "inconclusive"
    return "pass"


def audit_sampling_receipts(*, source: SamplingReceipt, target: SamplingReceipt, tolerance: float = 1e-9) -> SamplingAudit:
    """Compare keyed evidence. Use an absolute log-probability tolerance."""
    from .sampling_math import replay_sampling_sample
    from .sampling_processors import SUPPORTED_PROCESSORS

    tolerance = _number(tolerance, path="tolerance")
    if tolerance < 0:
        raise ValueError("Use a finite nonnegative log-probability tolerance.")
    findings = []
    diagnostics = []
    if source.context_hash != target.context_hash:
        finding = SamplingFinding("context", None, "mismatch", "The receipts declare different contexts.")
        return SamplingAudit("fail", (finding,))
    source_rows = {row.key: row for row in source.samples}
    target_rows = {row.key: row for row in target.samples}
    for key in sorted(source_rows.keys() | target_rows.keys()):
        before, after = source_rows.get(key), target_rows.get(key)
        if before is None or after is None:
            findings.append(SamplingFinding("coverage", key, "mismatch", "The token key occurs in only one receipt."))
            continue
        if before.sampled_token_id != after.sampled_token_id:
            findings.append(SamplingFinding("sampled-token", key, "mismatch", "The sampled token ID changes."))
            continue
        group_status = "match" if before.group_id == after.group_id else "mismatch"
        findings.append(SamplingFinding("group", key, group_status, "Compare the declared group for this sample."))
        role_status = "match" if before.role == after.role else "mismatch"
        findings.append(SamplingFinding("role", key, role_status, "Compare the observed token roles."))
        mask_status = "match" if before.loss_mask == after.loss_mask else "mismatch"
        findings.append(SamplingFinding("loss-mask", key, mask_status, "Compare whether the token contributes to the declared loss."))
        for label, row in (("source", before), ("target", after)):
            role_mask_status = "mismatch" if row.role != "policy" and row.loss_mask else "match"
            findings.append(SamplingFinding(f"loss-role-{label}", key, role_mask_status, "Tool, context, and padding tokens must have a false loss mask."))
        if before.role != "policy" or after.role != "policy":
            continue
        active = before.loss_mask or after.loss_mask
        before_replay, after_replay = replay_sampling_sample(before), replay_sampling_sample(after)
        replay_available = not isinstance(before_replay, Unavailable) and not isinstance(after_replay, Unavailable)
        same_distribution = replay_available and len(before_replay.probabilities) == len(after_replay.probabilities) and all(
            abs(left - right) <= tolerance for left, right in zip(before_replay.probabilities, after_replay.probabilities)
        )
        if replay_available:
            distribution_status = "match" if same_distribution else "mismatch"
            findings.append(SamplingFinding("replayed-distribution", key, distribution_status, "Compare every replayed vocabulary probability with the declared absolute tolerance."))
        elif active:
            findings.append(SamplingFinding("replayed-distribution", key, "unknown", "The active token lacks a complete replayed distribution."))
        if before.processors != after.processors:
            diagnostics.append(SamplingDiagnostic("processor-declaration-change", key, "The transformation declarations differ. Semantic findings use their replayed effects."))
        if any(processor.name not in SUPPORTED_PROCESSORS for row in (before, after) for processor in row.processors):
            processor_status = "unknown"
        elif before.processors == after.processors:
            processor_status = "match"
        elif replay_available:
            processor_status = "match" if same_distribution else "mismatch"
        else:
            processor_status = "unknown"
        if processor_status != "unknown" or active:
            findings.append(SamplingFinding("processors", key, processor_status, "A declaration change alone does not prove a different effective update."))
        if isinstance(before.support, CapturedSupport) and isinstance(after.support, CapturedSupport):
            support_status = "match" if set(before.support.token_ids) == set(after.support.token_ids) else "mismatch"
            findings.append(SamplingFinding("support", key, support_status, "Compare the complete captured token supports."))
        elif active:
            findings.append(SamplingFinding("support", key, "unknown", "A complete captured support is unavailable."))
        for label, row in (("source", before), ("target", after)):
            if isinstance(row.support, CapturedSupport):
                membership = "match" if row.sampled_token_id in row.support.token_ids else "mismatch"
                findings.append(SamplingFinding(f"support-membership-{label}", key, membership, "The sampled token must belong to its support."))
            elif active:
                findings.append(SamplingFinding(f"support-membership-{label}", key, "unknown", "The captured support for this token is unavailable."))
        if isinstance(before.selected_logprob, Known) and isinstance(after.selected_logprob, Known):
            distance = abs(before.selected_logprob.value - after.selected_logprob.value)
            probability_status = "match" if distance <= tolerance else "mismatch"
            findings.append(SamplingFinding("selected-logprob", key, probability_status, "Compare selected log probabilities with the declared absolute tolerance."))
        elif active:
            findings.append(SamplingFinding("selected-logprob", key, "unknown", "A selected log probability is unavailable."))
        for label, row, replay in (("source", before, before_replay), ("target", after, after_replay)):
            if isinstance(replay, Unavailable) or not isinstance(row.selected_logprob, Known):
                replay_status = "unknown"
            else:
                replay_status = "match" if abs(replay.selected_logprob - row.selected_logprob.value) <= tolerance else "mismatch"
            if replay_status != "unknown" or active:
                findings.append(SamplingFinding(f"probability-replay-{label}", key, replay_status, "Compare the declared selected probability with the finite reference."))
    frozen = tuple(findings)
    return SamplingAudit(audit_status(frozen), frozen, tuple(diagnostics))


def _object(value: object, *, keys: set[str], path: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{path}: Use exactly the documented fields.")
    return value


def _label(value: object, *, path: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 240 or not value.strip():
        raise ValueError(f"{path}: Use a label with 1 to 240 characters.")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError(f"{path}: Remove control characters.")
    return value


def _integer(value: object, *, path: str, maximum: int = 2**31 - 1) -> int:
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError(f"{path}: Use a nonnegative integer within the documented limit.")
    return value


def _number(value: object, *, path: str) -> float:
    if type(value) not in (int, float) or (type(value) is int and abs(value) > 2**53 - 1):
        raise ValueError(f"{path}: Use an exact finite JSON number.")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{path}: Use a finite number.")
    return result


def _ids(value: object, *, path: str) -> tuple[int, ...]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_VOCABULARY:
        raise ValueError(f"{path}: Use 1 to 4096 token IDs.")
    result = tuple(_integer(item, path=path) for item in value)
    if len(set(result)) != len(result):
        raise ValueError(f"{path}: Remove duplicate token IDs.")
    return result


def _unavailable(value: dict[str, object], *, path: str) -> Unavailable:
    parsed = _object(value, keys={"kind", "reason"}, path=path)
    return Unavailable(_label(parsed["reason"], path=f"{path}.reason"))


def _support(value: object, *, path: str) -> Support:
    if isinstance(value, dict) and value.get("kind") == "unavailable":
        return _unavailable(value, path=path)
    parsed = _object(value, keys={"kind", "token_ids"}, path=path)
    if parsed["kind"] != "captured":
        raise ValueError(f"{path}: Use captured or unavailable evidence.")
    return CapturedSupport(_ids(parsed["token_ids"], path=path))


def _logprob(value: object, *, path: str) -> NumberEvidence:
    if isinstance(value, dict) and value.get("kind") == "unavailable":
        return _unavailable(value, path=path)
    parsed = _object(value, keys={"kind", "value"}, path=path)
    if parsed["kind"] != "known":
        raise ValueError(f"{path}: Use known or unavailable evidence.")
    number = _number(parsed["value"], path=path)
    if number > 0:
        raise ValueError(f"{path}: A log probability must not exceed zero.")
    return Known(number)


def _logits(value: object, *, path: str) -> LogitEvidence:
    if isinstance(value, dict) and value.get("kind") == "unavailable":
        return _unavailable(value, path=path)
    parsed = _object(value, keys={"kind", "values"}, path=path)
    values = parsed["values"]
    if parsed["kind"] != "known" or not isinstance(values, list) or not 1 <= len(values) <= MAX_VOCABULARY:
        raise ValueError(f"{path}: Use 1 to 4096 finite logits or unavailable evidence.")
    return Known(tuple(_number(item, path=path) for item in values))


def _processors(value: object, *, path: str) -> tuple[Processor, ...]:
    if not isinstance(value, list) or len(value) > 16:
        raise ValueError(f"{path}: Use at most 16 ordered processors.")
    result = []
    for item in value:
        entry = _object(item, keys={"name", "value", "token_ids"}, path=path)
        ids = entry["token_ids"]
        if not isinstance(ids, list):
            raise ValueError(f"{path}: Use a token ID list.")
        name = _label(entry["name"], path=path)
        number = _number(entry["value"], path=path)
        if name in ("temperature", "repetition_penalty") and number <= 0:
            raise ValueError(f"{path}: Use a positive temperature or repetition penalty.")
        if name == "temperature" and ids:
            raise ValueError(f"{path}: Temperature applies to the complete vocabulary.")
        result.append(Processor(
            name=name,
            value=number,
            token_ids=() if not ids else _ids(ids, path=path),
        ))
    return tuple(result)


def parse_sampling_receipt(value: object) -> SamplingReceipt:
    """Parse the complete receipt once at the file or SDK boundary."""
    root = _object(value, keys={"format", "producer", "context_hash", "samples"}, path="receipt")
    if root["format"] != FORMAT:
        raise ValueError("Use the avalon.sampling/v1 format.")
    producer = _object(root["producer"], keys={"name", "version", "revision"}, path="producer")
    context_hash = root["context_hash"]
    if not isinstance(context_hash, str) or re.fullmatch(r"[0-9a-f]{64}", context_hash) is None:
        raise ValueError("context_hash: Use a lowercase SHA-256 hash.")
    entries = root["samples"]
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_TOKENS:
        raise ValueError("samples: Use 1 to 4096 token rows.")
    samples = []
    keys = set()
    groups = {}
    logit_values = 0
    for index, value in enumerate(entries):
        path = f"samples[{index}]"
        row = _object(value, keys={
            "sample_id", "group_id", "token_position", "sampled_token_id", "role", "loss_mask",
            "selected_logprob", "support", "raw_logits", "processors",
        }, path=path)
        role = row["role"]
        if role not in ("policy", "tool", "context", "padding") or type(row["loss_mask"]) is not bool:
            raise ValueError(f"{path}: Use a documented token role and a boolean loss mask.")
        sample = SamplingSample(
            sample_id=_label(row["sample_id"], path=path), group_id=_label(row["group_id"], path=path),
            token_position=_integer(row["token_position"], path=path),
            sampled_token_id=_integer(row["sampled_token_id"], path=path), role=role,
            loss_mask=row["loss_mask"], selected_logprob=_logprob(row["selected_logprob"], path=path),
            support=_support(row["support"], path=path), raw_logits=_logits(row["raw_logits"], path=path),
            processors=_processors(row["processors"], path=path),
        )
        if sample.key in keys:
            raise ValueError(f"{path}: Remove the duplicate token key.")
        if sample.sample_id in groups and groups[sample.sample_id] != sample.group_id:
            raise ValueError(f"{path}: Keep one group for each sample.")
        keys.add(sample.key)
        groups[sample.sample_id] = sample.group_id
        if isinstance(sample.raw_logits, Known):
            logit_values += len(sample.raw_logits.value)
        if logit_values > MAX_LOGIT_VALUES:
            raise ValueError("The receipt exceeds 131072 logit values.")
        samples.append(sample)
    return SamplingReceipt(
        Producer(*(_label(producer[name], path=f"producer.{name}") for name in ("name", "version", "revision"))),
        context_hash, tuple(samples),
    )


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Remove duplicate JSON object keys.")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError(f"Remove the non-finite JSON constant: {value}.")


def read_sampling_receipt(path: Path) -> SamplingReceipt:
    """Read a bounded regular file. Do not follow symbolic links."""
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        metadata = os.fstat(source.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_BYTES:
            raise ValueError("Use a regular sampling file of at most 4 MiB.")
        payload = source.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise ValueError("The sampling file exceeds 4 MiB.")
    try:
        return parse_sampling_receipt(json.loads(payload, object_pairs_hook=_unique_object, parse_constant=_invalid_constant))
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise ValueError("Use a valid bounded JSON sampling receipt.") from error
