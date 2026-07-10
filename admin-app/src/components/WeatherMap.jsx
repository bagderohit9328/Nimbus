// Admin App — Weather Map Component
// src/components/WeatherMap.jsx

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const sosIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;background:#ef4444;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    border:3px solid white;box-shadow:0 0 12px #ef444480;
    animation:pulse 1s infinite;font-size:16px;
  ">🆘</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const normalIcon = (selected) => L.divIcon({
  className: '',
  html: `<div style="
    width:${selected ? 36 : 28}px;height:${selected ? 36 : 28}px;
    background:${selected ? '#f97316' : '#3b82f6'};border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    border:3px solid white;box-shadow:0 0 8px #0008;font-size:${selected ? 18 : 14}px;
  ">⛰️</div>`,
  iconSize: [selected ? 36 : 28, selected ? 36 : 28],
  iconAnchor: [(selected ? 36 : 28) / 2, (selected ? 36 : 28) / 2],
});

export default function WeatherMap({ nodes, selectedNode, onSelectNode }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: [28.5, 77.2],
      zoom: 10,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(mapInstance.current);
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    Object.entries(nodes).forEach(([id, node]) => {
      if (!node.lat || !node.lon) return;

      const icon = node.active_sos ? sosIcon : normalIcon(id === selectedNode);
      const popup = `
        <div style="font-family:monospace;font-size:12px;min-width:160px">
          <div style="font-weight:bold;color:#f97316;margin-bottom:4px">${id}</div>
          <div>🌡 ${node.temp?.toFixed(1)}°C | 💧 ${node.humidity?.toFixed(0)}%</div>
          <div>📊 ${node.pressure?.toFixed(1)} hPa</div>
          <div>🌧 Rain: ${node.rain_mm?.toFixed(1)} mm/hr</div>
          ${node.active_sos ? '<div style="color:red;font-weight:bold;margin-top:4px">🆘 SOS ACTIVE</div>' : ''}
        </div>
      `;

      if (markersRef.current[id]) {
        markersRef.current[id].setIcon(icon);
        markersRef.current[id].setPopupContent(popup);
      } else {
        const marker = L.marker([node.lat, node.lon], { icon })
          .addTo(mapInstance.current)
          .bindPopup(popup)
          .on('click', () => onSelectNode(id));
        markersRef.current[id] = marker;
      }
    });
  }, [nodes, selectedNode]);

  return <div ref={mapRef} style={{ height: '100%', width: '100%', borderRadius: '8px' }} />;
}