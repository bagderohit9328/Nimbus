import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAdminTracking } from "./hooks/useAdminTracking";
import { createSafetyProtocol, deleteSafetyProtocol, subscribeToSafetyProtocols, updateSafetyProtocol } from "./services/firebase";

/* ════════════════════════════════════════════════
   DESIGN TOKENS
════════════════════════════════════════════════ */
const C = {
  bg: "#080f1a", sidebar: "#0b1422", panel: "rgba(11,20,34,0.95)",
  card: "rgba(255,255,255,0.04)", border: "rgba(80,140,220,0.14)",
  border2: "rgba(80,140,220,0.28)", accent: "#3b82f6", accent2: "#1d4ed8",
  green: "#22c55e", amber: "#f59e0b", red: "#ef4444", purple: "#a78bfa",
  teal: "#14b8a6", text: "#e2e8f0", muted: "rgba(180,210,245,0.5)", muted2: "rgba(180,210,245,0.28)",
};

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "http://localhost:5000/api";

const USERS = [
  { id:"U001",name:"Aryan Rao", email:"aryan@nimbus.travel", role:"Explorer Pro", status:"active", lat:18.52, lon:73.85, city:"Pune", lastSeen:"2 min ago", trips:12, devices:3, avatar:"AR", color:["#E6F1FB","#0C447C"], blood:"B+", medical:"None" },
];

const BOOKINGS = [
  {id:"BK001",user:"Aryan Rao",dest:"Kerala Backwaters",date:"May 3–8, 2026",persons:1,price:"₹24,000",status:"pending",type:"single"},
];

const DEVICES = [
  {id:"DEV001",name:"iPhone 15 Pro",user:"Aryan Rao",type:"phone",battery:78,signal:"strong",gps:true,sos:true,lat:18.52,lon:73.85},
  {id:"DEV002",name:"Garmin Instinct 2",user:"Aryan Rao",type:"watch",battery:92,signal:"strong",gps:true,sos:true,lat:18.52,lon:73.85},
];

const BT_DEVICES = [
  {id:"BT001",name:"Aryan's Garmin",mac:"A4:C1:38:1F:22:B5",rssi:-42,type:"watch",paired:true,user:"Aryan Rao"},
  {id:"BT003",name:"Tile Mate",mac:"7C:64:56:D8:3A:F1",rssi:-75,type:"tracker",paired:false,user:null},
  {id:"BT004",name:"Polar H10",mac:"00:22:D0:AA:3C:88",rssi:-58,type:"sensor",paired:false,user:null},
];

const SOS_EVENTS = [
  {id:"SOS001",user:"Aryan Rao",userId:"U001",city:"Pune",lat:18.52,lon:73.85,time:"14:32",status:"active",type:"Manual trigger",team:"Team 1",priority:"critical",blood:"B+",medical:"None",phone:"+91 99001 22334",ec:"Self · Aryan Rao · +91 98765 11221"},
];

const SOS_TEAMS = [
  {id:"T001",name:"Team 1",lead:"Response Lead",members:4,status:"deployed",lat:18.60,lon:73.90,heading:45,speed:"45 km/h",eta:"8 min",vehicle:"Ambulance",assignedTo:"SOS001"},
];

const PROTOCOLS = [
  {id:"P001",title:"Arrival & check-in protocol",body:"Upon arriving at the trek base, register at the check-in kiosk. Confirm your emergency contacts and ensure your device GPS is active.",status:"published",updated:"Apr 10, 2026",author:"Admin"},
  {id:"P002",title:"Daily check-in rules",body:"Send a live-status ping every 4 hours during active trekking. If no ping is received within 6 hours, the system triggers an automatic welfare check.",status:"published",updated:"Apr 8, 2026",author:"Admin"},
  {id:"P003",title:"Offline & no-signal zones",body:"Carry a LoRa-enabled satellite communicator when entering zones marked orange on your map. Pre-download offline maps before departure.",status:"draft",updated:"Apr 11, 2026",author:"Admin"},
  {id:"P004",title:"SOS trigger procedure",body:"Press and hold the SOS button for 3 seconds to prevent accidental triggers. The system broadcasts your GPS coordinates and medical profile to the nearest rescue team.",status:"published",updated:"Mar 28, 2026",author:"Admin"},
  {id:"P005",title:"Medical emergency guidelines",body:"Your blood group and medical conditions are auto-shared with any dispatched rescue team. Use the medical alert shortcut on your dashboard before triggering SOS.",status:"draft",updated:"Apr 9, 2026",author:"Admin"},
];

const FEATURES = ["Weather","Weather Maps","Trip Booking","Safety Protocol","Device Connect","Emergency SOS","Live Navigation","Bluetooth Devices"];

