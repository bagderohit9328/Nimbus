const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nimbus";
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174,http://localhost:5175")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      city,
      role,
      blood,
      medical,
      ec1Name,
      ec1Rel,
      ec1Ph,
      ec2Name,
      ec2Rel,
      ec2Ph,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const avatar = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "EU";

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      phone: phone || "",
      city: city || "",
      role: role || "Explorer",
      blood: blood || "B+",
      medical: medical || "None",
      avatar,
      ec1Name: ec1Name || "",
      ec1Rel: ec1Rel || "",
      ec1Ph: ec1Ph || "",
      ec2Name: ec2Name || "",
      ec2Rel: ec2Rel || "",
      ec2Ph: ec2Ph || "",
    });

    return res.status(201).json({ user: user.toSafeProfile() });
  } catch (error) {
    console.error("Register error", error);
    return res.status(500).json({ error: "Unable to create account right now." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    return res.json({ user: user.toSafeProfile() });
  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({ error: "Unable to sign in right now." });
  }
});

app.get("/api/users", async (_req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.json({ users: users.map((user) => user.toSafeProfile()) });
  } catch (error) {
    console.error("List users error", error);
    return res.status(500).json({ error: "Unable to load users right now." });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json({ user: user.toSafeProfile() });
  } catch (error) {
    console.error("Get user error", error);
    return res.status(500).json({ error: "Unable to load user right now." });
  }
});

app.post("/api/location-batch", async (req, res) => {
  try {
    const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
    if (!locations.length) {
      return res.status(400).json({ error: "LOCATIONS_REQUIRED", message: "locations array required" });
    }

    let accepted = 0;

    for (const payload of locations) {
      const userId = String(payload?.userId || "").trim();
      if (!userId) continue;

      const update = {};
      if (typeof payload.lat === "number") update.lat = payload.lat;
      if (typeof payload.lon === "number") update.lon = payload.lon;
      if (typeof payload.accuracy === "number") update.accuracy = payload.accuracy;
      if (typeof payload.heading === "number") update.heading = payload.heading;
      if (typeof payload.speed === "number") update.speed = payload.speed;
      if (typeof payload.battery === "number") update.battery = payload.battery;
      if (typeof payload.status === "string" && payload.status.trim()) update.status = payload.status.trim();
      update.lastSeenAt = new Date();

      if (!Object.keys(update).length) continue;

      const updated = await User.findByIdAndUpdate(
        userId,
        { $set: update },
        { new: true, runValidators: true }
      );

      if (updated) accepted += 1;
    }

    if (!accepted) {
      return res.status(400).json({ error: "NO_VALID_LOCATIONS", message: "No valid positions were accepted" });
    }

    return res.json({ ok: true, accepted });
  } catch (error) {
    console.error("Location batch error", error);
    return res.status(500).json({ error: "Unable to store locations right now." });
  }
});

// ─── Bluetooth Device Management ──────────────────────────────────────────────
app.get("/api/users/:id/devices", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json({ devices: user.deviceList || [] });
  } catch (error) {
    console.error("Get devices error", error);
    return res.status(500).json({ error: "Unable to load devices right now." });
  }
});

app.post("/api/users/:id/devices", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const { id, name, type, mac, battery, signal, gps, sos, connected, lat, lon } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "Device id and name are required." });
    }

    // Check if device already exists
    if (user.deviceList?.some((d) => d.id === id)) {
      return res.status(409).json({ error: "Device already exists." });
    }

    const device = {
      id,
      name,
      type: type || "tracker",
      mac: mac || "",
      battery: battery ?? 0,
      signal: signal || "unknown",
      gps: gps ?? false,
      sos: sos ?? false,
      connected: connected ?? false,
      lat: lat ?? null,
      lon: lon ?? null,
      pairedAt: new Date(),
    };

    user.deviceList = user.deviceList || [];
    user.deviceList.push(device);
    user.devices = user.deviceList.length;
    await user.save();

    return res.status(201).json({ device, devices: user.deviceList });
  } catch (error) {
    console.error("Add device error", error);
    return res.status(500).json({ error: "Unable to add device right now." });
  }
});

app.patch("/api/users/:id/devices/:deviceId", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const deviceIndex = user.deviceList?.findIndex((d) => d.id === req.params.deviceId) ?? -1;
    if (deviceIndex === -1) {
      return res.status(404).json({ error: "Device not found." });
    }

    const { battery, signal, connected, lat, lon, status } = req.body;
    const device = user.deviceList[deviceIndex];

    if (battery !== undefined) device.battery = battery;
    if (signal !== undefined) device.signal = signal;
    if (connected !== undefined) device.connected = connected;
    if (lat !== undefined) device.lat = lat;
    if (lon !== undefined) device.lon = lon;

    await user.save();
    return res.json({ device, devices: user.deviceList });
  } catch (error) {
    console.error("Update device error", error);
    return res.status(500).json({ error: "Unable to update device right now." });
  }
});

app.delete("/api/users/:id/devices/:deviceId", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const deviceIndex = user.deviceList?.findIndex((d) => d.id === req.params.deviceId) ?? -1;
    if (deviceIndex === -1) {
      return res.status(404).json({ error: "Device not found." });
    }

    user.deviceList.splice(deviceIndex, 1);
    user.devices = user.deviceList.length;
    await user.save();

    return res.json({ devices: user.deviceList });
  } catch (error) {
    console.error("Remove device error", error);
    return res.status(500).json({ error: "Unable to remove device right now." });
  }
});

async function bootstrap() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ MongoDB connected: ${MONGODB_URI}`);

    app.listen(PORT, () => {
      console.log(`🚀 Nimbus backend listening on http://localhost:${PORT}`);
      console.log(`   CORS origins: ${CORS_ORIGIN.join(", ")}`);
    });
  } catch (error) {
    console.error("❌ Failed to start backend", error);
    process.exit(1);
  }
}

bootstrap();
