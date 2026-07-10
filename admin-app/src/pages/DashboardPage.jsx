// src/pages/DashboardPage.jsx
import { useState, useEffect } from "react";
import { useAdminStore } from "../store/adminStore";
import DashboardStats from "../components/dashboard/DashboardStats";
import WeatherOverview from "../components/dashboard/WeatherOverview";
import BookingsList from "../components/dashboard/BookingsList";
import SOSAlerts from "../components/dashboard/SOSAlerts";
import { useAdminTracking } from "../hooks/useAdminTracking";
import { AlertCircle, Cloud, Users, Calendar } from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState({});
  const store = useAdminStore();
  const { liveUsers, connectionState, error } = useAdminTracking({ serverUrl: "http://localhost:4000" });
  const liveUsersList = Array.from(liveUsers.values());

  useEffect(() => {
    const unsubscribe = store.subscribe();
    return unsubscribe;
  }, []);

  useEffect(() => {
    setStats(store.getStats(store));
  }, [store.bookings, store.users, store.sosEvents]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Operations Dashboard
        </h1>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            Live
          </span>
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStats
          icon={<Users size={24} />}
          title="Total Users"
          value={stats.totalUsers}
          color="blue"
        />
        <DashboardStats
          icon={<Calendar size={24} />}
          title="Pending Bookings"
          value={stats.pendingBookings}
          color="yellow"
        />
        <DashboardStats
          icon={<AlertCircle size={24} />}
          title="Active SOS"
          value={stats.activeSOSEvents}
          color="red"
        />
        <DashboardStats
          icon={<Cloud size={24} />}
          title="Weather Nodes"
          value={store.weatherData.length}
          color="green"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <WeatherOverview data={store.weatherData} />
          <BookingsList bookings={store.bookings.slice(0, 5)} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <SOSAlerts events={store.sosEvents.slice(0, 5)} />
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">Live Device Tracking</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${connectionState === "connected" ? "bg-green-100 text-green-800" : connectionState === "connecting" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                {connectionState === "connected" ? "Live sync" : connectionState === "connecting" ? "Connecting" : "Disconnected"}
              </span>
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-blue-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Tracked Users</div>
                <div className="mt-1 text-2xl font-bold text-blue-900">{liveUsersList.length}</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-green-600">Active</div>
                <div className="mt-1 text-2xl font-bold text-green-900">{liveUsersList.filter((user) => user.status === "active").length}</div>
              </div>
            </div>
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {liveUsersList.length > 0 ? (
                liveUsersList.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div>
                      <div className="font-medium text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-500">{typeof user.lat === "number" ? `${user.lat.toFixed(4)}, ${user.lon.toFixed(4)}` : "Awaiting location"}</div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${user.status === "sos" ? "bg-red-100 text-red-700" : user.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {user.status || "inactive"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                  Waiting for live user locations from the tracking server.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}