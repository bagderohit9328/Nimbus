import React, { useState, useEffect, useRef, useCallback } from "react";
import UserTrackingWidget from "./UserTrackingWidget";
import { useLocationTracking } from "./useLocationTracking";
import { subscribeToSafetyProtocols } from "./services/firebase";


/* ════════════════════════════════════════════════
   DESIGN TOKENS  (mirror admin panel exactly)
════════════════════════════════════════════════ */
const C = {
  bg:"#080f1a", sidebar:"#0b1422", panel:"rgba(11,20,34,0.95)",
  card:"rgba(255,255,255,0.04)", border:"rgba(80,140,220,0.14)",
  border2:"rgba(80,140,220,0.28)", accent:"#3b82f6", accent2:"#1d4ed8",
  green:"#22c55e", amber:"#f59e0b", red:"#ef4444", purple:"#a78bfa",
  teal:"#14b8a6", text:"#e2e8f0", muted:"rgba(180,210,245,0.5)",
  muted2:"rgba(180,210,245,0.28)",
};

/* ════════════════════════════════════════════════
   STATIC MOCK DATA
════════════════════════════════════════════════ */
const CURRENT_USER = {
  id:"U001", name:"Aryan Rao", email:"aryan@nimbus.travel",
  role:"Explorer Pro", status:"active", avatar:"AR",
  color:["#E6F1FB","#0C447C"], blood:"B+", medical:"None",
  lat:18.5196, lon:73.8554, city:"Mulshi, Maharashtra",
  phone:"+91 98765 43210", joined:"Jan 2025", trips:12, devices:3,
  ec1Name:"Meera Rao", ec1Rel:"Sister", ec1Ph:"+91 99887 76655",
  ec2Name:"Sunil Rao", ec2Rel:"Father", ec2Ph:"+91 98001 23456",
};

const DEFAULT_LOGIN = {
  email: "aryan@nimbus.travel",
  pass: "user123",
};

const USER_PROFILE_KEY = "nimbus_user_profile";
const USER_CREDENTIALS_KEY = "nimbus_user_credentials";
const USER_SESSION_KEY = "nimbus_user_session";
const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "http://localhost:5000/api";

const decodeJwtPayload = (token) => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const isUsableTrackingToken = (token, user) => {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (typeof payload.exp === "number" && Date.now() >= payload.exp * 1000 - 30_000) {
    return false;
  }
  if (user?.id && payload.userId && payload.userId !== user.id) return false;
  if (user?.name && payload.name && payload.name !== user.name) return false;
  return true;
};

const buildUserProfile = (form) => {
  const nameParts = (form.name || "Explorer User").trim().split(/\s+/);
  const initials = nameParts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "EU";
  return {
    id: `U-${Date.now()}`,
    name: form.name,
    email: form.email,
    role: form.role || "Explorer",
    status: "active",
    avatar: initials,
    color: ["#E6F1FB", "#0C447C"],
    blood: form.blood,
    medical: form.medical,
    city: form.city,
    phone: form.phone,
    trips: 0,
    devices: 1,
    lat: CURRENT_USER.lat,
    lon: CURRENT_USER.lon,
    ec1Name: form.ec1Name,
    ec1Rel: form.ec1Rel,
    ec1Ph: form.ec1Ph,
    ec2Name: form.ec2Name,
    ec2Rel: form.ec2Rel,
    ec2Ph: form.ec2Ph,
  };
};

const TRACKING_SERVER_URL = import.meta.env.VITE_TRACKING_SERVER_URL || "http://localhost:4000";

const FALLBACK_SAFETY_PROTOCOLS = [
  {id:"P001",title:"Arrival & check-in protocol",   icon:"📋",status:"published",updated:"Apr 10, 2026",
   body:"Upon arriving at the trek base, register at the check-in kiosk. Confirm your emergency contacts and ensure your device GPS is active. Admin will verify your profile before granting trail access."},
  {id:"P002",title:"Daily check-in rules",           icon:"✅",status:"published",updated:"Apr 8, 2026",
   body:"Send a live-status ping every 4 hours during active trekking. If no ping is received within 6 hours, the system triggers an automatic welfare check. Always acknowledge system check-in prompts."},
  {id:"P003",title:"Offline & no-signal zones",      icon:"📵",status:"published",updated:"Apr 11, 2026",
   body:"Carry a LoRa-enabled satellite communicator when entering zones marked orange on your map. Pre-download offline maps before departure. Inform admin 2 hrs prior to entering a no-signal zone."},
  {id:"P004",title:"SOS trigger procedure",          icon:"🚨",status:"published",updated:"Mar 28, 2026",
   body:"Press and hold the SOS button for 3 seconds to prevent accidental triggers. The system broadcasts your GPS coordinates and medical profile to the nearest rescue team. Stay in place unless immediate danger requires movement."},
  {id:"P005",title:"Medical emergency guidelines",   icon:"⚕️",status:"published",updated:"Apr 9, 2026",
   body:"Your blood group and medical conditions are auto-shared with any dispatched rescue team. In case of allergy or diabetic emergency, use the medical alert shortcut on your dashboard before triggering SOS."},
];

const deriveProtocolIcon = (title = "") => {
  const normalized = title.toLowerCase();
  if (normalized.includes("sos")) return "🚨";
  if (normalized.includes("medical")) return "⚕️";
  if (normalized.includes("offline") || normalized.includes("signal")) return "📵";
  if (normalized.includes("check-in") || normalized.includes("check in")) return "📋";
  return "🛡️";
};

const DESTINATIONS = [
  {id:"D001",name:"Mulshi Lake Trek",       state:"Maharashtra",duration:"2 days",difficulty:"Easy",   base:"₹4,500",maxGroup:12,  img:"🏞️",tags:["Beginner","Scenic","Monsoon Special"]},
  {id:"D002",name:"Rajmachi Fort Trek",     state:"Maharashtra",duration:"1 day", difficulty:"Medium", base:"₹3,200",maxGroup:15,  img:"🏰",tags:["History","Night Trek","Waterfall"]},
  {id:"D003",name:"Leh Ladakh Expedition",  state:"Ladakh",     duration:"8 days",difficulty:"Hard",   base:"₹22,000",maxGroup:8,  img:"🏔️",tags:["High Altitude","4WD","Photography"]},
  {id:"D004",name:"Spiti Valley Circuit",   state:"Himachal",   duration:"6 days",difficulty:"Hard",   base:"₹18,000",maxGroup:10, img:"🗻",tags:["Remote","Stargazing","Monasteries"]},
  {id:"D005",name:"Coorg Coffee Trail",     state:"Karnataka",  duration:"3 days",difficulty:"Easy",   base:"₹7,800",maxGroup:20,  img:"☕",tags:["Nature","Waterfall","Family Friendly"]},
  {id:"D006",name:"Andaman Kayaking",       state:"Andaman",    duration:"5 days",difficulty:"Medium", base:"₹14,500",maxGroup:8,  img:"🌊",tags:["Water Sport","Snorkeling","Island Hop"]},
];

const FORTS = [
  {id:"F001",name:"Sinhgad Fort",         hindi:"सिंहगड किल्ला",      state:"Maharashtra",altitude:"820m",lat:18.3639,lon:73.7997,difficulty:"Easy",trek:"1.5 hours",difficulty_level:"⭐⭐",best_season:"Oct-May",history:"Originally Kondhana, Sinhagad has early medieval origins and was held by Nag Nayak until captured by Muhammad bin Tughluq in 1328. It later passed through the Bahmani, Ahmadnagar and Bijapur sultanates before Shivaji gained control in the 17th century. The fort is famed for the 1670 Battle of Sinhagad led by Tanaji Malusare, who captured the fort but lost his life — inspiring Shivaji's famous lament 'Gad ala, pan Sinha gela' (The fort is won, but the lion is lost). Sinhagad remained an important Maratha stronghold until British conquest in the early 19th century and later served as a retreat for freedom-era leaders such as Lokmanya Tilak.",attractions:["Tanaji Malusare Memorial","Kondhaneshwar Temple","Rajaram Cenotaph","Lokmanya Tilak's Bungalow","Pune & Kalyan Darwaja"]},

  {id:"F002",name:"Raigad Fort",         hindi:"रायगड किल्ला",      state:"Maharashtra",altitude:"1356m",lat:18.1935,lon:73.3045,difficulty:"Hard",trek:"1–2 hours",difficulty_level:"⭐⭐⭐",best_season:"Oct-May",history:"Raigad was chosen by Shivaji as the capital of his Hindavi Swarajya and developed extensively under his direction (c.1656–1674). The hill-top complex contained the royal palace, the public court and the Sinhasan (royal throne); Shivaji was coronated at Raigad in 1674. The fort features historic structures and bastions (including the Hirakani Buruj named after a legendary milkmaid), and later additions such as a ropeway and museum have improved access.",attractions:["Sinhasan (royal throne)","Jagdishwar Mandir","Rajmata Jijabai Samadhi","Hirakani Buruj"]},

  {id:"F003",name:"Shivneri Fort",       hindi:"शिवनेरी किल्ला",     state:"Maharashtra",altitude:"1020m",lat:18.2333,lon:74.2833,difficulty:"Medium",trek:"1.5 hours",difficulty_level:"⭐⭐",best_season:"Oct-May",history:"Shivneri is best known as the birthplace and childhood home of Chhatrapati Shivaji Maharaj. The fort dates to Yadava and medieval periods and later passed through the Bahmani and Ahmadnagar sultanates before Maratha control. Its well-defended gates, perennial water sources (Badami Talav) and temples contributed to its strategic and cultural importance.",attractions:["Birthplace memorial","Badami Talav","Lenyadri caves","Ancient gates"]},

  {id:"F004",name:"Sindhudurg Fort",     hindi:"सिंधुदुर्ग किल्ला",   state:"Maharashtra",altitude:"5m",lat:16.1667,lon:73.3667,difficulty:"Medium",trek:"Boat ride",difficulty_level:"⭐⭐",best_season:"Oct-May",history:"Commissioned by Shivaji in 1664 and constructed (1664–1667) under chief architect Hiroji Indulkar with assistance from coastal engineers, Sindhudurg is a sea fort built on a rocky island to check European and Siddi maritime power along the Konkan coast. The massive ramparts, concealed entrance and maritime defences made it a formidable coastal stronghold.",attractions:["Island ramparts","Sea-facing bastions","Historic cannons","Concealed entrance"]},

  {id:"F005",name:"Lohagad Fort",        hindi:"लोहगड किल्ला",       state:"Maharashtra",altitude:"1033m",lat:18.7639,lon:73.3522,difficulty:"Medium",trek:"2 hours",difficulty_level:"⭐⭐",best_season:"Monsoon/Oct-May",history:"Lohagad (Long Fort) has ancient origins with occupation by local dynasties and evidence of Jain inscriptions dating to early centuries. It was captured by Shivaji in the 17th century and later used by Peshwa administrators; Lohagad also served as a treasury and features well-preserved gates and rock-cut structures.",attractions:["Narayan Darwaja","Vinchukada (Scorpion's tail)","Jain cave inscriptions","Monsoon views"]},

  {id:"F006",name:"Torna Fort",          hindi:"तोरण किल्ला",        state:"Maharashtra",altitude:"1429m",lat:18.1667,lon:73.9167,difficulty:"Hard",trek:"3 hours",difficulty_level:"⭐⭐⭐⭐",best_season:"Oct-May",history:"Torna (Prachandagad) is one of the oldest forts in the region, with origins in the 13th century. It was the first fort captured by the young Shivaji (c.1646) and later formed part of Maratha fortifications. Local tradition records the discovery of buried wealth here, which assisted construction of other forts such as Rajgarh.",attractions:["Zunjar Machi fortification","Toranji temple","High-altitude views"]},

  {id:"F007",name:"Murud-Janjira Fort",  hindi:"मुरुड-जंजिरा किल्ला",  state:"Maharashtra",altitude:"30m",lat:18.4667,lon:73.2833,difficulty:"Easy",trek:"Boat ride",difficulty_level:"⭐⭐",best_season:"Oct-May",history:"Murud-Janjira is a remarkable island fortress controlled for centuries by the Sidis (Abyssinian-origin rulers). With massive granite walls, dozens of artillery towers and large historic cannons, Janjira resisted repeated sieges by Portuguese, Maratha and Mughal forces. The wooden garrison origins grew into a stone stronghold under Malik Ambar and later Siddi rulers, remaining unconquered until integration into India in the 20th century.",attractions:["Kalaal Baangadi cannon","Sea fort ramparts","Nawab's palace","Freshwater wells"]},

  {id:"F008",name:"Harishchandragad Fort",hindi:"हरिश्चंद्रगड किल्ला",state:"Maharashtra",altitude:"1422m",lat:19.2167,lon:74.1333,difficulty:"Hard",trek:"2.5 hours",difficulty_level:"⭐⭐⭐",best_season:"Oct-May",history:"Harishchandragad is an ancient citadel with archaeological traces from microlithic times and references in Puranic literature. Its core structures and caves date from early medieval centuries, and the fort later featured in regional medieval and Maratha-era activity. Notable for temple architecture, caves like Kedareshwar and dramatic cliffs such as Konkan Kada, it is both a cultural and trekking landmark.",attractions:["Kedareshwar Cave","Saptatirtha Pushkarni","Konkan Kada","Taramati peak"]},

  {id:"F009",name:"Pratapgad Fort",      hindi:"प्रतापगड किल्ला",     state:"Maharashtra",altitude:"1080m",lat:17.3667,lon:73.7167,difficulty:"Hard",trek:"2.5 hours",difficulty_level:"⭐⭐⭐",best_season:"Oct-May",history:"Built in 1656 under Shivaji's direction, Pratapgad is famed for the 1659 Battle of Pratapgad where Shivaji defeated Afzal Khan of the Adil Shahi — a defining episode in Maratha ascendancy. The fort later remained strategically important through the Maratha and Peshwa eras and was surrendered to the East India Company in 1818.",attractions:["Battle of Pratapgad site","Tulja Bhawani temple","Shivaji statue","Upper and lower forts"]},
];

const MY_BOOKINGS = [
  {id:"BK001",dest:"Mulshi Lake Trek",     date:"May 3–5, 2026",   persons:1,price:"₹4,500", status:"confirmed",type:"solo",  destId:"D001"},
  {id:"BK002",dest:"Leh Ladakh Expedition",date:"Jul 15–22, 2026", persons:4,price:"₹88,000",status:"pending",  type:"group", destId:"D003"},
];

const MY_DEVICES = [
  {id:"DEV001",name:"iPhone 15 Pro",      type:"phone",    battery:78,signal:"strong",gps:true, sos:true, connected:true, mac:"A4:C1:38:1F:22:B5",lat:18.52,lon:73.85},
  {id:"DEV002",name:"Garmin Instinct 2",  type:"watch",    battery:92,signal:"strong",gps:true, sos:true, connected:true, mac:"F0:23:B9:7A:01:C3",lat:18.52,lon:73.85},
  {id:"DEV003",name:"SPOT Gen4 Beacon",   type:"satellite",battery:65,signal:"medium",gps:true, sos:true, connected:false,mac:"7C:64:56:D8:3A:F1",lat:null,lon:null},
];

