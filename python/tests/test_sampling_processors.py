from copy import deepcopy
import math

import pytest

from avalon_lab.sampling import Processor, Unavailable, audit_sampling_receipts, parse_sampling_receipt
from avalon_lab.sampling_math import replay_sampling_sample
from avalon_lab.sampling_processors import replay_processors
from test_sampling import receipt_value


def test_processor_order_changes_the_reference_and_the_audit_preserves_it():
    logits = (2.0, -2.0, 0.0)
    temperature = Processor("temperature", 2.0, ())
    bias = Processor("logit_bias", 2.0, (0,))
    assert replay_processors(logits=logits, processors=(temperature, bias)) == pytest.approx((3.0, -1.0, 0.0))
    assert replay_processors(logits=logits, processors=(bias, temperature)) == pytest.approx((2.0, -1.0, 0.0))


def test_repetition_reference_handles_both_logit_signs_and_presence():
    result = replay_processors(logits=(2.0, -2.0, 0.0), processors=(
        Processor("repetition_penalty", 2.0, (0, 1)), Processor("presence_penalty", 0.5, (0,)),
    ))
    assert result == pytest.approx((0.5, -4.0, 0.0))


def test_missing_processor_and_out_of_vocabulary_ids_remain_unknown():
    assert isinstance(replay_processors(logits=(0.0,), processors=(Processor("custom", 1.0, ()),)), Unavailable)
    assert isinstance(replay_processors(logits=(0.0,), processors=(Processor("logit_bias", 1.0, (1,)),)), Unavailable)
    assert isinstance(replay_processors(logits=(1e308,), processors=(Processor("temperature", 1e-308, ()),)), Unavailable)


@pytest.mark.parametrize("name", ["temperature", "repetition_penalty"])
def test_invalid_known_processor_values_fail_at_the_boundary(name):
    value = receipt_value()
    value["samples"][0]["processors"] = [{"name": name, "value": 0, "token_ids": []}]
    with pytest.raises(ValueError, match="positive"):
        parse_sampling_receipt(value)


def test_a_declared_temperature_replays_and_a_changed_contract_is_localized():
    value = receipt_value()
    row = value["samples"][0]
    row["raw_logits"]["values"] = [2.0, 0.0, -2.0]
    row["processors"] = [{"name": "temperature", "value": 2.0, "token_ids": []}]
    row["selected_logprob"]["value"] = 1 - math.log(math.exp(1) + 1)
    source = parse_sampling_receipt(value)
    assert audit_sampling_receipts(source=source, target=source).status == "pass"
    target_value = deepcopy(value)
    target_value["samples"][0]["processors"] = []
    target = parse_sampling_receipt(target_value)
    report = audit_sampling_receipts(source=source, target=target)
    assert next(finding for finding in report.findings if finding.rule == "processors").status == "mismatch"
    assert next(finding for finding in report.findings if finding.rule == "probability-replay-target").status == "mismatch"
    assert not isinstance(replay_sampling_sample(source.samples[0]), Unavailable)


def test_equal_unknown_processors_do_not_establish_a_verified_match():
    value = receipt_value()
    value["samples"][0]["processors"] = [{"name": "untrusted.path", "value": 1.0, "token_ids": []}]
    parsed = parse_sampling_receipt(value)
    report = audit_sampling_receipts(source=parsed, target=parsed)
    assert report.status == "inconclusive"
    assert next(finding for finding in report.findings if finding.rule == "processors").status == "unknown"
