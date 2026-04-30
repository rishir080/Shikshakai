
'use client';
import { motion, AnimatePresence } from "framer-motion";
import React, { useState, useEffect } from "react";
import { generateAILesson } from "@/lib/ai";

interface AICoTeacherProps {
  activePage: string;
  contextData: any;
}

export const AICoTeacher = React.memo(({ activePage, contextData }: AICoTeacherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [insight, setInsight] = useState("Analyzing your classroom context...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchInsight = async () => {
      setLoading(true);
      const prompt = `You are a Classroom Co-Teacher. The user is currently on the "${activePage}" page. 
      Context: ${JSON.stringify(contextData).slice(0, 500)}
      Provide 1-2 sentences of professional, high-impact advice or a summary of what they should focus on here. Keep it brief and premium.`;
      try {
        const res = await generateAILesson(prompt);
        setInsight(res);
      } catch {
        setInsight("Ready to assist with your classroom management.");
      }
      setLoading(false);
    };

    if (isOpen) fetchInsight();
  }, [activePage, isOpen]);

  return (
    <div className={`ai-sidecar ${isOpen ? "open" : ""}`} style={{
      position: "fixed", right: 20, bottom: 20, zIndex: 1000,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12
    }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="glass"
            style={{
              width: 300, padding: 20, borderRadius: 20,
              background: "rgba(12,12,34,0.9)", border: "1px solid var(--accent)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 0 20px rgba(124,111,255,0.2)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
               <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent3)", boxShadow: "0 0 10px var(--accent3)" }} />
               <div className="label-caps" style={{ color: "var(--accent3)" }}>AI Co-Teacher Live</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text2)", fontStyle: "italic" }}>
               {loading ? "Generating tactical insights..." : insight}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), #4a3fb5)",
          border: "1px solid rgba(255,255,255,0.2)",
          boxShadow: "0 8px 32px rgba(124,111,255,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, cursor: "pointer", color: "#fff"
        }}
      >
        {isOpen ? "✕" : "🤖"}
      </motion.button>
    </div>
  );
});
