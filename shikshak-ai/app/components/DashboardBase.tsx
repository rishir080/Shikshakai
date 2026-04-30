
'use client';
import { motion } from "framer-motion";
import React from "react";

interface GlassPanelProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}

export const GlassPanel = React.memo(({ children, title, className, delay = 0, style }: GlassPanelProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`panel ${className || ""}`}
      style={style}
    >
      {title && <div className="panel-title">{title}</div>}
      {children}
    </motion.div>
  );
});

interface StatCardProps {
  label: string;
  value: string | number;
  sub: string;
  accent?: string;
  delay?: number;
}

export const StatCard = React.memo(({ label, value, sub, accent, delay = 0 }: StatCardProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="stat-card"
    >
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${accent || ""}`}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </motion.div>
  );
});
