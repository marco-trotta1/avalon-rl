from copy import deepcopy

import pytest

from avalon_lab.sampling import audit_sampling_receipts, parse_sampling_receipt
from test_sampling import receipt_value


def as_role(value, role, *, active=False):
    value = deepcopy(value)
    row = value["samples"][0]
    row["role"] = role
    row["loss_mask"] = active
    for field in ("raw_logits", "selected_logprob", "support"):
        row[field] = {"kind": "unavailable", "reason": "This token is not sampled from a policy."}
    return value


@pytest.mark.parametrize("role", ["tool", "context", "padding"])
def test_excluded_nonpolicy_tokens_need_no_probability_fiction(role):
    receipt = parse_sampling_receipt(as_role(receipt_value(), role))
    audit = audit_sampling_receipts(source=receipt, target=receipt)
    assert audit.status == "pass"
    assert not any(finding.rule == "selected-logprob" for finding in audit.findings)


@pytest.mark.parametrize("role", ["tool", "context", "padding"])
def test_two_matching_bad_nonpolicy_masks_still_fail(role):
    receipt = parse_sampling_receipt(as_role(receipt_value(), role, active=True))
    audit = audit_sampling_receipts(source=receipt, target=receipt)
    assert audit.status == "fail"
    assert sum(finding.rule.startswith("loss-role") and finding.status == "mismatch" for finding in audit.findings) == 2


def test_masked_policy_tokens_still_preserve_the_captured_sampling_evidence():
    value = receipt_value()
    value["samples"][0]["loss_mask"] = False
    source = parse_sampling_receipt(value)
    assert audit_sampling_receipts(source=source, target=source).status == "pass"
    target = deepcopy(value)
    target["samples"][0]["support"]["token_ids"] = [0, 2]
    assert audit_sampling_receipts(source=source, target=parse_sampling_receipt(target)).status == "fail"


def test_role_changes_and_loss_mask_changes_are_localized_separately():
    source = parse_sampling_receipt(receipt_value())
    target = parse_sampling_receipt(as_role(receipt_value(), "tool"))
    audit = audit_sampling_receipts(source=source, target=target)
    statuses = {finding.rule: finding.status for finding in audit.findings}
    assert statuses["role"] == "mismatch"
    assert statuses["loss-mask"] == "mismatch"
    assert "support" not in statuses


def test_nonpolicy_rows_cannot_disappear_at_a_pipeline_boundary():
    value = receipt_value()
    tool = as_role(receipt_value(), "tool")["samples"][0]
    tool["token_position"] = 1
    value["samples"].append(tool)
    audit = audit_sampling_receipts(source=parse_sampling_receipt(value), target=parse_sampling_receipt(receipt_value()))
    assert audit.status == "fail"
    assert any(finding.rule == "coverage" and finding.key == ("sample-1", 1) for finding in audit.findings)


def test_inactive_policy_tokens_do_not_require_fabricated_probability_evidence():
    value = receipt_value()
    row = value["samples"][0]
    row["loss_mask"] = False
    for field in ("raw_logits", "selected_logprob", "support"):
        row[field] = {"kind": "unavailable", "reason": "This policy token does not contribute to the update."}
    parsed = parse_sampling_receipt(value)
    assert audit_sampling_receipts(source=parsed, target=parsed).status == "pass"
