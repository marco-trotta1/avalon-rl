"""Bind a finite categorical gradient witness to one active token."""

from dataclasses import asdict, dataclass
import hashlib
import json
import math

from .sampling import CapturedSupport, SamplingReceipt, Unavailable
from .sampling_math import replay_sampling_sample


def sampling_receipt_fingerprint(receipt: SamplingReceipt) -> str:
    payload = json.dumps(asdict(receipt), sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return hashlib.sha256(payload).hexdigest()


@dataclass(frozen=True)
class GradientWitness:
    context_hash: str
    key: tuple[str, int]
    sampled_token_id: int
    source_receipt_sha256: str
    target_receipt_sha256: str
    source_support: tuple[int, ...]
    target_support: tuple[int, ...]
    source_gradient: tuple[float, ...]
    target_gradient: tuple[float, ...]
    gradient_l1_difference: float
    selected_logprob_difference: float
    gradient_scope: str = "selected log probability with respect to processed categorical logits"


def sampling_gradient_witness(*, source: SamplingReceipt, target: SamplingReceipt, key: tuple[str, int]) -> GradientWitness | Unavailable:
    """Reproduce one token's categorical gradient under supplied evidence."""
    if source.context_hash != target.context_hash:
        return Unavailable("The receipts declare different contexts.")
    before = next((row for row in source.samples if row.key == key), None)
    after = next((row for row in target.samples if row.key == key), None)
    if before is None or after is None:
        return Unavailable("The selected token key must occur in both receipts.")
    if before.sampled_token_id != after.sampled_token_id or before.group_id != after.group_id:
        return Unavailable("The selected token or group identity changes.")
    if before.role != "policy" or after.role != "policy" or not before.loss_mask or not after.loss_mask:
        return Unavailable("The witness requires an active policy token on both sides.")
    before_distribution, after_distribution = replay_sampling_sample(before), replay_sampling_sample(after)
    if isinstance(before_distribution, Unavailable) or isinstance(after_distribution, Unavailable):
        return Unavailable("The witness requires complete finite replay evidence on both sides.")
    if len(before_distribution.probabilities) != len(after_distribution.probabilities):
        return Unavailable("The captured vocabularies have different widths.")
    source_gradient = tuple((1.0 if token_id == before.sampled_token_id else 0.0) - probability
        for token_id, probability in enumerate(before_distribution.probabilities))
    target_gradient = tuple((1.0 if token_id == after.sampled_token_id else 0.0) - probability
        for token_id, probability in enumerate(after_distribution.probabilities))
    return GradientWitness(
        source.context_hash, key, before.sampled_token_id,
        sampling_receipt_fingerprint(source), sampling_receipt_fingerprint(target),
        before.support.token_ids, after.support.token_ids,
        source_gradient, target_gradient,
        math.fsum(abs(left - right) for left, right in zip(source_gradient, target_gradient)),
        after_distribution.selected_logprob - before_distribution.selected_logprob,
    )