const Pill = ({ color, children }) => {
  const map = { green:{bg:"rgba(34,197,94,0.12)",text:"#86efac"},red:{bg:"rgba(239,68,68,0.12)",text:"#fca5a5"},amber:{bg:"rgba(245,158,11,0.12)",text:"#fcd34d"},blue:{bg:"rgba(59,130,246,0.14)",text:"#93c5fd"},purple:{bg:"rgba(167,139,250,0.12)",text:"#c4b5fd"},teal:{bg:"rgba(20,184,166,0.12)",text:"#5eead4"},gray:{bg:"rgba(255,255,255,0.07)",text:"rgba(180,210,245,0.6)"} };
  const s = map[color] || map.gray;
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:500,background:s.bg,color:s.text}}>{children}</span>;
};
const Card = ({ children, style }) => <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",...style}}>{children}</div>;
const StatCard = ({ label, value, sub, color=C.accent, icon }) => (
  <Card style={{marginBottom:0}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
      {icon && <span style={{fontSize:18}}>{icon}</span>}
    </div>
    <div style={{fontSize:26,fontWeight:700,color,marginBottom:2}}>{value}</div>
    {sub && <div style={{fontSize:11,color:C.muted2}}>{sub}</div>}
  </Card>
);
const TH = ({ children, style }) => <th style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",padding:"10px 12px",textAlign:"left",fontWeight:500,borderBottom:`1px solid ${C.border}`,...style}}>{children}</th>;
const TD = ({ children, style }) => <td style={{fontSize:13,padding:"11px 12px",color:C.text,borderBottom:`1px solid ${C.border}`,verticalAlign:"middle",...style}}>{children}</td>;
const Avatar = ({ initials, bg, text, size=32 }) => <div style={{width:size,height:size,borderRadius:"50%",background:bg||"rgba(59,130,246,0.18)",color:text||C.accent,fontSize:size*0.35,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{initials}</div>;
const Toggle = ({ on, onChange }) => <div onClick={onChange} style={{width:36,height:20,borderRadius:10,background:on?C.accent:"rgba(255,255,255,0.12)",position:"relative",cursor:"pointer",transition:"background 0.25s",flexShrink:0}}><div style={{position:"absolute",top:3,left:on?19:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.25s"}}/></div>;
const Input = ({ value, onChange, placeholder, type="text", style:sx }) => <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{height:36,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,padding:"0 12px",fontFamily:"inherit",boxSizing:"border-box",outline:"none",...sx}}/>;
const Btn = ({ children, onClick, variant="default", style:sx }) => {
  const v = { primary:{background:C.accent,color:"#fff",border:"none"}, danger:{background:C.red,color:"#fff",border:"none"}, success:{background:"rgba(34,197,94,0.15)",color:C.green,border:`1px solid rgba(34,197,94,0.3)`}, default:{background:"rgba(255,255,255,0.05)",color:C.text,border:`1px solid ${C.border}`}, ghost:{background:"transparent",color:C.muted,border:"none"} };
  return <button onClick={onClick} style={{padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6,...v[variant],...sx}}>{children}</button>;
};
const PageHeader = ({ title, sub, right }) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
    <div><h1 style={{fontSize:20,fontWeight:600,color:C.text,margin:0}}>{title}</h1>{sub && <div style={{fontSize:12,color:C.muted,marginTop:3}}>{sub}</div>}</div>
    {right}
  </div>
);

const LEAFLET_CSS_ID = "leaflet-css-v194";
const LEAFLET_JS_ID = "leaflet-js-v194";

const ensureLeaflet = (onReady) => {
  if (window.L) { onReady(); return; }
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const css = document.createElement("link");
    css.id = LEAFLET_CSS_ID; css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
  }
  if (!document.getElementById(LEAFLET_JS_ID)) {
    const js = document.createElement("script");
    js.id = LEAFLET_JS_ID; js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    document.head.appendChild(js);
  }
  const poll = setInterval(() => { if (window.L) { clearInterval(poll); onReady(); } }, 80);
};

const injectLeafletStyles = (() => {
  let done = false;
  return () => {
    if (done) return; done = true;
    const s = document.createElement("style");
    s.textContent = `
      @keyframes llm-pulse { 0% { transform:translate(-50%,-50%) scale(.4); opacity:.8; } 100% { transform:translate(-50%,-50%) scale(2.6); opacity:0; } }
      .leaflet-container { background:#08101e !important; }
      .leaflet-tile-pane { filter: saturate(.85) brightness(.92); }
      .leaflet-popup-content-wrapper { background:#0b1422; color:#e2e8f0; border:1px solid rgba(80,140,220,0.25); border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,.6); }
      .leaflet-popup-content { margin:10px 14px; font-family:sans-serif; font-size:12px; line-height:1.5; }
      .leaflet-popup-tip { background:#0b1422; }
      .leaflet-control-zoom { border:1px solid rgba(80,140,220,0.25) !important; border-radius:8px !important; overflow:hidden; }
      .leaflet-control-zoom a { background:rgba(11,20,34,0.95) !important; color:#e2e8f0 !important; border-bottom:1px solid rgba(80,140,220,0.2) !important; font-size:16px !important; }
      .leaflet-control-zoom a:hover { background:rgba(59,130,246,0.18) !important; }
      .leaflet-control-attribution { background:rgba(8,15,26,0.7) !important; color:#64748b !important; font-size:9px !important; }
    `;
    document.head.appendChild(s);
  };
})();

const makeDotIcon = (L, color, size=12, pulse=false, ringColor=null) => L.divIcon({
  className: "",
  html: `<div style="position:relative;width:${size+16}px;height:${size+16}px;">
    ${pulse ? `<div style="position:absolute;top:50%;left:50%;width:${size+10}px;height:${size+10}px;border-radius:50%;border:2.5px solid ${ringColor||color};animation:llm-pulse 1.6s ease-out infinite;"></div>` : ""}
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 4px ${color}44,0 2px 8px rgba(0,0,0,.5);z-index:1;"></div>
  </div>`,
  iconSize: [size+16, size+16],
  iconAnchor: [(size+16)/2, (size+16)/2],
  popupAnchor: [0, -(size/2+10)],
});

const makeTeamIcon = (L, name, deployed) => {
  const label = name.replace("Team ", "");
  const bg = deployed ? "#f59e0b" : "rgba(100,100,100,0.7)";
  return L.divIcon({
    className: "",
    html: `<div style="background:${bg};border-radius:7px;padding:3px 9px;font-size:10px;font-weight:800;color:#000;white-space:nowrap;box-shadow:0 2px 10px ${bg}88;border:1.5px solid rgba(255,255,255,0.3);">${label}</div>`,
    iconSize: null, iconAnchor: [22, 13], popupAnchor: [0, -16],
  });
};

const buildFallbackRoute = (selectedSOS) => {
  if (!selectedSOS) return [];

  const destination = selectedSOS.city || "target";
  const distanceLabel = selectedSOS.lat && selectedSOS.lon
    ? `${Math.max(1, Math.round(Math.abs(selectedSOS.lat) + Math.abs(selectedSOS.lon)))} km`
    : "target area";

  return [
    { icon: "🚨", instr: `Leave base and head toward ${destination}`, dist: `Initial response: ${distanceLabel}`, road: "Emergency response route" },
    { icon: "🛣️", instr: "Stay on the fastest open road", dist: "Keep siren and hazard lights active", road: "Primary access corridor" },
    { icon: "↗", instr: `Follow live guidance to ${selectedSOS.user}`, dist: `Updated ETA will track continuously`, road: "Live reroute enabled" },
    { icon: "📍", instr: "Approach the incident location carefully", dist: "Slow down near the target", road: "Final approach" },
    { icon: "✅", instr: "Arrive, confirm patient status, and report in", dist: "Hand off to on-ground team", road: "On-scene check-in" },
  ];
};

const LiveMap = ({ points=[], teams=[], height=380, showPulse=true, routeFrom=null, routeTo=null, routePath=null, zoom:_zoom, onZoom }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeRef = useRef(null);
  const [ready, setReady] = useState(!!window.L);

  useEffect(() => { injectLeafletStyles(); ensureLeaflet(() => setReady(true)); }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = window.L;
    const map = L.map(containerRef.current, { center:[20.5937,78.9629], zoom:5, zoomControl:true, attributionControl:true, preferCanvas:true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution:"© <a href='https://www.openstreetmap.org/copyright' style='color:#64748b'>OpenStreetMap</a>", maxZoom:19 }).addTo(map);
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [ready]);

  const pointsKey = JSON.stringify(points.map(p=>({id:p.id,lat:p.lat,lon:p.lon,status:p.status})));
  const teamsKey = JSON.stringify(teams.map(t=>({id:t.id,lat:t.lat,lon:t.lon,status:t.status})));

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const L = window.L; const map = mapRef.current;
    markersRef.current.forEach((m) => map.removeLayer(m)); markersRef.current = [];

    points.forEach((p) => {
      const isSOS = p.status === "sos";
      const isActive = p.status === "active";
      const color = isSOS ? "#ef4444" : isActive ? "#3b82f6" : "#6b7280";
      const pulse = showPulse && (isSOS || isActive);
      const size = isSOS ? 14 : 10;
      const icon = makeDotIcon(L, color, size, pulse, isSOS ? "#ef4444" : "#3b82f6");
      const popup = `<b>${p.name}</b><br><span style="color:#94a3b8">${p.city}</span><span style="margin:0 6px;color:#334155">·</span><span style="color:${color};font-weight:600;text-transform:capitalize">${p.status}</span>${p.blood ? `<br>🩸 ${p.blood}` : ""}${p.medical && p.medical !== "None" ? `<br>⚕ ${p.medical}` : ""}`;
      const mk = L.marker([p.lat, p.lon], { icon }).addTo(map).bindPopup(popup);
      markersRef.current.push(mk);
    });

    teams.forEach((t) => {
      const icon = makeTeamIcon(L, t.name, t.status === "deployed");
      const popup = `<b>${t.name}</b><br><span style="color:#94a3b8">${t.vehicle}</span> · ${t.lead}<br>Speed: <b>${t.speed}</b> · ETA: <b style="color:#22c55e">${t.eta}</b>`;
      const mk = L.marker([t.lat, t.lon], { icon }).addTo(map).bindPopup(popup);
      markersRef.current.push(mk);
    });
  }, [ready, pointsKey, teamsKey, showPulse]);

  const routeKey = JSON.stringify({ rf: routeFrom ? {lat:routeFrom.lat,lon:routeFrom.lon} : null, rt: routeTo ? {lat:routeTo.lat,lon:routeTo.lon} : null, rp: Array.isArray(routePath) ? routePath.slice(0, 8) : null });

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const L = window.L; const map = mapRef.current;
    if (routeRef.current) { map.removeLayer(routeRef.current); routeRef.current = null; }

    if ((routeFrom && routeTo) || Array.isArray(routePath)) {
      const from = routeFrom && [routeFrom.lat, routeFrom.lon];
      const to = routeTo && [routeTo.lat, routeTo.lon];
      const path = Array.isArray(routePath) && routePath.length > 1 ? routePath.map(([lon, lat]) => [lat, lon]) : [from, to].filter(Boolean);
      const shadow = L.polyline(path, { color:"#f59e0b", weight:6, opacity:0.18 }).addTo(map);
      const line = L.polyline(path, { color:"#f59e0b", weight:3, opacity:0.9, dashArray:"14 10", dashOffset:"0", className:"llm-route-line" }).addTo(map);
      const pulse = to ? L.circleMarker(to, { radius:14, color:"#ef4444", weight:2, opacity:0.5, fill:false, className:"llm-sos-ring" }).addTo(map) : null;
      const group = pulse ? L.layerGroup([shadow, line, pulse]).addTo(map) : L.layerGroup([shadow, line]).addTo(map);
      routeRef.current = group;
      map.fitBounds(path, { padding:[50,50], maxZoom:9 });
    }
  }, [ready, routeKey]);

  return (
    <div style={{ background:"#080f1a", borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}`, position:"relative" }}>
      <div style={{ position:"absolute", top:10, left:10, zIndex:900, background:"rgba(8,15,26,0.92)", border:"1px solid rgba(80,140,220,0.22)", borderRadius:9, padding:"9px 13px", pointerEvents:"none" }}>
        {[[C.accent, "Active user", "dot"], [C.red, "SOS alert", "dot"], [C.amber, "SOS team", "rect"], [C.amber, "Route", "dash"]].map(([col, label, type]) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5, fontSize:10, color:C.muted }}>
            {type==="dot" && <div style={{ width:9, height:9, borderRadius:"50%", background:col, border:"1.5px solid #fff", flexShrink:0 }}/>} 
            {type==="rect" && <div style={{ width:13, height:9, borderRadius:3, background:col, flexShrink:0 }}/>} 
            {type==="dash" && <div style={{ width:14, borderTop:`2.5px dashed ${col}`, flexShrink:0 }}/>} 
            {label}
          </div>
        ))}
      </div>
      {onZoom && (
        <div style={{ position:"absolute", top:10, right:10, zIndex:900, display:"flex", flexDirection:"column", gap:4 }}>
          <button onClick={()=>{ mapRef.current?.zoomIn(); onZoom(1); }} style={{ width:30, height:30, background:"rgba(11,20,34,0.92)", border:`1px solid ${C.border}`, borderRadius:7, color:C.text, fontSize:17, cursor:"pointer", lineHeight:1 }}>+</button>
          <button onClick={()=>{ mapRef.current?.zoomOut(); onZoom(-1); }} style={{ width:30, height:30, background:"rgba(11,20,34,0.92)", border:`1px solid ${C.border}`, borderRadius:7, color:C.text, fontSize:17, cursor:"pointer", lineHeight:1 }}>−</button>
        </div>
      )}
      {!ready ? <div style={{ height, background:"#08101e", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:13, gap:8 }}><span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⏳</span> Loading map engine…</div> : <div ref={containerRef} style={{ height }} />}
    </div>
  );
};

const PageSOSNavigation = ({ users=USERS, sosEvents=[] }) => {
  const liveSOS = useMemo(() => {
    const eventIncidents = sosEvents
      .filter((event) => event?.status !== "resolved")
      .map((event) => {
        const profile = users.find((candidate) => candidate.id === event.userId || candidate.name === event.name);
        const fallback = SOS_EVENTS.find((incident) => incident.userId === event.userId) || SOS_EVENTS.find((incident) => incident.user === event.name) || SOS_EVENTS[0];

        return {
          ...fallback,
          id: event.id || fallback.id,
          userId: event.userId || profile?.id || fallback.userId,
          user: event.name || profile?.name || fallback.user,
          city: profile?.city || fallback.city,
          lat: typeof event.lat === "number" ? event.lat : profile?.lat ?? fallback.lat,
          lon: typeof event.lon === "number" ? event.lon : profile?.lon ?? fallback.lon,
          blood: event.blood || profile?.blood || fallback.blood,
          medical: event.medical || profile?.medical || fallback.medical,
          status: "active",
          ec: profile?.ec || fallback.ec,
          source: "live-sos-event",
        };
      });

    const userIncidents = users
      .filter((user) => user.status === "sos")
      .map((user) => {
        const profile = USERS.find((candidate) => candidate.id === user.id || candidate.name === user.name);
        const fallback = SOS_EVENTS.find((incident) => incident.userId === user.id) || SOS_EVENTS.find((incident) => incident.user === user.name) || SOS_EVENTS[0];

        return {
          ...fallback,
          id: fallback.id,
          userId: user.id,
          user: user.name || profile?.name || fallback.user,
          city: user.city || profile?.city || fallback.city,
          lat: typeof user.lat === "number" ? user.lat : fallback.lat,
          lon: typeof user.lon === "number" ? user.lon : fallback.lon,
          blood: user.blood || profile?.blood || fallback.blood,
          medical: user.medical || profile?.medical || fallback.medical,
          status: "active",
          ec: profile?.ec || fallback.ec,
          source: "live-user-status",
        };
      });

    const merged = new Map();
    [...eventIncidents, ...userIncidents].forEach((incident) => {
      merged.set(incident.userId || incident.id, incident);
    });

    return Array.from(merged.values());
  }, [users, sosEvents]);

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const liveUserRoster = useMemo(() => users.slice(0, 8), [users]);
  const nearestSOS = useMemo(() => {
    if (liveSOS.length === 0) return null;
    const referenceTeam = SOS_TEAMS.find((team) => team.status === "deployed") || SOS_TEAMS[0];
    return liveSOS.reduce((closest, current) => {
      if (!closest) return current;
      return distanceKm(referenceTeam, current) < distanceKm(referenceTeam, closest) ? current : closest;
    }, null);
  }, [liveSOS]);

  const [selectedSOS, setSelectedSOS] = useState(() => liveSOS[0] || SOS_EVENTS.find(e=>e.status==="active"));
  const [navMode, setNavMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [teamPos, setTeamPos] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [dispatched, setDispatched] = useState({});
  const [zoom, setZoom] = useState(1);
  const [voiceOn, setVoiceOn] = useState(true);
  const [calloutMsg, setCalloutMsg] = useState("");

  useEffect(() => {
    if (!liveSOS.length) return;
    setSelectedSOS((current) => {
      if (current) {
        const matched = liveSOS.find((incident) => incident.userId === current.userId);
        if (matched) return matched;
      }
      return nearestSOS || liveSOS[0];
    });
  }, [liveSOS, nearestSOS]);

  const activeSOS = liveSOS;

  const assignedTeam = selectedSOS ? SOS_TEAMS.find(t=>t.assignedTo===selectedSOS.id) : null;
  const steps = selectedSOS ? buildFallbackRoute(selectedSOS) : [];
  const etaVal = assignedTeam ? parseInt(assignedTeam.eta)||0 : 8;
  const remainingEta = Math.max(0, etaVal - Math.floor(elapsed/60));
  const selectedUser = selectedSOS ? userById.get(selectedSOS.userId) : null;
  const selectUserIncident = (user) => {
    const incident = liveSOS.find((item) => item.userId === user.id || item.user === user.name);
    if (incident) {
      setSelectedSOS(incident);
      setCalloutMsg(`${user.name} synced to realtime navigation.`);
      setTimeout(() => setCalloutMsg(""), 2500);
    }
  };

  // Animate team position toward SOS target
  useEffect(()=>{
    if(!selectedSOS||!assignedTeam) return;
    setTeamPos({lat:assignedTeam.lat, lon:assignedTeam.lon});
    const t = setInterval(()=>{
      setTeamPos(prev=>{
        if(!prev) return prev;
        const dlat = (selectedSOS.lat - prev.lat)*0.015;
        const dlon = (selectedSOS.lon - prev.lon)*0.015;
        return {lat:prev.lat+dlat, lon:prev.lon+dlon};
      });
      setElapsed(e=>e+4);
    }, 1000);
    return ()=>clearInterval(t);
  },[selectedSOS, assignedTeam]);

  // Auto-advance nav steps
  useEffect(()=>{
    if(!navMode) return;
    const t = setInterval(()=>setCurrentStep(s=>Math.min(s+1,steps.length-1)),8000);
    return ()=>clearInterval(t);
  },[navMode, steps.length]);

  const handleDispatch = (teamId, sosId) => {
    setDispatched(d=>({...d,[sosId]:teamId}));
    setCalloutMsg("Team dispatched. Navigation started.");
    setTimeout(()=>setCalloutMsg(""),3000);
  };

  const distToTarget = selectedSOS && teamPos ? (
    Math.sqrt(Math.pow((selectedSOS.lat-teamPos.lat)*111,2)+Math.pow((selectedSOS.lon-teamPos.lon)*111,2)).toFixed(1)
  ) : "—";

  const speedKmh = assignedTeam ? parseInt(assignedTeam.speed)||0 : 0;
  const compass = assignedTeam?.heading||45;

  // ── Navigation Mode (fullscreen overlay) ──
  if(navMode && selectedSOS) {
    const step = steps[currentStep]||steps[0];
    const pct = ((currentStep)/(steps.length-1))*100;
    return (
      <div style={{position:"fixed",inset:0,background:"#0a0f1e",zIndex:200,display:"flex",flexDirection:"column",fontFamily:"inherit",color:C.text}}>
        {/* Top bar */}
        <div style={{background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:C.red,boxShadow:`0 0 8px ${C.red}`,animation:"ping 1s infinite"}}/>
            <span style={{fontSize:14,fontWeight:600}}>LIVE SOS NAVIGATION</span>
            <Pill color="red">ACTIVE</Pill>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button onClick={()=>setVoiceOn(v=>!v)} style={{background:voiceOn?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.05)",border:`1px solid ${voiceOn?C.accent:C.border}`,borderRadius:8,padding:"6px 12px",color:voiceOn?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{voiceOn?"🔊 Voice On":"🔇 Voice Off"}</button>
            <button onClick={()=>{setNavMode(false);setCurrentStep(0);}} style={{background:"rgba(239,68,68,0.15)",border:`1px solid rgba(239,68,68,0.3)`,borderRadius:8,padding:"6px 14px",color:C.red,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✕ Exit Navigation</button>
          </div>
        </div>

        {/* Main nav area */}
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 360px",overflow:"hidden"}}>
          {/* Simulated map view */}
          <div style={{position:"relative",overflow:"hidden",background:"#0d1b2e"}}>
            <LiveMap points={users} teams={assignedTeam?[{...assignedTeam,lat:teamPos?.lat||assignedTeam.lat,lon:teamPos?.lon||assignedTeam.lon}]:[]}
              routeFrom={teamPos||assignedTeam} routeTo={selectedSOS} height={420}/>

            {/* Compass */}
            <div style={{position:"absolute",bottom:24,right:24,width:64,height:64,borderRadius:"50%",background:"rgba(8,15,26,0.92)",border:`2px solid ${C.border2}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="50" height="50" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="23" fill="none" stroke="rgba(80,140,220,0.2)" strokeWidth="1"/>
                <g transform={`rotate(${compass},25,25)`}>
                  <polygon points="25,6 28,25 25,22 22,25" fill={C.red}/>
                  <polygon points="25,44 28,25 25,28 22,25" fill="rgba(255,255,255,0.4)"/>
                </g>
                <text x="25" y="13" textAnchor="middle" fontSize="7" fill={C.red} fontFamily="monospace" fontWeight="700">N</text>
                <text x="25" y="40" textAnchor="middle" fontSize="7" fill={C.muted} fontFamily="monospace">S</text>
                <text x="40" y="28" textAnchor="middle" fontSize="7" fill={C.muted} fontFamily="monospace">E</text>
                <text x="10" y="28" textAnchor="middle" fontSize="7" fill={C.muted} fontFamily="monospace">W</text>
              </svg>
            </div>

            {/* Speed indicator */}
            <div style={{position:"absolute",bottom:24,left:24,background:"rgba(8,15,26,0.92)",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 18px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:800,color:C.text,lineHeight:1}}>{speedKmh}</div>
              <div style={{fontSize:10,color:C.muted,letterSpacing:"0.1em"}}>KM/H</div>
            </div>
          </div>

          {/* Navigation panel */}
          <div style={{background:"#0b1422",borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Current instruction */}
            <div style={{background:`linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05))`,borderBottom:`1px solid ${C.border}`,padding:"20px 18px"}}>
              <div style={{fontSize:48,textAlign:"center",marginBottom:12,lineHeight:1}}>{step?.icon}</div>
              <div style={{fontSize:16,fontWeight:700,textAlign:"center",marginBottom:4,color:C.text}}>{step?.instr}</div>
              {step?.road&&<div style={{fontSize:12,color:C.muted,textAlign:"center"}}>{step.road}</div>}
            </div>

            {/* ETA / Distance */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,background:C.border}}>
              {[["ETA",`${remainingEta} min`,C.green],["Distance",`${distToTarget} km`,C.accent]].map(([l,v,col])=>(
                <div key={l} style={{background:"#0b1422",padding:"14px 18px",textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:800,color:col}}>{v}</div>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:"0.1em",marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:5}}>
                <span>Step {currentStep+1} of {steps.length}</span>
                <span>{Math.round(pct)}% complete</span>
              </div>
              <div style={{height:4,background:"rgba(255,255,255,0.07)",borderRadius:4}}>
                <div style={{height:"100%",borderRadius:4,background:`linear-gradient(90deg,${C.accent},${C.green})`,width:`${pct}%`,transition:"width 0.5s"}}/>
              </div>
            </div>

            {/* Turn-by-turn list */}
            <div style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
              {steps.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 18px",background:i===currentStep?"rgba(59,130,246,0.1)":"transparent",borderLeft:`3px solid ${i===currentStep?C.accent:"transparent"}`,transition:"background 0.3s"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:i===currentStep?"rgba(59,130,246,0.25)":i<currentStep?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)",border:`1px solid ${i===currentStep?C.accent:i<currentStep?C.green:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,color:i<currentStep?C.green:C.text}}>
                    {i<currentStep?"✓":s.icon}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,color:i===currentStep?C.text:C.muted,fontWeight:i===currentStep?600:400}}>{s.instr}</div>
                    <div style={{fontSize:10,color:C.muted2,marginTop:2}}>{s.dist}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* SOS Target info */}
            <div style={{background:"rgba(239,68,68,0.08)",borderTop:`1px solid rgba(239,68,68,0.2)`,padding:"12px 18px"}}>
              <div style={{fontSize:10,color:"#fca5a5",letterSpacing:"0.1em",marginBottom:6}}>TARGET · SOS VICTIM</div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{selectedSOS.user}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Pill color="red">🩸 {selectedSOS.blood}</Pill>
                {selectedSOS.medical!=="None"&&<Pill color="amber">⚕ {selectedSOS.medical}</Pill>}
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:6}}>EC: {selectedSOS.ec}</div>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div style={{background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",padding:"10px 20px",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setCurrentStep(s=>Math.max(0,s-1))} style={{padding:"8px 16px",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← Prev step</button>
          <button onClick={()=>setCurrentStep(s=>Math.min(steps.length-1,s+1))} style={{padding:"8px 16px",background:C.accent,border:"none",borderRadius:8,color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Next step →</button>
          <div style={{flex:1}}/>
          <div style={{fontSize:11,color:C.muted}}>Assigned: <span style={{color:C.amber}}>{assignedTeam?.name||"—"}</span> · {assignedTeam?.vehicle||"—"} · Lead: {assignedTeam?.lead||"—"}</div>
        </div>
      </div>
    );
  }

  // ── Dashboard view ──
  return (
    <div>
      <PageHeader title="Realtime SOS Navigation"
        sub="Live route tracking — navigate teams to emergency locations"
        right={<div style={{display:"flex",gap:8}}>
          {activeSOS.length>0&&<Pill color="red">🚨 {activeSOS.length} Active SOS</Pill>}
          <Pill color="green">● Live</Pill>
        </div>}/>

      {calloutMsg&&<div style={{background:"rgba(34,197,94,0.1)",border:`1px solid rgba(34,197,94,0.3)`,borderRadius:10,padding:"10px 16px",fontSize:13,color:C.green,marginBottom:14}}>{calloutMsg}</div>}

      <div style={{display:"grid",gridTemplateColumns:"220px 1fr 280px",gap:14}}>

        {/* LEFT: SOS incident list */}
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>SOS Incidents</div>
          {SOS_EVENTS.map(ev=>(
            <Card key={ev.id} onClick={()=>setSelectedSOS(ev)}
              style={{marginBottom:8,cursor:"pointer",borderColor:selectedSOS?.id===ev.id?C.accent:ev.status==="active"?"rgba(239,68,68,0.35)":C.border,background:selectedSOS?.id===ev.id?"rgba(59,130,246,0.08)":C.card}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:ev.status==="active"?C.red:"#555",flexShrink:0}}/>
                <div style={{fontSize:12,fontWeight:600,color:C.text,flex:1}}>{ev.user}</div>
                <Pill color={ev.priority==="critical"?"red":ev.priority==="high"?"amber":"blue"}>{ev.priority}</Pill>
              </div>
              <div style={{fontSize:11,color:C.muted,marginBottom:3}}>📍 {ev.city} · {ev.time}</div>
              <div style={{fontSize:10,color:C.muted2}}>{ev.type}</div>
              <div style={{marginTop:8}}>
                <Pill color={ev.status==="active"?"red":"green"}>{ev.status}</Pill>
              </div>
            </Card>
          ))}

          {/* Stats */}
          <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
            {[["Active SOS",SOS_EVENTS.filter(e=>e.status==="active").length,C.red],["Teams deployed",SOS_TEAMS.filter(t=>t.status==="deployed").length,C.amber],["Resolved",SOS_EVENTS.filter(e=>e.status==="resolved").length,C.green]].map(([l,v,col])=>(
              <Card key={l} style={{marginBottom:0,padding:"10px 14px"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{l}</div>
                <div style={{fontSize:22,fontWeight:700,color:col}}>{v}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* CENTER: Map */}
        <div>
          <LiveMap points={users}
            teams={SOS_TEAMS.filter(t=>t.status==="deployed").map(t=>({...t,lat:teamPos&&assignedTeam?.id===t.id?teamPos.lat:t.lat,lon:teamPos&&assignedTeam?.id===t.id?teamPos.lon:t.lon}))}
            routeFrom={teamPos||assignedTeam||undefined}
            routeTo={selectedSOS||undefined}
            height={400} zoom={zoom} onZoom={d=>setZoom(z=>Math.max(0.5,Math.min(3,z+d*0.5)))}/>

          {/* Navigation stats row */}
          {selectedSOS&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
            <StatCard label="Distance" value={`${distToTarget} km`} sub="to SOS target" color={C.accent} icon="📏"/>
            <StatCard label="ETA" value={`${remainingEta} min`} sub={assignedTeam?.vehicle||"—"} color={C.green} icon="⏱"/>
            <StatCard label="Team speed" value={assignedTeam?.speed||"—"} sub="current" color={C.amber} icon="🚑"/>
            <StatCard label="GPS Acc." value="±6m" sub="Real-time" color={C.purple} icon="🛰"/>
          </div>}

          {/* Launch navigation button */}
          {selectedSOS&&assignedTeam&&<button onClick={()=>{setNavMode(true);setCurrentStep(0);}}
            style={{marginTop:14,width:"100%",padding:"14px",background:`linear-gradient(135deg,${C.red},${C.accent2})`,border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,letterSpacing:"0.04em"}}>
            🗺 LAUNCH REALTIME NAVIGATION → {selectedSOS.city}
          </button>}
        </div>

        {/* RIGHT: Selected SOS detail */}
        <div>
          <Card style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>Live users</div>
                <div style={{fontSize:12,color:C.text,marginTop:2}}>{users.length} current users</div>
              </div>
              <Pill color="green">Realtime</Pill>
            </div>
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
              {liveUserRoster.map((user) => (
                <button
                  key={user.id}
                  onClick={() => selectUserIncident(user)}
                  style={{
                    minWidth:92,
                    border:`1px solid ${selectedUser?.id===user.id?C.accent:C.border}`,
                    background:selectedUser?.id===user.id?"rgba(59,130,246,0.12)":"rgba(255,255,255,0.03)",
                    borderRadius:12,
                    padding:"10px 10px 9px",
                    textAlign:"left",
                    cursor:user.status==="sos"?"pointer":"default",
                    color:C.text,
                    fontFamily:"inherit",
                    flexShrink:0,
                  }}
                >
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <Avatar initials={user.avatar} bg={user.color?.[0]} text={user.color?.[1]} size={28}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div>
                      <div style={{fontSize:9,color:C.muted}}>{user.city}</div>
                    </div>
                  </div>
                  <Pill color={user.status==="sos"?"red":user.status==="active"?"green":"gray"}>{user.status}</Pill>
                </button>
              ))}
            </div>
          </Card>

          {selectedSOS ? <>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Incident Detail</div>

            {/* Victim info */}
            <Card style={{marginBottom:10,borderColor:"rgba(239,68,68,0.3)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <Avatar initials={selectedUser?.avatar||"??"} bg={selectedUser?.color?.[0]} text={selectedUser?.color?.[1]} size={40}/>
                <div><div style={{fontSize:14,fontWeight:600,color:C.text}}>{selectedSOS.user}</div><div style={{fontSize:11,color:C.muted}}>{selectedSOS.city}</div></div>
              </div>
              {[["SOS type",selectedSOS.type],["Time",selectedSOS.time],["Priority",selectedSOS.priority.toUpperCase()],["Coordinates",`${selectedSOS.lat}°N, ${selectedSOS.lon}°E`]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted2}}>{k}</span>
                  <span style={{color:C.text,fontWeight:500,fontFamily:k==="Coordinates"?"monospace":"inherit",fontSize:k==="Coordinates"?10:12}}>{v}</span>
                </div>
              ))}
            </Card>

            {/* Medical info */}
            <Card style={{marginBottom:10,borderColor:"rgba(167,139,250,0.3)"}}>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Medical Info</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                <Pill color="red">🩸 {selectedSOS.blood}</Pill>
                <Pill color={selectedSOS.medical==="None"?"green":"amber"}>{selectedSOS.medical}</Pill>
              </div>
              <div style={{fontSize:11,color:C.muted,marginBottom:3}}>Emergency contact:</div>
              <div style={{fontSize:12,color:C.text}}>{selectedSOS.ec}</div>
              <div style={{marginTop:8}}>
                <Btn variant="success" style={{width:"100%",justifyContent:"center",fontSize:11}}>📞 Call EC</Btn>
              </div>
            </Card>

            {/* Team assignment */}
            <Card style={{marginBottom:10}}>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Assign Rescue Team</div>
              {SOS_TEAMS.map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:500,color:C.text}}>{t.name}</div>
                    <div style={{fontSize:10,color:C.muted}}>{t.vehicle} · {t.members}m · {t.speed}</div>
                  </div>
                  <Pill color={t.status==="deployed"?"amber":"gray"}>{t.status}</Pill>
                  <button onClick={()=>handleDispatch(t.id,selectedSOS.id)}
                    style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${dispatched[selectedSOS.id]===t.id?C.green:C.border}`,background:dispatched[selectedSOS.id]===t.id?"rgba(34,197,94,0.12)":"transparent",color:dispatched[selectedSOS.id]===t.id?C.green:C.muted,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>
                    {dispatched[selectedSOS.id]===t.id?"✓ Assigned":"Assign"}
                  </button>
                </div>
              ))}
            </Card>

            {/* Turn preview */}
            {steps.length>0&&<Card>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Route Preview · {steps.length} turns</div>
              {steps.slice(0,3).map((s,i)=>(
                <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:"rgba(59,130,246,0.1)",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>{s.icon}</div>
                  <div><div style={{fontSize:11,color:C.text}}>{s.instr}</div><div style={{fontSize:9,color:C.muted2}}>{s.dist}</div></div>
                </div>
              ))}
              {steps.length>3&&<div style={{fontSize:10,color:C.muted2,paddingTop:4}}>+{steps.length-3} more steps in navigation mode</div>}
            </Card>}
          </> : <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:300,color:C.muted2,fontSize:13}}>
            <div style={{fontSize:32,marginBottom:8}}>🗺</div>
            Select an SOS incident to view navigation details
          </div>}
        </div>
      </div>

      {/* Team status table */}
      <div style={{marginTop:20}}>
        <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>SOS Team Live Status</div>
        <Card style={{padding:0,overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              {["Team","Lead","Members","Vehicle","Status","Speed","Heading","ETA","Assigned To"].map(h=><TH key={h}>{h}</TH>)}
            </tr></thead>
            <tbody>{SOS_TEAMS.map((t,i)=>{
              const assignedEv=SOS_EVENTS.find(e=>e.id===t.assignedTo);
              return <tr key={t.id} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.012)"}}>
                <TD><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:t.status==="deployed"?C.amber:C.muted2}}/><span style={{fontWeight:500}}>{t.name}</span></div></TD>
                <TD>{t.lead}</TD>
                <TD><Pill color="blue">{t.members} members</Pill></TD>
                <TD>{t.vehicle}</TD>
                <TD><Pill color={t.status==="deployed"?"amber":"gray"}>{t.status}</Pill></TD>
                <TD style={{fontFamily:"monospace",color:t.status==="deployed"?C.green:C.muted}}>{t.speed}</TD>
                <TD style={{fontFamily:"monospace"}}>{t.heading}°</TD>
                <TD style={{color:t.eta==="—"?C.muted:C.amber,fontWeight:500}}>{t.eta}</TD>
                <TD>{assignedEv?<div><div style={{fontSize:12,color:C.text}}>{assignedEv.user}</div><div style={{fontSize:10,color:C.muted}}>{assignedEv.city}</div></div>:<span style={{color:C.muted2}}>—</span>}</TD>
              </tr>;
            })}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: LOGIN
