/**
 * AdminTrackingMap.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in Leaflet tracking map for AdminDashboard.jsx.
 *
 * Receives:
 *   • Socket.io "state-snapshot", "location-update", "tracking-status",
 *     "user-connected", "user-disconnected", "sos-event" from the server
 *   • Renders a live Leaflet map with per-user markers + trail polylines
 *   • Sidebar: active user list, timestamps, filter controls
 *   • SOS overlay with one-click zoom + alert banner
 *   • Auto-pan toggle, trail toggle, marker cluster overview
 *
 * Props:
 *   serverUrl  — tracking server URL
 *   adminToken — JWT with role:"admin"
 *
 * Add as its own page "Live Tracking" inside AdminDashboard's page router.
 *
 * npm install socket.io-client
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

/* ── Design tokens ────────────────────────────────────────────────────────── */
const C = {
  bg:"#080f1a", sidebar:"#0b1422",
  card:"rgba(255,255,255,0.04)", border:"rgba(80,140,220,0.14)",
  border2:"rgba(80,140,220,0.28)", accent:"#3b82f6",
  green:"#22c55e", amber:"#f59e0b", red:"#ef4444", purple:"#a78bfa",
  teal:"#14b8a6", text:"#e2e8f0", muted:"rgba(180,210,245,0.5)",
  muted2:"rgba(180,210,245,0.28)",
};

/* ── Leaflet singleton loader ─────────────────────────────────────────────── */
const LCSS = "leaflet-css-v194";
const LJS  = "leaflet-js-v194";
const ensureLeaflet = (cb) => {
  if (window.L) { cb(); return; }
  if (!document.getElementById(LCSS)) {
    const css = document.createElement("link");
    css.id = LCSS; css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
  }
  if (!document.getElementById(LJS)) {
    const js = document.createElement("script");
    js.id = LJS; js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    document.head.appendChild(js);
  }
  const poll = setInterval(() => { if (window.L) { clearInterval(poll); cb(); } }, 80);
};

/* ── Inject styles once ───────────────────────────────────────────────────── */
const injectStyles = (() => {
  let done = false;
  return () => {
    if (done) return; done = true;
    const s = document.createElement("style");
    s.textContent = `
      @keyframes atm-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      @keyframes atm-ring  { 0%{transform:translate(-50%,-50%) scale(.3);opacity:.9} 100%{transform:translate(-50%,-50%) scale(2.6);opacity:0} }
      @keyframes atm-spin  { to{transform:rotate(360deg)} }
      .leaflet-container   { background:#08101e !important; }
      .leaflet-tile-pane   { filter:saturate(.85) brightness(.9); }
      .leaflet-popup-content-wrapper {
        background:#0b1422;color:#e2e8f0;
        border:1px solid rgba(80,140,220,0.25);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.7);
      }
      .leaflet-popup-content { margin:10px 14px;font-family:sans-serif;font-size:12px;line-height:1.6; }
      .leaflet-popup-tip     { background:#0b1422; }
      .leaflet-popup-close-button { color:#94a3b8 !important; }
      .leaflet-control-zoom { border:1px solid rgba(80,140,220,0.25)!important;border-radius:8px!important;overflow:hidden; }
      .leaflet-control-zoom a { background:rgba(11,20,34,.95)!important;color:#e2e8f0!important;
        border-bottom:1px solid rgba(80,140,220,0.2)!important;font-size:16px!important; }
      .leaflet-control-zoom a:hover { background:rgba(59,130,246,0.18)!important; }
      .leaflet-control-attribution { background:rgba(8,15,26,.7)!important;color:#64748b!important;font-size:9px!important; }
    `;
    document.head.appendChild(s);
  };
})();

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const AVATAR_COLORS = [
  ["#E6F1FB","#0C447C"],["#EAF3DE","#3B6D11"],["#FAEEDA","#854F0B"],
  ["#FCEBEB","#A32D2D"],["#F4C0D1","#72243E"],["#E8E6FB","#2D1179"],
];

