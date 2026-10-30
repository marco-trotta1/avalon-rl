"""Replay declared logit transformations in their recorded order."""

import math

from .sampling import Processor, Unavailable


SUPPORTED_PROCESSORS = frozenset({"temperature", "repetition_penalty", "presence_penalty", "logit_bias"})


def replay_processors(*, logits: tuple[float, ...], processors: tuple[Processor, ...]) -> tuple[float, ...] | Unavailable:
    """Apply supported arithmetic. Do not execute custom processors."""
    result = list(logits)
    for processor in processors:
        if processor.name not in SUPPORTED_PROCESSORS:
            return Unavailable("A declared logit processor has no supported reference.")
        if any(token_id >= len(result) for token_id in processor.token_ids):
            return Unavailable("A processor token ID is outside the captured vocabulary.")
        if processor.name == "temperature":
            result = [value / processor.value for value in result]
        elif processor.name == "repetition_penalty":
            for token_id in processor.token_ids:
                value = result[token_id]
                result[token_id] = value * processor.value if value < 0 else value / processor.value
        elif processor.name == "presence_penalty":
            for token_id in processor.token_ids:
                result[token_id] -= processor.value
        elif processor.name == "logit_bias":
            for token_id in processor.token_ids:
                result[token_id] += processor.value
        if any(not math.isfinite(value) for value in result):
            return Unavailable("The declared processor exceeds the finite arithmetic range.")
    return tuple(result)
