/**
 * ============================================================================
 *  ESP32 SMART CAR DASHBOARD — CONFIGURATION
 *  Developer: Rohan Netane
 * ============================================================================
 *  Every editable value for the entire dashboard lives in this ONE file.
 *  Nothing else in the project should hardcode a host, topic, or default —
 *  script.js, mqtt.js and map.js all read from window.CAR_CONFIG.
 *
 *  ⚠️  SECURITY WARNING — READ THIS BEFORE DEPLOYING TO GITHUB PAGES  ⚠️
 *  --------------------------------------------------------------------------
 *  This is a static site. There is no server, no build step, and no way to
 *  hide a secret in client-side JavaScript. If you publish this repo (or its
 *  GitHub Pages site) publicly, ANYONE can open browser dev tools or view
 *  this file directly and read your MQTT_USERNAME and MQTT_PASSWORD.
 *
 *  Before going live, do ONE of the following:
 *    1. In HiveMQ Cloud → Access Management, create a SEPARATE, low-privilege
 *       user for this dashboard that can only SUBSCRIBE to "car/#" and
 *       PUBLISH to "car/control" — never reuse your admin/broker password.
 *    2. Keep the GitHub repo PRIVATE and only deploy the site somewhere
 *       access-controlled (not public GitHub Pages).
 *    3. Rotate the password immediately if this file is ever committed to a
 *       public repository.
 *
 *  The credentials below are filled in exactly as provided. Swap them for a
 *  restricted-scope user before sharing this link with anyone.
 * ============================================================================
 */

window.CAR_CONFIG = {

  // ---------------------------------------------------------------------
  // MQTT BROKER (HiveMQ Cloud — MQTT over Secure WebSockets)
  // ---------------------------------------------------------------------
  MQTT: {
    HOST: "a1b554412037410aa86cb8f058a66112.s1.eu.hivemq.cloud",
    PORT: 8884,                     // WebSocket Secure (WSS) port
    PROTOCOL: "wss",                // wss = MQTT over TLS WebSocket
    PATH: "/mqtt",                  // HiveMQ Cloud WebSocket path
    USERNAME: "rohan_netane",
    PASSWORD: "Rohan@123",
    CLIENT_ID_PREFIX: "esp32-dashboard-",   // a random suffix is appended at runtime
    CLEAN_SESSION: true,
    KEEPALIVE_SECONDS: 30,
    CONNECT_TIMEOUT_MS: 8000,
    RECONNECT_PERIOD_MS: 4000,      // mqtt.js will retry at this interval
    MAX_RECONNECT_ATTEMPTS: 0       // 0 = unlimited automatic reconnects
  },

  // ---------------------------------------------------------------------
  // MQTT TOPICS
  // ---------------------------------------------------------------------
  TOPICS: {
    SUBSCRIBE: {
      STATUS:   "car/status",
      GPS:      "car/gps",
      BATTERY:  "car/battery",
      SPEED:    "car/speed",
      CAMERA:   "car/camera"
    },
    PUBLISH: {
      CONTROL:  "car/control"
    }
  },

  // ---------------------------------------------------------------------
  // SUPPORTED DRIVE COMMANDS — published as { "command": "<value>" }
  // ---------------------------------------------------------------------
  COMMANDS: {
    FORWARD:  "forward",
    BACKWARD: "backward",
    LEFT:     "left",
    RIGHT:    "right",
    STOP:     "stop",
    SPEED:    "speed"     // paired with a numeric "value" field
  },

  // ---------------------------------------------------------------------
  // ESP32-CAM
  // ---------------------------------------------------------------------
  CAMERA: {
    // Point this at your ESP32-CAM stream, e.g. "http://192.168.1.50:81/stream"
    STREAM_URL: "http://192.168.1.50:81/stream",
    SNAPSHOT_URL: "http://192.168.1.50/capture",
    RECONNECT_INTERVAL_MS: 5000,
    FRAME_TIMEOUT_MS: 6000   // if no frame refresh in this window, mark "offline"
  },

  // ---------------------------------------------------------------------
  // MAP (Leaflet + OpenStreetMap)
  // ---------------------------------------------------------------------
  MAP: {
    DEFAULT_LAT: 18.5204,
    DEFAULT_LNG: 73.8567,
    DEFAULT_ZOOM: 17,
    MIN_ZOOM: 3,
    MAX_ZOOM: 19,
    AUTO_FOLLOW_DEFAULT: true,
    MARKER_SMOOTHING_MS: 600,     // marker glide duration between GPS fixes
    ROUTE_MAX_POINTS: 500,        // cap on polyline history to avoid memory growth
    TILE_URL: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },

  // ---------------------------------------------------------------------
  // SPEED GAUGE
  // ---------------------------------------------------------------------
  SPEED: {
    DEFAULT_KMH: 0,
    MAX_KMH: 60,
    DEFAULT_PUBLISH_VALUE: 50,   // default value on the manual speed slider
    NEEDLE_SMOOTHING_MS: 300
  },

  // ---------------------------------------------------------------------
  // BATTERY THRESHOLDS (percent)
  // ---------------------------------------------------------------------
  BATTERY: {
    GOOD_THRESHOLD: 60,     // >= this  -> green
    LOW_THRESHOLD: 25,      // >= this and < GOOD -> yellow, below -> red
    CRITICAL_THRESHOLD: 15  // below this triggers the low-battery warning banner
  },

  // ---------------------------------------------------------------------
  // CONNECTION / TELEMETRY TIMEOUTS
  // ---------------------------------------------------------------------
  TELEMETRY: {
    STALE_DATA_MS: 8000    // if no message on a topic in this window, mark stale
  },

  // ---------------------------------------------------------------------
  // GESTURE CONTROL (MediaPipe Hands)
  // ---------------------------------------------------------------------
  GESTURE: {
    PUBLISH_INTERVAL_MS: 250,   // throttle outgoing commands while a gesture holds
    MIN_DETECTION_CONFIDENCE: 0.7,
    MIN_TRACKING_CONFIDENCE: 0.6
  },

  // ---------------------------------------------------------------------
  // VOICE CONTROL (Web Speech API)
  // ---------------------------------------------------------------------
  VOICE: {
    LANG: "en-US",
    CONTINUOUS: true,
    INTERIM_RESULTS: false
  }
};
