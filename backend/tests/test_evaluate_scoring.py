"""Scoring rules for scripts/evaluate.py.

The accuracy report is what we put in front of judges, so the arithmetic
behind it is tested directly: a matching bug here would print a confident,
wrong number.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "evaluate", Path(__file__).resolve().parents[2] / "scripts" / "evaluate.py"
)
evaluate = importlib.util.module_from_spec(_SPEC)
# Dataclasses resolve their module through sys.modules while the class body runs.
sys.modules["evaluate"] = evaluate
_SPEC.loader.exec_module(evaluate)


def test_edit_distance_and_char_accuracy():
    assert evaluate.edit_distance("TEST123", "TEST123") == 0
    assert evaluate.edit_distance("TEST123", "TE5T123") == 1
    assert evaluate.char_accuracy("TEST123", "TE5T123") == pytest.approx(6 / 7)
    assert evaluate.char_accuracy("AB", "WXYZ") == 0.0


def test_one_detection_cannot_satisfy_two_crossings():
    matched, false_alarms = evaluate.match_zone_entries([5.0], [(4.0, 6.0), (4.5, 6.5)], tolerance=0.0)
    assert matched == [5.0, None]
    assert false_alarms == []


def test_entries_outside_every_window_are_false_alarms():
    matched, false_alarms = evaluate.match_zone_entries([2.0, 10.0, 30.0], [(9.0, 11.0)], tolerance=1.0)
    assert matched == [10.0]
    assert false_alarms == [2.0, 30.0]


def test_tolerance_widens_the_window():
    matched, _ = evaluate.match_zone_entries([12.8], [(10.0, 12.0)], tolerance=1.0)
    assert matched == [12.8]


def test_warning_lead_time_uses_same_track_since_its_last_entry():
    events = [
        {"type": "ZONE_APPROACH", "track_id": 1, "timestamp_sec": 1.0},
        {"type": "ZONE_ENTRY", "track_id": 1, "timestamp_sec": 3.0},
        {"type": "ZONE_APPROACH", "track_id": 2, "timestamp_sec": 9.5},  # other track: ignored
        {"type": "ZONE_APPROACH", "track_id": 1, "timestamp_sec": 8.0},
        {"type": "ZONE_ENTRY", "track_id": 1, "timestamp_sec": 10.0},
    ]
    assert evaluate.warning_lead_times(events, [3.0, 10.0]) == [2.0, 2.0]


def test_labels_reject_rows_the_scorer_cannot_use(tmp_path):
    bad = tmp_path / "labels.csv"
    bad.write_text("clip,module,expected\nclip.mp4,zone,entry\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="zone needs a zone JSON"):
        evaluate.read_labels(bad)


def test_labels_skip_comments_and_group_runs(tmp_path):
    labels_file = tmp_path / "labels.csv"
    labels_file.write_text(
        "# comment\n"
        "clip,module,expected,start_sec,end_sec,reference,zone,lowlight,condition\n"
        "a.mp4,anpr,TEST123,,,,,no,day\n"
        "a.mp4,anpr,ABC999,,,,,no,day\n"
        "a.mp4,person_id,present,,,refs,,yes,night\n",
        encoding="utf-8",
    )
    labels = evaluate.read_labels(labels_file)
    assert [lab.line for lab in labels] == [3, 4, 5]
    runs = evaluate.group_runs(labels)
    assert len(runs) == 2
    assert len(runs[0].labels) == 2 and runs[1].lowlight is True
