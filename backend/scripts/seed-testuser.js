#!/usr/bin/env node
/**
 * Seed test user account in MongoDB
 * Usage: node scripts/seed-testuser.js
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nimbus";

// Copy User schema
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: "" },
    city: { type: String, default: "" },
    role: { type: String, default: "Explorer" },
    blood: { type: String, default: "B+" },
    medical: { type: String, default: "None" },
    avatar: { type: String, default: "EU" },
    color: {
      type: [String],
      default: ["#E6F1FB", "#0C447C"],
    },
    status: { type: String, default: "active" },
    lat: { type: Number, default: 18.5196 },
    lon: { type: Number, default: 73.8554 },
    accuracy: { type: Number, default: null },
    heading: { type: Number, default: null },
    speed: { type: Number, default: null },
    battery: { type: Number, default: null },
    lastSeenAt: { type: Date, default: null },
    trips: { type: Number, default: 0 },
    devices: { type: Number, default: 1 },
    deviceList: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, enum: ["phone", "watch", "satellite", "tracker", "beacon"], default: "tracker" },
        mac: { type: String, default: "" },
        battery: { type: Number, default: 0 },
        signal: { type: String, enum: ["strong", "medium", "low", "unknown"], default: "unknown" },
        gps: { type: Boolean, default: false },
        sos: { type: Boolean, default: false },
        connected: { type: Boolean, default: false },
        lat: { type: Number, default: null },
        lon: { type: Number, default: null },
        pairedAt: { type: Date, default: null },
        _id: false,
      },
    ],
    ec1Name: { type: String, default: "" },
    ec1Rel: { type: String, default: "" },
    ec1Ph: { type: String, default: "" },
    ec2Name: { type: String, default: "" },
    ec2Rel: { type: String, default: "" },
    ec2Ph: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);

async function seedTestUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ Connected to MongoDB: ${MONGODB_URI}`);

    // Check if user already exists
    const existingUser = await User.findOne({ email: "aryan@nimbus.travel" });
    if (existingUser) {
      console.log(`⚠️  Test user already exists: ${existingUser.name}`);
      await mongoose.disconnect();
      return;
    }

    // Create test user
    const passwordHash = await bcrypt.hash("user123", 10);
    const testUser = await User.create({
      name: "Aryan Rao",
      email: "aryan@nimbus.travel",
      passwordHash,
      phone: "+91 98765 43210",
      city: "Mulshi, Maharashtra",
      role: "Explorer Pro",
      blood: "B+",
      medical: "None",
      avatar: "AR",
      color: ["#E6F1FB", "#0C447C"],
      ec1Name: "Meera Rao",
      ec1Rel: "Sister",
      ec1Ph: "+91 99887 76655",
      ec2Name: "Sunil Rao",
      ec2Rel: "Father",
      ec2Ph: "+91 98001 23456",
    });

    console.log(`✅ Test user created successfully!`);
    console.log(`   Email: aryan@nimbus.travel`);
    console.log(`   Password: user123`);
    console.log(`   ID: ${testUser._id}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error seeding test user:", error.message);
    process.exit(1);
  }
}

seedTestUser();