════════════════════════════════════════════════ */
const PageLogin = ({ onLogin }) => {
  const [email,setEmail]=useState(""); const [pass,setPass]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const submit = ()=>{
    if(!email||!pass){setErr("Please fill all fields.");return;}
    setLoading(true);
    setTimeout(()=>{
      if(email==="admin@nimbus.travel"&&pass==="admin123"){onLogin();}
      else{setErr("Invalid credentials. Try admin@nimbus.travel / admin123");setLoading(false);}
    },900);
  };
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-sans)"}}>
      <div style={{position:"fixed",inset:0,backgroundImage:"radial-gradient(circle at 50% 0%,rgba(59,130,246,0.08) 0%,transparent 60%)",pointerEvents:"none"}}/>
      <div style={{position:"fixed",inset:0,backgroundImage:"linear-gradient(rgba(80,140,220,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(80,140,220,0.04) 1px,transparent 1px)",backgroundSize:"44px 44px",pointerEvents:"none"}}/>
      <div style={{width:380,background:C.panel,border:`1px solid ${C.border}`,borderRadius:20,padding:36,position:"relative",backdropFilter:"blur(20px)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:"rgba(59,130,246,0.12)",border:`1px solid rgba(59,130,246,0.3)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={C.accent} strokeWidth="1.5"/><circle cx="12" cy="12" r="4" stroke={C.accent} strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill={C.accent}/></svg>
          </div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:4}}>Nimbus <span style={{color:C.accent}}>Admin</span></div>
          <div style={{fontSize:12,color:C.muted}}>Emergency SOS Control Centre</div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.07em"}}>Email</label>
          <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@nimbus.travel" type="email"/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.07em"}}>Password</label>
          <Input value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" type="password"/>
        </div>
        {err&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#fca5a5",marginBottom:14}}>{err}</div>}
        <button onClick={submit} disabled={loading} style={{width:"100%",padding:"11px",background:`linear-gradient(135deg,${C.accent},${C.accent2})`,border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:loading?0.7:1}}>
          {loading?"Authenticating...":"Sign in to Admin Panel"}
        </button>
        <div style={{textAlign:"center",marginTop:14,fontSize:11,color:C.muted2}}>admin@nimbus.travel · admin123</div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: DASHBOARD
════════════════════════════════════════════════ */
const PageDashboard = ({ navigate, users=USERS }) => {
  const active=users.filter(u=>u.status==="active").length;
  const sos=users.filter(u=>u.status==="sos").length;
  return (
    <div>
      <PageHeader title="Operations Dashboard" sub="Nimbus Travel — Admin Control Centre · April 12, 2026"
        right={<div style={{display:"flex",gap:8}}>{sos>0&&<Pill color="red">🚨 {sos} SOS Active</Pill>}<Pill color="green">● Live</Pill></div>}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <StatCard label="Total users" value={users.length} sub="Registered" color={C.accent} icon="👥"/>
        <StatCard label="Active now" value={active} sub="On platform" color={C.green} icon="📍"/>
        <StatCard label="SOS alerts" value={sos} sub="Needs attention" color={C.red} icon="🚨"/>
        <StatCard label="Teams deployed" value={SOS_TEAMS.filter(t=>t.status==="deployed").length} sub="En route" color={C.amber} icon="🚑"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:14}}>
        <div>
          <LiveMap points={users} teams={SOS_TEAMS} height={360}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:12}}>
            <StatCard label="Bookings" value={BOOKINGS.length} sub="Total" color={C.purple} icon="✈️"/>
            <StatCard label="Devices" value={DEVICES.length} sub="Linked" color={C.teal} icon="📱"/>
            <StatCard label="GPS Accuracy" value="±6m" sub="System-wide" color={C.green} icon="🛰️"/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sos>0&&<Card style={{borderColor:"rgba(239,68,68,0.4)",background:"rgba(239,68,68,0.06)"}}>
            <div style={{fontSize:12,fontWeight:600,color:C.red,marginBottom:8}}>🚨 Active SOS</div>
            {users.filter(u=>u.status==="sos").map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <Avatar initials={u.avatar} bg={u.color[0]} text={u.color[1]}/>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:C.text}}>{u.name}</div><div style={{fontSize:10,color:C.muted}}>📍{u.city} · {u.lastSeen}</div></div>
                <Btn variant="danger" style={{fontSize:10,padding:"4px 8px"}} onClick={()=>navigate("sos-navigation")}>Navigate</Btn>
              </div>
            ))}
          </Card>}
          <Card>
            <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}}>Recent bookings</div>
            {BOOKINGS.slice(0,4).map(b=>(
              <div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
                <span style={{color:C.text}}>{b.dest}</span>
                <Pill color={b.status==="confirmed"?"green":b.status==="pending"?"amber":"red"}>{b.status}</Pill>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}}>SOS Teams</div>
            {SOS_TEAMS.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:t.status==="deployed"?C.amber:C.muted2}}/>
                <div style={{flex:1,fontSize:12,color:C.text}}>{t.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{t.eta!=="—"?`ETA ${t.eta}`:t.status}</div>
              </div>
            ))}
            <button onClick={()=>navigate("sos-navigation")} style={{marginTop:10,fontSize:11,color:C.red,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Launch Navigation →</button>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: ALL USERS
════════════════════════════════════════════════ */
const PageAllUsers = ({ navigate }) => {
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const filtered=USERS.filter(u=>(filter==="all"||u.status===filter)&&(u.name.toLowerCase().includes(search.toLowerCase())||u.city.toLowerCase().includes(search.toLowerCase())));
  const statusColor={active:"green",inactive:"gray",sos:"red"};
  return (
    <div>
      <PageHeader title="All Users" sub={`${USERS.length} registered explorers`}
        right={<div style={{display:"flex",gap:8}}>
          {["all","active","inactive","sos"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${filter===f?C.accent:C.border}`,background:filter===f?"rgba(59,130,246,0.12)":"transparent",color:filter===f?C.accent:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{f}</button>)}
        </div>}/>
      <div style={{marginBottom:14}}><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or city…"/></div>
      <Card style={{padding:0,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><TH>User</TH><TH>City</TH><TH>Role</TH><TH>Status</TH><TH>Last seen</TH><TH>Trips</TH><TH>Devices</TH><TH>Blood</TH><TH>Actions</TH></tr></thead>
          <tbody>{filtered.map((u,i)=>(
            <tr key={u.id} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.012)"}}>
              <TD><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar initials={u.avatar} bg={u.color[0]} text={u.color[1]}/><div><div style={{fontSize:13,fontWeight:500}}>{u.name}</div><div style={{fontSize:11,color:C.muted}}>{u.email}</div></div></div></TD>
              <TD>{u.city}</TD>
              <TD><Pill color="blue">{u.role}</Pill></TD>
              <TD><Pill color={statusColor[u.status]}>{u.status}</Pill></TD>
              <TD style={{color:C.muted}}>{u.lastSeen}</TD>
              <TD>{u.trips}</TD>
              <TD>{u.devices}</TD>
              <TD><Pill color="red">🩸 {u.blood}</Pill></TD>
              <TD><div style={{display:"flex",gap:6}}>
                {u.status==="sos"&&<Btn variant="danger" style={{fontSize:10,padding:"4px 8px"}} onClick={()=>navigate("sos-navigation")}>🗺 Nav</Btn>}
                <Btn style={{fontSize:10,padding:"4px 8px"}}>Profile</Btn>
              </div></TD>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: DEVICE TRACKING
════════════════════════════════════════════════ */
const PageDeviceTracking = ({ users=USERS, connectionState="disconnected" }) => {
  const [sel,setSel]=useState(null);
  const sigColor={strong:C.green,medium:C.amber,low:C.red};
  const liveByName = useMemo(() => new Map(users.map((user) => [user.name, user])), [users]);
  const liveDevices = DEVICES.map((device) => {
    const liveUser = liveByName.get(device.user);
    return {
      ...device,
      lat: liveUser?.lat ?? device.lat,
      lon: liveUser?.lon ?? device.lon,
      status: liveUser?.status ?? (device.gps ? "active" : "inactive"),
      lastSeen: liveUser?.lastSeen ?? liveUser?.timestamp ?? "—",
    };
  });
  const liveGpsCount = liveDevices.filter((device) => device.gps && device.lat && device.lon).length;
  return (
    <div>
      <PageHeader
        title="Device Tracking"
        sub="Live GPS sync from the user app"
        right={
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <Pill color={connectionState === "connected" ? "green" : connectionState === "connecting" ? "amber" : "red"}>
              {connectionState === "connected" ? "● Live sync" : connectionState === "connecting" ? "⏳ Connecting" : "Disconnected"}
            </Pill>
            <Pill color="green">● {liveGpsCount} GPS active</Pill>
          </div>
        }
      />
      <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:14}}>
        <div>
          <LiveMap points={users} height={360}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:12}}>
            <StatCard label="Total devices" value={liveDevices.length} sub="Registered" color={C.accent} icon="📱"/>
            <StatCard label="GPS tracking" value={liveGpsCount} sub="Live from user app" color={C.green} icon="📡"/>
            <StatCard label="SOS capable" value={liveDevices.filter(d=>d.sos).length} sub="Devices" color={C.purple} icon="🛰️"/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Device list</div>
          {liveDevices.map(d=>(
            <Card key={d.id} style={{cursor:"pointer",borderColor:sel===d.id?C.accent:C.border,background:sel===d.id?"rgba(59,130,246,0.07)":C.card,marginBottom:0}} onClick={()=>setSel(sel===d.id?null:d.id)}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:20,width:36,height:36,background:"rgba(255,255,255,0.05)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {d.type==="phone"?"📱":d.type==="watch"?"⌚":"🛰️"}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text}}>{d.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>{d.user}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:sigColor[d.signal]}}>● {d.signal}</div>
                  <div style={{fontSize:11,color:C.muted2}}>🔋{d.battery}%</div>
                </div>
              </div>
              {sel===d.id&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {[["GPS",d.gps?"Active":"Off"],["SOS",d.sos?"Enabled":"Disabled"],["Live status",d.status],["ID",d.id],["Lat",typeof d.lat === "number" ? d.lat.toFixed(5) : "—"],["Lon",typeof d.lon === "number" ? d.lon.toFixed(5) : "—"],["Signal",d.signal],["Last seen",d.lastSeen || "—"]].map(([k,v])=>(
                    <div key={k}><div style={{fontSize:10,color:C.muted2}}>{k}</div><div style={{fontSize:12,color:C.text}}>{v}</div></div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: FEATURE ACCESS
════════════════════════════════════════════════ */
const PageFeatureAccess = ({ users = [] }) => {
  // Compute initial access state from dynamic users list
  const computeInit = () => {
    const init = {};
    const allUsers = users && users.length > 0 ? users : USERS;
    allUsers.forEach(u => {
      if (!u?.id) return;
      init[u.id] = {};
      FEATURES.forEach(f => {
        init[u.id][f] = u.role === "Explorer Pro" || ["Weather", "Emergency SOS"].includes(f);
      });
    });
    return init;
  };
  
  const [access, setAccess] = useState(computeInit);
  const [saved, setSaved] = useState(false);
  const allUsers = users && users.length > 0 ? users : USERS;
  
  const toggle = (uid, feat) => setAccess(a => ({ ...a, [uid]: { ...a[uid], [feat]: !a[uid][feat] } }));
  const grantAll = uid => setAccess(a => ({ ...a, [uid]: Object.fromEntries(FEATURES.map(f => [f, true])) }));
  const revokeAll = uid => setAccess(a => ({ ...a, [uid]: Object.fromEntries(FEATURES.map(f => [f, false])) }));
  const save = async () => {
    setSaved(true);
    // Save to backend (TODO: implement persistence)
    console.log("Feature access saved:", access);
    setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div>
      <PageHeader title="Feature Access Control" sub="Grant or revoke access per user" right={<Btn variant="primary" onClick={save}>{saved?"✓ Saved":"Save changes"}</Btn>}/>
      {saved&&<div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:10,padding:"10px 16px",fontSize:13,color:"#86efac",marginBottom:16}}>Access settings saved successfully.</div>}
      <Card style={{padding:0,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><TH style={{minWidth:180}}>User</TH>{FEATURES.map(f=><TH key={f} style={{textAlign:"center",minWidth:90,fontSize:10}}>{f}</TH>)}<TH style={{textAlign:"center"}}>Actions</TH></tr></thead>
          <tbody>{allUsers.map((u, i) => (
            <tr key={u.id} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.012)"}}>
              <TD><div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={u.avatar} bg={u.color[0]} text={u.color[1]}/><div><div style={{fontSize:12,fontWeight:500}}>{u.name}</div><Pill color="blue">{u.role}</Pill></div></div></TD>
              {FEATURES.map(f=><TD key={f} style={{textAlign:"center"}}><Toggle on={access[u.id]?.[f]} onChange={()=>toggle(u.id,f)}/></TD>)}
              <TD style={{textAlign:"center"}}><div style={{display:"flex",gap:6,justifyContent:"center"}}><Btn onClick={()=>grantAll(u.id)}>All</Btn><Btn onClick={()=>revokeAll(u.id)}>None</Btn></div></TD>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SAFETY PROTOCOL
════════════════════════════════════════════════ */
const PageSafetyProtocol = () => {
  const [protocols,setProtocols]=useState(PROTOCOLS);
  const [editing,setEditing]=useState(null);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [showNew,setShowNew]=useState(false);
  useEffect(()=>{
    let isMounted = true;
    const unsubscribe = subscribeToSafetyProtocols((items)=>{
      if (!isMounted) return;
      if (items.length > 0) {
        setProtocols(items);
      }
    });
    return ()=>{
      isMounted = false;
      unsubscribe();
    };
  },[]);
  const startEdit=p=>{setEditing(p.id);setTitle(p.title);setBody(p.body || "");setShowNew(false);};
  const saveP=async()=>{
    if(!title.trim()) return;
    const payload={title:title.trim(),body:body.trim(),status:"published",author:"Admin"};
    if(editing) await updateSafetyProtocol(editing,payload);
    else await createSafetyProtocol(payload);
    setEditing(null);setShowNew(false);setTitle("");setBody("");
  };
  return (
    <div>
      <PageHeader title="Safety Protocol Editor" sub="Write and publish safety guidelines"
        right={<Btn variant="primary" onClick={()=>{setShowNew(true);setEditing(null);setTitle("");setBody("");}}>+ New protocol</Btn>}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div>
          {protocols.map(p=>(
            <Card key={p.id} style={{marginBottom:10,borderColor:p.status==="published"?"rgba(34,197,94,0.2)":C.border}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><div style={{fontSize:13,fontWeight:500,color:C.text}}>{p.title}</div><Pill color={p.status==="published"?"green":"amber"}>{p.status}</Pill></div>
                  <div style={{fontSize:11,color:C.muted2}}>Updated {p.updated} · by {p.author}</div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <Btn onClick={()=>startEdit(p)}>Edit</Btn>
                  {p.status==="draft"&&<Btn variant="success" onClick={()=>updateSafetyProtocol(p.id,{status:"published",title:p.title,body:p.body,author:p.author||"Admin"})}>Publish</Btn>}
                  <Btn variant="ghost" onClick={()=>deleteSafetyProtocol(p.id)} style={{color:C.red}}>✕</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
        {(editing||showNew)?<div>
          <Card>
            <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6}}>Protocol title</label>
            <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Emergency weather response" style={{marginBottom:12}}/>
            <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6}}>Protocol body</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)} rows={10} placeholder={"Step 1: ...\nStep 2: ..."}
              style={{width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,padding:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none",lineHeight:1.6,marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <Btn variant="primary" onClick={saveP}>Save &amp; Publish</Btn>
              <Btn onClick={()=>{setEditing(null);setShowNew(false);}}>Cancel</Btn>
            </div>
          </Card>
        </div>:<div style={{display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${C.border}`,borderRadius:14,color:C.muted2,fontSize:13,cursor:"pointer",minHeight:200}} onClick={()=>{setShowNew(true);setTitle("");setBody("");}}>+ Create new protocol</div>}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: BLUETOOTH DEVICES
════════════════════════════════════════════════ */
const PageBluetooth = () => {
  const [devices,setDevices]=useState(BT_DEVICES);
  const [scanning,setScanning]=useState(false);
  const [scanPct,setScanPct]=useState(0);
  const startScan=()=>{setScanning(true);setScanPct(0);const t=setInterval(()=>setScanPct(p=>{if(p>=100){clearInterval(t);setScanning(false);return 100;}return p+8;}),200);};
  const pair=id=>setDevices(ds=>ds.map(d=>d.id===id?{...d,paired:true,user:"Admin"}:d));
  const unpair=id=>setDevices(ds=>ds.map(d=>d.id===id?{...d,paired:false,user:null}:d));
  return (
    <div>
      <PageHeader title="Bluetooth Devices" sub="Scan and manage nearby BT/BLE devices"
        right={<Btn variant="primary" onClick={startScan} style={{opacity:scanning?0.6:1}}>{scanning?`Scanning… ${scanPct}%`:"Start scan"}</Btn>}/>
      {scanning&&<div style={{height:4,background:C.border,borderRadius:4,marginBottom:14,overflow:"hidden"}}><div style={{height:"100%",width:`${scanPct}%`,background:C.accent,borderRadius:4,transition:"width 0.2s"}}/></div>}
      <Card style={{padding:0}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><TH>Device</TH><TH>MAC</TH><TH>RSSI</TH><TH>Type</TH><TH>User</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
          <tbody>{devices.map((d,i)=>(
            <tr key={d.id} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.012)"}}>
              <TD><div style={{fontWeight:500}}>{d.name}</div></TD>
              <TD style={{fontFamily:"monospace",fontSize:11,color:C.muted}}>{d.mac}</TD>
              <TD style={{color:d.rssi>-60?C.green:d.rssi>-70?C.amber:C.red}}>{d.rssi} dBm</TD>
              <TD><Pill color="blue">{d.type}</Pill></TD>
              <TD style={{color:C.muted}}>{d.user||"—"}</TD>
              <TD><Pill color={d.paired?"green":"gray"}>{d.paired?"Paired":"Unpaired"}</Pill></TD>
              <TD><div style={{display:"flex",gap:6}}>{d.paired?<Btn onClick={()=>unpair(d.id)}>Unpair</Btn>:<Btn variant="success" onClick={()=>pair(d.id)}>Pair</Btn>}</div></TD>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SOS ADMIN
════════════════════════════════════════════════ */
const PageSOSAdmin = ({ navigate, users=USERS }) => {
  const [resolvedUserIds,setResolvedUserIds]=useState(() => new Set());

  useEffect(() => {
    setResolvedUserIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const userId of next) {
        const stillSOS = users.some((user) => user.id === userId && user.status === "sos");
        if (!stillSOS) {
          next.delete(userId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [users]);

  const events = useMemo(() => {
    const liveIncidents = users
      .filter((user) => user.status === "sos" && !resolvedUserIds.has(user.id))
      .map((user) => {
        const profile = USERS.find((candidate) => candidate.id === user.id || candidate.name === user.name);
        const template = SOS_EVENTS.find((incident) => incident.userId === user.id) || SOS_EVENTS.find((incident) => incident.user === user.name) || SOS_EVENTS[0];

        return {
          ...template,
          id: template.id,
          userId: user.id,
          user: user.name || profile?.name || template.user,
          city: user.city || profile?.city || template.city,
          lat: typeof user.lat === "number" ? user.lat : template.lat,
          lon: typeof user.lon === "number" ? user.lon : template.lon,
          blood: user.blood || profile?.blood || template.blood,
          medical: user.medical || profile?.medical || template.medical,
          status: "active",
          ec: profile?.ec || template.ec,
          priority: template.priority || "high",
        };
      });

    const acknowledged = users
      .filter((user) => resolvedUserIds.has(user.id))
      .map((user) => {
        const profile = USERS.find((candidate) => candidate.id === user.id || candidate.name === user.name);
        const template = SOS_EVENTS.find((incident) => incident.userId === user.id) || SOS_EVENTS.find((incident) => incident.user === user.name) || SOS_EVENTS[0];

        return {
          ...template,
          id: template.id,
          userId: user.id,
          user: user.name || profile?.name || template.user,
          city: user.city || profile?.city || template.city,
          lat: typeof user.lat === "number" ? user.lat : template.lat,
          lon: typeof user.lon === "number" ? user.lon : template.lon,
          blood: user.blood || profile?.blood || template.blood,
          medical: user.medical || profile?.medical || template.medical,
          status: "resolved",
          ec: profile?.ec || template.ec,
          priority: template.priority || "high",
        };
      });

    const fallbackStatic = liveIncidents.length > 0 ? [] : SOS_EVENTS;
    return [...liveIncidents, ...acknowledged, ...fallbackStatic];
  }, [resolvedUserIds, users]);

  const activeCount = useMemo(() => events.filter((event) => event.status === "active").length, [events]);
  const resolvedCount = useMemo(() => events.filter((event) => event.status === "resolved").length, [events]);

  const resolve = (id) => {
    const incident = events.find((event) => event.id === id);
    if (!incident) return;
    setResolvedUserIds((prev) => new Set(prev).add(incident.userId));
  };
  return (
    <div>
      <PageHeader title="SOS Admin Service" sub="Manage all emergency SOS events"
        right={<div style={{display:"flex",gap:8}}><Pill color="red">🚨 {activeCount} active</Pill><button onClick={()=>navigate("sos-navigation")} style={{padding:"7px 14px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.red},${C.accent2})`,color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>🗺 Navigate</button></div>}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
        <StatCard label="Active SOS" value={activeCount} sub="Needs response" color={C.red} icon="🚨"/>
        <StatCard label="Resolved" value={resolvedCount} sub="Closed" color={C.green} icon="✅"/>
        <StatCard label="Teams deployed" value={SOS_TEAMS.filter(t=>t.status==="deployed").length} sub="En route" color={C.amber} icon="🚑"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
        <div>
          <LiveMap points={users} teams={SOS_TEAMS} height={340}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {events.map(ev=>(
            <Card key={ev.id} style={{borderColor:ev.status==="active"?"rgba(239,68,68,0.4)":C.border,background:ev.status==="active"?"rgba(239,68,68,0.05)":C.card}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:2}}>{ev.user}</div><div style={{fontSize:11,color:C.muted}}>📍{ev.city} · {ev.time}</div></div>
                <Pill color={ev.priority==="critical"?"red":ev.priority==="high"?"amber":"blue"}>{ev.priority}</Pill>
              </div>
              <div style={{fontSize:11,color:C.muted2,marginBottom:8}}>{ev.type} · {ev.team}</div>
              <div style={{display:"flex",gap:6}}>
                <Pill color={ev.status==="active"?"red":"green"}>{ev.status}</Pill>
                {ev.status==="active"&&<>
                  <Btn style={{fontSize:10,padding:"3px 8px"}} onClick={()=>navigate("sos-navigation")}>🗺 Nav</Btn>
                  <Btn variant="success" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>resolve(ev.id)}>✓ Resolve</Btn>
                </>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SOS TEAM TRACKING
════════════════════════════════════════════════ */
const PageSOSTracking = ({ users=USERS }) => (
  <div>
    <PageHeader title="SOS Team Tracking" sub="Live positions of all rescue teams" right={<Pill color="amber">{SOS_TEAMS.filter(t=>t.status==="deployed").length} teams deployed</Pill>}/>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
      <LiveMap points={users} teams={SOS_TEAMS} height={400}/>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {SOS_TEAMS.map(t=>(
          <Card key={t.id} style={{borderColor:t.status==="deployed"?"rgba(245,158,11,0.3)":C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(245,158,11,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🚑</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.text}}>{t.name}</div><div style={{fontSize:11,color:C.muted}}>{t.vehicle} · Lead: {t.lead}</div></div>
              <Pill color={t.status==="deployed"?"amber":"gray"}>{t.status}</Pill>
            </div>
            {[["Members",t.members],["Speed",t.speed],["Heading",`${t.heading}°`],["ETA",t.eta]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span><span style={{color:C.text,fontFamily:"monospace"}}>{v}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  </div>
);

/* ════════════════════════════════════════════════
   PAGE: LIVE TRACKING
════════════════════════════════════════════════ */
const PageLiveTracking = ({ navigate, users=USERS, connectionState="disconnected", error=null }) => {
  const [filter,setFilter]=useState("all");
  const [sel,setSel]=useState(null);
  const displayUsers = users;
  const filtered = filter === "all" ? displayUsers : displayUsers.filter(u => u.status === filter);
  const activeSOSUser = displayUsers.find((user) => user.status === "sos") || null;
  const activeTeam = SOS_TEAMS.find((team) => team.status === "deployed") || SOS_TEAMS[0];
  
  return (
    <div>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12}}>
        <div style={{
          width:8, height:8, borderRadius:"50%", 
          background: connectionState === "connected" ? C.green : connectionState === "connecting" ? C.amber : C.red,
          animation: connectionState === "connecting" ? "pulse 1s infinite" : "none"
        }}/>
        <span style={{fontSize:11, color:C.muted}}>
          Server: <span style={{color: connectionState === "connected" ? C.green : C.red}}>
            {connectionState === "connected" ? "✅ Connected" : connectionState === "connecting" ? "⏳ Connecting..." : "❌ Disconnected"}
          </span>
          {error && <span style={{color:C.red, marginLeft:8}}>Error: {error}</span>}
        </span>
      </div>
      <PageHeader title="Live Navigation & User Tracking" sub="Real-time positions, routes and status"
        right={<div style={{display:"flex",gap:6}}>
          {["all","active","sos"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${filter===f?C.accent:C.border}`,background:filter===f?"rgba(59,130,246,0.12)":"transparent",color:filter===f?C.accent:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{f}</button>)}
        </div>}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14}}>
        <div>
          <LiveMap
            points={filtered}
            teams={SOS_TEAMS.filter(t=>t.status==="deployed")}
            routeFrom={activeTeam}
            routeTo={activeSOSUser}
            height={420}
          />
          {activeSOSUser && (
            <div style={{marginTop:10,background:"rgba(239,68,68,0.08)",border:`1px solid rgba(239,68,68,0.25)`,borderRadius:10,padding:"10px 12px",fontSize:12,color:C.text}}>
              <strong style={{color:C.red}}>Nearest SOS route:</strong> {activeTeam.name} is routed to {activeSOSUser.name} at {activeSOSUser.city}.
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
            <StatCard label="Users tracked" value={displayUsers.filter(u=>u.status==="active").length} sub="Online" color={C.accent} icon="📍"/>
            <StatCard label="SOS active" value={displayUsers.filter(u=>u.status==="sos").length} sub="Alert" color={C.red} icon="🚨"/>
            <StatCard label="Teams deployed" value={SOS_TEAMS.filter(t=>t.status==="deployed").length} sub="Moving" color={C.amber} icon="🚑"/>
            <StatCard label="GPS accuracy" value="±6m" sub="Avg" color={C.green} icon="🛰️"/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:560,overflowY:"auto"}}>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Users</div>
          {filtered.map(u=>(
            <Card key={u.id} onClick={()=>setSel(sel===u.id?null:u.id)} style={{cursor:"pointer",marginBottom:0,borderColor:sel===u.id?C.accent:u.status==="sos"?"rgba(239,68,68,0.4)":C.border,background:sel===u.id?"rgba(59,130,246,0.07)":C.card}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{position:"relative"}}><Avatar initials={u.avatar} bg={u.color[0]} text={u.color[1]}/><div style={{position:"absolute",bottom:0,right:0,width:9,height:9,borderRadius:"50%",background:u.status==="sos"?C.red:u.status==="active"?C.green:"#555",border:"2px solid #080f1a"}}/></div>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:C.text}}>{u.name}</div><div style={{fontSize:10,color:C.muted}}>📍{u.city} · {u.lastSeen}</div></div>
                {u.status==="sos"&&<span>🚨</span>}
              </div>
              {sel===u.id&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                {[["Latitude",`${u.lat?.toFixed(4)}°N` || "—"],["Longitude",`${u.lon?.toFixed(4)}°E` || "—"],["Accuracy", `±${u.accuracy?.toFixed(0)}m` || "—"],["Blood",u.blood],["Medical",u.medical||"—"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0"}}><span style={{color:C.muted2}}>{k}</span><span style={{color:C.text}}>{v}</span></div>
                ))}
                <div style={{marginTop:8,display:"flex",gap:6}}>
                  <Btn style={{flex:1,justifyContent:"center",fontSize:11}} onClick={()=>navigate("sos-navigation")}>🗺 Navigate</Btn>
                  {u.status==="sos"&&<Btn variant="danger" style={{flex:1,justifyContent:"center",fontSize:11}}>SOS Dispatch</Btn>}
                </div>
              </div>}
            </Card>
          ))}
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",margin:"12px 0 4px"}}>SOS Teams</div>
          {SOS_TEAMS.map(t=>(
            <Card key={t.id} style={{marginBottom:0,borderColor:t.status==="deployed"?"rgba(245,158,11,0.3)":C.border}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(245,158,11,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🚑</div>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:C.text}}>{t.name}</div><div style={{fontSize:10,color:C.muted}}>{t.vehicle} · {t.speed} · ETA {t.eta}</div></div>
                <Pill color={t.status==="deployed"?"amber":"gray"}>{t.status}</Pill>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: WEATHER OVERVIEW
════════════════════════════════════════════════ */
const PageWeatherAdmin = () => (
  <div>
    <PageHeader title="Weather Overview" sub="Current conditions across all destinations" right={<Pill color="amber">Heat advisory active</Pill>}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
      {[["Pune","⛅","28°C","Partly cloudy"],["Mumbai","🌧️","26°C","Rain"],["Delhi","☀️","35°C","Sunny"],["Bengaluru","☁️","24°C","Cloudy"]].map(([city,icon,temp,cond])=>(
        <Card key={city} style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,marginBottom:6}}>{city}</div><div style={{fontSize:32,marginBottom:4}}>{icon}</div><div style={{fontSize:24,fontWeight:700,color:C.text}}>{temp}</div><div style={{fontSize:11,color:C.muted2,marginTop:2}}>{cond}</div></Card>
      ))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Card>
        <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:14}}>Destination alerts</div>
        {[["Kerala route alert","Heavy rainfall May 4–6. Coastal roads may flood.","red"],["Rajasthan heat warning","40°+ temps Dec 2026. Recommend early morning.","amber"],["Leh Ladakh — snowfall","Possible snowfall above 4000m Jun 5–7.","blue"]].map(([title,desc,col])=>(
          <div key={title} style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${col==="red"?"rgba(239,68,68,0.25)":col==="amber"?"rgba(245,158,11,0.25)":"rgba(59,130,246,0.2)"}`,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:2}}>{title}</div>
            <div style={{fontSize:11,color:C.muted}}>{desc}</div>
          </div>
        ))}
      </Card>
      <Card>
        <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:14}}>7-day forecast summary</div>
        {["⛅ Today 33°/24°","🌦️ Mon 30°/22°","🌧️ Tue 28°/21°","⛈️ Wed 26°/20°","🌤️ Thu 31°/23°","☀️ Fri 35°/25°","☀️ Sat 36°/26°"].map(d=>(
          <div key={d} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
            <span>{d.split(" ").slice(0,2).join(" ")}</span><span style={{color:C.muted}}>{d.split(" ").slice(2).join(" ")}</span>
          </div>
        ))}
      </Card>
    </div>
  </div>
);

/* ════════════════════════════════════════════════
   LEAFLET MAP — no API key, free tiles, CDN loaded
════════════════════════════════════════════════ */
const TILE_LAYERS = {
  road:      { url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",      attr:"© OpenStreetMap contributors" },
  satellite: { url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr:"© Esri World Imagery" },
  terrain:   { url:"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",        attr:"© OpenTopoMap contributors" },
};

const LeafletMap = ({ height=480, tileType="road", perspective=false, markers=[], center=[18.5196,73.8554], zoom=12 }) => {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);

  /* Use shared loader so no duplicate script tags */
  useEffect(() => { injectLeafletStyles(); ensureLeaflet(() => setLeafletReady(true)); }, []);

  useEffect(() => {
    if (!leafletReady || !containerRef.current) return;
    const L = window.L;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const map = L.map(containerRef.current, { center, zoom, zoomControl:true });
    const { url, attr } = TILE_LAYERS[tileType] || TILE_LAYERS.road;
    L.tileLayer(url, { attribution:attr, maxZoom:19 }).addTo(map);
    const mkIcon = (color="#3b82f6") => L.divIcon({
      className:"",
      html:`<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 5px ${color}44;"></div>`,
      iconSize:[14,14], iconAnchor:[7,7], popupAnchor:[0,-10]
    });
    const station = L.marker(center, { icon:mkIcon("#3b82f6") }).addTo(map);
    station.bindPopup(`<b>📡 Weather Station</b><br><small>Mulshi, Maharashtra<br>18.52°N · 73.85°E · 580m ASL</small>`);
    markers.forEach(m => {
      const mk = L.marker([m.lat,m.lon], { icon:mkIcon(m.color||"#ef4444") }).addTo(map);
      if (m.popup) mk.bindPopup(m.popup);
    });
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [leafletReady, tileType]);

  return (
    <div style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}`, boxShadow:"0 4px 24px rgba(0,0,0,0.4)",
      ...(perspective ? { transform:"perspective(900px) rotateX(28deg)", transformOrigin:"top center" } : {}) }}>
      {!leafletReady && (
        <div style={{height, background:"#080f1a", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:13}}>
          ⏳ Loading map engine…
        </div>
      )}
      <div ref={containerRef} style={{ height, display: leafletReady ? "block" : "none" }}/>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: WEATHER MAPS ADMIN — Live data + Leaflet Maps + Hardware + 3D Nav
════════════════════════════════════════════════ */
const WX_CODES = {
  0:["☀️","Clear sky"],1:["🌤️","Mainly clear"],2:["⛅","Partly cloudy"],3:["☁️","Overcast"],
  45:["🌫️","Fog"],48:["🌫️","Rime fog"],51:["🌦️","Light drizzle"],53:["🌦️","Drizzle"],
  55:["🌧️","Heavy drizzle"],61:["🌧️","Light rain"],63:["🌧️","Moderate rain"],65:["⛈️","Heavy rain"],
  71:["🌨️","Light snow"],73:["❄️","Snow"],75:["🌨️","Heavy snow"],80:["🌦️","Rain showers"],
  81:["🌧️","Showers"],82:["⛈️","Violent showers"],95:["⛈️","Thunderstorm"],99:["⛈️","Thunderstorm+hail"]
};
const windDir = (deg) => ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg/45)%8];
const feelsLike = (t, h) => +(t - 0.55*(1-h/100)*(t-14.5)).toFixed(1);

const PageWeatherMapsAdmin = () => {
  const [tab, setTab]               = useState("live");
  const [mapType, setMapType]       = useState("road");
  const [mapPerspective, setMapPerspective] = useState(false);
  const [wx, setWx]                 = useState(null);
  const [loading, setLoading]       = useState(true);
  const [sensorOnline, setSensorOnline] = useState(true);
  const [sensor, setSensor] = useState({
    temp:28.4, humidity:67, pressure:1012.8, windSpeed:11.2, windDir:220,
    uvIndex:6.2, rainfall:0.1, altitude:580, co2:412, aqi:58,
    lastSync: new Date().toLocaleTimeString("en-IN")
  });

  // ── Fetch real weather from Open-Meteo (free, no ads, no key) ──────────────
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=18.5196&longitude=73.8554" +
          "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m," +
          "wind_direction_10m,cloud_cover,pressure_msl,uv_index,weather_code" +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max" +
          "&hourly=temperature_2m,precipitation_probability" +
          "&timezone=Asia%2FKolkata&forecast_days=7"
        );
        const d = await r.json();
        setWx(d);
        if (d.current) {
          setSensor(prev => ({
            ...prev,
            temp:       d.current.temperature_2m,
            humidity:   d.current.relative_humidity_2m,
            pressure:   d.current.pressure_msl,
            windSpeed:  d.current.wind_speed_10m,
            windDir:    d.current.wind_direction_10m,
            uvIndex:    d.current.uv_index ?? prev.uvIndex,
            rainfall:   d.current.precipitation,
            lastSync:   new Date().toLocaleTimeString("en-IN"),
          }));
        }
        setLoading(false);
      } catch { setLoading(false); }
    };
    fetch_();
    const t = setInterval(fetch_, 300_000);
    return () => clearInterval(t);
  }, []);

  // ── Simulate live hardware sensor drift ───────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (!sensorOnline) return;
      setSensor(p => ({
        ...p,
        temp:      +(p.temp      + (Math.random()-0.5)*0.2).toFixed(1),
        humidity:  +Math.min(100,Math.max(0, p.humidity  + (Math.random()-0.5))).toFixed(1),
        windSpeed: +Math.max(0, (p.windSpeed + (Math.random()-0.5)*1.5)).toFixed(1),
        co2:       Math.round(p.co2 + (Math.random()-0.5)*4),
        aqi:       Math.min(200,Math.max(10, Math.round(p.aqi + (Math.random()-0.5)*2))),
        lastSync:  new Date().toLocaleTimeString("en-IN"),
      }));
    }, 2000);
    return () => clearInterval(t);
  }, [sensorOnline]);

  const cur    = wx?.current;
  const wxCode = cur?.weather_code ?? 0;
  const [wxIcon, wxDesc] = WX_CODES[wxCode] ?? ["🌤️","—"];

  const TABS = [
    {id:"live",       icon:"🌡️", label:"Live Weather"},
    {id:"map",        icon:"🗺️", label:"Live Map"},
    {id:"hardware",   icon:"📡", label:"Hardware Sensors"},
    {id:"forecast",   icon:"📅", label:"7-Day Forecast"},
    {id:"navigation", icon:"🧭", label:"3D Navigation"},
  ];

  return (
    <div>
      <PageHeader
        title="Weather & Maps"
        sub={`Live · Mulshi, Maharashtra · Hinjawadi · ${sensorOnline?"🟢 Hardware online":"🔴 Hardware offline"}`}
        right={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {loading && <Pill color="blue">Fetching…</Pill>}
            <Pill color={sensorOnline?"green":"red"}>{sensorOnline?"● Sensor Live":"○ Offline"}</Pill>
            <Btn onClick={()=>setSensorOnline(s=>!s)}>{sensorOnline?"Disconnect":"Reconnect"}</Btn>
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"7px 14px",borderRadius:9,border:`1px solid ${tab===t.id?C.accent:C.border}`,
            background:tab===t.id?"rgba(59,130,246,0.12)":"transparent",
            color:tab===t.id?C.accent:C.muted,fontSize:12,cursor:"pointer",
            fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ══ LIVE WEATHER ══ */}
      {tab==="live" && (
        <div>
          <Card style={{marginBottom:14,background:"linear-gradient(135deg,rgba(20,50,110,0.55),rgba(11,20,34,0.92))"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>📍 Mulshi, Maharashtra · Hinjawadi</div>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:68}}>{wxIcon}</div>
                  <div>
                    <div style={{fontSize:54,fontWeight:700,color:C.text,lineHeight:1}}>
                      {sensor.temp}<span style={{fontSize:28,color:C.muted}}>°C</span>
                    </div>
                    <div style={{fontSize:15,color:C.muted,marginTop:2}}>{wxDesc}</div>
                    <div style={{fontSize:11,color:C.muted2,marginTop:2}}>Feels like {feelsLike(sensor.temp,sensor.humidity)}°C</div>
                  </div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  ["💧","Humidity",`${sensor.humidity}%`],
                  ["🌬️","Wind",`${sensor.windSpeed} km/h ${windDir(sensor.windDir)}`],
                  ["🌀","Pressure",`${sensor.pressure?.toFixed(0)} hPa`],
                  ["🌂","Rainfall",`${sensor.rainfall} mm`],
                  ["☀️","UV Index",`${sensor.uvIndex}`],
                  ["☁️","Cloud",`${cur?.cloud_cover ?? "—"}%`],
                ].map(([icon,k,v])=>(
                  <div key={k} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",minWidth:120}}>
                    <div style={{fontSize:10,color:C.muted2,marginBottom:2}}>{icon} {k}</div>
                    <div style={{fontSize:16,fontWeight:600,color:C.text}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.muted2,display:"flex",gap:16,flexWrap:"wrap"}}>
              <span>⚡ Open-Meteo API + Hardware sensor</span>
              <span>🔄 Last sync: {sensor.lastSync}</span>
              <span>📡 Protocol: MQTT over WiFi</span>
            </div>
          </Card>

          {/* Hourly temperature strip */}
          {wx?.hourly && (
            <Card style={{marginBottom:14}}>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Hourly Temperature (next 24h)</div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                {wx.hourly.time.slice(0,24).map((t,i)=>{
                  const hr  = t.split("T")[1]?.substring(0,5);
                  const tmp = wx.hourly.temperature_2m[i];
                  const pp  = wx.hourly.precipitation_probability?.[i] ?? 0;
                  return (
                    <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flexShrink:0,minWidth:44,padding:"6px 4px",borderRadius:8,background:i===0?"rgba(59,130,246,0.1)":"transparent"}}>
                      <div style={{fontSize:9,color:C.muted2}}>{hr}</div>
                      <div style={{fontSize:13,fontWeight:600,color:tmp>35?C.red:tmp>30?C.amber:tmp>25?C.accent:C.teal}}>{tmp}°</div>
                      {pp>20&&<div style={{fontSize:9,color:C.teal}}>💧{pp}%</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Alerts row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Card>
              <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>⚠️ Active Alerts</div>
              {[
                {col:"amber",title:"Heat advisory",desc:"Temp >30°C expected 12–15h. Hydration advised for trekkers."},
                {col:"blue", title:"Wind advisory",desc:`${sensor.windSpeed>20?"Moderate":"Low"} winds from ${windDir(sensor.windDir)}. Trail conditions normal.`},
              ].map(a=>(
                <div key={a.title} style={{background:`rgba(255,255,255,0.03)`,border:`1px solid ${a.col==="amber"?"rgba(245,158,11,0.3)":"rgba(59,130,246,0.2)"}`,borderRadius:9,padding:"9px 12px",marginBottom:7}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:2}}>{a.title}</div>
                  <div style={{fontSize:11,color:C.muted}}>{a.desc}</div>
                </div>
              ))}
            </Card>
            <Card>
              <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>📊 Air Quality</div>
              {[
                ["AQI",sensor.aqi,200,sensor.aqi<50?C.green:sensor.aqi<100?C.amber:C.red],
                ["CO₂",sensor.co2-350,200,sensor.co2<450?C.green:C.amber],
                ["Humidity",sensor.humidity,100,C.teal],
              ].map(([label,val,max,col])=>(
                <div key={label} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                    <span style={{color:C.muted}}>{label}</span>
                    <span style={{color:col,fontWeight:600}}>{label==="CO₂"?sensor.co2+" ppm":label==="AQI"?sensor.aqi:sensor.humidity+"%"}</span>
                  </div>
                  <div style={{height:5,borderRadius:4,background:"rgba(255,255,255,0.07)"}}>
                    <div style={{height:"100%",width:`${Math.min(100,(val/max)*100)}%`,borderRadius:4,background:col,transition:"width 0.5s"}}/>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* ══ LIVE MAP ══ */}
      {tab==="map" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
            {[["road","🗺️ Road"],["satellite","🛰️ Satellite"],["terrain","🏔️ Terrain"]].map(([v,label])=>(
              <button key={v} onClick={()=>setMapType(v)} style={{
                padding:"6px 14px",borderRadius:8,border:`1px solid ${mapType===v?C.accent:C.border}`,
                background:mapType===v?"rgba(59,130,246,0.12)":"transparent",
                color:mapType===v?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",
              }}>{label}</button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:C.muted}}>3D tilt</span>
              <Toggle on={mapPerspective} onChange={()=>setMapPerspective(x=>!x)}/>
            </div>
          </div>
          <LeafletMap height={500} tileType={mapType} perspective={mapPerspective}
            markers={USERS.map(u=>({ lat:u.lat, lon:u.lon, color:u.status==="sos"?"#ef4444":u.status==="active"?"#22c55e":"#888", popup:`<b>${u.name}</b><br><small>${u.city} · ${u.status}</small>` }))}/>
          <div style={{marginTop:10,display:"flex",gap:16,fontSize:11,color:C.muted2,flexWrap:"wrap"}}>
            <span>📍 18.52°N, 73.85°E</span>
            <span>🗺️ Mulshi Reservoir region · Western Ghats</span>
            <span>🏔️ Alt: {sensor.altitude}m ASL</span>
            <span>🌐 OpenStreetMap / ESRI · No ads · No API key</span>
          </div>
        </div>
      )}

      {/* ══ HARDWARE SENSORS ══ */}
      {tab==="hardware" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            {[
              {label:"Temperature",    value:`${sensor.temp}°C`,                 icon:"🌡️", color:sensor.temp>35?C.red:sensor.temp>28?C.amber:C.green, status:sensor.temp>35?"High alert":sensor.temp>28?"Warm":"Normal"},
              {label:"Humidity",       value:`${sensor.humidity}%`,               icon:"💧", color:sensor.humidity>80?C.amber:C.teal,                   status:sensor.humidity>80?"High":sensor.humidity<30?"Dry":"Normal"},
              {label:"Pressure",       value:`${sensor.pressure?.toFixed(1)} hPa`,icon:"🌀", color:C.purple,                                            status:"Stable"},
              {label:"Wind Speed",     value:`${sensor.windSpeed} km/h`,          icon:"🌬️", color:sensor.windSpeed>50?C.red:sensor.windSpeed>25?C.amber:C.accent, status:sensor.windSpeed>50?"Alert":sensor.windSpeed>25?"Moderate":"Calm"},
              {label:"UV Index",       value:`${sensor.uvIndex}`,                 icon:"☀️", color:sensor.uvIndex>7?C.red:sensor.uvIndex>3?C.amber:C.green, status:sensor.uvIndex>7?"Danger":sensor.uvIndex>3?"Moderate":"Low"},
              {label:"CO₂",            value:`${sensor.co2} ppm`,                 icon:"🌿", color:sensor.co2>450?C.amber:C.green,                     status:sensor.co2>450?"Elevated":"Normal"},
              {label:"Rainfall",       value:`${sensor.rainfall} mm/h`,           icon:"🌧️", color:sensor.rainfall>5?C.red:sensor.rainfall>0?C.teal:C.muted, status:sensor.rainfall>5?"Heavy":sensor.rainfall>0?"Light":"None"},
              {label:"AQI",            value:`${sensor.aqi}`,                     icon:"💨", color:sensor.aqi<50?C.green:sensor.aqi<100?C.amber:C.red, status:sensor.aqi<50?"Good":sensor.aqi<100?"Moderate":"Poor"},
              {label:"Altitude",       value:`${sensor.altitude}m ASL`,           icon:"🏔️", color:C.muted,                                            status:"Fixed GPS"},
            ].map(({label,value,icon,color,status})=>(
              <Card key={label} style={{marginBottom:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
                  <span style={{fontSize:16}}>{icon}</span>
                </div>
                <div style={{fontSize:24,fontWeight:700,color,marginBottom:5}}>{value}</div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:sensorOnline?C.green:"#555",flexShrink:0}}/>
                  <div style={{fontSize:10,color:C.muted2}}>{sensorOnline?status:"Offline"}</div>
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Hardware Device Registry</div>
            {[
              {name:"BME280 — Temp / Humidity / Pressure",     id:"HW-001", latency:"12ms", fw:"v2.3.1"},
              {name:"Ultrasonic Anemometer — Wind Speed/Dir",  id:"HW-002", latency:"18ms", fw:"v1.8.0"},
              {name:"VEML6075 — UV Sensor",                    id:"HW-003", latency:"9ms",  fw:"v1.2.4"},
              {name:"SDS011 — PM2.5 / AQI Particulate",        id:"HW-004", latency:"25ms", fw:"v3.1.0"},
              {name:"MH-Z19B — CO₂ NDIR Sensor",               id:"HW-005", latency:"32ms", fw:"v2.0.5"},
              {name:"Tipping Bucket Rain Gauge",               id:"HW-006", latency:"15ms", fw:"v1.5.2"},
            ].map(hw=>(
              <div key={hw.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:sensorOnline?C.green:C.red,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:C.text,fontWeight:500}}>{hw.name}</div>
                  <div style={{fontSize:10,color:C.muted2}}>{hw.id} · Firmware {hw.fw}</div>
                </div>
                <Pill color={sensorOnline?"green":"red"}>{sensorOnline?"online":"offline"}</Pill>
                <div style={{fontSize:10,color:C.muted2,minWidth:36,textAlign:"right"}}>{sensorOnline?hw.latency:"—"}</div>
              </div>
            ))}
            <div style={{fontSize:10,color:C.muted2,marginTop:10,display:"flex",gap:16}}>
              <span>🔄 Last sync: {sensor.lastSync}</span>
              <span>📡 Protocol: MQTT / ESP32 WiFi bridge</span>
              <span>🔋 Battery: 87%</span>
            </div>
          </Card>
        </div>
      )}

      {/* ══ 7-DAY FORECAST ══ */}
      {tab==="forecast" && (
        <div>
          {wx?.daily ? (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,marginBottom:14}}>
                {wx.daily.time.map((d,i)=>{
                  const dt    = new Date(d);
                  const dstr  = dt.toLocaleDateString("en-IN",{weekday:"short",day:"numeric"});
                  const [ic]  = WX_CODES[wx.daily.weather_code[i]] ?? ["🌤️"];
                  const tmax  = wx.daily.temperature_2m_max[i];
                  const tmin  = wx.daily.temperature_2m_min[i];
                  return (
                    <Card key={d} style={{textAlign:"center",marginBottom:0,padding:"14px 8px"}}>
                      <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{dstr}</div>
                      <div style={{fontSize:30,marginBottom:4}}>{ic}</div>
                      <div style={{fontSize:16,fontWeight:700,color:C.red}}>{tmax}°</div>
                      <div style={{fontSize:13,color:C.muted}}>{tmin}°</div>
                      <div style={{fontSize:10,color:C.teal,marginTop:3}}>💧{wx.daily.precipitation_sum[i]}mm</div>
                      <div style={{fontSize:10,color:C.muted2,marginTop:1}}>💨{wx.daily.wind_speed_10m_max[i]}km/h</div>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:12}}>Weekly Summary</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  {[
                    ["Avg High",`${(wx.daily.temperature_2m_max.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.red],
                    ["Avg Low", `${(wx.daily.temperature_2m_min.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.teal],
                    ["Total Rain",`${wx.daily.precipitation_sum.reduce((a,b)=>a+b,0).toFixed(1)} mm`,C.accent],
                    ["Max Wind",`${Math.max(...wx.daily.wind_speed_10m_max).toFixed(0)} km/h`,C.amber],
                  ].map(([k,v,col])=>(
                    <div key={k} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:10,color:C.muted2,marginBottom:4}}>{k}</div>
                      <div style={{fontSize:20,fontWeight:700,color:col}}>{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.muted2}}>
              {loading ? "⏳ Loading forecast…" : "⚠️ Forecast unavailable"}
            </div>
          )}
        </div>
      )}

      {/* ══ 3D NAVIGATION ══ */}
      {tab==="navigation" && (
        <div>
          <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
            <Pill color="green">● 3D Navigation Active</Pill>
            <Pill color="blue">📍 Mulshi, Maharashtra</Pill>
            <Pill color="amber">🏔️ Western Ghats Terrain</Pill>
            <span style={{fontSize:11,color:C.muted}}>Perspective tilt · Satellite + Terrain relief</span>
          </div>
          <LeafletMap height={520} tileType="satellite" perspective={true} zoom={13}
            markers={SOS_TEAMS.map(t=>({ lat:t.lat, lon:t.lon, color:"#f59e0b", popup:`<b>${t.name}</b><br><small>${t.vehicle} · ETA ${t.eta}</small>` }))}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:14}}>
            {[
              ["🧭","Heading",`${windDir(sensor.windDir)} · ${sensor.windDir}°`,C.accent],
              ["🏔️","Altitude",`${sensor.altitude}m ASL`,C.purple],
              ["📍","Coordinates","18.52°N  73.85°E",C.text],
              ["🌡️","Conditions",`${sensor.temp}°C · ${wxDesc}`,C.amber],
            ].map(([icon,k,v,col])=>(
              <Card key={k} style={{marginBottom:0}}>
                <div style={{fontSize:10,color:C.muted2,marginBottom:4}}>{icon} {k}</div>
                <div style={{fontSize:14,fontWeight:600,color:col}}>{v}</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════
   SIDEBAR NAVIGATION
════════════════════════════════════════════════ */
const NAV = [
  {section:"Overview",items:[{id:"dashboard",label:"Dashboard",icon:"⊞"}]},
  {section:"Users",items:[
    {id:"all-users",label:"All users",icon:"👥"},
    {id:"feature-access",label:"Feature access",icon:"🔑"},
    {id:"live-tracking",label:"Live navigation & tracking",icon:"📍"},
  ]},
  {section:"Operations",items:[
    {id:"device-tracking",label:"Device tracking",icon:"📡"},
    {id:"bluetooth",label:"Bluetooth devices",icon:"🔵"},
  ]},
  {section:"Weather",items:[
    {id:"weather-admin",label:"Weather overview",icon:"🌤️"},
    {id:"weather-maps",label:"Weather maps",icon:"🗺️"},
  ]},
  {section:"Safety & SOS",items:[
    {id:"safety-protocol",label:"Safety protocols",icon:"🛡️"},
    {id:"sos-navigation",label:"Realtime SOS Navigation",icon:"🗺",highlight:true},
  ]},
];

function toDisplayUsers(liveUsersMap, baseUsers = USERS) {
  const baseById = new Map(baseUsers.map((user) => [user.id, user]));
  const baseByName = new Map(baseUsers.map((user) => [user.name, user]));

  const merged = baseUsers.map((user) => ({ ...user }));
  const mergedIndexById = new Map(merged.map((user, index) => [user.id, index]));

  Array.from(liveUsersMap.values()).forEach((liveUser) => {
    const baseMatch = baseById.get(liveUser.id) || baseByName.get(liveUser.name);
    const resolved = {
      ...(baseMatch || {}),
      id: liveUser.id,
      name: liveUser.name,
      lat: liveUser.lat,
      lon: liveUser.lon,
      accuracy: liveUser.accuracy,
      status: liveUser.status || baseMatch?.status || "active",
      avatar: baseMatch?.avatar || liveUser.name?.split(" ").map((n) => n[0]).join("") || "U",
      color: baseMatch?.color || ["#E6F1FB", "#0C447C"],
      city: baseMatch?.city || "Live location",
      lastSeen: "just now",
      blood: liveUser.blood || baseMatch?.blood || "—",
      medical: liveUser.medical || baseMatch?.medical || "—",
      email: baseMatch?.email || `${(liveUser.name || "user").toLowerCase().replace(/\s+/g, ".")}@nimbus.travel`,
      role: baseMatch?.role || "Explorer",
      trips: baseMatch?.trips ?? 0,
      devices: baseMatch?.devices ?? 1,
    };

    const existingIndex = mergedIndexById.get(resolved.id);
    if (typeof existingIndex === "number") {
      merged[existingIndex] = resolved;
    } else {
      merged.push(resolved);
      mergedIndexById.set(resolved.id, merged.length - 1);
    }
  });

  return merged.length > 0 ? merged : USERS;
}

function distanceKm(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    Math.pow((a.lat - b.lat) * 111, 2) +
    Math.pow((a.lon - b.lon) * 111, 2)
  );
}

/* ════════════════════════════════════════════════
   ROOT COMPONENT
════════════════════════════════════════════════ */
export default function AdminPanel() {
  const [loggedIn,setLoggedIn]=useState(false);
  const [page,setPage]=useState("dashboard");
  const [mongoUsers, setMongoUsers] = useState(USERS);
  const { liveUsers, sosEvents, connectionState, error } = useAdminTracking({ serverUrl: "http://localhost:4000" });
  const displayUsers = toDisplayUsers(liveUsers, mongoUsers);
  const navigate=p=>setPage(p);

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/users`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data?.users) && data.users.length > 0) {
          setMongoUsers(data.users);
        }
      } catch {
        // Keep static users as fallback if backend is not reachable.
      }
    };

    loadUsers();
    const refresh = setInterval(loadUsers, 15000);
    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, []);

  if(!loggedIn) return <PageLogin onLogin={()=>setLoggedIn(true)}/>;

  const pages = {
    dashboard:        <PageDashboard navigate={navigate} users={displayUsers}/>,
    "all-users":      <PageAllUsers navigate={navigate}/>,
    "device-tracking":<PageDeviceTracking users={displayUsers} connectionState={connectionState}/>,
    "feature-access": <PageFeatureAccess users={displayUsers}/>,
    "safety-protocol":<PageSafetyProtocol/>,
    bluetooth:        <PageBluetooth/>,
    // Removed SOS admin service and SOS team tracking pages
    "live-tracking":  <PageLiveTracking navigate={navigate} users={displayUsers} connectionState={connectionState} error={error}/>,
    "weather-admin":  <PageWeatherAdmin/>,
    "weather-maps":   <PageWeatherMapsAdmin/>,
    "sos-navigation": <PageSOSNavigation users={displayUsers} sosEvents={Array.from(sosEvents.values())}/>,
  };

  const activeSOS=displayUsers.filter(u=>u.status==="sos").length;

  return (
    <div style={{display:"grid",gridTemplateColumns:"240px 1fr",minHeight:"780px",background:C.bg,fontFamily:"var(--font-sans)",color:C.text}}>
      {/* Sidebar */}
      <aside style={{background:C.sidebar,display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`}}>
        <div style={{padding:"18px 16px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(59,130,246,0.15)",border:`1px solid rgba(59,130,246,0.3)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={C.accent} strokeWidth="1.5"/><circle cx="12" cy="12" r="4" stroke={C.accent} strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill={C.accent}/></svg>
          </div>
          <div><div style={{fontSize:14,fontWeight:600,color:C.text,letterSpacing:"0.03em"}}>Nimbus <span style={{color:C.accent}}>Admin</span></div><div style={{fontSize:10,color:C.muted2}}>Control panel v3.0</div></div>
        </div>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(59,130,246,0.18)",color:C.accent,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>SA</div>
          <div><div style={{fontSize:12,fontWeight:500,color:C.text}}>Super Admin</div><div style={{fontSize:10,color:C.muted2}}>admin@nimbus.travel</div></div>
          {activeSOS>0&&<div style={{marginLeft:"auto",background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.red,fontWeight:700}}>{activeSOS}</div>}
        </div>
        <nav style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
          {NAV.map(({section,items})=>(
            <div key={section}>
              <div style={{fontSize:9,color:C.muted2,padding:"10px 16px 4px",letterSpacing:"0.12em",textTransform:"uppercase"}}>{section}</div>
              {items.map(item=>{
                const active=page===item.id;
                const isSosNav=item.id==="sos-navigation";
                return (
                  <div key={item.id} onClick={()=>setPage(item.id)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",cursor:"pointer",
                      borderLeft:`2px solid ${active?(isSosNav?C.red:C.accent):"transparent"}`,
                      background:active?(isSosNav?"rgba(239,68,68,0.1)":"rgba(59,130,246,0.1)"):"transparent",
                      transition:"background 0.15s"}}>
                    <span style={{fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{item.icon}</span>
                    <span style={{fontSize:12,color:active?C.text:isSosNav?"rgba(252,165,165,0.8)":C.muted,fontWeight:active?500:400}}>{item.label}</span>
                    {isSosNav&&activeSOS>0&&<div style={{marginLeft:"auto",background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"1px 7px",fontSize:9,color:C.red,fontWeight:700}}>LIVE</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color:C.muted2}}>© 2026 Nimbus Travel</span>
          <button onClick={()=>setLoggedIn(false)} style={{fontSize:11,color:C.muted,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{overflow:"auto",padding:24}}>
        {pages[page]||<div style={{color:C.muted}}>Page not found.</div>}
      </main>
    </div>
  );
}
