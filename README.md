# ESP32 Smart Car Dashboard

A production-quality, static web dashboard for controlling and monitoring an ESP32-based smart car over MQTT — live GPS map, ESP32-CAM video, battery, speed gauge, and five ways to drive it (buttons, joystick, keyboard, hand gestures, voice).

**Developer:** Rohan Netane

No build tools, no Node.js, no framework. Pure HTML/CSS/JS, deployable to GitHub Pages as-is.

---

## ⚠️ Read this before you deploy

This dashboard is a **static site** — everything, including your MQTT username and password in `config.js`, ships to the browser in plain text. If you deploy this to a **public** GitHub Pages URL / public repo, anyone can view-source and get your broker credentials.

**Before going live, do one of these:**

1. **(Recommended)** In HiveMQ Cloud → **Access Management**, create a second, restricted user just for this dashboard — subscribe-only on `car/#`, and publish only on `car/control`. Never put your main/admin broker password in client-side code.
2. Keep the GitHub repository **private**, and serve the site somewhere access-controlled instead of public Pages.
3. If credentials are ever accidentally pushed to a public repo, **rotate the password immediately** in HiveMQ Cloud.

---

## 1. Folder Structure

```
ESP32-Car-Dashboard/
├── index.html        # Markup for every panel
├── style.css         # Full design system (HUD / instrument-cluster theme)
├── script.js         # App logic: telemetry, gauges, controls, gestures, voice
├── mqtt.js           # MQTT connection manager (auto-reconnect, pub/sub bus)
├── map.js            # Leaflet live GPS map manager
├── config.js         # ALL editable settings — the only file you usually touch
├── README.md
└── assets/
    ├── icons/
    └── images/
```

---

## 2. Quick Start

1. Open `config.js`.
2. Confirm/update the `MQTT` block (host, port, username, password).
3. Update `CAMERA.STREAM_URL` and `CAMERA.SNAPSHOT_URL` to your ESP32-CAM's actual address (e.g. `http://192.168.1.50:81/stream`).
4. Open `index.html` in a browser (or deploy — see below). That's it — no build step.

> The dashboard works over the **public internet** for MQTT (HiveMQ Cloud is cloud-hosted), but your ESP32-CAM's raw MJPEG stream is normally only reachable on your **local network**, unless you've port-forwarded it or put it behind a tunnel (e.g. ngrok, Cloudflare Tunnel). If the camera panel shows "CAMERA OFFLINE," this is the most common reason.

---

## 3. HiveMQ Cloud Setup

