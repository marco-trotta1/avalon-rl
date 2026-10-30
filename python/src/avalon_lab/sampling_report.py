"""Serialize grouped reports and private token witnesses."""

from dataclasses import asdict, dataclass, replace
import hashlib
import json
import os
from pathlib import Path

from .sampling import (
    AuditStatus, CapturedSupport, Known, NumberEvidence, SamplingAudit,
    SamplingReceipt, Unavailable, audit_sampling_receipts, audit_status,
)
from .sampling_correction import sampling_correction_impact
from .sampling_witness import sampling_gradient_witness, sampling_receipt_fingerprint


type Json = None | bool | int | float | str | list[Json] | dict[str, Json]
MAX_REPORT_BYTES = 32 * 1024 * 1024


def _reference(*, context_hash: str, identity: object) -> str:
    payload = json.dumps([context_hash, identity], sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def _number_dict(evidence: NumberEvidence) -> dict[str, Json]:
    if isinstance(evidence, Known):
        return {"kind": "known", "value": evidence.value}
    return {"kind": "unavailable", "reason": evidence.reason}


@dataclass(frozen=True)
class SamplingGroupReport:
    group_ref: str
    status: AuditStatus
    source_samples: int
    target_samples: int
    source_tokens: int
    target_tokens: int
    matched_checks: int
    mismatched_checks: int
    unknown_checks: int


def sampling_group_reports(*, source: SamplingReceipt, target: SamplingReceipt, audit: SamplingAudit) -> tuple[SamplingGroupReport, ...]:
    groups = []
    for group_id in sorted({row.group_id for row in source.samples} | {row.group_id for row in target.samples}):
        before = tuple(row for row in source.samples if row.group_id == group_id)
        after = tuple(row for row in target.samples if row.group_id == group_id)
        keys = {row.key for row in before + after}
        findings = tuple(finding for finding in audit.findings if finding.key is None or finding.key in keys)
        groups.append(SamplingGroupReport(
            _reference(context_hash=source.context_hash, identity=["group", group_id]), audit_status(findings),
            len({row.sample_id for row in before}), len({row.sample_id for row in after}), len(before), len(after),
            sum(finding.status == "match" for finding in findings),
            sum(finding.status == "mismatch" for finding in findings),
            sum(finding.status == "unknown" for finding in findings),
        ))
    return tuple(groups)


def sampling_report_dict(*, source: SamplingReceipt, target: SamplingReceipt, tolerance: float = 1e-9) -> dict[str, Json]:
    """Omit raw logits, support IDs, token IDs, and sample labels."""
    audit = audit_sampling_receipts(source=source, target=target, tolerance=tolerance)
    findings = [{
        "rule": finding.rule, "status": finding.status, "detail": finding.detail,
        "token_ref": None if finding.key is None else _reference(context_hash=source.context_hash, identity=finding.key),
    } for finding in audit.findings]
    corrections = []
    for sequence in sampling_correction_impact(source=source, target=target):
        corrections.append({
            "sample_ref": _reference(context_hash=source.context_hash, identity=["sample", sequence.sample_id]),
            "active_tokens": sequence.active_tokens, "excluded_tokens": sequence.excluded_tokens,
            "log_ratio": _number_dict(sequence.log_ratio), "ratio": _number_dict(sequence.ratio),
            "tokens": [{
                "token_ref": _reference(context_hash=source.context_hash, identity=token.key),
                "log_ratio": _number_dict(token.log_ratio), "ratio": _number_dict(token.ratio),
            } for token in sequence.tokens],
        })
    return {
        "format": "avalon.sampling-audit/v1", "status": audit.status,
        "source_receipt_sha256": sampling_receipt_fingerprint(source),
        "target_receipt_sha256": sampling_receipt_fingerprint(target),
        "producers": {"source": asdict(source.producer), "target": asdict(target.producer)},
        "tolerance": {"absolute_probability": tolerance, "absolute_log_probability": tolerance},
        "summary": {status: sum(finding.status == status for finding in audit.findings) for status in ("match", "mismatch", "unknown")},
        "groups": [asdict(group) for group in sampling_group_reports(source=source, target=target, audit=audit)],
        "findings": findings,
        "diagnostics": [{
            "code": item.code, "detail": item.detail,
            "token_ref": _reference(context_hash=source.context_hash, identity=item.key),
        } for item in audit.diagnostics],
        "corrections": corrections,
        "limits": [
            "The receipts supply the evidence. Hashes do not prove trainer execution.",
            "The reference uses finite categorical float64 arithmetic. It does not reproduce a GPU kernel.",
            "Raw correction weights do not reproduce clipping, parameter gradients, or policy quality.",
            "Hashed labels are references. They do not establish anonymity.",
        ],
    }


def sampling_receipt_dict(receipt: SamplingReceipt) -> dict[str, Json]:
    rows = []
    for row in receipt.samples:
        support = {"kind": "captured", "token_ids": list(row.support.token_ids)} if isinstance(row.support, CapturedSupport) else {
            "kind": "unavailable", "reason": row.support.reason,
        }
        logits = {"kind": "known", "values": list(row.raw_logits.value)} if isinstance(row.raw_logits, Known) else {
            "kind": "unavailable", "reason": row.raw_logits.reason,
        }
        rows.append({
            "sample_id": row.sample_id, "group_id": row.group_id, "token_position": row.token_position,
            "sampled_token_id": row.sampled_token_id, "role": row.role, "loss_mask": row.loss_mask,
            "selected_logprob": _number_dict(row.selected_logprob), "support": support, "raw_logits": logits,
            "processors": [{"name": item.name, "value": item.value, "token_ids": list(item.token_ids)} for item in row.processors],
        })
    return {"format": "avalon.sampling/v1", "producer": asdict(receipt.producer), "context_hash": receipt.context_hash, "samples": rows}


def sampling_witness_dict(*, source: SamplingReceipt, target: SamplingReceipt, key: tuple[str, int]) -> dict[str, Json]:
    """Keep only the selected raw token rows and their original bindings."""
    witness = sampling_gradient_witness(source=source, target=target, key=key)
    if isinstance(witness, Unavailable):
        return {"format": "avalon.sampling-witness/v1", "kind": "unavailable", "reason": witness.reason}
    before = replace(source, samples=tuple(row for row in source.samples if row.key == key))
    after = replace(target, samples=tuple(row for row in target.samples if row.key == key))
    claim = {name: list(value) if isinstance(value, tuple) else value for name, value in asdict(witness).items()}
    return {
        "format": "avalon.sampling-witness/v1", "kind": "available", "claim": claim,
        "source_receipt": sampling_receipt_dict(before), "target_receipt": sampling_receipt_dict(after),
        "source_minimum_sha256": sampling_receipt_fingerprint(before),
        "target_minimum_sha256": sampling_receipt_fingerprint(after),
        "limits": ["The witness contains raw evidence. Keep it private.", "The gradient scope is processed categorical logits, not model parameters."],
    }


def write_sampling_json(path: Path, value: object) -> None:
    """Create one owner-only JSON file and preserve existing paths."""
    payload = (json.dumps(value, allow_nan=False, sort_keys=True, indent=2) + "\n").encode()
    if len(payload) > MAX_REPORT_BYTES:
        raise ValueError("The sampling output exceeds 32 MiB.")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(payload)
