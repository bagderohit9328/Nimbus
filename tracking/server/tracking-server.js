/**
 * ╔══════════════════════════════════════════════════════════════╗
 *  NIMBUS MOUNTAIN SOS — Real-Time Location Tracking Server
 *  Stack : Node.js · Express · Socket.io · (Redis-ready)
 *  HTTPS : Required by browsers for Geolocation API.
 *          In production wrap with nginx TLS or use
 *          `https.createServer({ key, cert }, app)` here.
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * npm install express socket.io cors dotenv jsonwebtoken
 * Optional Redis: npm install ioredis  (see REDIS SECTION below)
 *
 * ENV VARS (.env):
 *   PORT=4000
 *   JWT_SECRET=your-secret-here
 *   CORS_ORIGIN=https://your-user-app.com,https://your-admin-app.com
 *   USE_REDIS=false          ← set true to enable Redis state
 *   REDIS_URL=redis://127.0.0.1:6379
 */

"use strict";
require("dotenv").config();

const express   = require("express");
const http      = require("http");
const { Server } = require("socket.io");
const cors      = require("cors");
const jwt       = require("jsonwebtoken");

// ─── Constants ───────────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 4000;
const JWT_SECRET  = process.env.JWT_SECRET || "nimbus-dev-secret-change-in-prod";
const BACKEND_API_URL = process.env.BACKEND_API_URL || "http://localhost:5000/api";
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:4173").split(",");
const USE_REDIS   = process.env.USE_REDIS === "true";
const STALE_MS    = 30_000;  // mark user inactive after 30 s of no ping
const MAX_TRAIL   = 50;      // max trail points kept per user

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Health-check endpoint (useful for load balancers / uptime monitors)
app.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// Minimal token-issue endpoint for demo purposes.
// Replace with your real auth system (Firebase Auth, Passport, etc.)
app.post("/auth/token", (req, res) => {
  const { userId, name, role } = req.body;
  if (!userId || !name) return res.status(400).json({ error: "userId and name required" });
  const token = jwt.sign({ userId, name, role: role || "user" }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

app.post("/api/location-batch", (req, res) => {
  const authHeader = req.header("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "AUTH_MISSING", message: "Bearer token required" });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "AUTH_INVALID", message: err.message });
  }

  const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
  if (!locations.length) return res.status(400).json({ error: "LOCATIONS_REQUIRED", message: "locations array required" });

  let accepted = 0;
  for (const payload of locations) {
    if (applyLocationUpdate(decoded.userId, decoded.name, decoded.role || "user", payload)) {
      accepted += 1;
    }
  }

  if (!accepted) return res.status(400).json({ error: "NO_VALID_LOCATIONS", message: "No valid positions were accepted" });
  res.json({ ok: true, accepted });
});

const server = http.createServer(app);

// ─── Socket.io setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"], credentials: true },
  pingTimeout: 20_000,
  pingInterval: 10_000,
  transports: ["websocket", "polling"],
});

// ═══════════════════════════════════════════════════════════════════════════════
//  IN-MEMORY STATE
//  Replace with Redis for multi-process / multi-server deployments.
//  See REDIS SECTION at bottom of this file.
// ═══════════════════════════════════════════════════════════════════════════════
const onlineUsers = new Map();
/*
  onlineUsers key  : userId  (string)
  onlineUsers value: {
    socketId  : string,
    userId    : string,
    name      : string,
    role      : string,
    lat       : number,
    lon       : number,
    accuracy  : number,
    heading   : number | null,
    speed     : number | null,
    battery   : number | null,
    isTracking: boolean,
    sosActive : boolean,
    trail     : Array<{lat,lon,ts}>,
    connectedAt: Date,
    lastSeen  : Date,
  }
*/

// ─── JWT middleware for Socket.io ─────────────────────────────────────────────
io.use((socket, next) => {
  // Admin clients can connect without JWT by providing isAdmin=true query parameter
  const isAdmin = socket.handshake.query?.isAdmin === "true";
  if (isAdmin) {
    socket.data.userId = "admin";
    socket.data.name   = "Admin";
    socket.data.role   = "admin";
    console.log("[Auth] Admin client connected via query parameter");
    return next();
  }

  // Regular users must provide a valid JWT token
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    console.warn("[Auth] Connection rejected: no token provided");
    return next(new Error("No JWT token provided"));
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.data.userId = decoded.userId;
    socket.data.name   = decoded.name;
    socket.data.role   = decoded.role || "user";
    console.log(`[Auth] User token verified: ${decoded.userId} (${decoded.name})`);
    next();
  } catch (err) {
    console.error("[Auth] Token verification failed:", err.message);
    const errorMsg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    next(new Error(errorMsg));
  }
});