function userAvatarColors(userId) {
  const idx = (userId?.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : ts);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 5)  return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec/60)}m ago`;
  return `${Math.floor(diffSec/3600)}h ago`;
}

function makeUserIcon(L, user) {
  const isSOS    = user.sosActive;
  const isActive = user.isTracking;
  const color    = isSOS ? "#ef4444" : isActive ? "#3b82f6" : "#6b7280";
  const size     = isSOS ? 14 : 11;
  const pulse    = isSOS || isActive;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size+18}px;height:${size+18}px;">
      ${pulse ? `<div style="position:absolute;top:50%;left:50%;width:${size+10}px;height:${size+10}px;
        border-radius:50%;border:2px solid ${color};animation:atm-ring 1.8s ease-out infinite;"></div>` : ""}
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:${size}px;height:${size}px;border-radius:50%;background:${color};
        border:2px solid #fff;box-shadow:0 0 0 3px ${color}44;z-index:1;"></div>
    </div>`,
    iconSize:  [size+18, size+18],
    iconAnchor:[(size+18)/2, (size+18)/2],
    popupAnchor:[0, -(size/2+10)],
  });
}

function makePopupHtml(user) {
  const color = user.sosActive?"#ef4444":user.isTracking?"#22c55e":"#6b7280";
  return `
    <div style="min-width:180px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(59,130,246,0.18);
          color:#93c5fd;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${(user.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)}
        </div>
        <div>
          <b style="color:#e2e8f0">${user.name || user.userId}</b><br>
          <span style="color:${color};font-size:10px;font-weight:600;text-transform:uppercase">
            ${user.sosActive?"🚨 SOS":user.isTracking?"● Tracking":"○ Offline"}
          </span>
        </div>
      </div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
        Lat: ${user.lat?.toFixed(5) ?? "—"}<br>
        Lon: ${user.lon?.toFixed(5) ?? "—"}<br>
        ${user.accuracy ? `Accuracy: ±${user.accuracy?.toFixed(0)}m<br>` : ""}
        ${user.speed    ? `Speed: ${(user.speed*3.6).toFixed(1)} km/h<br>` : ""}
        ${user.battery  ? `Battery: ${user.battery}%<br>` : ""}
        Last seen: ${fmtTs(user.lastSeen)}
      </div>
    </div>
  `;
}

/* ── Shared UI atoms ─────────────────────────────────────────────────────── */
const Card = ({ children, style }) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",...style}}>
    {children}
  </div>
);
const Pill = ({ color, children }) => {
  const m = {
    green:{bg:"rgba(34,197,94,0.12)",t:"#86efac"},red:{bg:"rgba(239,68,68,0.12)",t:"#fca5a5"},
    amber:{bg:"rgba(245,158,11,0.12)",t:"#fcd34d"},blue:{bg:"rgba(59,130,246,0.14)",t:"#93c5fd"},
    gray:{bg:"rgba(255,255,255,0.07)",t:"rgba(180,210,245,0.6)"},
  };
  const s = m[color]||m.gray;
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:500,background:s.bg,color:s.t}}>{children}</span>;
};

/* ── Main component ───────────────────────────────────────────────────────── */
export default function AdminTrackingMap({
  serverUrl  = "http://localhost:4000",
  adminToken = "REPLACE_WITH_ADMIN_JWT",
}) {
  /* Map state */
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const markersRef      = useRef({});   // userId → { marker, trail: L.Polyline, trailPoints:[] }
  const [mapReady,      setMapReady]      = useState(false);

  /* User data state */
  const [users,         setUsers]         = useState({});  // userId → user object
  const [sosEvents,     setSosEvents]     = useState([]);
  const [selectedUser,  setSelectedUser]  = useState(null);

  /* Control state */
  const [autoPan,       setAutoPan]       = useState(true);
  const [showTrails,    setShowTrails]    = useState(true);
  const [filter,        setFilter]        = useState("all"); // all|tracking|sos|offline
  const [connState,     setConnState]     = useState("disconnected");
  const [lastSync,      setLastSync]      = useState(null);
  const [tickCount,     setTickCount]     = useState(0);

  /* Socket ref */
  const socketRef = useRef(null);

  // ── Re-render timestamps every 10 s ───────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTickCount(n=>n+1), 10_000);
    return () => clearInterval(t);
  }, []);

  // ── Leaflet init ───────────────────────────────────────────────────────────
  useEffect(() => {
    injectStyles();
    ensureLeaflet(() => {
      if (mapRef.current || !mapContainerRef.current) return;
      const L   = window.L;
      const map = L.map(mapContainerRef.current, {
        center: [20.5937, 78.9629], zoom: 5,
        zoomControl: true, preferCanvas: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
        maxZoom: 19,
      }).addTo(map);

      // Legend overlay
      const legend = L.control({ position: "bottomleft" });
      legend.onAdd = () => {
        const div = L.DomUtil.create("div");
        div.style.cssText = "background:rgba(8,15,26,0.92);border:1px solid rgba(80,140,220,0.22);border-radius:9px;padding:9px 13px;pointer-events:none;font-family:sans-serif;";
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:10px;color:rgba(180,210,245,0.5)"><div style="width:9px;height:9px;border-radius:50%;background:#3b82f6;border:1.5px solid #fff;"></div>Tracking</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:10px;color:rgba(180,210,245,0.5)"><div style="width:9px;height:9px;border-radius:50%;background:#ef4444;border:1.5px solid #fff;"></div>SOS Alert</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:rgba(180,210,245,0.5)"><div style="width:9px;height:9px;border-radius:50%;background:#6b7280;border:1.5px solid #fff;"></div>Offline</div>`;
        return div;
      };
      legend.addTo(map);
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // ── Socket.io connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!adminToken) return;
    setConnState("connecting");
    const socket = io(serverUrl, {
      auth:              { token: adminToken },
      transports:        ["websocket", "polling"],
      reconnection:      true,
      reconnectionDelay: 2000,
    });

    socket.on("connect",         () => { setConnState("connected"); setLastSync(Date.now()); });
    socket.on("disconnect",      () => setConnState("disconnected"));
    socket.on("connect_error",   () => setConnState("error"));

    // Full state snapshot on admin connect
    socket.on("state-snapshot", (snapshot) => {
      const map = {};
      snapshot.forEach(u => { map[u.userId] = u; });
      setUsers(map);
      setLastSync(Date.now());
    });

    // Incremental updates
    socket.on("location-update", (u) => {
      setUsers(prev => ({ ...prev, [u.userId]: { ...(prev[u.userId]||{}), ...u } }));
      setLastSync(Date.now());
    });

    socket.on("tracking-status", ({ userId, isTracking }) => {
      setUsers(prev => prev[userId] ? { ...prev, [userId]: { ...prev[userId], isTracking } } : prev);
    });

    socket.on("user-connected",    (u) => setUsers(prev => ({ ...prev, [u.userId]: u })));
    socket.on("user-disconnected", ({ userId }) => {
      setUsers(prev => prev[userId] ? { ...prev, [userId]: { ...prev[userId], isTracking:false, socketId:null } } : prev);
    });
    socket.on("user-removed",      ({ userId }) => {
      setUsers(prev => { const n={...prev}; delete n[userId]; return n; });
    });

    socket.on("sos-event", (event) => {
      setSosEvents(prev => [event, ...prev].slice(0, 20));
      if (event.type === "sos-cancel") {
        setUsers(prev => prev[event.userId] ? { ...prev, [event.userId]: { ...prev[event.userId], sosActive:false } } : prev);
      } else if (event.type === "sos-trigger") {
        setUsers(prev => prev[event.userId] ? { ...prev, [event.userId]: { ...prev[event.userId], sosActive:true } } : prev);
      }
    });

    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [serverUrl, adminToken]);

  // ── Sync Leaflet markers when users state changes ─────────────────────────
  const usersKey = JSON.stringify(
    Object.values(users).map(u => `${u.userId}:${u.lat}:${u.lon}:${u.isTracking}:${u.sosActive}`)
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const L   = window.L;
    const map = mapRef.current;

    Object.values(users).forEach((user) => {
      if (user.lat == null || user.lon == null) return;
      const pos = [user.lat, user.lon];
      const uid = user.userId;

      if (!markersRef.current[uid]) {
        // New user — create marker + trail
        const marker = L.marker(pos, { icon: makeUserIcon(L, user) })
          .addTo(map)
          .bindPopup(makePopupHtml(user));

        const trail = L.polyline([], {
          color: user.sosActive ? "#ef4444" : "#3b82f6",
          weight: 2, opacity: 0.6, dashArray: "4 4",
        }).addTo(map);

        marker.on("click", () => setSelectedUser(uid));
        markersRef.current[uid] = { marker, trail, trailPoints: [] };
      } else {
        // Existing user — update position + icon + popup
        const entry = markersRef.current[uid];
        entry.marker.setLatLng(pos);
        entry.marker.setIcon(makeUserIcon(L, user));
        entry.marker.setPopupContent(makePopupHtml(user));

        // Append trail point
        entry.trailPoints.push(pos);
        if (entry.trailPoints.length > 50) entry.trailPoints.shift();
        if (showTrails) {
          entry.trail.setLatLngs(entry.trailPoints);
          entry.trail.setStyle({ color: user.sosActive ? "#ef4444" : "#3b82f6" });
        } else {
          entry.trail.setLatLngs([]);
        }
      }

      // Auto-pan to SOS or latest update
      if (autoPan && (user.sosActive || user.isTracking)) {
        map.panTo(pos, { animate: true, duration: 0.5 });
      }
    });

    // Remove markers for users no longer in state
    Object.keys(markersRef.current).forEach((uid) => {
      if (!users[uid]) {
        const entry = markersRef.current[uid];
        map.removeLayer(entry.marker);
        map.removeLayer(entry.trail);
        delete markersRef.current[uid];
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, usersKey, showTrails, autoPan]);

  // ── Trail visibility toggle ────────────────────────────────────────────────
  useEffect(() => {
    Object.values(markersRef.current).forEach(({ trail, trailPoints }) => {
      trail.setLatLngs(showTrails ? trailPoints : []);
    });
  }, [showTrails]);

  // ── Zoom to user ───────────────────────────────────────────────────────────
  const zoomToUser = useCallback((uid) => {
    const user = users[uid];
    if (!user?.lat || !mapRef.current) return;
    mapRef.current.flyTo([user.lat, user.lon], 15, { duration: 1.2 });
    markersRef.current[uid]?.marker?.openPopup();
    setSelectedUser(uid);
  }, [users]);

  // ── Filtered user list ─────────────────────────────────────────────────────
  const filteredUsers = Object.values(users).filter(u => {
    if (filter === "tracking") return u.isTracking && !u.sosActive;
    if (filter === "sos")      return u.sosActive;
    if (filter === "offline")  return !u.isTracking && !u.sosActive;
    return true;
  }).sort((a,b) => {
    if (a.sosActive && !b.sosActive)  return -1;
    if (!a.sosActive && b.sosActive)  return 1;
    if (a.isTracking && !b.isTracking) return -1;
    if (!a.isTracking && b.isTracking) return 1;
    return 0;
  });

  const totalUsers    = Object.keys(users).length;
  const trackingCount = Object.values(users).filter(u=>u.isTracking).length;
  const sosCount      = Object.values(users).filter(u=>u.sosActive).length;
  const offlineCount  = totalUsers - trackingCount;

  const activeSosEvents = sosEvents.filter(e=>e.type==="sos-trigger");

  return (
    <div style={{fontFamily:"system-ui,sans-serif",color:C.text}}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:600,color:C.text,margin:0}}>Live User Tracking</h1>
          <div style={{fontSize:12,color:C.muted,marginTop:3}}>
            Real-time GPS positions · Socket.io
            {lastSync && ` · Updated ${fmtTs(lastSync)}`}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,padding:"4px 10px",
            borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)"}}>
            <div style={{width:7,height:7,borderRadius:"50%",
              background:connState==="connected"?C.green:connState==="connecting"?C.amber:C.red,
              animation:connState==="connected"?"atm-pulse 2s infinite":undefined}}/>
            <span style={{color:connState==="connected"?C.green:connState==="connecting"?C.amber:C.red}}>
              {connState}
            </span>
          </div>
          <Pill color="blue">{totalUsers} total</Pill>
          <Pill color="green">{trackingCount} tracking</Pill>
          {sosCount > 0 && <Pill color="red">🚨 {sosCount} SOS</Pill>}
          <Pill color="gray">{offlineCount} offline</Pill>
        </div>
      </div>

      {/* ── Active SOS banner ─────────────────────────────────────────────── */}
      {activeSosEvents.length > 0 && (
        <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.4)",
          borderRadius:12,padding:"12px 16px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#fca5a5",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>
            🚨 Active SOS Alerts ({activeSosEvents.length})
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {activeSosEvents.map((ev, i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,fontSize:12}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:C.red,
                  animation:"atm-pulse 1s infinite",flexShrink:0}}/>
                <strong style={{color:"#fca5a5"}}>{ev.name}</strong>
                <span style={{color:C.muted}}>{ev.message}</span>
                <span style={{color:C.muted2,marginLeft:"auto",fontFamily:"monospace"}}>{fmtTs(ev.timestamp)}</span>
                <button onClick={() => zoomToUser(ev.userId)}
                  style={{padding:"3px 10px",background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",
                    borderRadius:7,color:"#fca5a5",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                  Navigate →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14}}>

        {/* Map */}
        <div>
          {/* Map controls */}
          <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:C.muted,
              padding:"5px 12px",border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer"}}
              onClick={() => setAutoPan(x=>!x)}>
              <div style={{width:14,height:14,border:`1.5px solid ${autoPan?C.accent:C.muted}`,borderRadius:3,
                background:autoPan?"rgba(59,130,246,0.2)":"transparent",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>
                {autoPan?"✓":""}
              </div>
              Auto-pan
            </div>
            <div style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:C.muted,
              padding:"5px 12px",border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer"}}
              onClick={() => setShowTrails(x=>!x)}>
              <div style={{width:14,height:14,border:`1.5px solid ${showTrails?C.teal:C.muted}`,borderRadius:3,
                background:showTrails?"rgba(20,184,166,0.2)":"transparent",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>
                {showTrails?"✓":""}
              </div>
              Show trails
            </div>
            <button onClick={() => {
              if (mapRef.current && Object.values(users).some(u=>u.lat)) {
                const L = window.L;
                const bounds = Object.values(users)
                  .filter(u=>u.lat&&u.lon)
                  .map(u=>[u.lat,u.lon]);
                if (bounds.length) mapRef.current.fitBounds(bounds, {padding:[40,40],maxZoom:12});
              }
            }} style={{marginLeft:"auto",padding:"5px 14px",background:"rgba(255,255,255,0.04)",
              border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontSize:12,cursor:"pointer",
              fontFamily:"inherit"}}>
              🌐 Fit all
            </button>
          </div>

          {/* Leaflet container */}
          <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`,position:"relative"}}>
            {!mapReady && (
              <div style={{height:500,background:"#08101e",display:"flex",alignItems:"center",
                justifyContent:"center",color:C.muted,fontSize:13,gap:8}}>
                <span style={{animation:"atm-spin 1s linear infinite",display:"inline-block"}}>⟳</span>
                Initialising map engine…
              </div>
            )}
            <div ref={mapContainerRef} style={{height:500,display:mapReady?"block":"none"}}/>
          </div>

          {/* Stats strip */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
            {[
              {label:"Online Users",  value:totalUsers,    color:C.accent,   icon:"👤"},
              {label:"Live Tracking", value:trackingCount, color:C.green,    icon:"📍"},
              {label:"SOS Active",    value:sosCount,      color:C.red,      icon:"🚨"},
              {label:"Offline",       value:offlineCount,  color:C.muted,    icon:"⭕"},
            ].map(({ label, value, color, icon }) => (
              <Card key={label} style={{marginBottom:0,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:3}}>{icon}</div>
                <div style={{fontSize:22,fontWeight:700,color}}>{value}</div>
                <div style={{fontSize:10,color:C.muted2,marginTop:1}}>{label}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* Sidebar: user list */}
        <div style={{display:"flex",flexDirection:"column",gap:10,maxHeight:620,overflow:"hidden"}}>

          {/* Filter tabs */}
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {[["all","All"],["tracking","Tracking"],["sos","SOS"],["offline","Offline"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)}
                style={{padding:"4px 12px",borderRadius:8,
                  border:`1px solid ${filter===v?C.accent:C.border}`,
                  background:filter===v?"rgba(59,130,246,0.12)":"transparent",
                  color:filter===v?C.accent:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                {l}
              </button>
            ))}
          </div>

          {/* User scroll list */}
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
            {filteredUsers.length === 0 && (
              <div style={{color:C.muted2,fontSize:12,textAlign:"center",padding:"24px 0"}}>
                No users in this filter.
              </div>
            )}
            {filteredUsers.map((user) => {
              const [abg, atxt] = userAvatarColors(user.userId);
              const isSelected  = selectedUser === user.userId;
              const col = user.sosActive ? C.red : user.isTracking ? C.green : C.muted;

              return (
                <div key={user.userId}
                  onClick={() => zoomToUser(user.userId)}
                  style={{
                    background: isSelected ? "rgba(59,130,246,0.08)" : C.card,
                    border: `1px solid ${isSelected ? C.border2 : user.sosActive ? "rgba(239,68,68,0.35)" : C.border}`,
                    borderRadius:12, padding:"10px 12px", cursor:"pointer",
                    transition:"background 0.15s,border-color 0.15s",
                  }}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    {/* Avatar */}
                    <div style={{width:34,height:34,borderRadius:"50%",background:abg,color:atxt,
                      fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",
                      flexShrink:0,position:"relative"}}>
                      {(user.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)}
                      {user.isTracking && (
                        <div style={{position:"absolute",bottom:1,right:1,width:8,height:8,
                          borderRadius:"50%",background:user.sosActive?C.red:C.green,
                          border:"1.5px solid #0b1422",animation:"atm-pulse 1.5s infinite"}}/>
                      )}
                    </div>

                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                        <div style={{fontSize:12,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {user.name || user.userId}
                        </div>
                        {user.sosActive && (
                          <span style={{fontSize:9,background:"rgba(239,68,68,0.15)",color:"#fca5a5",
                            border:"1px solid rgba(239,68,68,0.3)",borderRadius:6,padding:"1px 6px",
                            fontWeight:700,flexShrink:0}}>SOS</span>
                        )}
                      </div>

                      <div style={{fontSize:10,color:C.muted2,marginBottom:4,display:"flex",gap:8}}>
                        <span style={{color:col,fontWeight:500}}>
                          {user.sosActive?"🚨 SOS":user.isTracking?"● Live":"○ Offline"}
                        </span>
                        <span>·</span>
                        <span>{fmtTs(user.lastSeen)}</span>
                      </div>

                      {user.lat && (
                        <div style={{fontSize:9,color:C.muted2,fontFamily:"monospace",lineHeight:1.4}}>
                          {user.lat.toFixed(4)}°N {user.lon.toFixed(4)}°E
                          {user.accuracy && ` ±${user.accuracy.toFixed(0)}m`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trail / detail row */}
                  {isSelected && user.lat && (
                    <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,
                      display:"flex",gap:6,flexWrap:"wrap"}}>
                      {user.battery != null && (
                        <span style={{fontSize:10,color:C.muted2}}>🔋 {user.battery}%</span>
                      )}
                      {user.speed != null && user.speed > 0 && (
                        <span style={{fontSize:10,color:C.muted2}}>💨 {(user.speed*3.6).toFixed(1)} km/h</span>
                      )}
                      <button onClick={(e)=>{e.stopPropagation();markersRef.current[user.userId]?.marker?.openPopup();}}
                        style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",background:"rgba(59,130,246,0.1)",
                          border:"1px solid rgba(59,130,246,0.25)",borderRadius:6,color:"#93c5fd",cursor:"pointer",fontFamily:"inherit"}}>
                        Open popup
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Event log */}
          {sosEvents.length > 0 && (
            <Card style={{padding:"10px 12px",flexShrink:0}}>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>
                Recent Events
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:130,overflowY:"auto"}}>
                {sosEvents.slice(0,10).map((ev,i)=>(
                  <div key={i} style={{display:"flex",gap:8,fontSize:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:12,flexShrink:0,marginTop:-1}}>
                      {ev.type==="sos-trigger"?"🚨":ev.type==="sos-cancel"?"✅":"📍"}
                    </span>
                    <div style={{flex:1}}>
                      <span style={{color:C.text,fontWeight:500}}>{ev.name}</span>
                      <span style={{color:C.muted2}}> · {ev.type==="sos-trigger"?"SOS triggered":ev.type==="sos-cancel"?"SOS cancelled":"location update"}</span>
                    </div>
                    <span style={{color:C.muted2,flexShrink:0,fontFamily:"monospace"}}>{fmtTs(ev.timestamp)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}