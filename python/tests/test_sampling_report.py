from copy import deepcopy
from dataclasses import FrozenInstanceError
import json
import stat

import pytest

from avalon_lab.sampling import audit_sampling_receipts, parse_sampling_receipt
from avalon_lab.sampling_report import (
    sampling_group_reports, sampling_receipt_dict, sampling_report_dict, sampling_witness_dict, write_sampling_json,
)
from avalon_lab.sampling_witness import sampling_gradient_witness, sampling_receipt_fingerprint
from test_sampling import receipt_value


def test_public_report_preserves_results_without_raw_token_or_sample_evidence():
    value = receipt_value()
    value["samples"][0]["sample_id"] = "private-sample-label"
    value["samples"][0]["group_id"] = "private-group-label"
    source = parse_sampling_receipt(value)
    target_value = deepcopy(value)
    target_value["samples"][0]["support"]["token_ids"] = [0, 2]
    report = sampling_report_dict(source=source, target=parse_sampling_receipt(target_value))
    payload = json.dumps(report, allow_nan=False)
    assert report["status"] == "fail"
    for raw_field in ("private-sample-label", "private-group-label", "raw_logits", "sampled_token_id", "source_support"):
        assert raw_field not in payload
    assert report["groups"][0]["status"] == "fail"


def test_group_reports_are_immutable_and_do_not_merge_distinct_groups():
    value = receipt_value()
    row = deepcopy(value["samples"][0])
    row["sample_id"] = "sample-2"
    row["group_id"] = "group-2"
    value["samples"].append(row)
    parsed = parse_sampling_receipt(value)
    groups = sampling_group_reports(source=parsed, target=parsed, audit=audit_sampling_receipts(source=parsed, target=parsed))
    assert len(groups) == 2
    assert all(group.source_samples == 1 and group.source_tokens == 1 for group in groups)
    assert groups[0].group_ref != groups[1].group_ref
    with pytest.raises(FrozenInstanceError):
        groups[0].status = "fail"


def test_minimum_private_witness_replays_the_same_selected_gradient():
    value = receipt_value()
    unrelated = deepcopy(value["samples"][0])
    unrelated["sample_id"] = "unrelated-private-evidence"
    value["samples"].append(unrelated)
    source = parse_sampling_receipt(value)
    target_value = deepcopy(value)
    target_value["samples"][0]["support"]["token_ids"] = [0, 2]
    target = parse_sampling_receipt(target_value)
    witness = sampling_witness_dict(source=source, target=target, key=("sample-1", 0))
    assert witness["kind"] == "available"
    assert "unrelated-private-evidence" not in json.dumps(witness)
    before = parse_sampling_receipt(witness["source_receipt"])
    after = parse_sampling_receipt(witness["target_receipt"])
    replay = sampling_gradient_witness(source=before, target=after, key=("sample-1", 0))
    assert replay.gradient_l1_difference == pytest.approx(witness["claim"]["gradient_l1_difference"], abs=1e-12)
    assert witness["claim"]["source_receipt_sha256"] == sampling_receipt_fingerprint(source)
    assert witness["source_minimum_sha256"] == sampling_receipt_fingerprint(before)


def test_receipt_serialization_is_an_exact_boundary_roundtrip():
    source = parse_sampling_receipt(receipt_value())
    assert parse_sampling_receipt(json.loads(json.dumps(sampling_receipt_dict(source)))) == source


def test_reduced_receipt_with_a_processor_is_directly_parseable():
    value = receipt_value()
    value["samples"][0]["processors"] = [{"name": "temperature", "value": 2.0, "token_ids": []}]
    source = parse_sampling_receipt(value)
    witness = sampling_witness_dict(source=source, target=source, key=("sample-1", 0))
    assert parse_sampling_receipt(witness["source_receipt"]) == source
    assert isinstance(witness["claim"]["source_gradient"], list)


def test_private_outputs_do_not_overwrite_or_follow_paths(tmp_path):
    output = tmp_path / "report.json"
    write_sampling_json(output, {"result": "synthetic"})
    assert stat.S_IMODE(output.stat().st_mode) == 0o600
    with pytest.raises(FileExistsError):
        write_sampling_json(output, {"result": "different"})
    link = tmp_path / "link"
    link.symlink_to(output)
    with pytest.raises(FileExistsError):
        write_sampling_json(link, {})
    assert json.loads(output.read_text()) == {"result": "synthetic"}


def test_unknown_witness_and_nonfinite_output_remain_explicit(tmp_path):
    parsed = parse_sampling_receipt(receipt_value())
    witness = sampling_witness_dict(source=parsed, target=parsed, key=("absent", 0))
    assert witness["kind"] == "unavailable"
    with pytest.raises(ValueError):
        write_sampling_json(tmp_path / "bad.json", {"bad": float("nan")})
    assert not (tmp_path / "bad.json").exists()
