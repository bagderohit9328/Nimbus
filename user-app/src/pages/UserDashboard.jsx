// user-app/src/pages/UserDashboard.jsx
import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { Cloud, AlertCircle, Calendar, Map } from "lucide-react";

export default function UserDashboard() {
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState("weather");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Welcome, {user?.name}</h1>
          <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            Emergency SOS
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 flex gap-6">
          <button
            onClick={() => setActiveTab("weather")}
            className={`py-4 px-4 font-medium border-b-2 transition ${
              activeTab === "weather"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Cloud className="inline mr-2" size={20} />
            Weather
          </button>
          <button
            onClick={() => setActiveTab("bookings")}
            className={`py-4 px-4 font-medium border-b-2 transition ${
              activeTab === "bookings"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Calendar className="inline mr-2" size={20} />
            My Bookings
          </button>
          <button
            onClick={() => setActiveTab("tracking")}
            className={`py-4 px-4 font-medium border-b-2 transition ${
              activeTab === "tracking"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Map className="inline mr-2" size={20} />
            SOS Tracking
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "weather" && <WeatherView />}
        {activeTab === "bookings" && <BookingsView />}
        {activeTab === "tracking" && <TrackingView />}
      </div>
    </div>
  );
}

function WeatherView() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Current Weather - Sinhgad Fort</h2>
      {/* Weather cards */}
    </div>
  );
}

function BookingsView() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">My Trip Bookings</h2>
      {/* Booking cards */}
    </div>
  );
}

function TrackingView() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">SOS Real-Time Tracking</h2>
      {/* Tracking map */}
    </div>
  );
}