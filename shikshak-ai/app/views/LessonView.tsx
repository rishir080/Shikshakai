
'use client';
import { motion } from "framer-motion";
import React from "react";
import { GlassPanel } from "../components/DashboardBase";
import { LessonSection } from "../components/LessonSection";
import { GRADE_GROUPS } from "@/lib/constants";

interface LessonViewProps {
  lessonTopic: string; setLessonTopic: (v: string) => void;
  lessonGrade: string; setLessonGrade: (v: string) => void;
  lessonDuration: string; setLessonDuration: (v: string) => void;
  lessonContext: string; setLessonContext: (v: string) => void;
  lessonSections: any[];
  lessonOutput: string;
  generateLesson: () => void;
  downloadLessonPDF: () => void;
  loading: boolean;
}

export const LessonView = React.memo(({
  lessonTopic, setLessonTopic, lessonGrade, setLessonGrade, lessonDuration, setLessonDuration, lessonContext, setLessonContext,
  lessonSections, lessonOutput, generateLesson, downloadLessonPDF, loading
}: LessonViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Lesson Planner</h1>
        <p className="page-sub">Classroom-ready plans generated in seconds</p>
      </div>

      <GlassPanel title={<span>✧</span> + " Configure Your Lesson"}>
        <div className="field-group">
          <label className="field-label">Topic *</label>
          <input className="field-input" placeholder="e.g. Photosynthesis, French Revolution..." value={lessonTopic} onChange={e => setLessonTopic(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
           <div className="field-group" style={{marginBottom:0}}>
              <label className="field-label">Grade</label>
              <select className="field-input" value={lessonGrade} onChange={e => setLessonGrade(e.target.value)}>
                {[...GRADE_GROUPS[0].opts, ...GRADE_GROUPS[1].opts].map(g => <option key={g}>{g}</option>)}
              </select>
           </div>
           <div className="field-group" style={{marginBottom:0}}>
              <label className="field-label">Duration</label>
              <select className="field-input" value={lessonDuration} onChange={e => setLessonDuration(e.target.value)}>
                {["30 mins", "45 mins", "60 mins", "90 mins"].map(d => <option key={d}>{d}</option>)}
              </select>
           </div>
        </div>
        <div className="field-group">
           <label className="field-label">Additional Context</label>
           <input className="field-input" placeholder="e.g. Include experiments, focus on vocabulary" value={lessonContext} onChange={e => setLessonContext(e.target.value)} />
        </div>
        <button onClick={generateLesson} className="btn-primary" disabled={loading}>
          {loading ? "AI is crafting lesson..." : "Generate Master Plan"}
        </button>
      </GlassPanel>

      {lessonSections.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
             <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)" }}>Drafted Content</h3>
             <button onClick={downloadLessonPDF} className="btn-success btn-sm">Download PDF</button>
          </div>
          {lessonSections.map((sec, i) => (
             <LessonSection key={i} icon={sec.icon} title={sec.title} body={sec.body} />
          ))}
        </motion.div>
      )}

      {lessonOutput && !lessonSections.length && <div className="panel"><div className="ai-output">{lessonOutput}</div></div>}
    </>
  );
});