const NEARBY_DEVICES = [
  {id:"N001",name:"Garmin inReach Mini 2",mac:"B8:27:EB:5A:3C:11",rssi:-48,type:"satellite",paired:false},
  {id:"N002",name:"Apple Watch Ultra 2",  mac:"DC:A9:04:B1:77:3E",rssi:-55,type:"watch",    paired:false},
  {id:"N003",name:"Tile Pro 2024",        mac:"00:1A:7D:DA:71:13",rssi:-70,type:"tracker",  paired:false},
  {id:"N004",name:"Polar Grit X2 Pro",    mac:"E4:5F:01:38:92:AB",rssi:-62,type:"watch",    paired:false},
];

const RESCUE_TEAMS = [
  {id:"T001",name:"Team Alpha",lat:18.5650,lon:73.9100,status:"deployed",eta:"12 min",vehicle:"Ambulance",lead:"Vikram Rao"},
];

const TURN_BY_TURN_USER = [
  {dist:"0.0 km",icon:"↑",instr:"Head north from Mulshi Base Camp",road:"NH-48"},
  {dist:"1.4 km",icon:"↗",instr:"Take the forest track right at the ridge fork",road:"Forest Track F-22"},
  {dist:"3.1 km",icon:"↑",instr:"Continue uphill on the main trail"},
  {dist:"5.5 km",icon:"↙",instr:"Descend left toward the valley stream"},
  {dist:"7.2 km",icon:"↑",instr:"Cross the stone bridge and continue east"},
  {dist:"8.6 km",icon:"⚑",instr:"Arrival at Emergency Rally Point — Mulshi Peak"},
];

/* ════════════════════════════════════════════════
   SHARED UI PRIMITIVES
════════════════════════════════════════════════ */
const Pill = ({ color, children }) => {
  const map = {
    green:{bg:"rgba(34,197,94,0.12)",text:"#86efac"},
    red:{bg:"rgba(239,68,68,0.12)",text:"#fca5a5"},
    amber:{bg:"rgba(245,158,11,0.12)",text:"#fcd34d"},
    blue:{bg:"rgba(59,130,246,0.14)",text:"#93c5fd"},
    purple:{bg:"rgba(167,139,250,0.12)",text:"#c4b5fd"},
    teal:{bg:"rgba(20,184,166,0.12)",text:"#5eead4"},
    gray:{bg:"rgba(255,255,255,0.07)",text:"rgba(180,210,245,0.6)"},
  };
  const s = map[color]||map.gray;
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:500,background:s.bg,color:s.text}}>{children}</span>;
};
const Card = ({ children, style }) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",...style}}>{children}</div>
);
const StatCard = ({ label, value, sub, color=C.accent, icon }) => (
  <Card style={{marginBottom:0}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
      {icon&&<span style={{fontSize:18}}>{icon}</span>}
    </div>
    <div style={{fontSize:26,fontWeight:700,color,marginBottom:2}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:C.muted2}}>{sub}</div>}
  </Card>
);
const Avatar = ({ initials, bg, text, size=32 }) => (
  <div style={{width:size,height:size,borderRadius:"50%",background:bg||"rgba(59,130,246,0.18)",color:text||C.accent,
    fontSize:size*0.35,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    {initials}
  </div>
);
const Toggle = ({ on, onChange }) => (
  <div onClick={onChange} style={{width:36,height:20,borderRadius:10,background:on?C.accent:"rgba(255,255,255,0.12)",
    position:"relative",cursor:"pointer",transition:"background 0.25s",flexShrink:0}}>
    <div style={{position:"absolute",top:3,left:on?19:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.25s"}}/>
  </div>
);
const Input = ({ value, onChange, placeholder, type="text", style:sx }) => (
  <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    style={{height:36,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,
      borderRadius:8,color:C.text,fontSize:13,padding:"0 12px",fontFamily:"inherit",boxSizing:"border-box",outline:"none",...sx}}/>
);
const Btn = ({ children, onClick, variant="default", disabled=false, type="button", style:sx }) => {
  const v = {
    primary:{background:C.accent,color:"#fff",border:"none"},
    danger:{background:C.red,color:"#fff",border:"none"},
    success:{background:"rgba(34,197,94,0.15)",color:C.green,border:`1px solid rgba(34,197,94,0.3)`},
    default:{background:"rgba(255,255,255,0.05)",color:C.text,border:`1px solid ${C.border}`},
    ghost:{background:"transparent",color:C.muted,border:"none"},
  };
  return (
    <button type={type} onClick={disabled?undefined:onClick} disabled={disabled}
      style={{padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:500,cursor:disabled?"not-allowed":"pointer",
        fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6,opacity:disabled?0.5:1,...v[variant],...sx}}>
      {children}
    </button>
  );
};
const PageHeader = ({ title, sub, right }) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
    <div>
      <h1 style={{fontSize:20,fontWeight:600,color:C.text,margin:0}}>{title}</h1>
      {sub&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>{sub}</div>}
    </div>
    {right}
  </div>
);
const FieldRow = ({ label, children }) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:5,letterSpacing:"0.04em"}}>{label}</div>
    {children}
  </div>
);
const Select = ({ value, onChange, children, style:sx }) => (
  <select value={value} onChange={onChange}
    style={{height:36,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,
      borderRadius:8,color:C.text,fontSize:13,padding:"0 12px",fontFamily:"inherit",outline:"none",
      cursor:"pointer", boxSizing:"border-box",...sx}}>
    {children}
  </select>
);

/* ════════════════════════════════════════════════
   LEAFLET ENGINE  (shared singleton — same as admin)
════════════════════════════════════════════════ */
const LEAFLET_CSS_ID = "leaflet-css-v194";
const LEAFLET_JS_ID  = "leaflet-js-v194";

