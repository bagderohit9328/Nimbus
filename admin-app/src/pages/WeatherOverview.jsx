// src/components/dashboard/WeatherOverview.jsx
import { Cloud, CloudRain, Wind, Droplets, Eye } from "lucide-react";

export default function WeatherOverview({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        Loading weather data...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Live Weather Data</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((node, idx) => (
          <div key={idx} className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-gray-800">
                  Node {node.nodeId || idx + 1}
                </h3>
                <p className="text-xs text-gray-600">
                  {new Date(node.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <Cloud size={24} className="text-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-600">Temperature</p>
                <p className="text-lg font-bold text-blue-600">
                  {node.temperature?.toFixed(1)}°C
                </p>
              </div>
              <div>
                <p className="text-gray-600">Humidity</p>
                <p className="text-lg font-bold text-blue-600">
                  {node.humidity?.toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="text-gray-600">Pressure</p>
                <p className="text-lg font-bold text-blue-600">
                  {node.pressure?.toFixed(0)} hPa
                </p>
              </div>
              <div>
                <p className="text-gray-600">Altitude</p>
                <p className="text-lg font-bold text-blue-600">
                  {node.altitude?.toFixed(0)}m
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-600">PM2.5</p>
                <p className="text-lg font-bold text-blue-600">
                  {node.pm25?.toFixed(1)} µg/m³
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-600">Rain Level</p>
                <p className="text-lg font-bold text-blue-600">
                  {node.rainLevel?.toFixed(0)}%
                </p>
              </div>
            </div>

            {node.rssi && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs text-gray-600">
                  Signal: {node.rssi} dBm
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}