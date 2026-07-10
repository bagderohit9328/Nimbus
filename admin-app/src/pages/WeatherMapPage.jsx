// src/pages/WeatherMapsPage.jsx
import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useAdminStore } from "../store/adminStore";
import { Cloud, Zap, Eye } from "lucide-react";
import "leaflet/dist/leaflet.css";

// Fix leaflet icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function WeatherMapsPage() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [forecast, setForecast] = useState(null);
  const weatherData = useAdminStore((state) => state.weatherData);

  const getMarkerColor = (temp) => {
    if (temp > 35) return "red";
    if (temp > 25) return "orange";
    return "blue";
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Weather Maps</h1>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Map */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow overflow-hidden h-96">
          <MapContainer
            center={[18.3736, 73.7983]}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {weatherData.map((node, idx) => (
              <Marker
                key={idx}
                position={[node.latitude || 18.3736, node.longitude || 73.7983]}
                onClick={() => setSelectedNode(node)}
              >
                <Popup>
                  <div>
                    <p className="font-bold">Node {node.nodeId}</p>
                    <p>Temp: {node.temperature?.toFixed(1)}°C</p>
                    <p>Humidity: {node.humidity?.toFixed(0)}%</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Selected Node Details */}
        {selectedNode && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-bold text-lg mb-3">Node Details</h3>

            <div className="space-y-2 text-sm">
              <div>
                <p className="text-gray-600">Temperature</p>
                <p className="text-2xl font-bold text-blue-600">
                  {selectedNode.temperature?.toFixed(1)}°C
                </p>
              </div>
              <div>
                <p className="text-gray-600">Humidity</p>
                <p className="text-2xl font-bold text-blue-600">
                  {selectedNode.humidity?.toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="text-gray-600">Pressure</p>
                <p className="font-bold">{selectedNode.pressure?.toFixed(0)} hPa</p>
              </div>
              <div>
                <p className="text-gray-600">Altitude</p>
                <p className="font-bold">{selectedNode.altitude?.toFixed(0)}m</p>
              </div>
              <div>
                <p className="text-gray-600">PM2.5</p>
                <p className="font-bold text-red-600">{selectedNode.pm25?.toFixed(1)}</p>
              </div>
            </div>

            <button
              onClick={() => setForecast(!forecast)}
              className="w-full mt-4 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              {forecast ? "Hide Forecast" : "Show 7-Day Forecast"}
            </button>
          </div>
        )}
      </div>

      {/* 7-Day Forecast */}
      {forecast && selectedNode && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">7-Day Forecast</h2>
          <div className="grid grid-cols-7 gap-2">
            {[...Array(7)].map((_, i) => {
              const date = new Date();
              date.setDate(date.getDate() + i);
              return (
                <div key={i} className="bg-blue-50 p-3 rounded text-center text-sm">
                  <p className="font-semibold">{date.toLocaleDateString()}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {(selectedNode.temperature + (Math.random() * 5 - 2.5)).toFixed(0)}°C
                  </p>
                  <p className="text-xs text-gray-600">
                    {(selectedNode.humidity + (Math.random() * 10 - 5)).toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}