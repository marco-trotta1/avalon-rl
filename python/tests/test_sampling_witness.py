from copy import deepcopy
import math

import pytest

from avalon_lab.sampling import Unavailable, parse_sampling_receipt
from avalon_lab.sampling_witness import sampling_gradient_witness, sampling_receipt_fingerprint
from test_sampling import receipt_value


def test_witness_reproduces_the_support_counterexample_and_binds_its_identity():
    source = parse_sampling_receipt(receipt_value())
    target_value = receipt_value()
    target_value["samples"][0]["support"]["token_ids"] = [0, 2]
    target = parse_sampling_receipt(target_value)
    witness = sampling_gradient_witness(source=source, target=target, key=("sample-1", 0))
    assert not isinstance(witness, Unavailable)
    assert witness.sampled_token_id == 0
    assert witness.source_receipt_sha256 == sampling_receipt_fingerprint(source)
    assert witness.target_receipt_sha256 == sampling_receipt_fingerprint(target)
    assert witness.source_gradient == pytest.approx((0.5, -0.5, 0.0), abs=1e-12)
    assert witness.target_gradient == pytest.approx((0.5, 0.0, -0.5), abs=1e-12)
    assert witness.gradient_l1_difference == pytest.approx(1.0, abs=1e-12)
    assert witness.selected_logprob_difference == pytest.approx(0.0, abs=1e-12)


def test_equal_selected_probability_and_support_can_hide_nonselected_gradient_changes():
    value = receipt_value()
    value["samples"][0]["support"]["token_ids"] = [0, 1, 2]
    value["samples"][0]["raw_logits"]["values"] = [0.0, math.log(2), 0.0]
    target_value = deepcopy(value)
    target_value["samples"][0]["raw_logits"]["values"] = [0.0, 0.0, math.log(2)]
    witness = sampling_gradient_witness(source=parse_sampling_receipt(value), target=parse_sampling_receipt(target_value), key=("sample-1", 0))
    assert not isinstance(witness, Unavailable)
    assert witness.selected_logprob_difference == pytest.approx(0.0, abs=1e-12)
    assert witness.gradient_l1_difference == pytest.approx(0.5, abs=1e-12)


@pytest.mark.parametrize("change", ["context", "identity", "position", "group", "inactive", "missing"])
def test_witness_refuses_to_join_unrelated_or_unavailable_token_evidence(change):
    source = receipt_value()
    target = deepcopy(source)
    row = target["samples"][0]
    if change == "context":
        target["context_hash"] = "1" * 64
    elif change == "identity":
        row["sampled_token_id"] = 1
    elif change == "position":
        row["token_position"] = 1
    elif change == "group":
        row["group_id"] = "other"
    elif change == "inactive":
        row["loss_mask"] = False
    else:
        row["raw_logits"] = {"kind": "unavailable", "reason": "Not exported."}
    result = sampling_gradient_witness(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target), key=("sample-1", 0))
    assert isinstance(result, Unavailable)


def test_witness_does_not_invent_a_parameter_gradient_or_change_inputs():
    value = receipt_value()
    original = deepcopy(value)
    parsed = parse_sampling_receipt(value)
    result = sampling_gradient_witness(source=parsed, target=parsed, key=("sample-1", 0))
    assert not isinstance(result, Unavailable)
    assert "processed categorical logits" in result.gradient_scope
    assert result.gradient_l1_difference == pytest.approx(0.0, abs=1e-12)
    assert value == original