// ─── Connection handler ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const { userId, name, role } = socket.data;
  console.log(`[+] ${role.toUpperCase()} connected | ${name} (${userId}) | socket ${socket.id}`);

  // ── Admins join the admin room and get current snapshot ──────────────────
  if (role === "admin") {
    socket.join("admin-room");
    // Send full current state immediately so admin map populates on connect
    const snapshot = buildSnapshot();
    socket.emit("state-snapshot", snapshot);
    console.log(`    ↳ admin joined admin-room, sent snapshot (${snapshot.length} users)`);
    return; // admins don't need the rest of the user handlers
  }

  // ── User: register presence ───────────────────────────────────────────────
  const existing = onlineUsers.get(userId);
  const entry = {
    socketId:   socket.id,
    userId,
    name,
    role,
    lat:        existing?.lat        ?? null,
    lon:        existing?.lon        ?? null,
    accuracy:   existing?.accuracy   ?? null,
    heading:    existing?.heading    ?? null,
    speed:      existing?.speed      ?? null,
    battery:    existing?.battery    ?? null,
    isTracking: false,
    sosActive:  existing?.sosActive  ?? false,
    trail:      existing?.trail      ?? [],
    connectedAt: new Date(),
    lastSeen:   new Date(),
  };
  onlineUsers.set(userId, entry);
  broadcastToAdmins("user-connected", sanitize(entry));

  // ── location-update ────────────────────────────────────────────────────────
  // Payload: { lat, lon, accuracy, heading?, speed?, battery?, timestamp }
  socket.on("location-update", (payload) => {
    if (!validateLocation(payload)) {
      socket.emit("error", { code: "BAD_LOCATION", message: "Invalid lat/lon" });
      return;
    }
    applyLocationUpdate(userId, name, role, payload);
  });

  // ── tracking-start / tracking-stop ────────────────────────────────────────
  socket.on("tracking-start", () => {
    const user = onlineUsers.get(userId);
    if (user) { user.isTracking = true; user.lastSeen = new Date(); }
    broadcastToAdmins("tracking-status", { userId, isTracking: true });
    if (user) void persistUserSnapshot(user, { status: "active" });
    console.log(`[T] ${name} started tracking`);
  });

  socket.on("tracking-stop", () => {
    const user = onlineUsers.get(userId);
    if (user) { user.isTracking = false; }
    broadcastToAdmins("tracking-status", { userId, isTracking: false });
    if (user) void persistUserSnapshot(user, { status: "inactive" });
    console.log(`[T] ${name} stopped tracking`);
  });

  // ── sos-trigger / sos-cancel ───────────────────────────────────────────────
  socket.on("sos-trigger", (payload) => {
    const user = onlineUsers.get(userId);
    if (user) { user.sosActive = true; user.lastSeen = new Date(); }
    const event = {
      type:      "sos-trigger",
      userId,
      name,
      lat:       payload?.lat ?? user?.lat,
      lon:       payload?.lon ?? user?.lon,
      blood:     payload?.blood,
      medical:   payload?.medical,
      message:   payload?.message || "Manual SOS trigger",
      timestamp: Date.now(),
    };
    io.to("admin-room").emit("sos-event", event);
    socket.emit("sos-ack", { status: "broadcast", timestamp: event.timestamp });
    if (user) void persistUserSnapshot(user, { status: "sos" });
    console.log(`[SOS] 🚨 ${name} triggered SOS`);
  });

  socket.on("sos-cancel", () => {
    const user = onlineUsers.get(userId);
    if (user) user.sosActive = false;
    broadcastToAdmins("sos-event", { type: "sos-cancel", userId, name, timestamp: Date.now() });
    socket.emit("sos-ack", { status: "cancelled" });
    if (user) void persistUserSnapshot(user, { status: "active" });
  });

  // ── heartbeat / ping ──────────────────────────────────────────────────────
  socket.on("ping", () => {
    const user = onlineUsers.get(userId);
    if (user) user.lastSeen = new Date();
    socket.emit("pong", { ts: Date.now() });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    console.log(`[-] ${name} (${userId}) disconnected: ${reason}`);
    const user = onlineUsers.get(userId);
    if (user) {
      user.isTracking = false;
      user.socketId   = null;
      broadcastToAdmins("user-disconnected", { userId, name, reason, timestamp: Date.now() });
      void persistUserSnapshot(user, { status: "inactive" });
      // Keep user in map for 60 s (trail + last position) then remove
      setTimeout(() => {
        if (onlineUsers.get(userId)?.socketId === null) {
          onlineUsers.delete(userId);
          broadcastToAdmins("user-removed", { userId });
        }
      }, 60_000);
    }
  });
});

