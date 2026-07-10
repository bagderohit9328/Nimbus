// Admin App — SOS Modal with Web Audio API Siren
// src/components/SOSModal.jsx

import { useEffect, useRef, useState } from 'react';
import { ref, set } from 'firebase/database';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ─── Web Audio Siren ──────────────────────────────────────────────────────────
function createSiren(ctx) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  // Main siren tone
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 800;

  // LFO for frequency sweep (800–1200 Hz, 1 Hz rate)
  lfo.type = 'sine';
  lfo.frequency.value = 0.8;
  lfoGain.gain.value = 300;

  lfo.connect(lfoGain);
  lfoGain.connect(oscillator.frequency);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.value = 0.4;
  lfo.start();
  oscillator.start();

  return { oscillator, gainNode, lfo, lfoGain };
}

// ─── SOS Modal ────────────────────────────────────────────────────────────────
export default function SOSModal({ sosNodes, onDismiss, db }) {
  const [activeNode, setActiveNode] = useState(sosNodes[0]);
  const [resolving, setResolving] = useState(false);
  const [tab, setTab] = useState('info'); // 'info' | 'contacts'
  const audioCtxRef = useRef(null);
  const sirenRef = useRef(null);

  // Start siren on mount
  useEffect(() => {
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    sirenRef.current = createSiren(audioCtxRef.current);

    return () => {
      sirenRef.current?.oscillator.stop();
      sirenRef.current?.lfo.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  // Update active node when list changes
  useEffect(() => {
    setActiveNode(sosNodes[0]);
  }, [sosNodes]);

  const stopSiren = () => {
    sirenRef.current?.gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
  };

  const handleResolve = async (status) => {
    setResolving(true);
    stopSiren();
    try {
      // Clear SOS in RTDB
      await set(ref(db, `weather_nodes/${activeNode.nodeId}/active_sos`), false);
      await set(ref(db, `sos_events/${activeNode.nodeId}/resolved`), true);

      // Log resolution to Firestore
      await addDoc(collection(db, 'sos_logs'), {
        nodeId: activeNode.nodeId,
        userName: activeNode.userName || 'Unknown',
        bloodGroup: activeNode.bloodGroup || '—',
        emergencyContacts: activeNode.emergencyContacts || [],
        lat: activeNode.lat,
        lon: activeNode.lon,
        triggeredAt: serverTimestamp(),
        resolvedAt: serverTimestamp(),
        status,
        resolvedBy: 'admin',
      });

      onDismiss(activeNode.nodeId);
    } catch (e) {
      console.error('Resolve error:', e);
    }
    setResolving(false);
  };

  if (!activeNode) return null;

  const mapsUrl = `https://www.openstreetmap.org/directions?from=&to=${activeNode.lat},${activeNode.lon}`;
  const googleMapsUrl = `https://maps.google.com/?q=${activeNode.lat},${activeNode.lon}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Flashing red overlay */}
      <div className="absolute inset-0 bg-red-950/80 backdrop-blur-sm animate-pulse" />

      <div className="relative z-10 w-full max-w-2xl mx-4">
        {/* Alert banner */}
        <div className="bg-red-600 text-white text-center py-3 rounded-t-2xl font-mono font-bold text-lg tracking-widest animate-pulse">
          🆘 EMERGENCY SOS ALERT 🆘
        </div>

        <div className="bg-slate-900 border-2 border-red-500 rounded-b-2xl shadow-2xl shadow-red-500/30">
          {/* Node selector (if multiple SOS) */}
          {sosNodes.length > 1 && (
            <div className="flex border-b border-slate-800 px-6 pt-4 gap-2">
              {sosNodes.map(n => (
                <button key={n.nodeId}
                  onClick={() => setActiveNode(n)}
                  className={`px-3 py-1 rounded font-mono text-xs ${
                    activeNode?.nodeId === n.nodeId
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                  {n.nodeId}
                </button>
              ))}
            </div>
          )}

          <div className="p-6">
            {/* Location header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-red-400 font-mono text-xs uppercase tracking-widest mb-1">Active Node</div>
                <div className="text-white font-bold text-xl font-mono">{activeNode.nodeId}</div>
                <div className="text-slate-400 font-mono text-sm">
                  {activeNode.lat?.toFixed(5)}, {activeNode.lon?.toFixed(5)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-red-400 font-mono text-xs uppercase tracking-widest mb-1">Signal</div>
                <div className="text-white font-mono">{activeNode.rssi} dBm</div>
                <div className="text-slate-400 font-mono text-xs">SNR: {activeNode.snr?.toFixed(1)} dB</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700 mb-4">
              {[['info', 'SITUATION'], ['contacts', 'CONTACTS']].map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`px-4 py-2 font-mono text-xs tracking-widest border-b-2 transition-colors
                    ${tab === id ? 'border-red-500 text-red-400' : 'border-transparent text-slate-500'}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'info' && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Temperature', value: `${activeNode.temp?.toFixed(1)}°C`, warn: activeNode.temp < 0 || activeNode.temp > 45 },
                  { label: 'Pressure', value: `${activeNode.pressure?.toFixed(0)} hPa`, warn: activeNode.pressure_trend === -1 },
                  { label: 'Rainfall', value: `${activeNode.rain_mm?.toFixed(1)} mm/hr`, warn: activeNode.rain_mm > 5 },
                  { label: 'PM 2.5', value: `${activeNode.pm2_5} μg/m³`, warn: activeNode.pm2_5 > 55 },
                  { label: 'Sound', value: `${activeNode.sound_db?.toFixed(0)} dB`, warn: false },
                  { label: 'Altitude', value: `${activeNode.altitude?.toFixed(0)} m`, warn: false },
                ].map(({ label, value, warn }) => (
                  <div key={label} className={`p-3 rounded-lg border text-center
                    ${warn ? 'bg-red-900/30 border-red-700' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="text-slate-400 text-xs font-mono uppercase mb-1">{label}</div>
                    <div className={`font-bold font-mono ${warn ? 'text-red-400' : 'text-white'}`}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'contacts' && (
              <div className="space-y-3 mb-4">
                {activeNode.bloodGroup && (
                  <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 flex items-center gap-3">
                    <span className="text-2xl">🩸</span>
                    <div>
                      <div className="text-red-400 font-mono text-xs uppercase">Blood Group</div>
                      <div className="text-white font-bold font-mono text-lg">{activeNode.bloodGroup}</div>
                    </div>
                  </div>
                )}
                {(activeNode.emergencyContacts || []).map((c, i) => (
                  <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="text-white font-mono font-bold">{c.name}</div>
                      <div className="text-slate-400 font-mono text-sm">{c.relation}</div>
                    </div>
                    <a href={`tel:${c.phone}`}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-mono text-sm font-bold transition-colors">
                      📞 {c.phone}
                    </a>
                  </div>
                ))}
                {(!activeNode.emergencyContacts || activeNode.emergencyContacts.length === 0) && (
                  <p className="text-slate-500 font-mono text-sm text-center py-4">No emergency contacts registered</p>
                )}
              </div>
            )}

            {/* Navigation links */}
            <div className="flex gap-2 mb-4">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-center py-2 rounded-lg font-mono text-sm font-bold transition-colors">
                🗺 OpenStreetMap
              </a>
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-center py-2 rounded-lg font-mono text-sm font-bold transition-colors">
                📍 Google Maps
              </a>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button onClick={() => handleResolve('false_alarm')} disabled={resolving}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-mono font-bold transition-colors disabled:opacity-50">
                FALSE ALARM
              </button>
              <button onClick={() => handleResolve('resolved')} disabled={resolving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-mono font-bold transition-colors disabled:opacity-50">
                {resolving ? 'RESOLVING...' : '✓ MARK RESOLVED'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}