1. Create a free cluster at [hivemq.com/mqtt-cloud-broker](https://www.hivemq.com/mqtt-cloud-broker/).
2. Under **Access Management**, create a client/username + password (this is what goes in `config.js`).
3. Note your cluster's URL — it looks like `xxxxxxxx.s1.eu.hivemq.cloud`.
4. HiveMQ Cloud exposes:
   - Port `8883` — MQTT over TLS (used by native devices like the ESP32)
   - Port `8884` — MQTT over **Secure WebSockets** (used by this browser dashboard)
5. This dashboard connects using `wss://<host>:8884/mqtt` — already wired up in `mqtt.js` / `config.js`.

---

## 4. ESP32 Setup (car side)

Your ESP32 firmware needs to:

1. Connect to WiFi.
2. Connect to the same HiveMQ Cloud broker over **TLS** (port `8883`), using the **same or an equivalent** username/password as the dashboard (or its own restricted publish-only credential).
3. **Publish** to:
   | Topic | Payload example |
   |---|---|
   | `car/status`  | `{"wifi":"online","esp32":"online","command":"forward"}` |
   | `car/gps`     | `{"lat":18.5204,"lng":73.8567,"speed":12.4,"time":"14:22:01","satellites":8,"fix":true}` |
   | `car/battery` | `{"percent":76,"charging":false}` |
   | `car/speed`   | `{"value":24}` |
   | `car/camera`  | `{"status":"online"}` |
4. **Subscribe** to `car/control` and act on incoming JSON:
   ```json
   { "command": "forward" }
   { "command": "speed", "value": 70 }
   ```
   Supported `command` values: `forward`, `backward`, `left`, `right`, `stop`, `speed`.

A minimal Arduino-side sketch would use `PubSubClient` or `WiFiClientSecure` + an MQTT client library, subscribing to `car/control` and publishing sensor JSON on a timer (e.g. every 500 ms–1 s).

---

## 5. Camera Setup (ESP32-CAM)

1. Flash your ESP32-CAM with a standard CameraWebServer-style sketch (Arduino IDE example, or ESP-IDF equivalent) that exposes:
   - An MJPEG stream, typically at `http://<esp32-cam-ip>:81/stream`
   - A snapshot endpoint, typically at `http://<esp32-cam-ip>/capture`
2. Put those exact URLs into `config.js` → `CAMERA.STREAM_URL` / `CAMERA.SNAPSHOT_URL`.
3. The dashboard's `<img>` tag consumes the MJPEG stream directly — no extra libraries needed.
4. If the browser dashboard is on a **different network** than the car (e.g. you're using GitHub Pages from anywhere), the camera IP must be reachable — either port-forward it, or tunnel it (ngrok / Cloudflare Tunnel / Tailscale) and put that public URL in `config.js` instead of a local `192.168.x.x` address.

---

## 6. GPS Setup (NEO-6M)

1. Wire the NEO-6M to your ESP32 UART (e.g. `RX2`/`TX2` on many boards) and parse NMEA sentences with a library such as `TinyGPS++`.
2. Every time you get a fix, publish to `car/gps` with the shape shown in section 4.
3. The dashboard will:
   - Smoothly glide the marker between fixes (no jumpy teleporting)
   - Draw a polyline trail of the last 500 points
   - Auto-center the map on the car unless the user has manually panned (auto-follow can be toggled back on)

---

## 7. GitHub Pages Deployment

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Choose your branch (e.g. `main`) and root folder (`/`).
5. Save — GitHub will publish at `https://<your-username>.github.io/<repo-name>/`.
6. Re-read the security warning at the top of this file before making the repo public.

---

## 8. MQTT Topics Reference

| Direction | Topic | Purpose |
|---|---|---|
| Subscribe | `car/status`  | WiFi/ESP32/command state |
| Subscribe | `car/gps`     | Latitude, longitude, speed, time, satellites, fix |
| Subscribe | `car/battery` | Battery percent + charging flag |
| Subscribe | `car/speed`   | Current speed (km/h) |
| Subscribe | `car/camera`  | Camera online/offline status |
| Publish   | `car/control` | Drive commands: forward / backward / left / right / stop / speed |

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "MQTT OFFLINE" never turns green | Wrong host/port/path, or firewall blocking WebSockets | Confirm port `8884` and path `/mqtt` in `config.js`; check browser console for the exact error |
| Dashboard connects but ESP32 shows "UNKNOWN" | Car firmware isn't publishing to `car/status` | Verify the ESP32 is connected to the broker and publishing on a timer |
| Camera always "OFFLINE" | Stream URL unreachable from the browser's network | Confirm the ESP32-CAM IP is correct and reachable (same network, or tunneled) |
| Map marker doesn't move | No `car/gps` messages, or GPS has no fix | Check `car/gps` payloads in an MQTT client like MQTT Explorer; confirm `fix: true` |
| Gesture control button does nothing | Browser blocked webcam permission, or MediaPipe CDN blocked | Allow camera access; check console for CDN load errors |
| Voice control button is disabled | Browser doesn't support the Web Speech API | Use Chrome or Edge — Firefox/Safari support is limited |
| Joystick / keyboard commands don't reach the car | MQTT not connected, or ESP32 not subscribed to `car/control` | Check the "MQTT" and "ESP32" status chips first |

---

## 10. Credits

- [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) / [CARTO dark tiles](https://carto.com/)
- [MQTT.js](https://github.com/mqttjs/MQTT.js)
- [MediaPipe Hands](https://developers.google.com/mediapipe)
- Web Speech API (browser-native)