// ─── Stale user sweeper (runs every 15 s) ────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [uid, user] of onlineUsers) {
    if (user.isTracking && now - new Date(user.lastSeen).getTime() > STALE_MS) {
      user.isTracking = false;
      broadcastToAdmins("tracking-status", { userId: uid, isTracking: false, reason: "stale" });
    }
  }
}, 15_000);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function broadcastToAdmins(event, data) {
  io.to("admin-room").emit(event, data);
}

function persistUserSnapshot(user, overrides = {}) {
  const payload = {
    userId: user.userId,
    lat: user.lat,
    lon: user.lon,
    accuracy: user.accuracy,
    heading: user.heading,
    speed: user.speed,
    battery: user.battery,
    status: overrides.status || (user.sosActive ? "sos" : user.isTracking ? "active" : "inactive"),
  };

  return fetch(`${BACKEND_API_URL}/location-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locations: [payload] }),
  }).catch((error) => {
    console.warn("[Mongo] Failed to persist user snapshot:", error.message);
  });
}

function ensureUserEntry(userId, name, role) {
  const existing = onlineUsers.get(userId);
  if (existing) return existing;

  const entry = {
    socketId:   null,
    userId,
    name,
    role,
    lat:        null,
    lon:        null,
    accuracy:   null,
    heading:    null,
    speed:      null,
    battery:    null,
    isTracking: false,
    sosActive:  false,
    trail:      [],
    connectedAt: new Date(),
    lastSeen:   new Date(),
  };
  onlineUsers.set(userId, entry);
  return entry;
}

function applyLocationUpdate(userId, name, role, payload) {
  if (!validateLocation(payload)) return null;

  const user = ensureUserEntry(userId, name, role);

  const trailPoint = { lat: payload.lat, lon: payload.lon, ts: payload.timestamp || Date.now() };
  user.trail = [...user.trail.slice(-(MAX_TRAIL - 1)), trailPoint];

  Object.assign(user, {
    lat:        payload.lat,
    lon:        payload.lon,
    accuracy:   payload.accuracy  ?? user.accuracy,
    heading:    payload.heading   ?? user.heading,
    speed:      payload.speed     ?? user.speed,
    battery:    payload.battery   ?? user.battery,
    isTracking: true,
    lastSeen:   new Date(),
  });

  broadcastToAdmins("location-update", sanitize(user));
  void persistUserSnapshot(user, { status: "active" });
  return user;
}

function buildSnapshot() {
  return [...onlineUsers.values()].map(sanitize);
}

function sanitize(user) {
  // Never send socketId to clients
  const { socketId, ...safe } = user; // eslint-disable-line no-unused-vars
  return { ...safe, lastSeen: user.lastSeen?.toISOString() };
}

function validateLocation({ lat, lon }) {
  return (
    typeof lat === "number" && typeof lon === "number" &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  );
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🏔️  Nimbus Tracking Server`);
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log(`   CORS origins : ${CORS_ORIGIN.join(", ")}`);
  console.log(`   JWT secret   : ${JWT_SECRET.slice(0, 8)}…`);
  console.log(`   State backend: ${USE_REDIS ? "Redis" : "in-memory (single process)"}\n`);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REDIS SECTION
//  To scale horizontally (multiple Node processes behind a load balancer),
//  replace the `onlineUsers` Map with Redis hashes and use @socket.io/redis-adapter
// ═══════════════════════════════════════════════════════════════════════════════
/*
const { createClient }  = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("   Redis adapter : connected");
});

// Replace Map reads/writes with Redis Hash operations:
//   await pubClient.hSet(`user:${userId}`, { lat, lon, lastSeen: Date.now() });
//   const u = await pubClient.hGetAll(`user:${userId}`);
//   const all = await pubClient.keys("user:*");

// Set a TTL so stale users auto-expire:
//   await pubClient.expire(`user:${userId}`, 120);  // 120-second TTL
*/