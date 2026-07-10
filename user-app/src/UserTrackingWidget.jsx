/**
 * UserTrackingWidget.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in component for UserDashboard.jsx.
 *
 * Provides:
 *   • HTTPS guard with friendly error state
 *   • Permission flow (prompt → granted / denied)
 *   • Start / Stop tracking toggle button
 *   • Live privacy status banner (animated green dot when active)
 *   • Mini Leaflet map showing current position + accuracy circle
 *   • Connection status, last update timestamp, coordinates display
 *   • Background tracking status (Service Worker / periodic sync)
 *   • SOS quick-trigger (wired to parent's activeSOS state)
 *
 * Props:
 *   user       — { id, name, role, blood, medical } (from CURRENT_USER)
 *   serverUrl  — tracking server URL, e.g. "https://track.nimbus.travel"
 *   token      — JWT from your auth system
 *   activeSOS  — boolean (from parent state)
 *   onSOS      — (boolean) => void
 *
 * Add to PageDashboard or as its own nav page "Live Tracking"
 *
 * npm install socket.io-client
 * Copy useLocationTracking.js to the same directory
 */

import React, { useState, useEffect, useRef } from "react";
import { useLocationTracking } from "./useLocationTracking";

/* ── Design tokens (mirror the dashboard) ────────────────────────────────── */
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

/* ── Inject keyframes once ────────────────────────────────────────────────── */
const injectStyles = (() => {
  let done = false;
  return () => {
    if (done) return; done = true;
    const s = document.createElement("style");
    s.textContent = `
      @keyframes utw-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      @keyframes utw-ring  { 0%{transform:translate(-50%,-50%) scale(.3);opacity:.9} 100%{transform:translate(-50%,-50%) scale(2.5);opacity:0} }
      @keyframes utw-spin  { to{transform:rotate(360deg)} }
      .leaflet-container { background:#08101e !important; }
      .leaflet-tile-pane { filter:saturate(.85) brightness(.9); }
      .leaflet-popup-content-wrapper { background:#0b1422;color:#e2e8f0;border:1px solid rgba(80,140,220,0.25);border-radius:10px; }
      .leaflet-popup-tip  { background:#0b1422; }
      .leaflet-control-zoom { border:1px solid rgba(80,140,220,0.25)!important;border-radius:8px!important;overflow:hidden; }
      .leaflet-control-zoom a { background:rgba(11,20,34,0.95)!important;color:#e2e8f0!important;border-bottom:1px solid rgba(80,140,220,0.2)!important; }
      .leaflet-control-attribution { background:rgba(8,15,26,.7)!important;color:#64748b!important;font-size:9px!important; }
    `;
    document.head.appendChild(s);
  };
})();

/* ── Shared UI atoms ─────────────────────────────────────────────────────── */
const Card  = ({ children, style }) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",...style}}>
    {children}
  </div>
);
const Pill  = ({ color, children }) => {
  const m = {
    green:{bg:"rgba(34,197,94,0.12)",t:"#86efac"},red:{bg:"rgba(239,68,68,0.12)",t:"#fca5a5"},
    amber:{bg:"rgba(245,158,11,0.12)",t:"#fcd34d"},blue:{bg:"rgba(59,130,246,0.14)",t:"#93c5fd"},
    gray:{bg:"rgba(255,255,255,0.07)",t:"rgba(180,210,245,0.6)"},
    teal:{bg:"rgba(20,184,166,0.12)",t:"#5eead4"},
  };
  const s = m[color]||m.gray;
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:500,background:s.bg,color:s.t}}>{children}</span>;
};