const ensureLeaflet = (onReady) => {
  if (window.L) { onReady(); return; }
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const css = document.createElement("link");
    css.id = LEAFLET_CSS_ID; css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
  }
  if (!document.getElementById(LEAFLET_JS_ID)) {
    const js = document.createElement("script");
    js.id  = LEAFLET_JS_ID;
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
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
      @keyframes ud-pulse {
        0%   { transform:translate(-50%,-50%) scale(.4); opacity:.9; }
        100% { transform:translate(-50%,-50%) scale(2.8); opacity:0; }
      }
      @keyframes ud-sos-blink { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.7)} 50%{box-shadow:0 0 0 18px rgba(239,68,68,0)} }
      @keyframes ud-spin { to{transform:rotate(360deg)} }
      .leaflet-container   { background:#08101e !important; }
      .leaflet-tile-pane   { filter:saturate(.85) brightness(.9); }
      .leaflet-popup-content-wrapper {
        background:#0b1422; color:#e2e8f0;
        border:1px solid rgba(80,140,220,0.25);
        border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,.7);
      }
      .leaflet-popup-content { margin:10px 14px; font-family:sans-serif; font-size:12px; line-height:1.6; }
      .leaflet-popup-tip { background:#0b1422; }
      .leaflet-popup-close-button { color:#94a3b8 !important; }
      .leaflet-control-zoom { border:1px solid rgba(80,140,220,0.25) !important; border-radius:8px !important; overflow:hidden; }
      .leaflet-control-zoom a { background:rgba(11,20,34,0.95) !important; color:#e2e8f0 !important;
        border-bottom:1px solid rgba(80,140,220,0.2) !important; font-size:16px !important; }
      .leaflet-control-zoom a:hover { background:rgba(59,130,246,0.18) !important; }
      .leaflet-control-attribution { background:rgba(8,15,26,0.7) !important; color:#64748b !important; font-size:9px !important; }
      .ud-geofence-circle { stroke:#f59e0b !important; stroke-dasharray:8 5; stroke-width:2 !important; fill-opacity:0.07 !important; }
    `;
    document.head.appendChild(s);
  };
})();

const makeDotIcon = (L, color, size=12, pulse=false) => L.divIcon({
  className:"",
  html:`<div style="position:relative;width:${size+18}px;height:${size+18}px;">
    ${pulse?`<div style="position:absolute;top:50%;left:50%;width:${size+10}px;height:${size+10}px;
      border-radius:50%;border:2.5px solid ${color};animation:ud-pulse 1.8s ease-out infinite;"></div>`:""}
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:${size}px;height:${size}px;border-radius:50%;background:${color};
      border:2.5px solid #fff;box-shadow:0 0 0 4px ${color}44,0 2px 8px rgba(0,0,0,.5);z-index:1;"></div>
  </div>`,
  iconSize:[size+18,size+18], iconAnchor:[(size+18)/2,(size+18)/2], popupAnchor:[0,-(size/2+10)],
});

const makeTeamIcon = (L, name) => L.divIcon({
  className:"",
  html:`<div style="background:#f59e0b;border-radius:7px;padding:3px 9px;font-size:10px;
    font-weight:800;color:#000;white-space:nowrap;box-shadow:0 2px 10px #f59e0b88;
    border:1.5px solid rgba(255,255,255,0.3);">${name.replace("Team ","")}</div>`,
  iconSize:null, iconAnchor:[22,13], popupAnchor:[0,-16],
});

/* ════════════════════════════════════════════════
   TILE LAYERS (same as admin)
════════════════════════════════════════════════ */
const TILE_LAYERS = {
  road:      {url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",      attr:"© OpenStreetMap contributors"},
  satellite: {url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",attr:"© Esri World Imagery"},
  terrain:   {url:"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",        attr:"© OpenTopoMap contributors"},
};

/* ════════════════════════════════════════════════
   WEATHER HELPERS
════════════════════════════════════════════════ */
const WX_CODES = {
  0:["☀️","Clear sky"],1:["🌤️","Mainly clear"],2:["⛅","Partly cloudy"],3:["☁️","Overcast"],
  45:["🌫️","Fog"],48:["🌫️","Rime fog"],51:["🌦️","Light drizzle"],53:["🌦️","Drizzle"],
  55:["🌧️","Heavy drizzle"],61:["🌧️","Light rain"],63:["🌧️","Moderate rain"],65:["⛈️","Heavy rain"],
  71:["🌨️","Light snow"],73:["❄️","Snow"],75:["🌨️","Heavy snow"],80:["🌦️","Rain showers"],
  81:["🌧️","Showers"],82:["⛈️","Violent showers"],95:["⛈️","Thunderstorm"],99:["⛈️","Thunderstorm+hail"],
};
const windDirLabel = (d) => ["N","NE","E","SE","S","SW","W","NW"][Math.round(d/45)%8];
const feelsLike = (t,h) => +(t-0.55*(1-h/100)*(t-14.5)).toFixed(1);

/* ════════════════════════════════════════════════
   PAGE: LOGIN
════════════════════════════════════════════════ */
const PageLogin = ({ onLogin, onRegister }) => {
  const [email,setEmail] = useState("aryan@nimbus.travel");
  const [pass,setPass]   = useState("user123");
  const [err,setErr]     = useState("");
  const [loading,setLoading] = useState(false);

  const handle = (event) => {
    event.preventDefault();
    setErr(""); setLoading(true);
    setTimeout(async () => {
      setLoading(false);
      if (!email || !pass) {
        setErr("Please fill in all fields.");
        return;
      }

      try {
        const response = await fetch(`${AUTH_API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: pass }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.user) {
            onLogin(data.user);
            return;
          }
        }

        if (response.status !== 404) {
          const data = await response.json().catch(() => ({}));
          setErr(data.error || "Invalid credentials.");
          return;
        }
      } catch {
        // Fallback to local login below when API is unavailable.
      }

      const storedProfile = localStorage.getItem(USER_PROFILE_KEY);
      const storedCredentials = localStorage.getItem(USER_CREDENTIALS_KEY);
      const parsedProfile = storedProfile ? JSON.parse(storedProfile) : null;
      const parsedCredentials = storedCredentials ? JSON.parse(storedCredentials) : null;

      if (parsedCredentials && email === parsedCredentials.email && pass === parsedCredentials.pass) {
        onLogin(parsedProfile);
        return;
      }

      if (email === DEFAULT_LOGIN.email && pass === DEFAULT_LOGIN.pass) {
        onLogin(CURRENT_USER);
        return;
      }

      setErr("Invalid credentials. Try the demo account or create a new explorer account.");
    }, 900);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <form onSubmit={handle} style={{width:420,padding:40,background:C.sidebar,borderRadius:20,border:`1px solid ${C.border2}`,boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(59,130,246,0.12)",
            border:`1.5px solid rgba(59,130,246,0.35)`,display:"flex",alignItems:"center",
            justifyContent:"center",margin:"0 auto 12px"}}>
            <span style={{fontSize:24}}>🏔️</span>
          </div>
          <div style={{fontSize:20,fontWeight:700,color:C.text}}>Nimbus <span style={{color:C.accent}}>Explorer</span></div>
          <div style={{fontSize:12,color:C.muted,marginTop:3}}>Mountain Safety & Travel Platform</div>
        </div>

        <FieldRow label="EMAIL ADDRESS">
          <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email"/>
        </FieldRow>
        <FieldRow label="PASSWORD">
          <Input value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" type="password"/>
        </FieldRow>

        {err && <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:8,padding:"8px 12px",fontSize:12,color:"#fca5a5",marginBottom:14}}>{err}</div>}

        <button type="submit"
          style={{width:"100%",padding:"11px",background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
            border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",
            fontFamily:"inherit",marginBottom:14,letterSpacing:"0.02em"}}>
          {loading?"Signing in…":"Sign In"}
        </button>

        <button type="button" onClick={onRegister}
          style={{width:"100%",padding:"10px",background:"transparent",border:`1px solid ${C.border}`,
            borderRadius:10,color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          New explorer? <span style={{color:C.accent,fontWeight:500}}>Create Account →</span>
        </button>

        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:C.muted2}}>
          Demo: aryan@nimbus.travel · user123
        </div>
      </form>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: REGISTER
════════════════════════════════════════════════ */
const PageRegister = ({ onBack, onDone }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name:"", email:"", pass:"", confirmPass:"", phone:"",
    blood:"B+", medical:"None",
    ec1Name:"", ec1Rel:"", ec1Ph:"",
    ec2Name:"", ec2Rel:"", ec2Ph:"",
    city:"", role:"Explorer",
  });
  const [err,setErr]  = useState("");
  const [done,setDone]= useState(false);
  const [submitting,setSubmitting] = useState(false);
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  const nextStep = async () => {
    setErr("");
    if (step===1 && (!form.name||!form.email||!form.pass)) { setErr("Fill all required fields."); return; }
    if (step===1 && form.pass!==form.confirmPass) { setErr("Passwords don't match."); return; }
    if (step < 3) {
      setStep(s=>s+1);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.pass,
          phone: form.phone,
          city: form.city,
          role: form.role,
          blood: form.blood,
          medical: form.medical,
          ec1Name: form.ec1Name,
          ec1Rel: form.ec1Rel,
          ec1Ph: form.ec1Ph,
          ec2Name: form.ec2Name,
          ec2Rel: form.ec2Rel,
          ec2Ph: form.ec2Ph,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setDone(true);
        setTimeout(()=>onDone(data.user), 1400);
        return;
      }

      if (response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        setErr(data.error || "Unable to create account right now.");
        return;
      }
    } catch {
      // Fall through to local fallback when API is unavailable.
    } finally {
      setSubmitting(false);
    }

    {
      const profile = buildUserProfile(form);
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
      localStorage.setItem(USER_CREDENTIALS_KEY, JSON.stringify({ email: form.email, pass: form.pass }));
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ email: form.email, userId: profile.id }));
      setDone(true);
      setTimeout(()=>onDone(profile), 1400);
    }
  };

  const bloodOptions = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
  const stepLabel = ["Personal Info","Medical & Emergency","Account Setup"];

  if (done) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{textAlign:"center",color:C.text}}>
        <div style={{fontSize:52,marginBottom:16}}>✅</div>
        <div style={{fontSize:22,fontWeight:700}}>Account Created!</div>
        <div style={{fontSize:13,color:C.muted,marginTop:6}}>Redirecting to your dashboard…</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:20}}>
      <div style={{width:520,background:C.sidebar,borderRadius:20,border:`1px solid ${C.border2}`,
        boxShadow:"0 24px 80px rgba(0,0,0,.7)",overflow:"hidden"}}>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,rgba(59,130,246,0.12),rgba(11,20,34,0))`,
          padding:"24px 32px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <span style={{fontSize:22}}>🏔️</span>
            <div style={{fontSize:16,fontWeight:600,color:C.text}}>Create Explorer Account</div>
          </div>
          {/* Progress steps */}
          <div style={{display:"flex",gap:0}}>
            {stepLabel.map((l,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                <div style={{width:26,height:26,borderRadius:"50%",
                  background:i+1<=step?"rgba(59,130,246,0.9)":"rgba(255,255,255,0.07)",
                  border:`2px solid ${i+1<=step?C.accent:C.border}`,
                  color:i+1<=step?"#fff":C.muted,fontSize:11,fontWeight:700,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {i+1<step?"✓":i+1}
                </div>
                <div style={{fontSize:9,color:i+1===step?C.accent:C.muted2,textAlign:"center",lineHeight:1.2}}>{l}</div>
                {i<stepLabel.length-1&&<div style={{position:"absolute"}}/>}
              </div>
            ))}
          </div>
        </div>

        <div style={{padding:"24px 32px"}}>
          {err&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
            borderRadius:8,padding:"8px 12px",fontSize:12,color:"#fca5a5",marginBottom:14}}>{err}</div>}

          {/* Step 1: Personal */}
          {step===1&&<div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <FieldRow label="FULL NAME *"><Input value={form.name} onChange={e=>upd("name",e.target.value)} placeholder="Your full name"/></FieldRow>
              <FieldRow label="CITY"><Input value={form.city} onChange={e=>upd("city",e.target.value)} placeholder="Mumbai"/></FieldRow>
            </div>
            <FieldRow label="EMAIL ADDRESS *"><Input value={form.email} onChange={e=>upd("email",e.target.value)} placeholder="you@example.com" type="email"/></FieldRow>
            <FieldRow label="PHONE NUMBER"><Input value={form.phone} onChange={e=>upd("phone",e.target.value)} placeholder="+91 98765 43210" type="tel"/></FieldRow>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <FieldRow label="PASSWORD *"><Input value={form.pass} onChange={e=>upd("pass",e.target.value)} placeholder="Min 8 characters" type="password"/></FieldRow>
              <FieldRow label="CONFIRM PASSWORD *"><Input value={form.confirmPass} onChange={e=>upd("confirmPass",e.target.value)} placeholder="Repeat password" type="password"/></FieldRow>
            </div>
          </div>}

          {/* Step 2: Medical & Emergency */}
          {step===2&&<div>
            <div style={{background:"rgba(167,139,250,0.06)",border:`1px solid rgba(167,139,250,0.2)`,
              borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:C.muted}}>
              🔒 This information is encrypted and only shared with rescue teams during an active SOS event.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <FieldRow label="BLOOD GROUP *">
                <Select value={form.blood} onChange={e=>upd("blood",e.target.value)}>
                  {bloodOptions.map(b=><option key={b} value={b} style={{background:"#0b1422"}}>{b}</option>)}
                </Select>
              </FieldRow>
              <FieldRow label="MEDICAL CONDITIONS">
                <Input value={form.medical} onChange={e=>upd("medical",e.target.value)} placeholder="Asthma, Diabetes, None…"/>
              </FieldRow>
            </div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,marginTop:4}}>Emergency Contact 1</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
              <Input value={form.ec1Name} onChange={e=>upd("ec1Name",e.target.value)} placeholder="Full name"/>
              <Input value={form.ec1Rel} onChange={e=>upd("ec1Rel",e.target.value)} placeholder="Relation"/>
              <Input value={form.ec1Ph} onChange={e=>upd("ec1Ph",e.target.value)} placeholder="+91 …" type="tel"/>
            </div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Emergency Contact 2 (optional)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <Input value={form.ec2Name} onChange={e=>upd("ec2Name",e.target.value)} placeholder="Full name"/>
              <Input value={form.ec2Rel} onChange={e=>upd("ec2Rel",e.target.value)} placeholder="Relation"/>
              <Input value={form.ec2Ph} onChange={e=>upd("ec2Ph",e.target.value)} placeholder="+91 …" type="tel"/>
            </div>
          </div>}

          {/* Step 3: Account Setup */}
          {step===3&&<div>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{width:58,height:58,borderRadius:"50%",background:"rgba(34,197,94,0.12)",
                border:`1.5px solid rgba(34,197,94,0.3)`,display:"flex",alignItems:"center",
                justifyContent:"center",margin:"0 auto 10px",fontSize:26}}>🏔️</div>
              <div style={{fontSize:14,fontWeight:600,color:C.text}}>Almost there, {form.name||"Explorer"}!</div>
              <div style={{fontSize:12,color:C.muted,marginTop:3}}>Review your details before creating account</div>
            </div>
            {[
              ["Name",form.name||"—"],["Email",form.email||"—"],["Phone",form.phone||"—"],
              ["Blood Group",form.blood],["Medical",form.medical||"None"],
              ["EC 1",form.ec1Name?`${form.ec1Name} (${form.ec1Rel}) ${form.ec1Ph}`:"—"],
              ["EC 2",form.ec2Name?`${form.ec2Name} (${form.ec2Rel}) ${form.ec2Ph}`:"—"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",
                borderBottom:`1px solid ${C.border}`,fontSize:12}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500,maxWidth:280,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:14,background:"rgba(59,130,246,0.06)",border:`1px solid rgba(59,130,246,0.2)`,
              borderRadius:9,padding:"10px 14px",fontSize:11,color:C.muted}}>
              By creating an account you agree to share your GPS location and medical data with Nimbus rescue teams during active SOS events.
            </div>
          </div>}

          <div style={{display:"flex",gap:10,marginTop:22}}>
            <Btn type="button" onClick={step===1?onBack:()=>setStep(s=>s-1)}>← {step===1?"Sign In":"Back"}</Btn>
            <button type="button" onClick={nextStep}
              disabled={submitting}
              style={{flex:1,padding:"10px",background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                border:"none",borderRadius:9,color:"#fff",fontSize:13,fontWeight:600,cursor:submitting?"not-allowed":"pointer",fontFamily:"inherit",opacity:submitting?0.7:1}}>
              {submitting?"Creating account…":step===3?"🏔️ Create Account":step===2?"Review →":"Next: Medical Info →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: DASHBOARD
════════════════════════════════════════════════ */
const PageDashboard = ({ user, onNavigate, activeSOS, onSOS }) => {
  const [wx, setWx] = useState(null);
  const [wxLoading, setWxLoading] = useState(true);
  const [sensor, setSensor] = useState({
    temp:27.4, humidity:68, pressure:1013.2, windSpeed:9.8, windDir:210,
    uvIndex:5.8, rainfall:0.0, aqi:52,
  });
  const [pressureHistory, setPressureHistory] = useState([1013,1013,1012,1012,1011,1011,1010]);
  const [sosConfirm, setSosConfirm] = useState(false);
  const [sosActive, setSosActive] = useState(activeSOS);
  const [expandProtocol, setExpandProtocol] = useState(null);
  const [safetyProtocols, setSafetyProtocols] = useState(FALLBACK_SAFETY_PROTOCOLS);

  /* Fetch Open-Meteo weather */
  useEffect(()=>{
    const go = async () => {
      try {
        const r = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=18.5196&longitude=73.8554" +
          "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m," +
          "wind_direction_10m,cloud_cover,pressure_msl,uv_index,weather_code" +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code" +
          "&timezone=Asia%2FKolkata&forecast_days=3"
        );
        const d = await r.json();
        setWx(d);
        if (d.current) {
          setSensor(p=>({...p,
            temp:d.current.temperature_2m, humidity:d.current.relative_humidity_2m,
            pressure:d.current.pressure_msl, windSpeed:d.current.wind_speed_10m,
            windDir:d.current.wind_direction_10m, uvIndex:d.current.uv_index??p.uvIndex,
            rainfall:d.current.precipitation,
          }));
          setPressureHistory(h=>[...h.slice(1), Math.round(d.current.pressure_msl)]);
        }
        setWxLoading(false);
      } catch { setWxLoading(false); }
    };
    go();
    const t = setInterval(go, 300_000);
    return ()=>clearInterval(t);
  },[]);

  /* Sensor micro-drift */
  useEffect(()=>{
    const t = setInterval(()=>{
      setSensor(p=>({...p,
        temp:+(p.temp+(Math.random()-.5)*.15).toFixed(1),
        windSpeed:+Math.max(0,(p.windSpeed+(Math.random()-.5)*1.2)).toFixed(1),
        aqi:Math.min(200,Math.max(10,Math.round(p.aqi+(Math.random()-.5)*2))),
      }));
      setPressureHistory(h=>{
        const last = h[h.length-1];
        const next = +(last+(Math.random()-.5)*0.3).toFixed(1);
        return [...h.slice(1), next];
      });
    }, 3000);
    return ()=>clearInterval(t);
  },[]);

  useEffect(() => {
    const unsubscribe = subscribeToSafetyProtocols((protocols) => {
      if (!protocols.length) return;
      const publishedProtocols = protocols
        .map((protocol) => ({
          ...protocol,
          icon: protocol.icon || deriveProtocolIcon(protocol.title),
          status: protocol.status || "draft",
          updated:
            protocol.updated ||
            (protocol.updatedAt
              ? new Date(protocol.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Recently"),
        }))
        .filter((protocol) => protocol.status === "published");

      if (publishedProtocols.length > 0) {
        setSafetyProtocols(publishedProtocols);
      }
    });

    return () => unsubscribe();
  }, []);

  const wxCode = wx?.current?.weather_code??0;
  const [wxIcon, wxDesc] = WX_CODES[wxCode]??["🌤️","—"];
  const pressureTrend = pressureHistory[pressureHistory.length-1] - pressureHistory[0];
  const safetyStatus  = pressureTrend < -2 ? "unsafe" : pressureTrend < -0.5 ? "caution" : "safe";
  const statusColor   = {safe:C.green, caution:C.amber, unsafe:C.red};
  const statusLabel   = {safe:"Safe to Trek ✓", caution:"Use Caution ⚠️", unsafe:"Unsafe Conditions ✗"};

  const handleSOSTrigger = () => {
    if (!sosConfirm) { setSosConfirm(true); return; }
    setSosActive(true); setSosConfirm(false); onSOS(true);
  };
  const cancelSOS = () => { setSosActive(false); setSosConfirm(false); onSOS(false); };

  return (
    <div>
      <PageHeader title="My Dashboard"
        sub={`Welcome back, ${user.name} · ${new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}`}
        right={<div style={{display:"flex",gap:8}}>
          <Pill color={safetyStatus==="safe"?"green":safetyStatus==="caution"?"amber":"red"}>
            {statusLabel[safetyStatus]}
          </Pill>
          <Pill color="green">● Live</Pill>
        </div>}/>

      {/* SOS Active Banner */}
      {sosActive&&(
        <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.4)",
          borderRadius:12,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:14,height:14,borderRadius:"50%",background:C.red,
            animation:"ud-sos-blink 1.2s infinite",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:C.red}}>🚨 SOS ACTIVE — Emergency Broadcast Sent</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>
              Rescue Team Alpha is en route · ETA 12 min · Your GPS is being tracked live
            </div>
          </div>
          <Btn variant="danger" onClick={cancelSOS}>✕ Cancel SOS</Btn>
          <Btn onClick={()=>onNavigate("sos-nav")}>Navigate →</Btn>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16,marginBottom:16}}>
        {/* Left: Profile Card */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Card style={{background:"linear-gradient(135deg,rgba(59,130,246,0.10),rgba(11,20,34,0.95))"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <Avatar initials={user.avatar} bg={user.color[0]} text={user.color[1]} size={50}/>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:C.text}}>{user.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{user.email}</div>
                <div style={{marginTop:4}}><Pill color="blue">{user.role}</Pill></div>
              </div>
            </div>
            {[
              ["📍 Location",  user.city],
              ["🩸 Blood",     user.blood],
              ["⚕️ Medical",   user.medical||"None"],
              ["📱 Devices",   `${user.devices} linked`],
              ["✈️ Trips",     `${user.trips} completed`],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,
                padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:12,display:"flex",gap:8}}>
              <Btn style={{flex:1,justifyContent:"center",fontSize:11}} onClick={()=>onNavigate("devices")}>📡 Devices</Btn>
              <Btn style={{flex:1,justifyContent:"center",fontSize:11}} onClick={()=>onNavigate("booking")}>✈️ Book Trip</Btn>
            </div>
          </Card>

          {/* Emergency Contacts */}
          <Card>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Emergency Contacts</div>
            {[{name:user.ec1Name,rel:user.ec1Rel,ph:user.ec1Ph},{name:user.ec2Name,rel:user.ec2Rel,ph:user.ec2Ph}].map((ec,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i===0?`1px solid ${C.border}`:"none"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(59,130,246,0.1)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>
                  {i===0?"👩":"👨"}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text}}>{ec.name}</div>
                  <div style={{fontSize:10,color:C.muted}}>{ec.rel} · {ec.ph}</div>
                </div>
                <a href={`tel:${ec.ph}`} style={{padding:"3px 10px",borderRadius:7,
                  background:"rgba(34,197,94,0.1)",border:`1px solid rgba(34,197,94,0.25)`,
                  color:C.green,fontSize:10,textDecoration:"none",fontWeight:500}}>📞</a>
              </div>
            ))}
          </Card>
        </div>

        {/* Right: weather + SOS button + safety */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Quick weather strip */}
          <Card style={{background:"linear-gradient(135deg,rgba(20,50,110,0.55),rgba(11,20,34,0.92))"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:50}}>{wxIcon}</div>
                <div>
                  <div style={{fontSize:44,fontWeight:700,color:C.text,lineHeight:1}}>
                    {sensor.temp}<span style={{fontSize:22,color:C.muted}}>°C</span>
                  </div>
                  <div style={{fontSize:13,color:C.muted}}>{wxDesc}</div>
                  <div style={{fontSize:11,color:C.muted2}}>Feels like {feelsLike(sensor.temp,sensor.humidity)}°C</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  ["💧","Humidity",`${sensor.humidity}%`],
                  ["🌬️","Wind",`${sensor.windSpeed} km/h ${windDirLabel(sensor.windDir)}`],
                  ["🌀","Pressure",`${sensor.pressure?.toFixed(0)} hPa`],
                  ["☀️","UV Index",`${sensor.uvIndex}`],
                ].map(([ic,k,v])=>(
                  <div key={k} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
                    borderRadius:9,padding:"7px 11px",minWidth:110}}>
                    <div style={{fontSize:10,color:C.muted2,marginBottom:1}}>{ic} {k}</div>
                    <div style={{fontSize:14,fontWeight:600,color:C.text}}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                {/* Safety status pill */}
                <div style={{background:`rgba(${safetyStatus==="safe"?"34,197,94":safetyStatus==="caution"?"245,158,11":"239,68,68"},0.12)`,
                  border:`1px solid rgba(${safetyStatus==="safe"?"34,197,94":safetyStatus==="caution"?"245,158,11":"239,68,68"},0.35)`,
                  borderRadius:10,padding:"10px 16px",textAlign:"center",minWidth:130}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:3}}>Trail Safety Status</div>
                  <div style={{fontSize:14,fontWeight:700,color:statusColor[safetyStatus]}}>{statusLabel[safetyStatus]}</div>
                  <div style={{fontSize:10,color:C.muted2,marginTop:3}}>
                    {pressureTrend>0?"↑ Pressure rising":"↓ Pressure dropping"} {Math.abs(pressureTrend).toFixed(1)} hPa
                  </div>
                </div>
                <button onClick={()=>onNavigate("weather")}
                  style={{marginTop:8,width:"100%",padding:"6px",background:"transparent",border:`1px solid ${C.border}`,
                    borderRadius:8,color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                  View full weather →
                </button>
              </div>
            </div>
          </Card>

          {/* SOS Button — hero */}
          <Card style={{background:"rgba(239,68,68,0.04)",border:`1px solid rgba(239,68,68,0.2)`,padding:"22px 24px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>🚨 Emergency SOS</div>
                <div style={{fontSize:12,color:C.muted,maxWidth:360,lineHeight:1.5}}>
                  One tap broadcasts your GPS coordinates, blood group, medical profile, and emergency contacts
                  to the nearest rescue team. <strong style={{color:"#fca5a5"}}>Use only in genuine emergencies.</strong>
                </div>
                {sosConfirm&&(
                  <div style={{marginTop:10,padding:"8px 12px",background:"rgba(239,68,68,0.1)",
                    border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,fontSize:12,color:"#fca5a5",fontWeight:500}}>
                    ⚠️ Are you sure? Tap SOS again to confirm broadcast.
                  </div>
                )}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <button onClick={sosActive?cancelSOS:handleSOSTrigger}
                  style={{
                    width:100,height:100,borderRadius:"50%",border:"none",cursor:"pointer",
                    background:sosActive
                      ? `radial-gradient(circle,rgba(239,68,68,0.9),rgba(185,28,28,1))`
                      : sosConfirm
                        ? `radial-gradient(circle,rgba(245,158,11,0.9),rgba(180,100,0,1))`
                        : `radial-gradient(circle,rgba(239,68,68,0.75),rgba(185,28,28,0.9))`,
                    boxShadow: sosActive
                      ? "0 0 0 8px rgba(239,68,68,0.2),0 0 0 18px rgba(239,68,68,0.08),0 0 40px rgba(239,68,68,0.4)"
                      : "0 0 0 6px rgba(239,68,68,0.15),0 4px 24px rgba(239,68,68,0.3)",
                    fontFamily:"inherit", animation: sosActive?"ud-sos-blink 1.2s infinite":undefined,
                  }}>
                  <div style={{fontSize:28,lineHeight:1}}>🆘</div>
                  <div style={{fontSize:11,fontWeight:800,color:"#fff",letterSpacing:"0.1em",marginTop:4}}>
                    {sosActive?"ACTIVE":sosConfirm?"CONFIRM":"SOS"}
                  </div>
                </button>
                {(sosActive||sosConfirm)&&(
                  <button onClick={()=>{setSosConfirm(false);setSosActive(false);onSOS(false);}}
                    style={{padding:"5px 14px",background:"transparent",border:`1px solid ${C.border}`,
                      borderRadius:8,color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* Recent booking teaser */}
          <Card>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:600,color:C.text}}>My Trips</div>
              <button onClick={()=>onNavigate("booking")} style={{fontSize:11,color:C.accent,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>View all →</button>
            </div>
            {MY_BOOKINGS.map(b=>(
              <div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:18,width:36,height:36,background:"rgba(59,130,246,0.08)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✈️</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text}}>{b.dest}</div>
                  <div style={{fontSize:10,color:C.muted}}>{b.date} · {b.persons} person{b.persons>1?"s":""}</div>
                </div>
                <Pill color={b.status==="confirmed"?"green":"amber"}>{b.status}</Pill>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Safety Protocols */}
      <div style={{marginTop:4}}>
        <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>📋 Safety Protocols</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {safetyProtocols.map(p=>(
            <Card key={p.id} style={{cursor:"pointer",transition:"border-color 0.2s",
              borderColor:expandProtocol===p.id?"rgba(59,130,246,0.4)":C.border}}
              onClick={()=>setExpandProtocol(expandProtocol===p.id?null:p.id)}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{fontSize:20,flexShrink:0,marginTop:2}}>{p.icon}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:13,fontWeight:500,color:C.text}}>{p.title}</div>
                    <span style={{fontSize:12,color:C.muted,transition:"transform 0.2s",
                      display:"inline-block",transform:expandProtocol===p.id?"rotate(180deg)":"none"}}>▾</span>
                  </div>
                  <div style={{fontSize:10,color:C.muted2,marginTop:2}}>Updated {p.updated}</div>
                  {expandProtocol===p.id&&(
                    <div style={{fontSize:12,color:C.muted,marginTop:10,lineHeight:1.7,
                      paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                      {p.body}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

const PageLiveTracking = ({ user, activeSOS, onSOS }) => {
  const [trackingToken, setTrackingToken] = useState(() => localStorage.getItem("nimbus_tracking_token") || "");
  const [tokenState, setTokenState] = useState(trackingToken ? "ready" : "loading");
  const [tokenError, setTokenError] = useState("");

  const issueToken = async () => {
    setTokenState("loading");
    setTokenError("");
    try {
      const response = await fetch(`${TRACKING_SERVER_URL}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: user.name, role: "user" }),
      });
      if (!response.ok) {
        throw new Error(`Token request failed (${response.status})`);
      }
      const data = await response.json();
      if (data.token) {
        localStorage.setItem("nimbus_tracking_token", data.token);
        setTrackingToken(data.token);
        setTokenState("ready");
      } else {
        throw new Error("Token missing in response");
      }
    } catch (error) {
      setTokenError(error.message || "Unable to obtain tracking token");
      setTokenState("manual");
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem("nimbus_tracking_token");
    if (cached && isUsableTrackingToken(cached, user)) {
      setTrackingToken(cached);
      setTokenState("ready");
      return;
    }

    if (cached) {
      localStorage.removeItem("nimbus_tracking_token");
      setTrackingToken("");
    }

    issueToken();
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.name]);

  return (
    <div>
      <PageHeader
        title="Live Tracking"
        sub="Real-time GPS sharing for your current trip"
        right={
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <Pill color={tokenState === "ready" ? "green" : tokenState === "loading" ? "amber" : "red"}>
              {tokenState === "ready" ? "JWT Ready" : tokenState === "loading" ? "Issuing token" : "Token missing"}
            </Pill>
            <Pill color={activeSOS ? "red" : "gray"}>{activeSOS ? "SOS Active" : "Tracking Ready"}</Pill>
          </div>
        }
      />

      {tokenError && (
        <Card style={{marginBottom:16,borderColor:"rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.04)"}}>
          <div style={{fontSize:12,color:"#fca5a5",marginBottom:10}}>
            Tracking token could not be issued automatically: {tokenError}. Start the tracking server or seed localStorage with a valid JWT.
          </div>
          <Btn onClick={issueToken} disabled={tokenState === "loading"}>
            {tokenState === "loading" ? "Retrying..." : "Retry Token Request"}
          </Btn>
        </Card>
      )}

      <UserTrackingWidget
        user={user}
        serverUrl={TRACKING_SERVER_URL}
        token={trackingToken}
        activeSOS={activeSOS}
        onSOS={onSOS}
        onTokenExpired={issueToken}
      />
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: TICKET BOOKING
════════════════════════════════════════════════ */
const PageBooking = () => {
  const [bookingType, setBookingType] = useState("solo");
  const [selectedDest, setSelectedDest] = useState(null);
  const [form, setForm] = useState({
    persons:1, dateFrom:"", dateTo:"", notes:"",
    members:[{name:"",blood:"A+",medical:"",phone:""}],
  });
  const [step, setStep] = useState("browse"); // browse | form | confirm | done
  const [myBookings, setMyBookings] = useState(MY_BOOKINGS);
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  const totalPrice = () => {
    if (!selectedDest) return 0;
    const base = parseInt(selectedDest.base.replace(/[₹,]/g,""));
    return base * form.persons;
  };

  const updateMember = (i,k,v) => setForm(f=>{
    const m = [...f.members];
    m[i]={...m[i],[k]:v};
    return {...f,members:m};
  });
  const addMember = () => setForm(f=>({...f,members:[...f.members,{name:"",blood:"A+",medical:"",phone:""}]}));
  const removeMember = (i) => setForm(f=>({...f,members:f.members.filter((_,j)=>j!==i)}));

  const confirmBooking = () => {
    setMyBookings(b=>[...b,{
      id:`BK${Date.now()}`,dest:selectedDest.name,
      date:`${form.dateFrom} – ${form.dateTo}`,
      persons:form.persons,price:`₹${totalPrice().toLocaleString("en-IN")}`,
      status:"pending",type:bookingType,
    }]);
    setStep("done");
  };

  const difficultyColor = {Easy:C.green, Medium:C.amber, Hard:C.red};
  const bloodOptions = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

  return (
    <div>
      <PageHeader title="Trip Booking"
        sub="Book treks, expeditions and tours for solo or group travel"
        right={<div style={{display:"flex",gap:8}}>
          {["solo","couple","group"].map(t=>(
            <button key={t} onClick={()=>setBookingType(t)}
              style={{padding:"5px 14px",borderRadius:8,border:`1px solid ${bookingType===t?C.accent:C.border}`,
                background:bookingType===t?"rgba(59,130,246,0.12)":"transparent",
                color:bookingType===t?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>
              {t==="solo"?"🧍 Solo":t==="couple"?"👫 Couple":"👥 Group"}
            </button>
          ))}
        </div>}/>

      {step==="done"&&(
        <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.3)",
          borderRadius:12,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:28}}>✅</div>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:C.green}}>Booking submitted for admin approval!</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>You'll receive a confirmation once approved. Check "My Bookings" below.</div>
          </div>
          <Btn onClick={()=>setStep("browse")} style={{marginLeft:"auto"}}>Browse more →</Btn>
        </div>
      )}

      {/* Destination grid */}
      {step==="browse"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          {DESTINATIONS.map(d=>(
            <Card key={d.id} style={{cursor:"pointer",transition:"border-color 0.2s,transform 0.15s",
              borderColor:selectedDest?.id===d.id?"rgba(59,130,246,0.5)":C.border,
              background:selectedDest?.id===d.id?"rgba(59,130,246,0.06)":C.card}}
              onClick={()=>setSelectedDest(selectedDest?.id===d.id?null:d)}>
              <div style={{fontSize:32,marginBottom:8}}>{d.img}</div>
              <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:3}}>{d.name}</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>📍 {d.state} · ⏱ {d.duration}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                <Pill color={d.difficulty==="Easy"?"green":d.difficulty==="Medium"?"amber":"red"}>{d.difficulty}</Pill>
                {d.tags.slice(0,2).map(t=><Pill key={t} color="gray">{t}</Pill>)}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:15,fontWeight:700,color:C.accent}}>{d.base}<span style={{fontSize:10,color:C.muted}}>/person</span></div>
                <div style={{fontSize:10,color:C.muted2}}>Max {d.maxGroup}</div>
              </div>
              {selectedDest?.id===d.id&&(
                <button onClick={e=>{e.stopPropagation();setStep("form");}}
                  style={{marginTop:10,width:"100%",padding:"7px",background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                    border:"none",borderRadius:8,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  Book this trip →
                </button>
              )}
            </Card>
          ))}
        </div>
      </>}

      {/* Booking form */}
      {step==="form"&&selectedDest&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:16}}>
          <Card>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
              <div style={{fontSize:28}}>{selectedDest.img}</div>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:C.text}}>{selectedDest.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{selectedDest.state} · {selectedDest.duration}</div>
              </div>
              <button onClick={()=>setStep("browse")} style={{marginLeft:"auto",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>✕</button>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <FieldRow label="DEPARTURE DATE">
                <Input type="date" value={form.dateFrom} onChange={e=>upd("dateFrom",e.target.value)}/>
              </FieldRow>
              <FieldRow label="RETURN DATE">
                <Input type="date" value={form.dateTo} onChange={e=>upd("dateTo",e.target.value)}/>
              </FieldRow>
            </div>

            {bookingType!=="solo"&&<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>
                  Group Members ({form.members.length})
                </div>
                {bookingType==="group"&&form.members.length<selectedDest.maxGroup&&(
                  <Btn onClick={addMember}>+ Add Member</Btn>
                )}
              </div>
              {form.members.map((m,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,
                  borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:500,color:C.text}}>Member {i+1} {i===0?"(Trip Lead)":""}</div>
                    {i>0&&<button onClick={()=>removeMember(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12}}>✕ Remove</button>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 2fr 1fr",gap:10}}>
                    <Input value={m.name}    onChange={e=>updateMember(i,"name",e.target.value)}    placeholder="Full name"/>
                    <Select value={m.blood}  onChange={e=>updateMember(i,"blood",e.target.value)}>
                      {bloodOptions.map(b=><option key={b} value={b} style={{background:"#0b1422"}}>{b}</option>)}
                    </Select>
                    <Input value={m.medical} onChange={e=>updateMember(i,"medical",e.target.value)} placeholder="Medical conditions"/>
                    <Input value={m.phone}   onChange={e=>updateMember(i,"phone",e.target.value)}   placeholder="+91…" type="tel"/>
                  </div>
                </div>
              ))}
            </>}

            <FieldRow label="SPECIAL NOTES">
              <textarea value={form.notes} onChange={e=>upd("notes",e.target.value)}
                placeholder="Dietary requirements, accessibility needs, custom requests…"
                style={{width:"100%",height:80,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,
                  borderRadius:8,color:C.text,fontSize:13,padding:"8px 12px",fontFamily:"inherit",
                  resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
            </FieldRow>
          </Card>

          {/* Summary sidebar */}
          <div>
            <Card style={{marginBottom:12,borderColor:"rgba(59,130,246,0.3)"}}>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Booking Summary</div>
              {[
                ["Destination",selectedDest.name],
                ["Difficulty",selectedDest.difficulty],
                ["Duration",selectedDest.duration],
                ["Type",bookingType.charAt(0).toUpperCase()+bookingType.slice(1)],
                ["Dates",form.dateFrom&&form.dateTo?`${form.dateFrom} – ${form.dateTo}`:"Select dates"],
                ["Persons",bookingType==="solo"?1:form.members.length],
                ["Base price",selectedDest.base+" / person"],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,
                  padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted2}}>{k}</span>
                  <span style={{color:C.text,fontWeight:500}}>{v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,
                borderTop:`2px solid ${C.border2}`}}>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>Total</span>
                <span style={{fontSize:18,fontWeight:800,color:C.accent}}>₹{totalPrice().toLocaleString("en-IN")}</span>
              </div>
            </Card>
            <button onClick={confirmBooking}
              style={{width:"100%",padding:"12px",background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,
                cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>
              ✈️ Confirm Booking
            </button>
            <Btn onClick={()=>setStep("browse")} style={{width:"100%",justifyContent:"center"}}>← Change Destination</Btn>
          </div>
        </div>
      )}

      {/* My Bookings history */}
      <div style={{marginTop:20}}>
        <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>My Bookings</div>
        {myBookings.length===0&&<div style={{color:C.muted,fontSize:13}}>No bookings yet.</div>}
        {myBookings.map(b=>(
          <Card key={b.id} style={{marginBottom:10,borderColor:b.status==="confirmed"?"rgba(34,197,94,0.25)":b.status==="pending"?"rgba(245,158,11,0.25)":C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:22,width:42,height:42,background:"rgba(59,130,246,0.08)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✈️</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:14,fontWeight:600,color:C.text}}>{b.dest}</div>
                  <Pill color={b.status==="confirmed"?"green":b.status==="pending"?"amber":"red"}>{b.status}</Pill>
                  <Pill color="blue">{b.type}</Pill>
                </div>
                <div style={{fontSize:12,color:C.muted}}>{b.date} · {b.persons} person{b.persons>1?"s":""} · {b.price}</div>
              </div>
              {b.status==="confirmed"&&<Pill color="green">✓ Ready</Pill>}
              {b.status==="pending"&&<Pill color="amber">⏳ Awaiting admin approval</Pill>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: DEVICE CONNECTION
════════════════════════════════════════════════ */
const PageDeviceConnect = ({ user }) => {
  const [devices, setDevices]       = useState(MY_DEVICES);
  const [nearby, setNearby]         = useState(NEARBY_DEVICES);
  const [scanning, setScanning]     = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [editId, setEditId]         = useState(null);
  const [sosToggle, setSosToggle]   = useState({DEV001:true,DEV002:true,DEV003:false});
  const [gpsToggle, setGpsToggle]   = useState({DEV001:true,DEV002:true,DEV003:false});
  const [loading, setLoading]       = useState(false);

  // Load devices from backend on mount
  useEffect(() => {
    if (!user?.id) return;
    const loadDevices = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/users/${user.id}/devices`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.devices) && data.devices.length > 0) {
            setDevices(data.devices);
          }
        }
      } catch (error) {
        console.error("Failed to load devices:", error);
      }
    };
    loadDevices();
  }, [user?.id]);

  const startScan = () => {
    setScanning(true); setScanProgress(0);
    const t = setInterval(()=>{
      setScanProgress(p=>{ if(p>=100){clearInterval(t);setScanning(false);return 100;} return p+5; });
    }, 80);
  };

  const connectDevice = async (id) => {
    if (!user?.id || loading) return;
    setLoading(true);
    try {
      const found = NEARBY_DEVICES.find(d=>d.id===id);
      if (!found) return;

      const response = await fetch(`${AUTH_API_URL}/users/${user.id}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `DEV_${Date.now()}`,
          name: found.name,
          type: found.type,
          mac: found.mac,
          battery: 75,
          signal: "medium",
          gps: true,
          sos: false,
          connected: true,
          lat: user.lat,
          lon: user.lon,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
        setNearby(n=>n.filter(d=>d.id!==id));
      }
    } catch (error) {
      console.error("Failed to connect device:", error);
    } finally {
      setLoading(false);
    }
  };

  const disconnectDevice = async (id) => {
    if (!user?.id || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/users/${user.id}/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connected: false }),
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error("Failed to disconnect device:", error);
    } finally {
      setLoading(false);
    }
  };

  const removeDevice = async (id) => {
    if (!user?.id || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/users/${user.id}/devices/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error("Failed to remove device:", error);
    } finally {
      setLoading(false);
    }
  };

  const sigColor = {strong:C.green, medium:C.amber, low:C.red};
  const batteryColor = (b) => b>60?C.green:b>25?C.amber:C.red;

  return (
    <div>
      <PageHeader title="Device Connection"
        sub="Manage and monitor all your connected safety devices"
        right={<div style={{display:"flex",gap:8}}>
          <Pill color="green">● {devices.filter(d=>d.connected).length} online</Pill>
          <Btn variant="primary" onClick={startScan} disabled={scanning}>
            {scanning?`Scanning ${scanProgress}%`:"🔍 Scan for Devices"}
          </Btn>
        </div>}/>

      {/* Scan progress */}
      {scanning&&(
        <Card style={{marginBottom:16,borderColor:"rgba(59,130,246,0.3)"}}>
          <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Scanning for nearby Bluetooth & Wi-Fi devices…</div>
          <div style={{height:6,background:"rgba(255,255,255,0.06)",borderRadius:4}}>
            <div style={{height:"100%",borderRadius:4,background:`linear-gradient(90deg,${C.accent},${C.teal})`,
              width:`${scanProgress}%`,transition:"width 0.12s"}}/>
          </div>
          {scanProgress===100&&<div style={{fontSize:11,color:C.green,marginTop:6}}>✓ Scan complete — {nearby.length} device(s) found nearby</div>}
        </Card>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* My devices */}
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
            My Devices ({devices.length})
          </div>
          {devices.map(d=>(
            <Card key={d.id} style={{marginBottom:10,borderColor:d.connected?"rgba(34,197,94,0.25)":C.border}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{width:42,height:42,background:"rgba(255,255,255,0.05)",borderRadius:10,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                  {d.type==="phone"?"📱":d.type==="watch"?"⌚":"🛰️"}
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>{d.name}</div>
                    <Pill color={d.connected?"green":"gray"}>{d.connected?"Online":"Offline"}</Pill>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:6}}>
                    MAC: <span style={{fontFamily:"monospace",color:C.muted2}}>{d.mac}</span>
                  </div>
                  {d.connected&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                    {[
                      ["Battery",`${d.battery}%`,batteryColor(d.battery)],
                      ["Signal",d.signal,sigColor[d.signal]],
                      ["GPS",d.gps?"Active":"Off",d.gps?C.green:C.muted],
                      ["Type",d.type.charAt(0).toUpperCase()+d.type.slice(1),C.muted],
                    ].map(([k,v,col])=>(
                      <div key={k} style={{background:"rgba(255,255,255,0.03)",borderRadius:7,padding:"5px 8px"}}>
                        <div style={{fontSize:9,color:C.muted2,marginBottom:1}}>{k}</div>
                        <div style={{fontSize:12,fontWeight:600,color:col||C.text}}>{v}</div>
                      </div>
                    ))}
                  </div>}
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.muted}}>
                      <Toggle on={sosToggle[d.id]} onChange={()=>setSosToggle(t=>({...t,[d.id]:!t[d.id]}))}/>
                      SOS enabled
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.muted}}>
                      <Toggle on={gpsToggle[d.id]} onChange={()=>setGpsToggle(t=>({...t,[d.id]:!t[d.id]}))}/>
                      GPS share
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {d.connected
                    ? <Btn onClick={()=>disconnectDevice(d.id)} style={{fontSize:10,padding:"4px 10px"}}>Disconnect</Btn>
                    : <Btn variant="success" onClick={()=>setDevices(devs=>devs.map(dev=>dev.id===d.id?{...dev,connected:true}:dev))} style={{fontSize:10,padding:"4px 10px"}}>Reconnect</Btn>}
                  <Btn onClick={()=>removeDevice(d.id)} style={{fontSize:10,padding:"4px 10px",border:"1px solid rgba(239,68,68,0.3)",color:"#fca5a5"}}>Remove</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Nearby / Add */}
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
            Nearby Devices {nearby.length>0&&`(${nearby.length} found)`}
          </div>
          {nearby.length===0&&!scanning&&(
            <Card style={{textAlign:"center",color:C.muted,padding:"32px 18px"}}>
              <div style={{fontSize:32,marginBottom:8}}>📡</div>
              <div style={{fontSize:13}}>No nearby devices detected</div>
              <div style={{fontSize:11,color:C.muted2,marginTop:4}}>Tap "Scan for Devices" to search</div>
            </Card>
          )}
          {nearby.map(d=>(
            <Card key={d.id} style={{marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:38,height:38,background:"rgba(255,255,255,0.04)",borderRadius:9,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                  {d.type==="watch"?"⌚":d.type==="satellite"?"🛰️":"📡"}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:2}}>{d.name}</div>
                  <div style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{d.mac}</div>
                  <div style={{fontSize:10,color:C.muted2,marginTop:2}}>
                    Signal: {d.rssi} dBm · <Pill color="gray">{d.type}</Pill>
                  </div>
                </div>
                <Btn variant="primary" onClick={()=>connectDevice(d.id)} style={{fontSize:11,padding:"5px 12px"}}>
                  + Connect
                </Btn>
              </div>
            </Card>
          ))}

          {/* Device info card */}
          <Card style={{marginTop:12,background:"rgba(59,130,246,0.04)",borderColor:"rgba(59,130,246,0.2)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Compatible Devices</div>
            {[
              {icon:"📱",type:"Smartphones",desc:"iOS & Android with Nimbus app"},
              {icon:"⌚",type:"Smartwatches",desc:"Garmin, Apple Watch, Polar"},
              {icon:"🛰️",type:"Satellite Comms",desc:"Garmin inReach, SPOT, ZOLEO"},
              {icon:"📡",type:"LoRa Beacons",desc:"Custom ESP32 + LoRa 433MHz nodes"},
            ].map(d=>(
              <div key={d.type} style={{display:"flex",gap:10,alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:16,width:24,textAlign:"center"}}>{d.icon}</span>
                <div>
                  <div style={{fontSize:12,fontWeight:500,color:C.text}}>{d.type}</div>
                  <div style={{fontSize:10,color:C.muted2}}>{d.desc}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: FORTS EXPLORER
════════════════════════════════════════════════ */
const PageForts = ({ onNavigate, onSelectFort }) => {
  const [selectedFort, setSelectedFort] = useState(FORTS[0]);
  const [mapReady, setMapReady] = useState(!!window.L);

  useEffect(() => {
    injectLeafletStyles();
    ensureLeaflet(() => setMapReady(true));
  }, []);

  // Leaflet Map Component
  const FortMap = () => {
    const ref = useRef(null);
    const mapRef2 = useRef(null);

    useEffect(() => {
      if (!mapReady || !ref.current) return;
      const L = window.L;
      if (mapRef2.current) { mapRef2.current.remove(); mapRef2.current = null; }

      // Center on selected fort
      const map = L.map(ref.current, {
        center: [selectedFort.lat, selectedFort.lon],
        zoom: 9,
        zoomControl: true,
      });

      const { url, attr } = TILE_LAYERS.terrain || TILE_LAYERS.road;
      L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(map);

      // Add markers for all forts
      FORTS.forEach((fort) => {
        const isSelected = fort.id === selectedFort.id;
        const mkI = L.divIcon({
          className: "",
          html: `<div style="width:${isSelected ? 24 : 18}px;height:${isSelected ? 24 : 18}px;border-radius:50%;background:${isSelected ? "#f59e0b" : "#ef4444"};border:2.5px solid #fff;box-shadow:0 0 0 6px ${isSelected ? "#f59e0b" : "#ef4444"}44,0 2px 8px rgba(0,0,0,.5);cursor:pointer;transition:all 0.2s;"></div>`,
          iconSize: [isSelected ? 24 : 18, isSelected ? 24 : 18],
          iconAnchor: [isSelected ? 12 : 9, isSelected ? 12 : 9],
          popupAnchor: [0, -12],
        });

        const marker = L.marker([fort.lat, fort.lon], { icon: mkI }).addTo(map);
        marker.bindPopup(
          `<b>${fort.name}</b><br><small>${fort.altitude} ASL<br>${fort.state}</small>`
        );

        // Click marker to select fort
        marker.on("click", () => setSelectedFort(fort));
      });

      mapRef2.current = map;
      return () => {
        if (mapRef2.current) { mapRef2.current.remove(); mapRef2.current = null; }
      };
    }, [mapReady, selectedFort.id]);

    return (
      <div style={{
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        boxShadow: "0 4px 24px rgba(0,0,0,.4)",
      }}>
        {!mapReady && (
          <div style={{
            height: 400,
            background: "#080f1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.muted,
            fontSize: 13,
          }}>
            ⏳ Loading map…
          </div>
        )}
        <div ref={ref} style={{ height: 400, display: mapReady ? "block" : "none" }} />
      </div>
    );
  };

  const handleViewDetails = () => {
    onSelectFort(selectedFort);
    onNavigate("fort-detail");
  };

  return (
    <div>
      <PageHeader
        title="Forts Explorer"
        sub="Discover Maharashtra's historic forts and plan your trekking adventures"
        right={<Pill color="blue">🏰 {FORTS.length} Forts</Pill>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, marginBottom: 20 }}>
        {/* Left: Fort List */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: "auto",
          maxHeight: 500,
        }}>
          {FORTS.map((fort) => (
            <div
              key={fort.id}
              onClick={() => setSelectedFort(fort)}
              style={{
                padding: "12px 14px",
                borderBottom: `1px solid ${C.border}`,
                cursor: "pointer",
                background:
                  selectedFort.id === fort.id
                    ? "rgba(59,130,246,0.12)"
                    : "transparent",
                borderLeft:
                  selectedFort.id === fort.id
                    ? `3px solid ${C.accent}`
                    : "3px solid transparent",
                transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>
                {fort.name}
              </div>
              <div style={{ fontSize: 10, color: C.muted2, marginTop: 2 }}>
                {fort.hindi}
              </div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
                {fort.altitude} · {fort.difficulty_level}
              </div>
            </div>
          ))}
        </div>

        {/* Right: Map */}
        <FortMap />
      </div>

      {/* Fort Details */}
      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          <StatCard
            label="Altitude"
            value={selectedFort.altitude}
            icon="📏"
            color={C.amber}
          />
          <StatCard
            label="Trek Duration"
            value={selectedFort.trek}
            icon="⏱️"
            color={C.teal}
          />
          <StatCard
            label="Difficulty"
            value={selectedFort.difficulty_level}
            icon="⛰️"
            color={C.purple}
          />
          <StatCard
            label="Best Season"
            value={selectedFort.best_season}
            icon="📅"
            color={C.green}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            📖 History
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            {selectedFort.history}
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            ⭐ Attractions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectedFort.attractions.map((attr, i) => (
              <Pill key={i} color="teal">
                {attr}
              </Pill>
            ))}
          </div>
        </div>

        <button
          onClick={handleViewDetails}
          style={{
            padding: "10px 16px",
            background: C.accent,
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
          📖 View Detailed Information
        </button>
      </Card>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: FORT DETAIL (dedicated detailed view)
════════════════════════════════════════════════ */
const PageFortDetail = ({ selectedFort, onNavigate, onBack }) => {
  const [mapReady, setMapReady] = useState(!!window.L);

  useEffect(() => {
    injectLeafletStyles();
    ensureLeaflet(() => setMapReady(true));
  }, []);

  const FortDetailMap = () => {
    const ref = useRef(null);
    const mapRef2 = useRef(null);

    useEffect(() => {
      if (!mapReady || !ref.current) return;
      const L = window.L;
      if (mapRef2.current) { mapRef2.current.remove(); mapRef2.current = null; }

      const map = L.map(ref.current, {
        center: [selectedFort.lat, selectedFort.lon],
        zoom: 12,
        zoomControl: true,
      });

      const { url, attr } = TILE_LAYERS.terrain || TILE_LAYERS.road;
      L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(map);

      const mkI = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 0 8px #f59e0b44,0 4px 12px rgba(0,0,0,.6);"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });

      L.marker([selectedFort.lat, selectedFort.lon], { icon: mkI })
        .addTo(map)
        .bindPopup(`<b>${selectedFort.name}</b><br>${selectedFort.altitude} ASL`);

      mapRef2.current = map;
      return () => {
        if (mapRef2.current) { mapRef2.current.remove(); mapRef2.current = null; }
      };
    }, [mapReady]);

    return (
      <div style={{
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        boxShadow: "0 4px 24px rgba(0,0,0,.4)",
      }}>
        {!mapReady && (
          <div style={{
            height: 450,
            background: "#080f1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.muted,
            fontSize: 13,
          }}>
            ⏳ Loading map…
          </div>
        )}
        <div ref={ref} style={{ height: 450, display: mapReady ? "block" : "none" }} />
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: C.card,
            border: `1px solid ${C.border}`,
            color: C.text,
            fontSize: 18,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
          ←
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.text }}>
            {selectedFort.name}
          </h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {selectedFort.hindi} · {selectedFort.state}
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
        <StatCard label="Altitude" value={selectedFort.altitude} icon="📏" color={C.amber} />
        <StatCard label="Trek Duration" value={selectedFort.trek} icon="⏱️" color={C.teal} />
        <StatCard label="Difficulty" value={selectedFort.difficulty_level} icon="⛰️" color={C.purple} />
        <StatCard label="Best Season" value={selectedFort.best_season} icon="📅" color={C.green} />
      </div>

      {/* Map */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 12 }}>
          📍 Location Map
        </div>
        <FortDetailMap />
      </Card>

      {/* History */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          📖 Historical Background
        </div>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.8, margin: 0 }}>
          {selectedFort.history}
        </p>
      </Card>

      {/* Attractions */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          ⭐ Attractions & Highlights
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {selectedFort.attractions.map((attr, i) => (
            <div
              key={i}
              style={{
                padding: 12,
                background: "rgba(59,130,246,0.08)",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 12,
                color: C.text,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
              <span style={{ fontSize: 16 }}>✨</span>
              {attr}
            </div>
          ))}
        </div>
      </Card>

      {/* Trek Info */}
      <Card style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          🥾 Trek Information
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Duration
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.accent }}>
              {selectedFort.trek}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Difficulty Level
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.amber }}>
              {selectedFort.difficulty_level}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Difficulty
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>
              {selectedFort.difficulty}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Best Season
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
              {selectedFort.best_season}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: WEATHER MAPS (mirrors admin exactly)
════════════════════════════════════════════════ */
const PageWeatherMaps = () => {
  const [tab, setTab]           = useState("live");
  const [mapType, setMapType]   = useState("terrain");
  const [perspective, setPerspective] = useState(false);
  const [wx, setWx]             = useState(null);
  const [loading, setLoading]   = useState(true);
  const [sensor, setSensor]     = useState({
    temp:27.4, humidity:68, pressure:1013.2, windSpeed:9.8, windDir:210,
    uvIndex:5.8, rainfall:0.0, altitude:580, co2:415, aqi:52,
    lastSync:new Date().toLocaleTimeString("en-IN"),
  });

  useEffect(()=>{
    const go = async () => {
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
        if(d.current) setSensor(p=>({...p,
          temp:d.current.temperature_2m, humidity:d.current.relative_humidity_2m,
          pressure:d.current.pressure_msl, windSpeed:d.current.wind_speed_10m,
          windDir:d.current.wind_direction_10m, uvIndex:d.current.uv_index??p.uvIndex,
          rainfall:d.current.precipitation, lastSync:new Date().toLocaleTimeString("en-IN"),
        }));
        setLoading(false);
      } catch { setLoading(false); }
    };
    go(); const t = setInterval(go,300_000); return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const t = setInterval(()=>setSensor(p=>({...p,
      temp:+(p.temp+(Math.random()-.5)*.18).toFixed(1),
      windSpeed:+Math.max(0,(p.windSpeed+(Math.random()-.5)*1.4)).toFixed(1),
      co2:Math.round(p.co2+(Math.random()-.5)*3),
      aqi:Math.min(200,Math.max(10,Math.round(p.aqi+(Math.random()-.5)*2))),
      lastSync:new Date().toLocaleTimeString("en-IN"),
    })),2000);
    return()=>clearInterval(t);
  },[]);

  /* Leaflet with geofence layer */
  const LeafletWeatherMap = ({ height, tileType, perspective:tilted, extraMarkers=[] }) => {
    const ref = useRef(null);
    const mapRef2 = useRef(null);
    const [rdy, setRdy] = useState(!!window.L);
    useEffect(()=>{ injectLeafletStyles(); ensureLeaflet(()=>setRdy(true)); },[]);
    useEffect(()=>{
      if(!rdy||!ref.current) return;
      const L = window.L;
      if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}
      const map = L.map(ref.current,{center:[18.5196,73.8554],zoom:12,zoomControl:true});
      const {url,attr} = TILE_LAYERS[tileType]||TILE_LAYERS.road;
      L.tileLayer(url,{attribution:attr,maxZoom:19}).addTo(map);
      const mkI = (color) => L.divIcon({className:"",
        html:`<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 5px ${color}44;"></div>`,
        iconSize:[14,14],iconAnchor:[7,7],popupAnchor:[0,-10]});
      L.marker([18.5196,73.8554],{icon:mkI("#3b82f6")}).addTo(map)
        .bindPopup("<b>📡 Weather Station</b><br><small>Mulshi, Maharashtra<br>18.52°N · 73.85°E · 580m ASL</small>");
      extraMarkers.forEach(m=>{
        const mk = L.marker([m.lat,m.lon],{icon:mkI(m.color||"#ef4444")}).addTo(map);
        if(m.popup) mk.bindPopup(m.popup);
      });
      mapRef2.current = map;
      return()=>{if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}};
    },[rdy,tileType]);
    return (
      <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`,boxShadow:"0 4px 24px rgba(0,0,0,.4)",
        ...(tilted?{transform:"perspective(900px) rotateX(28deg)",transformOrigin:"top center"}:{})}}>
        {!rdy&&<div style={{height,background:"#080f1a",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13}}>⏳ Loading map…</div>}
        <div ref={ref} style={{height,display:rdy?"block":"none"}}/>
      </div>
    );
  };

  const wxCode = wx?.current?.weather_code??0;
  const [wxIcon,wxDesc] = WX_CODES[wxCode]??["🌤️","—"];
  const cur = wx?.current;
  const TABS = [
    {id:"live",icon:"🌡️",label:"Live Weather"},
    {id:"map",icon:"🗺️",label:"Live Map"},
    {id:"forecast",icon:"📅",label:"7-Day Forecast"},
  ];

  return (
    <div>
      <PageHeader title="Weather & Maps"
        sub={`Live · Mulshi, Maharashtra · ${loading?"Loading…":"Updated "+sensor.lastSync}`}
        right={<Pill color="green">● Live Data</Pill>}/>

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 14px",borderRadius:9,
            border:`1px solid ${tab===t.id?C.accent:C.border}`,
            background:tab===t.id?"rgba(59,130,246,0.12)":"transparent",
            color:tab===t.id?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",
            display:"flex",alignItems:"center",gap:6}}>{t.icon} {t.label}</button>
        ))}
      </div>

      {tab==="live"&&<div>
        <Card style={{marginBottom:14,background:"linear-gradient(135deg,rgba(20,50,110,0.55),rgba(11,20,34,0.92))"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>📍 Mulshi, Maharashtra · Hinjawadi</div>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:60}}>{wxIcon}</div>
                <div>
                  <div style={{fontSize:50,fontWeight:700,color:C.text,lineHeight:1}}>{sensor.temp}<span style={{fontSize:24,color:C.muted}}>°C</span></div>
                  <div style={{fontSize:14,color:C.muted,marginTop:2}}>{wxDesc}</div>
                  <div style={{fontSize:11,color:C.muted2,marginTop:2}}>Feels like {feelsLike(sensor.temp,sensor.humidity)}°C</div>
                </div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["💧","Humidity",`${sensor.humidity}%`],["🌬️","Wind",`${sensor.windSpeed} km/h ${windDirLabel(sensor.windDir)}`],
               ["🌀","Pressure",`${sensor.pressure?.toFixed(0)} hPa`],["🌂","Rainfall",`${sensor.rainfall} mm`],
               ["☀️","UV Index",`${sensor.uvIndex}`],["☁️","Cloud",`${cur?.cloud_cover??"—"}%`]].map(([ic,k,v])=>(
                <div key={k} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",minWidth:110}}>
                  <div style={{fontSize:10,color:C.muted2,marginBottom:2}}>{ic} {k}</div>
                  <div style={{fontSize:15,fontWeight:600,color:C.text}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.muted2,display:"flex",gap:16,flexWrap:"wrap"}}>
            <span>⚡ Open-Meteo API</span><span>🔄 Last sync: {sensor.lastSync}</span>
            <span>📡 Protocol: MQTT / LoRa Gateway</span>
          </div>
        </Card>
        {wx?.hourly&&(
          <Card style={{marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Hourly Temperature (next 24h)</div>
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
              {wx.hourly.time.slice(0,24).map((t,i)=>{
                const hr=t.split("T")[1]?.substring(0,5);
                const tmp=wx.hourly.temperature_2m[i];
                const pp=wx.hourly.precipitation_probability?.[i]??0;
                return (
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                    flexShrink:0,minWidth:44,padding:"6px 4px",borderRadius:8,
                    background:i===0?"rgba(59,130,246,0.1)":"transparent"}}>
                    <div style={{fontSize:9,color:C.muted2}}>{hr}</div>
                    <div style={{fontSize:13,fontWeight:600,color:tmp>35?C.red:tmp>30?C.amber:tmp>25?C.accent:C.teal}}>{tmp}°</div>
                    {pp>20&&<div style={{fontSize:9,color:C.teal}}>💧{pp}%</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card>
            <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>⚠️ Active Alerts</div>
            {[{col:"amber",title:"Heat advisory",desc:`Temp ${sensor.temp>30?"above":"near"} 30°C. Stay hydrated during treks.`},
              {col:"blue",title:"Wind advisory",desc:`${sensor.windSpeed>20?"Moderate":"Low"} winds from ${windDirLabel(sensor.windDir)}. Check trail conditions.`}].map(a=>(
              <div key={a.title} style={{background:"rgba(255,255,255,0.03)",
                border:`1px solid ${a.col==="amber"?"rgba(245,158,11,0.3)":"rgba(59,130,246,0.2)"}`,
                borderRadius:9,padding:"9px 12px",marginBottom:7}}>
                <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:2}}>{a.title}</div>
                <div style={{fontSize:11,color:C.muted}}>{a.desc}</div>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>📊 Air Quality</div>
            {[["AQI",sensor.aqi,200,sensor.aqi<50?C.green:sensor.aqi<100?C.amber:C.red],
              ["CO₂",sensor.co2-350,200,sensor.co2<450?C.green:C.amber],
              ["Humidity",sensor.humidity,100,C.teal]].map(([label,val,max,col])=>(
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
      </div>}

      {tab==="map"&&<div>
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
          {[["road","🗺️ Road"],["satellite","🛰️ Satellite"],["terrain","🏔️ Terrain"]].map(([v,label])=>(
            <button key={v} onClick={()=>setMapType(v)} style={{padding:"6px 14px",borderRadius:8,
              border:`1px solid ${mapType===v?C.accent:C.border}`,
              background:mapType===v?"rgba(59,130,246,0.12)":"transparent",
              color:mapType===v?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
          ))}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:C.muted}}>3D tilt</span>
            <Toggle on={perspective} onChange={()=>setPerspective(x=>!x)}/>
          </div>
        </div>
        <LeafletWeatherMap height={480} tileType={mapType} perspective={perspective}
          extraMarkers={[{lat:18.52,lon:73.85,color:"#22c55e",popup:"<b>📍 My Location</b><br>Mulshi, Maharashtra"}]}/>
        <div style={{marginTop:10,display:"flex",gap:16,fontSize:11,color:C.muted2,flexWrap:"wrap"}}>
          <span>📍 18.52°N, 73.85°E</span>
          <span>🗺️ Mulshi Reservoir — Western Ghats</span>
          <span>🏔️ Alt: {sensor.altitude}m ASL</span>
          <span>🌐 OpenStreetMap / ESRI · Free tiles</span>
        </div>
      </div>}

      {tab==="forecast"&&<div>
        {wx?.daily?(
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,marginBottom:14}}>
              {wx.daily.time.map((d,i)=>{
                const dt=new Date(d);
                const dstr=dt.toLocaleDateString("en-IN",{weekday:"short",day:"numeric"});
                const [ic]=WX_CODES[wx.daily.weather_code[i]]??["🌤️"];
                return (
                  <Card key={d} style={{textAlign:"center",marginBottom:0,padding:"14px 8px"}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{dstr}</div>
                    <div style={{fontSize:28,marginBottom:4}}>{ic}</div>
                    <div style={{fontSize:15,fontWeight:700,color:C.red}}>{wx.daily.temperature_2m_max[i]}°</div>
                    <div style={{fontSize:12,color:C.muted}}>{wx.daily.temperature_2m_min[i]}°</div>
                    <div style={{fontSize:10,color:C.teal,marginTop:2}}>💧{wx.daily.precipitation_sum[i]}mm</div>
                    <div style={{fontSize:10,color:C.muted2,marginTop:1}}>💨{wx.daily.wind_speed_10m_max[i]}km/h</div>
                  </Card>
                );
              })}
            </div>
            <Card>
              <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:12}}>Weekly Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {[["Avg High",`${(wx.daily.temperature_2m_max.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.red],
                  ["Avg Low",`${(wx.daily.temperature_2m_min.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.teal],
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
        ):<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.muted2}}>
          {loading?"⏳ Loading forecast…":"⚠️ Forecast unavailable"}
        </div>}
      </div>}
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SOS NAVIGATION  (user view)
════════════════════════════════════════════════ */
const PageSOSNav = ({ user, activeSOS }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed]         = useState(0);
  const [teamPos, setTeamPos]         = useState({lat:RESCUE_TEAMS[0].lat,lon:RESCUE_TEAMS[0].lon});
  const [navMode, setNavMode]         = useState(false);
  const [trackingToken, setTrackingToken] = useState(() => localStorage.getItem("nimbus_tracking_token") || "");
  const [tokenState, setTokenState] = useState(trackingToken ? "ready" : "loading");

  const issueToken = useCallback(async () => {
    setTokenState("loading");
    try {
      const response = await fetch(`${TRACKING_SERVER_URL}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: user.name, role: "user" }),
      });
      if (!response.ok) throw new Error(`Token request failed (${response.status})`);
      const data = await response.json();
      if (!data.token) throw new Error("Token missing in response");
      localStorage.setItem("nimbus_tracking_token", data.token);
      setTrackingToken(data.token);
      setTokenState("ready");
    } catch {
      setTokenState("manual");
    }
  }, [user.id, user.name]);

  useEffect(() => {
    const cached = localStorage.getItem("nimbus_tracking_token");
    if (cached) {
      setTrackingToken(cached);
      setTokenState("ready");
      return;
    }
    issueToken();
  }, [issueToken]);

  const tracking = useLocationTracking({
    userId: user.id,
    name: user.name,
    token: trackingToken,
    serverUrl: TRACKING_SERVER_URL,
  });

  const { position, startTracking, stopTracking } = tracking;

  const steps    = TURN_BY_TURN_USER;
  const myPos    = position || {lat:CURRENT_USER.lat,lon:CURRENT_USER.lon};
  const team     = RESCUE_TEAMS[0];
  const etaMin   = Math.max(0, 12 - Math.floor(elapsed/60));
  const step     = steps[currentStep];
  const pct      = (currentStep/(steps.length-1))*100;
  const liveDistanceKm = Math.sqrt(
    Math.pow((teamPos.lat - myPos.lat) * 111, 2) +
    Math.pow((teamPos.lon - myPos.lon) * 111, 2)
  ).toFixed(1);

  useEffect(() => {
    if (!activeSOS || tokenState !== "ready") {
      stopTracking();
      return;
    }
    startTracking();
    return () => stopTracking();
  }, [activeSOS, tokenState, startTracking, stopTracking]);

  /* Animate team toward user */
  useEffect(()=>{
    if(!activeSOS) return;
    const t = setInterval(()=>{
      setTeamPos(p=>({
        lat: p.lat + (myPos.lat - p.lat)*0.012,
        lon: p.lon + (myPos.lon - p.lon)*0.012,
      }));
      setElapsed(e=>e+4);
    },1000);
    return()=>clearInterval(t);
  },[activeSOS]);

  useEffect(()=>{
    if(!navMode) return;
    const t = setInterval(()=>setCurrentStep(s=>Math.min(s+1,steps.length-1)),7000);
    return()=>clearInterval(t);
  },[navMode]);

  /* Leaflet SOS nav map */
  const SOSMap = ({ height }) => {
    const ref = useRef(null);
    const mapRef2 = useRef(null);
    const [rdy,setRdy] = useState(!!window.L);
    useEffect(()=>{ injectLeafletStyles(); ensureLeaflet(()=>setRdy(true)); },[]);
    const teamKey = JSON.stringify(teamPos);
    useEffect(()=>{
      if(!rdy||!ref.current) return;
      const L = window.L;
      if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}
      const map = L.map(ref.current,{center:[myPos.lat,myPos.lon],zoom:10,zoomControl:true});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        attribution:"© OpenStreetMap",maxZoom:19}).addTo(map);
      // User marker
      L.marker([myPos.lat,myPos.lon],{icon:makeDotIcon(L,"#ef4444",14,true)}).addTo(map)
        .bindPopup(`<b>📍 My Location</b><br>${user.name}<br>${myPos.lat.toFixed(5)}°N · ${myPos.lon.toFixed(5)}°E`);
      // Team marker
      L.marker([teamPos.lat,teamPos.lon],{icon:makeTeamIcon(L,"Team Alpha")}).addTo(map)
        .bindPopup(`<b>🚑 ${team.name}</b><br>${team.vehicle} · ETA ${etaMin} min`);
      // Route line
      const shadow = L.polyline([[teamPos.lat,teamPos.lon],[myPos.lat,myPos.lon]],{color:"#f59e0b",weight:6,opacity:0.18}).addTo(map);
      L.polyline([[teamPos.lat,teamPos.lon],[myPos.lat,myPos.lon]],{color:"#f59e0b",weight:3,opacity:0.9,dashArray:"14 10"}).addTo(map);
      map.fitBounds([[teamPos.lat,teamPos.lon],[myPos.lat,myPos.lon]],{padding:[40,40],maxZoom:11});
      mapRef2.current = map;
      return()=>{if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}};
    },[rdy,teamKey]);
    return (
      <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
        {!rdy&&<div style={{height,background:"#08101e",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13}}>⏳ Loading map…</div>}
        <div ref={ref} style={{height,display:rdy?"block":"none"}}/>
      </div>
    );
  };

  if (!activeSOS) return (
    <div>
      <PageHeader title="SOS Navigation" sub="Real-time routing when an emergency is active"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        height:380,color:C.muted,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>🗺️</div>
        <div style={{fontSize:16,fontWeight:600,color:C.text,marginBottom:6}}>No Active SOS</div>
        <div style={{fontSize:13,color:C.muted,maxWidth:360,lineHeight:1.6}}>
          This page becomes active when you trigger an SOS. It shows real-time routing of
          your rescue team to your location with live ETA and turn-by-turn instructions.
        </div>
      </div>
    </div>
  );

  if (navMode) return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 60px)",background:C.bg}}>
      <div style={{background:"rgba(239,68,68,0.1)",borderBottom:`1px solid rgba(239,68,68,0.3)`,
        padding:"10px 20px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:C.red,animation:"ud-sos-blink 1.2s infinite",flexShrink:0}}/>
        <span style={{fontSize:14,fontWeight:600,color:C.text}}>LIVE SOS NAVIGATION</span>
        <Pill color="red">🚨 ACTIVE</Pill>
        <div style={{flex:1}}/>
        <Btn onClick={()=>{setNavMode(false);setCurrentStep(0);}}>✕ Exit</Btn>
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 340px",overflow:"hidden"}}>
        <div style={{position:"relative"}}>
          <SOSMap height={500}/>
          <div style={{position:"absolute",bottom:20,left:20,background:"rgba(8,15,26,0.92)",
            border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 18px",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:800,color:C.text}}>45</div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:"0.1em"}}>KM/H</div>
          </div>
        </div>
        <div style={{background:"#0b1422",borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{background:"linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05))",
            borderBottom:`1px solid ${C.border}`,padding:"20px 18px"}}>
            <div style={{fontSize:46,textAlign:"center",marginBottom:10,lineHeight:1}}>{step?.icon}</div>
            <div style={{fontSize:15,fontWeight:700,textAlign:"center",marginBottom:4,color:C.text}}>{step?.instr}</div>
            {step?.road&&<div style={{fontSize:12,color:C.muted,textAlign:"center"}}>{step.road}</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,background:C.border}}>
            {[["ETA",`${etaMin} min`,C.green],["Distance",`${liveDistanceKm} km`,C.accent]].map(([l,v,col])=>(
              <div key={l} style={{background:"#0b1422",padding:"14px 18px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:800,color:col}}>{v}</div>
                <div style={{fontSize:10,color:C.muted,letterSpacing:"0.1em",marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:5}}>
              <span>Step {currentStep+1} of {steps.length}</span>
              <span>{Math.round(pct)}% complete</span>
            </div>
            <div style={{height:4,background:"rgba(255,255,255,0.07)",borderRadius:4}}>
              <div style={{height:"100%",borderRadius:4,background:`linear-gradient(90deg,${C.accent},${C.green})`,
                width:`${pct}%`,transition:"width 0.5s"}}/>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
            {steps.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 18px",
                background:i===currentStep?"rgba(59,130,246,0.1)":"transparent",
                borderLeft:`3px solid ${i===currentStep?C.accent:"transparent"}`,transition:"background 0.3s"}}>
                <div style={{width:26,height:26,borderRadius:"50%",
                  background:i===currentStep?"rgba(59,130,246,0.25)":i<currentStep?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)",
                  border:`1px solid ${i===currentStep?C.accent:i<currentStep?C.green:C.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,
                  color:i<currentStep?C.green:C.text}}>
                  {i<currentStep?"✓":s.icon}
                </div>
                <div><div style={{fontSize:12,color:i===currentStep?C.text:C.muted,fontWeight:i===currentStep?600:400}}>{s.instr}</div>
                  <div style={{fontSize:10,color:C.muted2,marginTop:2}}>{s.dist}</div></div>
              </div>
            ))}
          </div>
          <div style={{background:"rgba(239,68,68,0.08)",borderTop:`1px solid rgba(239,68,68,0.2)`,padding:"12px 18px"}}>
            <div style={{fontSize:10,color:"#fca5a5",letterSpacing:"0.1em",marginBottom:4}}>RESCUE TEAM</div>
            <div style={{fontSize:13,fontWeight:600}}>{team.name} · {team.vehicle}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>Lead: {team.lead} · {team.members||4} members</div>
          </div>
        </div>
      </div>
      <div style={{background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",padding:"10px 20px",
        borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
        <Btn onClick={()=>setCurrentStep(s=>Math.max(0,s-1))}>← Prev</Btn>
        <Btn variant="primary" onClick={()=>setCurrentStep(s=>Math.min(steps.length-1,s+1))}>Next →</Btn>
        <div style={{flex:1}}/>
        <div style={{fontSize:11,color:C.muted}}>{team.name} · {team.vehicle}</div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="SOS Navigation"
        sub="Rescue team en route — live tracking"
        right={<div style={{display:"flex",gap:8}}><Pill color="red">🚨 SOS Active</Pill><Pill color="green">● Live</Pill></div>}/>

      <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.35)",
        borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:12,height:12,borderRadius:"50%",background:C.red,animation:"ud-sos-blink 1.2s infinite",flexShrink:0}}/>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:C.red}}>Emergency broadcast active — Team Alpha dispatched</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>Your blood group, medical profile and GPS shared with rescue team</div>
        </div>
        <Pill color="amber" style={{marginLeft:"auto"}}>ETA {etaMin} min</Pill>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:14}}>
        <div>
          <SOSMap height={380}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
            <StatCard label="ETA" value={`${etaMin} min`} sub="Rescue team" color={C.green} icon="⏱"/>
            <StatCard label="Distance" value={`${liveDistanceKm} km`} sub="Team to you" color={C.accent} icon="📏"/>
            <StatCard label="Team Speed" value="45 km/h" sub="Current" color={C.amber} icon="🚑"/>
            <StatCard label="GPS Acc." value="±6m" sub="Real-time" color={C.purple} icon="🛰"/>
          </div>
          <button onClick={()=>{setNavMode(true);setCurrentStep(0);}}
            style={{marginTop:14,width:"100%",padding:"14px",
              background:`linear-gradient(135deg,${C.red},${C.accent2})`,
              border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            🗺️ VIEW LIVE NAVIGATION
          </button>
        </div>
        <div>
          <Card style={{marginBottom:12,borderColor:"rgba(245,158,11,0.3)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Rescue Team Info</div>
            {[["Team",team.name],["Vehicle",team.vehicle],["Lead",team.lead],["ETA",`${etaMin} min`],
              ["Status","En route to you"],["Contact","+91 100"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500}}>{v}</span>
              </div>
            ))}
          </Card>
          <Card style={{borderColor:"rgba(239,68,68,0.25)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Your Profile Shared</div>
            {[["Name",CURRENT_USER.name],["Blood",CURRENT_USER.blood],
              ["Medical",CURRENT_USER.medical||"None"],["Phone",CURRENT_USER.phone],
              ["EC",CURRENT_USER.ec1Name+" · "+CURRENT_USER.ec1Rel]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500,maxWidth:170,textAlign:"right"}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: GEOFENCING
════════════════════════════════════════════════ */
const PageGeofencing = ({ user }) => {
  const [radius, setRadius]         = useState(2000);   // metres
  const [fence, setFence]           = useState({lat:18.5196,lon:73.8554}); // geofence center
  const [userPos, setUserPos]       = useState({lat:18.5196,lon:73.8554});
  const [alerts, setAlerts]         = useState(true);
  const [vibrate, setVibrate]       = useState(true);
  const [fenceActive, setFenceActive] = useState(true);
  const [editing, setEditing]       = useState(false);
  const [editLat, setEditLat]       = useState("18.5196");
  const [editLon, setEditLon]       = useState("73.8554");
  const [trackingToken, setTrackingToken] = useState(() => localStorage.getItem("nimbus_tracking_token") || "");
  const [tokenState, setTokenState] = useState(trackingToken ? "ready" : "loading");
  const [history, setHistory]       = useState([
    {time:"14:22",event:"Entered geofence zone",inside:true},
    {time:"09:45",event:"Exited geofence zone",inside:false},
    {time:"08:10",event:"Geofence zone entered",inside:true},
  ]);

  /* Issue tracking token if needed */
  useEffect(() => {
    if (trackingToken) return;
    const fetchToken = async () => {
      try {
        const response = await fetch(`${TRACKING_SERVER_URL}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, name: user.name, role: "user" }),
        });
        if (!response.ok) throw new Error(`Token request failed (${response.status})`);
        const data = await response.json();
        if (!data.token) throw new Error("Token missing in response");
        localStorage.setItem("nimbus_tracking_token", data.token);
        setTrackingToken(data.token);
        setTokenState("ready");
      } catch {
        setTokenState("manual");
      }
    };
    fetchToken();
  }, []);

  /* Use live location tracking */
  const tracking = useLocationTracking({
    userId: user.id,
    name: user.name,
    token: trackingToken,
    serverUrl: TRACKING_SERVER_URL,
  });
  const { position, startTracking, stopTracking } = tracking;

  /* Update position from live tracking */
  useEffect(() => {
    if (position) {
      setUserPos({ lat: position.lat, lon: position.lon });
    }
  }, [position]);

  /* Start/stop tracking based on fence active state */
  useEffect(() => {
    if (!fenceActive || tokenState !== "ready") {
      stopTracking();
      return;
    }
    startTracking();
    return () => stopTracking();
  }, [fenceActive, tokenState, startTracking, stopTracking]);

  /* Check inside/outside */
  const dist = (a,b) => {
    const R=6371000;
    const dLat=(b.lat-a.lat)*Math.PI/180;
    const dLon=(b.lon-a.lon)*Math.PI/180;
    const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  };
  const distToCenter = dist(userPos,fence);
  const inside = distToCenter <= radius;

  /* Geofence Leaflet map with circle */
  const GeoMap = ({ height }) => {
    const ref    = useRef(null);
    const mapRef2= useRef(null);
    const [rdy,setRdy] = useState(!!window.L);
    useEffect(()=>{ injectLeafletStyles(); ensureLeaflet(()=>setRdy(true)); },[]);
    const key = JSON.stringify({userPos,fence,radius,fenceActive});
    useEffect(()=>{
      if(!rdy||!ref.current) return;
      const L = window.L;
      if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}
      const map = L.map(ref.current,{center:[fence.lat,fence.lon],zoom:13,zoomControl:true});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        attribution:"© OpenStreetMap",maxZoom:19}).addTo(map);

      /* Geofence circle */
      if(fenceActive){
        L.circle([fence.lat,fence.lon],{
          radius,
          className:"ud-geofence-circle",
          color:"#f59e0b", weight:2.5, opacity:0.85,
          fill:true, fillColor:"#f59e0b", fillOpacity:0.07,
          dashArray:"9 6",
        }).addTo(map)
          .bindPopup(`<b>🔶 Geofence Zone</b><br>Radius: ${(radius/1000).toFixed(1)} km<br>Center: ${fence.lat.toFixed(4)}°N ${fence.lon.toFixed(4)}°E`);

        /* Fence center cross */
        L.marker([fence.lat,fence.lon],{
          icon: L.divIcon({className:"",
            html:`<div style="font-size:18px;line-height:1;text-shadow:0 0 8px rgba(245,158,11,0.8)">⊕</div>`,
            iconSize:[18,18],iconAnchor:[9,9]})
        }).addTo(map).bindPopup("<b>Geofence Center</b>");
      }

      /* User position */
      L.marker([userPos.lat,userPos.lon],{icon:makeDotIcon(L,inside?"#22c55e":"#ef4444",12,true)})
        .addTo(map)
        .bindPopup(`<b>📍 ${CURRENT_USER.name}</b><br>
          ${inside?"✅ Inside geofence":"⚠️ Outside geofence"}<br>
          Distance to center: ${distToCenter.toFixed(0)}m`);

      map.fitBounds([[fence.lat-radius/111000-0.005,fence.lon-radius/111000-0.005],
                     [fence.lat+radius/111000+0.005,fence.lon+radius/111000+0.005]]);
      mapRef2.current = map;
      return()=>{if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}};
    },[rdy,key]);
    return (
      <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
        {!rdy&&<div style={{height,background:"#08101e",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13}}>⏳ Loading map…</div>}
        <div ref={ref} style={{height,display:rdy?"block":"none"}}/>
      </div>
    );
  };

  const radiusOptions = [500,1000,2000,5000,10000];
  const saveEdit = () => {
    const la=parseFloat(editLat), lo=parseFloat(editLon);
    if(!isNaN(la)&&!isNaN(lo)){setFence({lat:la,lon:lo});}
    setEditing(false);
  };

  return (
    <div>
      <PageHeader title="Geofencing"
        sub="Define a safety zone — admin can track if you exit the boundary"
        right={<div style={{display:"flex",gap:8}}>
          <Pill color={inside?"green":"red"}>{inside?"● Inside Zone":"⚠️ Outside Zone"}</Pill>
          <Pill color={fenceActive?"amber":"gray"}>{fenceActive?"Fence Active":"Fence Off"}</Pill>
        </div>}/>

      {/* Status banner */}
      <div style={{background:inside?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.1)",
        border:`1px solid ${inside?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.4)"}`,
        borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
        <div style={{fontSize:26}}>{inside?"✅":"⚠️"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:inside?C.green:C.red}}>
            {inside?"You are inside your safety zone":"You have exited your safety zone!"}
          </div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>
            Distance from center: <strong style={{color:C.text}}>{distToCenter.toFixed(0)}m</strong>
            {" · "}Geofence radius: <strong style={{color:C.text}}>{(radius/1000).toFixed(1)} km</strong>
            {" · "}Remaining: <strong style={{color:inside?C.green:C.red}}>{Math.max(0,radius-distToCenter).toFixed(0)}m</strong>
          </div>
        </div>
        {!inside&&alerts&&<div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:8,padding:"6px 12px",fontSize:11,color:"#fca5a5",fontWeight:500}}>
          📢 Admin Alerted
        </div>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14}}>
        {/* Map */}
        <GeoMap height={460}/>

        {/* Controls */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Geofence on/off */}
          <Card>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>Geofence Active</div>
              <Toggle on={fenceActive} onChange={()=>setFenceActive(x=>!x)}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:12,color:C.muted}}>Alert on exit</div>
              <Toggle on={alerts} onChange={()=>setAlerts(x=>!x)}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,color:C.muted}}>Vibrate on breach</div>
              <Toggle on={vibrate} onChange={()=>setVibrate(x=>!x)}/>
            </div>
          </Card>

          {/* Radius selector */}
          <Card>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Geofence Radius</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {radiusOptions.map(r=>(
                <button key={r} onClick={()=>setRadius(r)}
                  style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${radius===r?C.amber:C.border}`,
                    background:radius===r?"rgba(245,158,11,0.12)":"transparent",
                    color:radius===r?C.amber:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                  {r<1000?r+"m":(r/1000).toFixed(r===500?0:0)+" km"}
                </button>
              ))}
            </div>
            <div style={{marginTop:12}}>
              <div style={{height:6,background:"rgba(255,255,255,0.06)",borderRadius:4}}>
                <div style={{height:"100%",borderRadius:4,background:`linear-gradient(90deg,${C.teal},${C.amber})`,
                  width:`${(radius/10000)*100}%`,transition:"width 0.4s"}}/>
              </div>
              <div style={{fontSize:10,color:C.muted2,marginTop:4,textAlign:"right"}}>
                {(radius/1000).toFixed(1)} km selected
              </div>
            </div>
          </Card>

          {/* Center coordinates */}
          <Card>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>Zone Center</div>
              <Btn onClick={()=>{setEditing(!editing);setEditLat(fence.lat.toFixed(4));setEditLon(fence.lon.toFixed(4));}} style={{fontSize:10,padding:"3px 9px"}}>
                {editing?"Cancel":"Edit"}
              </Btn>
            </div>
            {editing?(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div><div style={{fontSize:10,color:C.muted2,marginBottom:3}}>Latitude</div>
                  <Input value={editLat} onChange={e=>setEditLat(e.target.value)} placeholder="18.5196"/></div>
                <div><div style={{fontSize:10,color:C.muted2,marginBottom:3}}>Longitude</div>
                  <Input value={editLon} onChange={e=>setEditLon(e.target.value)} placeholder="73.8554"/></div>
                <Btn variant="primary" onClick={saveEdit} style={{width:"100%",justifyContent:"center"}}>Save Center</Btn>
              </div>
            ):(
              <div>
                {[["Latitude",`${fence.lat.toFixed(4)}°N`],["Longitude",`${fence.lon.toFixed(4)}°E`],
                  ["Zone name","Mulshi Base Area"],["Last updated","Today 14:22"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,
                    padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.muted2}}>{k}</span>
                    <span style={{color:C.text,fontFamily:k.includes("tit")||k.includes("upd")?"inherit":"monospace",fontWeight:500}}>{v}</span>
                  </div>
                ))}
                <Btn onClick={()=>setFence({lat:userPos.lat,lon:userPos.lon})}
                  style={{marginTop:10,width:"100%",justifyContent:"center",fontSize:11}}>
                  📍 Set Center to My Location
                </Btn>
              </div>
            )}
          </Card>

          {/* Admin visibility info */}
          <Card style={{background:"rgba(59,130,246,0.04)",borderColor:"rgba(59,130,246,0.2)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Admin Visibility</div>
            {[
              ["Real-time GPS","Shared"],
              ["Geofence status",inside?"Inside":"Outside"],
              ["Zone radius",`${(radius/1000).toFixed(1)} km`],
              ["Last update","Live"],
              ["Alert on breach",alerts?"Enabled":"Disabled"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Event log */}
      <div style={{marginTop:16}}>
        <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}}>Geofence Event Log</div>
        <Card style={{padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["Time","Event","Status","Location"].map(h=>(
                  <th key={h} style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",
                    padding:"10px 14px",textAlign:"left",borderBottom:`1px solid ${C.border}`,fontWeight:500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h,i)=>(
                <tr key={i}>
                  <td style={{fontSize:12,padding:"10px 14px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace"}}>{h.time}</td>
                  <td style={{fontSize:13,padding:"10px 14px",color:C.text,borderBottom:`1px solid ${C.border}`}}>{h.event}</td>
                  <td style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
                    <Pill color={h.inside?"green":"red"}>{h.inside?"Inside":"Outside"}</Pill>
                  </td>
                  <td style={{fontSize:11,padding:"10px 14px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace"}}>
                    {fence.lat.toFixed(4)}°N {fence.lon.toFixed(4)}°E
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   SIDEBAR NAVIGATION
════════════════════════════════════════════════ */
const NAV = [
  {section:"Home",items:[
    {id:"dashboard",label:"My Dashboard",icon:"⊞"},
  ]},
  {section:"Safety",items:[
    {id:"sos-nav",label:"SOS Navigation",icon:"🚨",highlight:true},
    {id:"geofencing",label:"Geofencing",icon:"🔶"},
  ]},
  {section:"Tracking",items:[
    {id:"live-tracking",label:"Live Tracking",icon:"📡"},
  ]},
  {section:"Exploration",items:[
    {id:"forts",label:"Forts Explorer",icon:"🏰"},
  ]},
  {section:"Weather",items:[
    {id:"weather",label:"Weather & Maps",icon:"🌤️"},
  ]},
];

/* ════════════════════════════════════════════════
   ROOT COMPONENT
════════════════════════════════════════════════ */
export default function UserDashboard() {
  const [screen, setScreen]   = useState(() => {
    return localStorage.getItem(USER_SESSION_KEY) ? "app" : "login";
  }); // login | register | app
  const [page, setPage]       = useState("dashboard");
  const [activeSOS, setActiveSOS] = useState(false);
  const [selectedFort, setSelectedFort] = useState(null);
  const [user, setUser]       = useState(() => {
    const savedProfile = localStorage.getItem(USER_PROFILE_KEY);
    if (!savedProfile) return CURRENT_USER;
    try {
      return { ...CURRENT_USER, ...JSON.parse(savedProfile) };
    } catch {
      return CURRENT_USER;
    }
  });

  const handleLogin = (profile) => {
    const nextUser = profile ? { ...CURRENT_USER, ...profile } : CURRENT_USER;
    setUser(nextUser);
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(nextUser));
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ userId: nextUser.id, email: nextUser.email }));
    setScreen("app");
  };

  const handleRegisterDone = (profile) => {
    handleLogin(profile);
    setPage("dashboard");
  };

  const handleBackToLogin = () => {
    setScreen("login");
    setPage("dashboard");
  };

  if (screen==="login")    return <PageLogin onLogin={handleLogin} onRegister={()=>setScreen("register")}/>;
  if (screen==="register") return <PageRegister onBack={handleBackToLogin} onDone={handleRegisterDone}/>;

  const navigate = (p) => setPage(p);

  const handleSelectFort = (fort) => {
    setSelectedFort(fort);
  };

  const handleBackFromFortDetail = () => {
    setPage("forts");
  };

  const PAGES = {
    "dashboard": <PageDashboard user={user} onNavigate={navigate} activeSOS={activeSOS} onSOS={v=>{ setActiveSOS(v); if(v) setPage("sos-nav"); }}/>,
    "sos-nav":   <PageSOSNav user={user} activeSOS={activeSOS}/>,
    "geofencing":<PageGeofencing user={user}/>,
    "live-tracking": <PageLiveTracking user={user} activeSOS={activeSOS} onSOS={v=>{ setActiveSOS(v); if(v) setPage("sos-nav"); }}/>,
    "forts":     <PageForts onNavigate={navigate} onSelectFort={handleSelectFort}/>,
    "fort-detail": selectedFort ? <PageFortDetail selectedFort={selectedFort} onNavigate={navigate} onBack={handleBackFromFortDetail}/> : null,
    "weather":   <PageWeatherMaps/>,
  };

  const signOut = () => {
    localStorage.removeItem(USER_SESSION_KEY);
    setActiveSOS(false);
    setPage("dashboard");
    setScreen("login");
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr",minHeight:"780px",
      background:C.bg,fontFamily:"system-ui,-apple-system,sans-serif",color:C.text}}>

      {/* Sidebar */}
      <aside style={{background:C.sidebar,display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`}}>
        {/* Brand */}
        <div style={{padding:"18px 16px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(59,130,246,0.12)",
            border:"1px solid rgba(59,130,246,0.28)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏔️</div>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:C.text}}>Nimbus <span style={{color:C.accent}}>Explorer</span></div>
            <div style={{fontSize:10,color:C.muted2}}>User Portal v3.0</div>
          </div>
        </div>

        {/* User info */}
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <Avatar initials={user.avatar} bg={user.color[0]} text={user.color[1]} size={34}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:500,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
            <div style={{fontSize:10,color:C.muted2}}>{user.role}</div>
          </div>
          {activeSOS&&(
            <div style={{width:22,height:22,background:"rgba(239,68,68,0.18)",border:"1px solid rgba(239,68,68,0.4)",
              borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.red,fontWeight:700}}>!</div>
          )}
        </div>

        {/* Nav */}
        <nav style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
          {NAV.map(({section,items})=>(
            <div key={section}>
              <div style={{fontSize:9,color:C.muted2,padding:"10px 16px 4px",letterSpacing:"0.12em",textTransform:"uppercase"}}>{section}</div>
              {items.map(item=>{
                const active = page===item.id;
                const isSOS  = item.id==="sos-nav";
                return (
                  <div key={item.id} onClick={()=>setPage(item.id)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",cursor:"pointer",
                      borderLeft:`2px solid ${active?(isSOS?C.red:C.accent):"transparent"}`,
                      background:active?(isSOS?"rgba(239,68,68,0.1)":"rgba(59,130,246,0.1)"):"transparent",
                      transition:"background 0.15s"}}>
                    <span style={{fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{item.icon}</span>
                    <span style={{fontSize:12,color:active?C.text:isSOS?"rgba(252,165,165,0.8)":C.muted,fontWeight:active?500:400}}>
                      {item.label}
                    </span>
                    {isSOS&&activeSOS&&(
                      <div style={{marginLeft:"auto",background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.35)",
                        borderRadius:10,padding:"1px 7px",fontSize:9,color:C.red,fontWeight:700}}>LIVE</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Quick SOS in sidebar */}
        <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>{ setActiveSOS(true); setPage("sos-nav"); }}
            style={{width:"100%",padding:"9px",background:"rgba(239,68,68,0.12)",
              border:"1px solid rgba(239,68,68,0.35)",borderRadius:10,color:C.red,
              fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              animation:activeSOS?"ud-sos-blink 1.2s infinite":undefined}}>
            🆘 {activeSOS?"SOS ACTIVE":"Quick SOS"}
          </button>
          <div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:C.muted2}}>© 2026 Nimbus Travel</span>
            <button onClick={signOut} style={{fontSize:11,color:C.muted,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Sign out</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{overflow:"auto",padding:24}}>
        {PAGES[page]||<div style={{color:C.muted}}>Page not found.</div>}
      </main>
    </div>
  );
}