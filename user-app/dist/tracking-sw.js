/**
 * ╔══════════════════════════════════════════════════════════════╗
 *  NIMBUS TRACKING — Service Worker  (tracking-sw.js)
 *  Place this file at the ROOT of your web server:
 *    /public/tracking-sw.js   →   https://yourapp.com/tracking-sw.js
 *
 *  Features:
 *    • Caches the app shell for offline-first loading
 *    • Background Sync: queues location updates when offline and
 *      replays them when connectivity is restored
 *    • Periodic Background Sync: wakes the SW every ~1 min
 *      (Chrome/Android only, requires user permission) to attempt
 *      a position push even when the tab is closed
 *    • Receives PUSH notifications from the server (SOS ack, etc.)
 *    • postMessage bridge so the main thread can pass positions to
 *      the SW for queuing without needing a direct socket
 * ╚══════════════════════════════════════════════════════════════╝
 */

"use strict";

const SW_VERSION   = "nimbus-tracking-v3";
const CACHE_NAME   = `${SW_VERSION}-shell`;
const SYNC_TAG     = "nimbus-location-sync";
const PERIODIC_TAG = "nimbus-periodic-location";

// ── App shell assets to pre-cache ────────────────────────────────────────────
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/tracking-sw.js",
  // Add your bundled JS/CSS here after build
  // "/static/js/main.chunk.js",
  // "/static/css/main.chunk.css",
];

// ── Pending location queue (in SW memory; backed by IndexedDB below) ─────────
// IndexedDB store name
const IDB_NAME  = "nimbus-tracking-db";
const IDB_STORE = "pending-locations";

// ─────────────────────────────────────────────────────────────────────────────
//  LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Install", SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting(); // Activate immediately
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activate", SW_VERSION);
  event.waitUntil(
    Promise.all([
      // Delete old caches
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  FETCH  — Cache-first for shell, network-first for API
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip socket.io / WebSocket upgrades
  if (request.headers.get("upgrade") === "websocket") return;
  // Skip non-GET
  if (request.method !== "GET") return;
  // Skip cross-origin except fonts/CDN
  if (url.origin !== self.location.origin &&
      !url.hostname.includes("unpkg.com") &&
      !url.hostname.includes("tile.openstreetmap.org")) return;

  // OSM tiles — stale-while-revalidate (tiles rarely change)
  if (url.hostname.includes("tile.openstreetmap.org")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // App shell — cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

async function staleWhileRevalidate(request) {
  const cache    = await caches.open("nimbus-tiles-v1");
  const cached   = await cache.match(request);
  const fetchPrm = fetch(request).then((resp) => {
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || (await fetchPrm);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MESSAGE BRIDGE  — main thread → SW
//  Usage from React:
//    navigator.serviceWorker.controller.postMessage({
//      type: 'QUEUE_LOCATION',
//      payload: { lat, lon, accuracy, timestamp, userId, token }
//    })
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("message", async (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case "QUEUE_LOCATION":
      await idbPush(IDB_STORE, payload);
      // Try immediate sync registration (works if online)
      if ("SyncManager" in self) {
        try {
          await self.registration.sync.register(SYNC_TAG);
        } catch {
          // sync not available — will flush on next fetch or periodic sync
          await flushQueue();
        }
      } else {
        await flushQueue(); // Fallback: try right away
      }
      break;

    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "GET_VERSION":
      event.source?.postMessage({ type: "SW_VERSION", version: SW_VERSION });
      break;

    default:
      break;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  BACKGROUND SYNC  — replays queued location updates when back online
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    console.log("[SW] Background Sync fired:", SYNC_TAG);
    event.waitUntil(flushQueue());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PERIODIC BACKGROUND SYNC  — Chrome/Android only, ~1 min interval
//  Allows location push even when the tab is completely closed.
//  The browser only grants this permission for installed PWAs (A2HS) and
//  only when the site has been used recently.
//
//  Register from React with:
//    const reg = await navigator.serviceWorker.ready;
//    await reg.periodicSync.register('nimbus-periodic-location', { minInterval: 60_000 });
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("periodicsync", (event) => {
  if (event.tag === PERIODIC_TAG) {
    console.log("[SW] Periodic Sync fired");
    event.waitUntil(
      (async () => {
        // Request a fresh position from the Geolocation API via the client
        // Note: SW cannot call navigator.geolocation directly;
        // we ask the focused client to provide it via postMessage.
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
        if (clients.length > 0) {
          clients[0].postMessage({ type: "REQUEST_POSITION" });
          // The client will call QUEUE_LOCATION which triggers flushQueue
        } else {
          // No active tab — flush whatever is already in the queue
          await flushQueue();
        }
      })()
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUSH NOTIFICATIONS  — SOS ack, rescue team updates, admin messages
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: "Nimbus Alert", body: event.data?.text() }; }

  const options = {
    body:    data.body  || "Tap to open the app.",
    icon:    "/icon-192.png",
    badge:   "/badge-72.png",
    tag:     data.tag   || "nimbus-push",
    renotify: true,
    data:    { url: data.url || "/" },
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "🏔️ Nimbus SOS", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const match = clients.find((c) => c.url.includes(targetUrl));
      if (match) return match.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  FLUSH QUEUE  — sends pending locations to the tracking server via HTTP
//  We use HTTP POST (not WebSocket) here because the SW lifecycle may
//  not have a live socket connection.  The server stores these updates
//  and forwards them to admins on the next socket emit cycle.
// ─────────────────────────────────────────────────────────────────────────────
async function flushQueue() {
  const pending = await idbGetAll(IDB_STORE);
  if (!pending.length) return;

  // Group by token (user session) to minimise requests
  const byToken = pending.reduce((acc, item) => {
    const key = item.token || "anonymous";
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

  const sent = [];
  for (const [token, items] of Object.entries(byToken)) {
    try {
      const resp = await fetch("http://localhost:5000/api/location-batch", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ locations: items }),
      });
      if (resp.ok) sent.push(...items.map((i) => i._idbKey));
    } catch {
      // Still offline — leave in queue for next sync
    }
  }

  // Remove successfully sent items from IDB
  if (sent.length) await idbRemoveMany(IDB_STORE, sent);
}

// ─────────────────────────────────────────────────────────────────────────────
//  INDEXED DB  HELPERS  (no external dependency needed in SW scope)
// ─────────────────────────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "_idbKey", autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = ()  => reject(req.error);
  });
}

async function idbPush(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).add(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbRemoveMany(store, keys) {
  const db = await openDB();
  const tx  = db.transaction(store, "readwrite");
  const os  = tx.objectStore(store);
  return Promise.all(keys.map((k) => new Promise((res, rej) => {
    const r = os.delete(k);
    r.onsuccess = res; r.onerror = rej;
  })));
}