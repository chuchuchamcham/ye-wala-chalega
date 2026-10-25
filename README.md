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

Open **http://127.0.0.1:8000**. There is no sign-in by default: every visitor
acts as a local administrator. Before the server is reachable on a network
you do not fully trust, set `DRISHTI_LOGIN=1`; the first screen then asks you
to create an admin account (there is no default password).

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

A **digging sensor** always sounds too (`DIGGING_SUSPECTED`): a tunnel is
underground. Its phone page reads the phone's motion sensor; lay the phone
flat on the ground or a wall, and it reports at least 5 sharp knocks at a
steady rhythm (0.4–4 s apart), as a shovel, pick or drill makes.

Real sensor hardware reports a trip with one request, using the key shown to
admins under **Connect**:

```bash
curl -X POST http://<post-pc>:8000/api/sensors/hook/<sensor-id> -H "X-Sensor-Key: <key>"
```

The same Connect panel has a QR code for a phone page that does this. For a
drone sensor it listens to the microphone and a small trained classifier
scores each second of sound; it reports when the score stays above 0.5 for
1.5 s. If the model cannot load, the page falls back to the old rule (a loud,
steady hum held for 1.5 s). **Test trip** runs the real check and marks every
event it produces as a test.

**Drone-sound classifier.** 51 features per second of audio (24 mel-band
spectral shape means and spreads, tonality, level steadiness), computed in
the browser from the Web Audio analyser, into a 24-unit neural network. It
runs offline in the phone page; the weights (~15 KB) are inlined in
`backend/static/sensor.html` and kept in `models/drone_audio/model.json`.
Training: `python models/drone_audio/train.py` (about 2 minutes on the CPU),
on part of DADS ([Drone Audio Detection Samples](https://huggingface.co/datasets/geronimobasso/drone-audio-detection-samples),
MIT on Hugging Face; it bundles other datasets with their own terms, some
non-commercial). Data goes in the gitignored `models/drone_audio/data/`:
shards 02 (no-drone), 04, 12 and 30 (drone), about 800 MB. Held-out results,
one-second windows, threshold 0.5:

| Test set | Drone windows | Background windows | Precision | Recall | False alarms |
|---|---|---|---|---|---|
| Held-out shard + blocks (48 kHz-like frames) | 4,623 | 2,394 | 99.5 % | 99.7 % | 0.9 % of background windows |
| Same, shorter frames | 4,623 | 2,394 | 98.7 % | 99.7 % | 2.6 % |
| Validation | 1,867 | 2,428 | 98.4 % | 98.1 % | 1.2 % |

Drone clips mixed into background noise at 10 dB SNR: 99.3 % recall.
**Read these numbers with care.** Test and training clips come from the same
collection: different files, but often the same drones and microphones,
mostly close-up. Nothing has been measured on a real phone at a distance in
open fields, and the background set has no generators, tractors or
motorbikes, which are the likeliest false alarms on the border. Field-test
before trusting it.

### Talk-down warnings

Open **Live Monitor → Speaker link** on a phone or PC with a loudspeaker near
the camera, and tap Start speaker. When someone approaches a zone, loiters, a
group gathers, or a sensor alarm is confirmed on that camera, the speaker
sounds two tones and then says, in Hindi and English, "Stop. This is a
restricted border area. You are being watched on camera. Turn back now." It
says this at most once every 20 seconds. **Warn now** plays it on demand. Each
warning is logged as `TALKDOWN_ISSUED`, but only when a speaker is actually
connected.

### Fog mode

Tick **Fog Mode** in a camera's Configure panel. Frames whose darkest pixels
are lifted toward grey with flat contrast are counted as foggy and cleared
of haze before detection (dark channel prior, plain OpenCV, a few
milliseconds a frame). Clear frames pass through untouched. `FOG_DETECTED`
is logged once per run. Tested on synthetic fog, not yet on real fog footage.

### False-alarm memory

Each alarm in Live Monitor has **False alarm** and **Real** buttons. When the
same camera, alarm type and zone has been marked false twice within an hour
of the same time of day in the last 14 days, a new matching alarm is still
logged and shown as **LIKELY FALSE**, with the reason, but does not sound the
siren. Marking one of them **Real** wipes that pattern. A watched person or
vehicle and suspected sabotage are never silenced. Every verdict goes into
the tamper-evident log as `ALARM_VERDICT`.

### Where to send the patrol

When alerts come from two or more cameras placed on the Site Map in a row,
the map draws an amber line to the likely next camera, and the **Where to
send the patrol** panel says, for example, "Likely next at Gate 3 in about
2 minutes. Send the patrol to Gate 3 now." If no camera lies ahead it says
the path leads into a blind spot and marks the point to cover. It is a
straight-line guess from the last two sightings at the same speed, and the
panel says so.

### Satellite check

**Satellite Check** compares two free Sentinel-2 images of the same box
behind the border and marks what changed on the ground: new paths and
tracks, cleared vegetation, new structures. Cameras cannot see that far.
It aligns the two images, matches their colour, compares the vegetation
index (NDVI) and the colour, and lists each changed area with a reason
("Vegetation cleared, about 12,000 m²"). Two real pairs ship in
`samples/satellite/` (about 5 MB), so it works offline: Khavda in Kutch,
where it finds new solar blocks and a new road in a month, and Attari
farmland at harvest, where almost every field changes. That second one shows
why pairs should be a week or two apart.

A Kashmir pair ships too: Uri in Baramulla district, about 10 km from the
LoC. Each pair also carries two street maps (from OpenStreetMap) showing
where the box is, so the page can show the location offline.

To look at a new place, type its name in **Search any place** (like a map
site's search box), pick a *before* and an *after* date, and press **Get
satellite images**. Drishti looks the place up on OpenStreetMap, finds the
clearest picture within about two weeks of each date, saves the pair and
checks it, in about a minute. This needs the internet; saved pairs don't.

The same fetch works from the command line, for sector HQ, where you can
copy the folder to the post. No account is needed: it uses Element84's
Earth Search catalogue on AWS and reads only the window it needs out of each
image, about 40 MB for a 4 km box. It asks before anything over 300 MB.

```bash
python scripts/fetch_sentinel.py --bbox 69.50,23.99,69.58,24.035 \
    --before 2025-09-25/2025-10-15 --after 2025-11-01/2025-11-30 \
    --name "Khavda" --id khavda
```

Limits: a pixel is 10 m, so it shows paths and clearings, never people.
Clouds block it; the script skips scenes with cloud over the box. A new
picture comes every 5 days at best, so this is a weekly overview, not an
alarm. Harvests, floods and drifting sand also count as change.

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
- **The phone drone classifier is only measured on a public dataset**, not
  in the field (see Sensors). Generators and motorbikes may still trip it,
  and a phone microphone hears a drone only at short range. A real
  deployment would feed a proper acoustic array into the same hook.
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
