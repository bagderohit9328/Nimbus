// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  child,
} from "firebase/database";
import { getStorage, ref as storageRef, uploadBytes } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

// ===== AUTHENTICATION =====
export const adminLogin = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

    if (userDoc.exists() && userDoc.data().role === "admin") {
      return {
        success: true,
        user: userCredential.user,
        userData: userDoc.data(),
      };
    } else {
      await signOut(auth);
      throw new Error("Unauthorized: Admin access required");
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const adminLogout = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== USERS =====
export const getAllUsers = async () => {
  try {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
};

export const getUserById = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};

export const updateUserFeatureAccess = async (userId, features) => {
  try {
    await updateDoc(doc(db, "users", userId), {
      features: features,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const subscribeToUsers = (callback) => {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(users);
  });
};

// ===== BOOKINGS =====
export const getAllBookings = async () => {
  try {
    const q = query(
      collection(db, "bookings"),
      where("location", "==", "sinhgad_fort"),
      orderBy("date", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return [];
  }
};

export const updateBookingStatus = async (bookingId, status) => {
  try {
    await updateDoc(doc(db, "bookings", bookingId), {
      status: status,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const subscribeToBookings = (callback) => {
  const q = query(
    collection(db, "bookings"),
    where("location", "==", "sinhgad_fort"),
    orderBy("date", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(bookings);
  });
};

// ===== WEATHER DATA =====
export const subscribeToWeatherData = (callback) => {
  const weatherRef = ref(rtdb, "weather_data/nodes");
  return onValue(weatherRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const weatherArray = Object.values(data);
      callback(weatherArray);
    }
  });
};

export const getWeatherHistory = async (nodeId, days = 7) => {
  try {
    const q = query(
      collection(db, "weather_history"),
      where("nodeId", "==", nodeId),
      orderBy("timestamp", "desc"),
      limit(days * 24) // Approximately hourly data
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error("Error fetching weather history:", error);
    return [];
  }
};

// ===== SOS EVENTS =====
export const getAllSOSEvents = async () => {
  try {
    const q = query(
      collection(db, "sos_events"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching SOS events:", error);
    return [];
  }
};

export const updateSOSEventStatus = async (eventId, status, notes = "") => {
  try {
    await updateDoc(doc(db, "sos_events", eventId), {
      status: status,
      notes: notes,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const subscribeToSOSEvents = (callback) => {
  const q = query(
    collection(db, "sos_events"),
    orderBy("timestamp", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(events);
  });
};

// ===== TEAM TRACKING =====
export const subscribeToTeamLocations = (teamId, callback) => {
  const teamRef = ref(rtdb, `team_locations/${teamId}`);
  return onValue(teamRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};

export const updateTeamLocation = async (teamId, latitude, longitude) => {
  try {
    const teamRef = ref(rtdb, `team_locations/${teamId}`);
    await set(teamRef, {
      latitude,
      longitude,
      timestamp: Date.now(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== SAFETY PROTOCOLS =====
export const getAllSafetyProtocols = async () => {
  try {
    const q = query(collection(db, "safety_protocols"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching protocols:", error);
    return [];
  }
};

export const subscribeToSafetyProtocols = (callback) => {
  const q = query(collection(db, "safety_protocols"));
  return onSnapshot(q, (snapshot) => {
    const protocols = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(protocols);
  });
};

export const updateSafetyProtocol = async (protocolId, data) => {
  try {
    await updateDoc(doc(db, "safety_protocols", protocolId), {
      ...data,
      updatedAt: new Date().toISOString(),
      updated: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const createSafetyProtocol = async (data) => {
  try {
    const docRef = await addDoc(collection(db, "safety_protocols"), {
      ...data,
      status: data.status ?? "draft",
      order: data.order ?? Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updated: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const deleteSafetyProtocol = async (protocolId) => {
  try {
    await deleteDoc(doc(db, "safety_protocols", protocolId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== BLUETOOTH DEVICES =====
export const getAllBluetoothDevices = async () => {
  try {
    const snapshot = await getDocs(collection(db, "bluetooth_devices"));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching BLE devices:", error);
    return [];
  }
};

export const addBluetoothDevice = async (deviceData) => {
  try {
    const docRef = await addDoc(collection(db, "bluetooth_devices"), {
      ...deviceData,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const deleteBluetoothDevice = async (deviceId) => {
  try {
    await deleteDoc(doc(db, "bluetooth_devices", deviceId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== USER DEVICES (GPS, Beacons) =====
export const getUserDevices = async (userId) => {
  try {
    const snapshot = await getDocs(
      collection(db, `user_devices/${userId}`)
    );
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching user devices:", error);
    return [];
  }
};

export const subscribeToUserDevice = (userId, deviceId, callback) => {
  const deviceRef = ref(rtdb, `user_devices/${userId}/${deviceId}`);
  return onValue(deviceRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};

// ===== ADMIN LOGS =====
export const createAdminLog = async (action, details) => {
  try {
    await addDoc(collection(db, "admin_logs"), {
      action: action,
      details: details,
      adminId: auth.currentUser?.uid,
      timestamp: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== WEATHER FORECASTS =====
export const getWeatherForecast = async (nodeId) => {
  try {
    const forecastDoc = await getDoc(doc(db, "weather_forecasts", nodeId));
    return forecastDoc.exists() ? forecastDoc.data() : null;
  } catch (error) {
    console.error("Error fetching forecast:", error);
    return null;
  }
};