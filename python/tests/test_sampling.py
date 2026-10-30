from copy import deepcopy
import json
import os

import pytest

from avalon_lab.sampling import CapturedSupport, Known, Unavailable, parse_sampling_receipt, read_sampling_receipt


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
