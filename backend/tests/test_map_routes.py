"""The site map routes, writing into a temporary folder instead of data/."""
from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.api import map_routes
from backend.api.auth import AUDITOR, OPERATOR, User, current_user
from backend.app import app

client = TestClient(app)


@pytest.fixture
def role(tmp_path, monkeypatch):
    monkeypatch.setattr(map_routes, "DATA_DIR", tmp_path)

    def use(name: str):
        app.dependency_overrides[current_user] = lambda: User(username="u", role=name)
    yield use
    app.dependency_overrides.pop(current_user, None)


def png(width: int, height: int) -> bytes:
    ok, data = cv2.imencode(".png", np.full((height, width, 3), 90, dtype=np.uint8))
    assert ok
    return data.tobytes()


def test_cameras_are_placed_by_name_and_can_be_removed(role):
    role(OPERATOR)
    assert client.get("/api/live/map").json() == {"has_image": False, "image_version": 0, "positions": {}}
    client.put("/api/live/map/positions", json={"name": "Gate 3", "x": 0.25, "y": 0.75})
    assert client.get("/api/live/map").json()["positions"] == {"Gate 3": [0.25, 0.75]}
    client.put("/api/live/map/positions", json={"name": "Gate 3", "x": None, "y": None})
    assert client.get("/api/live/map").json()["positions"] == {}


def test_positions_must_be_inside_the_plan(role):
    role(OPERATOR)
    assert client.put("/api/live/map/positions", json={"name": "A", "x": 1.5, "y": 0.2}).status_code == 422


def test_plan_upload_is_checked_resized_and_served_as_jpeg(role):
    role(OPERATOR)
    assert client.get("/api/live/map/image").status_code == 404
    reply = client.post("/api/live/map/image", files={"file": ("site.png", png(4800, 1200), "image/png")}).json()
    assert reply["image_version"] == 1 and (reply["width"], reply["height"]) == (2400, 600)
    served = client.get("/api/live/map/image")
    assert served.status_code == 200 and served.headers["content-type"] == "image/jpeg"
    assert client.get("/api/live/map").json()["has_image"] is True


def test_non_pictures_are_refused(role):
    role(OPERATOR)
    bad = client.post("/api/live/map/image", files={"file": ("plan.png", b"<script>alert(1)</script>", "image/png")})
    assert bad.status_code == 400


def test_auditors_can_view_but_not_change_the_map(role):
    role(AUDITOR)
    assert client.get("/api/live/map").status_code == 200
    assert client.put("/api/live/map/positions", json={"name": "A", "x": 0.1, "y": 0.1}).status_code == 403
    assert client.post("/api/live/map/image", files={"file": ("s.png", png(10, 10), "image/png")}).status_code == 403
