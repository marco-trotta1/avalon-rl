from copy import deepcopy
import json
import os

import pytest

from avalon_lab.sampling import CapturedSupport, Known, Unavailable, audit_sampling_receipts, parse_sampling_receipt, read_sampling_receipt


def receipt_value():
    return {
        "format": "avalon.sampling/v1",
        "producer": {"name": "synthetic", "version": "1", "revision": "fixture-v1"},
        "context_hash": "0" * 64,
        "samples": [{
            "sample_id": "sample-1", "group_id": "group-1", "token_position": 0,
            "sampled_token_id": 0, "role": "policy", "loss_mask": True,
            "selected_logprob": {"kind": "known", "value": -0.6931471805599453},
            "support": {"kind": "captured", "token_ids": [0, 1]},
            "raw_logits": {"kind": "known", "values": [0.0, 0.0, 0.0]}, "processors": [],
        }],
    }


def test_receipt_is_an_immutable_copy_of_input_evidence():
    value = receipt_value()
    parsed = parse_sampling_receipt(value)
    value["samples"][0]["support"]["token_ids"].append(2)
    assert parsed.samples[0].support == CapturedSupport((0, 1))
    assert parsed.samples[0].raw_logits == Known((0.0, 0.0, 0.0))


@pytest.mark.parametrize("field,value", [
    ("sampled_token_id", True), ("token_position", -1), ("loss_mask", 1),
    ("role", []), ("selected_logprob", {"kind": "known", "value": float("nan")}),
    ("selected_logprob", {"kind": "known", "value": 0.1}),
    ("raw_logits", {"kind": "known", "values": [2**53 + 1]}),
    ("support", {"kind": "captured", "token_ids": [0, 0]}),
    ("support", {"kind": "captured", "token_ids": []}),
    ("sample_id", "private\nlabel"),
])
def test_receipt_rejects_lossy_or_malformed_boundary_values(field, value):
    receipt = receipt_value()
    receipt["samples"][0][field] = value
    with pytest.raises(ValueError):
        parse_sampling_receipt(receipt)


def test_unknown_evidence_remains_explicit():
    value = receipt_value()
    value["samples"][0]["support"] = {"kind": "unavailable", "reason": "The sampler does not export the support."}
    assert isinstance(parse_sampling_receipt(value).samples[0].support, Unavailable)


def test_duplicate_token_keys_and_changed_groups_are_rejected():
    value = receipt_value()
    value["samples"].append(deepcopy(value["samples"][0]))
    with pytest.raises(ValueError, match="duplicate"):
        parse_sampling_receipt(value)
    value["samples"][1]["token_position"] = 1
    value["samples"][1]["group_id"] = "different"
    with pytest.raises(ValueError, match="one group"):
        parse_sampling_receipt(value)


def test_file_reader_rejects_duplicate_keys_symlinks_and_named_pipes(tmp_path):
    source = tmp_path / "receipt.json"
    source.write_text(json.dumps(receipt_value()))
    assert len(read_sampling_receipt(source).samples) == 1
    source.write_text('{"format": "one", "format": "two"}')
    with pytest.raises(ValueError, match="duplicate JSON"):
        read_sampling_receipt(source)
    link = tmp_path / "link.json"
    link.symlink_to(source)
    with pytest.raises(OSError):
        read_sampling_receipt(link)
    pipe = tmp_path / "pipe"
    os.mkfifo(pipe)
    with pytest.raises(ValueError, match="regular"):
        read_sampling_receipt(pipe)


def test_support_audit_exposes_a_mismatch_that_selected_logprobs_cannot_reveal():
    source = receipt_value()
    target = deepcopy(source)
    target["samples"][0]["support"]["token_ids"] = [0, 2]
    report = audit_sampling_receipts(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert report.status == "fail"
    statuses = {finding.rule: finding.status for finding in report.findings}
    assert statuses["support"] == "mismatch"
    assert statuses["selected-logprob"] == "match"


def test_alignment_uses_token_keys_and_support_order_has_no_meaning():
    source = receipt_value()
    second = deepcopy(source["samples"][0])
    second["token_position"] = 1
    source["samples"].append(second)
    target = deepcopy(source)
    target["samples"].reverse()
    target["samples"][0]["support"]["token_ids"].reverse()
    assert audit_sampling_receipts(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target)).status == "pass"
    target["samples"][0]["token_position"] = 2
    report = audit_sampling_receipts(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert sum(finding.rule == "coverage" for finding in report.findings) == 2


def test_missing_evidence_is_inconclusive_and_contexts_cannot_be_joined():
    source = receipt_value()
    target = deepcopy(source)
    target["samples"][0]["support"] = {"kind": "unavailable", "reason": "Not captured."}
    assert audit_sampling_receipts(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target)).status == "inconclusive"
    target["context_hash"] = "1" * 64
    report = audit_sampling_receipts(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target))
    assert report.status == "fail"
    assert [finding.rule for finding in report.findings] == ["context"]


def test_support_membership_is_not_proved_by_agreement_between_two_bad_receipts():
    value = receipt_value()
    value["samples"][0]["support"]["token_ids"] = [1, 2]
    parsed = parse_sampling_receipt(value)
    report = audit_sampling_receipts(source=parsed, target=parsed)
    assert report.status == "fail"
    assert sum(finding.rule.startswith("support-membership") and finding.status == "mismatch" for finding in report.findings) == 2


@pytest.mark.parametrize("captured_side", ["source", "target"])
def test_a_captured_membership_violation_is_not_hidden_by_the_other_missing_support(captured_side):
    captured = receipt_value()
    captured["samples"][0]["sampled_token_id"] = 2
    missing = deepcopy(captured)
    missing["samples"][0]["support"] = {"kind": "unavailable", "reason": "The other producer omits the support."}
    source_value, target_value = (captured, missing) if captured_side == "source" else (missing, captured)
    report = audit_sampling_receipts(source=parse_sampling_receipt(source_value), target=parse_sampling_receipt(target_value))
    assert report.status == "fail"
    statuses = {finding.rule: finding.status for finding in report.findings}
    assert statuses[f"support-membership-{captured_side}"] == "mismatch"
    assert statuses["support"] == "unknown"
