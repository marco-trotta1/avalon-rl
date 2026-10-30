from copy import deepcopy
import math

import pytest

from avalon_lab.sampling import Unavailable, audit_sampling_receipts, parse_sampling_receipt
from avalon_lab.sampling_math import distribution_from_logits, replay_sampling_sample
from test_sampling import receipt_value


@pytest.mark.parametrize("offset", [-1e300, -1000.0, 0.0, 1000.0, 1e300])
def test_reference_is_stable_under_a_common_logit_offset(offset):
    result = distribution_from_logits(logits=(offset, offset, offset), support=(0, 1), sampled_token_id=0)
    assert not isinstance(result, Unavailable)
    assert result.selected_logprob == pytest.approx(-math.log(2), abs=1e-12)
    assert result.probabilities == pytest.approx((0.5, 0.5, 0.0), abs=1e-12)


def test_sparse_support_and_singleton_do_not_lose_probability_mass():
    result = distribution_from_logits(logits=(0.0, -1000.0, 900.0), support=(0,), sampled_token_id=0)
    assert not isinstance(result, Unavailable)
    assert result.selected_logprob == pytest.approx(0.0, abs=1e-12)
    assert sum(result.probabilities) == pytest.approx(1.0, abs=1e-12)
    assert result.probabilities == pytest.approx((1.0, 0.0, 0.0), abs=1e-12)


def test_replay_does_not_guess_invalid_support_or_unrepresentable_log_probability():
    assert isinstance(distribution_from_logits(logits=(0.0,), support=(1,), sampled_token_id=1), Unavailable)
    assert isinstance(distribution_from_logits(logits=(-1e308, 1e308), support=(0, 1), sampled_token_id=0), Unavailable)


def test_reference_finds_two_agreeing_but_inconsistent_logprob_receipts():
    value = receipt_value()
    value["samples"][0]["selected_logprob"]["value"] = -0.9
    parsed = parse_sampling_receipt(value)
    audit = audit_sampling_receipts(source=parsed, target=parsed)
    assert audit.status == "fail"
    assert next(finding for finding in audit.findings if finding.rule == "selected-logprob").status == "match"
    assert sum(finding.rule.startswith("probability-replay") and finding.status == "mismatch" for finding in audit.findings) == 2


def test_missing_logits_produce_an_unknown_replay_without_mutating_the_row():
    value = receipt_value()
    value["samples"][0]["raw_logits"] = {"kind": "unavailable", "reason": "Not exported."}
    before = deepcopy(value)
    parsed = parse_sampling_receipt(value)
    assert isinstance(replay_sampling_sample(parsed.samples[0]), Unavailable)
    assert audit_sampling_receipts(source=parsed, target=parsed).status == "inconclusive"
    assert value == before


def test_full_distribution_changes_are_detected_when_support_and_selected_logprob_agree():
    source = receipt_value()
    row = source["samples"][0]
    row["support"]["token_ids"] = [0, 1, 2]
    row["raw_logits"]["values"] = [0.0, math.log(2), 0.0]
    row["selected_logprob"]["value"] = -math.log(4)
    target = deepcopy(source)
    target["samples"][0]["raw_logits"]["values"] = [0.0, 0.0, math.log(2)]
    report = audit_sampling_receipts(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert report.status == "fail"
    assert next(finding for finding in report.findings if finding.rule == "replayed-distribution").status == "mismatch"