/* ── Mini Leaflet map for user's own position ────────────────────────────── */
const MiniMap = ({ position, accuracy, height = 260 }) => {
  const ref    = useRef(null);
  const mapRef = useRef(null);
  const mkRef  = useRef(null);
  const circleRef = useRef(null);
  const [rdy, setRdy] = useState(!!window.L);

  useEffect(() => { injectStyles(); ensureLeaflet(() => setRdy(true)); }, []);

  useEffect(() => {
    if (!rdy || !ref.current || mapRef.current) return;
    const L   = window.L;
    const lat = position?.lat ?? 18.5196;
    const lon = position?.lon ?? 73.8554;
    const map = L.map(ref.current, { center:[lat,lon], zoom:15, zoomControl:true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:"© OpenStreetMap", maxZoom:19 }).addTo(map);
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [rdy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker & accuracy circle when position changes
  useEffect(() => {
    if (!rdy || !mapRef.current || !position) return;
    const L   = window.L;
    const map = mapRef.current;
    const { lat, lon } = position;

    if (!mkRef.current) {
      // Build animated user-position icon
      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:28px;height:28px;">
          <div style="position:absolute;top:50%;left:50%;width:18px;height:18px;border-radius:50%;
            border:2px solid #3b82f6;animation:utw-ring 1.8s ease-out infinite;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:12px;height:12px;border-radius:50%;background:#3b82f6;
            border:2px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.3);"></div>
        </div>`,
        iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-16],
      });
      mkRef.current = L.marker([lat,lon],{icon}).addTo(map)
        .bindPopup(`<b>📍 Your Location</b><br>${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`)
        .openPopup();
    } else {
      mkRef.current.setLatLng([lat,lon]);
      mkRef.current.openPopup();
    }

    // Accuracy circle
    if (accuracy) {
      if (!circleRef.current) {
        circleRef.current = L.circle([lat,lon],{
          radius: accuracy, color:"#3b82f6", weight:1.5,
          opacity:0.5, fill:true, fillColor:"#3b82f6", fillOpacity:0.07,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng([lat,lon]).setRadius(accuracy);
      }
    }

    map.panTo([lat,lon], { animate:true, duration:0.5 });
  }, [rdy, position, accuracy]);

  return (
    <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
      {!rdy && (
        <div style={{height,background:"#08101e",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13,gap:8}}>
          <span style={{animation:"utw-spin 1s linear infinite",display:"inline-block"}}>⟳</span>
          Loading map…
        </div>
      )}
      <div ref={ref} style={{height,display:rdy?"block":"none"}}/>
    </div>
  );
};

/* ── Connection status dot ───────────────────────────────────────────────── */
const ConnectionDot = ({ state }) => {
  const cfg = {
    connected:    { color:C.green,  label:"Connected"   },
    connecting:   { color:C.amber,  label:"Connecting…" },
    error:        { color:C.red,    label:"Error"       },
    disconnected: { color:C.muted,  label:"Offline"     },
  };
  const { color, label } = cfg[state] || cfg.disconnected;
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:color,
        animation:state==="connected"?"utw-pulse 2s infinite":undefined}}/>
      <span style={{color}}>{label}</span>
    </div>
  );
};

/* ── Main widget component ────────────────────────────────────────────────── */
export default function UserTrackingWidget({
  user,
  serverUrl = "http://localhost:4000",
  token     = "REPLACE_WITH_JWT",
  activeSOS = false,
  onSOS,
  onTokenExpired,
}) {
  const [showPrivacyNote, setShowPrivacyNote] = useState(false);
  const [sosConfirm,      setSosConfirm]      = useState(false);

  const tracking = useLocationTracking({
    userId:    user?.id    || "U001",
    name:      user?.name  || "Explorer",
    token,
    serverUrl,
    onSOSAck:  (d) => console.log("[SOS ack]", d),
    onTokenExpired,
  });

  const {
    isTracking, permissionState, position, accuracy, error,
    connectionState, sosActive, lastUpdateTs, isHttps, swRegistered,
    startTracking, stopTracking, triggerSOS, cancelSOS,
  } = tracking;

  const handleToggle = () => {
    if (isTracking) stopTracking();
    else            startTracking();
  };

  const handleSOS = () => {
    if (!sosConfirm) { setSosConfirm(true); return; }
    setSosConfirm(false);
    triggerSOS({ blood: user?.blood, medical: user?.medical });
    onSOS?.(true);
  };

  const handleCancelSOS = () => {
    cancelSOS();
    setSosConfirm(false);
    onSOS?.(false);
  };

  const fmtTs = (ts) => ts ? new Date(ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "—";

  return (
    <div style={{fontFamily:"system-ui,sans-serif",color:C.text}}>

      {/* ── HTTPS warning ──────────────────────────────────────────────────── */}
      {!isHttps && (
        <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.35)",
          borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#fca5a5",
          display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>⚠️</span>
          <span>
            <strong>HTTPS required.</strong> Geolocation API is blocked on insecure (HTTP) origins.
            Please use <code>https://</code> or <code>localhost</code>.
          </span>
        </div>
      )}

      {/* ── Live Tracking Status Banner ────────────────────────────────────── */}
      {isTracking && (
        <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.3)",
          borderRadius:12,padding:"12px 18px",marginBottom:16,
          display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:C.green,
            animation:"utw-pulse 1.2s infinite",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:C.green}}>🛰️ Live Location Sharing Active</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>
              Your GPS coordinates are being shared with the Nimbus admin in real-time.
              {swRegistered && " Background sync enabled."}
            </div>
          </div>
          <button onClick={()=>setShowPrivacyNote(x=>!x)}
            style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
              color:C.muted,fontSize:11,cursor:"pointer",padding:"4px 10px",fontFamily:"inherit"}}>
            {showPrivacyNote?"Hide":"Privacy ⓘ"}
          </button>
        </div>
      )}

      {/* Privacy note */}
      {showPrivacyNote && (
        <Card style={{marginBottom:16,borderColor:"rgba(167,139,250,0.25)",background:"rgba(167,139,250,0.04)"}}>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Privacy Notice</div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
            Your precise GPS coordinates, accuracy radius, and movement speed are transmitted
            to the Nimbus secure server over an encrypted WebSocket (WSS) connection.
            This data is accessible only to authorised admins and rescue teams.
            Location data is not stored permanently — it is held in memory for your active session
            and purged 60 seconds after you disconnect.
            You may stop sharing at any time by tapping <strong style={{color:C.text}}>"Stop Tracking"</strong>.
          </div>
        </Card>
      )}

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:14}}>

        {/* Left: map */}
        <div>
          <MiniMap position={position} accuracy={accuracy} height={300}/>
          {/* Coords strip under map */}
          <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,color:C.muted2,flexWrap:"wrap"}}>
            <span>Lat: <strong style={{color:C.text,fontFamily:"monospace"}}>{position?.lat.toFixed(5)??"—"}</strong></span>
            <span>Lon: <strong style={{color:C.text,fontFamily:"monospace"}}>{position?.lon.toFixed(5)??"—"}</strong></span>
            {accuracy && <span>±<strong style={{color:C.amber}}>{accuracy.toFixed(0)}m</strong></span>}
            <span style={{marginLeft:"auto"}}>Last update: <strong style={{color:C.text}}>{fmtTs(lastUpdateTs)}</strong></span>
          </div>
        </div>

        {/* Right: controls panel */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>

          {/* Connection state */}
          <Card style={{padding:"12px 14px"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>
              Connection
            </div>
            <ConnectionDot state={connectionState}/>
            <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
              {[
                ["Server",    serverUrl.replace("https://","").replace("http://","").split("/")[0]],
                ["WebSocket", connectionState==="connected"?"WSS active":"—"],
                ["SW Sync",   swRegistered?"Registered":"Not registered"],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted2}}>{k}</span>
                  <span style={{color:C.text,fontFamily:"monospace"}}>{v}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Tracking toggle */}
          <Card style={{borderColor: isTracking?"rgba(34,197,94,0.35)":C.border}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
              Location Tracking
            </div>

            {/* Permission state indicator */}
            {permissionState==="denied" && (
              <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",
                borderRadius:8,padding:"8px 10px",fontSize:11,color:"#fca5a5",marginBottom:10}}>
                🔒 Permission denied. Open browser settings → Site permissions → Location → Allow.
              </div>
            )}
            {permissionState==="unsupported" && (
              <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",
                borderRadius:8,padding:"8px 10px",fontSize:11,color:"#fcd34d",marginBottom:10}}>
                ⚠️ Geolocation not supported by this browser.
              </div>
            )}

            <button onClick={handleToggle}
              disabled={!isHttps || permissionState==="unsupported"}
              style={{
                width:"100%", padding:"11px",
                background: isTracking
                  ? "rgba(239,68,68,0.12)"
                  : `linear-gradient(135deg,${C.accent},#1d4ed8)`,
                border: isTracking ? "1px solid rgba(239,68,68,0.35)" : "none",
                borderRadius:10, color: isTracking ? "#fca5a5" : "#fff",
                fontSize:13, fontWeight:700, cursor:"pointer",
                fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}>
              {isTracking ? "⏹ Stop Tracking" : "▶ Start Tracking"}
            </button>

            {isTracking && (
              <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:C.muted}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:C.green,animation:"utw-pulse 1.2s infinite"}}/>
                  GPS watchPosition active
                </div>
                {swRegistered && (
                  <div style={{fontSize:11,color:C.muted,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10}}>🔄</span>
                    Background sync enabled
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Error display */}
          {error && (
            <Card style={{borderColor:"rgba(239,68,68,0.35)",padding:"10px 14px"}}>
              <div style={{fontSize:12,color:"#fca5a5"}}>⚠️ {error}</div>
            </Card>
          )}

          {/* Status summary */}
          <Card style={{padding:"12px 14px"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Status</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {[
                ["Permission",   permissionState],
                ["Tracking",     isTracking?"Active":"Inactive"],
                ["Tab visible",  !document.hidden?"Yes":"No (background)"],
                ["HTTPS",        isHttps?"✓ Secure":"✗ Insecure"],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11,
                  padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted2}}>{k}</span>
                  <span style={{color:
                    v==="Active"||v.startsWith("✓")||v==="granted"||v==="Yes"?C.green:
                    v==="Inactive"||v==="No (background)"||v==="prompt"?C.muted:
                    v.startsWith("✗")||v==="denied"?C.red:C.text,
                    fontWeight:500, textTransform:"capitalize"}}>{v}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* SOS in tracking context */}
          <Card style={{borderColor:"rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.03)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Emergency SOS</div>
            {(sosActive || activeSOS) ? (
              <div style={{marginBottom:10,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
                borderRadius:8,padding:"8px 10px",fontSize:11,color:"#fca5a5",fontWeight:600}}>
                🚨 SOS Active — your location is being broadcast to rescue teams
              </div>
            ) : sosConfirm ? (
              <div style={{marginBottom:10,background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",
                borderRadius:8,padding:"8px 10px",fontSize:11,color:"#fcd34d",fontWeight:600}}>
                ⚠️ Confirm SOS? This will alert rescue teams and your emergency contacts.
              </div>
            ) : null}
            <div style={{display:"flex",gap:8}}>
              {(sosActive || activeSOS)
                ? <button onClick={handleCancelSOS}
                    style={{flex:1,padding:"8px",background:"transparent",border:"1px solid rgba(239,68,68,0.35)",
                      borderRadius:9,color:"#fca5a5",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    ✕ Cancel SOS
                  </button>
                : <button onClick={handleSOS}
                    style={{flex:1,padding:"8px",
                      background:sosConfirm?`linear-gradient(135deg,${C.amber},#b45309)`: `linear-gradient(135deg,${C.red},#991b1b)`,
                      border:"none",borderRadius:9,color:"#fff",fontSize:12,fontWeight:700,
                      cursor:"pointer",fontFamily:"inherit"}}>
                    {sosConfirm?"Confirm SOS 🆘":"🆘 SOS"}
                  </button>}
              {sosConfirm && !sosActive && !activeSOS && (
                <button onClick={()=>setSosConfirm(false)}
                  style={{padding:"8px 14px",background:"transparent",border:`1px solid ${C.border}`,
                    borderRadius:9,color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  Cancel
                </button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
