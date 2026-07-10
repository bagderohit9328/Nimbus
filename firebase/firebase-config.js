// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE REALTIME DATABASE RULES
// Save as: firebase-realtime-rules.json
// ═══════════════════════════════════════════════════════════════════════════════

const firebaseRules = {
  rules: {
    weather_nodes: {
      ".read": "auth != null",
      "$nodeId": {
        ".write": "auth != null"
      }
    },
    sos_events: {
      ".read": "auth != null",
      "$nodeId": {
        ".write": "auth != null"
      }
    },
    system: {
      ".read": "auth != null",
      "trigger_siren": {
        ".write": "auth != null && root.child('admins').child(auth.uid).exists()"
      }
    },
    admins: {
      ".read": "auth != null && root.child('admins').child(auth.uid).exists()",
      ".write": false
    }
  }
};

export default firebaseRules;

// ═══════════════════════════════════════════════════════════════════════════════
// FIRESTORE SECURITY RULES
// Save as: firestore.rules
// ═══════════════════════════════════════════════════════════════════════════════

/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }

    // Users collection
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isAuthenticated() && request.auth.uid == userId;
      allow update: if isOwner(userId) || isAdmin();
      allow delete: if isAdmin();
    }

    // SOS logs - written by system, readable by admins
    match /sos_logs/{logId} {
      allow read: if isAdmin();
      allow write: if isAuthenticated();
    }

    // Admin activity logs
    match /admin_logs/{logId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    // Weather history archive
    match /weather_history/{docId} {
      allow read: if isAuthenticated();
      allow write: if false; // Written by Cloud Functions only
    }
  }
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// FIRESTORE DATA SCHEMAS (TypeScript interfaces for reference)
// ═══════════════════════════════════════════════════════════════════════════════

/*
// Collection: users/{uid}
interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  bloodGroup: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  emergencyContacts: {
    name: string;
    phone: string;
    relation: string;
  }[];
  registeredAt: Timestamp;
  role: 'user' | 'admin';
  lastSeen: Timestamp;
}

// Collection: sos_logs/{logId}
interface SOSLog {
  userId: string;
  userName: string;
  bloodGroup: string;
  emergencyContacts: Contact[];
  lat: number;
  lon: number;
  nodeId: string;
  triggeredAt: Timestamp;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  status: 'active' | 'resolved' | 'false_alarm';
  notes: string;
}

// Realtime DB: /weather_nodes/{nodeId}
interface WeatherNode {
  timestamp: number;       // Server timestamp
  temp: number;            // °C
  humidity: number;        // %
  pressure: number;        // hPa
  altitude: number;        // meters
  heat_index: number;      // °C
  rain_mm: number;         // mm/hr
  sound_db: number;        // dB SPL
  pm2_5: number;           // μg/m³
  pm10: number;            // μg/m³
  pressure_trend: -1|0|1;  // falling|stable|rising
  active_sos: boolean;
  lat: number;
  lon: number;
  rssi: number;            // LoRa signal strength dBm
  snr: number;             // LoRa SNR dB
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE CLOUD FUNCTION: Archive weather + notify on SOS
// Save as: functions/index.js
// ═══════════════════════════════════════════════════════════════════════════════

/*
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Archive weather data to Firestore every 5 minutes
exports.archiveWeather = functions.database
  .ref('/weather_nodes/{nodeId}')
  .onUpdate(async (change, context) => {
    const data = change.after.val();
    const nodeId = context.params.nodeId;

    // Archive to Firestore
    await admin.firestore()
      .collection('weather_history')
      .add({
        nodeId,
        ...data,
        archivedAt: admin.firestore.FieldValue.serverTimestamp()
      });
  });

// Trigger FCM push notification on SOS
exports.onSOSActivated = functions.database
  .ref('/sos_events/{nodeId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists()) return;

    const sos = change.after.val();
    if (!sos || sos.resolved) return;

    // Get all admin tokens
    const admins = await admin.firestore()
      .collection('users')
      .where('role', '==', 'admin')
      .get();

    const tokens = admins.docs
      .map(d => d.data().fcmToken)
      .filter(Boolean);

    if (tokens.length === 0) return;

    await admin.messaging().sendMulticast({
      tokens,
      notification: {
        title: '🆘 EMERGENCY SOS ALERT',
        body: `SOS from node ${context.params.nodeId} — Lat: ${sos.lat}, Lon: ${sos.lon}`,
      },
      data: { nodeId: context.params.nodeId, lat: String(sos.lat), lon: String(sos.lon) }
    });
  });
*/