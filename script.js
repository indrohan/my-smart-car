/**
 * ============================================================================
 *  ESP32 SMART CAR DASHBOARD — MAIN APPLICATION LOGIC
 * ============================================================================
 *  Wires together mqtt.js, map.js and every UI panel: status chips, battery,
 *  speed gauge, control panel, joystick, keyboard, gesture and voice control,
 *  and the ESP32-CAM stream.
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {

  const CFG = window.CAR_CONFIG;

  // ==========================================================================
  // DOM REFERENCES
  // ==========================================================================
  const els = {
    loadingScreen: document.getElementById("loading-screen"),
    app: document.getElementById("app"),

    // Status chips
    wifiStatus: document.getElementById("wifi-status"),
    mqttStatus: document.getElementById("mqtt-status"),
    gpsStatus: document.getElementById("gps-status"),
    cameraStatus: document.getElementById("camera-status"),
    esp32Status: document.getElementById("esp32-status"),
    connQuality: document.getElementById("conn-quality"),
    currentCommand: document.getElementById("current-command"),

    // Battery
    batteryFill: document.getElementById("battery-fill"),
    batteryPercentText: document.getElementById("battery-percent-text"),
    batteryIcon: document.getElementById("battery-icon"),
    batteryWarning: document.getElementById("battery-warning"),
    batteryBolt: document.getElementById("battery-bolt"),

    // Speed gauge
    speedNeedle: document.getElementById("speed-needle"),
    speedDigital: document.getElementById("speed-digital"),
    speedSlider: document.getElementById("speed-slider"),
    speedSliderValue: document.getElementById("speed-slider-value"),

    // GPS panel
    gpsLat: document.getElementById("gps-lat"),
    gpsLng: document.getElementById("gps-lng"),
    gpsSpeedKmh: document.getElementById("gps-speed-kmh"),
    gpsTime: document.getElementById("gps-time"),
    gpsSats: document.getElementById("gps-sats"),
    gpsFix: document.getElementById("gps-fix"),

    // Map controls
    mapContainer: document.getElementById("map"),
    mapPanel: document.getElementById("map-panel"),
    btnAutoFollow: document.getElementById("btn-auto-follow"),
    btnResetView: document.getElementById("btn-reset-view"),
    btnMapFullscreen: document.getElementById("btn-map-fullscreen"),

    // Camera
    cameraImg: document.getElementById("camera-stream"),
    cameraPanel: document.getElementById("camera-panel"),
    cameraLoading: document.getElementById("camera-loading"),
    cameraOfflineMsg: document.getElementById("camera-offline"),
    btnCameraFullscreen: document.getElementById("btn-camera-fullscreen"),
    btnCameraSnapshot: document.getElementById("btn-camera-snapshot"),

    // Control panel
    ctrlButtons: document.querySelectorAll("[data-command]"),
    btnEmergencyStop: document.getElementById("btn-emergency-stop"),

    // Joystick
    joystickBase: document.getElementById("joystick-base"),
    joystickHandle: document.getElementById("joystick-handle"),

    // Gesture control
    gestureVideo: document.getElementById("gesture-video"),
    gestureCanvas: document.getElementById("gesture-canvas"),
    btnGestureStart: document.getElementById("btn-gesture-start"),
    btnGestureStop: document.getElementById("btn-gesture-stop"),
    gestureLabel: document.getElementById("gesture-label"),

    // Voice control
    btnVoiceStart: document.getElementById("btn-voice-start"),
    btnVoiceStop: document.getElementById("btn-voice-stop"),
    voiceTranscript: document.getElementById("voice-transcript"),

    toastContainer: document.getElementById("toast-container")
  };

  // ==========================================================================
  // TOASTS
  // ==========================================================================
  function toast(message, type = "info") {
    const node = document.createElement("div");
    node.className = `toast toast--${type}`;
    node.textContent = message;
    els.toastContainer.appendChild(node);
    requestAnimationFrame(() => node.classList.add("toast--visible"));
    setTimeout(() => {
      node.classList.remove("toast--visible");
      setTimeout(() => node.remove(), 300);
    }, 3200);
  }

  // ==========================================================================
  // STATUS CHIP HELPERS
  // ==========================================================================
  function setChipState(el, state, label) {
    if (!el) return;
    el.dataset.state = state; // "online" | "offline" | "warning" | "stale"
    const labelEl = el.querySelector(".chip-label");
    if (labelEl && label) labelEl.textContent = label;
  }

  const staleTimers = {};
  function markFreshUntilStale(key, el, onlineLabel) {
    setChipState(el, "online", onlineLabel);
    if (staleTimers[key]) clearTimeout(staleTimers[key]);
    staleTimers[key] = setTimeout(() => {
      setChipState(el, "stale", "STALE");
    }, CFG.TELEMETRY.STALE_DATA_MS);
  }

  // ==========================================================================
  // MQTT WIRING
  // ==========================================================================
  let reconnectCount = 0;

  CarMQTT.on("connect", () => {
    setChipState(els.mqttStatus, "online", "MQTT ONLINE");
    setConnQuality("excellent");
    toast("MQTT broker connected", "success");
  });

  CarMQTT.on("reconnect", (attempt) => {
    reconnectCount = attempt;
    setChipState(els.mqttStatus, "warning", `RECONNECTING (${attempt})`);
    setConnQuality("poor");
  });

  CarMQTT.on("close", () => {
    setChipState(els.mqttStatus, "offline", "MQTT OFFLINE");
    setChipState(els.esp32Status, "offline", "ESP32 UNKNOWN");
    setConnQuality("none");
  });

  CarMQTT.on("error", () => {
    setChipState(els.mqttStatus, "offline", "MQTT ERROR");
  });

  CarMQTT.on("message", (topic, payload) => {
    const T = CFG.TOPICS.SUBSCRIBE;
    switch (topic) {
      case T.STATUS:
        handleStatusMessage(payload);
        break;
      case T.GPS:
        handleGpsMessage(payload);
        break;
      case T.BATTERY:
        handleBatteryMessage(payload);
        break;
      case T.SPEED:
        handleSpeedMessage(payload);
        break;
      case T.CAMERA:
        handleCameraMessage(payload);
        break;
      default:
        console.warn("[script.js] message on unhandled topic:", topic);
    }
  });

  function setConnQuality(level) {
    // level: "excellent" | "good" | "poor" | "none"
    const labels = {
      excellent: "SIGNAL: EXCELLENT",
      good: "SIGNAL: GOOD",
      poor: "SIGNAL: POOR",
      none: "SIGNAL: NONE"
    };
    els.connQuality.dataset.level = level;
    els.connQuality.querySelector(".chip-label").textContent = labels[level] || labels.none;
  }

  // ==========================================================================
  // STATUS / TELEMETRY HANDLERS
  // ==========================================================================
  function handleStatusMessage(payload) {
    // Expected shape: { wifi: "online"|"offline", esp32: "online"|"offline",
    //                   command: "forward", gpsFix: true }
    if (!payload || typeof payload !== "object") return;

    if (payload.wifi) {
      setChipState(els.wifiStatus, payload.wifi === "online" ? "online" : "offline",
        payload.wifi === "online" ? "WIFI ONLINE" : "WIFI OFFLINE");
    }
    if (payload.esp32) {
      markFreshUntilStale("esp32", els.esp32Status,
        payload.esp32 === "online" ? "ESP32 ONLINE" : "ESP32 OFFLINE");
    }
    if (payload.command) {
      els.currentCommand.textContent = payload.command.toUpperCase();
    }
  }

  function handleGpsMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    const { lat, lng, speed, time, satellites, fix } = payload;

    if (typeof lat === "number" && typeof lng === "number") {
      els.gpsLat.textContent = lat.toFixed(6);
      els.gpsLng.textContent = lng.toFixed(6);
      CarMap.updatePosition(lat, lng);
      markFreshUntilStale("gps", els.gpsStatus, "GPS ONLINE");
    }
    if (typeof speed === "number") {
      els.gpsSpeedKmh.textContent = speed.toFixed(1);
    }
    if (time) {
      els.gpsTime.textContent = time;
    }
    if (typeof satellites === "number") {
      els.gpsSats.textContent = satellites;
    }
    if (typeof fix !== "undefined") {
      els.gpsFix.textContent = fix ? "3D FIX" : "NO FIX";
      els.gpsFix.dataset.state = fix ? "online" : "offline";
      setChipState(els.gpsStatus, fix ? "online" : "warning", fix ? "GPS ONLINE" : "GPS NO FIX");
    }
  }

  function handleBatteryMessage(payload) {
    let percent;
    let charging = false;

    if (typeof payload === "number") {
      percent = payload;
    } else if (payload && typeof payload === "object") {
      percent = payload.percent;
      charging = !!payload.charging;
    }
    if (typeof percent !== "number" || Number.isNaN(percent)) return;

    percent = Math.max(0, Math.min(100, percent));
    const B = CFG.BATTERY;

    els.batteryFill.style.width = `${percent}%`;
    els.batteryPercentText.textContent = `${Math.round(percent)}%`;

    let colorClass = "battery--red";
    if (percent >= B.GOOD_THRESHOLD) colorClass = "battery--green";
    else if (percent >= B.LOW_THRESHOLD) colorClass = "battery--yellow";

    els.batteryFill.classList.remove("battery--green", "battery--yellow", "battery--red");
    els.batteryFill.classList.add(colorClass);

    els.batteryIcon.classList.toggle("battery-icon--charging", charging);
    els.batteryBolt.style.display = charging ? "block" : "none";

    const isCritical = percent < B.CRITICAL_THRESHOLD && !charging;
    els.batteryWarning.style.display = isCritical ? "flex" : "none";
  }

  let currentSpeedKmh = 0;
  function handleSpeedMessage(payload) {
    let kmh;
    if (typeof payload === "number") {
      kmh = payload;
    } else if (payload && typeof payload === "object") {
      kmh = payload.value ?? payload.speed;
    }
    if (typeof kmh !== "number" || Number.isNaN(kmh)) return;
    animateSpeedGauge(kmh);
  }

  function handleCameraMessage(payload) {
    // Camera status pushed over MQTT (independent of the raw MJPEG stream),
    // e.g. { status: "online" } / { status: "offline" }
    if (payload && payload.status) {
      setChipState(els.cameraStatus, payload.status === "online" ? "online" : "offline",
        payload.status === "online" ? "CAM ONLINE" : "CAM OFFLINE");
    }
  }

  // ==========================================================================
  // SPEED GAUGE (circular, needle animation + digital readout)
  // ==========================================================================
  const GAUGE_MIN_ANGLE = -120; // degrees, matches SVG markup in index.html
  const GAUGE_MAX_ANGLE = 120;

  function kmhToAngle(kmh) {
    const max = CFG.SPEED.MAX_KMH;
    const clamped = Math.max(0, Math.min(max, kmh));
    const ratio = clamped / max;
    return GAUGE_MIN_ANGLE + ratio * (GAUGE_MAX_ANGLE - GAUGE_MIN_ANGLE);
  }

  function animateSpeedGauge(targetKmh) {
    const startKmh = currentSpeedKmh;
    const duration = CFG.SPEED.NEEDLE_SMOOTHING_MS;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const val = startKmh + (targetKmh - startKmh) * eased;
      const angle = kmhToAngle(val);
      els.speedNeedle.setAttribute("transform", `rotate(${angle} 100 100)`);
      els.speedDigital.textContent = Math.round(val);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        currentSpeedKmh = targetKmh;
      }
    }
    requestAnimationFrame(step);
  }

  // Manual speed slider — publishes "speed" commands.
  els.speedSlider.addEventListener("input", () => {
    const val = Number(els.speedSlider.value);
    els.speedSliderValue.textContent = val;
  });
  els.speedSlider.addEventListener("change", () => {
    const val = Number(els.speedSlider.value);
    sendCommand(CFG.COMMANDS.SPEED, val);
  });

  // ==========================================================================
  // COMMAND DISPATCH (shared by buttons, joystick, keyboard, gesture, voice)
  // ==========================================================================
  function sendCommand(command, value) {
    const ok = CarMQTT.publishCommand(command, value);
    if (ok) {
      els.currentCommand.textContent = command.toUpperCase();
      flashActiveButton(command);
    } else {
      toast("Not connected to MQTT — command not sent", "error");
    }
  }

  function flashActiveButton(command) {
    els.ctrlButtons.forEach((btn) => {
      btn.classList.toggle("ctrl-btn--active", btn.dataset.command === command);
    });
    if (command === CFG.COMMANDS.STOP) {
      setTimeout(() => {
        els.ctrlButtons.forEach((btn) => btn.classList.remove("ctrl-btn--active"));
      }, 200);
    }
  }

  // ==========================================================================
  // CONTROL PANEL BUTTONS
  // ==========================================================================
  els.ctrlButtons.forEach((btn) => {
    btn.addEventListener("click", () => sendCommand(btn.dataset.command));
  });

  els.btnEmergencyStop.addEventListener("click", () => {
    sendCommand(CFG.COMMANDS.STOP);
    toast("EMERGENCY STOP sent", "error");
  });

  // ==========================================================================
  // KEYBOARD CONTROL — W A S D, arrow keys, space
  // ==========================================================================
  const keyMap = {
    "w": CFG.COMMANDS.FORWARD, "arrowup": CFG.COMMANDS.FORWARD,
    "s": CFG.COMMANDS.BACKWARD, "arrowdown": CFG.COMMANDS.BACKWARD,
    "a": CFG.COMMANDS.LEFT, "arrowleft": CFG.COMMANDS.LEFT,
    "d": CFG.COMMANDS.RIGHT, "arrowright": CFG.COMMANDS.RIGHT,
    " ": CFG.COMMANDS.STOP
  };
  const heldKeys = new Set();

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!(key in keyMap)) return;
    if (isTypingIntoField(e.target)) return;
    e.preventDefault();
    if (heldKeys.has(key)) return; // avoid key-repeat spam
    heldKeys.add(key);
    sendCommand(keyMap[key]);
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (!(key in keyMap)) return;
    heldKeys.delete(key);
    if (heldKeys.size === 0 && key !== " ") {
      sendCommand(CFG.COMMANDS.STOP);
    }
  });

  function isTypingIntoField(target) {
    const tag = target.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  }

  // ==========================================================================
  // VIRTUAL JOYSTICK — mouse + touch, continuous publish while dragging
  // ==========================================================================
  (function setupJoystick() {
    const base = els.joystickBase;
    const handle = els.joystickHandle;
    const maxRadius = base.clientWidth / 2 - handle.clientWidth / 2;

    let dragging = false;
    let publishTimer = null;
    let lastCommand = null;

    function pointerPos(evt) {
      const rect = base.getBoundingClientRect();
      const point = evt.touches ? evt.touches[0] : evt;
      return {
        x: point.clientX - rect.left - rect.width / 2,
        y: point.clientY - rect.top - rect.height / 2
      };
    }

    function directionFromVector(x, y) {
      if (Math.hypot(x, y) < maxRadius * 0.25) return CFG.COMMANDS.STOP;
      const angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle >= -45 && angle < 45) return CFG.COMMANDS.RIGHT;
      if (angle >= 45 && angle < 135) return CFG.COMMANDS.BACKWARD;
      if (angle >= -135 && angle < -45) return CFG.COMMANDS.FORWARD;
      return CFG.COMMANDS.LEFT;
    }

    function updateHandle(x, y) {
      const dist = Math.min(Math.hypot(x, y), maxRadius);
      const angle = Math.atan2(y, x);
      const clampedX = Math.cos(angle) * dist;
      const clampedY = Math.sin(angle) * dist;
      handle.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
      return { x: clampedX, y: clampedY };
    }

    function startPublishLoop() {
      if (publishTimer) return;
      publishTimer = setInterval(() => {
        if (lastCommand) sendCommand(lastCommand);
      }, 200);
    }
    function stopPublishLoop() {
      clearInterval(publishTimer);
      publishTimer = null;
    }

    function onMove(evt) {
      if (!dragging) return;
      const { x, y } = pointerPos(evt);
      const clamped = updateHandle(x, y);
      const command = directionFromVector(clamped.x, clamped.y);
      if (command !== lastCommand) {
        lastCommand = command;
        sendCommand(command);
      }
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      stopPublishLoop();
      handle.style.transform = "translate(0px, 0px)";
      if (lastCommand !== CFG.COMMANDS.STOP) sendCommand(CFG.COMMANDS.STOP);
      lastCommand = null;
    }

    function onStart(evt) {
      dragging = true;
      startPublishLoop();
      onMove(evt);
    }

    base.addEventListener("mousedown", onStart);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);

    base.addEventListener("touchstart", (e) => { e.preventDefault(); onStart(e); }, { passive: false });
      window.addEventListener("touchmove", (e) => { 
      if (dragging) {
        e.preventDefault(); 
      }
      onMove(e); 
    }, { passive: false });
    window.addEventListener("touchend", onEnd);
  })();

  // ==========================================================================
  // MAP CONTROLS
  // ==========================================================================
  els.btnAutoFollow.addEventListener("click", () => {
    CarMap.toggleAutoFollow();
  });
  document.addEventListener("map:autofollow-changed", (e) => {
    els.btnAutoFollow.classList.toggle("map-btn--active", e.detail.enabled);
    els.btnAutoFollow.querySelector(".map-btn-label").textContent =
      e.detail.enabled ? "Auto-Follow: ON" : "Auto-Follow: OFF";
  });
  els.btnResetView.addEventListener("click", () => CarMap.resetView());
  els.btnMapFullscreen.addEventListener("click", () => CarMap.toggleFullscreen(els.mapPanel));

  // ==========================================================================
  // ESP32-CAM STREAM
  // ==========================================================================
  (function setupCamera() {
    const CAM = CFG.CAMERA;
    let frameWatchdog = null;
    let reconnectTimer = null;

    function markOnline() {
      els.cameraLoading.style.display = "none";
      els.cameraOfflineMsg.style.display = "none";
      setChipState(els.cameraStatus, "online", "CAM ONLINE");
      resetWatchdog();
    }

    function markOffline() {
      els.cameraOfflineMsg.style.display = "flex";
      setChipState(els.cameraStatus, "offline", "CAM OFFLINE");
      scheduleReconnect();
    }

    function resetWatchdog() {
      clearTimeout(frameWatchdog);
      frameWatchdog = setTimeout(markOffline, CAM.FRAME_TIMEOUT_MS);
    }

    function scheduleReconnect() {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(startStream, CAM.RECONNECT_INTERVAL_MS);
    }

    function startStream() {
      els.cameraLoading.style.display = "flex";
      els.cameraOfflineMsg.style.display = "none";
      // Cache-bust so the <img> MJPEG connection is forced to re-establish.
      els.cameraImg.src = `${CAM.STREAM_URL}${CAM.STREAM_URL.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }

    els.cameraImg.addEventListener("load", markOnline);
    els.cameraImg.addEventListener("error", markOffline);

    els.btnCameraFullscreen.addEventListener("click", () => CarMap.toggleFullscreen(els.cameraPanel));

    els.btnCameraSnapshot.addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = `${CAM.SNAPSHOT_URL}${CAM.SNAPSHOT_URL.includes("?") ? "&" : "?"}t=${Date.now()}`;
      link.download = `car-snapshot-${Date.now()}.jpg`;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast("Snapshot requested", "success");
    });

    startStream();
  })();

  // ==========================================================================
  // HAND GESTURE CONTROL (MediaPipe Hands)
  // ==========================================================================
  (function setupGesture() {
    let hands = null;
    let cameraFeed = null;
    let running = false;
    let lastPublish = 0;

    function classifyGesture(landmarks) {
      // landmarks: 21 points, each {x, y, z} normalized to [0, 1]
      // (0,0) is the top-left of the frame.
      const wrist = landmarks[0];
      const middleTip = landmarks[12];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];
      const indexMcp = landmarks[5];

      const fingersExtended = [8, 12, 16, 20].filter((tipIdx) => {
        const tip = landmarks[tipIdx];
        const mcp = landmarks[tipIdx - 2];
        return tip.y < mcp.y; // finger pointing "up" relative to its base joint
      }).length;

      const openPalm = fingersExtended >= 3;
      if (openPalm) return CFG.COMMANDS.STOP;

      // Fist (no fingers extended) — drive forward.
      if (fingersExtended === 0) return CFG.COMMANDS.FORWARD;

      // Index finger only, tilted left/right — steer.
      if (fingersExtended === 1 && indexTip.y < indexMcp.y) {
        const dx = indexTip.x - wrist.x;
        if (dx > 0.12) return CFG.COMMANDS.RIGHT;
        if (dx < -0.12) return CFG.COMMANDS.LEFT;
        return CFG.COMMANDS.FORWARD;
      }

      // Thumb pointing down relative to wrist — reverse.
      if (thumbTip.y > wrist.y + 0.1) return CFG.COMMANDS.BACKWARD;

      return null;
    }

    function onResults(results) {
      const ctx = els.gestureCanvas.getContext("2d");
      ctx.save();
      ctx.clearRect(0, 0, els.gestureCanvas.width, els.gestureCanvas.height);
      ctx.drawImage(results.image, 0, 0, els.gestureCanvas.width, els.gestureCanvas.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        if (window.drawConnectors && window.HAND_CONNECTIONS) {
          window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: "#2dd4f5", lineWidth: 2 });
        }
        if (window.drawLandmarks) {
          window.drawLandmarks(ctx, landmarks, { color: "#ffb020", lineWidth: 1, radius: 3 });
        }

        const gesture = classifyGesture(landmarks);
        if (gesture) {
          els.gestureLabel.textContent = gesture.toUpperCase();
          const now = performance.now();
          if (now - lastPublish > CFG.GESTURE.PUBLISH_INTERVAL_MS) {
            sendCommand(gesture);
            lastPublish = now;
          }
        }
      } else {
        els.gestureLabel.textContent = "NO HAND DETECTED";
      }
      ctx.restore();
    }

    async function start() {
      if (running) return;
      if (typeof Hands === "undefined" || typeof Camera === "undefined") {
        toast("Gesture libraries failed to load — check your connection", "error");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        els.gestureVideo.srcObject = stream;
        await els.gestureVideo.play();
      } catch (err) {
        toast("Webcam permission denied", "error");
        return;
      }

      hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: CFG.GESTURE.MIN_DETECTION_CONFIDENCE,
        minTrackingConfidence: CFG.GESTURE.MIN_TRACKING_CONFIDENCE
      });
      hands.onResults(onResults);

      cameraFeed = new Camera(els.gestureVideo, {
        onFrame: async () => {
          await hands.send({ image: els.gestureVideo });
        },
        width: 320,
        height: 240
      });
      cameraFeed.start();
      running = true;
      els.btnGestureStart.disabled = true;
      els.btnGestureStop.disabled = false;
      toast("Gesture control started", "success");
    }

    function stop() {
      if (!running) return;
      cameraFeed?.stop();
      const stream = els.gestureVideo.srcObject;
      stream?.getTracks().forEach((track) => track.stop());
      els.gestureVideo.srcObject = null;
      running = false;
      els.btnGestureStart.disabled = false;
      els.btnGestureStop.disabled = true;
      els.gestureLabel.textContent = "STOPPED";
      sendCommand(CFG.COMMANDS.STOP);
      toast("Gesture control stopped", "info");
    }

    els.btnGestureStart.addEventListener("click", start);
    els.btnGestureStop.addEventListener("click", stop);
  })();

  // ==========================================================================
  // VOICE CONTROL (Web Speech API)
  // ==========================================================================
  (function setupVoice() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognizer = null;
    let listening = false;

    const phraseMap = [
      { pattern: /forward|go|ahead/, command: CFG.COMMANDS.FORWARD },
      { pattern: /back(ward)?|reverse/, command: CFG.COMMANDS.BACKWARD },
      { pattern: /left/, command: CFG.COMMANDS.LEFT },
      { pattern: /right/, command: CFG.COMMANDS.RIGHT },
      { pattern: /stop|halt|brake/, command: CFG.COMMANDS.STOP }
    ];

    if (!SpeechRecognitionCtor) {
      els.btnVoiceStart.disabled = true;
      els.btnVoiceStart.title = "Web Speech API not supported in this browser";
      return;
    }

    function build() {
      recognizer = new SpeechRecognitionCtor();
      recognizer.lang = CFG.VOICE.LANG;
      recognizer.continuous = CFG.VOICE.CONTINUOUS;
      recognizer.interimResults = CFG.VOICE.INTERIM_RESULTS;

      recognizer.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
        els.voiceTranscript.textContent = `"${transcript}"`;
        const match = phraseMap.find((entry) => entry.pattern.test(transcript));
        if (match) sendCommand(match.command);
      };

      recognizer.onerror = (event) => {
        console.error("[voice] recognition error:", event.error);
        if (event.error === "not-allowed") {
          toast("Microphone permission denied", "error");
          stop();
        }
      };

      recognizer.onend = () => {
        if (listening) recognizer.start(); // keep listening until user stops it
      };
    }

    function start() {
      build();
      recognizer.start();
      listening = true;
      els.btnVoiceStart.disabled = true;
      els.btnVoiceStop.disabled = false;
      els.voiceTranscript.textContent = "Listening…";
      toast("Voice control started", "success");
    }

    function stop() {
      listening = false;
      recognizer?.stop();
      els.btnVoiceStart.disabled = false;
      els.btnVoiceStop.disabled = true;
      els.voiceTranscript.textContent = "Voice control stopped";
      toast("Voice control stopped", "info");
    }

    els.btnVoiceStart.addEventListener("click", start);
    els.btnVoiceStop.addEventListener("click", stop);
  })();

  // ==========================================================================
  // BOOTSTRAP
  // ==========================================================================
  CarMap.init("map");
  CarMQTT.connect();

  // Reveal the dashboard once the map/DOM is ready — small delay lets the
  // loading animation play instead of flashing instantly.
  setTimeout(() => {
    els.loadingScreen.classList.add("loading-screen--hidden");
    els.app.classList.add("app--visible");
    setTimeout(() => CarMap.invalidateSize(), 350);
  }, 900);

  window.addEventListener("resize", () => CarMap.invalidateSize());
});
