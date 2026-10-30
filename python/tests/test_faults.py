from dataclasses import replace

import pytest

from avalon_lab.counter import record_counter
from avalon_lab.faults import FAULTS, inject_fault
from avalon_lab.snapshot import encode


@pytest.mark.parametrize("fault", FAULTS)
def test_each_fault_changes_evidence_without_mutating_source(fault):
    source = replace(record_counter(seed=7), stage="recorded")
    original = encode(source)
    corrupted = inject_fault(source, fault=fault)
    assert corrupted.episodes != source.episodes
    assert corrupted.producer["name"] == f"avalon-injected-{fault}"
    assert encode(source) == original
    assert corrupted.seed == source.seed
    assert [episode.id for episode in corrupted.episodes] == [episode.id for episode in source.episodes]
    encode(corrupted)


def test_collapsed_flag_fault_changes_only_the_truncated_ending():
    source = replace(record_counter(seed=7), stage="recorded")
    corrupted = inject_fault(source, fault="collapsed-flags")
    assert corrupted.episodes[0] == source.episodes[0]
    final = corrupted.episodes[1].steps[-1]
    assert final.terminated and not final.truncated


def test_real_user_data_cannot_enter_the_fault_generator():
    source = replace(record_counter(seed=7), stage="recorded", evidence="user-supplied")
    with pytest.raises(ValueError, match="synthetic"):
        inject_fault(source, fault="reward-shift")
