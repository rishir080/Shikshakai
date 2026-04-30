
'use client';
import { motion } from "framer-motion";
import React from "react";

interface NavItem {
  id: string;
  icon: string;
  label: string;
  badge?: string;
}

interface SidebarProps {
  page: string;
  setPage: (p: any) => void;
  studentsCount: number;
  classAvg: number;
  logout: () => void;
  navMain: NavItem[];
  navTools: NavItem[];
}

export const Sidebar = React.memo(({ 
  page, 
  setPage, 
  studentsCount, 
  classAvg, 
  logout, 
  navMain, 
  navTools 
}: SidebarProps) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="sidebar-logo-row">
          <div className="sidebar-logo-icon">✨</div>
          <div>
            <div className="sidebar-logo-text">ShikshakAI</div>
            <div className="sidebar-logo-sub">Master Suite</div>
          </div>
        </motion.div>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-label">Education Hub</div>
        {navMain.map((n, i) => (
          <button 
            key={n.id} 
            onClick={() => setPage(n.id)} 
            className={`nav-item ${page === n.id ? "active" : ""}`}
          >
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <div className="nav-section-label">AI Intelligence</div>
        {navTools.map((n, i) => (
          <button 
            key={n.id} 
            onClick={() => setPage(n.id)} 
            className={`nav-item ${page === n.id ? "active" : ""}`}
          >
            <span className="nav-icon">{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge && <span className="nav-badge">{n.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-user-card">
          <div className="sidebar-user-label">Live Class Status</div>
          <div className="sidebar-user-info">{studentsCount} Students Active</div>
          <div className="sidebar-user-sub">{classAvg}% Performance Meta</div>
        </div>
        <button onClick={logout} className="logout-btn">
          <span className="nav-icon">🚪</span>
          <span>Sign Out Suite</span>
        </button>
      </div>
    </aside>
  );
});
