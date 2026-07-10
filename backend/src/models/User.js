const mongoose = require("mongoose");

// Device sub-schema for Bluetooth and IoT devices
const DeviceSchema = new mongoose.Schema(
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
  },
  { _id: false }
);

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
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: "color must contain exactly 2 hex strings",
      },
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
    deviceList: [DeviceSchema],
    ec1Name: { type: String, default: "" },
    ec1Rel: { type: String, default: "" },
    ec1Ph: { type: String, default: "" },
    ec2Name: { type: String, default: "" },
    ec2Rel: { type: String, default: "" },
    ec2Ph: { type: String, default: "" },
  },
  { timestamps: true }
);

UserSchema.methods.toSafeProfile = function toSafeProfile() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    avatar: this.avatar,
    color: this.color,
    blood: this.blood,
    medical: this.medical,
    lat: this.lat,
    lon: this.lon,
    accuracy: this.accuracy,
    heading: this.heading,
    speed: this.speed,
    battery: this.battery,
    lastSeenAt: this.lastSeenAt,
    city: this.city,
    phone: this.phone,
    trips: this.trips,
    devices: this.devices,
    deviceList: this.deviceList || [],
    ec1Name: this.ec1Name,
    ec1Rel: this.ec1Rel,
    ec1Ph: this.ec1Ph,
    ec2Name: this.ec2Name,
    ec2Rel: this.ec2Rel,
    ec2Ph: this.ec2Ph,
  };
};

module.exports = mongoose.model("User", UserSchema);
