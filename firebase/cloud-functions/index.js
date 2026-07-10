// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: functions.config().email.user,
    pass: functions.config().email.password,
  },
});

// Trigger on new SOS event
exports.onSOSEvent = functions.firestore
  .document("sos_events/{eventId}")
  .onCreate(async (snap, context) => {
    const sosData = snap.data();
    const userId = sosData.userId;

    try {
      // Get user details
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .get();
      const userData = userDoc.data();

      // Send notification to admins
      const adminsSnapshot = await admin
        .firestore()
        .collection("users")
        .where("role", "==", "admin")
        .get();

      const notifications = [];
      adminsSnapshot.forEach((doc) => {
        notifications.push({
          adminId: doc.id,
          sosEventId: context.params.eventId,
          userId: userId,
          userName: userData.name,
          location: sosData.location,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });
      });

      // Batch write notifications
      const batch = admin.firestore().batch();
      notifications.forEach((notif) => {
        const ref = admin
          .firestore()
          .collection("admin_notifications")
          .doc();
        batch.set(ref, notif);
      });

      await batch.commit();

      // Send email alert
      await transporter.sendMail({
        from: functions.config().email.user,
        to: adminsSnapshot.docs.map((d) => d.data().email).join(","),
        subject: `URGENT: SOS Alert from ${userData.name}`,
        html: `
          <h2 style="color: red;">Emergency SOS Alert</h2>
          <p><strong>User:</strong> ${userData.name}</p>
          <p><strong>Phone:</strong> ${userData.phone}</p>
          <p><strong>Location:</strong> ${sosData.location}</p>
          <p><strong>Coordinates:</strong> ${sosData.latitude}, ${sosData.longitude}</p>
          <p><strong>Blood Group:</strong> ${userData.bloodGroup || "N/A"}</p>
          <p><strong>Emergency Contacts:</strong></p>
          <ul>
            ${userData.emergencyContacts
              .map((c) => `<li>${c.name}: ${c.phone}</li>`)
              .join("")}
          </ul>
          <a href="https://admin.nimbus.travel/sos/${context.params.eventId}">
            View in Dashboard
          </a>
        `,
      });

      console.log("SOS notification sent successfully");
      return null;
    } catch (error) {
      console.error("Error handling SOS event:", error);
      throw error;
    }
  });

// Update weather data triggers
exports.onWeatherUpdate = functions.database
  .ref("/weather_data/nodes/{nodeId}")
  .onWrite(async (change, context) => {
    const weatherData = change.after.val();

    if (!weatherData) return null;

    try {
      // Store in Firestore for historical data
      await admin
        .firestore()
        .collection("weather_history")
        .add({
          ...weatherData,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          date: new Date().toISOString().split("T")[0],
        });

      // Update latest weather document
      await admin
        .firestore()
        .collection("weather_latest")
        .doc(context.params.nodeId)
        .set(weatherData, { merge: true });

      // Check for extreme conditions
      if (weatherData.temperature > 40) {
        await admin.firestore().collection("alerts").add({
          type: "HIGH_TEMPERATURE",
          severity: "HIGH",
          nodeId: context.params.nodeId,
          value: weatherData.temperature,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (weatherData.rainLevel > 90) {
        await admin.firestore().collection("alerts").add({
          type: "HEAVY_RAIN",
          severity: "MEDIUM",
          nodeId: context.params.nodeId,
          value: weatherData.rainLevel,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return null;
    } catch (error) {
      console.error("Error processing weather update:", error);
      throw error;
    }
  });

// Generate 7-day forecast
exports.generateWeatherForecast = functions.pubsub
  .schedule("0 */6 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    try {
      const weatherRef = admin.database().ref("/weather_data/nodes");
      const snapshot = await weatherRef.once("value");
      const latestData = snapshot.val();

      if (!latestData) return null;

      // Get latest reading from each node
      const forecasts = [];
      for (const nodeId in latestData) {
        const nodeData = latestData[nodeId];

        // Simple trend-based forecast
        const forecast = {
          nodeId: nodeId,
          generatedAt: new Date().toISOString(),
          days: generateForecastDays(nodeData),
        };

        forecasts.push(
          admin
            .firestore()
            .collection("weather_forecasts")
            .doc(nodeId)
            .set(forecast)
        );
      }

      await Promise.all(forecasts);
      console.log("Weather forecasts generated");
      return null;
    } catch (error) {
      console.error("Error generating forecast:", error);
      throw error;
    }
  });

function generateForecastDays(currentData) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    days.push({
      date: date.toISOString().split("T")[0],
      tempMax: currentData.temperature + Math.random() * 5 - 2.5,
      tempMin: currentData.temperature + Math.random() * 5 - 5,
      humidity: currentData.humidity + Math.random() * 10 - 5,
      rainChance: currentData.rainLevel + Math.random() * 20 - 10,
      condition: getWeatherCondition(currentData.rainLevel),
    });
  }
  return days;
}

function getWeatherCondition(rainLevel) {
  if (rainLevel > 80) return "Heavy Rain";
  if (rainLevel > 50) return "Light Rain";
  if (rainLevel > 30) return "Cloudy";
  return "Clear";
}

// Booking confirmation
exports.onBookingCreated = functions.firestore
  .document("bookings/{bookingId}")
  .onCreate(async (snap, context) => {
    const booking = snap.data();

    try {
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(booking.userId)
        .get();
      const userData = userDoc.data();

      await transporter.sendMail({
        from: functions.config().email.user,
        to: userData.email,
        subject: "Booking Confirmation - Sinhgad Fort Trek",
        html: `
          <h2>Booking Confirmed</h2>
          <p>Dear ${userData.name},</p>
          <p>Your booking for Sinhgad Fort has been confirmed.</p>
          <p><strong>Date:</strong> ${booking.date}</p>
          <p><strong>Time:</strong> ${booking.time}</p>
          <p><strong>Participants:</strong> ${booking.participantCount}</p>
          <p><strong>Reference ID:</strong> ${context.params.bookingId}</p>
          <p>Please arrive 15 minutes before the scheduled time.</p>
        `,
      });

      return null;
    } catch (error) {
      console.error("Error sending booking confirmation:", error);
      throw error;
    }
  });