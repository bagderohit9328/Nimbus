/**
 * useLocationTracking.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom React hook that manages:
 *   • Socket.io connection lifecycle (auth via JWT)
 *   • Geolocation permission state machine
 *   • navigator.geolocation.watchPosition with accuracy filtering
 *   • Background tab detection + Service Worker message bridge
 *   • Periodic SW sync registration
 *   • SOS trigger / cancel
 *
 * Usage:
 *   const tracking = useLocationTracking({ userId, name, token, serverUrl });
 *   tracking.startTracking()   — request permission + begin watching
 *   tracking.stopTracking()    — unwatch + notify server
 *   tracking.triggerSOS(meta)  — broadcast SOS event
 *   tracking.cancelSOS()
 *
 * Returns:
 *   { isTracking, permissionState, position, accuracy, error,
 *     connectionState, sosActive, startTracking, stopTracking,
 *     triggerSOS, cancelSOS, lastUpdateTs }
 *
 * npm install socket.io-client
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

// ── Constants ─────────────────────────────────────────────────────────────────
const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  timeout:            15_000,
  maximumAge:         5_000,
};

// Only emit if moved more than MIN_DISTANCE_M metres OR MIN_INTERVAL_MS elapsed
const MIN_DISTANCE_M  = 5;
const MIN_INTERVAL_MS = 10_000;

// Service Worker registration path (must be at root of origin)
const SW_PATH = "/tracking-sw.js";

// ── Haversine distance (metres) ───────────────────────────────────────────────
function haversineM(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ─────────────────────────────────────────────────────────────────────────────
export function useLocationTracking({
  userId,
  name,
  token,
  serverUrl = "http://localhost:4000",
  onSOSAck,
  onAdminMessage,
  onTokenExpired,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isTracking,       setIsTracking]       = useState(false);
  const [permissionState,  setPermissionState]  = useState("prompt"); // prompt|granted|denied|unsupported
  const [position,         setPosition]         = useState(null);     // { lat, lon }
  const [accuracy,         setAccuracy]         = useState(null);
  const [error,            setError]            = useState(null);
  const [connectionState,  setConnectionState]  = useState("disconnected"); // disconnected|connecting|connected|error
  const [sosActive,        setSosActive]        = useState(false);
  const [lastUpdateTs,     setLastUpdateTs]     = useState(null);
  const [isHttps,          setIsHttps]          = useState(true);
  const [swRegistered,     setSwRegistered]     = useState(false);

  // ── Refs (survive re-renders, no stale closures) ───────────────────────────
  const socketRef      = useRef(null);
  const watchIdRef     = useRef(null);
  const lastPosRef     = useRef(null);
  const lastEmitRef    = useRef(0);
  const heartbeatRef   = useRef(null);
  const swRegRef       = useRef(null);

  // ── HTTPS check ───────────────────────────────────────────────────────────
  useEffect(() => {
    const secure = window.location.protocol === "https:" ||
                   window.location.hostname === "localhost" ||
                   window.location.hostname === "127.0.0.1";
    setIsHttps(secure);
  }, []);

  // ── Check stored permission on mount ──────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setPermissionState("unsupported");
      return;
    }
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      setPermissionState(result.state);
      result.onchange = () => setPermissionState(result.state);
    }).catch(() => {});
  }, []);

  // ── Service Worker registration ────────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_PATH, { scope: "/" })
      .then((reg) => {
        swRegRef.current = reg;
        setSwRegistered(true);
        console.log("[SW] Registered:", reg.scope);

        // Listen for SW messages (e.g., REQUEST_POSITION for periodic sync)
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "REQUEST_POSITION") {
            // SW is asking for a fresh position (periodic sync wake-up)
            navigator.geolocation?.getCurrentPosition((pos) => {
              const payload = buildPayload(pos, userId, token);
              postToSW({ type: "QUEUE_LOCATION", payload });
              emitToSocket(payload);
            }, () => {}, WATCH_OPTIONS);
          }
        });

        // Register Periodic Background Sync if available
        if ("periodicSync" in reg) {
          navigator.permissions.query({ name: "periodic-background-sync" }).then((ps) => {
            if (ps.state === "granted") {
              reg.periodicSync.register("nimbus-periodic-location", { minInterval: 60_000 })
                .then(() => console.log("[SW] Periodic sync registered"))
                .catch(console.warn);
            }
          }).catch(() => {});
        }
      })
      .catch((err) => console.warn("[SW] Registration failed:", err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket.io connection ───────────────────────────────────────────────────
  const connectSocket = useCallback(() => {
    if (socketRef.current?.connected) return;
    if (!token || !userId) return;

    setConnectionState("connecting");
    const socket = io(serverUrl, {
      auth:            { token },
      transports:      ["polling", "websocket"],
      tryAllTransports: true,
      reconnection:    true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      timeout:         10_000,
    });

    socket.on("connect", () => {
      setConnectionState("connected");
      setError(null);
      console.log("[Socket] Connected:", socket.id);
      // Start heartbeat
      heartbeatRef.current = setInterval(() => socket.emit("ping"), 15_000);
    });

    socket.on("disconnect", (reason) => {
      setConnectionState("disconnected");
      clearInterval(heartbeatRef.current);
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      setConnectionState("error");
      const transport = err?.transport || err?.description || "websocket";
      const message = err?.message || String(err) || "Unknown connection error";
      console.error("[Socket] Connect error:", { transport, message, err });
      setError(`Connection failed: ${message}`);

      if (message === "Token expired") {
        clearInterval(heartbeatRef.current);
        socket.disconnect();
        socketRef.current = null;
        onTokenExpired?.();
      }
    });

    socket.on("error", (err) => {
      console.error("[Socket] Server error:", err);
      if (typeof err === "object" && err.message) {
        setError(`Server error: ${err.message}`);
      }
    });

    socket.on("sos-ack", (data) => {
      onSOSAck?.(data);
    });

    socket.on("admin-message", (msg) => {
      onAdminMessage?.(msg);
    });

    socketRef.current = socket;
  }, [token, userId, serverUrl, onSOSAck, onAdminMessage, onTokenExpired]);

  // Auto-request location permission on app load if not yet denied
  useEffect(() => {
    if (permissionState !== "prompt" || !navigator.geolocation || !token || !userId) return;
    // Auto-request location when component mounts and permission is prompt state
    navigator.geolocation.getCurrentPosition(
      () => {
        setPermissionState("granted");
        connectSocket();
      },
      (err) => {
        if (err.code === 1) setPermissionState("denied");
      },
      WATCH_OPTIONS
    );
  }, [permissionState, token, userId, connectSocket]);

  const disconnectSocket = useCallback(() => {
    clearInterval(heartbeatRef.current);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnectionState("disconnected");
  }, []);

  useEffect(() => {
    if (!token || !userId) return;
    if (!isTracking && !sosActive && !socketRef.current) return;

    const shouldReconnect = isTracking || sosActive || socketRef.current?.connected;
    if (!shouldReconnect) return;

    disconnectSocket();
    connectSocket();
  }, [token, userId, isTracking, sosActive, connectSocket, disconnectSocket]);

  // ── Emit helper (throttled + distance-filtered) ───────────────────────────
  const emitToSocket = useCallback((payload) => {
    if (!socketRef.current?.connected) return;
    const now  = Date.now();
    const dist = haversineM(lastPosRef.current, { lat: payload.lat, lon: payload.lon });
    if (dist < MIN_DISTANCE_M && now - lastEmitRef.current < MIN_INTERVAL_MS) return;

    socketRef.current.emit("location-update", payload);
    lastPosRef.current = { lat: payload.lat, lon: payload.lon };
    lastEmitRef.current = now;
    setLastUpdateTs(now);
  }, []);

  // ── Build payload from GeolocationPosition ────────────────────────────────
  function buildPayload(pos, uid, tkn) {
    return {
      lat:       pos.coords.latitude,
      lon:       pos.coords.longitude,
      accuracy:  pos.coords.accuracy,
      heading:   pos.coords.heading,
      speed:     pos.coords.speed,
      timestamp: pos.timestamp,
      userId:    uid,
      token:     tkn,
    };
  }

  // ── Post to Service Worker ─────────────────────────────────────────────────
  function postToSW(message) {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  // ── Handle tab visibility change (background tab) ─────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isTracking && swRegRef.current && "SyncManager" in window) {
        // Register a one-off sync so the SW can flush any pending positions
        swRegRef.current.sync.register("nimbus-location-sync").catch(() => {});
        console.log("[BG] Tab hidden — registered background sync");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isTracking]);

  // ── Start Tracking ─────────────────────────────────────────────────────────
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setPermissionState("unsupported");
      setError("Geolocation is not supported by this browser.");
      return;
    }
    if (!isHttps) {
      setError("Geolocation requires HTTPS. Please use a secure connection.");
      return;
    }

    connectSocket();

    const onSuccess = (pos) => {
      const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
      setPosition({ lat, lon });
      setAccuracy(acc);
      setPermissionState("granted");
      setError(null);
      setIsTracking(true);

      const payload = buildPayload(pos, userId, token);

      // Emit via socket (live)
      emitToSocket(payload);

      // Also queue in SW for background sync fallback
      postToSW({ type: "QUEUE_LOCATION", payload });
    };

    const onError = (err) => {
      const msg = {
        1: "Location permission denied. Please allow access in browser settings.",
        2: "Location unavailable. Check GPS signal.",
        3: "Location request timed out. Try again.",
      }[err.code] || err.message;
      setError(msg);
      setPermissionState(err.code === 1 ? "denied" : permissionState);
      setIsTracking(false);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, WATCH_OPTIONS);
    socketRef.current?.emit("tracking-start");
  }, [connectSocket, emitToSocket, isHttps, permissionState, token, userId]);

  // ── Stop Tracking ──────────────────────────────────────────────────────────
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    socketRef.current?.emit("tracking-stop");
  }, []);

  // ── Trigger SOS ───────────────────────────────────────────────────────────
  const triggerSOS = useCallback((meta = {}) => {
    connectSocket();
    setSosActive(true);
    socketRef.current?.emit("sos-trigger", {
      lat:     position?.lat,
      lon:     position?.lon,
      ...meta,
    });
  }, [connectSocket, position]);

  // ── Cancel SOS ────────────────────────────────────────────────────────────
  const cancelSOS = useCallback(() => {
    setSosActive(false);
    socketRef.current?.emit("sos-cancel");
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopTracking();
      disconnectSocket();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // State
    isTracking,
    permissionState,  // "prompt" | "granted" | "denied" | "unsupported"
    position,         // { lat, lon } | null
    accuracy,         // metres | null
    error,            // string | null
    connectionState,  // "disconnected" | "connecting" | "connected" | "error"
    sosActive,
    lastUpdateTs,
    isHttps,
    swRegistered,

    // Actions
    startTracking,
    stopTracking,
    triggerSOS,
    cancelSOS,

    // Internal refs (for advanced use)
    socket: socketRef,
  };
}
