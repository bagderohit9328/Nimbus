// src/components/dashboard/BookingsList.jsx
import { Calendar, Users, MapPin, CheckCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BookingsList({ bookings }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Recent Bookings</h2>
        <button
          onClick={() => navigate("/bookings")}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          View All →
        </button>
      </div>

      {bookings && bookings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-semibold text-gray-700">User</th>
                <th className="text-left py-2 font-semibold text-gray-700">Date</th>
                <th className="text-left py-2 font-semibold text-gray-700">Participants</th>
                <th className="text-left py-2 font-semibold text-gray-700">Status</th>
                <th className="text-left py-2 font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3">
                    <p className="font-medium text-gray-900">{booking.userName}</p>
                  </td>
                  <td className="py-3 text-gray-600">{booking.date}</td>
                  <td className="py-3 text-gray-600">{booking.participantCount}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      booking.status === "confirmed"
                        ? "bg-green-100 text-green-800"
                        : booking.status === "cancelled"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {booking.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => navigate(`/bookings/${booking.id}`)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-center py-6">No bookings</p>
      )}
    </div>
  );
}