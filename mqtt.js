/**
 * ============================================================================
 *  ESP32 SMART CAR DASHBOARD — MQTT CONNECTION MANAGER
 * ============================================================================
 *  Wraps mqtt.js (loaded via CDN in index.html) to provide:
 *    - Connection over Secure WebSockets to HiveMQ Cloud
 *    - Automatic reconnect on network / broker loss
 *    - Topic subscription on connect / reconnect
 *    - A small pub/sub bus (CarMQTT.on / CarMQTT.publishCommand) that the
 *      rest of the dashboard (script.js, map.js) listens to, so no other
 *      file needs to know anything about mqtt.js internals.
 * ============================================================================
 */

const CarMQTT = (() => {

  const cfg = window.CAR_CONFIG.MQTT;
  const topics = window.CAR_CONFIG.TOPICS;

  let client = null;
  let isConnected = false;
  let reconnectAttempts = 0;
  let manuallyDisconnected = false;

  // Simple internal event bus so script.js/map.js can subscribe without
  // touching the mqtt.js client directly.
  const listeners = {
    connect: [],
    reconnect: [],
    close: [],
    error: [],
    message: []   // (topic, payloadObjectOrString)
  };

  function on(eventName, callback) {
    if (!listeners[eventName]) {
      listeners[eventName] = [];
    }
    listeners[eventName].push(callback);
  }

  function emit(eventName, ...args) {
    (listeners[eventName] || []).forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[CarMQTT] listener for "${eventName}" threw:`, err);
      }
    });
  }

  function buildConnectUrl() {
    return `${cfg.PROTOCOL}://${cfg.HOST}:${cfg.PORT}${cfg.PATH}`;
  }

  function buildClientId() {
    const randomSuffix = Math.random().toString(16).slice(2, 10);
    return `${cfg.CLIENT_ID_PREFIX}${randomSuffix}`;
  }

  function connect() {
    if (typeof mqtt === "undefined") {
      console.error("[CarMQTT] mqtt.js library not loaded — check the CDN <script> tag in index.html");
      emit("error", new Error("MQTT library missing"));
      return;
    }

    manuallyDisconnected = false;
    const url = buildConnectUrl();

    client = mqtt.connect(url, {
      username: cfg.USERNAME,
      password: cfg.PASSWORD,
      clientId: buildClientId(),
      clean: cfg.CLEAN_SESSION,
      keepalive: cfg.KEEPALIVE_SECONDS,
      connectTimeout: cfg.CONNECT_TIMEOUT_MS,
      reconnectPeriod: cfg.RECONNECT_PERIOD_MS,
      protocolVersion: 4
    });

    client.on("connect", () => {
      isConnected = true;
      reconnectAttempts = 0;
      console.log("[CarMQTT] connected to broker");
      subscribeAll();
      emit("connect");
    });

    client.on("reconnect", () => {
      reconnectAttempts += 1;
      console.log(`[CarMQTT] reconnecting… attempt ${reconnectAttempts}`);
      emit("reconnect", reconnectAttempts);

      if (
        cfg.MAX_RECONNECT_ATTEMPTS > 0 &&
        reconnectAttempts > cfg.MAX_RECONNECT_ATTEMPTS
      ) {
        console.warn("[CarMQTT] max reconnect attempts reached, stopping client");
        client.end(true);
      }
    });

    client.on("close", () => {
      isConnected = false;
      console.log("[CarMQTT] connection closed");
      emit("close");
    });

    client.on("error", (err) => {
      console.error("[CarMQTT] error:", err);
      emit("error", err);
    });

    client.on("message", (topic, payloadBuffer) => {
      const raw = payloadBuffer.toString();
      let parsed = raw;
      try {
        parsed = JSON.parse(raw);
      } catch (_err) {
        // Payload wasn't JSON — hand back the raw string instead.
        parsed = raw;
      }
      emit("message", topic, parsed);
    });
  }

  function subscribeAll() {
    if (!client) return;
    Object.values(topics.SUBSCRIBE).forEach((topic) => {
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (err) {
          console.error(`[CarMQTT] failed to subscribe to ${topic}`, err);
        } else {
          console.log(`[CarMQTT] subscribed to ${topic}`);
        }
      });
    });
  }

  /**
   * Publish a drive/speed command to the control topic.
   * @param {string} command  e.g. "forward", "stop", "speed"
   * @param {number} [value]  numeric payload for "speed" commands
   */
  function publishCommand(command, value) {
    if (!client || !isConnected) {
      console.warn(`[CarMQTT] cannot publish "${command}" — not connected`);
      return false;
    }
    const payload = { command };
    if (typeof value !== "undefined") {
      payload.value = value;
    }
    client.publish(topics.PUBLISH.CONTROL, JSON.stringify(payload), { qos: 0 });
    return true;
  }

  function disconnect() {
    manuallyDisconnected = true;
    if (client) {
      client.end(true);
    }
    isConnected = false;
  }

  function getStatus() {
    return {
      connected: isConnected,
      reconnectAttempts,
      manuallyDisconnected
    };
  }

  return {
    connect,
    disconnect,
    publishCommand,
    getStatus,
    on
  };
})();
