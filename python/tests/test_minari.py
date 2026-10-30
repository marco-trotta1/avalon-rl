import os

import minari

from avalon_lab.minari_bridge import collect_counter, export_collected


def test_real_minari_roundtrip_preserves_transitions_and_context(tmp_path):
    previous = os.environ.get("MINARI_DATASETS_PATH")
    source, recorded, path = collect_counter(root=tmp_path, seed=7)
    assert path.exists()
    assert recorded.stage == "recorded"
    assert source.episodes == recorded.episodes
    assert os.environ.get("MINARI_DATASETS_PATH") == previous
    reopened = minari.MinariDataset(path)
    assert export_collected(reopened, seed=7).episodes == source.episodes
    assert recorded.episodes[1].steps[-1].truncated
