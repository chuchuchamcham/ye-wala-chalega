# Drishti — AI Video Intelligence for Border Surveillance

Live video analytics on **existing CCTV infrastructure**, built for SIH 2026
(PS #26187, MHA/SSB). Runs on an ordinary CPU — no GPU required.

Two modes, one analysis pipeline:

- **Live Monitor** — continuous camera feeds with real-time detection, alerts
  and an audible siren
- **Forensic Analysis** — upload a recording and search it after the fact

## What it does

| Module | What it finds |
|---|---|
| **Target Person ID** | A specific person, from 1–6 reference photos. Face recognition confirms identity; appearance ReID keeps the lock when the face turns away. |
| **ANPR** | Reads number plates, confirms them across multiple frames, and raises an alarm on a watchlist match. |
| **Restricted Zone** | Warns while someone is still *heading for* a boundary, by extrapolating their track, then sounds the siren when they actually cross it. |
| Behaviour Analytics | Loitering, pacing, sudden direction changes, abnormal speed. |
| Low-Light | Enhances dark footage before analysis. |

Supporting: multi-camera health monitoring with auto-reconnect, evidence
capture (snapshot + surrounding clip), a tamper-evident hash-chained event
log, role-based access control, a phone-as-camera page, and an Android siren
app that buzzes when a threat is detected.

## Setup

Requires **Python 3.11+** and **Node 18+**.

```bash
# 1. Backend
python -m venv .venv
.venv\Scripts\activate          # Windows;  source .venv/bin/activate on Linux/Mac
pip install -r requirements.txt  # ~2GB, mostly PyTorch - be patient

# 2. Frontend
cd frontend && npm install && npm run build && cd ..

# 3. Run
python scripts/serve.py
```

Open **http://127.0.0.1:8000**. The first screen asks you to create an admin
account — there is no default password.

## Testing it

Two cameras start automatically, looping the demo clips in `uploads/`:

- **CAM-01** — a pedestrian scene. Press *Configure*, enable **Target Person
  ID**, and upload a reference photo of the person in the clip. You should get
  `TARGET_CONFIRMED` with a red box and the siren.
- **CAM-02** — a vehicle with plate `TEST123`. Press *Configure*, enable
  **ANPR**, and set the watchlist plate to `TEST123`. You should get
  `PLATE_CONFIRMED` at ~100% and `TARGET_VEHICLE_FOUND`.

Add your own camera with any RTSP URL or a video file path. For an IP camera
of any brand, **Add camera → IP / CCTV → Scan network** finds every ONVIF
camera on this network; pick one, log in with the camera's own username and
password, and Drishti asks the camera for its stream address itself. If
nothing answers, check that ONVIF is switched on in the camera's settings
(some brands ship with it off) and that Windows Firewall allows Python. To
use a phone as a camera, open **Connect Device** — that page needs HTTPS,
which `scripts/make_dev_cert.py` sets up on port 8443.

**Site Map** shows every camera on an uploaded site plan or satellite
picture. Click a camera to place it, drag to adjust. Markers turn red on an
alarm, and arrows trace where a watched person or vehicle was seen across
cameras in the last 30 minutes.

- **CAM-01's restricted zone** is already drawn across the walkway. Watch the
  outline: it turns amber and logs `ZONE_APPROACH` while someone is still
  heading for it, then red with the siren on `ZONE_ENTRY` when they cross.

Both cameras start with their analysis already armed, so Live Monitor has
something to show the moment it boots.

Forensic mode: **Analysis** → upload a video → pick modules → **Results**. The
siren sounds as playback reaches each alert, not when the job finishes.

### Tuning the zone warning

Every threshold is in `ZoneConfig` (`backend/config.py`):

| Setting | Default | Effect |
|---|---|---|
| `approach_prediction_sec` | 2.5 | How far ahead to predict. `0` disables warnings, leaving crossings alone. |
| `approach_grace_frames` | 2 | Frames the prediction must agree before warning. |
| `approach_min_speed_px_per_sec` | 12.0 | Below this is tracker jitter, not approach. |
| `approach_velocity_window_sec` | 1.5 | Baseline for measuring heading. Must exceed the gap between analysed frames. |
| `approach_cooldown_sec` | 20.0 | Minimum gap before the same track warns again. |

```bash
pytest backend/tests -q      # 429 tests
```

### AI Analyst

Turns alarms into short incident briefs, answers operator questions, and
proposes actions that wait for an operator's approval. It never controls the
siren or cameras, and every step it takes goes into the Audit Log. Off by
default; `set DRISHTI_AGENTS=1` (Windows) or `export DRISHTI_AGENTS=1` turns
it on.

Each brief tries these in order and uses the first that answers. Set up any
of them, or none:

| | Needs | Cost |
|---|---|---|
| Claude | `ANTHROPIC_API_KEY` | Paid per use |
| A hosted free tier | `DRISHTI_HOSTED_PROVIDER` = `groq`, `gemini` or `openrouter`, its key (`GROQ_API_KEY`, `GEMINI_API_KEY` or `OPENROUTER_API_KEY`) and `DRISHTI_HOSTED_MODEL` | Free, rate-limited |
| Local model | [Ollama](https://ollama.com), then `ollama pull qwen2.5:3b` | Free, offline, slower on CPU |
| Rules | Nothing | Free, instant; facts only, no Copilot |

Model names on free tiers change often: pick a current one from the
provider's model list (OpenRouter defaults to its `openrouter/free` router).
`DRISHTI_AGENT_MODEL` and `DRISHTI_LOCAL_MODEL` choose other Claude and local
models. Whatever is or isn't set up, alarms work exactly the same.

### Sensors (sensor fusion)

Fence vibration, ground, radar and motion sensors trip on animals and wind.
On the **Sensors** page, link each sensor to a camera. When it trips, Drishti
runs the person and vehicle detector on that camera's frames from 4 seconds
before to 6 seconds after, then:

| Camera result | Event | Siren |
|---|---|---|
| Person or vehicle seen | `SENSOR_ALARM_CONFIRMED` | Yes |
| Camera offline, blocked or not linked | `SENSOR_ALARM_UNVERIFIED` | Yes: an unchecked alarm is never dismissed |
| Nothing seen | `SENSOR_ALARM_UNCONFIRMED` | No; raised to medium on the 3rd trip in 10 minutes |

An **acoustic drone sensor** always sounds (`DRONE_SUSPECTED`): a small drone
is too high and too small for a ground camera to rule out.

Real sensor hardware reports a trip with one request, using the key shown to
admins under **Connect**:

```bash
curl -X POST http://<post-pc>:8000/api/sensors/hook/<sensor-id> -H "X-Sensor-Key: <key>"
```

The same Connect panel has a QR code for a phone page that does this. For a
drone sensor it listens to the microphone and reports a loud, steady hum
held for 1.5 s. That is a stand-in for a real acoustic array, not a drone
classifier. **Test trip** runs the real check and marks every event it
produces as a test.

### Talk-down warnings

Open **Live Monitor → Speaker link** on a phone or PC with a loudspeaker near
the camera, and tap Start speaker. When someone approaches a zone, loiters, a
group gathers, or a sensor alarm is confirmed on that camera, the speaker
sounds two tones and then says, in Hindi and English, "Stop. This is a
restricted border area. You are being watched on camera. Turn back now." It
says this at most once every 20 seconds. **Warn now** plays it on demand. Each
warning is logged as `TALKDOWN_ISSUED`, but only when a speaker is actually
connected.

### Group gathering

`GROUP_GATHERING` (medium) fires when 4 or more people stay in one camera's
view for most of 10 seconds. It fires again only after the group has broken
up for 30 seconds. It needs zone or behaviour analysis on that camera.

### Appearance search

**Appearance Search** finds people and vehicles by description ("person
carrying a blue bag", "white car"). Every tracked person or vehicle leaves its
clearest picture, which CLIP ViT-B/32 indexes on the CPU, at about 90 ms a
picture on a Ryzen 5 5500U. Results are ranked for a person to check; the
page shows the picture each result matched on. It never raises an alarm.
Colours and clothing work well. Small items such as a backpack are often
wrong. Install it once:

```bash
python scripts/download_search_model.py   # about 600 MB into models/clip, then offline
```

### Before a demo or a shift

```bash
python scripts/preflight.py          # every dependency, model, port and the log's integrity
python scripts/network_check.py      # with Drishti running: every connection it makes
```

`preflight.py` prints a tick or a cross per check, with the fix for each
cross; run it the day before and again at the venue with the network cable
out. `network_check.py` watches the running server for a minute and sorts
every remote address into this machine, the local network and the internet.
With cloud AI off, the internet line is empty: Drishti also turns off the
usage statistics the YOLO library would otherwise send (`YOLO_OFFLINE`).

**Audit Log → Shift handover** opens a one-page report of the last 12 hours:
alarms, cameras, AI briefs, decisions, repeats and the log's integrity check.
Print it, or save it as PDF from the browser's print dialog.

The **siren page** shows each alarm's camera picture and, a few seconds
later, its AI brief; both stay up after Silence. It also speaks each alarm after the siren sounds, in Hindi or
English ("CAMERA 01 पर प्रतिबंधित क्षेत्र में घुसपैठ"), using the phone's
own voices, so it works offline. If the phone has no Hindi voice it says so
and speaks English; add Hindi under the phone's text-to-speech settings.

### Measuring accuracy

`scripts/evaluate.py` runs the real pipeline over labelled footage and
reports plates read, people found, crossings caught, false alarms and speed,
split by condition (day, night, ...). The label format is documented at the
top of the script.

```bash
python scripts/evaluate.py                                  # demo clips
python scripts/evaluate.py --labels eval/campus.csv --videos D:/footage
```

`eval/demo_labels.csv` only checks the demo clips, whose ANPR plate is
overlaid. Accuracy claims need labelled real footage.

## Performance

Measured on CPU (no GPU), 960px analysis width:

| | fps |
|---|---|
| Detection + tracking | 10.9 |
| ANPR | 11.0 |
| Target Person ID | 8.4 |
| 4 cameras concurrently | 8.7 each |

Running several analysis cameras at once on one CPU costs each of them frame
rate — stop the ones you are not watching.

## Honest limits

- **ANPR needs plate pixels.** A plate under roughly 100px wide will not be
  read no matter how it is processed. The UI warns when a plate is too small.
  It works at a checkpoint where vehicles approach the camera; it struggles on
  fast, distant, oblique traffic.
- **No GPU acceleration.** DeepStream/TensorRT were designed for and are the
  Phase 2 path, but they are NVIDIA-only and none of this was built or
  measured on that hardware.
- **Appearance search is a ranking, not recognition.** On the demo footage
  colour and clothing queries put the right person first; small objects
  (backpacks) often do not. Nothing has been measured on night or thermal video.
- **The phone drone sensor is a loudness-and-tone rule**, not a trained
  classifier: generators and motorbikes can trip it. A real deployment
  would feed a proper acoustic array into the same hook.
- Model weights in `models/` carry their own licences — YOLOv8n is AGPL-3.0
  (Ultralytics).

## Layout

```
backend/     FastAPI app, analysis pipeline, live camera manager
  modules/   person_id, anpr, zone, behavior, lowlight
  live/      camera manager, event store, evidence recorder
frontend/    React + TypeScript UI
siren-app/   Capacitor Android siren app
scripts/     serve.py, benchmarks, dev certificate
```
