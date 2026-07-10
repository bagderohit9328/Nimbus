// src/components/dashboard/SOSAlerts.jsx
import { AlertCircle, MapPin, Phone, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SOSAlerts({ events }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="text-red-600" size={24} />
        <h2 className="text-xl font-bold">Active SOS Events</h2>
      </div>

      {events && events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className={`p-3 rounded-lg border-l-4 cursor-pointer hover:bg-gray-50 ${
                event.status === "active"
                  ? "border-red-600 bg-red-50"
                  : "border-yellow-600 bg-yellow-50"
              }`}
              onClick={() => navigate(`/sos/${event.id}`)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-800">{event.userName}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                    <MapPin size={14} />
                    <span>
                      {event.latitude?.toFixed(4)}, {event.longitude?.toFixed(4)}
                    </span>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                  event.status === "active"
                    ? "bg-red-600 text-white"
                    : "bg-yellow-600 text-white"
                }`}>
                  {event.status?.toUpperCase()}
                </span>
              </div>
              {event.phone && (
                <div className="flex items-center gap-1 text-xs text-gray-700 mt-2">
                  <Phone size={14} />
                  <span>{event.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                <Clock size={14} />
                <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center py-6">No active SOS events</p>
      )}
    </div>
  );
}