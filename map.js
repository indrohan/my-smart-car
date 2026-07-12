/**
 * ============================================================================
 *  ESP32 SMART CAR DASHBOARD — LIVE GPS MAP MANAGER
 * ============================================================================
 *  Leaflet + OpenStreetMap (dark tiles) live tracking:
 *    - Car marker with smooth glide animation between GPS fixes
 *    - Route polyline trail (capped length)
 *    - Auto-follow / manual pan toggle
 *    - Fullscreen + reset-view controls
 * ============================================================================
 */

const CarMap = (() => {

  const cfg = window.CAR_CONFIG.MAP;

  let map = null;
  let carMarker = null;
  let routeLine = null;
  let routePoints = [];
  let autoFollow = cfg.AUTO_FOLLOW_DEFAULT;
  let animationFrame = null;

  const carIcon = L.divIcon({
    className: "car-marker-icon",
    html: `
      <div class="car-marker-pulse"></div>
      <div class="car-marker-dot">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M12 2 L20 20 L12 16 L4 20 Z"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  function init(containerId) {
    map = L.map(containerId, {
      center: [cfg.DEFAULT_LAT, cfg.DEFAULT_LNG],
      zoom: cfg.DEFAULT_ZOOM,
      minZoom: cfg.MIN_ZOOM,
      maxZoom: cfg.MAX_ZOOM,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer(cfg.TILE_URL, {
      attribution: cfg.TILE_ATTRIBUTION,
      maxZoom: cfg.MAX_ZOOM
    }).addTo(map);

    carMarker = L.marker([cfg.DEFAULT_LAT, cfg.DEFAULT_LNG], {
      icon: carIcon,
      zIndexOffset: 1000
    }).addTo(map);

    routeLine = L.polyline([], {
      color: "#2dd4f5",
      weight: 3,
      opacity: 0.65,
      lineJoin: "round"
    }).addTo(map);

    // Any manual drag disables auto-follow until the user resets the view.
    map.on("dragstart", () => {
      setAutoFollow(false);
    });

    return map;
  }

  function setAutoFollow(enabled) {
    autoFollow = enabled;
    document.dispatchEvent(
      new CustomEvent("map:autofollow-changed", { detail: { enabled } })
    );
  }

  function isAutoFollow() {
    return autoFollow;
  }

  function toggleAutoFollow() {
    setAutoFollow(!autoFollow);
    if (autoFollow) {
      recenter();
    }
  }

  function recenter() {
    if (!map || !carMarker) return;
    map.setView(carMarker.getLatLng(), map.getZoom(), { animate: true });
  }

  function resetView() {
    if (!map) return;
    setAutoFollow(true);
    map.flyTo([cfg.DEFAULT_LAT, cfg.DEFAULT_LNG], cfg.DEFAULT_ZOOM, { duration: 0.8 });
  }

  function toggleFullscreen(containerEl) {
    if (!document.fullscreenElement) {
      containerEl.requestFullscreen?.().then(() => {
        setTimeout(() => map.invalidateSize(), 200);
      });
    } else {
      document.exitFullscreen?.().then(() => {
        setTimeout(() => map.invalidateSize(), 200);
      });
    }
  }

  /**
   * Smoothly glide the marker from its current position to a new GPS fix
   * instead of snapping, and extend the route trail.
   */
  function updatePosition(lat, lng) {
    if (!map || !carMarker) return;

    const from = carMarker.getLatLng();
    const to = L.latLng(lat, lng);

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    const durationMs = window.CAR_CONFIG.MAP.MARKER_SMOOTHING_MS;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const easedT = 1 - Math.pow(1 - t, 3); // ease-out cubic

      const lerpLat = from.lat + (to.lat - from.lat) * easedT;
      const lerpLng = from.lng + (to.lng - from.lng) * easedT;
      carMarker.setLatLng([lerpLat, lerpLng]);

      if (autoFollow) {
        map.panTo([lerpLat, lerpLng], { animate: false });
      }

      if (t < 1) {
        animationFrame = requestAnimationFrame(step);
      }
    }
    animationFrame = requestAnimationFrame(step);

    // Extend the route trail, capped to avoid unbounded memory growth.
    routePoints.push([lat, lng]);
    if (routePoints.length > window.CAR_CONFIG.MAP.ROUTE_MAX_POINTS) {
      routePoints.shift();
    }
    routeLine.setLatLngs(routePoints);
  }

  function clearRoute() {
    routePoints = [];
    routeLine.setLatLngs([]);
  }

  function invalidateSize() {
    map?.invalidateSize();
  }

  return {
    init,
    updatePosition,
    recenter,
    resetView,
    toggleFullscreen,
    toggleAutoFollow,
    isAutoFollow,
    clearRoute,
    invalidateSize
  };
})();
