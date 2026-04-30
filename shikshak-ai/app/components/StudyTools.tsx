
'use client';
import { motion, AnimatePresence } from "framer-motion";
import React, { useState } from "react";

interface StudyCardProps {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export const StudyCard = React.memo(({ icon, title, subtitle, children }: StudyCardProps) => {
  return (
    <div className="panel">
      <div className="panel-title"><span>{icon}</span> {title}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -16, marginBottom: 20 }}>{subtitle}</div>
      {children}
    </div>
  );
});

interface FlipCardProps {
  card: { q: string; a: string };
}

export const FlipCard = React.memo(({ card }: FlipCardProps) => {
  const [flipped, setFlipped] = useState(false);
  return (
    <div 
      className="flip-container" 
      onClick={() => setFlipped(!flipped)}
      style={{ perspective: 1000, height: 200, cursor: "pointer" }}
    >
      <motion.div 
        style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
      >
        {/* Front */}
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{card.q}</div>
        </div>
        {/* Back */}
        <motion.div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "rgba(124,111,255,0.1)", border: "1px solid var(--accent)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text)" }}>{card.a}</div>
        </motion.div>
      </motion.div>
    </div>
  );
});
