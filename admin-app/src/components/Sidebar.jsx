// ═══════════════════════════════════════════════════════════════════════
// src/components/Sidebar.jsx
// ═══════════════════════════════════════════════════════════════════════

import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../App';

export function Sidebar() {
  const links = [
    { to: '/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/navigation', icon: '🗺', label: 'Navigation' },
  ];

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-800">
        <div className="text-orange-500 font-mono font-bold text-lg">⛰ MOUNTAIN SOS</div>
        <div className="text-slate-500 text-xs font-mono mt-1">Admin Control System</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {links.map(({ to, icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg font-mono text-sm transition-colors
              ${isActive ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`
            }>
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Signout */}
      <div className="px-4 py-4 border-t border-slate-800">
        <button onClick={() => signOut(auth)}
          className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg font-mono text-sm text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors">
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;