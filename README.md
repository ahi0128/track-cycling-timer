# Track Cycling Timer

Mobile-first timing tool for track cycling coaching, especially Team Pursuit.

## V0.1
- Pre-load rider names
- Choose starting leader
- START / STOP
- LAP timing
- CHANGE leader button
- Pull number tracking
- Target lap delta
- Undo last lap
- Local device persistence
- CSV export
- PWA/offline shell

## Intended workflow
1. Enter riders in riding order.
2. Choose the starting leader.
3. Press START.
4. Press LAP at the timing line.
5. Press CHANGE when the lead changes.
6. Export the session as CSV after training.

Each lap stores the leader and pull number active at the moment the lap was recorded.

## Timing architecture
V0.1 uses the browser high-resolution monotonic clock (performance.now). This is suitable for training and workflow validation, but it is not an official competition timing system.

Future BLE versions should timestamp the physical button event on the hardware device itself, then transmit that timestamp to the tablet. This reduces Bluetooth transport jitter.

## Roadmap
### V0.2
- Edit/select next rider instead of only cyclic rotation
- Full change-event log
- Per-rider pull duration and lap statistics
- 4 km Team Pursuit presets
- 250 m / 333.33 m track presets
- Session metadata and notes

### V0.3
- Bluetooth button input
- Configurable button mapping: LAP / CHANGE / START-STOP
- Latency/jitter test mode

### V1 hardware
- BLE handheld timer
- Physical START/STOP, LAP and CHANGE buttons
- Hardware-side monotonic timestamps
- Optional display and battery status

## Installation
This project is a static Progressive Web App. When hosted over HTTPS, open it in Safari on iPhone/iPad and choose Share > Add to Home Screen.

## Data
Session data stays in the browser local storage unless exported manually. CSV export is generated on-device.
