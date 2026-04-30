
'use client';
import { motion } from "framer-motion";
import React from "react";

interface LessonSectionProps {
  icon: string;
  title: string;
  body: string;
}

export const LessonSection = React.memo(({ icon, title, body }: LessonSectionProps) => {
  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="panel">
      <div className="panel-title"><span>{icon}</span> {title}</div>
      <div className="ai-output">{body}</div>
    </motion.div>
  );
});
