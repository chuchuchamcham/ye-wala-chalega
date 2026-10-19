"""A brief written from fixed rules, for when no AI model answers.

An operator must never see an empty space where a brief should be. This
writes the same three lines the Supervisor would, from the incident's own
events, instantly and with no model: what happened, the key evidence, and
the standard next step for that kind of event. It explains nothing it
cannot read straight off the events.
"""
from __future__ import annotations

from backend.agent.incidents import RANK

LABELS = {
    "ZONE_ENTRY": "Restricted zone entered",
    "ZONE_APPROACH": "Person heading for the restricted zone",
    "ZONE_EXIT": "Restricted zone left",
    "LONG_DWELL": "Long stay in the zone",
    "LOITERING": "Loitering",
    "TARGET_CONFIRMED": "Watched person identified",
    "TARGET_REACQUIRED": "Watched person seen again",
    "TARGET_LOST": "Watched person lost from view",
    "TARGET_CROSS_CAMERA_MATCH": "Watched person matched on another camera",
    "TARGET_ZONE_INTRUSION": "Watched person inside the restricted zone",
    "TARGET_BEHAVIOR_ALERT": "Suspicious behaviour",
    "TARGET_VEHICLE_FOUND": "Watched vehicle found",
    "TARGET_VEHICLE_REACQUIRED": "Watched vehicle seen again",
    "PLATE_CONFIRMED": "Number plate read",
    "CAMERA_OFFLINE": "Camera went offline",
    "CAMERA_DEGRADED": "Camera feed degraded",
}

# Standard next step by the most serious kind of event, checked in order.
NEXT_STEPS = (
    (("TARGET_ZONE_INTRUSION", "ZONE_ENTRY"),
     "Check the live view of {camera} and send the nearest patrol if the person is still inside the zone."),
    (("TARGET_CONFIRMED", "TARGET_REACQUIRED", "TARGET_CROSS_CAMERA_MATCH"),
     "Verify the match on the evidence clip, then alert the patrol with where the person was last seen."),
    (("TARGET_VEHICLE_FOUND", "TARGET_VEHICLE_REACQUIRED"),
     "Verify the plate on the evidence clip and stop the vehicle at the next checkpoint."),
    (("TARGET_BEHAVIOR_ALERT",),
     "Keep the subject on the live view of {camera} and send a patrol to check on them."),
    (("CAMERA_OFFLINE",),
     "Check the camera's power and cable, and treat activity near {camera} as suspicious until it is back."),
)
DEFAULT_NEXT_STEP = "Review the evidence clip and decide whether to send a patrol."


def _label(event_type: str | None) -> str:
    return LABELS.get(event_type or "", (event_type or "Event").replace("_", " ").capitalize())


def template_brief(incident: dict) -> str:
    """Brief from an incident in the form Incident.for_agent() returns."""
    events = incident.get("events") or []
    camera = incident.get("camera") or "the camera"
    if not events:
        return f"Situation: An alarm was raised on {camera}.\nEvidence: No event details were recorded.\nNext step: {DEFAULT_NEXT_STEP}"

    # The first event at the incident's highest severity is what the alarm was about.
    top_rank = max(RANK.get(e.get("severity"), 0) for e in events)
    top = next(e for e in events if RANK.get(e.get("severity"), 0) == top_rank)
    times = [e["time"] for e in events if e.get("time")]
    span = f" between {times[0]} and {times[-1]}" if len(times) > 1 and times[0] != times[-1] else ""
    count = len(events)
    situation = (
        f"{_label(top.get('type'))} on {camera}"
        + (f" at {top['time']}" if top.get("time") else "")
        + f"; {count} related event{'s' if count != 1 else ''}{span}."
    )

    # One line per kind of event, most serious first, then in the order they
    # first happened. Four people crossing reads as one line, not four.
    groups: dict[str, list[dict]] = {}
    for e in events:
        groups.setdefault(e.get("type") or "", []).append(e)
    ordered = sorted(groups.values(), key=lambda g: (-max(RANK.get(e.get("severity"), 0) for e in g), events.index(g[0])))
    lines = []
    for group in ordered[:4]:
        first = group[0]
        line = f"{first.get('time') or '—'} {_label(first.get('type'))}"
        if len(group) == 1:
            line += f" ({first['reason']})" if first.get("reason") else ""
        else:
            tracks = sorted({e["track_id"] for e in group if e.get("track_id") is not None})
            shown = ", ".join(f"#{t}" for t in tracks[:5]) + (", …" if len(tracks) > 5 else "")
            line += f" ×{len(group)}" + (f" (tracks {shown})" if tracks else "")
        lines.append(line)
    evidence = "; ".join(lines)

    types = {e.get("type") for e in events}
    step = next((text for kinds, text in NEXT_STEPS if types & set(kinds)), DEFAULT_NEXT_STEP)
    return f"Situation: {situation}\nEvidence: {evidence}.\nNext step: {step.format(camera=camera)}"
