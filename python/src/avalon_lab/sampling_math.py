"""Compute finite categorical references from captured evidence."""

from dataclasses import dataclass
import math

from .sampling import CapturedSupport, Known, SamplingSample, Unavailable
from .sampling_processors import replay_processors


@dataclass(frozen=True)
class TokenDistribution:
    selected_logprob: float
    probabilities: tuple[float, ...]


def distribution_from_logits(*, logits: tuple[float, ...], support: tuple[int, ...], sampled_token_id: int) -> TokenDistribution | Unavailable:
    """Normalize over the captured support with a stable partition."""
    if sampled_token_id not in support or any(token_id >= len(logits) for token_id in support):
        return Unavailable("The support does not identify a valid sampled vocabulary token.")
    maximum = max(logits[token_id] for token_id in support)
    weights = {token_id: math.exp(logits[token_id] - maximum) for token_id in support}
    partition = math.fsum(weights.values())
    selected_logprob = (logits[sampled_token_id] - maximum) - math.log(partition)
    if not math.isfinite(selected_logprob):
        return Unavailable("The selected log probability exceeds the finite arithmetic range.")
    probabilities = tuple(weights.get(token_id, 0.0) / partition for token_id in range(len(logits)))
    return TokenDistribution(selected_logprob, probabilities)


def replay_sampling_sample(sample: SamplingSample) -> TokenDistribution | Unavailable:
    """Replay captured logits, ordered processors, and the support."""
    if not isinstance(sample.raw_logits, Known) or not isinstance(sample.support, CapturedSupport):
        return Unavailable("Replay requires raw logits and a complete captured support.")
    logits = replay_processors(logits=sample.raw_logits.value, processors=sample.processors)
    if isinstance(logits, Unavailable):
        return logits
    return distribution_from_logits(
        logits=logits, support=sample.support.token_ids,
        sampled_token_id=sample.sampled_token_id,
    )
