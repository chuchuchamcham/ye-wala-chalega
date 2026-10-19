"""The site map: where each camera is, drawn over a plan of the post.

    GET  /api/live/map              saved positions and whether a plan exists
    PUT  /api/live/map/positions    place (or remove) one camera
    POST /api/live/map/image        upload the site plan or satellite picture
    GET  /api/live/map/image        the plan itself

Positions are keyed by camera name, not id: cameras are registered again
after a restart and get new ids, while the name an operator gave a camera
("Gate 3") stays the same. Coordinates are fractions of the plan's width and
height, so they survive a plan being replaced by a sharper picture.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.api.auth import ADMIN, OPERATOR, User, require_role
from backend.config import DATA_DIR

router = APIRouter(prefix="/api/live/map", tags=["live"])

CAN_EDIT = Depends(require_role(ADMIN, OPERATOR))
MAX_IMAGE_BYTES = 15 * 1024 * 1024
# Long side of the stored plan. Larger adds bytes to every dashboard load
# without making a camera marker any easier to place.
MAX_IMAGE_SIDE = 2400

_lock = threading.Lock()


def _paths() -> tuple[Path, Path]:
    return DATA_DIR / "site_map.json", DATA_DIR / "site_map.jpg"


def _load() -> dict:
    state_path, _ = _paths()
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    state.setdefault("positions", {})
    state.setdefault("image_version", 0)
    return state


def _save(state: dict) -> None:
    state_path, _ = _paths()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    # Write then rename, so a crash mid-write never leaves a half-written map.
    fd, tmp = tempfile.mkstemp(dir=state_path.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, state_path)


class Placement(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    x: float | None = Field(default=None, ge=0.0, le=1.0)
    y: float | None = Field(default=None, ge=0.0, le=1.0)


@router.get("")
def get_map() -> dict:
    with _lock:
        state = _load()
    _, image_path = _paths()
    return {"has_image": image_path.is_file(), "image_version": state["image_version"], "positions": state["positions"]}


@router.put("/positions")
def place(req: Placement, _: User = CAN_EDIT) -> dict:
    """Set a camera's position; send x and y as null to take it off the map."""
    with _lock:
        state = _load()
        if req.x is None or req.y is None:
            state["positions"].pop(req.name, None)
        else:
            state["positions"][req.name] = [round(req.x, 4), round(req.y, 4)]
        _save(state)
    return {"positions": state["positions"]}


@router.post("/image")
async def upload_image(file: UploadFile, _: User = CAN_EDIT) -> dict:
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "the picture is larger than 15 MB; use a smaller export")
    # Decode and re-encode rather than storing the upload as-is: it must
    # really be a picture, and only plain JPEG pixels are ever served back.
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, "that file is not a picture this system can read (use JPG or PNG)")
    height, width = image.shape[:2]
    scale = MAX_IMAGE_SIDE / max(height, width)
    if scale < 1:
        image = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        raise HTTPException(500, "could not save the picture")
    _, image_path = _paths()
    with _lock:
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(encoded.tobytes())
        state = _load()
        state["image_version"] += 1
        _save(state)
    return {"has_image": True, "image_version": state["image_version"], "width": image.shape[1], "height": image.shape[0]}


@router.get("/image")
def get_image() -> FileResponse:
    _, image_path = _paths()
    if not image_path.is_file():
        raise HTTPException(404, "no site plan uploaded yet")
    return FileResponse(image_path, media_type="image/jpeg")
