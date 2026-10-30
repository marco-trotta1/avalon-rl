"""Describe raw importance weights without changing a training update."""

from dataclasses import dataclass
import math
import sys

from .sampling import Known, NumberEvidence, SamplingReceipt, Unavailable


@dataclass(frozen=True)
class TokenCorrection:
    key: tuple[str, int]
    log_ratio: NumberEvidence
    ratio: NumberEvidence


@dataclass(frozen=True)
class SequenceCorrection:
    sample_id: str
    active_tokens: int
    excluded_tokens: int
    tokens: tuple[TokenCorrection, ...]
    log_ratio: NumberEvidence
    ratio: NumberEvidence


def _ratio(log_ratio: NumberEvidence) -> NumberEvidence:
    if isinstance(log_ratio, Unavailable):
        return log_ratio
    value = log_ratio.value
    if value > math.log(sys.float_info.max) or value < math.log(math.nextafter(0.0, 1.0)):
        return Unavailable("The ratio exceeds the positive finite float64 range. Keep the log ratio.")
    try:
        return Known(math.exp(value))
    except OverflowError:
        return Unavailable("The ratio exceeds the positive finite float64 range. Keep the log ratio.")


def sampling_correction_impact(*, source: SamplingReceipt, target: SamplingReceipt) -> tuple[SequenceCorrection, ...]:
    """Compute target-minus-source log ratios for aligned active policy tokens."""
    context_matches = source.context_hash == target.context_hash
    before_rows = {row.key: row for row in source.samples}
    after_rows = {row.key: row for row in target.samples}
    sequences = []
    for sample_id in sorted({row.sample_id for row in source.samples} | {row.sample_id for row in target.samples}):
        tokens = []
        excluded = 0
        for key in sorted(key for key in before_rows.keys() | after_rows.keys() if key[0] == sample_id):
            before, after = before_rows.get(key), after_rows.get(key)
            if before is not None and after is not None and not before.loss_mask and not after.loss_mask:
                excluded += 1
                continue
            reason = None
            if not context_matches:
                reason = "The receipts declare different contexts."
            elif before is None or after is None:
                reason = "The token key occurs in only one receipt."
            elif before.sampled_token_id != after.sampled_token_id or before.group_id != after.group_id:
                reason = "The sampled token or group identity changes."
            elif before.role != "policy" or after.role != "policy" or before.loss_mask != after.loss_mask:
                reason = "The token roles or active loss masks do not match."
            elif not isinstance(before.selected_logprob, Known) or not isinstance(after.selected_logprob, Known):
                reason = "An active selected log probability is unavailable."
            if reason is not None:
                log_ratio = Unavailable(reason)
            else:
                difference = after.selected_logprob.value - before.selected_logprob.value
                log_ratio = Known(difference) if math.isfinite(difference) else Unavailable("The log ratio exceeds the finite arithmetic range.")
            tokens.append(TokenCorrection(key, log_ratio, _ratio(log_ratio)))
        if any(isinstance(token.log_ratio, Unavailable) for token in tokens):
            sequence_log_ratio = Unavailable("At least one active token lacks an aligned log ratio.")
        else:
            try:
                total = math.fsum(token.log_ratio.value for token in tokens)
                sequence_log_ratio = Known(total) if math.isfinite(total) else Unavailable("The sequence log ratio exceeds the finite arithmetic range.")
            except OverflowError:
                sequence_log_ratio = Unavailable("The sequence log ratio exceeds the finite arithmetic range.")
        sequences.append(SequenceCorrection(sample_id, len(tokens), excluded, tuple(tokens), sequence_log_ratio, _ratio(sequence_log_ratio)))
    return tuple(sequences)
