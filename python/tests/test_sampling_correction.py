from copy import deepcopy
import math

import pytest

from avalon_lab.sampling import Known, Unavailable, parse_sampling_receipt
from avalon_lab.sampling_correction import sampling_correction_impact
from test_sampling import receipt_value


def pair_with_difference(*, count, difference):
    source = receipt_value()
    source["samples"] = []
    for position in range(count):
        row = receipt_value()["samples"][0]
        row["token_position"] = position
        row["selected_logprob"]["value"] = -1001.0
        source["samples"].append(row)
    target = deepcopy(source)
    for row in target["samples"]:
        row["selected_logprob"]["value"] += difference
    return parse_sampling_receipt(source), parse_sampling_receipt(target)


def test_sequence_correction_compounds_only_the_aligned_active_tokens():
    source, target = pair_with_difference(count=256, difference=-0.1)
    correction, = sampling_correction_impact(source=source, target=target)
    assert correction.active_tokens == 256
    assert correction.log_ratio.value == pytest.approx(-25.6, abs=1e-9)
    assert correction.ratio.value == pytest.approx(math.exp(-25.6), rel=1e-9)
    assert correction.tokens[0].ratio.value == pytest.approx(math.exp(-0.1), rel=1e-9)


@pytest.mark.parametrize("difference", [-1000.0, 1000.0])
def test_unrepresentable_ratios_preserve_finite_log_evidence(difference):
    source, target = pair_with_difference(count=1, difference=difference)
    correction, = sampling_correction_impact(source=source, target=target)
    assert isinstance(correction.log_ratio, Known)
    assert correction.log_ratio.value == pytest.approx(difference, abs=1e-9)
    assert isinstance(correction.ratio, Unavailable)


def test_unknown_active_probability_does_not_become_a_ratio_of_one():
    source = receipt_value()
    target = deepcopy(source)
    target["samples"][0]["selected_logprob"] = {"kind": "unavailable", "reason": "Not exported."}
    correction, = sampling_correction_impact(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert isinstance(correction.log_ratio, Unavailable)
    assert isinstance(correction.ratio, Unavailable)


def test_inactive_tokens_are_excluded_and_mismatched_masks_are_unknown():
    source = receipt_value()
    source["samples"][0]["loss_mask"] = False
    target = deepcopy(source)
    correction, = sampling_correction_impact(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert correction.active_tokens == 0 and correction.excluded_tokens == 1
    assert correction.log_ratio.value == pytest.approx(0.0, abs=1e-12)
    target["samples"][0]["loss_mask"] = True
    correction, = sampling_correction_impact(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert isinstance(correction.log_ratio, Unavailable)


def test_context_mismatch_produces_explicit_unknown_correction_evidence():
    source = receipt_value()
    target = deepcopy(source)
    target["context_hash"] = "1" * 64
    correction, = sampling_correction_impact(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert isinstance(correction.log_ratio, Unavailable)
