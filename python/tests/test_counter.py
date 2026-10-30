import json
import stat

from gymnasium.utils.env_checker import check_env
import pytest

from avalon_lab.counter import CounterEnv, record_counter
from avalon_lab.snapshot import encode, write_snapshot


def test_gymnasium_checker_and_seeded_recording():
    check_env(CounterEnv(), skip_render_check=True)
    first = record_counter(seed=7)
    assert encode(first) == encode(record_counter(seed=7))
    assert first.episodes[1].steps[-1].truncated
    assert not first.episodes[1].steps[-1].terminated
    assert first.episodes[0].steps[-1].next_observation == 3
    assert first.episodes[0].steps[0].observation != 3


def test_private_output_preserves_existing_file(tmp_path):
    path = tmp_path / "source.json"
    write_snapshot(path, record_counter(seed=7))
    original = path.read_bytes()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert json.loads(original)["format"] == "avalon.snapshot/v1"
    with pytest.raises(FileExistsError):
        write_snapshot(path, record_counter(seed=8))
    assert path.read_bytes() == original
